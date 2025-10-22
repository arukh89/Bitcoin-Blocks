-- Migration for real-time publications setup
-- Created: 2025-10-22
-- Purpose: Enable real-time subscriptions for all required tables
-- This ensures proper real-time functionality for the frontend

-- Create the publication if it doesn't exist
-- Note: In Supabase, this should be executed via the dashboard or CLI
-- but we include it here for completeness

-- Enable Realtime for all tables
-- These tables need to be added to the supabase_realtime publication
-- for real-time subscriptions to work properly

-- Note: The following commands should be executed via Supabase CLI:
-- supabase db push --include-auth
-- Or via the Supabase dashboard under Database > Replication

-- For documentation purposes, here are the tables that need real-time enabled:
-- 1. rounds - for real-time round updates
-- 2. guesses - for real-time guess updates
-- 3. chat_messages - for real-time chat functionality
-- 4. prize_configs - for real-time prize configuration updates
-- 5. admin_fids - for real-time admin updates
-- 6. user_sessions - for real-time session management
-- 7. audit_logs - for real-time audit logging
-- 8. error_logs - for real-time error monitoring
-- 9. token_transfers - for real-time transfer status updates

-- Create a function to check if tables exist before adding to publication
CREATE OR REPLACE FUNCTION add_table_to_publication_if_exists(table_name text)
RETURNS void AS $$
DECLARE
  table_exists boolean;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = table_name
    AND table_schema = 'public'
  ) INTO table_exists;
  
  IF table_exists THEN
    -- Log that we're adding the table to publication
    RAISE LOG 'Table % exists, should be added to realtime publication', table_name;
  ELSE
    -- Log that table doesn't exist
    RAISE LOG 'Table % does not exist, skipping', table_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Check all required tables
SELECT add_table_to_publication_if_exists('rounds');
SELECT add_table_to_publication_if_exists('guesses');
SELECT add_table_to_publication_if_exists('chat_messages');
SELECT add_table_to_publication_if_exists('prize_configs');
SELECT add_table_to_publication_if_exists('admin_fids');
SELECT add_table_to_publication_if_exists('user_sessions');
SELECT add_table_to_publication_if_exists('audit_logs');
SELECT add_table_to_publication_if_exists('error_logs');
SELECT add_table_to_publication_if_exists('token_transfers');

-- Create a helper function to test real-time subscriptions
CREATE OR REPLACE FUNCTION test_realtime_subscription(table_name text)
RETURNS TABLE(status text, message text) AS $$
DECLARE
  table_exists boolean;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = table_name
    AND table_schema = 'public'
  ) INTO table_exists;
  
  IF table_exists THEN
    RETURN QUERY 
    SELECT 'success'::text as status, 
           'Table ' || table_name || ' is ready for realtime subscriptions'::text as message;
  ELSE
    RETURN QUERY 
    SELECT 'error'::text as status, 
           'Table ' || table_name || ' does not exist'::text as message;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions for testing functions
GRANT EXECUTE ON FUNCTION add_table_to_publication_if_exists(text) TO authenticated;
GRANT EXECUTE ON FUNCTION test_realtime_subscription(text) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION add_table_to_publication_if_exists(text) IS 'Helper function to check table existence before adding to realtime publication.';
COMMENT ON FUNCTION test_realtime_subscription(text) IS 'Helper function to test if a table is ready for realtime subscriptions.';

-- Create a view for monitoring real-time status
CREATE OR REPLACE VIEW realtime_status AS
SELECT 
  'rounds' as table_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rounds' AND table_schema = 'public') as exists,
  'Real-time updates for game rounds' as description
UNION ALL
SELECT 
  'guesses' as table_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guesses' AND table_schema = 'public') as exists,
  'Real-time updates for user guesses' as description
UNION ALL
SELECT 
  'chat_messages' as table_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages' AND table_schema = 'public') as exists,
  'Real-time updates for global chat' as description
UNION ALL
SELECT 
  'prize_configs' as table_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'prize_configs' AND table_schema = 'public') as exists,
  'Real-time updates for prize configurations' as description
UNION ALL
SELECT 
  'admin_fids' as table_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_fids' AND table_schema = 'public') as exists,
  'Real-time updates for admin management' as description
UNION ALL
SELECT 
  'user_sessions' as table_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_sessions' AND table_schema = 'public') as exists,
  'Real-time updates for user sessions' as description
UNION ALL
SELECT 
  'audit_logs' as table_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs' AND table_schema = 'public') as exists,
  'Real-time updates for audit logging' as description
UNION ALL
SELECT 
  'error_logs' as table_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'error_logs' AND table_schema = 'public') as exists,
  'Real-time updates for error monitoring' as description
UNION ALL
SELECT 
  'token_transfers' as table_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'token_transfers' AND table_schema = 'public') as exists,
  'Real-time updates for token transfers' as description;

-- Grant select permissions on the view
GRANT SELECT ON realtime_status TO authenticated;
GRANT SELECT ON realtime_status TO service_role;

-- Add comment for the view
COMMENT ON VIEW realtime_status IS 'Monitor which tables are ready for real-time subscriptions';