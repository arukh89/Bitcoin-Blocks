#!/usr/bin/env node

/**
 * Database Schema Validator
 * 
 * This script validates the database schema consistency between the project
 * migration files and the actual Supabase database.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
const SUPABASE_SERVICE_KEY = 'sbp_6d4e7f74315a3ab6646ca23441ddc03b7e25333d';
const PROJECT_ROOT = path.join(__dirname, '..');

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Expected schema structure
const EXPECTED_TABLES = [
  'rounds',
  'guesses',
  'chat_messages',
  'prize_configs',
  'admin_fids',
  'user_sessions',
  'audit_logs',
  'performance_metrics',
  'error_logs'
];

const EXPECTED_COLUMNS = {
  rounds: [
    'id',
    'created_at',
    'end_time',
    'status',
    'prize_pool',
    'actual_tx_count',
    'block_hash',
    'winner_fid',
    'metadata'
  ],
  guesses: [
    'id',
    'round_id',
    'user_fid',
    'guess_amount',
    'created_at'
  ],
  chat_messages: [
    'id',
    'user_fid',
    'message',
    'type',
    'created_at',
    'metadata'
  ],
  prize_configs: [
    'id',
    'config_data',
    'updated_at',
    'version'
  ],
  admin_fids: [
    'fid',
    'permissions',
    'created_at',
    'updated_at'
  ],
  user_sessions: [
    'fid',
    'session_data',
    'created_at',
    'expires_at'
  ],
  audit_logs: [
    'id',
    'admin_fid',
    'action',
    'details',
    'created_at'
  ],
  performance_metrics: [
    'id',
    'metric_name',
    'metric_value',
    'metadata',
    'created_at'
  ],
  error_logs: [
    'id',
    'error_type',
    'error_message',
    'stack_trace',
    'metadata',
    'created_at'
  ]
};

const EXPECTED_INDEXES = [
  'idx_rounds_status',
  'idx_rounds_end_time',
  'idx_guesses_round_id',
  'idx_guesses_user_fid',
  'idx_chat_messages_created_at',
  'idx_audit_logs_created_at',
  'idx_performance_metrics_created_at',
  'idx_error_logs_created_at'
];

const EXPECTED_FUNCTIONS = [
  'get_leaderboard',
  'get_user_stats',
  'cleanup_old_sessions',
  'calculate_prize_distribution',
  'get_round_analytics'
];

const EXPECTED_POLICIES = [
  'Users can view their own guesses',
  'Users can insert their own guesses',
  'Admins can view all data',
  'Admins can update rounds',
  'Public can read active rounds'
];

/**
 * Get actual database schema
 */
