-- PostgreSQL-specific functions for setting user context for Row Level Security
-- NOTE: This file contains PostgreSQL-specific syntax that should only be executed in a PostgreSQL environment (Supabase)
-- It will cause parsing errors in SQL Server/T-SQL parsers

-- Function to set configuration variable
CREATE OR REPLACE FUNCTION set_app_config(key text, value text)
RETURNS void AS $$
BEGIN
  PERFORM set_config(key, value, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset configuration
CREATE OR REPLACE FUNCTION reset_config()
RETURNS void AS $$
BEGIN
  -- Reset user context
  PERFORM set_config('app.current_fid', '', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION set_app_config(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_config() TO authenticated;
GRANT EXECUTE ON FUNCTION set_app_config(text, text) TO anon;
GRANT EXECUTE ON FUNCTION reset_config() TO anon;