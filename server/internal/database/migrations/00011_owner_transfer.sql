-- +goose Up
ALTER TABLE messages DROP CONSTRAINT messages_event_check;
ALTER TABLE messages ADD CONSTRAINT messages_event_check
    CHECK (event IN ('member_added', 'member_removed', 'member_left', 'owner_changed'));

-- +goose Down
DELETE FROM messages WHERE event = 'owner_changed';
ALTER TABLE messages DROP CONSTRAINT messages_event_check;
ALTER TABLE messages ADD CONSTRAINT messages_event_check
    CHECK (event IN ('member_added', 'member_removed', 'member_left'));
