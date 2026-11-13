-- +goose Up
DELETE FROM conversations;
DELETE FROM users;

ALTER TABLE users
    ADD COLUMN email text NOT NULL,
    ADD COLUMN password_hash text NOT NULL;

CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE sessions (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash   bytea NOT NULL UNIQUE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- +goose Down
DROP TABLE sessions;
DROP INDEX users_email_key;
ALTER TABLE users
    DROP COLUMN email,
    DROP COLUMN password_hash;
