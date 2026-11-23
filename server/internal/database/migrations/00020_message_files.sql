-- +goose Up
CREATE TABLE message_files (
    message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    position smallint NOT NULL CHECK (position BETWEEN 1 AND 4),
    name text NOT NULL,
    size bigint NOT NULL CHECK (size > 0),
    mime text NOT NULL,
    PRIMARY KEY (message_id, position)
);

-- +goose Down
DROP TABLE message_files;
