-- +goose Up
ALTER TABLE messages
    ADD COLUMN kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'call')),
    ADD COLUMN call_outcome text CHECK (call_outcome IN ('completed', 'declined', 'missed')),
    ADD COLUMN call_duration integer CHECK (call_duration >= 0);

ALTER TABLE messages DROP CONSTRAINT messages_content_check;
ALTER TABLE messages ADD CONSTRAINT messages_content_check
    CHECK (kind <> 'text' OR char_length(content) BETWEEN 1 AND 4000);

-- +goose Down
DELETE FROM messages WHERE kind <> 'text';
ALTER TABLE messages DROP CONSTRAINT messages_content_check;
ALTER TABLE messages ADD CONSTRAINT messages_content_check
    CHECK (char_length(content) BETWEEN 1 AND 4000);
ALTER TABLE messages
    DROP COLUMN call_duration,
    DROP COLUMN call_outcome,
    DROP COLUMN kind;
