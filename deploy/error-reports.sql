\pset footer off

\echo 'Errors reported by the app in the last 7 days'
SELECT r.level, r.area, r.message,
       sum(r.occurrences) AS times,
       count(DISTINCT r.user_id) AS people,
       string_agg(DISTINCT r.app_version, ', ') AS versions,
       to_char(max(r.occurred_at), 'YYYY-MM-DD HH24:MI') AS last_seen,
       max(r.id) AS example_id
FROM diagnostic_reports r
WHERE r.received_at > now() - interval '7 days'
GROUP BY r.level, r.area, r.message
ORDER BY (r.level = 'crash') DESC, (r.level = 'error') DESC, people DESC, times DESC
LIMIT 50;
