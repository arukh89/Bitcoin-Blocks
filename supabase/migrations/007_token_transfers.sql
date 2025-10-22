-- Token transfers table for tracking $SECONDS token transfers
CREATE TABLE IF NOT EXISTS token_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  admin_fid INTEGER NOT NULL,
  admin_wallet TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT UNIQUE,
  tx_hash TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_token_transfers_winner_address ON token_transfers(winner_address);
CREATE INDEX IF NOT EXISTS idx_token_transfers_admin_fid ON token_transfers(admin_fid);
CREATE INDEX IF NOT EXISTS idx_token_transfers_status ON token_transfers(status);
CREATE INDEX IF NOT EXISTS idx_token_transfers_idempotency_key ON token_transfers(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_token_transfers_created_at ON token_transfers(created_at);

-- Row Level Security
ALTER TABLE token_transfers ENABLE ROW LEVEL SECURITY;

-- Only admins can read token transfers
CREATE POLICY "Admins can read token transfers" ON token_transfers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_fids WHERE fid = current_setting('app.current_fid', true))
  );

-- Only admins can insert token transfers
CREATE POLICY "Admins can insert token transfers" ON token_transfers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM admin_fids WHERE fid = current_setting('app.current_fid', true))
  );

-- Only admins can update token transfers
CREATE POLICY "Admins can update token transfers" ON token_transfers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM admin_fids WHERE fid = current_setting('app.current_fid', true))
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_token_transfers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_token_transfers_updated_at 
  BEFORE UPDATE ON token_transfers
  FOR EACH ROW EXECUTE FUNCTION update_token_transfers_updated_at();