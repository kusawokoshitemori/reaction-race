package lobby

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/dbdiagnostic"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/identity"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/results"
)

// Called with the manager lock. The immutable job survives explicit departures;
// database I/O never blocks the match/input lock or another room's timers.
func (m *Manager) persist(r *room) {
	if m.store == nil {
		return
	}
	r.match.persistence = "pending"
	job := results.Match{ID: r.match.id, RoomID: r.id, FinishedAt: time.Now()}
	for i, p := range r.roster {
		in := r.match.results[i]
		uid := r.match.users[p.ID]
		if p.Guest {
			uid = ""
		}
		job.Entries = append(job.Entries, results.Entry{ParticipantID: p.ID, UID: uid, Name: p.Name, Bot: p.Bot, Guest: p.Guest, Outcome: in.Outcome, Rank: in.Rank, ReactionMs: in.ReactionMs, Measurement: in.Measurement})
	}
	m.saves.Add(1)
	go func() {
		defer m.saves.Done()
		for attempt := 1; ; attempt++ {
			ctx, cancel := context.WithTimeout(m.ctx, 5*time.Second)
			ratings, err := m.store.Save(ctx, job)
			cancel()
			m.mu.Lock()
			active := m.rooms[r.id] == r && !m.closed
			if err == nil {
				if active {
					r.match.persistence = "saved"
					for i := range r.match.results {
						input := &r.match.results[i]
						if rating, ok := ratings[input.ParticipantID]; ok {
							input.Rating = &rating
						}
						r.match.inputs[input.ParticipantID] = *input
					}
					m.publish(r)
					m.later(r, m.retention, func() { m.remove(r) })
				}
				m.mu.Unlock()
				m.logger.Info("match saved", "match_id", job.ID, "attempt", attempt, "formula", results.FormulaVersion)
				return
			}
			if active {
				r.match.persistence = "retrying"
				m.publish(r)
			}
			m.mu.Unlock()
			// Do not log raw driver errors: they may contain connection credentials or row values.
			m.logger.LogAttrs(context.Background(), slog.LevelError, "match save failed", slog.String("match_id", job.ID), slog.Int("attempt", attempt), slog.Any("error", dbdiagnostic.Safe(err)))
			timer := time.NewTimer(m.saveRetry)
			select {
			case <-m.ctx.Done():
				timer.Stop()
				m.logger.Error("unsaved match abandoned on shutdown", "match_id", job.ID)
				return
			case <-timer.C:
			}
		}
	}()
}

type ratingStatus struct {
	Persistence string          `json:"persistence"`
	Rating      *results.Rating `json:"rating"`
}

// RatingHandler exposes only the authenticated participant's persisted change.
// Live status is also available to guests; guest identities are never stored in DB.
func (m *Manager) RatingHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, ok := identity.FromContext(r.Context())
		if !ok {
			http.Error(w, "unauthorized", 401)
			return
		}
		id := r.PathValue("id")
		if _, err := uuid.Parse(id); err != nil {
			http.NotFound(w, r)
			return
		}
		var status *ratingStatus
		m.mu.Lock()
		for _, room := range m.rooms {
			if room.match == nil || room.match.id != id {
				continue
			}
			pid := ""
			// Registered users remain authorized after an explicit departure.
			for participant, uid := range room.match.users {
				if uid == principal.UID {
					for _, p := range room.roster {
						if p.ID == participant && p.Guest == principal.Guest {
							pid = participant
						}
					}
				}
			}
			if member := room.members[principal.UID]; member != nil && member.participant.Guest == principal.Guest {
				pid = member.participant.ID
			}
			if pid != "" {
				status = &ratingStatus{Persistence: room.match.persistence}
				if status.Persistence == "" {
					status.Persistence = "pending"
				}
				for _, input := range room.match.results {
					if input.ParticipantID == pid {
						status.Rating = input.Rating
					}
				}
			}
			break
		}
		m.mu.Unlock()
		if status == nil && !principal.Guest && m.store != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()
			rating, err := m.store.Rating(ctx, id, principal.UID)
			if err == nil {
				status = &ratingStatus{Persistence: "saved", Rating: rating}
			} else if !errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "result unavailable", 503)
				return
			}
		}
		if status == nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(status)
	})
}
