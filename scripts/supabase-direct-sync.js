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
    // Simple test - try to get the current timestamp
    const { data, error } = await supabase
      .from('pg_catalog.pg_tables')
      .select('tablename')
      .eq('schemaname', 'public')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') {
      console.error('❌ Connection test failed:', error);
      return false;
    }
    
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    return false;
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

  // Split content by semicolons, but keep CREATE FUNCTION and complex statements together
  const statements = [];
  let currentStatement = '';
  let inFunction = false;
  let inTrigger = false;

  const lines = sqlContent.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip comments and empty lines
    if (trimmedLine.startsWith('--') || trimmedLine === '') {
      continue;
    }

    currentStatement += line + '\n';

    // Check if we're entering a function definition
    if (trimmedLine.startsWith('CREATE OR REPLACE FUNCTION') || 
        trimmedLine.startsWith('CREATE FUNCTION')) {
      inFunction = true;
    }

    // Check if we're entering a trigger definition  
    if (trimmedLine.startsWith('CREATE TRIGGER')) {
      inTrigger = true;
    }

    // Check for function end
    if (inFunction && trimmedLine === '$$ language \'plpgsql\';') {
      inFunction = false;
    }

    // Check for trigger end
    if (inTrigger && trimmedLine.startsWith('EXECUTE FUNCTION')) {
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
      // Try to execute the statement using a direct POST request
      const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          query: statement
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`⚠️  Statement ${i + 1} failed: ${errorText}`);
        errors.push({
          statement: i + 1,
          sql: statement.substring(0, 200) + '...',
          error: errorText
        });
        errorCount++;
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
        successCount++;
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
    await new Promise(resolve => setTimeout(resolve, 100));
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

async function performDirectSync() {
  try {
    console.log('🚀 Starting direct Supabase schema synchronization...');
    
    const timestamp = new Date().toISOString();
    
    // Test connection first
    const connectionOk = await testConnection();
    if (!connectionOk) {
      console.log('❌ Cannot proceed without database connection');
      return false;
    }

    // Execute main schema file
    const schemaPath = path.join(__dirname, '../supabase/schema.sql');
    const schemaSuccess = await executeSQLFile(schemaPath);
    
    if (schemaSuccess) {
      console.log('\n🎉 Schema synchronization completed successfully!');
    } else {
      console.log('\n⚠️  Schema synchronization completed with errors');
    }

    // Create sync report
    const syncReport = {
      timestamp: timestamp,
      status: schemaSuccess ? 'success' : 'partial_success',
      schemaFile: 'supabase/schema.sql',
      completedAt: new Date().toISOString()
    };

    // Save sync report
    const reportPath = path.join(__dirname, '../logs', `sync-report-${timestamp.replace(/[:.]/g, '-')}.json`);
    
    if (!fs.existsSync(path.dirname(reportPath))) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(syncReport, null, 2));
    console.log(`📋 Sync report saved to: ${reportPath}`);

    return schemaSuccess;

  } catch (error) {
    console.error('❌ Direct synchronization failed:', error);
    return false;
  }
}

// Run direct sync
performDirectSync()
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