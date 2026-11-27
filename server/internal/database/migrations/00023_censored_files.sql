-- +goose Up
ALTER TABLE messages ADD COLUMN file_censored boolean NOT NULL DEFAULT false;
ALTER TABLE message_files ADD COLUMN censored boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE message_files DROP COLUMN censored;
ALTER TABLE messages DROP COLUMN file_censored;
