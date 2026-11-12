-- name: CreateMessage :one
INSERT INTO messages (conversation_id, sender_id, content)
SELECT sqlc.arg(conversation_id)::uuid, sqlc.arg(sender_id)::uuid, sqlc.arg(content)::text
WHERE EXISTS (
    SELECT 1 FROM participants
    WHERE conversation_id = sqlc.arg(conversation_id)::uuid
      AND user_id = sqlc.arg(sender_id)::uuid
)
RETURNING *;

-- name: ListMessages :many
SELECT * FROM messages
WHERE conversation_id = sqlc.arg(conversation_id)::uuid
  AND (sqlc.narg(before_id)::uuid IS NULL OR id < sqlc.narg(before_id)::uuid)
ORDER BY id DESC
LIMIT sqlc.arg(row_limit)::int;
