// Package lobby owns matchmaking, frozen rosters and match progression. All mutations are serialized.
package lobby

import (
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
)

const Capacity = 100

var ErrDuplicate = errors.New("already_connected")
var ErrUnavailable = errors.New("lobby_unavailable")

type Participant struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Bot   bool   `json:"bot"`
	Guest bool   `json:"guest"`
}
type Snapshot struct {
	Type         string        `json:"type"`
	RoomID       string        `json:"roomId"`
	Phase        string        `json:"phase"`
	Deadline     int64         `json:"deadline"`
	ServerTime   int64         `json:"serverTime"`
	Capacity     int           `json:"capacity"`
	Participants []Participant `json:"participants"`
	You          string        `json:"you"`
	MatchID      string        `json:"matchId,omitempty"`
	SignalAt     int64         `json:"signalAt,omitempty"`
	Input        *Input        `json:"input,omitempty"`
	Results      []Input       `json:"results,omitempty"`
}
type Subscription struct {
	Updates chan Snapshot
	uid     string
	room    *room
}
type member struct {
	participant Participant
	connection  *Subscription
}
type room struct {
	id       string
	deadline time.Time
	phase    string
	members  map[string]*member
	roster   []Participant
	timer    *time.Timer
	match    *match
}
type Manager struct {
	mu              sync.Mutex
	rooms           map[string]*room
	users           map[string]*room
	waiting         *room
	wait, retention time.Duration
	logger          *slog.Logger
	closed          bool
}

func New(wait, retention time.Duration, logger *slog.Logger) *Manager {
	return &Manager{rooms: make(map[string]*room), users: make(map[string]*room), wait: wait, retention: retention, logger: logger}
}
func (m *Manager) Join(uid, name string, guest bool) (*Subscription, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return nil, ErrUnavailable
	}
	if r := m.users[uid]; r != nil {
		member := r.members[uid]
		if member.connection != nil {
			return nil, ErrDuplicate
		}
		s := &Subscription{make(chan Snapshot, 1), uid, r}
		member.connection = s
		m.publish(r)
		m.logger.Info("lobby reconnected", "room_id", r.id, "participant_id", member.participant.ID)
		return s, nil
	}
	if m.waiting != nil && !time.Now().Before(m.waiting.deadline) {
		m.freeze(m.waiting)
	}
	if len(m.users) >= 10000 || (m.waiting == nil && len(m.rooms) >= 1000) {
		return nil, ErrUnavailable
	}
	r := m.waiting
	if r == nil {
		r = &room{id: uuid.NewString(), deadline: time.Now().Add(m.wait), phase: "waiting", members: make(map[string]*member)}
		m.rooms[r.id] = r
		m.waiting = r
		r.timer = time.AfterFunc(m.wait, func() {
			m.mu.Lock()
			defer m.mu.Unlock()
			if m.rooms[r.id] == r && r.phase == "waiting" {
				m.freeze(r)
			}
		})
	}
	s := &Subscription{make(chan Snapshot, 1), uid, r}
	p := Participant{ID: uuid.NewString(), Name: name, Guest: guest}
	r.members[uid] = &member{p, s}
	r.roster = append(r.roster, p)
	m.users[uid] = r
	m.logger.Info("lobby joined", "room_id", r.id, "participant_id", p.ID, "humans", len(r.members))
	if len(r.members) == Capacity {
		m.freeze(r)
	} else {
		m.publish(r)
	}
	return s, nil
}
func (m *Manager) snapshot(r *room) Snapshot {
	deadline := int64(0)
	if !r.deadline.IsZero() {
		deadline = r.deadline.UnixMilli()
	}
	return Snapshot{Type: "room", RoomID: r.id, Phase: r.phase, Deadline: deadline, ServerTime: time.Now().UnixMilli(), Capacity: Capacity, Participants: append([]Participant(nil), r.roster...)}
}
func (m *Manager) publish(r *room) {
	snapshot := m.snapshot(r)
	if r.match != nil {
		snapshot.MatchID = r.match.id
		if !r.match.signal.IsZero() {
			snapshot.SignalAt = r.match.signal.UnixMilli()
		}
		if r.phase == "finished" {
			snapshot.Results = append([]Input(nil), r.match.results...)
		}
	}
	for _, p := range r.members {
		if s := p.connection; s != nil {
			snapshot.You = p.participant.ID
			snapshot.Input = nil
			if r.match != nil {
				if input, ok := r.match.inputs[p.participant.ID]; ok {
					copy := input
					snapshot.Input = &copy
				}
			}
			// Coalesce full snapshots so a slow reader never blocks another room.
			select {
			case <-s.Updates:
			default:
			}
			s.Updates <- snapshot
		}
	}
}
func (m *Manager) freeze(r *room) {
	if r.phase != "waiting" {
		return
	}
	r.phase = "locked"
	r.timer.Stop()
	if m.waiting == r {
		m.waiting = nil
	}
	for len(r.roster) < Capacity {
		n := len(r.roster) + 1
		r.roster = append(r.roster, Participant{ID: fmt.Sprintf("bot:%s:%d", r.id, n), Name: fmt.Sprintf("BOT %02d", n), Bot: true})
	}
	m.logger.Info("lobby locked", "room_id", r.id, "humans", len(r.members), "bots", Capacity-len(r.members))
	m.publish(r)
	m.startMatch(r)
}

// Leave keeps the frozen roster. Unexpected disconnects may resume until Finish.
func (m *Manager) Leave(s *Subscription, explicit bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r := s.room
	if m.rooms[r.id] != r {
		return
	}
	member := r.members[s.uid]
	if member == nil || member.connection != s {
		return
	}
	close(s.Updates)
	member.connection = nil
	if r.phase == "waiting" || explicit {
		delete(m.users, s.uid)
		delete(r.members, s.uid)
	}
	if r.phase == "waiting" {
		for i, p := range r.roster {
			if p.ID == member.participant.ID {
				r.roster = append(r.roster[:i], r.roster[i+1:]...)
				break
			}
		}
		if len(r.members) == 0 {
			m.remove(r)
			return
		}
		m.publish(r)
	}
	m.logger.Info("lobby left", "room_id", r.id, "participant_id", member.participant.ID, "phase", r.phase, "explicit", explicit)
}
func (m *Manager) remove(r *room) {
	r.timer.Stop()
	if r.match != nil {
		for _, timer := range r.match.timers {
			timer.Stop()
		}
	}
	delete(m.rooms, r.id)
	if m.waiting == r {
		m.waiting = nil
	}
	for uid, p := range r.members {
		if m.users[uid] == r {
			delete(m.users, uid)
		}
		if p.connection != nil {
			close(p.connection.Updates)
		}
	}
	m.logger.Info("lobby removed", "room_id", r.id)
}
func (m *Manager) Finish(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if r := m.rooms[id]; r != nil {
		m.remove(r)
	}
}
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
	for _, r := range m.rooms {
		m.remove(r)
	}
}

// Roster returns a copy of the frozen roster, never mutable lobby state.
func (m *Manager) Roster(id string) ([]Participant, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r := m.rooms[id]
	if r == nil || r.phase == "waiting" {
		return nil, false
	}
	return append([]Participant(nil), r.roster...), true
}
