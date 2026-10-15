package lobby

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestResumeEveryMatchPhase(t *testing.T) {
	for _, phase := range []string{"locked", "ready", "signal", "settling"} {
		t.Run(phase, func(t *testing.T) {
			m, ss := prepared(t, 1)
			old := ss[0]
			r := old.room
			m.Tap(old)
			m.mu.Lock()
			if phase == "settling" {
				m.settle(r)
			}
			r.phase = phase
			before := r.match.inputs[r.roster[0].ID]
			m.mu.Unlock()
			m.Leave(old, true) // Navigation cannot erase an ongoing participant.
			resumed, err := m.JoinResume(old.uid, "same", true, m.instanceID, r.id)
			if err != nil {
				t.Fatal(err)
			}
			snapshot := receive(t, resumed)
			if snapshot.Phase != phase || snapshot.Input == nil || !reflect.DeepEqual(*snapshot.Input, before) {
				t.Fatalf("bad resume: %+v", snapshot)
			}
			m.Tap(old)
			m.Tap(resumed)
			m.mu.Lock()
			unchanged := reflect.DeepEqual(r.match.inputs[r.roster[0].ID], before)
			m.mu.Unlock()
			if !unchanged {
				t.Fatal("replayed input replaced original")
			}
			if _, err := m.JoinResume(old.uid, "same", true, m.instanceID, r.id); err != ErrDuplicate {
				t.Fatalf("duplicate allowed: %v", err)
			}
		})
	}
}

func TestResumeFinishedAndFreshJoin(t *testing.T) {
	m, ss := prepared(t, 1)
	old := ss[0]
	r := old.room
	m.mu.Lock()
	m.settle(r)
	m.calculate(r)
	r.phase = "finished"
	expected := append([]Input(nil), r.match.results...)
	m.mu.Unlock()
	m.Leave(old, false)
	resumed, err := m.JoinResume(old.uid, "same", true, m.instanceID, r.id)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := receive(t, resumed)
	if !reflect.DeepEqual(snapshot.Results, expected) {
		t.Fatal("result changed on resume")
	}
	m.Leave(resumed, false)
	fresh := join(t, m, old.uid)
	if fresh.room == r {
		t.Fatal("fresh join reused finished match")
	}
}

func TestResumeRestartExpiryAndMembership(t *testing.T) {
	m, ss := prepared(t, 1)
	old := ss[0]
	m.Leave(old, false)
	restarted := testManager(t, time.Hour)
	if _, err := restarted.JoinResume(old.uid, "same", true, m.instanceID, old.room.id); !errors.Is(err, ErrServerRestarted) {
		t.Fatalf("restart: %v", err)
	}
	if len(restarted.rooms) != 0 {
		t.Fatal("restart silently joined new room")
	}
	if _, err := m.JoinResume("other", "other", true, m.instanceID, old.room.id); !errors.Is(err, ErrRoomExpired) {
		t.Fatalf("membership: %v", err)
	}
	m.Finish(old.room.id)
	if _, err := m.JoinResume(old.uid, "same", true, m.instanceID, old.room.id); !errors.Is(err, ErrRoomExpired) {
		t.Fatalf("expiry: %v", err)
	}
}
