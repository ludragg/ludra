-- +goose Up
ALTER TABLE messages DROP CONSTRAINT messages_event_check;
ALTER TABLE messages ADD CONSTRAINT messages_event_check
    CHECK (event IN ('member_added', 'member_removed', 'member_left', 'owner_changed',
                     'group_renamed', 'photo_changed', 'photo_removed'));

-- +goose Down
DELETE FROM messages WHERE event IN ('group_renamed', 'photo_changed', 'photo_removed');
ALTER TABLE messages DROP CONSTRAINT messages_event_check;
ALTER TABLE messages ADD CONSTRAINT messages_event_check
    CHECK (event IN ('member_added', 'member_removed', 'member_left', 'owner_changed'));
