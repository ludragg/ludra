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

-- name: SetIdentityKey :exec
UPDATE users SET identity_key = $2
WHERE id = $1;

-- name: ListIdentityKeys :many
SELECT id, identity_key FROM users
WHERE id = ANY(sqlc.arg(user_ids)::uuid[]);

-- name: SetUsername :one
UPDATE users SET username = sqlc.arg(username), username_changed_at = now()
WHERE id = sqlc.arg(id)
  AND (username_changed_at IS NULL OR username_changed_at <= now() - interval '30 days')
RETURNING avatar;

-- name: ListContactIDs :many
SELECT other.user_id FROM participants me
JOIN participants other ON other.conversation_id = me.conversation_id AND other.user_id <> me.user_id
WHERE me.user_id = sqlc.arg(user_id)
UNION
SELECT friend_id FROM friendships WHERE user_id = sqlc.arg(user_id)
UNION
SELECT recipient_id FROM friend_requests WHERE sender_id = sqlc.arg(user_id)
UNION
SELECT sender_id FROM friend_requests WHERE recipient_id = sqlc.arg(user_id);

-- name: ListPresenceIDs :many
SELECT other.user_id FROM participants me
JOIN participants other ON other.conversation_id = me.conversation_id AND other.user_id <> me.user_id
WHERE me.user_id = sqlc.arg(user_id)
UNION
SELECT friend_id FROM friendships WHERE user_id = sqlc.arg(user_id);
