-- +goose Up
ALTER TABLE messages
    ADD COLUMN reply_to uuid,
    ADD COLUMN reply_sender_id uuid,
    ADD COLUMN reply_kind text CHECK (reply_kind IN ('text', 'image', 'file', 'voice')),
    ADD COLUMN reply_excerpt text;

-- +goose Down
ALTER TABLE messages
    DROP COLUMN reply_excerpt,
    DROP COLUMN reply_kind,
    DROP COLUMN reply_sender_id,
    DROP COLUMN reply_to;
