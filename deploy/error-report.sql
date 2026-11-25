\pset footer off
\x on

SELECT r.id, u.username, r.level, r.area, r.message, r.occurrences, r.app_version, r.system,
       r.occurred_at, r.detail
FROM diagnostic_reports r
JOIN users u ON u.id = r.user_id
WHERE r.id = :id;
