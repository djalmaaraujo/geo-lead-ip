-- Rate limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  api_key TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  timestamp INTEGER NOT NULL,
  rate_limit INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- Create index for timestamp lookups (helps with cleanup performance)
CREATE INDEX IF NOT EXISTS idx_rate_limits_timestamp 
ON rate_limits(timestamp);

-- Create index for combined api_key and timestamp lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_api_timestamp 
ON rate_limits(api_key, timestamp);

-- Create index for name lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_name 
ON rate_limits(name);

-- Optional: Add some test API keys (comment out for production)
-- INSERT INTO rate_limits (api_key, count, timestamp) 
-- VALUES ('test123', 0, strftime('%s','now') * 1000); 