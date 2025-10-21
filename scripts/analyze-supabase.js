#!/usr/bin/env node

/**
 * Supabase Analysis Script
 * 
 * This script performs a comprehensive analysis of the Supabase account
 * and compares it with the project files, focusing on analysis rather than
 * modifications to handle authentication issues.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const PROJECT_ROOT = path.join(__dirname, '..');
const ANALYSIS_REPORT_PATH = path.join(PROJECT_ROOT, 'supabase-analysis-report.json');

// Load environment variables
function loadEnvFile() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  const envVars = {};
  
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const [, key, value] = match;
          envVars[key] = value;
        }
      }
    }
  } catch (error) {
    console.warn('Could not load .env file:', error.message);
  }
  
  return envVars;
}

const envVars = loadEnvFile();
const SUPABASE_URL = envVars.SUPABASE_URL || envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_ACCESS_TOKEN;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Analysis state
const analysisState = {
  startTime: new Date().toISOString(),
  projectFiles: [],
  supabaseData: {},
  comparison: {},
  errors: [],
  warnings: []
};

/**
 * Test Supabase connection
 */
async function testSupabaseConnection() {
  console.log('Testing Supabase connection...');
  
  try {
    // Test basic connectivity
    const { data, error } = await supabase.from('information_schema.tables').select('count').limit(1);
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    analysisState.errors.push({
      type: 'CONNECTION_ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    return false;
  }
}

/**
 * Analyze project files
 */
async function analyzeProjectFiles() {
  console.log('Analyzing project files...');
  
  try {
    const files = [];
    
    async function scanDirectory(dirPath, relativePath = '') {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativeFilePath = path.join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip certain directories
          if (['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) {
            continue;
          }
          
          await scanDirectory(fullPath, relativeFilePath);
        } else {
          try {
            const stats = await fs.promises.stat(fullPath);
            const fileBuffer = await fs.promises.readFile(fullPath);
            const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
            
            files.push({
              path: fullPath,
              relativePath: relativeFilePath.replace(/\\/g, '/'),
              size: stats.size,
              modified: stats.mtime.toISOString(),
              created: stats.birthtime.toISOString(),
              hash,
              category: categorizeFile(entry.name),
              isBinary: isBinaryFile(entry.name)
            });
          } catch (fileError) {
            console.warn(`Warning: Could not process file ${fullPath}:`, fileError.message);
          }
        }
      }
    }
    
    await scanDirectory(PROJECT_ROOT);
    
    analysisState.projectFiles = files;
    console.log(`✅ Analyzed ${files.length} project files`);
    
    return files;
  } catch (error) {
    console.error('❌ Error analyzing project files:', error);
    analysisState.errors.push({
      type: 'PROJECT_ANALYSIS_ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Categorize file based on extension
 */
function categorizeFile(fileName) {
  const ext = path.extname(fileName).toLowerCase().slice(1);
  
  const categories = {
    DATABASE: ['sql', 'migrations'],
    CODE: ['ts', 'tsx', 'js', 'jsx'],
    CONFIG: ['json', 'env', 'md', 'yml', 'yaml'],
    ASSETS: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp'],
    STYLES: ['css', 'scss', 'sass'],
    BUILD: ['lock', 'tsbuildinfo', 'dockerfile']
  };
  
  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(ext)) {
      return category;
    }
  }
  
  return 'OTHER';
}

/**
 * Check if file is binary
 */
function isBinaryFile(fileName) {
  const binaryExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'pdf', 'lock', 'tsbuildinfo'];
  const ext = path.extname(fileName).toLowerCase().slice(1);
  return binaryExtensions.includes(ext);
}

/**
 * Analyze Supabase database schema
 */
async function analyzeSupabaseSchema() {
  console.log('Analyzing Supabase database schema...');
  
  try {
    const schema = {
      tables: [],
      columns: {},
      indexes: [],
      functions: [],
      policies: []
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
    
    schema.tables = tables.map(t => t.table_name);
    
    // Get columns for each table
    for (const tableName of schema.tables) {
      const { data: columns, error: columnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable, column_default')
        .eq('table_schema', 'public')
        .eq('table_name', tableName)
        .order('ordinal_position');
      
      if (!columnsError && columns) {
        schema.columns[tableName] = columns;
      }
    }
    
    // Get indexes
    try {
      const { data: indexes, error: indexesError } = await supabase
        .from('pg_indexes')
        .select('indexname, tablename, indexdef')
        .eq('schemaname', 'public');
      
      if (!indexesError && indexes) {
        schema.indexes = indexes;
      }
    } catch (error) {
      console.log('Could not retrieve indexes (might need admin access)');
    }
    
    analysisState.supabaseData.schema = schema;
    console.log(`✅ Analyzed schema with ${schema.tables.length} tables`);
    
    return schema;
  } catch (error) {
    console.error('❌ Error analyzing Supabase schema:', error);
    analysisState.errors.push({
      type: 'SCHEMA_ANALYSIS_ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Analyze Supabase storage (if accessible)
 */
async function analyzeSupabaseStorage() {
  console.log('Analyzing Supabase storage...');
  
  try {
    const storage = {
      buckets: [],
      accessible: false,
      error: null
    };
    
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      throw error;
    }
    
    storage.buckets = buckets;
    storage.accessible = true;
    
    // Try to get file lists from buckets
    for (const bucket of buckets) {
      try {
        const { data: files, error: filesError } = await supabase.storage
          .from(bucket.name)
          .list('', { limit: 100 });
        
        if (!filesError && files) {
          bucket.files = files;
          bucket.fileCount = files.length;
        }
      } catch (fileError) {
        console.warn(`Could not list files in bucket ${bucket.name}:`, fileError.message);
        bucket.fileCount = 0;
        bucket.error = fileError.message;
      }
    }
    
    analysisState.supabaseData.storage = storage;
    console.log(`✅ Analyzed ${storage.buckets.length} storage buckets`);
    
    return storage;
  } catch (error) {
    console.error('❌ Error analyzing Supabase storage:', error);
    analysisState.supabaseData.storage = {
      buckets: [],
      accessible: false,
      error: error.message
    };
    analysisState.warnings.push({
      type: 'STORAGE_ACCESS_ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    return null;
  }
}

/**
 * Analyze environment variables
 */
async function analyzeEnvironmentVariables() {
  console.log('Analyzing environment variables...');
  
  try {
    const envFiles = ['.env', 'env.example'];
    const envData = {};
    
    for (const envFile of envFiles) {
      const envPath = path.join(PROJECT_ROOT, envFile);
      
      if (fs.existsSync(envPath)) {
        const content = await fs.promises.readFile(envPath, 'utf8');
        const variables = parseEnvFile(content);
        envData[envFile] = variables;
      }
    }
    
    analysisState.supabaseData.environment = envData;
    console.log(`✅ Analyzed ${Object.keys(envData).length} environment files`);
    
    return envData;
  } catch (error) {
    console.error('❌ Error analyzing environment variables:', error);
    analysisState.errors.push({
      type: 'ENV_ANALYSIS_ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    return null;
  }
}

/**
 * Parse environment file
 */
function parseEnvFile(content) {
  const variables = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        variables[key] = value;
      }
    }
  }
  
  return variables;
}

/**
 * Perform security analysis
 */
async function performSecurityAnalysis() {
  console.log('Performing security analysis...');
  
  try {
    const securityIssues = [];
    const sensitivePatterns = [
      /password\s*=\s*['"]\w+['"]/gi,
      /api[_-]?key\s*=\s*['"][\w-]+['"]/gi,
      /secret[_-]?key\s*=\s*['"][\w-]+['"]/gi,
      /token\s*=\s*['"][\w-\.]+['"]/gi,
      /private[_-]?key\s*=\s*['"][\w-\/]+['"]/gi,
      /sbp_[a-f0-9]{40}/gi,
      /sk-[a-zA-Z0-9]{24}/gi,
      /ghp_[a-zA-Z0-9]{36}/gi,
    ];
    
    for (const file of analysisState.projectFiles) {
      if (file.category === 'CODE' || file.category === 'CONFIG' && !file.isBinary) {
        try {
          const content = await fs.promises.readFile(file.path, 'utf8');
          
          for (const pattern of sensitivePatterns) {
            const matches = content.match(pattern);
            if (matches) {
              securityIssues.push({
                type: 'SENSITIVE_DATA',
                file: file.relativePath,
                pattern: pattern.source,
                matches: matches.length,
                severity: 'HIGH'
              });
            }
          }
          
          // Check for eval() usage
          if (content.includes('eval(')) {
            securityIssues.push({
              type: 'UNSAFE_EVAL',
              file: file.relativePath,
              severity: 'MEDIUM'
            });
          }
          
          // Check for innerHTML usage
          if (content.includes('innerHTML')) {
            securityIssues.push({
              type: 'POTENTIAL_XSS',
              file: file.relativePath,
              severity: 'MEDIUM'
            });
          }
          
        } catch (error) {
          // Skip binary files or read errors
        }
      }
    }
    
    analysisState.comparison.securityIssues = securityIssues;
    console.log(`✅ Found ${securityIssues.length} security issues`);
    
    return securityIssues;
  } catch (error) {
    console.error('❌ Error performing security analysis:', error);
    analysisState.errors.push({
      type: 'SECURITY_ANALYSIS_ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    return [];
  }
}

/**
 * Generate comparison analysis
 */
function generateComparison() {
  console.log('Generating comparison analysis...');
  
  try {
    const comparison = {
      projectSummary: {
        totalFiles: analysisState.projectFiles.length,
        categories: {},
        totalSize: analysisState.projectFiles.reduce((sum, file) => sum + file.size, 0)
      },
      supabaseSummary: {
        tables: analysisState.supabaseData.schema?.tables?.length || 0,
        storageBuckets: analysisState.supabaseData.storage?.buckets?.length || 0,
        storageAccessible: analysisState.supabaseData.storage?.accessible || false
      },
      recommendations: []
    };
    
    // Categorize project files
    for (const file of analysisState.projectFiles) {
      if (!comparison.projectSummary.categories[file.category]) {
        comparison.projectSummary.categories[file.category] = 0;
      }
      comparison.projectSummary.categories[file.category]++;
    }
    
    // Generate recommendations
    if (!analysisState.supabaseData.storage?.accessible) {
      comparison.recommendations.push({
        type: 'STORAGE_ACCESS',
        priority: 'HIGH',
        message: 'Supabase storage is not accessible. Check service key permissions.'
      });
    }
    
    if (analysisState.comparison.securityIssues.length > 0) {
      const criticalIssues = analysisState.comparison.securityIssues.filter(issue => issue.severity === 'HIGH');
      if (criticalIssues.length > 0) {
        comparison.recommendations.push({
          type: 'SECURITY',
          priority: 'CRITICAL',
          message: `Address ${criticalIssues.length} critical security issues before deployment.`
        });
      }
    }
    
    if (analysisState.errors.length > 0) {
      comparison.recommendations.push({
        type: 'ERRORS',
        priority: 'HIGH',
        message: `Resolve ${analysisState.errors.length} errors before proceeding with synchronization.`
      });
    }
    
    analysisState.comparison = comparison;
    console.log('✅ Generated comparison analysis');
    
    return comparison;
  } catch (error) {
    console.error('❌ Error generating comparison:', error);
    analysisState.errors.push({
      type: 'COMPARISON_ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Generate final analysis report
 */
function generateAnalysisReport() {
  console.log('Generating final analysis report...');
  
  try {
    const endTime = new Date().toISOString();
    const duration = Date.now() - new Date(analysisState.startTime).getTime();
    
    const report = {
      metadata: {
        startTime: analysisState.startTime,
        endTime,
        duration: Math.round(duration / 1000), // seconds
        version: '1.0.0'
      },
      summary: {
        totalProjectFiles: analysisState.projectFiles.length,
        totalErrors: analysisState.errors.length,
        totalWarnings: analysisState.warnings.length,
        securityIssues: analysisState.comparison.securityIssues?.length || 0,
        supabaseConnected: analysisState.errors.filter(e => e.type === 'CONNECTION_ERROR').length === 0,
        storageAccessible: analysisState.supabaseData.storage?.accessible || false
      },
      project: {
        files: analysisState.projectFiles,
        summary: analysisState.comparison.projectSummary
      },
      supabase: analysisState.supabaseData,
      comparison: analysisState.comparison,
      errors: analysisState.errors,
      warnings: analysisState.warnings,
      recommendations: analysisState.comparison.recommendations
    };
    
    return report;
  } catch (error) {
    console.error('❌ Error generating analysis report:', error);
    throw error;
  }
}

/**
 * Main analysis function
 */
async function performAnalysis() {
  console.log('🔍 Supabase Analysis Tool');
  console.log(`Started at: ${analysisState.startTime}`);
  console.log(`Project root: ${PROJECT_ROOT}`);
  
  try {
    // Test connection first
    const isConnected = await testSupabaseConnection();
    
    if (!isConnected) {
      console.log('\n⚠️ Connection failed. Proceeding with project-only analysis...');
    }
    
    // Analyze project files
    await analyzeProjectFiles();
    
    // Analyze Supabase components (if connected)
    if (isConnected) {
      await analyzeSupabaseSchema();
      await analyzeSupabaseStorage();
    }
    
    // Analyze environment variables
    await analyzeEnvironmentVariables();
    
    // Perform security analysis
    await performSecurityAnalysis();
    
    // Generate comparison
    generateComparison();
    
    // Generate final report
    const report = generateAnalysisReport();
    
    // Save report
    await fs.promises.writeFile(
      ANALYSIS_REPORT_PATH,
      JSON.stringify(report, null, 2)
    );
    
    // Print summary
    console.log('\n✅ Analysis completed!');
    console.log(`📄 Report saved to: ${ANALYSIS_REPORT_PATH}`);
    
    console.log('\n📈 Summary:');
    console.log(`- Duration: ${report.metadata.duration} seconds`);
    console.log(`- Project files: ${report.summary.totalProjectFiles}`);
    console.log(`- Errors: ${report.summary.totalErrors}`);
    console.log(`- Warnings: ${report.summary.totalWarnings}`);
    console.log(`- Security issues: ${report.summary.securityIssues}`);
    console.log(`- Supabase connected: ${report.summary.supabaseConnected ? 'Yes' : 'No'}`);
    console.log(`- Storage accessible: ${report.summary.storageAccessible ? 'Yes' : 'No'}`);
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => {
        console.log(`- [${rec.priority}] ${rec.message}`);
      });
    }
    
    return report;
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    
    // Save error report
    const errorReport = {
      ...analysisState,
      endTime: new Date().toISOString(),
      fatalError: {
        message: error.message,
        stack: error.stack
      }
    };
    
    await fs.promises.writeFile(
      ANALYSIS_REPORT_PATH.replace('.json', '-error.json'),
      JSON.stringify(errorReport, null, 2)
    );
    
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  performAnalysis()
    .then(() => {
      console.log('\n🎉 Analysis completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Analysis failed:', error);
      process.exit(1);
    });
}

module.exports = {
  performAnalysis,
  testSupabaseConnection,
  analyzeProjectFiles,
  analyzeSupabaseSchema,
  analyzeSupabaseStorage,
  performSecurityAnalysis
};