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

-- name: CreateCallMessage :one
INSERT INTO messages (conversation_id, sender_id, content, kind, call_outcome, call_duration)
VALUES (sqlc.arg(conversation_id), sqlc.arg(sender_id), '', 'call', 'ongoing', 0)
RETURNING *;

-- name: FinishCallMessage :one
UPDATE messages SET call_outcome = sqlc.arg(call_outcome), call_duration = sqlc.arg(call_duration)
WHERE id = sqlc.arg(id) AND kind = 'call'
RETURNING *;

-- name: CloseStaleCalls :exec
UPDATE messages SET call_outcome = 'missed', call_duration = 0
WHERE call_outcome = 'ongoing';
