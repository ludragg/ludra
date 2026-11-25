package diagnostics

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"

	"ludra/internal/database"
	"ludra/internal/failure"
)

const (
	MaxBatch      = 20
	dailyLimit    = 200
	retention     = 30 * 24 * time.Hour
	clockSkew     = 24 * time.Hour
	areaLimit     = 40
	messageLimit  = 600
	detailLimit   = 8000
	versionLimit  = 32
	systemLimit   = 300
	maxOccurrence = 10_000
)

var levels = map[string]bool{"warning": true, "error": true, "crash": true}

var errTooMany = failure.New(failure.Invalid, "too many reports in one request")

type Report struct {
	OccurredAt  time.Time
	Level       string
	Area        string
	Message     string
	Detail      string
	Occurrences uint32
	AppVersion  string
}

type Service struct {
	queries *database.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{queries: database.New(pool)}
}

func (s *Service) Save(ctx context.Context, userID, system string, reports []Report) error {
	if len(reports) > MaxBatch {
		return errTooMany
	}
	now := time.Now()
	recent, err := s.queries.CountRecentDiagnosticReports(ctx, database.CountRecentDiagnosticReportsParams{
		UserID:     userID,
		ReceivedAt: now.Add(-24 * time.Hour),
	})
	if err != nil {
		return err
	}
	room := dailyLimit - int(recent)

	for _, report := range reports {
		message := clean(report.Message, messageLimit)
		if room <= 0 {
			break
		}
		if !levels[report.Level] || message == "" {
			continue
		}
		occurred := report.OccurredAt
		if occurred.Before(now.Add(-retention)) || occurred.After(now.Add(clockSkew)) {
			occurred = now
		}
		err := s.queries.InsertDiagnosticReport(ctx, database.InsertDiagnosticReportParams{
			UserID:      userID,
			OccurredAt:  occurred,
			Level:       report.Level,
			Area:        clean(report.Area, areaLimit),
			Message:     message,
			Detail:      clean(report.Detail, detailLimit),
			Occurrences: int32(min(max(report.Occurrences, 1), maxOccurrence)),
			AppVersion:  clean(report.AppVersion, versionLimit),
			System:      clean(system, systemLimit),
		})
		if err != nil {
			return err
		}
		room--
	}
	return nil
}

func (s *Service) Cleanup(ctx context.Context) error {
	return s.queries.DeleteOldDiagnosticReports(ctx, time.Now().Add(-retention))
}

func clean(value string, limit int) string {
	value = strings.ReplaceAll(value, "\x00", "")
	if len(value) <= limit {
		return value
	}
	cut := limit
	for cut > 0 && !utf8.RuneStart(value[cut]) {
		cut--
	}
	return value[:cut]
}
