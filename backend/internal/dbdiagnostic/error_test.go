package dbdiagnostic

import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5/pgconn"
	"net"
	"strings"
	"syscall"
	"testing"
)

func TestSafe(t *testing.T) {
	for _, tc := range []struct {
		cause error
		want  string
	}{
		{&pgconn.ParseConfigError{ConnString: "postgres://secret"}, "invalid database configuration"},
		{&pgconn.PgError{Code: "28P01", Message: "secret", Detail: "secret"}, "postgres SQLSTATE 28P01"},
		{&pgconn.PgError{Code: "secret", Message: "secret"}, "postgres error"},
		{context.DeadlineExceeded, "database timeout"},
		{context.Canceled, "database operation canceled"},
		{&net.DNSError{Name: "secret", Err: "secret"}, "database DNS error"},
		{fmt.Errorf("secret: %w", syscall.ECONNREFUSED), "database connection refused"},
		{errors.New("secret"), "database error (*errors.errorString)"},
	} {
		t.Run(tc.want, func(t *testing.T) {
			err := fmt.Errorf("connect database: %w", Safe(tc.cause))
			if strings.Contains(err.Error(), "secret") || err.Error() != "connect database: "+tc.want {
				t.Fatal(err)
			}
			if !errors.Is(err, tc.cause) {
				t.Fatal("lost cause")
			}
			var original *pgconn.PgError
			if _, ok := tc.cause.(*pgconn.PgError); ok && !errors.As(err, &original) {
				t.Fatal("lost SQL error")
			}
		})
	}
}
