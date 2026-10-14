package profile

import (
	"context"
	"errors"
	"firebase.google.com/go/v4/auth"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/identity"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeVerifier struct{}

func (fakeVerifier) VerifyIDTokenAndCheckRevoked(_ context.Context, raw string) (*auth.Token, error) {
	return &auth.Token{UID: "alice", Firebase: auth.FirebaseInfo{SignInProvider: raw}, Claims: map[string]interface{}{"name": "Alice"}}, nil
}

type memoryStore struct {
	names map[string]string
	fail  bool
}

func (s *memoryStore) GetOrCreate(_ context.Context, uid, name string) (string, error) {
	if s.fail {
		return "", errors.New("db down")
	}
	if s.names[uid] == "" {
		s.names[uid] = name
	}
	return s.names[uid], nil
}
func (s *memoryStore) Rename(_ context.Context, uid, name string) error {
	s.names[uid] = name
	return nil
}
func TestProfile(t *testing.T) {
	store := &memoryStore{names: map[string]string{"bob": "Bob"}}
	handler := identity.Middleware(fakeVerifier{}, Handler(store, slog.New(slog.NewTextHandler(io.Discard, nil))))
	call := func(method, provider, body string, status int) string {
		req := httptest.NewRequest(method, "/api/me?uid=bob", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+provider)
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != status {
			t.Fatalf("%s %s: got %d want %d: %s", method, body, res.Code, status, res.Body.String())
		}
		return res.Body.String()
	}
	call("GET", "google.com", "", 200)
	call("PATCH", "google.com", `{"displayName":"  新しい名前  "}`, 200)
	body := call("GET", "twitter.com", "", 200)
	if !strings.Contains(body, "新しい名前") || store.names["bob"] != "Bob" {
		t.Fatal("identity/name not preserved")
	}
	for _, body := range []string{`{"displayName":"","uid":"bob"}`, `{"displayName":"new","uid":"bob"}`, `{"displayName":" "}`, `{"displayName":"a\nb"}`, `{"displayName":"new"} {}`, `{"displayName":"` + strings.Repeat("あ", 31) + `"}`, strings.Repeat("x", 3000)} {
		call("PATCH", "google.com", body, 400)
	}
	call("PATCH", "anonymous", `{"displayName":"Guest"}`, 403)
	before := len(store.names)
	call("GET", "anonymous", "", 200)
	if len(store.names) != before {
		t.Fatal("guest persisted")
	}
	store.fail = true
	call("GET", "google.com", "", 503)
}