async function getActualDatabaseSchema() {
  console.log('Retrieving actual database schema...');
  
  try {
    const schema = {
      tables: {},
      indexes: [],
      functions: [],
      policies: [],
      constraints: {}
    };
    
    // Get tables
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE');
    
    if (tablesError) {
      throw tablesError;
    }
    
    // Get columns for each table
    for (const table of tables) {
      const { data: columns, error: columnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable, column_default')
        .eq('table_schema', 'public')
        .eq('table_name', table.table_name)
        .order('ordinal_position');
      
      if (columnsError) {
        console.error(`Error getting columns for table ${table.table_name}:`, columnsError);
        continue;
      }
      
      schema.tables[table.table_name] = {
        columns: columns.map(col => ({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === 'YES',
          default: col.column_default
        }))
      };
    }
    
    // Get indexes
    try {
      const { data: indexes, error: indexesError } = await supabase
        .from('pg_indexes')
        .select('indexname, tablename, indexdef')
        .eq('schemaname', 'public');
      
      if (!indexesError && indexes) {
        schema.indexes = indexes.map(idx => ({
          name: idx.indexname,
          table: idx.tablename,
          definition: idx.indexdef
        }));
      }
    } catch (error) {
      console.log('Could not retrieve indexes (might need admin access)');
    }
    
    // Get functions
    try {
      const { data: functions, error: functionsError } = await supabase
        .from('information_schema.routines')
        .select('routine_name, routine_type')
        .eq('routine_schema', 'public')
        .eq('routine_type', 'FUNCTION');
      
      if (!functionsError && functions) {
        schema.functions = functions.map(func => func.routine_name);
      }
    } catch (error) {
      console.log('Could not retrieve functions (might need admin access)');
    }
    
    // Get RLS policies
    try {
      const { data: policies, error: policiesError } = await supabase
        .from('pg_policies')
        .select('policyname, tablename, permissive, roles, cmd, qual')
        .eq('schemaname', 'public');
      
      if (!policiesError && policies) {
        schema.policies = policies.map(policy => ({
          name: policy.policyname,
          table: policy.tablename,
          permissive: policy.permissive,
          roles: policy.roles,
          command: policy.cmd,
          qualification: policy.qual
        }));
      }
    } catch (error) {
      console.log('Could not retrieve policies (might need admin access)');
    }
    
    return schema;
  } catch (error) {
    console.error('Error retrieving database schema:', error);
    throw error;
  }
}

/**
 * Get expected schema from migration files
 */
async function getExpectedSchemaFromMigrations() {
  console.log('Analyzing migration files...');
  
  try {
    const migrationsDir = path.join(PROJECT_ROOT, 'supabase', 'migrations');
    const migrationFiles = await fs.promises.readdir(migrationsDir);
    
    const expectedSchema = {
      tables: {},
      indexes: [],
      functions: [],
      policies: []
    };
    
    for (const file of migrationFiles.sort()) {
      if (file.endsWith('.sql')) {
        const filePath = path.join(migrationsDir, file);
        const content = await fs.promises.readFile(filePath, 'utf8');
        
        // Parse SQL for table definitions
        const tableMatches = content.match(/CREATE TABLE\s+(\w+)\s*\(([\s\S]*?)\);/gi);
        if (tableMatches) {
          for (const match of tableMatches) {
            const tableNameMatch = match.match(/CREATE TABLE\s+(\w+)/);
            if (tableNameMatch) {
              const tableName = tableNameMatch[1];
              const columnsMatch = match.match(/\(([\s\S]*?)\)/);
              if (columnsMatch) {
                const columnDefs = columnsMatch[1].split(',').map(col => col.trim());
                const columns = columnDefs.map(col => {
                  const nameMatch = col.match(/^(\w+)/);
                  return nameMatch ? nameMatch[1] : null;
                }).filter(Boolean);
                
                expectedSchema.tables[tableName] = { columns };
              }
            }
          }
        }
        
        // Parse for index definitions
        const indexMatches = content.match(/CREATE INDEX\s+(\w+)/gi);
        if (indexMatches) {
          for (const match of indexMatches) {
            const indexNameMatch = match.match(/CREATE INDEX\s+(\w+)/);
            if (indexNameMatch) {
              expectedSchema.indexes.push(indexNameMatch[1]);
            }
          }
        }
        
        // Parse for function definitions
        const functionMatches = content.match(/CREATE FUNCTION\s+(\w+)/gi);
        if (functionMatches) {
          for (const match of functionMatches) {
            const functionNameMatch = match.match(/CREATE FUNCTION\s+(\w+)/);
            if (functionNameMatch) {
              expectedSchema.functions.push(functionNameMatch[1]);
            }
          }
        }
        
        // Parse for policy definitions
        const policyMatches = content.match(/CREATE POLICY\s+["']([^"']+)["']/gi);
        if (policyMatches) {
          for (const match of policyMatches) {
            const policyNameMatch = match.match(/CREATE POLICY\s+["']([^"']+)["']/);
            if (policyNameMatch) {
              expectedSchema.policies.push(policyNameMatch[1]);
            }
          }
        }
      }
    }
    
    return expectedSchema;
  } catch (error) {
    console.error('Error analyzing migration files:', error);
    throw error;
  }
}

/**
 * Compare schemas and identify differences
 */
function compareSchemas(actualSchema, expectedSchema) {
  console.log('Comparing schemas...');
  
  const comparison = {
    tables: {
      missing: [],
      extra: [],
      columnDifferences: []
    },
    indexes: {
      missing: [],
      extra: []
    },
    functions: {
      missing: [],
      extra: []
    },
    policies: {
      missing: [],
      extra: []
    }
  };
  
  // Compare tables
  const actualTableNames = Object.keys(actualSchema.tables);
  const expectedTableNames = Object.keys(expectedSchema.tables);
  
  // Missing tables
  for (const tableName of expectedTableNames) {
    if (!actualTableNames.includes(tableName)) {
      comparison.tables.missing.push(tableName);
    }
  }
  
  // Extra tables
  for (const tableName of actualTableNames) {
    if (!expectedTableNames.includes(tableName)) {
      comparison.tables.extra.push(tableName);
    }
  }
  
  // Compare columns for existing tables
  for (const tableName of expectedTableNames) {
    if (actualTableNames.includes(tableName)) {
      const actualColumns = actualSchema.tables[tableName].columns.map(col => col.name);
      const expectedColumns = expectedSchema.tables[tableName].columns;
      
      const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));
      const extraColumns = actualColumns.filter(col => !expectedColumns.includes(col));
      
      if (missingColumns.length > 0 || extraColumns.length > 0) {
        comparison.tables.columnDifferences.push({
          table: tableName,
          missing: missingColumns,
          extra: extraColumns
        });
      }
    }
  }
  
  // Compare indexes
  const actualIndexNames = actualSchema.indexes.map(idx => idx.name);
  const expectedIndexNames = EXPECTED_INDEXES;
  
  comparison.indexes.missing = expectedIndexNames.filter(idx => !actualIndexNames.includes(idx));
  comparison.indexes.extra = actualIndexNames.filter(idx => !expectedIndexNames.includes(idx));
  
  // Compare functions
  const actualFunctionNames = actualSchema.functions;
  const expectedFunctionNames = EXPECTED_FUNCTIONS;
  
  comparison.functions.missing = expectedFunctionNames.filter(func => !actualFunctionNames.includes(func));
  comparison.functions.extra = actualFunctionNames.filter(func => !expectedFunctionNames.includes(func));
  
  // Compare policies
  const actualPolicyNames = actualSchema.policies.map(policy => policy.name);
  const expectedPolicyNames = EXPECTED_POLICIES;
  
  comparison.policies.missing = expectedPolicyNames.filter(policy => !actualPolicyNames.includes(policy));
  comparison.policies.extra = actualPolicyNames.filter(policy => !expectedPolicyNames.includes(policy));
  
  return comparison;
}

