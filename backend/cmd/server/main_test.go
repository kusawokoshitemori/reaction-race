package main

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"testing"
	"time"
)

func TestRunHTTPAndShutdown(t *testing.T) {
	t.Setenv("HTTP_ADDR", "127.0.0.1:0")
	ctx, cancel := context.WithCancel(context.Background())
	reader, writer := io.Pipe()
	logger := slog.New(slog.NewJSONHandler(writer, nil))
	addresses := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(reader)
		for scanner.Scan() {
			var entry struct {
				Address string `json:"address"`
			}
			if json.Unmarshal(scanner.Bytes(), &entry) == nil && entry.Address != "" {
				addresses <- entry.Address
			}
		}
	}()
	done := make(chan error, 1)
	go func() { done <- run(ctx, logger) }()
	t.Cleanup(func() { cancel(); reader.Close(); writer.Close() })
	var addr string
	select {
	case addr = <-addresses:
	case err := <-done:
		t.Fatalf("server exited before startup: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("server startup timed out")
	}
	client := &http.Client{Timeout: 3 * time.Second}
	for _, tc := range []struct {
		method, path string
		status       int
	}{
		{"GET", "/healthz", 200}, {"HEAD", "/healthz", 200},
		{"POST", "/healthz", 405}, {"GET", "/missing", 404},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			req, err := http.NewRequest(tc.method, "http://"+addr+tc.path, nil)
			if err != nil {
				t.Fatal(err)
			}
			resp, err := client.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.status {
				t.Fatalf("status = %d, want %d", resp.StatusCode, tc.status)
			}
			if tc.method == "GET" && tc.path == "/healthz" {
				if got := resp.Header.Get("Content-Type"); got != "application/json" {
					t.Errorf("Content-Type = %q", got)
				}
				var body map[string]string
				if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
					t.Fatal(err)
				}
				if body["status"] != "ok" {
					t.Errorf("body = %v", body)
				}
			}
		})
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("shutdown: %v", err)
		}
	case <-time.After(7 * time.Second):
		t.Fatal("shutdown timed out")
	}
}

func TestRunInvalidAddress(t *testing.T) {
	t.Setenv("HTTP_ADDR", "invalid address")
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	if err := run(context.Background(), logger); err == nil {
		t.Fatal("expected a listen error")
	}
}
