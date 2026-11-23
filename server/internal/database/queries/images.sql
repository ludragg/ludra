-- name: CreateImageMessage :one
INSERT INTO messages (conversation_id, sender_id, content, kind)
SELECT sqlc.arg(conversation_id)::uuid, sqlc.arg(sender_id)::uuid, '', 'image'
WHERE EXISTS (
    SELECT 1 FROM participants
    WHERE conversation_id = sqlc.arg(conversation_id)::uuid
      AND user_id = sqlc.arg(sender_id)::uuid
)
RETURNING *;

-- name: SaveImage :one
INSERT INTO images (message_id, conversation_id, role, data, mime, width, height, size)
VALUES (sqlc.arg(message_id), sqlc.arg(conversation_id), sqlc.arg(role), sqlc.arg(data)::bytea, sqlc.arg(mime),
        sqlc.arg(width), sqlc.arg(height), octet_length(sqlc.arg(data)::bytea))
ON CONFLICT (message_id, role) DO UPDATE
SET data = EXCLUDED.data, mime = EXCLUDED.mime, width = EXCLUDED.width, height = EXCLUDED.height,
    size = EXCLUDED.size, expired = false
RETURNING id, width, height;

-- name: GetImage :one
SELECT substring(i.data FROM sqlc.arg(start)::int FOR sqlc.arg(length)::int)::bytea AS data,
       octet_length(i.data)::int AS total, i.mime
FROM images i
JOIN participants p ON p.conversation_id = i.conversation_id AND p.user_id = sqlc.arg(user_id)::uuid
WHERE i.id = sqlc.arg(id)::uuid AND NOT i.expired;

-- name: DeletePreviewImage :exec
DELETE FROM images
WHERE message_id = $1 AND role = 'preview';

-- name: SetPreview :one
UPDATE messages
SET preview_url = sqlc.arg(url), preview_site = sqlc.arg(site), preview_title = sqlc.arg(title),
    preview_description = sqlc.arg(description)
WHERE id = sqlc.arg(id) AND kind = 'text' AND strpos(content, sqlc.arg(link)::text) > 0
RETURNING *;

-- name: ClearPreview :one
UPDATE messages
SET preview_url = NULL, preview_site = NULL, preview_title = NULL, preview_description = NULL
WHERE id = $1
RETURNING *;

-- name: CreateFileMessage :one
INSERT INTO messages (conversation_id, sender_id, content, kind, file_name, file_size, file_mime, file_direct)
SELECT sqlc.arg(conversation_id)::uuid, sqlc.arg(sender_id)::uuid, sqlc.arg(content)::text, 'file', sqlc.arg(file_name)::text,
       sqlc.arg(file_size)::bigint, sqlc.arg(file_mime)::text, sqlc.arg(file_direct)::boolean
WHERE EXISTS (
    SELECT 1 FROM participants
    WHERE conversation_id = sqlc.arg(conversation_id)::uuid
      AND user_id = sqlc.arg(sender_id)::uuid
)
RETURNING *;

-- name: AddMessageFile :one
INSERT INTO message_files (message_id, position, name, size, mime)
VALUES (sqlc.arg(message_id)::uuid, sqlc.arg(position)::smallint, sqlc.arg(name)::text, sqlc.arg(size)::bigint, sqlc.arg(mime)::text)
RETURNING *;

-- name: ListMessageFiles :many
SELECT * FROM message_files
WHERE message_id = ANY(sqlc.arg(ids)::uuid[])
ORDER BY message_id, position;

-- name: LockUploads :exec
SELECT pg_advisory_xact_lock(hashtext(sqlc.arg(user_id)::text));

-- name: CountRecentPhotos :one
SELECT count(*)::int
FROM images i
JOIN messages m ON m.id = i.message_id
WHERE m.sender_id = sqlc.arg(user_id)::uuid
  AND i.role = 'photo'
  AND i.created_at > now() - interval '24 hours';

-- name: ExpireImages :execrows
UPDATE images SET data = ''::bytea, expired = true
WHERE NOT expired AND created_at < now() - interval '7 days';

-- name: GetDirectFile :one
SELECT m.sender_id, m.conversation_id
FROM messages m
JOIN participants p ON p.conversation_id = m.conversation_id AND p.user_id = sqlc.arg(user_id)::uuid
WHERE m.id = sqlc.arg(id)::uuid AND m.kind = 'file' AND m.file_direct;
