-- PostgreSQL-specific features for Bitcoin Blocks Mini App
-- This file contains PostgreSQL-specific syntax that should be executed directly in PostgreSQL
-- Note: This file will cause parsing errors in SQL Server/T-SQL parsers but is valid PostgreSQL
-- IMPORTANT: This migration should only be executed in a PostgreSQL environment (Supabase)

-- Enable necessary extensions (only if not already enabled)
-- Note: Extensions should be created via Supabase dashboard or separate migration
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Row Level Security (RLS) Policies
-- Note: These should be enabled via Supabase dashboard or using the Supabase CLI
-- ALTER TABLE admin_fids ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE guesses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE prize_configs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin FIDs policies
-- Admins can read all admin FIDs
-- CREATE POLICY "Admins can read all admin FIDs" ON admin_fids
--   FOR SELECT USING (
--     current_setting('app.current_fid', true) IN (SELECT fid FROM admin_fids WHERE permissions->>'role' = 'admin')
--   );

-- Only admins can insert/update admin FIDs
-- CREATE POLICY "Admins can manage admin FIDs" ON admin_fids
--   FOR ALL USING (
--     current_setting('app.current_fid', true) IN (SELECT fid FROM admin_fids WHERE permissions->>'role' = 'admin')
--   );

-- User sessions policies
-- Users can only access their own sessions
-- CREATE POLICY "Users can access own sessions" ON user_sessions
--   FOR ALL USING (fid = current_setting('app.current_fid', true));

-- Rounds policies
-- Everyone can read rounds
-- CREATE POLICY "Everyone can read rounds" ON rounds
--   FOR SELECT USING (true);

-- Only admins can insert/update rounds
-- CREATE POLICY "Admins can manage rounds" ON rounds
--   FOR ALL USING (
--     EXISTS (SELECT 1 FROM admin_fids WHERE fid = current_setting('app.current_fid', true))
--   );

-- Guesses policies
-- Everyone can read guesses
-- CREATE POLICY "Everyone can read guesses" ON guesses
--   FOR SELECT USING (true);

-- Users can insert their own guesses
-- CREATE POLICY "Users can insert own guesses" ON guesses
--   FOR INSERT WITH CHECK (user_fid = current_setting('app.current_fid', true));

-- Users can update their own guesses (if needed)
-- CREATE POLICY "Users can update own guesses" ON guesses
--   FOR UPDATE USING (user_fid = current_setting('app.current_fid', true));

-- Chat messages policies
-- Everyone can read chat messages
-- CREATE POLICY "Everyone can read chat messages" ON chat_messages
--   FOR SELECT USING (true);

-- Users can insert their own chat messages
-- CREATE POLICY "Users can insert own chat messages" ON chat_messages
--   FOR INSERT WITH CHECK (user_fid = current_setting('app.current_fid', true));

-- Prize configs policies
-- Everyone can read prize configs
-- CREATE POLICY "Everyone can read prize configs" ON prize_configs
--   FOR SELECT USING (true);

-- Only admins can manage prize configs
-- CREATE POLICY "Admins can manage prize configs" ON prize_configs
--   FOR ALL USING (
--     EXISTS (SELECT 1 FROM admin_fids WHERE fid = current_setting('app.current_fid', true))
--   );

-- Audit logs policies
-- Only admins can read audit logs
-- CREATE POLICY "Admins can read audit logs" ON audit_logs
--   FOR SELECT USING (
--     EXISTS (SELECT 1 FROM admin_fids WHERE fid = current_setting('app.current_fid', true))
--   );

-- Only admins can insert audit logs
-- CREATE POLICY "Admins can insert audit logs" ON audit_logs
--   FOR INSERT WITH CHECK (
--     EXISTS (SELECT 1 FROM admin_fids WHERE fid = current_setting('app.current_fid', true))
--   );

-- Functions for automatic timestamp management
-- CREATE OR REPLACE FUNCTION update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = EXTRACT(EPOCH FROM NOW()) * 1000;
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- Triggers for automatic timestamp updates
-- CREATE TRIGGER update_admin_fids_updated_at BEFORE UPDATE ON admin_fids
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Realtime setup - Enable realtime for all tables
-- Note: In Supabase, publications are typically managed through the dashboard or CLI
-- The following statements are for reference but should be executed via Supabase dashboard
-- or using the Supabase CLI: supabase realtime publish

-- Create the publication if it doesn't exist
-- CREATE PUBLICATION IF NOT EXISTS supabase_realtime;

-- Add tables to the publication
-- ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
-- ALTER PUBLICATION supabase_realtime ADD TABLE guesses;
-- ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE prize_configs;
-- ALTER PUBLICATION supabase_realtime ADD TABLE admin_fids;
-- ALTER PUBLICATION supabase_realtime ADD TABLE user_sessions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;