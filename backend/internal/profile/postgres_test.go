package profile

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Run only against a disposable test database, never a development or production DB.
func TestPostgresIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	sql, err := os.ReadFile("../../migrations/001_users.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, string(sql)); err != nil {
		t.Fatal(err)
	}
	store := Postgres{Pool: pool}
	var wg sync.WaitGroup
	for range 10 {
		wg.Go(func() {
			if name, err := store.GetOrCreate(ctx, "test-alice", "Alice"); err != nil || name != "Alice" {
				t.Errorf("upsert: %q %v", name, err)
			}
		})
	}
	wg.Wait()
	if err := store.Rename(ctx, "test-alice", "新しい名前"); err != nil {
		t.Fatal(err)
	}
	if name, err := store.GetOrCreate(ctx, "test-alice", "Provider name"); err != nil || name != "新しい名前" {
		t.Fatalf("name overwritten: %q %v", name, err)
	}
	if name, err := store.GetOrCreate(ctx, "test-bob", "Bob"); err != nil || name != "Bob" {
		t.Fatalf("other user: %q %v", name, err)
	}
	if err := store.Rename(ctx, "missing-user", "name"); err == nil {
		t.Fatal("missing row succeeded")
	}
	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM users WHERE firebase_uid = 'test-alice'").Scan(&count); err != nil || count != 1 {
		t.Fatalf("duplicate user: %d %v", count, err)
	}
}
