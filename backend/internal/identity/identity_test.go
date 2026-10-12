package identity

import (
	"context"
	"encoding/json"
	"errors"
	"firebase.google.com/go/v4/auth"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type fakeVerifier struct{}

func (fakeVerifier) VerifyIDTokenAndCheckRevoked(_ context.Context, raw string) (*auth.Token, error) {
	if raw == "bad" {
		return nil, errors.New("invalid or revoked")
	}
	return &auth.Token{UID: "verified-user", Firebase: auth.FirebaseInfo{SignInProvider: raw}}, nil
}
func TestMiddleware(t *testing.T) {
	for _, tc := range []struct {
		header string
		status int
		guest  bool
	}{
		{"", 401, false}, {"Basic x", 401, false}, {"Bearer bad", 401, false}, {"Bearer google.com extra", 401, false},
		{"Bearer password", 403, false}, {"Bearer google.com", 200, false}, {"Bearer twitter.com", 200, false}, {"Bearer anonymous", 200, true},
	} {
		t.Run(tc.header, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/me?uid=someone-else", nil)
			req.Header.Set("Authorization", tc.header)
			res := httptest.NewRecorder()
			Middleware(fakeVerifier{}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				p, ok := FromContext(r.Context())
				if !ok || p.UID != "verified-user" || p.Guest != tc.guest {
					t.Fatalf("wrong principal: %+v", p)
				}
			})).ServeHTTP(res, req)
			if res.Code != tc.status {
				t.Fatalf("got %d want %d", res.Code, tc.status)
			}
		})
	}
}
func TestTickets(t *testing.T) {
	tickets := NewTickets()
	now := time.Now()
	tickets.now = func() time.Time { return now }
	issue := func() string {
		req := httptest.NewRequest("POST", "/api/ws-ticket", nil)
		req.Header.Set("Authorization", "Bearer anonymous")
		res := httptest.NewRecorder()
		Middleware(fakeVerifier{}, http.HandlerFunc(tickets.Issue)).ServeHTTP(res, req)
		var body map[string]string
		_ = json.Unmarshal(res.Body.Bytes(), &body)
		return body["ticket"]
	}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := FromContext(r.Context())
		if !ok || !p.Guest || p.UID != "verified-user" {
			t.Fatal("missing identity")
		}
		if r.URL.Query().Get("ticket") != "" {
			t.Fatal("ticket leaked to handler")
		}
		w.WriteHeader(204)
	})
	check := func(value, origin string, status int) {
		req := httptest.NewRequest("GET", "/ws?ticket="+value, nil)
		req.Header.Set("Origin", origin)
		res := httptest.NewRecorder()
		tickets.UpgradeGuard("https://game.example", next).ServeHTTP(res, req)
		if res.Code != status {
			t.Fatalf("got %d want %d", res.Code, status)
		}
	}
	first := issue()
	check(first, "https://evil.example", 403)
	check(first, "https://game.example", 204)
	check(first, "https://game.example", 401)
	expired := issue()
	now = now.Add(31 * time.Second)
	check(expired, "https://game.example", 401)
	old := issue()
	fresh := issue()
	check(old, "https://game.example", 401)
	check(fresh, "https://game.example", 204)
	check("forged", "https://game.example", 401)
}
