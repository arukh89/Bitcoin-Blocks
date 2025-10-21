-- Bitcoin Blocks Mini App Database Schema
-- Migration from SpacetimeDB to Supabase

-- Admin FIDs table for role-based access control
CREATE TABLE IF NOT EXISTS admin_fids (
  fid TEXT PRIMARY KEY,
  permissions JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- User sessions table for authentication state management
CREATE TABLE IF NOT EXISTS user_sessions (
  fid TEXT PRIMARY KEY,
  session_data JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

-- Rounds table for game rounds
CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  round_number INTEGER NOT NULL,
  start_time BIGINT NOT NULL,
  end_time BIGINT NOT NULL,
  prize TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'finished')),
  block_number INTEGER,
  actual_tx_count INTEGER,
  winning_fid TEXT,
  block_hash TEXT,
  created_at BIGINT NOT NULL,
  duration INTEGER, -- in minutes
  metadata JSONB DEFAULT '{}'
);

-- Guesses table for user predictions
CREATE TABLE IF NOT EXISTS guesses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_fid TEXT NOT NULL,
  guess_amount INTEGER NOT NULL,
  created_at BIGINT NOT NULL,
  username TEXT NOT NULL,
  pfp_url TEXT,
  UNIQUE(round_id, user_fid)
);

-- Chat messages table for global chat
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_fid TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('guess', 'system', 'winner', 'chat')),
  created_at BIGINT NOT NULL,
  round_id TEXT REFERENCES rounds(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  pfp_url TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Prize configurations table
CREATE TABLE IF NOT EXISTS prize_configs (
  id SERIAL PRIMARY KEY,
  config_data JSONB NOT NULL,
  updated_at BIGINT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

-- Audit logs table for admin actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  admin_fid TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL,
  created_at BIGINT NOT NULL
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);
CREATE INDEX IF NOT EXISTS idx_rounds_end_time ON rounds(end_time);
CREATE INDEX IF NOT EXISTS idx_rounds_round_number ON rounds(round_number);

CREATE INDEX IF NOT EXISTS idx_guesses_round_id ON guesses(round_id);
CREATE INDEX IF NOT EXISTS idx_guesses_user_fid ON guesses(user_fid);
CREATE INDEX IF NOT EXISTS idx_guesses_created_at ON guesses(created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_round_id ON chat_messages(round_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_type ON chat_messages(type);

CREATE INDEX IF NOT EXISTS idx_admin_fids_fid ON admin_fids(fid);
CREATE INDEX IF NOT EXISTS idx_user_sessions_fid ON user_sessions(fid);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_fid ON audit_logs(admin_fid);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Row Level Security (RLS) Policies
ALTER TABLE admin_fids ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE guesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE prize_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin FIDs policies
-- Admins can read all admin FIDs
CREATE POLICY "Admins can read all admin FIDs" ON admin_fids
  FOR SELECT USING (
    fid IN (SELECT fid FROM admin_fids)
  );

-- Only admins can insert/update admin FIDs
CREATE POLICY "Admins can manage admin FIDs" ON admin_fids
  FOR ALL USING (
    fid IN (SELECT fid FROM admin_fids)
  );

-- User sessions policies
-- Users can only access their own sessions
CREATE POLICY "Users can access own sessions" ON user_sessions
  FOR ALL USING (fid = current_setting('app.current_fid', true));

-- Rounds policies
-- Everyone can read rounds
CREATE POLICY "Everyone can read rounds" ON rounds
  FOR SELECT USING (true);

-- Only admins can insert/update rounds
CREATE POLICY "Admins can manage rounds" ON rounds
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_fids WHERE fid = current_setting('app.current_fid', true))
  );

-- Guesses policies
-- Everyone can read guesses
CREATE POLICY "Everyone can read guesses" ON guesses
  FOR SELECT USING (true);

-- Users can insert their own guesses
CREATE POLICY "Users can insert own guesses" ON guesses
  FOR INSERT WITH CHECK (user_fid = current_setting('app.current_fid', true));

-- Users can update their own guesses (if needed)
CREATE POLICY "Users can update own guesses" ON guesses
  FOR UPDATE USING (user_fid = current_setting('app.current_fid', true));

-- Chat messages policies
-- Everyone can read chat messages
CREATE POLICY "Everyone can read chat messages" ON chat_messages
  FOR SELECT USING (true);

-- Users can insert their own chat messages
CREATE POLICY "Users can insert own chat messages" ON chat_messages
  FOR INSERT WITH CHECK (user_fid = current_setting('app.current_fid', true));

-- Prize configs policies
-- Everyone can read prize configs
CREATE POLICY "Everyone can read prize configs" ON prize_configs
  FOR SELECT USING (true);

-- Only admins can manage prize configs
CREATE POLICY "Admins can manage prize configs" ON prize_configs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_fids WHERE fid = current_setting('app.current_fid', true))
  );

-- Audit logs policies
-- Only admins can read audit logs
CREATE POLICY "Admins can read audit logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_fids WHERE fid = current_setting('app.current_fid', true))
  );

-- Only admins can insert audit logs
CREATE POLICY "Admins can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM admin_fids WHERE fid = current_setting('app.current_fid', true))
  );

-- Functions for automatic timestamp management
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = EXTRACT(EPOCH FROM NOW()) * 1000;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_admin_fids_updated_at BEFORE UPDATE ON admin_fids
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial admin FIDs
INSERT INTO admin_fids (fid, permissions, created_at, updated_at)
VALUES 
  ('250704', '{"role": "admin", "permissions": ["all"]}', EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000),
  ('1107084', '{"role": "admin", "permissions": ["all"]}', EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (fid) DO NOTHING;

-- Insert default prize configuration
INSERT INTO prize_configs (config_data, updated_at, version)
VALUES (
  '{
    "jackpotAmount": "5000",
    "firstPlaceAmount": "1000",
    "secondPlaceAmount": "500",
    "currencyType": "$SECOND",
    "tokenContractAddress": "0x0000000000000000000000000000000000000000"
  }',
  EXTRACT(EPOCH FROM NOW()) * 1000,
  1
) ON CONFLICT DO NOTHING;