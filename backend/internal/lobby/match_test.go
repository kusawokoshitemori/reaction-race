package lobby

import (
	"fmt"
	"reflect"
	"sync"
	"testing"
	"time"
)

// Advance the engine without wall-clock sleeps; callbacks still use real timers
// in the end-to-end WebSocket test below.
func prepared(t *testing.T, count int) (*Manager, []*Subscription) {
	t.Helper()
	m := testManager(t, time.Hour)
	ss := make([]*Subscription, count)
	for i := range ss {
		ss[i] = join(t, m, fmt.Sprint(i))
	}
	m.mu.Lock()
	r := ss[0].room
	if r.phase == "waiting" {
		m.freeze(r)
	}
	for _, timer := range r.match.timers {
		timer.Stop()
	}
	r.phase = "ready"
	m.mu.Unlock()
	return m, ss
}
func TestFirstInputAndDeadline(t *testing.T) {
	m, ss := prepared(t, 3)
	r := ss[0].room
	m.Tap(ss[0])
	m.mu.Lock()
	r.phase = "signal"
	r.match.signal = time.Now().Add(-100 * time.Millisecond)
	r.deadline = r.match.signal.Add(InputWindow)
	m.mu.Unlock()
	m.Tap(ss[0]) // Cannot replace flying with success.
	m.Tap(ss[1])
	m.mu.Lock()
	if r.match.inputs[r.roster[0].ID].Outcome != "flying" || r.match.inputs[r.roster[1].ID].Outcome != "success" {
		t.Fatal("first input lost")
	}
	m.accept(r, r.roster[2].ID, r.deadline, false)
	before := append([]Input(nil), r.match.results...)
	m.accept(r, r.roster[2].ID, r.deadline.Add(-time.Millisecond), false)
	m.settle(r)
	if !reflect.DeepEqual(before, r.match.results) || len(before) != 100 || before[2].Outcome != "no-record" {
		t.Fatal("deadline/result changed")
	}
	m.mu.Unlock()
}
func TestAllInputsConcurrentAndImmutable(t *testing.T) {
	m, ss := prepared(t, 100)
	r := ss[0].room
	var wg sync.WaitGroup
	for _, s := range ss {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 10; i++ {
				m.Tap(s)
			}
		}()
	}
	wg.Wait()
	m.mu.Lock()
	defer m.mu.Unlock()
	if r.phase != "settling" && r.phase != "finished" {
		t.Fatal(r.phase)
	}
	if len(r.match.results) != 100 {
		t.Fatal("did not finish early")
	}
	for _, input := range r.match.results {
		if input.Outcome != "flying" {
			t.Fatal(input)
		}
	}
}
func TestTimerAndInputRace(t *testing.T) {
	for n := 0; n < 50; n++ {
		m, ss := prepared(t, 2)
		r := ss[0].room
		m.mu.Lock()
		r.phase = "signal"
		r.match.signal = time.Now().Add(-InputWindow)
		r.deadline = r.match.signal.Add(InputWindow)
		m.mu.Unlock()
		var wg sync.WaitGroup
		wg.Add(2)
		go func() { defer wg.Done(); m.Tap(ss[0]) }()
		go func() { defer wg.Done(); m.mu.Lock(); defer m.mu.Unlock(); m.settle(r) }()
		wg.Wait()
		m.mu.Lock()
		if len(r.match.results) != 100 || r.match.results[0].Outcome != "no-record" {
			t.Fatal("race changed late verdict")
		}
		m.mu.Unlock()
		m.Close()
	}
}
func TestMatchIsolationStaleConnectionAndResume(t *testing.T) {
	m, ss := prepared(t, 1)
	r := ss[0].room
	m.Leave(ss[0], false)
	m.Tap(ss[0])
	resumed := join(t, m, "0")
	snapshot := receive(t, resumed)
	if snapshot.MatchID != r.match.id || snapshot.You != r.roster[0].ID || snapshot.Input != nil {
		t.Fatal("bad resume")
	}
	m.Tap(resumed)
	other := join(t, m, "other")
	m.Tap(other)
	m.mu.Lock()
	if len(r.match.inputs) != 1 || other.room.match != nil {
		t.Fatal("cross-room input")
	}
	m.settle(r)
	m.mu.Unlock()
	m.Leave(resumed, false)
	again := join(t, m, "0")
	snapshot = receive(t, again)
	if snapshot.Input == nil || snapshot.Input.Outcome != "flying" {
		t.Fatal("resume lost accepted input")
	}
}
func TestSocketMatchLifecycle(t *testing.T) {
	server, _ := socketServer(t, 200*time.Millisecond)
	a := dial(t, ticketURL(t, server, "match-a"))
	a.WriteJSON(map[string]string{"type": "join"})
	b := dial(t, ticketURL(t, server, "match-b"))
	b.WriteJSON(map[string]string{"type": "join"})
	readPhase := func(c interface {
		SetReadDeadline(time.Time) error
		ReadJSON(any) error
	}, phase string) Snapshot {
		t.Helper()
		deadline := time.Now().Add(12 * time.Second)
		for {
			c.SetReadDeadline(deadline)
			var r Snapshot
			if err := c.ReadJSON(&r); err != nil {
				t.Fatal(err)
			}
			if r.Phase == phase {
				return r
			}
		}
	}
	ready := readPhase(a, "ready")
	if ready.SignalAt != 0 {
		t.Fatal("future signal disclosed")
	}
	a.WriteJSON(map[string]string{"type": "tap"})
	a.WriteJSON(map[string]string{"type": "tap"})
	// Both clients must keep draining snapshots and answering pings while
	// the post-match measurement runs, just like browser WebSockets do.
	finishedA := make(chan Snapshot, 1)
	go func() {
		defer close(finishedA)
		finishedA <- readPhase(a, "finished")
	}()
	readPhase(b, "signal")
	b.WriteJSON(map[string]string{"type": "tap"})
	finalB := readPhase(b, "finished")
	finalA := <-finishedA
	if finalA.Input.Outcome != "flying" || finalB.Input.Outcome != "success" || len(finalA.Results) != 100 || !reflect.DeepEqual(finalA.Results, finalB.Results) {
		t.Fatal("inconsistent results")
	}
	// An input after completion cannot change retained results.
	b.WriteJSON(map[string]string{"type": "tap"})
}
