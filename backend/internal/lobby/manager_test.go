package lobby

import (
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"sync"
	"testing"
	"time"
)

func testManager(t *testing.T, wait time.Duration) *Manager {
	t.Helper()
	m := New(wait, time.Minute, slog.New(slog.NewTextHandler(io.Discard, nil)))
	t.Cleanup(m.Close)
	return m
}
func join(t *testing.T, m *Manager, uid string) *Subscription {
	t.Helper()
	s, e := m.Join(uid, uid, true)
	if e != nil {
		t.Fatal(e)
	}
	return s
}
func receive(t *testing.T, s *Subscription) Snapshot {
	t.Helper()
	select {
	case r, ok := <-s.Updates:
		if !ok {
			t.Fatal("closed")
		}
		return r
	case <-time.After(time.Second):
		t.Fatal("no snapshot")
		return Snapshot{}
	}
}
func TestRoomIsolationAndCapacity(t *testing.T) {
	m := testManager(t, time.Hour)
	first := join(t, m, "0")
	for i := 1; i < 100; i++ {
		join(t, m, fmt.Sprint(i))
	}
	a := receive(t, first)
	if a.Phase != "locked" || len(a.Participants) != 100 {
		t.Fatal(a)
	}
	second := join(t, m, "100")
	b := receive(t, second)
	if a.RoomID == b.RoomID || len(b.Participants) != 1 {
		t.Fatal("rooms mixed")
	}
	m.Leave(second, true)
	if _, ok := m.Roster(a.RoomID); !ok {
		t.Fatal("other room removed")
	}
}
func TestDeadlineBotsAndReconnect(t *testing.T) {
	m := testManager(t, 25*time.Millisecond)
	s := join(t, m, "a")
	receive(t, s)
	locked := receive(t, s)
	if locked.Phase != "locked" || len(locked.Participants) != 100 {
		t.Fatal("not locked")
	}
	bots := 0
	ids := map[string]bool{}
	for _, p := range locked.Participants {
		if ids[p.ID] {
			t.Fatal("duplicate id")
		}
		ids[p.ID] = true
		if p.Bot {
			bots++
		}
	}
	if bots != 99 {
		t.Fatal(bots)
	}
	if _, e := m.Join("a", "a", true); e != ErrDuplicate {
		t.Fatal("duplicate accepted")
	}
	m.Leave(s, false)
	resumed := join(t, m, "a")
	snapshot := receive(t, resumed)
	if snapshot.RoomID != locked.RoomID || len(snapshot.Participants) != 100 {
		t.Fatal("resume changed roster")
	}
	copy, _ := m.Roster(locked.RoomID)
	copy[0].Name = "tamper"
	again, _ := m.Roster(locked.RoomID)
	if again[0].Name == "tamper" {
		t.Fatal("mutable roster")
	}
	m.Leave(resumed, true)
	fresh := join(t, m, "a")
	if receive(t, fresh).RoomID == locked.RoomID {
		t.Fatal("explicit leave did not release identity")
	}
}
func TestWaitingLeaveAndCleanup(t *testing.T) {
	m := testManager(t, time.Hour)
	a := join(t, m, "a")
	b := join(t, m, "b")
	receive(t, b)
	m.Leave(a, false)
	if r := receive(t, b); len(r.Participants) != 1 || r.Participants[0].Name != "b" {
		t.Fatal(r)
	}
	m.Leave(a, false)
	m.Leave(b, false)
	if len(m.rooms) != 0 || len(m.users) != 0 || m.waiting != nil {
		t.Fatal("empty room leaked")
	}
}
func TestConcurrentJoinsAndLeaves(t *testing.T) {
	m := testManager(t, time.Hour)
	var wg sync.WaitGroup
	connections := make([]*Subscription, 201)
	for i := range connections {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			s, e := m.Join(fmt.Sprint(i), "user", true)
			if e != nil {
				t.Error(e)
			}
			connections[i] = s
		}(i)
	}
	wg.Wait()
	if len(m.rooms) != 3 {
		t.Fatal(len(m.rooms))
	}
	for _, s := range connections {
		wg.Add(1)
		go func(s *Subscription) { defer wg.Done(); m.Leave(s, true) }(s)
	}
	wg.Wait()
	if len(m.users) != 0 {
		t.Fatal("identity leak")
	}
	m.Close()
	if len(m.rooms) != 0 {
		t.Fatal("room leak")
	}
	if _, e := m.Join("new", "new", true); e != ErrUnavailable {
		t.Fatal("closed manager accepted join")
	}
}
func TestRetentionClosesSubscriptions(t *testing.T) {
	m := testManager(t, 5*time.Millisecond)
	m.retention = 15 * time.Millisecond
	s := join(t, m, "a")
	deadline := time.After(time.Second)
	for {
		select {
		case _, ok := <-s.Updates:
			if !ok {
				m.mu.Lock()
				defer m.mu.Unlock()
				if len(m.users) != 0 {
					t.Fatal("retained users")
				}
				return
			}
		case <-deadline:
			t.Fatal("not expired")
		}
	}
}
func TestBotInputs(t *testing.T) {
	roster := []Participant{{ID: "human"}}
	for i := 0; i < 10000; i++ {
		roster = append(roster, Participant{ID: fmt.Sprint(i), Bot: true})
	}
	start := time.Unix(0, 0)
	signal := start.Add(3 * time.Second)
	inputs := GenerateBotInputs(roster, start, signal, rand.New(rand.NewPCG(1, 2)))
	if len(inputs) >= 10000 || len(inputs) < 9000 {
		t.Fatal("missing no-input distribution")
	}
	seen := map[string]bool{}
	flying := 0
	for i, p := range inputs {
		if p.ParticipantID == "human" || seen[p.ParticipantID] {
			t.Fatal("human or duplicate input")
		}
		seen[p.ParticipantID] = true
		if p.At.Before(start) || !p.At.Before(signal.Add(3*time.Second)) {
			t.Fatal("outside input window")
		}
		if p.At.Before(signal) {
			flying++
		}
		if i > 0 && p.At.Before(inputs[i-1].At) {
			t.Fatal("not ordered")
		}
	}
	if flying == 0 {
		t.Fatal("no flying bots")
	}
}

func TestLateJoinCannotEnterExpiredWaitingRoom(t *testing.T) {
	m := testManager(t, time.Hour)
	a := join(t, m, "a")
	first := receive(t, a)
	m.mu.Lock()
	a.room.deadline = time.Now().Add(-time.Second)
	m.mu.Unlock()
	b := join(t, m, "b")
	second := receive(t, b)
	if first.RoomID == second.RoomID {
		t.Fatal("late join entered expired room")
	}
	if receive(t, a).Phase != "locked" {
		t.Fatal("expired room not frozen")
	}
}
func TestDeadlineConcurrentLeave(t *testing.T) {
	for i := 0; i < 30; i++ {
		m := testManager(t, time.Millisecond)
		a := join(t, m, "a")
		join(t, m, "b")
		done := make(chan struct{})
		go func() { m.Leave(a, false); close(done) }()
		<-done
		m.Close()
	}
}
