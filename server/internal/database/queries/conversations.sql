-- name: UpsertDirectConversation :one
INSERT INTO conversations (direct_key)
VALUES (sqlc.arg(direct_key)::text)
ON CONFLICT (direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key
RETURNING id;

-- name: AddParticipant :exec
INSERT INTO participants (conversation_id, user_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: ListParticipantIDs :many
SELECT user_id FROM participants
WHERE conversation_id = $1;

-- name: ListContactIDs :many
SELECT DISTINCT other.user_id
FROM participants me
JOIN participants other ON other.conversation_id = me.conversation_id AND other.user_id <> me.user_id
WHERE me.user_id = $1;

-- name: IsParticipant :one
SELECT EXISTS (
    SELECT 1 FROM participants
    WHERE conversation_id = $1 AND user_id = $2
);

-- name: ListConversations :many
SELECT
    c.id,
    peer.id AS peer_id,
    peer.username AS peer_username,
    last.id AS last_message_id,
    last.sender_id AS last_message_sender_id,
    last.content AS last_message_content,
    last.created_at AS last_message_created_at
FROM participants me
JOIN conversations c ON c.id = me.conversation_id
JOIN participants other ON other.conversation_id = c.id AND other.user_id <> me.user_id
JOIN users peer ON peer.id = other.user_id
LEFT JOIN messages last ON last.id = (
    SELECT m.id FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.id DESC
    LIMIT 1
)
WHERE me.user_id = $1
ORDER BY COALESCE(last.created_at, c.created_at) DESC;
