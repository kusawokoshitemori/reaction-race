package lobby

import (
	"fmt"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func measured(signal, settled time.Time, before, after []int64) *latency {
	l := &latency{}
	for i, ms := range before {
		sent := signal.Add(-3*time.Second + time.Duration(i)*200*time.Millisecond)
		l.samples = append(l.samples, rttSample{sent, sent.Add(time.Duration(ms) * time.Millisecond)})
	}
	for i, ms := range after {
		sent := settled.Add(time.Duration(i) * 200 * time.Millisecond)
		l.samples = append(l.samples, rttSample{sent, sent.Add(time.Duration(ms) * time.Millisecond)})
	}
	return l
}
func TestLatencyQuality(t *testing.T) {
	signal := time.Now()
	settled := signal.Add(3 * time.Second)
	for _, tc := range []struct {
		name          string
		before, after []int64
		want          int64
		status        string
	}{
		{"stable", []int64{180, 185, 182}, []int64{181, 183, 185}, 180, "corrected"},
		{"missing", []int64{20, 20, 20}, nil, 0, "unavailable"},
		{"few", []int64{20, 20}, []int64{20, 20, 20}, 0, "unavailable"},
		{"jitter", []int64{20, 100, 20}, []int64{20, 20, 20}, 0, "unstable"},
		{"changed", []int64{20, 20, 20}, []int64{100, 100, 100}, 0, "unstable"},
		{"over-limit", []int64{501, 501, 501}, []int64{501, 501, 501}, 0, "unstable"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, status := measured(signal, settled, tc.before, tc.after).correction(signal, settled)
			if got != tc.want || status != tc.status {
				t.Fatalf("%d %s", got, status)
			}
		})
	}
	l := measured(signal.Add(-time.Minute), settled, []int64{20, 20, 20}, []int64{20, 20, 20})
	if _, status := l.correction(signal, settled); status != "unavailable" {
		t.Fatal("stale pre samples accepted")
	}
}
func TestProbeRejectsSpoofReplayAndExpiry(t *testing.T) {
	l := &latency{}
	now := time.Now()
	token := l.ping(now)
	if token == "" || l.ping(now.Add(time.Millisecond)) != "" || l.pong("wrong", now) {
		t.Fatal("invalid challenge")
	}
	if !l.pong(token, now.Add(20*time.Millisecond)) || l.pong(token, now.Add(21*time.Millisecond)) {
		t.Fatal("replay")
	}
	token = l.ping(now.Add(time.Second))
	if l.pong(token, now.Add(3*time.Second)) {
		t.Fatal("expired accepted")
	}
	token = l.ping(now.Add(4 * time.Second))
	if token == "" {
		t.Fatal("probe did not recover")
	}
}
func TestCorrectedRankingAcrossNetworks(t *testing.T) {
	m, ss := prepared(t, 4)
	m.mu.Lock()
	defer m.mu.Unlock()
	r := ss[0].room
	r.match.signal = time.Now()
	r.match.settled = r.match.signal.Add(InputWindow)
	r.match.links = make(map[string]*latency)
	raw := []int64{220, 380, 210, 15}
	r.match.results = nil
	for i, p := range r.roster {
		input := Input{ParticipantID: p.ID, Outcome: "no-record"}
		if i < len(raw) {
			ms := raw[i]
			input.Outcome, input.ReactionMs = "success", &ms
			rtt := int64(20)
			if i == 1 {
				rtt = 180
			}
			if i != 2 {
				r.match.links[p.ID] = measured(r.match.signal, r.match.settled, []int64{rtt, rtt, rtt}, []int64{rtt, rtt, rtt})
			}
		} else if i == 4 {
			ms := int64(250)
			input.Outcome, input.ReactionMs = "success", &ms
		}
		r.match.results = append(r.match.results, input)
	}
	m.calculate(r)
	for i := 0; i < 2; i++ {
		got := r.match.results[i]
		if *got.ReactionMs != 200 || *got.Rank != 1 || *got.RawReactionMs != raw[i] {
			t.Fatal(got)
		}
	}
	if r.match.results[2].Rank != nil || r.match.results[3].Rank != nil || r.match.results[3].Measurement != "unstable" {
		t.Fatal("uncalibrated/negative ranked")
	}
	if *r.match.results[4].Rank != 3 || *r.match.results[4].ReactionMs != 250 {
		t.Fatal("bot or tied ranking")
	}
}

// Synthetic transport delays exercise the real socket and lifecycle. This is
// not a mobile/Wi-Fi or browser-rendering benchmark.
func TestSocketLatencyCorrection(t *testing.T) {
	server, _ := socketServer(t, 500*time.Millisecond)
	type result struct {
		input *Input
		err   error
	}
	results := make(chan result, 2)
	for _, rtt := range []time.Duration{20 * time.Millisecond, 180 * time.Millisecond} {
		c := dial(t, ticketURL(t, server, fmt.Sprint(rtt)))
		c.SetPingHandler(func(token string) error {
			time.AfterFunc(rtt, func() {
				_ = c.WriteControl(websocket.PongMessage, []byte(token), time.Now().Add(time.Second))
			})
			return nil
		})
		if err := c.WriteJSON(map[string]string{"type": "join"}); err != nil {
			t.Fatal(err)
		}
		go func() {
			tapped := false
			for {
				if err := c.SetReadDeadline(time.Now().Add(15 * time.Second)); err != nil {
					results <- result{err: err}
					return
				}
				var snapshot Snapshot
				if err := c.ReadJSON(&snapshot); err != nil {
					results <- result{err: err}
					return
				}
				if snapshot.Phase == "signal" && !tapped {
					tapped = true
					time.AfterFunc(200*time.Millisecond+rtt, func() { _ = c.WriteJSON(map[string]string{"type": "tap"}) })
				}
				if snapshot.Phase == "finished" {
					results <- result{input: snapshot.Input}
					return
				}
			}
		}()
	}
	for range 2 {
		got := <-results
		if got.err != nil {
			t.Fatal(got.err)
		}
		if got.input == nil || got.input.Measurement != "corrected" || got.input.Rank == nil {
			t.Fatalf("%+v", got.input)
		}
		ms := *got.input.ReactionMs
		t.Logf("raw=%d correction=%d corrected=%d", *got.input.RawReactionMs, got.input.CorrectionMs, ms)
		if ms < 170 || ms > 230 {
			t.Fatal("network delay not removed", ms)
		}
	}
}
