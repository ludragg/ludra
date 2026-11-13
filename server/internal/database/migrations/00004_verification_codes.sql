-- +goose Up
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

CREATE TABLE verification_codes (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose    text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    code_hash  bytea NOT NULL,
    attempts   integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, purpose)
);

-- +goose Down
DROP TABLE verification_codes;
ALTER TABLE users DROP COLUMN email_verified_at;
