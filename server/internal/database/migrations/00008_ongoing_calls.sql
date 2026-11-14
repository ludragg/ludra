-- +goose Up
ALTER TABLE messages DROP CONSTRAINT messages_call_outcome_check;
ALTER TABLE messages ADD CONSTRAINT messages_call_outcome_check
    CHECK (call_outcome IN ('ongoing', 'completed', 'declined', 'missed'));

-- +goose Down
UPDATE messages SET call_outcome = 'missed' WHERE call_outcome = 'ongoing';
ALTER TABLE messages DROP CONSTRAINT messages_call_outcome_check;
ALTER TABLE messages ADD CONSTRAINT messages_call_outcome_check
    CHECK (call_outcome IN ('completed', 'declined', 'missed'));
