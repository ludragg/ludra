-- name: DeleteUnverifiedUsers :exec
DELETE FROM users
WHERE email_verified_at IS NULL AND created_at < $1;

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions
WHERE expires_at < now();

-- name: DeleteExpiredCodes :exec
DELETE FROM verification_codes
WHERE expires_at < now();
