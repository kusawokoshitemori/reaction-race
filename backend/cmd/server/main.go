package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	firebase "firebase.google.com/go/v4"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/identity"
	"github.com/kusawokoshitemori/reaction-race/backend/internal/profile"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, logger); err != nil {
		logger.Error("server failed", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, logger *slog.Logger) error {
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
	}

	mux := http.NewServeMux()
	projectID, databaseURL := os.Getenv("FIREBASE_PROJECT_ID"), os.Getenv("DATABASE_URL")
	if projectID != "" && databaseURL != "" {
		app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID})
		if err != nil {
			return fmt.Errorf("initialize Firebase: %w", err)
		}
		authClient, err := app.Auth(ctx)
		if err != nil {
			return fmt.Errorf("initialize authentication: %w", err)
		}
		pool, err := pgxpool.New(ctx, databaseURL)
		if err != nil {
			return errors.New("invalid database configuration")
		}
		defer pool.Close()
		pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err = pool.Ping(pingCtx)
		cancel()
		if err != nil {
			return errors.New("database connection failed")
		}
		api := http.NewServeMux()
		tickets := identity.NewTickets()
		api.HandleFunc("POST /api/ws-ticket", tickets.Issue)
		api.Handle("/", profile.Handler(profile.Postgres{Pool: pool}, logger))
		mux.Handle("/api/", identity.Middleware(authClient, api))
	} else {
		logger.Warn("authentication disabled: FIREBASE_PROJECT_ID and DATABASE_URL are required")
		mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "authentication not configured", http.StatusServiceUnavailable)
		})
	}
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{\"status\":\"ok\"}\n"))
	})

	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	logger.Info("server started", "address", listener.Addr().String())

	serveErr := make(chan error, 1)
	go func() {
		serveErr <- server.Serve(listener)
	}()

	select {
	case err := <-serveErr:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		logger.Info("server stopping")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			_ = server.Close()
			return err
		}
		if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	}
	logger.Info("server stopped")
	return nil
}
