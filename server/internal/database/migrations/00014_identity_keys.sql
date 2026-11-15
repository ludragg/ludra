-- +goose Up
ALTER TABLE users ADD COLUMN identity_key text NOT NULL DEFAULT ''
    CHECK (char_length(identity_key) <= 200);

-- +goose Down
ALTER TABLE users DROP COLUMN identity_key;
