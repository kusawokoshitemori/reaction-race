package results

import (
	"context"
	"errors"
	"firebase.google.com/go/v4/auth"
	"github.com/jackc/pgx/v5"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/identity"
	"io"
	"log/slog"
	"net/http/httptest"
	"testing"
)

type readVerifier struct{}

func (readVerifier) VerifyIDTokenAndCheckRevoked(_ context.Context, provider string) (*auth.Token, error) {
	return &auth.Token{UID: "alice", Firebase: auth.FirebaseInfo{SignInProvider: provider}}, nil
}

type fakeReader struct {
	uid    string
	offset int
	err    error
}

func (s *fakeReader) History(_ context.Context, uid string, offset int) (History, error) {
	s.uid = uid
	s.offset = offset
	return History{Entries: []HistoryEntry{}}, s.err
}
func (s *fakeReader) Detail(_ context.Context, id, uid string) (Detail, error) {
	s.uid = uid
	return Detail{}, s.err
}
func (s *fakeReader) Ranking(_ context.Context, uid string) ([]Leader, error) {
	s.uid = uid
	return []Leader{}, s.err
}
func TestReadAuthorization(t *testing.T) {
	s := &fakeReader{}
	handler := identity.Middleware(readVerifier{}, ReadHandler(s, slog.New(slog.NewTextHandler(io.Discard, nil))))
	for _, tc := range []struct {
		path, provider string
		status         int
		err            error
	}{
		{"/api/me/history", "", 401, nil},
		{"/api/me/history", "anonymous", 403, nil},
		{"/api/ranking", "anonymous", 200, nil},
		{"/api/me/history?uid=bob&offset=20", "google.com", 200, nil},
		{"/api/me/history?offset=-1", "google.com", 400, nil},
		{"/api/me/history?offset=wat", "google.com", 400, nil},
		{"/api/me/history?offset=1000001", "google.com", 400, nil},
		{"/api/matches/invalid", "google.com", 400, nil},
		{"/api/matches/00000000-0000-0000-0000-000000000001", "anonymous", 403, nil},
		{"/api/matches/00000000-0000-0000-0000-000000000001", "google.com", 404, pgx.ErrNoRows},
		{"/api/ranking", "google.com", 503, errors.New("db unavailable")},
	} {
		t.Run(tc.path+tc.provider, func(t *testing.T) {
			s.err = tc.err
			r := httptest.NewRequest("GET", tc.path, nil)
			if tc.provider != "" {
				r.Header.Set("Authorization", "Bearer "+tc.provider)
			}
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
			if w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("cacheable private data")
			}
			if w.Code == 200 && s.uid != "alice" {
				t.Fatal("client identity trusted")
			}
		})
	}
}
