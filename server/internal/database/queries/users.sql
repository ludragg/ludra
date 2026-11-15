-- name: CreateUser :one
INSERT INTO users (username, email, password_hash)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByLogin :one
SELECT * FROM users
WHERE lower(username) = lower(sqlc.arg(login)) OR lower(email) = lower(sqlc.arg(login));

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE lower(email) = lower($1);

-- name: GetVerifiedUserByUsername :one
SELECT * FROM users
WHERE lower(username) = lower($1) AND email_verified_at IS NOT NULL;

-- name: MarkEmailVerified :exec
UPDATE users SET email_verified_at = now()
WHERE id = $1 AND email_verified_at IS NULL;

-- name: UpdatePassword :exec
UPDATE users SET password_hash = $2
WHERE id = $1;

-- name: GetUser :one
SELECT * FROM users
WHERE id = $1;

-- name: SetStatus :exec
UPDATE users SET invisible = $2, busy = $3
WHERE id = $1;

-- name: SetAvatar :exec
UPDATE users SET avatar = $2
WHERE id = $1;

-- name: SetTwoFactor :exec
UPDATE users SET two_factor = $2
WHERE id = $1;
