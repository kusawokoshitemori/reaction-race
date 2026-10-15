// Package results calculates and atomically persists finalized matches.
package results

import "math"

const InitialRating = 1500

// Equal-strength anchors; version changes whenever the scoring policy changes.
const (
	FirstPlacePoints = 20.0
	TenthPlacePoints = 8.0
	LossLimit        = 8.0
	MaxGain          = 28.0
)
const FormulaVersion = "placement-elo-v1"

type Rating struct {
	Before int `json:"before"`
	After  int `json:"after"`
}
type Entry struct {
	ParticipantID string `json:"participantId"`
	UID           string `json:"-"`
	Name          string `json:"name"`
	Bot           bool   `json:"bot"`
	Guest         bool   `json:"guest"`
	Outcome       string `json:"outcome"`
	Rank          *int   `json:"rank"`
	ReactionMs    *int64 `json:"reactionMs"`
	Measurement   string `json:"measurement"`
}

// Reference-only measurements do not provide evidence of a win or loss.
func reference(e Entry) bool { return e.Outcome == "success" && e.Rank == nil }

// Deltas uses a mean Elo expectation and a top-heavy placement curve. Ties use
// the middle occupied place; even a 100-way tie cannot earn 100 first prizes.
func Deltas(entries []Entry, ratings []int) []int {
	deltas := make([]int, len(entries))
	for i, e := range entries {
		if e.Bot || e.Guest || reference(e) {
			continue
		}
		if e.Outcome != "success" {
			deltas[i] = -int(LossLimit)
			continue
		}
		opponents, beaten, tied, expectation := 0, 0, 0, 0.0
		for j, other := range entries {
			if i == j || reference(other) {
				continue
			}
			opponents++
			expectation += 1 / (1 + math.Pow(10, float64(ratings[j]-ratings[i])/400))
			if other.Rank == nil || *other.Rank > *e.Rank {
				beaten++
			} else if *other.Rank == *e.Rank {
				tied++
			}
		}
		if opponents == 0 {
			continue
		}
		place := 100 - 99*(float64(beaten)+float64(tied)/2)/float64(opponents)
		base := 0.0
		switch {
		case place <= 10:
			base = FirstPlacePoints - (place-1)*(FirstPlacePoints-TenthPlacePoints)/9
		case place <= 30:
			base = TenthPlacePoints * (30 - place) / 20
		default:
			base = -(place - 30) * LossLimit / 70
		}
		expected := expectation / float64(opponents)
		adjusted := base * 2 * (1 - expected)
		if base < 0 {
			adjusted = base * 2 * expected
		}
		deltas[i] = int(math.Round(math.Max(-LossLimit, math.Min(MaxGain, adjusted))))
	}
	return deltas
}
