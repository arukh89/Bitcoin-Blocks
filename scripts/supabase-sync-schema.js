const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Environment variables
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA';

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Migration files in order
const migrationFiles = [
  '001_initial_schema.sql',
  '002_error_logs.sql', 
  '003_schema_optimizations.sql'
];

async function executeMigration(migrationContent, migrationName) {
  console.log(`🔄 Executing migration: ${migrationName}`);
  
  try {
    // Split migration content by semicolons and execute each statement
    const statements = migrationContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      if (statement.trim().length === 0) continue;
      
      try {
        // Use RPC to execute raw SQL
        const { data, error } = await supabase.rpc('exec_sql', {
          sql: statement
        });

        if (error) {
          // Try using POST to /rest/v1/rpc/exec_sql if RPC fails
          console.warn(`⚠️  RPC failed for statement ${i + 1}, trying alternative method...`);
          
          // For some statements like CREATE TABLE, we might need to use a different approach
          // Let's try to use the direct SQL execution via REST API
          const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': SUPABASE_SERVICE_ROLE_KEY
            },
            body: JSON.stringify({ sql: statement })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.warn(`⚠️  Statement ${i + 1} failed: ${errorText}`);
            console.log(`📝 Statement was: ${statement.substring(0, 100)}...`);
            errorCount++;
          } else {
            successCount++;
          }
        } else {
          successCount++;
        }
      } catch (stmtError) {
        console.warn(`⚠️  Statement ${i + 1} error:`, stmtError.message);
        console.log(`📝 Statement was: ${statement.substring(0, 100)}...`);
        errorCount++;
      }
    }

    console.log(`✅ Migration ${migrationName} completed: ${successCount} statements successful, ${errorCount} failed`);
    return errorCount === 0;

  } catch (error) {
    console.error(`❌ Migration ${migrationName} failed:`, error);
    return false;
  }
}

async function performSchemaSync() {
  try {
    console.log('🚀 Starting Supabase schema synchronization...');
    
    const timestamp = new Date().toISOString();
    
    // Create sync log
    const syncLog = {
      timestamp: timestamp,
      status: 'started',
      migrations: [],
      errors: []
    };

    // Enable UUID extension first
    console.log('🔧 Enabling UUID extension...');
    await executeMigration('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', 'uuid_extension');

    // Execute migrations in order
    for (const migrationFile of migrationFiles) {
      const migrationPath = path.join(__dirname, '../supabase/migrations', migrationFile);
      
      if (!fs.existsSync(migrationPath)) {
        console.error(`❌ Migration file not found: ${migrationFile}`);
        syncLog.errors.push(`Migration file not found: ${migrationFile}`);
        continue;
      }

      const migrationContent = fs.readFileSync(migrationPath, 'utf8');
      console.log(`📄 Reading migration: ${migrationFile}`);
      
      const migrationResult = {
        file: migrationFile,
        executedAt: new Date().toISOString(),
        success: false
      };

      try {
        const success = await executeMigration(migrationContent, migrationFile);
        migrationResult.success = success;
        
        if (success) {
          console.log(`✅ Migration ${migrationFile} completed successfully`);
        } else {
          console.log(`❌ Migration ${migrationFile} failed`);
          syncLog.errors.push(`Migration failed: ${migrationFile}`);
        }
      } catch (migrationError) {
        console.error(`❌ Error executing migration ${migrationFile}:`, migrationError);
        migrationResult.error = migrationError.message;
        syncLog.errors.push(`Migration error: ${migrationFile} - ${migrationError.message}`);
      }

      syncLog.migrations.push(migrationResult);
    }

    // Update sync log status
    syncLog.status = syncLog.errors.length === 0 ? 'completed' : 'completed_with_errors';
    syncLog.completedAt = new Date().toISOString();

    // Save sync log
    const syncLogPath = path.join(__dirname, '../logs', `schema-sync-${timestamp.replace(/[:.]/g, '-')}.json`);
    
    if (!fs.existsSync(path.dirname(syncLogPath))) {
      fs.mkdirSync(path.dirname(syncLogPath), { recursive: true });
    }
    
    fs.writeFileSync(syncLogPath, JSON.stringify(syncLog, null, 2));

    console.log('\n📋 Schema Sync Summary:');
    console.log(`   Status: ${syncLog.status}`);
    console.log(`   Total Migrations: ${syncLog.migrations.length}`);
    console.log(`   Successful: ${syncLog.migrations.filter(m => m.success).length}`);
    console.log(`   Failed: ${syncLog.migrations.filter(m => !m.success).length}`);
    console.log(`   Log File: ${syncLogPath}`);

    if (syncLog.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      syncLog.errors.forEach(error => console.log(`   - ${error}`));
    }

    return syncLog.errors.length === 0;

  } catch (error) {
    console.error('❌ Schema synchronization failed:', error);
    return false;
  }
}

// Alternative approach using direct SQL execution via REST API
async function executeDirectSQL(sql) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ query: sql })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SQL execution failed: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Direct SQL execution error:', error);
    throw error;
  }
}

// Run schema sync
performSchemaSync()
  .then(success => {
    if (success) {
      console.log('\n🎉 Schema synchronization completed successfully!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Schema synchronization completed with errors!');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n💥 Unexpected error during schema sync:', error);
    process.exit(1);
  });