-- name: UpsertUser :one
INSERT INTO users (username)
VALUES ($1)
ON CONFLICT ((lower(username))) DO UPDATE SET username = users.username
RETURNING *;

-- name: GetUserByUsername :one
SELECT * FROM users
WHERE lower(username) = lower($1);
