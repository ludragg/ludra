-- +goose Up
ALTER TABLE messages ADD COLUMN edited_at timestamptz;
ALTER TABLE users ADD COLUMN username_changed_at timestamptz;

-- +goose Down
ALTER TABLE users DROP COLUMN username_changed_at;
ALTER TABLE messages DROP COLUMN edited_at;
