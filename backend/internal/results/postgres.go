package results

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrInvalidMatch = errors.New("invalid match")
var ErrPayloadConflict = errors.New("match payload conflict")
var ErrMissingUser = errors.New("missing rating user")

type Match struct {
	ID         string
	RoomID     string
	FinishedAt time.Time
	Entries    []Entry
}
type Store interface {
	Save(context.Context, Match) (map[string]Rating, error)
	Rating(context.Context, string, string) (*Rating, error)
}
type Postgres struct{ Pool *pgxpool.Pool }

func validate(m Match) error {
	if _, err := uuid.Parse(m.ID); err != nil {
		return err
	}
	if _, err := uuid.Parse(m.RoomID); err != nil {
		return err
	}
	if len(m.Entries) != 100 || m.FinishedAt.IsZero() {
		return errors.New("incomplete match")
	}
	ids, users := map[string]bool{}, map[string]bool{}
	for _, e := range m.Entries {
		if e.ParticipantID == "" || ids[e.ParticipantID] || (e.Bot && e.Guest) {
			return errors.New("invalid participant")
		}
		ids[e.ParticipantID] = true
		if !e.Bot && !e.Guest {
			if e.UID == "" || users[e.UID] {
				return errors.New("invalid user")
			}
			users[e.UID] = true
		} else if e.UID != "" {
			return errors.New("unexpected user")
		}
		if e.Outcome != "success" && e.Outcome != "flying" && e.Outcome != "no-record" {
			return errors.New("invalid outcome")
		}
		if e.Outcome == "success" {
			if e.ReactionMs == nil || *e.ReactionMs < 0 || *e.ReactionMs >= 3000 {
				return errors.New("invalid time")
			}
		} else if e.ReactionMs != nil || e.Rank != nil {
			return errors.New("invalid failure")
		}
		if e.Rank != nil && (*e.Rank < 1 || *e.Rank > 100 || (e.Measurement != "corrected" && e.Measurement != "bot")) {
			return errors.New("invalid rank")
		}
	}
	return nil
}

func (s Postgres) Save(ctx context.Context, m Match) (map[string]Rating, error) {
	if err := validate(m); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidMatch, err)
	}
	// Canonical order and explicit UID binding detect accidental match-ID reuse.
	entries := append([]Entry(nil), m.Entries...)
	sort.Slice(entries, func(i, j int) bool { return entries[i].ParticipantID < entries[j].ParticipantID })
	m.Entries = entries
	bindings := make([]string, len(entries))
	for i, e := range entries {
		bindings[i] = e.UID
	}
	payload, err := json.Marshal(struct {
		Match Match
		Users []string
	}{m, bindings})
	if err != nil {
		return nil, err
	}
	hash := sha256.Sum256(payload)
	digest := hex.EncodeToString(hash[:])
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	// The unique insert waits for a concurrent writer, including ambiguous commit retries.
	tag, err := tx.Exec(ctx, `INSERT INTO matches(id, room_id, finished_at, formula_version, payload_hash) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, m.ID, m.RoomID, m.FinishedAt, FormulaVersion, digest)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		var existing string
		if err = tx.QueryRow(ctx, `SELECT payload_hash FROM matches WHERE id=$1`, m.ID).Scan(&existing); err != nil {
			return nil, err
		}
		if existing != digest {
			return nil, ErrPayloadConflict
		}
		return readRatings(ctx, tx, m.ID)
	}
	// Stable lock order prevents deadlocks between overlapping matches. Rates are
	// sampled together under these locks, never from a stale browser/room snapshot.
	uids := []string{}
	for _, e := range entries {
		if e.UID != "" {
			uids = append(uids, e.UID)
		}
	}
	sort.Strings(uids)
	byUser := map[string]int{}
	for _, uid := range uids {
		var value int
		if err = tx.QueryRow(ctx, `SELECT rating FROM users WHERE firebase_uid=$1 FOR UPDATE`, uid).Scan(&value); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, ErrMissingUser
			}
			return nil, fmt.Errorf("lock rating: %w", err)
		}
		byUser[uid] = value
	}
	ratings := make([]int, len(entries))
	for i, e := range entries {
		ratings[i] = InitialRating
		if e.UID != "" {
			ratings[i] = byUser[e.UID]
		}
	}
	deltas := Deltas(entries, ratings)
	result := map[string]Rating{}
	for i, e := range entries {
		var uid *string
		var before, after *int
		if e.UID != "" {
			uid = &e.UID
			b, a := ratings[i], max(0, ratings[i]+deltas[i])
			before, after = &b, &a
			result[e.ParticipantID] = Rating{b, a}
			if _, err = tx.Exec(ctx, `UPDATE users SET rating=$2, updated_at=now() WHERE firebase_uid=$1`, e.UID, a); err != nil {
				return nil, err
			}
		}
		_, err = tx.Exec(ctx, `INSERT INTO match_results(match_id,participant_id,user_uid,display_name,bot,guest,outcome,rank,reaction_ms,measurement,rating_before,rating_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, m.ID, e.ParticipantID, uid, e.Name, e.Bot, e.Guest, e.Outcome, e.Rank, e.ReactionMs, e.Measurement, before, after)
		if err != nil {
			return nil, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return result, nil
}
func readRatings(ctx context.Context, tx pgx.Tx, id string) (map[string]Rating, error) {
	rows, err := tx.Query(ctx, `SELECT participant_id,rating_before,rating_after FROM match_results WHERE match_id=$1 AND user_uid IS NOT NULL`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string]Rating{}
	for rows.Next() {
		var id string
		var r Rating
		if err = rows.Scan(&id, &r.Before, &r.After); err != nil {
			return nil, err
		}
		result[id] = r
	}
	return result, rows.Err()
}
func (s Postgres) Rating(ctx context.Context, id, uid string) (*Rating, error) {
	var r Rating
	err := s.Pool.QueryRow(ctx, `SELECT rating_before,rating_after FROM match_results WHERE match_id=$1 AND user_uid=$2`, id, uid).Scan(&r.Before, &r.After)
	return &r, err
}
