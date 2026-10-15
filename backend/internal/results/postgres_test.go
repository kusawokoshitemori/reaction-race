package results

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"reflect"
	"sync"
	"testing"
	"time"
)

func TestPostgresAtomicIdempotent(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not configured")
	}
	ctx := context.Background()
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	// A private schema makes this test repeatable, including concurrent package runs.
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := "results_" + fmt.Sprint(time.Now().UnixNano())
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	for _, name := range []string{"001_users.sql", "002_match_results.sql", "002_match_results.sql"} {
		sql, err := os.ReadFile("../../migrations/" + name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = pool.Exec(ctx, string(sql)); err != nil {
			t.Fatal(err)
		}
	}
	store := Postgres{pool}
	entries, _ := field()
	for i := range entries {
		entries[i].ParticipantID = fmt.Sprint(i)
		entries[i].Name = "player"
		entries[i].Bot = i > 1
	}
	entries[0].UID = "alice"
	entries[1].UID = "bob"
	entries[98].Bot = false
	entries[98].Guest = true
	if _, err = pool.Exec(ctx, `INSERT INTO users(firebase_uid,display_name) VALUES ('alice','Alice'),('bob','Bob')`); err != nil {
		t.Fatal(err)
	}
	match := Match{ID: uuid.NewString(), RoomID: uuid.NewString(), FinishedAt: time.Now(), Entries: entries}
	// Concurrent duplicate deliveries must all return exactly the committed change.
	var wg sync.WaitGroup
	all := make([]map[string]Rating, 10)
	for i := range all {
		wg.Go(func() {
			r, e := store.Save(ctx, match)
			if e != nil {
				t.Error(e)
			}
			all[i] = r
		})
	}
	wg.Wait()
	for _, r := range all {
		if !reflect.DeepEqual(r, all[0]) {
			t.Fatal("retry changed ratings")
		}
	}
	if all[0]["0"] != (Rating{1500, 1520}) {
		t.Fatal(all[0])
	}
	var count, rating int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM match_results`).Scan(&count); err != nil || count != 100 {
		t.Fatalf("rows %d: %v", count, err)
	}
	if err = pool.QueryRow(ctx, `SELECT rating FROM users WHERE firebase_uid='alice'`).Scan(&rating); err != nil || rating != 1520 {
		t.Fatalf("rating %d: %v", rating, err)
	}
	own, err := store.Rating(ctx, match.ID, "alice")
	if err != nil || *own != all[0]["0"] {
		t.Fatal(own, err)
	}
	if _, err = store.Rating(ctx, match.ID, "intruder"); err == nil {
		t.Fatal("unauthorized read")
	}
	history, err := store.History(ctx, "alice", 0)
	if err != nil || len(history.Entries) != 1 || history.Entries[0].MatchID != match.ID || history.HasMore {
		t.Fatal(history, err)
	}
	empty, err := store.History(ctx, "intruder", 0)
	if err != nil || len(empty.Entries) != 0 {
		t.Fatal(empty, err)
	}
	detail, err := store.Detail(ctx, match.ID, "alice")
	if err != nil || len(detail.Entries) != 100 {
		t.Fatal(detail, err)
	}
	if _, err = store.Detail(ctx, match.ID, "intruder"); err == nil {
		t.Fatal("nonparticipant read detail")
	}
	leaders, err := store.Ranking(ctx, "alice")
	if err != nil || len(leaders) != 2 || !leaders[0].Self || leaders[0].Rating != 1520 || leaders[0].Rank != 1 {
		t.Fatal(leaders, err)
	}
	altered := match
	altered.Entries = append([]Entry(nil), entries...)
	altered.Entries[0].Name = "changed"
	if _, err = store.Save(ctx, altered); err == nil {
		t.Fatal("conflicting payload accepted")
	}
	// Fail the final participant insert, after updates to both user ratings.
	_, err = pool.Exec(ctx, `CREATE FUNCTION reject_last() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.participant_id='99' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_result BEFORE INSERT ON match_results FOR EACH ROW EXECUTE FUNCTION reject_last()`)
	if err != nil {
		t.Fatal(err)
	}
	retry := match
	retry.ID = uuid.NewString()
	if _, err = store.Save(ctx, retry); err == nil {
		t.Fatal("failure injection ignored")
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM matches`).Scan(&count); err != nil || count != 1 {
		t.Fatal("partial match", count, err)
	}
	if err = pool.QueryRow(ctx, `SELECT rating FROM users WHERE firebase_uid='alice'`).Scan(&rating); err != nil || rating != 1520 {
		t.Fatal("partial rating", rating, err)
	}
	if _, err = pool.Exec(ctx, `DROP TRIGGER fail_result ON match_results`); err != nil {
		t.Fatal(err)
	}
	saved, err := store.Save(ctx, retry)
	if err != nil {
		t.Fatal(err)
	}
	if saved["0"].Before != 1520 {
		t.Fatal("stale rating", saved)
	}
	// Concurrent distinct matches sharing users must compose without lost updates.
	copies := make([]Match, 2)
	out := make([]map[string]Rating, 2)
	for i := range copies {
		copies[i] = match
		copies[i].ID = uuid.NewString()
		wg.Go(func() {
			var e error
			out[i], e = store.Save(ctx, copies[i])
			if e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	a, b := out[0]["0"], out[1]["0"]
	if a.After != b.Before && b.After != a.Before {
		t.Fatal("lost update", a, b)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM match_results WHERE (bot OR guest) AND (user_uid IS NOT NULL OR rating_before IS NOT NULL OR rating_after IS NOT NULL)`).Scan(&count); err != nil || count != 0 {
		t.Fatal("guest/bot rated", count, err)
	}
	// Floor is applied to the stored delta, preserving before/after consistency.
	if _, err = pool.Exec(ctx, `UPDATE users SET rating=3 WHERE firebase_uid='alice'`); err != nil {
		t.Fatal(err)
	}
	failure := match
	failure.ID = uuid.NewString()
	failure.Entries = append([]Entry(nil), entries...)
	failure.Entries[0].Outcome = "flying"
	failure.Entries[0].Rank = nil
	failure.Entries[0].ReactionMs = nil
	floor, err := store.Save(ctx, failure)
	if err != nil || floor["0"] != (Rating{3, 0}) {
		t.Fatal(floor, err)
	}
	// More than one page, equal timestamps, and ties retain deterministic ordering.
	if _, err = pool.Exec(ctx, `INSERT INTO users(firebase_uid,display_name) VALUES ('unplayed','No matches'); UPDATE users SET rating=1600 WHERE firebase_uid IN ('alice','bob')`); err != nil {
		t.Fatal(err)
	}
	leaders, err = store.Ranking(ctx, "bob")
	if err != nil || len(leaders) != 2 || leaders[0].Rank != 1 || leaders[1].Rank != 1 || !leaders[1].Self {
		t.Fatal(leaders, err)
	}
	for range 21 {
		copy := match
		copy.ID = uuid.NewString()
		if _, err = store.Save(ctx, copy); err != nil {
			t.Fatal(err)
		}
	}
	first, err := store.History(ctx, "alice", 0)
	if err != nil || len(first.Entries) != 20 || !first.HasMore {
		t.Fatal(first, err)
	}
	second, err := store.History(ctx, "alice", 20)
	if err != nil || len(second.Entries) != 6 || second.HasMore {
		t.Fatal(second, err)
	}
	seen := map[string]bool{}
	for _, e := range append(first.Entries, second.Entries...) {
		if seen[e.MatchID] {
			t.Fatal("duplicate page entry")
		}
		seen[e.MatchID] = true
	}

}
