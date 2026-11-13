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
