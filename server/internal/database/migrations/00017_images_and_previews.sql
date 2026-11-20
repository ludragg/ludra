-- +goose Up
ALTER TABLE messages DROP CONSTRAINT messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('text', 'call', 'event', 'image'));
ALTER TABLE messages
    ADD COLUMN preview_url         text,
    ADD COLUMN preview_site        text,
    ADD COLUMN preview_title       text,
    ADD COLUMN preview_description text;

CREATE TABLE images (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    message_id      uuid        NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    conversation_id uuid        NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    role            text        NOT NULL CHECK (role IN ('photo', 'preview')),
    data            bytea       NOT NULL,
    mime            text        NOT NULL,
    width           int         NOT NULL,
    height          int         NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (message_id, role)
);

-- +goose Down
DROP TABLE images;
ALTER TABLE messages
    DROP COLUMN preview_description,
    DROP COLUMN preview_title,
    DROP COLUMN preview_site,
    DROP COLUMN preview_url;
DELETE FROM messages WHERE kind = 'image';
ALTER TABLE messages DROP CONSTRAINT messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('text', 'call', 'event'));
