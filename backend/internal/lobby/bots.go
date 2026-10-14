package lobby

import (
	"math/rand/v2"
	"sort"
	"time"
)

// BotInput is scheduled by the match engine relative to its authoritative signal.
// Negative offsets are flying; absent bots intentionally do not submit an input.
type BotInput struct {
	ParticipantID string
	At            time.Time
}

func GenerateBotInputs(roster []Participant, start, signal time.Time, random *rand.Rand) []BotInput {
	result := make([]BotInput, 0, len(roster))
	for _, p := range roster {
		if !p.Bot {
			continue
		}
		roll := random.IntN(100)
		if roll < 3 {
			continue
		} // 3% no input
		at := signal.Add(time.Duration(180+random.IntN(721)) * time.Millisecond)
		if roll < 8 && signal.After(start) {
			at = start.Add(time.Duration(random.Int64N(int64(signal.Sub(start)))))
		}
		result = append(result, BotInput{p.ID, at})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].At.Before(result[j].At) })
	return result
}
