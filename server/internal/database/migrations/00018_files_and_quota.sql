-- +goose Up
ALTER TABLE messages DROP CONSTRAINT messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('text', 'call', 'event', 'image', 'file'));
ALTER TABLE messages
    ADD COLUMN file_name   text,
    ADD COLUMN file_size   bigint,
    ADD COLUMN file_mime   text,
    ADD COLUMN file_direct boolean NOT NULL DEFAULT false;

ALTER TABLE images DROP CONSTRAINT images_role_check;
ALTER TABLE images ADD CONSTRAINT images_role_check CHECK (role IN ('photo', 'preview', 'file'));
ALTER TABLE images
    ADD COLUMN size    int     NOT NULL DEFAULT 0,
    ADD COLUMN expired boolean NOT NULL DEFAULT false;
UPDATE images SET size = octet_length(data);
CREATE INDEX images_live_created_at_idx ON images (created_at) WHERE NOT expired;

-- +goose Down
DROP INDEX images_live_created_at_idx;
ALTER TABLE images DROP COLUMN expired, DROP COLUMN size;
DELETE FROM images WHERE role = 'file';
ALTER TABLE images DROP CONSTRAINT images_role_check;
ALTER TABLE images ADD CONSTRAINT images_role_check CHECK (role IN ('photo', 'preview'));
DELETE FROM messages WHERE kind = 'file';
ALTER TABLE messages
    DROP COLUMN file_direct,
    DROP COLUMN file_mime,
    DROP COLUMN file_size,
    DROP COLUMN file_name;
ALTER TABLE messages DROP CONSTRAINT messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('text', 'call', 'event', 'image'));
