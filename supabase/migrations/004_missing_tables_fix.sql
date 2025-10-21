-- Migration untuk tabel-tabel yang hilang
-- Created: 2025-10-21
-- Purpose: Menambahkan tabel prize_configs, admin_fids, dan audit_logs
-- PostgreSQL syntax for Supabase

-- Create prize_configs table
CREATE TABLE prize_configs (
    id BIGSERIAL PRIMARY KEY,
    config_data JSONB NOT NULL,
    updated_at BIGINT NOT NULL,
    version BIGINT NOT NULL DEFAULT 1,
    created_at BIGINT DEFAULT 0
);

-- Create admin_fids table
CREATE TABLE admin_fids (
    fid TEXT PRIMARY KEY,
    permissions JSONB NOT NULL DEFAULT '{}',
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0
);

-- Create audit_logs table
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY DEFAULT '',
    admin_fid TEXT NOT NULL,
    action TEXT NOT NULL,
    details JSONB NOT NULL,
    created_at BIGINT NOT NULL DEFAULT 0,
    FOREIGN KEY (admin_fid) REFERENCES admin_fids(fid) ON DELETE SET NULL
);

-- Insert default admin FIDs
INSERT INTO admin_fids (fid, permissions, created_at, updated_at) 
VALUES 
    ('250704', '{"role": "admin", "permissions": ["all"], "source": "initial"}', 0, 0),
    ('1107084', '{"role": "admin", "permissions": ["all"], "source": "initial"}', 0, 0);

-- Insert default prize configuration
INSERT INTO prize_configs (config_data, updated_at, version)
VALUES
    ('{
        "jackpotAmount": "1000",
        "firstPlaceAmount": "500",
        "secondPlaceAmount": "250",
        "currencyType": "USD",
        "tokenTicker": "$Seconds",
        "tokenName": "Time is money",
        "tokenContractAddress": "0xaf67e72dc47dcb2d48ecbc56950473d793d70c18",
        "network": "base"
    }', 0, 1);

-- Create indexes for better performance
CREATE INDEX idx_admin_fids_fid ON admin_fids(fid);
CREATE INDEX idx_audit_logs_admin_fid ON audit_logs(admin_fid);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_prize_configs_version ON prize_configs(version);
CREATE INDEX idx_prize_configs_updated_at ON prize_configs(updated_at);