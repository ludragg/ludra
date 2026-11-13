-- +goose Up
ALTER TABLE users
    ADD COLUMN avatar text NOT NULL DEFAULT '',
    ADD COLUMN two_factor boolean NOT NULL DEFAULT false;

CREATE TABLE avatars (
    user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    image      bytea NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE verification_codes DROP CONSTRAINT verification_codes_purpose_check;
ALTER TABLE verification_codes ADD CONSTRAINT verification_codes_purpose_check
    CHECK (purpose IN ('verify_email', 'reset_password', 'two_factor'));

-- +goose Down
DELETE FROM verification_codes WHERE purpose = 'two_factor';
ALTER TABLE verification_codes DROP CONSTRAINT verification_codes_purpose_check;
ALTER TABLE verification_codes ADD CONSTRAINT verification_codes_purpose_check
    CHECK (purpose IN ('verify_email', 'reset_password'));

DROP TABLE avatars;
ALTER TABLE users
    DROP COLUMN avatar,
    DROP COLUMN two_factor;
