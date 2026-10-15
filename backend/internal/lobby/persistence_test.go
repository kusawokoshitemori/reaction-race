package lobby

import (
	"context"
	"errors"
	"firebase.google.com/go/v4/auth"
	"github.com/jackc/pgx/v5"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/identity"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/results"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type saveStore struct {
	calls   atomic.Int32
	entered chan results.Match
	release chan struct{}
}

func (s *saveStore) Save(ctx context.Context, match results.Match) (map[string]results.Rating, error) {
	n := s.calls.Add(1)
	select {
	case s.entered <- match:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	select {
	case <-s.release:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	if n == 1 {
		return nil, errors.New("temporary failure")
	}
	r := map[string]results.Rating{}
	for _, e := range match.Entries {
		if e.UID != "" {
			r[e.ParticipantID] = results.Rating{Before: 1500, After: 1495}
		}
	}
	return r, nil
}
func (*saveStore) Rating(context.Context, string, string) (*results.Rating, error) {
	return nil, pgx.ErrNoRows
}

type registeredVerifier struct{}

func (registeredVerifier) VerifyIDTokenAndCheckRevoked(_ context.Context, uid string) (*auth.Token, error) {
	token := &auth.Token{UID: uid}
	token.Firebase.SignInProvider = "google.com"
	return token, nil
}

func TestPersistenceRetryDepartureAndAccess(t *testing.T) {
	m, ss := prepared(t, 1)
	r := ss[0].room
	store := &saveStore{entered: make(chan results.Match, 2), release: make(chan struct{})}
	m.mu.Lock()
	m.store = store
	m.saveRetry = time.Millisecond
	// prepared uses guest joins; switch to registered before freezing the binding.
	r.roster[0].Guest = false
	r.members["0"].participant.Guest = false
	m.settle(r)
	for _, timer := range r.match.timers {
		timer.Stop()
	}
	m.calculate(r)
	r.phase = "finished"
	m.persist(r)
	m.publish(r)
	m.mu.Unlock()
	var job results.Match
	select {
	case job = <-store.entered:
	case <-time.After(time.Second):
		t.Fatal("save not started")
	}
	if job.Entries[0].UID != "0" {
		t.Fatal("lost registered UID")
	}
	// A blocked DB must not block another room or explicit departure.
	other := join(t, m, "other")
	m.Leave(other, true)
	m.Leave(ss[0], true)
	mux := http.NewServeMux()
	mux.Handle("GET /api/matches/{id}/rating", identity.Middleware(registeredVerifier{}, m.RatingHandler()))
	read := func(uid string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "/api/matches/"+job.ID+"/rating", nil)
		if uid != "" {
			req.Header.Set("Authorization", "Bearer "+uid)
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		return w
	}
	if w := read("0"); w.Code != 200 || !strings.Contains(w.Body.String(), "pending") || !strings.Contains(w.Body.String(), `"rating":null`) {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := read("intruder"); w.Code != 404 {
		t.Fatal("foreign result", w.Code)
	}
	if w := read(""); w.Code != 401 {
		t.Fatal("anonymous", w.Code)
	}
	close(store.release)
	select {
	case retry := <-store.entered:
		if retry.ID != job.ID || retry.Entries[0].UID != "0" {
			t.Fatal("changed retry")
		}
	case <-time.After(time.Second):
		t.Fatal("no retry")
	}
	deadline := time.Now().Add(time.Second)
	for {
		w := read("0")
		if strings.Contains(w.Body.String(), "saved") {
			if !strings.Contains(w.Body.String(), `"after":1495`) {
				t.Fatal(w.Body.String())
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("not saved", w.Body.String())
		}
		time.Sleep(time.Millisecond)
	}
	if store.calls.Load() != 2 {
		t.Fatal("duplicate save")
	}
}

func TestGuestStatusSurvivesDepartureAndShutdownCancelsSave(t *testing.T) {
	m, ss := prepared(t, 1)
	r := ss[0].room
	store := &saveStore{entered: make(chan results.Match, 1), release: make(chan struct{})}
	m.mu.Lock()
	m.store = store
	m.settle(r)
	for _, timer := range r.match.timers {
		timer.Stop()
	}
	m.calculate(r)
	r.phase = "finished"
	m.persist(r)
	m.mu.Unlock()
	job := <-store.entered
	if job.Entries[0].UID != "" {
		t.Fatal("guest identity persisted")
	}
	m.Leave(ss[0], true)
	mux := http.NewServeMux()
	mux.Handle("GET /api/matches/{id}/rating", identity.Middleware(verifier{}, m.RatingHandler()))
	req := httptest.NewRequest("GET", "/api/matches/"+job.ID+"/rating", nil)
	req.Header.Set("Authorization", "Bearer 0")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"rating":null`) {
		t.Fatal(w.Code, w.Body.String())
	}
	done := make(chan struct{})
	go func() { m.Close(); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("shutdown blocked")
	}
}

type failingSaveStore struct {
	calls   atomic.Int32
	failure error
}

func (s *failingSaveStore) Save(context.Context, results.Match) (map[string]results.Rating, error) {
	s.calls.Add(1)
	return nil, s.failure
}
func (s *failingSaveStore) Rating(context.Context, string, string) (*results.Rating, error) {
	return nil, pgx.ErrNoRows
}
func TestSaveStopsPermanentAndExhaustedFailures(t *testing.T) {
	for _, tc := range []struct {
		err   error
		calls int32
	}{{results.ErrInvalidMatch, 1}, {results.ErrPayloadConflict, 1}, {results.ErrMissingUser, 1}, {errors.New("temporary"), maxSaveAttempts}} {
		m, ss := prepared(t, 1)
		r := ss[0].room
		store := &failingSaveStore{failure: tc.err}
		m.mu.Lock()
		m.store = store
		m.saveRetry = time.Millisecond
		m.settle(r)
		for _, timer := range r.match.timers {
			timer.Stop()
		}
		m.calculate(r)
		r.phase = "finished"
		m.persist(r)
		m.mu.Unlock()
		m.saves.Wait()
		m.mu.Lock()
		state := m.saveStatuses[r.match.id].persistence
		m.mu.Unlock()
		if state != "failed" || store.calls.Load() != tc.calls {
			t.Fatalf("state=%s calls=%d", state, store.calls.Load())
		}
	}
}

func TestPendingSaveSurvivesRoomRetention(t *testing.T) {
	m, ss := prepared(t, 1)
	r := ss[0].room
	store := &saveStore{entered: make(chan results.Match, 2), release: make(chan struct{})}
	m.mu.Lock()
	m.store = store
	m.saveRetry = time.Millisecond
	m.settle(r)
	for _, timer := range r.match.timers {
		timer.Stop()
	}
	m.calculate(r)
	r.phase = "finished"
	m.persist(r)
	m.later(r, time.Millisecond, func() { m.remove(r) })
	m.mu.Unlock()
	job := <-store.entered
	deadline := time.Now().Add(time.Second)
	for {
		m.mu.Lock()
		removed := m.rooms[r.id] == nil && m.users[ss[0].uid] == nil
		status := m.saveStatuses[job.ID]
		m.mu.Unlock()
		if removed {
			if status == nil {
				t.Fatal("lost save status")
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("room retained")
		}
		time.Sleep(time.Millisecond)
	}
	next := join(t, m, ss[0].uid)
	if next.room == r {
		t.Fatal("returned to finished room")
	}
	close(store.release)
	m.saves.Wait()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.saveStatuses[job.ID].persistence != "saved" {
		t.Fatal("detached save failed")
	}
}
