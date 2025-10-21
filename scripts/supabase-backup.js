const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Environment variables
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA';

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
    console.log('📊 Step 1: Backing up schema...');
    
    // Get table information
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE');
    
    if (tablesError) {
      console.error('❌ Error getting tables:', tablesError);
      return false;
    }

    const tableNames = tables.map(t => t.table_name);
    console.log(`📋 Found ${tableNames.length} tables: ${tableNames.join(', ')}`);

    // Backup schema for each table
    const schemaBackup = {
      timestamp: new Date().toISOString(),
      tables: {}
    };

    for (const tableName of tableNames) {
      console.log(`📄 Backing up schema for table: ${tableName}`);
      
      // Get column information
      const { data: columns, error: columnsError } = await supabase
        .from('information_schema.columns')
        .select('*')
        .eq('table_schema', 'public')
        .eq('table_name', tableName);
      
      if (columnsError) {
        console.error(`❌ Error getting columns for ${tableName}:`, columnsError);
        continue;
      }

      schemaBackup.tables[tableName] = {
        columns: columns,
        constraints: [] // Would need additional queries for constraints
      };
    }

    // Save schema backup
    fs.writeFileSync(
      path.join(backupDir, 'schema-backup.json'),
      JSON.stringify(schemaBackup, null, 2)
    );
    console.log('✅ Schema backup completed');

    console.log('📊 Step 2: Backing up data...');
    
    // Backup data for each table
    const dataBackup = {
      timestamp: new Date().toISOString(),
      tables: {}
    };

    for (const tableName of tableNames) {
      console.log(`💾 Backing up data for table: ${tableName}`);
      
      // Get all data from table
      const { data: tableData, error: dataError } = await supabase
        .from(tableName)
        .select('*');
      
      if (dataError) {
        console.error(`❌ Error getting data for ${tableName}:`, dataError);
        dataBackup.tables[tableName] = { error: dataError.message, data: [] };
        continue;
      }

      dataBackup.tables[tableName] = {
        count: tableData.length,
        data: tableData
      };
      
      console.log(`✅ Backed up ${tableData.length} records from ${tableName}`);
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
      totalTables: tableNames.length,
      tableCounts: Object.fromEntries(
        Object.entries(dataBackup.tables).map(([table, info]) => [table, info.count || 0])
      ),
      totalRecords: Object.values(dataBackup.tables).reduce((sum, table) => sum + (table.count || 0), 0)
    };

    fs.writeFileSync(
      path.join(backupDir, 'backup-summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log('📋 Backup Summary:');
    console.log(`   Total Tables: ${summary.totalTables}`);
    console.log(`   Total Records: ${summary.totalRecords}`);
    console.log(`   Backup Location: ${backupDir}`);
    
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
      console.log('🎉 Backup completed successfully!');
      process.exit(0);
    } else {
      console.log('💥 Backup failed!');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('💥 Unexpected error during backup:', error);
    process.exit(1);
  });