/**
 * Generate SQL for missing schema elements
 */
function generateMigrationSQL(comparison) {
  console.log('Generating migration SQL...');
  
  const sqlStatements = [];
  
  // Add missing tables
  for (const tableName of comparison.tables.missing) {
    if (EXPECTED_COLUMNS[tableName]) {
      const columns = EXPECTED_COLUMNS[tableName].map(col => `${col} TEXT`).join(',\n  ');
      sqlStatements.push(`-- Create missing table: ${tableName}`);
      sqlStatements.push(`CREATE TABLE ${tableName} (\n  ${columns}\n);`);
      sqlStatements.push('');
    }
  }
  
  // Add missing columns
  for (const diff of comparison.tables.columnDifferences) {
    for (const column of diff.missing) {
      sqlStatements.push(`-- Add missing column: ${column} to table ${diff.table}`);
      sqlStatements.push(`ALTER TABLE ${diff.table} ADD COLUMN ${column} TEXT;`);
    }
    sqlStatements.push('');
  }
  
  // Add missing indexes
  for (const indexName of comparison.indexes.missing) {
    sqlStatements.push(`-- Create missing index: ${indexName}`);
    if (indexName.includes('rounds')) {
      sqlStatements.push(`CREATE INDEX ${indexName} ON rounds (status, end_time);`);
    } else if (indexName.includes('guesses')) {
      sqlStatements.push(`CREATE INDEX ${indexName} ON guesses (round_id, user_fid);`);
    } else if (indexName.includes('chat_messages')) {
      sqlStatements.push(`CREATE INDEX ${indexName} ON chat_messages (created_at);`);
    } else {
      sqlStatements.push(`-- TODO: Define index ${indexName} appropriately`);
    }
    sqlStatements.push('');
  }
  
  return sqlStatements.join('\n');
}

/**
 * Main validation function
 */
