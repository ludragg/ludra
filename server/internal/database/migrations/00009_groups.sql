-- +goose Up
ALTER TABLE conversations
    ADD COLUMN kind text NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct', 'group')),
    ADD COLUMN name text CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 50),
    ADD COLUMN owner_id uuid REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE participants ADD COLUMN joined_at timestamptz NOT NULL DEFAULT clock_timestamp();

ALTER TABLE messages DROP CONSTRAINT messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('text', 'call', 'event'));
ALTER TABLE messages
    ADD COLUMN event text CHECK (event IN ('member_added', 'member_removed', 'member_left')),
    ADD COLUMN target_id uuid REFERENCES users (id) ON DELETE SET NULL;

-- +goose Down
DELETE FROM messages WHERE kind = 'event';
ALTER TABLE messages
    DROP COLUMN target_id,
    DROP COLUMN event;
ALTER TABLE messages DROP CONSTRAINT messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('text', 'call'));

DELETE FROM conversations WHERE kind = 'group';
ALTER TABLE participants DROP COLUMN joined_at;
ALTER TABLE conversations
    DROP COLUMN owner_id,
    DROP COLUMN name,
    DROP COLUMN kind;
