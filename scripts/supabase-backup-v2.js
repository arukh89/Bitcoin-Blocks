const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Environment variables
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA';

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Known tables from our schema
const knownTables = [
  'admin_fids',
  'user_sessions', 
  'rounds',
  'guesses',
  'chat_messages',
  'prize_configs',
  'audit_logs',
  'error_logs'
];

// Create backup directory with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupDir = path.join(__dirname, '../backups', `supabase-backup-${timestamp}`);

console.log('🔄 Starting Supabase backup process...');
console.log(`📁 Backup directory: ${backupDir}`);

// Create backup directory
if (!fs.existsSync(path.dirname(backupDir))) {
  fs.mkdirSync(path.dirname(backupDir), { recursive: true });
}
fs.mkdirSync(backupDir, { recursive: true });

async function performBackup() {
  try {
    console.log('📊 Step 1: Testing database connection...');
    
    // Test connection with a simple query
    const { data: testData, error: testError } = await supabase
      .from('admin_fids')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.error('❌ Database connection test failed:', testError);
      return false;
    }
    
    console.log('✅ Database connection successful');

    console.log('📊 Step 2: Backing up schema...');
    
    // Read our local schema file
    const schemaPath = path.join(__dirname, '../supabase/schema.sql');
    let schemaContent = '';
    
    if (fs.existsSync(schemaPath)) {
      schemaContent = fs.readFileSync(schemaPath, 'utf8');
    } else {
      console.error('❌ Local schema file not found');
      return false;
    }

    // Save schema backup
    fs.writeFileSync(
      path.join(backupDir, 'schema-backup.sql'),
      schemaContent
    );
    
    // Also save as JSON with metadata
    const schemaBackup = {
      timestamp: new Date().toISOString(),
      sourceFile: 'supabase/schema.sql',
      tables: knownTables,
      schemaContent: schemaContent
    };
    
    fs.writeFileSync(
      path.join(backupDir, 'schema-backup.json'),
      JSON.stringify(schemaBackup, null, 2)
    );
    
    console.log('✅ Schema backup completed');

    console.log('📊 Step 3: Backing up data...');
    
    // Backup data for each known table
    const dataBackup = {
      timestamp: new Date().toISOString(),
      tables: {}
    };

    let totalRecords = 0;

    for (const tableName of knownTables) {
      console.log(`💾 Backing up data for table: ${tableName}`);
      
      try {
        // Get all data from table
        const { data: tableData, error: dataError } = await supabase
          .from(tableName)
          .select('*');
        
        if (dataError) {
          console.error(`❌ Error getting data for ${tableName}:`, dataError);
          dataBackup.tables[tableName] = { 
            error: dataError.message, 
            data: [],
            count: 0
          };
          continue;
        }

        const recordCount = tableData ? tableData.length : 0;
        dataBackup.tables[tableName] = {
          count: recordCount,
          data: tableData || []
        };
        
        totalRecords += recordCount;
        console.log(`✅ Backed up ${recordCount} records from ${tableName}`);
        
        // Also save individual table files for large tables
        if (recordCount > 1000) {
          fs.writeFileSync(
            path.join(backupDir, `${tableName}-data.json`),
            JSON.stringify({
              timestamp: new Date().toISOString(),
              table: tableName,
              count: recordCount,
              data: tableData
            }, null, 2)
          );
        }
        
      } catch (tableError) {
        console.error(`❌ Unexpected error for table ${tableName}:`, tableError);
        dataBackup.tables[tableName] = { 
          error: tableError.message, 
          data: [],
          count: 0
        };
      }
    }

    // Save data backup
    fs.writeFileSync(
      path.join(backupDir, 'data-backup.json'),
      JSON.stringify(dataBackup, null, 2)
    );
    console.log('✅ Data backup completed');

    // Generate backup summary
    const summary = {
      timestamp: new Date().toISOString(),
      backupDirectory: backupDir,
      totalTables: knownTables.length,
      tables: knownTables,
      tableCounts: Object.fromEntries(
        Object.entries(dataBackup.tables).map(([table, info]) => [table, info.count || 0])
      ),
      totalRecords: totalRecords,
      backupStatus: 'completed',
      environment: 'production'
    };

    fs.writeFileSync(
      path.join(backupDir, 'backup-summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log('\n📋 Backup Summary:');
    console.log(`   Timestamp: ${summary.timestamp}`);
    console.log(`   Total Tables: ${summary.totalTables}`);
    console.log(`   Total Records: ${summary.totalRecords}`);
    console.log(`   Backup Location: ${backupDir}`);
    console.log('\n📊 Table Details:');
    
    for (const [table, count] of Object.entries(summary.tableCounts)) {
      console.log(`   ${table}: ${count} records`);
    }
    
    return true;

  } catch (error) {
    console.error('❌ Backup failed:', error);
    return false;
  }
}

// Run backup
performBackup()
  .then(success => {
    if (success) {
      console.log('\n🎉 Backup completed successfully!');
      process.exit(0);
    } else {
      console.log('\n💥 Backup failed!');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('💥 Unexpected error during backup:', error);
    process.exit(1);
  });