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
SELECT sqlc.embed(m), sender.username AS sender_name, target.username AS target_name
FROM messages m
JOIN users sender ON sender.id = m.sender_id
LEFT JOIN users target ON target.id = m.target_id
WHERE m.conversation_id = sqlc.arg(conversation_id)::uuid
  AND (sqlc.narg(before_id)::uuid IS NULL OR m.id < sqlc.narg(before_id)::uuid)
ORDER BY m.id DESC
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

-- name: CreateEventMessage :one
INSERT INTO messages (conversation_id, sender_id, content, kind, event, target_id)
VALUES (sqlc.arg(conversation_id), sqlc.arg(sender_id), '', 'event', sqlc.arg(event), sqlc.arg(target_id))
RETURNING *;
