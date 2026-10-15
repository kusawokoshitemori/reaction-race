package lobby

import (
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
)

const probeInterval = 200 * time.Millisecond
const postMeasurementWindow = 3 * time.Second

type rttSample struct{ sent, received time.Time }
type latency struct {
	mu      sync.Mutex
	token   string
	sent    time.Time
	samples []rttSample
}

// Only one unpredictable, expiring challenge is outstanding per connection.
func (l *latency) ping(now time.Time) string {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.token != "" && now.Sub(l.sent) < time.Second {
		return ""
	}
	l.token, l.sent = uuid.NewString(), now
	return l.token
}
func (l *latency) pong(token string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if token == "" || token != l.token {
		return false
	}
	l.token = ""
	if now.Before(l.sent) || now.Sub(l.sent) > time.Second {
		return false
	}
	l.samples = append(l.samples, rttSample{l.sent, now})
	if len(l.samples) > 64 {
		l.samples = l.samples[len(l.samples)-64:]
	}
	return true
}

// Use recent pre-signal and strictly post-settlement samples. Minima avoid
// treating transient queuing as a permanent advantage; unstable links are unranked.
func (l *latency) correction(signal, settled time.Time) (int64, string) {
	if l == nil {
		return 0, "unavailable"
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	var pre, post []time.Duration
	for _, s := range l.samples {
		if s.sent.After(signal.Add(-10*time.Second)) && s.received.Before(signal) {
			pre = append(pre, s.received.Sub(s.sent))
		}
		if !s.sent.Before(settled) {
			post = append(post, s.received.Sub(s.sent))
		}
	}
	if len(pre) < 3 || len(post) < 3 {
		return 0, "unavailable"
	}
	pre = pre[max(0, len(pre)-5):]
	post = post[max(0, len(post)-5):]
	sort.Slice(pre, func(i, j int) bool { return pre[i] < pre[j] })
	sort.Slice(post, func(i, j int) bool { return post[i] < post[j] })
	if pre[len(pre)-1]-pre[0] > 50*time.Millisecond || post[len(post)-1]-post[0] > 50*time.Millisecond ||
		pre[0]-post[0] > 50*time.Millisecond || post[0]-pre[0] > 50*time.Millisecond || max(pre[0], post[0]) > 500*time.Millisecond {
		return 0, "unstable"
	}
	// Signal travels out, input travels back: subtract a full RTT, not half.
	return min(pre[0], post[0]).Milliseconds(), "corrected"
}

// Keep the timing evidence in structured logs, without client identifiers or tokens.
func (l *latency) evidence(signal, settled time.Time) (pre, post []int64) {
	if l == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, s := range l.samples {
		if s.sent.After(signal.Add(-10*time.Second)) && s.received.Before(signal) {
			pre = append(pre, s.received.Sub(s.sent).Milliseconds())
		}
		if !s.sent.Before(settled) {
			post = append(post, s.received.Sub(s.sent).Milliseconds())
		}
	}
	return
}

func (m *Manager) calculate(r *room) {
	for i, input := range r.match.results {
		if input.Outcome != "success" {
			continue
		}
		input.RawReactionMs = input.ReactionMs
		correction, status := int64(0), "bot"
		if !r.roster[i].Bot {
			correction, status = r.match.links[input.ParticipantID].correction(r.match.signal, r.match.settled)
		}
		input.CorrectionMs, input.Measurement = correction, status
		if status == "corrected" || status == "bot" {
			if *input.RawReactionMs < correction {
				input.Measurement, input.CorrectionMs = "unstable", 0
			} else {
				ms := *input.RawReactionMs - correction
				input.ReactionMs = &ms
			}
		}
		r.match.results[i] = input
	}
	// Competition ranking: equal integer milliseconds share rank (1,1,3).
	for i := range r.match.results {
		input := &r.match.results[i]
		if input.Outcome == "success" && (input.Measurement == "corrected" || input.Measurement == "bot") {
			rank := 1
			for _, other := range r.match.results {
				if other.Outcome == "success" && (other.Measurement == "corrected" || other.Measurement == "bot") && *other.ReactionMs < *input.ReactionMs {
					rank++
				}
			}
			input.Rank = &rank
		}
		r.match.inputs[input.ParticipantID] = *input
		if r.roster[i].Bot {
			continue
		}
		pre, post := r.match.links[input.ParticipantID].evidence(r.match.signal, r.match.settled)
		m.logger.Info("match measurement", "rtt_before_ms", pre, "rtt_after_ms", post, "room_id", r.id, "match_id", r.match.id, "participant_id", input.ParticipantID, "raw_ms", input.RawReactionMs, "correction_ms", input.CorrectionMs, "reaction_ms", input.ReactionMs, "measurement", input.Measurement, "rank", input.Rank)
	}
}
