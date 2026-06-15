-- Default redaction policy for known sensitive attribute keys.
-- These are exported to the Collector pipeline; Ophir owns the policy metadata.
INSERT INTO redaction_rules (name, match_path, action)
SELECT v.name, v.match_path, v.action
FROM (
  VALUES
    ('authorization-header', 'authorization', 'drop'),
    ('cookie-header', 'cookie', 'drop'),
    ('set-cookie-header', 'set-cookie', 'drop'),
    ('password-field', 'password', 'drop'),
    ('secret-field', 'secret', 'drop'),
    ('token-field', 'token', 'mask'),
    ('api-key-field', 'api_key', 'mask'),
    ('credit-card-field', 'credit_card', 'drop')
) AS v (name, match_path, action)
WHERE NOT EXISTS (
  SELECT 1 FROM redaction_rules r WHERE r.match_path = v.match_path
);
