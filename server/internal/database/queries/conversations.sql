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
    last.call_duration AS last_message_call_duration,
    last.event AS last_message_event,
    last.target_id AS last_message_target_id
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
WHERE me.user_id = $1 AND c.kind = 'direct'
ORDER BY COALESCE(last.created_at, c.created_at) DESC;

-- name: ListGroups :many
SELECT
    c.id,
    c.name,
    c.owner_id,
    c.avatar,
    last.id AS last_message_id,
    last.sender_id AS last_message_sender_id,
    last.content AS last_message_content,
    last.created_at AS last_message_created_at,
    last.kind AS last_message_kind,
    last.call_outcome AS last_message_call_outcome,
    last.call_duration AS last_message_call_duration,
    last.event AS last_message_event,
    last.target_id AS last_message_target_id,
    last_sender.username AS last_message_sender_name,
    last_target.username AS last_message_target_name
FROM participants me
JOIN conversations c ON c.id = me.conversation_id
LEFT JOIN messages last ON last.id = (
    SELECT m.id FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.id DESC
    LIMIT 1
)
LEFT JOIN users last_sender ON last_sender.id = last.sender_id
LEFT JOIN users last_target ON last_target.id = last.target_id
WHERE me.user_id = $1 AND c.kind = 'group'
ORDER BY COALESCE(last.created_at, c.created_at) DESC;

-- name: ListGroupMembers :many
SELECT p.conversation_id, u.id, u.username, u.avatar
FROM participants p
JOIN users u ON u.id = p.user_id
WHERE p.conversation_id = ANY(sqlc.arg(conversation_ids)::uuid[])
ORDER BY p.joined_at, u.id;

-- name: CreateGroup :one
INSERT INTO conversations (kind, name, owner_id)
VALUES ('group', sqlc.arg(name), sqlc.arg(owner_id))
RETURNING id;

-- name: GetConversation :one
SELECT id, kind, name, owner_id, avatar FROM conversations
WHERE id = $1;

-- name: LockConversation :one
SELECT owner_id FROM conversations
WHERE id = $1
FOR UPDATE;

-- name: CountParticipants :one
SELECT count(*) FROM participants
WHERE conversation_id = $1;

-- name: RemoveParticipant :execrows
DELETE FROM participants
WHERE conversation_id = $1 AND user_id = $2;

-- name: OldestParticipant :one
SELECT user_id FROM participants
WHERE conversation_id = $1
ORDER BY joined_at, user_id
LIMIT 1;

-- name: SetGroupName :exec
UPDATE conversations SET name = $2
WHERE id = $1;

-- name: SetOwner :exec
UPDATE conversations SET owner_id = $2
WHERE id = $1;

-- name: DeleteConversation :exec
DELETE FROM conversations
WHERE id = $1;
