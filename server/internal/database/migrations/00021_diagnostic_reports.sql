-- +goose Up
CREATE TABLE diagnostic_reports (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    received_at timestamptz NOT NULL DEFAULT now(),
    occurred_at timestamptz NOT NULL,
    level text NOT NULL CHECK (level IN ('warning', 'error', 'crash')),
    area text NOT NULL,
    message text NOT NULL,
    detail text NOT NULL,
    occurrences integer NOT NULL CHECK (occurrences > 0),
    app_version text NOT NULL,
    system text NOT NULL
);

CREATE INDEX diagnostic_reports_received ON diagnostic_reports (received_at);
CREATE INDEX diagnostic_reports_user ON diagnostic_reports (user_id, received_at);

-- +goose Down
DROP TABLE diagnostic_reports;
