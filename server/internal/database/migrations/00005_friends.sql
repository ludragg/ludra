-- +goose Up
ALTER TABLE users ADD COLUMN invisible boolean NOT NULL DEFAULT false;

CREATE TABLE friendships (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    friend_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, friend_id),
    CHECK (user_id <> friend_id)
);

CREATE TABLE friend_requests (
    sender_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    recipient_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (sender_id, recipient_id),
    CHECK (sender_id <> recipient_id)
);

CREATE INDEX friend_requests_recipient_id_idx ON friend_requests (recipient_id);

-- +goose Down
DROP TABLE friend_requests;
DROP TABLE friendships;
ALTER TABLE users DROP COLUMN invisible;
