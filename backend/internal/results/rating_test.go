package results

import "testing"

func field() ([]Entry, []int) {
	entries := make([]Entry, 100)
	ratings := make([]int, 100)
	for i := range entries {
		rank := i + 1
		ms := int64(200 + i)
		entries[i] = Entry{Outcome: "success", Rank: &rank, ReactionMs: &ms, Measurement: "corrected"}
		ratings[i] = 1500
	}
	return entries, ratings
}
func TestDesignAnchors(t *testing.T) {
	entries, ratings := field()
	deltas := Deltas(entries, ratings)
	for i, want := range map[int]int{0: 20, 9: 8, 29: 0, 99: -8} {
		if deltas[i] != want {
			t.Errorf("rank %d: got %d want %d", i+1, deltas[i], want)
		}
	}
	for i := 1; i < len(deltas); i++ {
		if deltas[i] > deltas[i-1] {
			t.Fatal("non-monotone")
		}
	}
}
func TestStrengthBotsGuestsAndFailures(t *testing.T) {
	entries, ratings := field()
	base := Deltas(entries, ratings)[9]
	ratings[9] = 1100
	if Deltas(entries, ratings)[9] <= base {
		t.Fatal("stronger opponents did not help")
	}
	ratings[9] = 1900
	if Deltas(entries, ratings)[9] >= base {
		t.Fatal("weaker opponents did not reduce reward")
	}
	ratings[9] = 1500
	for i := range entries {
		if i != 9 {
			entries[i].Bot = true
		}
	}
	if Deltas(entries, ratings)[9] != base {
		t.Fatal("bot discount")
	}
	entries[9].Guest = true
	if Deltas(entries, ratings)[9] != 0 {
		t.Fatal("guest rated")
	}
	entries[9].Guest = false
	for _, outcome := range []string{"flying", "no-record"} {
		entries[9].Outcome = outcome
		entries[9].Rank = nil
		if Deltas(entries, ratings)[9] != -8 {
			t.Fatal(outcome)
		}
	}
	entries[9].Outcome = "success"
	if Deltas(entries, ratings)[9] != 0 {
		t.Fatal("reference rated")
	}
}
func TestTiesAndMissingMeasurements(t *testing.T) {
	entries, ratings := field()
	one := 1
	for i := range entries {
		entries[i].Rank = &one
	}
	deltas := Deltas(entries, ratings)
	for _, d := range deltas {
		if d != -2 {
			t.Fatalf("all tied: %d", d)
		}
	}
	for i := 1; i < len(entries); i++ {
		entries[i].Rank = nil
	}
	if Deltas(entries, ratings)[0] != 0 {
		t.Fatal("no opponents should not earn points")
	}
}

func TestFixedBotAnchorLimitsFarming(t *testing.T) {
	entries, ratings := field()
	for i := 1; i < len(entries); i++ {
		entries[i].Bot = true
	}
	ratings[0] = 3000
	if Deltas(entries, ratings)[0] != 0 {
		t.Fatal("fixed weak bots still yield points")
	}
	ratings[0] = 0
	if Deltas(entries, ratings)[0] != 28 {
		t.Fatal("gain cap")
	}
}
