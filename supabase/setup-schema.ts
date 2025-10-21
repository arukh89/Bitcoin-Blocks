import { supabaseAdmin } from '../src/lib/supabase-client'

// Schema setup script for Bitcoin Blocks Mini App
// This script creates the necessary tables and policies in Supabase

export async function setupDatabaseSchema() {
  console.log('🔧 Setting up Bitcoin Blocks database schema...')

  try {
    // Create admin_fids table
    const { error: adminFidsError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS admin_fids (
          fid TEXT PRIMARY KEY,
          permissions JSONB DEFAULT '{}',
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_admin_fids_fid ON admin_fids(fid);
      `
    })

    if (adminFidsError) {
      console.error('❌ Error creating admin_fids table:', adminFidsError)
    } else {
      console.log('✅ admin_fids table created successfully')
    }

    // Create user_sessions table
    const { error: userSessionsError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS user_sessions (
          fid TEXT PRIMARY KEY,
          session_data JSONB NOT NULL,
          created_at BIGINT NOT NULL,
          expires_at BIGINT NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_user_sessions_fid ON user_sessions(fid);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
      `
    })

    if (userSessionsError) {
      console.error('❌ Error creating user_sessions table:', userSessionsError)
    } else {
      console.log('✅ user_sessions table created successfully')
    }

    // Create rounds table
    const { error: roundsError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
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
          duration INTEGER,
          metadata JSONB DEFAULT '{}'
        );
        
        CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);
        CREATE INDEX IF NOT EXISTS idx_rounds_end_time ON rounds(end_time);
        CREATE INDEX IF NOT EXISTS idx_rounds_round_number ON rounds(round_number);
      `
    })

    if (roundsError) {
      console.error('❌ Error creating rounds table:', roundsError)
    } else {
      console.log('✅ rounds table created successfully')
    }

    // Create guesses table
    const { error: guessesError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
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
        
        CREATE INDEX IF NOT EXISTS idx_guesses_round_id ON guesses(round_id);
        CREATE INDEX IF NOT EXISTS idx_guesses_user_fid ON guesses(user_fid);
        CREATE INDEX IF NOT EXISTS idx_guesses_created_at ON guesses(created_at);
      `
    })

    if (guessesError) {
      console.error('❌ Error creating guesses table:', guessesError)
    } else {
      console.log('✅ guesses table created successfully')
    }

    // Create chat_messages table
    const { error: chatMessagesError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
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
        
        CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_round_id ON chat_messages(round_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_type ON chat_messages(type);
      `
    })

    if (chatMessagesError) {
      console.error('❌ Error creating chat_messages table:', chatMessagesError)
    } else {
      console.log('✅ chat_messages table created successfully')
    }

    // Create prize_configs table
    const { error: prizeConfigsError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS prize_configs (
          id SERIAL PRIMARY KEY,
          config_data JSONB NOT NULL,
          updated_at BIGINT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1
        );
      `
    })

    if (prizeConfigsError) {
      console.error('❌ Error creating prize_configs table:', prizeConfigsError)
    } else {
      console.log('✅ prize_configs table created successfully')
    }

    // Create audit_logs table
    const { error: auditLogsError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          admin_fid TEXT NOT NULL,
          action TEXT NOT NULL,
          details JSONB NOT NULL,
          created_at BIGINT NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_fid ON audit_logs(admin_fid);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
      `
    })

    if (auditLogsError) {
      console.error('❌ Error creating audit_logs table:', auditLogsError)
    } else {
      console.log('✅ audit_logs table created successfully')
    }

    // Insert initial data
    await insertInitialData()

    console.log('🎉 Database schema setup completed!')
    return true
  } catch (error) {
    console.error('❌ Failed to setup database schema:', error)
    return false
  }
}

async function insertInitialData() {
  const now = Math.floor(Date.now())

  // Insert initial admin FIDs
  const { error: adminInsertError } = await supabaseAdmin
    .from('admin_fids')
    .upsert([
      {
        fid: '250704',
        permissions: { role: 'admin', permissions: ['all'] },
        created_at: now,
        updated_at: now
      },
      {
        fid: '1107084',
        permissions: { role: 'admin', permissions: ['all'] },
        created_at: now,
        updated_at: now
      }
    ], { onConflict: 'fid' })

  if (adminInsertError) {
    console.error('❌ Error inserting admin FIDs:', adminInsertError)
  } else {
    console.log('✅ Initial admin FIDs inserted successfully')
  }

  // Insert default prize configuration
  const { error: prizeConfigInsertError } = await supabaseAdmin
    .from('prize_configs')
    .upsert({
      config_data: {
        jackpotAmount: '5000',
        firstPlaceAmount: '1000',
        secondPlaceAmount: '500',
        currencyType: '$SECOND',
        tokenContractAddress: '0x0000000000000000000000000000000000000000'
      },
      updated_at: now,
      version: 1
    }, { onConflict: 'id' })

  if (prizeConfigInsertError) {
    console.error('❌ Error inserting prize config:', prizeConfigInsertError)
  } else {
    console.log('✅ Default prize configuration inserted successfully')
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupDatabaseSchema()
    .then(success => {
      if (success) {
        console.log('🚀 Schema setup completed successfully!')
        process.exit(0)
      } else {
        console.log('💥 Schema setup failed!')
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('💥 Unexpected error during schema setup:', error)
      process.exit(1)
    })
}