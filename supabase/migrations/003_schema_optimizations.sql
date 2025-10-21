-- Database Schema Optimizations for Bitcoin Blocks Mini App
-- Basic performance enhancements

-- Add basic indexes for better query performance
CREATE INDEX idx_rounds_status_end_time ON rounds(status, end_time DESC);
CREATE INDEX idx_rounds_status_created_at ON rounds(status, created_at DESC);
CREATE INDEX idx_rounds_winning_fid ON rounds(winning_fid);

CREATE INDEX idx_guesses_round_user ON guesses(round_id, user_fid);
CREATE INDEX idx_guesses_round_created ON guesses(round_id, created_at DESC);
CREATE INDEX idx_guesses_user_created ON guesses(user_fid, created_at DESC);

CREATE INDEX idx_chat_messages_type_created ON chat_messages(type, created_at DESC);
CREATE INDEX idx_chat_messages_user_created ON chat_messages(user_fid, created_at DESC);

CREATE INDEX idx_user_sessions_expires_login ON user_sessions(expires_at, login_count DESC);
CREATE INDEX idx_audit_logs_admin_created ON audit_logs(admin_fid, created_at DESC);
CREATE INDEX idx_audit_logs_action_created ON audit_logs(action, created_at DESC);

-- Add basic constraints for data integrity
ALTER TABLE rounds ADD CONSTRAINT chk_rounds_duration_positive CHECK (duration > 0);
ALTER TABLE guesses ADD CONSTRAINT chk_guesses_amount_positive CHECK (guess_amount > 0);
ALTER TABLE user_sessions ADD CONSTRAINT chk_user_sessions_login_positive CHECK (login_count > 0);