-- name: CreateMessage :one
INSERT INTO messages (conversation_id, sender_id, content, reply_to, reply_sender_id, reply_kind, reply_excerpt)
SELECT sqlc.arg(conversation_id)::uuid, sqlc.arg(sender_id)::uuid, sqlc.arg(content)::text,
       sqlc.narg(reply_to)::uuid, sqlc.narg(reply_sender_id)::uuid, sqlc.narg(reply_kind)::text, sqlc.narg(reply_excerpt)::text
WHERE EXISTS (
    SELECT 1 FROM participants
    WHERE conversation_id = sqlc.arg(conversation_id)::uuid
      AND user_id = sqlc.arg(sender_id)::uuid
)
RETURNING *;

-- name: ListMessages :many
SELECT sqlc.embed(m), sender.username AS sender_name, target.username AS target_name,
       photo.id AS photo_id, photo.width AS photo_width, photo.height AS photo_height, photo.expired AS photo_expired,
       thumb.id AS thumb_id, thumb.width AS thumb_width, thumb.height AS thumb_height,
       stored.id AS stored_id, stored.expired AS stored_expired
FROM messages m
JOIN users sender ON sender.id = m.sender_id
LEFT JOIN users target ON target.id = m.target_id
LEFT JOIN images photo ON photo.message_id = m.id AND photo.role = 'photo'
LEFT JOIN images thumb ON thumb.message_id = m.id AND thumb.role = 'preview' AND NOT thumb.expired
LEFT JOIN images stored ON stored.message_id = m.id AND stored.role = 'file'
WHERE m.conversation_id = sqlc.arg(conversation_id)::uuid
  AND (sqlc.narg(before_id)::uuid IS NULL OR m.id < sqlc.narg(before_id)::uuid)
ORDER BY m.id DESC
LIMIT sqlc.arg(row_limit)::int;

-- name: SetMessageReply :one
UPDATE messages SET
    reply_to = sqlc.arg(reply_to)::uuid,
    reply_sender_id = sqlc.arg(reply_sender_id)::uuid,
    reply_kind = sqlc.arg(reply_kind)::text,
    reply_excerpt = sqlc.arg(reply_excerpt)::text
WHERE id = sqlc.arg(id)::uuid
RETURNING *;

-- name: GetReplyTarget :one
SELECT id, conversation_id, sender_id, kind, content, file_mime
FROM messages
WHERE id = sqlc.arg(id)::uuid;

-- name: CreateCallMessage :one
INSERT INTO messages (conversation_id, sender_id, content, kind, call_outcome, call_duration)
VALUES (sqlc.arg(conversation_id), sqlc.arg(sender_id), '', 'call', 'ongoing', 0)
RETURNING *;

-- name: FinishCallMessage :one
UPDATE messages SET call_outcome = sqlc.arg(call_outcome), call_duration = sqlc.arg(call_duration)
WHERE id = sqlc.arg(id) AND kind = 'call'
RETURNING *;

-- name: CloseStaleCalls :exec
UPDATE messages SET
    call_outcome = CASE WHEN conversations.kind = 'group' THEN 'completed' ELSE 'missed' END,
    call_duration = CASE
        WHEN conversations.kind = 'group' THEN GREATEST(0, EXTRACT(EPOCH FROM now() - messages.created_at))::int
        ELSE 0
    END
FROM conversations
WHERE conversations.id = messages.conversation_id AND messages.call_outcome = 'ongoing';

-- name: CreateEventMessage :one
INSERT INTO messages (conversation_id, sender_id, content, kind, event, target_id)
VALUES (sqlc.arg(conversation_id), sqlc.arg(sender_id), sqlc.arg(content), 'event', sqlc.arg(event), sqlc.narg(target_id))
RETURNING *;

-- name: GetMessageTarget :one
SELECT m.id, m.conversation_id, m.sender_id, m.kind, c.kind AS conversation_kind, c.owner_id
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE m.id = $1;

-- name: EditMessage :one
UPDATE messages SET content = sqlc.arg(content), edited_at = now(),
    preview_url = NULL, preview_site = NULL, preview_title = NULL, preview_description = NULL
WHERE id = sqlc.arg(id) AND kind = 'text'
RETURNING *;

-- name: DeleteMessage :exec
DELETE FROM messages
WHERE id = $1;
