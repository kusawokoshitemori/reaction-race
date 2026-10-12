// Package identity verifies Firebase credentials at the HTTP boundary.
package identity

import (
	"context"
	"net/http"
	"strings"

	"firebase.google.com/go/v4/auth"
)

type Principal struct {
	UID      string `json:"uid"`
	Guest    bool   `json:"guest"`
	Provider string `json:"provider"`
	Name     string `json:"-"`
}

type Verifier interface {
	VerifyIDTokenAndCheckRevoked(context.Context, string) (*auth.Token, error)
}

type contextKey struct{}

func FromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(contextKey{}).(Principal)
	return p, ok
}

func Middleware(verifier Verifier, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		parts := strings.Fields(r.Header.Get("Authorization"))
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		token, err := verifier.VerifyIDTokenAndCheckRevoked(r.Context(), parts[1])
		if err != nil || token == nil || token.UID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		provider := token.Firebase.SignInProvider
		if provider != "google.com" && provider != "twitter.com" && provider != "anonymous" {
			http.Error(w, "unsupported provider", http.StatusForbidden)
			return
		}
		name, _ := token.Claims["name"].(string)
		p := Principal{UID: token.UID, Guest: provider == "anonymous", Provider: provider, Name: name}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, p)))
	})
}
