-- name: CreateSession :one
INSERT INTO sessions (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
RETURNING id;

-- name: GetSession :one
SELECT
    s.id AS session_id,
    u.id,
    u.username,
    u.email,
    u.avatar,
    u.invisible,
    u.busy,
    u.two_factor,
    u.username_changed_at
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token_hash = $1 AND s.expires_at > now();

-- name: ExtendSession :exec
UPDATE sessions SET expires_at = $2
WHERE id = $1;

-- name: DeleteSession :exec
DELETE FROM sessions
WHERE id = $1;

-- name: DeleteUserSessions :exec
DELETE FROM sessions
WHERE user_id = $1;

-- name: DeleteOtherSessions :exec
DELETE FROM sessions
WHERE user_id = $1 AND id <> $2;
