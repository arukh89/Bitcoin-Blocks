-- Error Logs Table
-- Stores structured error information for monitoring and debugging

CREATE TABLE IF NOT EXISTS error_logs (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('network', 'database', 'authentication', 'validation', 'system', 'user_interface', 'business_logic')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  context JSONB NOT NULL DEFAULT '{}',
  stack TEXT,
  created_at BIGINT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_category ON error_logs(category);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs USING GIN ((context->'userId'));

-- Create a function to automatically clean up old error logs
CREATE OR REPLACE FUNCTION cleanup_old_error_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  days_to_keep INTEGER := 30; -- Keep logs for 30 days
  deleted_count INTEGER;
  cutoff_time BIGINT;
BEGIN
  cutoff_time := EXTRACT(EPOCH FROM NOW() - INTERVAL '1 day' * days_to_keep) * 1000;
  
  DELETE FROM error_logs
  WHERE created_at < cutoff_time;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  IF deleted_count > 0 THEN
    RAISE LOG 'Cleaned up % old error logs', deleted_count;
  END IF;
END;
$$;

-- Row Level Security (RLS)
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Only allow service role to insert errors
CREATE POLICY "Allow service role to insert errors" ON error_logs
  FOR INSERT WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');

-- Only allow admins to read errors (for admin panel)
CREATE POLICY "Allow admins to read errors" ON error_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_fids WHERE fid = current_setting('app.current_fid', true))
  );

-- Grant necessary permissions
GRANT SELECT ON error_logs TO authenticated;
GRANT SELECT ON error_logs TO service_role;
GRANT INSERT ON error_logs TO service_role;