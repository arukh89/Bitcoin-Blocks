-- Migration for missing RPC functions needed by frontend
-- Created: 2025-10-22
-- Purpose: Create set_config and reset_config functions for Supabase context setting
-- These functions are required by the setSupabaseContext() function in the frontend

-- Create set_config function (exact name expected by frontend)
CREATE OR REPLACE FUNCTION set_config(key text, value text)
RETURNS void AS $$
BEGIN
  -- Set configuration variable for Row Level Security context
  PERFORM set_config(key, value, true);
  
  -- Log the context setting for debugging
  IF key = 'app.current_fid' THEN
    RAISE LOG 'Set RLS context for FID: %', value;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create reset_config function (exact name expected by frontend)
CREATE OR REPLACE FUNCTION reset_config()
RETURNS void AS $$
BEGIN
  -- Reset user context variables
  PERFORM set_config('app.current_fid', '', true);
  PERFORM set_config('app.current_user_id', '', true);
  PERFORM set_config('app.current_role', '', true);
  
  -- Log the context reset for debugging
  RAISE LOG 'Reset RLS context';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION set_config(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_config() TO authenticated;

-- Grant execute permissions to anon users (for unauthenticated operations)
GRANT EXECUTE ON FUNCTION set_config(text, text) TO anon;
GRANT EXECUTE ON FUNCTION reset_config() TO anon;

-- Grant execute permissions to service role (for background operations)
GRANT EXECUTE ON FUNCTION set_config(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION reset_config() TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION set_config(text, text) IS 'Sets configuration variable for Row Level Security context. Used by frontend setSupabaseContext() function.';
COMMENT ON FUNCTION reset_config() IS 'Resets all user context variables for Row Level Security. Used by frontend setSupabaseContext() function.';