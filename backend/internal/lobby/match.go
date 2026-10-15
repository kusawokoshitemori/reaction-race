package lobby

import (
	"math/rand/v2"
	"time"

	"github.com/google/uuid"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/results"
)

const InputWindow = 3 * time.Second

// Input contains only server measurements; reactionMs is provisional until finished.
type Input struct {
	Rating        *results.Rating `json:"rating,omitempty"`
	RawReactionMs *int64          `json:"rawReactionMs,omitempty"`
	CorrectionMs  int64           `json:"correctionMs"`
	Measurement   string          `json:"measurement,omitempty"`
	Rank          *int            `json:"rank"`
	ParticipantID string          `json:"participantId"`
	Outcome       string          `json:"outcome"`
	ReceivedAt    int64           `json:"receivedAt,omitempty"`
	ReactionMs    *int64          `json:"reactionMs"`
}
type match struct {
	users       map[string]string
	persistence string
	settled     time.Time
	links       map[string]*latency
	id          string
	signal      time.Time
	inputs      map[string]Input
	results     []Input
	timers      []*time.Timer
}

// All callbacks and inputs share the manager mutex, including timestamp capture.
// This is the authoritative ordering point: a deadline cannot overtake an
// accepted input, and queued/stale callbacks cannot mutate a finalized match.
func (m *Manager) later(r *room, delay time.Duration, fn func()) {
	timer := time.AfterFunc(delay, func() {
		m.mu.Lock()
		defer m.mu.Unlock()
		if m.rooms[r.id] == r && !m.closed {
			fn()
		}
	})
	r.match.timers = append(r.match.timers, timer)
}
func (m *Manager) startMatch(r *room) {
	r.match = &match{id: uuid.NewString(), inputs: make(map[string]Input), users: make(map[string]string)}
	for uid, member := range r.members {
		r.match.users[member.participant.ID] = uid
	}
	m.later(r, time.Second, func() { m.ready(r) })
}
func (m *Manager) ready(r *room) {
	if r.phase != "locked" {
		return
	}
	r.phase = "ready"
	start := time.Now()
	delay := time.Duration(2000+rand.IntN(3001)) * time.Millisecond
	planned := start.Add(delay)
	bots := GenerateBotInputs(r.roster, start, planned, rand.New(rand.NewPCG(rand.Uint64(), rand.Uint64())))
	r.deadline = time.Time{} // Never disclose the upcoming signal to clients.
	m.publish(r)
	m.logger.Info("match ready", "room_id", r.id, "match_id", r.match.id)
	for _, bot := range bots {
		if bot.At.Before(planned) {
			m.later(r, time.Until(bot.At), func() { m.accept(r, bot.ParticipantID, bot.At, true) })
		}
	}
	m.later(r, delay, func() {
		if r.phase != "ready" {
			return
		}
		r.phase = "signal"
		r.match.signal = time.Now()
		r.match.links = make(map[string]*latency)
		for _, member := range r.members {
			if member.connection != nil {
				r.match.links[member.participant.ID] = member.connection.latency
			}
		}
		r.deadline = r.match.signal.Add(InputWindow)
		m.publish(r)
		m.logger.Info("match signal", "room_id", r.id, "match_id", r.match.id, "signal_at", r.match.signal, "deadline", r.deadline)
		for _, bot := range bots {
			if !bot.At.Before(planned) {
				at := r.match.signal.Add(bot.At.Sub(planned))
				m.later(r, time.Until(at), func() { m.accept(r, bot.ParticipantID, at, false) })
			}
		}
		m.later(r, time.Until(r.deadline), func() {
			if r.phase == "signal" {
				m.settle(r)
			}
		})
	})
}

// Tap trusts only the authenticated subscription. No client identity or time is used.
func (m *Manager) Tap(s *Subscription) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tap(s, time.Now())
}
func (m *Manager) tap(s *Subscription, received time.Time) {
	r := s.room
	if m.rooms[r.id] != r {
		return
	}
	member := r.members[s.uid]
	if member == nil || member.connection != s {
		return
	}
	m.accept(r, member.participant.ID, received, false)
}
func (m *Manager) accept(r *room, id string, at time.Time, flyingBot bool) {
	if r.match == nil {
		return
	}
	reason := ""
	if _, ok := r.match.inputs[id]; ok {
		reason = "duplicate"
	} else if r.phase != "ready" && r.phase != "signal" {
		reason = "not_accepting"
	} else if r.phase == "signal" && !at.Before(r.deadline) {
		reason = "late"
	}
	if reason != "" {
		m.logger.Debug("match input rejected", "room_id", r.id, "match_id", r.match.id, "participant_id", id, "reason", reason, "received_at", at)
		if reason == "late" {
			m.settle(r)
		}
		return
	}
	input := Input{ParticipantID: id, Outcome: "flying", ReceivedAt: at.UnixMilli()}
	if r.phase == "signal" && !flyingBot && !at.Before(r.match.signal) {
		ms := at.Sub(r.match.signal).Milliseconds()
		input.Outcome, input.ReactionMs = "success", &ms
	}
	r.match.inputs[id] = input
	m.logger.Info("match input accepted", "room_id", r.id, "match_id", r.match.id, "participant_id", id, "outcome", input.Outcome, "received_at", at, "reaction_ms", input.ReactionMs)
	if len(r.match.inputs) == len(r.roster) {
		m.settle(r)
	} else {
		m.publish(r)
	}
}
func (m *Manager) settle(r *room) {
	if r.phase != "ready" && r.phase != "signal" {
		return
	}
	r.phase = "settling"
	r.match.settled = time.Now()
	for _, timer := range r.match.timers {
		timer.Stop()
	}
	r.match.timers = nil
	for _, p := range r.roster {
		input, ok := r.match.inputs[p.ID]
		if !ok {
			input = Input{ParticipantID: p.ID, Outcome: "no-record"}
			r.match.inputs[p.ID] = input
		}
		r.match.results = append(r.match.results, input)
	}
	m.publish(r)
	m.logger.Info("match settled", "room_id", r.id, "match_id", r.match.id, "participants", len(r.match.results))
	// Bound the post-match measurement even when a participant disconnects.
	m.later(r, postMeasurementWindow, func() {
		if r.phase != "settling" {
			return
		}
		m.calculate(r)
		r.phase = "finished"
		m.persist(r)
		m.publish(r)
		m.logger.Info("match finished", "room_id", r.id, "match_id", r.match.id)
		m.later(r, m.retention, func() { m.remove(r) })
	})
}
