package identity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

type ticket struct {
	principal Principal
	expires   time.Time
}

// Tickets exchanges a verified bearer credential for a 30-second, single-use
// WebSocket handshake ticket. Keep one instance per server process.
// Multiple server instances require a shared store with atomic consumption.
type Tickets struct {
	mu      sync.Mutex
	entries map[[32]byte]ticket
	now     func() time.Time
}

func NewTickets() *Tickets { return &Tickets{entries: make(map[[32]byte]ticket), now: time.Now} }
func (t *Tickets) Issue(w http.ResponseWriter, r *http.Request) {
	p, ok := FromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", 401)
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	now := t.now()
	for key, entry := range t.entries {
		if !entry.expires.After(now) || entry.principal.UID == p.UID {
			delete(t.entries, key)
		}
	}
	if len(t.entries) >= 10000 {
		http.Error(w, "retry later", 503)
		return
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		http.Error(w, "ticket unavailable", 503)
		return
	}
	value := hex.EncodeToString(raw)
	t.entries[sha256.Sum256([]byte(value))] = ticket{p, now.Add(30 * time.Second)}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]string{"ticket": value})
}

// UpgradeGuard runs before a WebSocket upgrader. Never log request URLs containing tickets.
// The handler must use FromContext as the connection's identity, never message.userId.
func (t *Tickets) UpgradeGuard(origin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != http.MethodGet || origin == "" || r.Header.Get("Origin") != origin {
			http.Error(w, "forbidden", 403)
			return
		}
		value := r.URL.Query().Get("ticket")
		if len(value) != 64 {
			http.Error(w, "unauthorized", 401)
			return
		}
		key := sha256.Sum256([]byte(value))
		t.mu.Lock()
		entry, ok := t.entries[key]
		delete(t.entries, key)
		t.mu.Unlock()
		if !ok || !entry.expires.After(t.now()) {
			http.Error(w, "unauthorized", 401)
			return
		}
		// Remove ticket before passing to application handlers and their logging.
		query := r.URL.Query()
		query.Del("ticket")
		r.URL.RawQuery = query.Encode()
		r.RequestURI = r.URL.RequestURI()
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, entry.principal)))
	})
}
