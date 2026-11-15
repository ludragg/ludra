-- name: ListFriends :many
SELECT u.id, u.username, u.avatar, 'accepted'::text AS state
FROM friendships f
JOIN users u ON u.id = f.friend_id
WHERE f.user_id = sqlc.arg(user_id)
UNION ALL
SELECT u.id, u.username, u.avatar, 'incoming'::text
FROM friend_requests r
JOIN users u ON u.id = r.sender_id
WHERE r.recipient_id = sqlc.arg(user_id)
UNION ALL
SELECT u.id, u.username, u.avatar, 'outgoing'::text
FROM friend_requests r
JOIN users u ON u.id = r.recipient_id
WHERE r.sender_id = sqlc.arg(user_id)
ORDER BY username;

-- name: LockFriendPair :exec
SELECT pg_advisory_xact_lock(hashtextextended(sqlc.arg(pair_key)::text, 0));

-- name: GetFriend :one
SELECT u.id, u.username, u.avatar
FROM friendships f
JOIN users u ON u.id = f.friend_id
WHERE f.user_id = $1 AND f.friend_id = $2;

-- name: ListFriendIDs :many
SELECT friend_id FROM friendships
WHERE user_id = $1;

-- name: AreFriends :one
SELECT EXISTS (
    SELECT 1 FROM friendships
    WHERE user_id = $1 AND friend_id = $2
);

-- name: HasFriendRequest :one
SELECT EXISTS (
    SELECT 1 FROM friend_requests
    WHERE sender_id = $1 AND recipient_id = $2
);

-- name: CreateFriendRequest :exec
INSERT INTO friend_requests (sender_id, recipient_id)
VALUES ($1, $2);

-- name: DeleteFriendRequest :execrows
DELETE FROM friend_requests
WHERE sender_id = $1 AND recipient_id = $2;

-- name: CreateFriendship :exec
INSERT INTO friendships (user_id, friend_id)
VALUES (sqlc.arg(user_id), sqlc.arg(friend_id)), (sqlc.arg(friend_id), sqlc.arg(user_id))
ON CONFLICT DO NOTHING;

-- name: DeleteRelationship :one
WITH removed_friendships AS (
    DELETE FROM friendships
    WHERE (user_id = sqlc.arg(user_id) AND friend_id = sqlc.arg(other_id))
       OR (user_id = sqlc.arg(other_id) AND friend_id = sqlc.arg(user_id))
    RETURNING 1
), removed_requests AS (
    DELETE FROM friend_requests
    WHERE (sender_id = sqlc.arg(user_id) AND recipient_id = sqlc.arg(other_id))
       OR (sender_id = sqlc.arg(other_id) AND recipient_id = sqlc.arg(user_id))
    RETURNING 1
)
SELECT (SELECT count(*) FROM removed_friendships) + (SELECT count(*) FROM removed_requests);

-- name: CreateBlock :exec
INSERT INTO blocks (user_id, blocked_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: DeleteBlock :execrows
DELETE FROM blocks
WHERE user_id = $1 AND blocked_id = $2;

-- name: ListBlocked :many
SELECT u.id, u.username, u.avatar
FROM blocks b
JOIN users u ON u.id = b.blocked_id
WHERE b.user_id = $1
ORDER BY u.username;

-- name: IsBlockedEither :one
SELECT EXISTS (
    SELECT 1 FROM blocks
    WHERE (user_id = sqlc.arg(user_id) AND blocked_id = sqlc.arg(other_id))
       OR (user_id = sqlc.arg(other_id) AND blocked_id = sqlc.arg(user_id))
);
