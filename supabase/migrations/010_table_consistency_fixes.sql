-- Migration for table consistency fixes
-- Created: 2025-10-22
-- Purpose: Fix table existence issues and ensure consistency between schema and migrations
-- This addresses any missing columns, constraints, or indexes

-- Fix user_sessions table - add missing login_count column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_sessions' 
    AND column_name = 'login_count'
  ) THEN
    ALTER TABLE user_sessions ADD COLUMN login_count INTEGER DEFAULT 1;
    RAISE LOG 'Added login_count column to user_sessions table';
  END IF;
END $$;

-- Fix admin_fids table - ensure proper permissions structure
DO $$
BEGIN
  -- Update any existing admin_fids with null permissions to have default permissions
  UPDATE admin_fids 
  SET permissions = COALESCE(permissions, '{"role": "admin", "permissions": ["all"]}')
  WHERE permissions IS NULL OR permissions = '{}';
  
  RAISE LOG 'Updated admin_fids permissions structure';
END $$;

-- Fix rounds table - ensure proper default values
DO $$
BEGIN
  -- Add missing created_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rounds' 
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE rounds ADD COLUMN created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000);
    RAISE LOG 'Added created_at column to rounds table';
  END IF;
  
  -- Add missing duration column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rounds' 
    AND column_name = 'duration'
  ) THEN
    ALTER TABLE rounds ADD COLUMN duration INTEGER DEFAULT 5;
    RAISE LOG 'Added duration column to rounds table';
  END IF;
  
  -- Add missing metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rounds' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE rounds ADD COLUMN metadata JSONB DEFAULT '{}';
    RAISE LOG 'Added metadata column to rounds table';
  END IF;
END $$;

-- Fix guesses table - ensure proper constraints
DO $$
BEGIN
  -- Add missing unique constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'guesses' 
    AND constraint_name = 'unique_round_user'
  ) THEN
    ALTER TABLE guesses ADD CONSTRAINT unique_round_user UNIQUE(round_id, user_fid);
    RAISE LOG 'Added unique_round_user constraint to guesses table';
  END IF;
END $$;

-- Fix chat_messages table - ensure proper metadata column
DO $$
BEGIN
  -- Add missing metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chat_messages' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN metadata JSONB DEFAULT '{}';
    RAISE LOG 'Added metadata column to chat_messages table';
  END IF;
END $$;

-- Fix prize_configs table - ensure proper structure
DO $$
BEGIN
  -- Add missing created_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'prize_configs' 
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE prize_configs ADD COLUMN created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000);
    RAISE LOG 'Added created_at column to prize_configs table';
  END IF;
END $$;

-- Fix audit_logs table - ensure proper structure
DO $$
BEGIN
  -- Add missing id column if it doesn't exist (for tables created without proper primary key)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit_logs' 
    AND column_name = 'id'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text);
    RAISE LOG 'Added id column to audit_logs table';
  END IF;
END $$;

-- Ensure all indexes exist for optimal performance
DO $$
BEGIN
  -- Check and create missing indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rounds_status_end_time') THEN
    CREATE INDEX idx_rounds_status_end_time ON rounds(status, end_time DESC);
    RAISE LOG 'Created idx_rounds_status_end_time index';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_guesses_round_user') THEN
    CREATE INDEX idx_guesses_round_user ON guesses(round_id, user_fid);
    RAISE LOG 'Created idx_guesses_round_user index';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_chat_messages_type_created') THEN
    CREATE INDEX idx_chat_messages_type_created ON chat_messages(type, created_at DESC);
    RAISE LOG 'Created idx_chat_messages_type_created index';
  END IF;
END $$;

-- Ensure Row Level Security is enabled on all tables
DO $$
BEGIN
  -- Enable RLS on tables that should have it
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_fids' AND table_schema = 'public') THEN
    ALTER TABLE admin_fids ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_sessions' AND table_schema = 'public') THEN
    ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rounds' AND table_schema = 'public') THEN
    ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guesses' AND table_schema = 'public') THEN
    ALTER TABLE guesses ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages' AND table_schema = 'public') THEN
    ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'prize_configs' AND table_schema = 'public') THEN
    ALTER TABLE prize_configs ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs' AND table_schema = 'public') THEN
    ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'error_logs' AND table_schema = 'public') THEN
    ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'token_transfers' AND table_schema = 'public') THEN
    ALTER TABLE token_transfers ENABLE ROW LEVEL SECURITY;
  END IF;
  
  RAISE LOG 'Enabled Row Level Security on all applicable tables';
END $$;

-- Create a diagnostic function to check table consistency
CREATE OR REPLACE FUNCTION check_table_consistency()
RETURNS TABLE(table_name text, status text, issues text[]) AS $$
DECLARE
  table_rec RECORD;
  issues_array text[];
BEGIN
  -- Check each table for consistency
  FOR table_rec IN 
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('admin_fids', 'user_sessions', 'rounds', 'guesses', 'chat_messages', 'prize_configs', 'audit_logs', 'error_logs', 'token_transfers')
  LOOP
    issues_array := ARRAY[]::text[];
    
    -- Check for primary key
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_name = table_rec.table_name 
      AND constraint_type = 'PRIMARY KEY'
    ) THEN
      issues_array := array_append(issues_array, 'Missing primary key');
    END IF;
    
    -- Check for created_at column
    IF table_rec.table_name != 'admin_fids' AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = table_rec.table_name 
      AND column_name = 'created_at'
    ) THEN
      issues_array := array_append(issues_array, 'Missing created_at column');
    END IF;
    
    -- Check for proper indexes
    IF table_rec.table_name = 'rounds' AND NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE tablename = 'rounds' AND indexname LIKE '%status%'
    ) THEN
      issues_array := array_append(issues_array, 'Missing status index');
    END IF;
    
    IF array_length(issues_array, 1) IS NULL THEN
      RETURN QUERY SELECT table_rec.table_name, 'OK', ARRAY[]::text[];
    ELSE
      RETURN QUERY SELECT table_rec.table_name, 'ISSUES', issues_array;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions for diagnostic function
GRANT EXECUTE ON FUNCTION check_table_consistency() TO authenticated;
GRANT EXECUTE ON FUNCTION check_table_consistency() TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION check_table_consistency() IS 'Diagnostic function to check table consistency and identify potential issues';

-- Create a view for easy monitoring of table status
CREATE OR REPLACE VIEW table_health_status AS
SELECT * FROM check_table_consistency();

-- Grant select permissions on the view
GRANT SELECT ON table_health_status TO authenticated;
GRANT SELECT ON table_health_status TO service_role;

-- Add comment for the view
COMMENT ON VIEW table_health_status IS 'Monitor table health and consistency status';