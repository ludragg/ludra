-- name: InsertDiagnosticReport :exec
INSERT INTO diagnostic_reports (user_id, occurred_at, level, area, message, detail, occurrences, app_version, system)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: CountRecentDiagnosticReports :one
SELECT count(*) FROM diagnostic_reports
WHERE user_id = $1 AND received_at > $2;

-- name: DeleteOldDiagnosticReports :exec
DELETE FROM diagnostic_reports
WHERE received_at < $1;
