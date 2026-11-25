package realtime

import (
	"context"
	"time"

	"ludra/internal/diagnostics"
	"ludra/internal/protocol"
)

var diagnosticLevels = map[protocol.DiagnosticLevel]string{
	protocol.DiagnosticLevel_DIAGNOSTIC_LEVEL_WARNING: "warning",
	protocol.DiagnosticLevel_DIAGNOSTIC_LEVEL_ERROR:   "error",
	protocol.DiagnosticLevel_DIAGNOSTIC_LEVEL_CRASH:   "crash",
}

func (s *session) reportDiagnostics(ctx context.Context, req *protocol.ReportDiagnostics) *protocol.ServerFrame {
	reports := make([]diagnostics.Report, 0, len(req.Reports))
	for _, report := range req.Reports {
		reports = append(reports, diagnostics.Report{
			OccurredAt:  time.UnixMilli(report.OccurredAtMs),
			Level:       diagnosticLevels[report.Level],
			Area:        report.Area,
			Message:     report.Message,
			Detail:      report.Detail,
			Occurrences: report.Occurrences,
			AppVersion:  report.AppVersion,
		})
	}
	if err := s.diagnostics.Save(ctx, s.user.Id, req.System, reports); err != nil {
		return failed(err)
	}
	return ackFrame()
}
