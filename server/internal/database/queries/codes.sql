-- name: SaveCode :exec
INSERT INTO verification_codes (user_id, purpose, code_hash, expires_at)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, purpose) DO UPDATE SET
    code_hash = EXCLUDED.code_hash,
    attempts = 0,
    created_at = now(),
    expires_at = EXCLUDED.expires_at;

-- name: GetCode :one
SELECT * FROM verification_codes
WHERE user_id = $1 AND purpose = $2;

-- name: CountCodeAttempt :exec
UPDATE verification_codes SET attempts = attempts + 1
WHERE user_id = $1 AND purpose = $2;

-- name: DeleteCode :exec
DELETE FROM verification_codes
WHERE user_id = $1 AND purpose = $2;
