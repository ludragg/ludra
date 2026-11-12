-- +goose Up
ALTER TABLE conversations ADD COLUMN direct_key text UNIQUE;

-- +goose Down
ALTER TABLE conversations DROP COLUMN direct_key;
