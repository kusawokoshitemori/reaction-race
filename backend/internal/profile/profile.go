package profile

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/dbdiagnostic"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/identity"
)

type Profile struct {
	UID         string `json:"uid"`
	DisplayName string `json:"displayName"`
	Guest       bool   `json:"guest"`
	Provider    string `json:"provider"`
}

type Store interface {
	GetOrCreate(context.Context, string, string) (string, error)
	Rename(context.Context, string, string) error
}

type Postgres struct{ Pool *pgxpool.Pool }

func (s Postgres) GetOrCreate(ctx context.Context, uid, name string) (string, error) {
	// DO NOTHING preserves a user's chosen name across provider logins.
	_, err := s.Pool.Exec(ctx, `INSERT INTO users (firebase_uid, display_name) VALUES ($1, $2) ON CONFLICT DO NOTHING`, uid, name)
	if err != nil {
		return "", err
	}
	err = s.Pool.QueryRow(ctx, `SELECT display_name FROM users WHERE firebase_uid = $1`, uid).Scan(&name)
	return name, err
}

func (s Postgres) Rename(ctx context.Context, uid, name string) error {
	tag, err := s.Pool.Exec(ctx, `UPDATE users SET display_name = $2, updated_at = now() WHERE firebase_uid = $1`, uid, name)
	if err == nil && tag.RowsAffected() != 1 {
		return errors.New("profile not found")
	}
	return err
}

func ValidName(name string) bool {
	n := utf8.RuneCountInString(name)
	if !utf8.ValidString(name) || n < 1 || n > 30 {
		return false
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}

func Handler(store Store, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/me", func(w http.ResponseWriter, r *http.Request) {
		p, ok := identity.FromContext(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		result := Profile{UID: p.UID, Guest: p.Guest, Provider: p.Provider, DisplayName: "ゲスト"}
		if !p.Guest {
			name := strings.TrimSpace(p.Name)
			if !ValidName(name) {
				name = "プレイヤー"
			}
			var err error
			result.DisplayName, err = store.GetOrCreate(r.Context(), p.UID, name)
			if err != nil {
				logger.Error("profile read failed", "error", dbdiagnostic.Safe(err))
				http.Error(w, "profile unavailable", http.StatusServiceUnavailable)
				return
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
	})
	mux.HandleFunc("PATCH /api/me", func(w http.ResponseWriter, r *http.Request) {
		p, ok := identity.FromContext(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if p.Guest {
			http.Error(w, "registered account required", http.StatusForbidden)
			return
		}
		var body struct {
			DisplayName string `json:"displayName"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&body); err != nil {
			http.Error(w, "invalid profile", http.StatusBadRequest)
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			http.Error(w, "invalid profile", http.StatusBadRequest)
			return
		}
		body.DisplayName = strings.TrimSpace(body.DisplayName)
		if !ValidName(body.DisplayName) {
			http.Error(w, "display name must be 1-30 characters", http.StatusBadRequest)
			return
		}
		if _, err := store.GetOrCreate(r.Context(), p.UID, body.DisplayName); err != nil {
			logger.Error("profile create failed", "error", dbdiagnostic.Safe(err))
			http.Error(w, "profile unavailable", http.StatusServiceUnavailable)
			return
		}
		if err := store.Rename(r.Context(), p.UID, body.DisplayName); err != nil {
			logger.Error("profile update failed", "error", dbdiagnostic.Safe(err))
			http.Error(w, "profile unavailable", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Profile{UID: p.UID, DisplayName: body.DisplayName, Provider: p.Provider})
	})
	return mux
}
