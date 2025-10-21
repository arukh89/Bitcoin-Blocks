const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Environment variables
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA';

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testConnection() {
  console.log('🔍 Testing database connection...');
  
  try {
    // Test using a simple health check via REST API
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });

    if (response.ok) {
      console.log('✅ Database connection successful');
      return true;
    } else {
      const errorText = await response.text();
      console.error('❌ Connection test failed:', errorText);
      return false;
    }
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    return false;
  }
}

async function executeSQLViaRPC(sql) {
  try {
    // Use Supabase client to execute raw SQL via RPC
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.log(`⚠️  RPC exec_sql failed: ${error.message}, trying direct approach...`);
      
      // Try using the Supabase SQL editor endpoint directly
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          query: sql
        })
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    }
    
    return { success: true };
  } catch (error) {
    // Final fallback: try to execute via POSTgreSQL HTTP endpoint
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Accept': 'application/vnd.pgrst.object+json'
        },
        body: JSON.stringify({
          query: sql
        })
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errorText = await response.text();
        return { success: false, error: errorText };
      }
    } catch (finalError) {
      return { success: false, error: finalError.message };
    }
  }
}

async function executeSQLFile(filePath) {
  console.log(`📄 Reading SQL file: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ SQL file not found: ${filePath}`);
    return false;
  }

  const sqlContent = fs.readFileSync(filePath, 'utf8');
  console.log(`📊 SQL file size: ${sqlContent.length} characters`);

  // Split content by semicolons, handling complex statements
  const statements = [];
  let currentStatement = '';
  let inFunction = false;
  let inTrigger = false;
  let dollarQuoteCount = 0;

  const lines = sqlContent.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip comments and empty lines
    if (trimmedLine.startsWith('--') || trimmedLine === '') {
      continue;
    }

    currentStatement += line + '\n';

    // Track dollar quotes for function bodies
    if (trimmedLine.includes('$$')) {
      dollarQuoteCount += (trimmedLine.match(/\$\$/g) || []).length;
    }

    // Check if we're entering a function definition
    if (trimmedLine.startsWith('CREATE OR REPLACE FUNCTION') || 
        trimmedLine.startsWith('CREATE FUNCTION')) {
      inFunction = true;
    }

    // Check if we're entering a trigger definition  
    if (trimmedLine.startsWith('CREATE TRIGGER')) {
      inTrigger = true;
    }

    // Check for function end (when dollar quotes are balanced)
    if (inFunction && dollarQuoteCount % 2 === 0 && trimmedLine.includes('$$')) {
      inFunction = false;
      dollarQuoteCount = 0;
    }

    // Check for trigger end
    if (inTrigger && trimmedLine.includes('EXECUTE FUNCTION')) {
      inTrigger = false;
    }

    // If we're not in a function/trigger and see a semicolon, end the statement
    if (!inFunction && !inTrigger && trimmedLine.endsWith(';')) {
      statements.push(currentStatement.trim());
      currentStatement = '';
    }
  }

  // Add any remaining content
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  console.log(`📝 Found ${statements.length} SQL statements to execute`);

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    
    if (statement.trim().length === 0) continue;

    console.log(`\n🔄 Executing statement ${i + 1}/${statements.length}`);
    console.log(`📝 ${statement.substring(0, 100)}${statement.length > 100 ? '...' : ''}`);

    try {
      const result = await executeSQLViaRPC(statement);
      
      if (result.success) {
        console.log(`✅ Statement ${i + 1} executed successfully`);
        successCount++;
      } else {
        console.warn(`⚠️  Statement ${i + 1} failed: ${result.error}`);
        errors.push({
          statement: i + 1,
          sql: statement.substring(0, 200) + '...',
          error: result.error
        });
        errorCount++;
      }
    } catch (statementError) {
      console.warn(`⚠️  Statement ${i + 1} error:`, statementError.message);
      errors.push({
        statement: i + 1,
        sql: statement.substring(0, 200) + '...',
        error: statementError.message
      });
      errorCount++;
    }

    // Small delay to avoid overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`\n📊 Execution Summary:`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${errorCount}`);
  console.log(`   Total: ${statements.length}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  First few errors:`);
    errors.slice(0, 5).forEach(err => {
      console.log(`   Statement ${err.statement}: ${err.error}`);
    });
    
    if (errors.length > 5) {
      console.log(`   ... and ${errors.length - 5} more errors`);
    }
  }

  return errorCount === 0;
}

async function performMigrationSync() {
  try {
    console.log('🚀 Starting migration-based synchronization...');
    
    const timestamp = new Date().toISOString();
    
    // Test connection first
    const connectionOk = await testConnection();
    if (!connectionOk) {
      console.log('❌ Cannot proceed without database connection');
      return false;
    }

    // Execute migration files in order
    const migrations = [
      '001_initial_schema.sql',
      '002_error_logs.sql', 
      '003_schema_optimizations.sql'
    ];

    let allSuccess = true;

    for (const migration of migrations) {
      console.log(`\n📁 Processing migration: ${migration}`);
      const migrationPath = path.join(__dirname, '../supabase/migrations', migration);
      
      if (fs.existsSync(migrationPath)) {
        const migrationSuccess = await executeSQLFile(migrationPath);
        if (!migrationSuccess) {
          allSuccess = false;
        }
      } else {
        console.warn(`⚠️  Migration file not found: ${migration}`);
      }
    }

    if (allSuccess) {
      console.log('\n🎉 All migrations completed successfully!');
    } else {
      console.log('\n⚠️  Migrations completed with some errors');
    }

    // Create sync report
    const syncReport = {
      timestamp: timestamp,
      status: allSuccess ? 'success' : 'partial_success',
      migrations: migrations,
      completedAt: new Date().toISOString()
    };

    // Save sync report
    const reportPath = path.join(__dirname, '../logs', `migration-sync-${timestamp.replace(/[:.]/g, '-')}.json`);
    
    if (!fs.existsSync(path.dirname(reportPath))) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(syncReport, null, 2));
    console.log(`📋 Sync report saved to: ${reportPath}`);

    return allSuccess;

  } catch (error) {
    console.error('❌ Migration synchronization failed:', error);
    return false;
  }
}

// Run migration sync
performMigrationSync()
  .then(success => {
    if (success) {
      console.log('\n🎉 All operations completed successfully!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Operations completed with some issues!');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n💥 Unexpected error during sync:', error);
    process.exit(1);
  });