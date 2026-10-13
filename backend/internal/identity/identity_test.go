package identity

import (
	"context"
	"errors"
	"firebase.google.com/go/v4/auth"
	"net/http"
	"net/http/httptest"
	"testing"
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