async function validateDatabaseSchema() {
  console.log('🔍 Database Schema Validator');
  console.log(`URL: ${SUPABASE_URL}`);
  
  try {
    // Step 1: Get actual schema
    console.log('\n📊 Retrieving actual database schema...');
    const actualSchema = await getActualDatabaseSchema();
    
    // Step 2: Get expected schema from migrations
    console.log('\n📋 Analyzing migration files...');
    const expectedSchema = await getExpectedSchemaFromMigrations();
    
    // Step 3: Compare schemas
    console.log('\n🔍 Comparing schemas...');
    const comparison = compareSchemas(actualSchema, expectedSchema);
    
    // Step 4: Generate migration SQL if needed
    const hasDifferences = 
      comparison.tables.missing.length > 0 ||
      comparison.tables.columnDifferences.length > 0 ||
      comparison.indexes.missing.length > 0 ||
      comparison.functions.missing.length > 0 ||
      comparison.policies.missing.length > 0;
    
    let migrationSQL = '';
    if (hasDifferences) {
      migrationSQL = generateMigrationSQL(comparison);
    }
    
    // Step 5: Generate report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTables: Object.keys(actualSchema.tables).length,
        expectedTables: EXPECTED_TABLES.length,
        missingTables: comparison.tables.missing.length,
        extraTables: comparison.tables.extra.length,
        totalIndexes: actualSchema.indexes.length,
        expectedIndexes: EXPECTED_INDEXES.length,
        missingIndexes: comparison.indexes.missing.length,
        totalFunctions: actualSchema.functions.length,
        expectedFunctions: EXPECTED_FUNCTIONS.length,
        missingFunctions: comparison.functions.missing.length,
        totalPolicies: actualSchema.policies.length,
        expectedPolicies: EXPECTED_POLICIES.length,
        missingPolicies: comparison.policies.missing.length,
        hasDifferences
      },
      comparison,
      migrationSQL,
      actualSchema,
      expectedSchema
    };
    
    // Save report
    const reportPath = path.join(PROJECT_ROOT, 'schema-validation-report.json');
    await fs.promises.writeFile(
      reportPath,
      JSON.stringify(report, null, 2)
    );
    
    // Print summary
    console.log('\n✅ Schema validation complete!');
    console.log(`📄 Report saved to: ${reportPath}`);
    
    console.log('\n📈 Summary:');
    console.log(`- Tables: ${report.summary.totalTables}/${report.summary.expectedTables}`);
    console.log(`- Missing tables: ${report.summary.missingTables}`);
    console.log(`- Extra tables: ${report.summary.extraTables}`);
    console.log(`- Indexes: ${report.summary.totalIndexes}/${report.summary.expectedIndexes}`);
    console.log(`- Missing indexes: ${report.summary.missingIndexes}`);
    console.log(`- Functions: ${report.summary.totalFunctions}/${report.summary.expectedFunctions}`);
    console.log(`- Missing functions: ${report.summary.missingFunctions}`);
    console.log(`- Policies: ${report.summary.totalPolicies}/${report.summary.expectedPolicies}`);
    console.log(`- Missing policies: ${report.summary.missingPolicies}`);
    
    if (hasDifferences) {
      console.log('\n⚠️ Schema differences detected!');
      
      if (comparison.tables.missing.length > 0) {
        console.log(`\n🔴 Missing tables: ${comparison.tables.missing.join(', ')}`);
      }
      
      if (comparison.indexes.missing.length > 0) {
        console.log(`\n🔴 Missing indexes: ${comparison.indexes.missing.join(', ')}`);
      }
      
      if (comparison.functions.missing.length > 0) {
        console.log(`\n🔴 Missing functions: ${comparison.functions.missing.join(', ')}`);
      }
      
      if (comparison.policies.missing.length > 0) {
        console.log(`\n🔴 Missing policies: ${comparison.policies.missing.join(', ')}`);
      }
      
      // Save migration SQL
      if (migrationSQL) {
        const migrationPath = path.join(PROJECT_ROOT, 'supabase', 'migrations', '999_auto_fix.sql');
        await fs.promises.writeFile(migrationPath, migrationSQL);
        console.log(`\n📝 Migration SQL saved to: ${migrationPath}`);
      }
    } else {
      console.log('\n✅ Schema is up to date!');
    }
    
    return report;
    
  } catch (error) {
    console.error('❌ Schema validation failed:', error);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  validateDatabaseSchema()
    .then(() => {
      console.log('\n🎉 Schema validation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Schema validation failed:', error);
      process.exit(1);
    });
}

module.exports = {
  validateDatabaseSchema,
  getActualDatabaseSchema,
  getExpectedSchemaFromMigrations,
  compareSchemas,
  generateMigrationSQL
};