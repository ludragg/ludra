-- +goose Up
ALTER TABLE users ADD COLUMN busy boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE users DROP COLUMN busy;
