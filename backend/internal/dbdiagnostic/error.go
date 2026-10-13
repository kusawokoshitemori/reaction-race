// Package dbdiagnostic preserves error chains without logging connection strings
// or PostgreSQL messages that can contain user-supplied values.
package dbdiagnostic

import (
	"context"
	"errors"
	"fmt"
	"net"
	"syscall"

	"github.com/jackc/pgx/v5/pgconn"
)

type safeError struct{ cause error }

func (e safeError) Unwrap() error { return e.cause }
func (e safeError) Error() string {
	var config *pgconn.ParseConfigError
	var pg *pgconn.PgError
	var dns *net.DNSError
	switch {
	case errors.As(e.cause, &config):
		return "invalid database configuration"
	case errors.As(e.cause, &pg):
		// SQLSTATE is a five-character code; never include Message or Detail.
		if len(pg.Code) == 5 {
			valid := true
			for _, c := range pg.Code {
				if !(c >= '0' && c <= '9' || c >= 'A' && c <= 'Z') {
					valid = false
				}
			}
			if valid {
				return "postgres SQLSTATE " + pg.Code
			}
		}
		return "postgres error"
	case errors.Is(e.cause, context.DeadlineExceeded):
		return "database timeout"
	case errors.Is(e.cause, context.Canceled):
		return "database operation canceled"
	case errors.As(e.cause, &dns):
		return "database DNS error"
	case errors.Is(e.cause, syscall.ECONNREFUSED):
		return "database connection refused"
	default:
		return fmt.Sprintf("database error (%T)", e.cause)
	}
}

// Safe retains the original cause for errors.Is/As while exposing only diagnostics
// safe for logs. Even pgx cannot fully redact malformed connection strings.
func Safe(err error) error {
	if err == nil {
		return nil
	}
	return safeError{cause: err}
}
