package results

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/dbdiagnostic"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/identity"
)

type SavedEntry struct {
	Entry
	RatingBefore *int `json:"ratingBefore"`
	RatingAfter  *int `json:"ratingAfter"`
}
type HistoryEntry struct {
	SavedEntry
	MatchID    string    `json:"matchId"`
	FinishedAt time.Time `json:"finishedAt"`
}
type History struct {
	Entries []HistoryEntry `json:"entries"`
	HasMore bool           `json:"hasMore"`
}
type Detail struct {
	MatchID    string       `json:"matchId"`
	FinishedAt time.Time    `json:"finishedAt"`
	Entries    []SavedEntry `json:"entries"`
}
type Leader struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Rating int    `json:"rating"`
	Rank   int    `json:"rank"`
	Self   bool   `json:"self"`
}
type Reader interface {
	History(context.Context, string, int) (History, error)
	Detail(context.Context, string, string) (Detail, error)
	Ranking(context.Context, string) ([]Leader, error)
}

func (s Postgres) History(ctx context.Context, uid string, offset int) (History, error) {
	result := History{Entries: []HistoryEntry{}}
	rows, err := s.Pool.Query(ctx, `SELECT m.id,m.finished_at,r.participant_id,r.display_name,r.bot,r.guest,r.outcome,r.rank,r.reaction_ms,r.measurement,r.rating_before,r.rating_after FROM match_results r JOIN matches m ON m.id=r.match_id WHERE r.user_uid=$1 ORDER BY m.finished_at DESC,m.id DESC LIMIT 21 OFFSET $2`, uid, offset)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var e HistoryEntry
		if err = rows.Scan(&e.MatchID, &e.FinishedAt, &e.ParticipantID, &e.Name, &e.Bot, &e.Guest, &e.Outcome, &e.Rank, &e.ReactionMs, &e.Measurement, &e.RatingBefore, &e.RatingAfter); err != nil {
			return result, err
		}
		result.Entries = append(result.Entries, e)
	}
	if len(result.Entries) > 20 {
		result.HasMore = true
		result.Entries = result.Entries[:20]
	}
	return result, rows.Err()
}
func (s Postgres) Detail(ctx context.Context, id, uid string) (Detail, error) {
	result := Detail{MatchID: id, Entries: []SavedEntry{}}
	// Membership is checked in PostgreSQL, even after the in-memory room expires.
	err := s.Pool.QueryRow(ctx, `SELECT m.finished_at FROM matches m JOIN match_results r ON r.match_id=m.id WHERE m.id=$1 AND r.user_uid=$2`, id, uid).Scan(&result.FinishedAt)
	if err != nil {
		return result, err
	}
	rows, err := s.Pool.Query(ctx, `SELECT participant_id,display_name,bot,guest,outcome,rank,reaction_ms,measurement,rating_before,rating_after FROM match_results WHERE match_id=$1 ORDER BY rank NULLS LAST,participant_id`, id)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var e SavedEntry
		if err = rows.Scan(&e.ParticipantID, &e.Name, &e.Bot, &e.Guest, &e.Outcome, &e.Rank, &e.ReactionMs, &e.Measurement, &e.RatingBefore, &e.RatingAfter); err != nil {
			return result, err
		}
		result.Entries = append(result.Entries, e)
	}
	return result, rows.Err()
}
func (s Postgres) Ranking(ctx context.Context, uid string) ([]Leader, error) {
	// Public IDs are response positions: Firebase UIDs never leave this query.
	rows, err := s.Pool.Query(ctx, `SELECT display_name,rating,rank() OVER (ORDER BY rating DESC),firebase_uid=$1 FROM users WHERE EXISTS (SELECT 1 FROM match_results WHERE user_uid=users.firebase_uid) ORDER BY rating DESC,firebase_uid LIMIT 50`, uid)
	result := []Leader{}
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var e Leader
		if err = rows.Scan(&e.Name, &e.Rating, &e.Rank, &e.Self); err != nil {
			return result, err
		}
		e.ID = strconv.Itoa(len(result) + 1)
		result = append(result, e)
	}
	return result, rows.Err()
}
func ReadHandler(store Reader, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	serve := func(kind string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			p, ok := identity.FromContext(r.Context())
			if !ok {
				http.Error(w, "unauthorized", 401)
				return
			}
			if kind != "ranking" && p.Guest {
				http.Error(w, "registered account required", 403)
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()
			var data any
			var err error
			switch kind {
			case "history":
				offset := 0
				if raw := r.URL.Query().Get("offset"); raw != "" {
					offset, err = strconv.Atoi(raw)
					if err != nil || offset < 0 || offset > 1000000 {
						http.Error(w, "invalid offset", 400)
						return
					}
				}
				data, err = store.History(ctx, p.UID, offset)
			case "detail":
				id := r.PathValue("id")
				if _, err = uuid.Parse(id); err != nil {
					http.Error(w, "invalid match ID", 400)
					return
				}
				data, err = store.Detail(ctx, id, p.UID)
			case "ranking":
				data, err = store.Ranking(ctx, p.UID)
			}
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "not found", 404)
				return
			}
			if err != nil {
				logger.Error("saved results read failed", "resource", kind, "error", dbdiagnostic.Safe(err))
				http.Error(w, "results unavailable", 503)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			if err = json.NewEncoder(w).Encode(data); err != nil {
				logger.Warn("results response failed", "resource", kind, "error", err)
			}
		}
	}
	mux.HandleFunc("GET /api/me/history", serve("history"))
	mux.HandleFunc("GET /api/matches/{id}", serve("detail"))
	mux.HandleFunc("GET /api/ranking", serve("ranking"))
	return mux
}
