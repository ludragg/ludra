-- name: SaveAvatar :exec
INSERT INTO avatars (user_id, image)
VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE SET
    image = EXCLUDED.image,
    updated_at = now();

-- name: GetAvatar :one
SELECT image FROM avatars
WHERE user_id = $1;

-- name: DeleteAvatar :exec
DELETE FROM avatars
WHERE user_id = $1;

-- name: SaveGroupAvatar :exec
INSERT INTO group_avatars (conversation_id, image)
VALUES ($1, $2)
ON CONFLICT (conversation_id) DO UPDATE SET
    image = EXCLUDED.image,
    updated_at = now();

-- name: GetGroupAvatar :one
SELECT image FROM group_avatars
WHERE conversation_id = $1;

-- name: DeleteGroupAvatar :exec
DELETE FROM group_avatars
WHERE conversation_id = $1;

-- name: SetGroupAvatar :exec
UPDATE conversations SET avatar = $2
WHERE id = $1;
