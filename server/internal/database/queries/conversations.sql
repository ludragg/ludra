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

-- name: GetDirectPeer :one
SELECT
    other.user_id,
    EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.user_id = me.user_id AND f.friend_id = other.user_id
    ) AS is_friend
FROM participants me
JOIN participants other ON other.conversation_id = me.conversation_id AND other.user_id <> me.user_id
WHERE me.conversation_id = sqlc.arg(conversation_id) AND me.user_id = sqlc.arg(user_id);

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
    peer.avatar AS peer_avatar,
    EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.user_id = me.user_id AND f.friend_id = peer.id
    ) AS is_friend,
    last.id AS last_message_id,
    last.sender_id AS last_message_sender_id,
    last.content AS last_message_content,
    last.created_at AS last_message_created_at,
    last.kind AS last_message_kind,
    last.call_outcome AS last_message_call_outcome,
    last.call_duration AS last_message_call_duration
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
