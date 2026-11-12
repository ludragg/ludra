-- +goose Up
CREATE TABLE users (
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    username   text NOT NULL CHECK (username ~ '^[a-zA-Z0-9_.]{3,32}$'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_username_key ON users (lower(username));

CREATE TABLE conversations (
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE participants (
    conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX participants_user_id_idx ON participants (user_id);

CREATE TABLE messages (
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    sender_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    content         text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_id_idx ON messages (conversation_id, id DESC);

-- +goose Down
DROP TABLE messages;
DROP TABLE participants;
DROP TABLE conversations;
DROP TABLE users;
