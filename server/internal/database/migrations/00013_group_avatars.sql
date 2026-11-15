-- +goose Up
ALTER TABLE conversations ADD COLUMN avatar text NOT NULL DEFAULT '';

CREATE TABLE group_avatars (
    conversation_id uuid        PRIMARY KEY REFERENCES conversations (id) ON DELETE CASCADE,
    image           bytea       NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE group_avatars;
ALTER TABLE conversations DROP COLUMN avatar;
