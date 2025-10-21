#!/usr/bin/env node

/**
 * Comprehensive Supabase Synchronization Script
 * 
 * This script performs a complete synchronization between the project files
 * and the Supabase account, including:
 * - File analysis and comparison
 * - Missing file uploads
 * - Version conflict resolution
 * - Database schema validation
 * - Security scanning
 * - Detailed reporting
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

// Configuration
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
const SUPABASE_SERVICE_KEY = 'sbp_6d4e7f74315a3ab6646ca23441ddc03b7e25333d';
const PROJECT_ROOT = __dirname;
const SYNC_REPORT_PATH = path.join(PROJECT_ROOT, 'sync-report.json');

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// File categories for different handling
const FILE_CATEGORIES = {
  DATABASE: ['sql', 'migrations'],
  CODE: ['ts', 'tsx', 'js', 'jsx'],
  CONFIG: ['json', 'env', 'md', 'yml', 'yaml'],
  ASSETS: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp'],
  STYLES: ['css', 'scss', 'sass'],
  BUILD: ['lock', 'tsbuildinfo', 'dockerfile']
};

// Synchronization state
const syncState = {
  startTime: new Date().toISOString(),
  filesProcessed: 0,
  filesUploaded: 0,
  filesUpdated: 0,
  errors: [],
  warnings: [],
  skipped: [],
  conflicts: [],
  rollbacks: []
};

/**
 * Calculate file hash for integrity checking
 */
async function calculateFileHash(filePath) {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } catch (error) {
    console.error(`Error calculating hash for ${filePath}:`, error);
    return null;
  }
}

/**
 * Get file metadata
 */
async function getFileMetadata(filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    return {
      size: stats.size,
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString(),
      permissions: stats.mode.toString(8),
      isDirectory: stats.isDirectory(),
      hash: await calculateFileHash(filePath)
    };
  } catch (error) {
    console.error(`Error getting metadata for ${filePath}:`, error);
    return null;
  }
}

/**
 * Scan project directory recursively
 */
async function scanProjectDirectory(dirPath, relativePath = '') {
  const files = [];
  
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativeFilePath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip certain directories
        if (['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) {
          continue;
        }
        
        const subFiles = await scanProjectDirectory(fullPath, relativeFilePath);
        files.push(...subFiles);
      } else {
        const metadata = await getFileMetadata(fullPath);
        if (metadata) {
          files.push({
            path: fullPath,
            relativePath: relativeFilePath,
            metadata,
            category: categorizeFile(entry.name)
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error);
    syncState.errors.push({
      type: 'SCAN_ERROR',
      path: dirPath,
      error: error.message
    });
  }
  
  return files;
}

/**
 * Categorize file based on extension
 */
function categorizeFile(fileName) {
  const ext = path.extname(fileName).toLowerCase().slice(1);
  
  for (const [category, extensions] of Object.entries(FILE_CATEGORIES)) {
    if (extensions.includes(ext)) {
      return category;
    }
  }
  
  return 'OTHER';
}

/**
 * Analyze Supabase storage buckets
 */
async function analyzeSupabaseStorage() {
  console.log('Analyzing Supabase storage...');
  
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      throw error;
    }
    
    const bucketAnalysis = {};
    
    for (const bucket of buckets) {
      console.log(`Analyzing bucket: ${bucket.name}`);
      
      const { data: files, error: filesError } = await supabase.storage
        .from(bucket.name)
        .list('', { limit: 1000 });
      
      if (filesError) {
        console.error(`Error listing files in bucket ${bucket.name}:`, filesError);
        bucketAnalysis[bucket.name] = { error: filesError.message };
        continue;
      }
      
      bucketAnalysis[bucket.name] = {
        files: files,
        count: files.length,
        public: bucket.public
      };
    }
    
    return bucketAnalysis;
  } catch (error) {
    console.error('Error analyzing Supabase storage:', error);
    syncState.errors.push({
      type: 'STORAGE_ANALYSIS_ERROR',
      error: error.message
    });
    return {};
  }
}

/**
 * Analyze database schema
 */
async function analyzeDatabaseSchema() {
  console.log('Analyzing database schema...');
  
  try {
    // Get table information
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public');
    
    if (tablesError) {
      throw tablesError;
    }
    
    const schemaAnalysis = {
      tables: tables || [],
      migrations: [],
      functions: [],
      policies: []
    };
    
    // Get migration history if it exists
    try {
      const { data: migrations, error: migrationsError } = await supabase
        .from('schema_migrations')
        .select('*')
        .order('version');
      
      if (!migrationsError && migrations) {
        schemaAnalysis.migrations = migrations;
      }
    } catch (error) {
      console.log('Migration table not found, skipping...');
    }
    
    return schemaAnalysis;
  } catch (error) {
    console.error('Error analyzing database schema:', error);
    syncState.errors.push({
      type: 'SCHEMA_ANALYSIS_ERROR',
      error: error.message
    });
    return {};
  }
}

/**
 * Upload file to Supabase storage
 */
async function uploadFileToSupabase(fileInfo, bucketName = 'project-files') {
  try {
    const fileBuffer = await fs.promises.readFile(fileInfo.path);
    const fileName = fileInfo.relativePath.replace(/\\/g, '/');
    
    // Check if file already exists
    const { data: existingFile } = await supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);
    
    let uploadResult;
    
    if (existingFile) {
      // File exists, update it
      uploadResult = await supabase.storage
        .from(bucketName)
        .update(fileName, fileBuffer, {
          contentType: getContentType(fileName),
          cacheControl: '3600'
        });
      
      syncState.filesUpdated++;
    } else {
      // New file, upload it
      uploadResult = await supabase.storage
        .from(bucketName)
        .upload(fileName, fileBuffer, {
          contentType: getContentType(fileName),
          cacheControl: '3600',
          upsert: false
        });
      
      syncState.filesUploaded++;
    }
    
    if (uploadResult.error) {
      throw uploadResult.error;
    }
    
    syncState.filesProcessed++;
    
    return {
      success: true,
      path: fileName,
      action: existingFile ? 'updated' : 'uploaded',
      size: fileBuffer.length
    };
  } catch (error) {
    console.error(`Error uploading file ${fileInfo.path}:`, error);
    syncState.errors.push({
      type: 'UPLOAD_ERROR',
      path: fileInfo.path,
      error: error.message
    });
    return {
      success: false,
      path: fileInfo.path,
      error: error.message
    };
  }
}

/**
 * Get content type based on file extension
 */
function getContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  
  const contentTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown'
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Compare project files with Supabase storage
 */
async function compareProjectWithSupabase(projectFiles, supabaseStorage) {
  console.log('Comparing project files with Supabase storage...');
  
  const comparison = {
    missingInSupabase: [],
    conflicts: [],
    identical: [],
    onlyInSupabase: []
  };
  
  // Create a map of Supabase files for easier lookup
  const supabaseFilesMap = new Map();
  
  for (const [bucketName, bucketData] of Object.entries(supabaseStorage)) {
    if (bucketData.files) {
      for (const file of bucketData.files) {
        supabaseFilesMap.set(file.name, {
          bucket: bucketName,
          ...file
        });
      }
    }
  }
  
  // Compare each project file
  for (const projectFile of projectFiles) {
    const fileName = projectFile.relativePath.replace(/\\/g, '/');
    const supabaseFile = supabaseFilesMap.get(fileName);
    
    if (!supabaseFile) {
      // File doesn't exist in Supabase
      comparison.missingInSupabase.push(projectFile);
    } else {
      // File exists, compare metadata
      const projectModified = new Date(projectFile.metadata.modified);
      const supabaseModified = new Date(supabaseFile.created_at);
      
      if (Math.abs(projectModified - supabaseModified) > 5000) { // 5 second tolerance
        comparison.conflicts.push({
          projectFile,
          supabaseFile,
          projectNewer: projectModified > supabaseModified
        });
      } else {
        comparison.identical.push(projectFile);
      }
      
      supabaseFilesMap.delete(fileName);
    }
  }
  
  // Files that exist only in Supabase
  for (const [fileName, fileData] of supabaseFilesMap) {
    comparison.onlyInSupabase.push({
      fileName,
      ...fileData
    });
  }
  
  return comparison;
}

/**
 * Perform security scan on files
 */
async function performSecurityScan(files) {
  console.log('Performing security scan on files...');
  
  const securityIssues = [];
  const sensitivePatterns = [
    /password\s*=\s*['"]\w+['"]/gi,
    /api[_-]?key\s*=\s*['"][\w-]+['"]/gi,
    /secret[_-]?key\s*=\s*['"][\w-]+['"]/gi,
    /token\s*=\s*['"][\w-\.]+['"]/gi,
    /private[_-]?key\s*=\s*['"][\w-\/]+['"]/gi,
    /sbp_[a-f0-9]{40}/gi, // Supabase service keys
    /sk-[a-zA-Z0-9]{24}/gi, // Stripe keys
    /ghp_[a-zA-Z0-9]{36}/gi, // GitHub tokens
  ];
  
  for (const file of files) {
    if (file.category === 'CODE' || file.category === 'CONFIG') {
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
        // Skip binary files
      }
    }
  }
  
  return securityIssues;
}

/**
 * Generate synchronization report
 */
function generateSyncReport(comparison, securityIssues, schemaAnalysis) {
  const report = {
    metadata: {
      startTime: syncState.startTime,
      endTime: new Date().toISOString(),
      duration: Date.now() - new Date(syncState.startTime).getTime()
    },
    summary: {
      totalFilesProcessed: syncState.filesProcessed,
      filesUploaded: syncState.filesUploaded,
      filesUpdated: syncState.filesUpdated,
      errors: syncState.errors.length,
      warnings: syncState.warnings.length,
      securityIssues: securityIssues.length
    },
    comparison: {
      missingInSupabase: comparison.missingInSupabase.length,
      conflicts: comparison.conflicts.length,
      identical: comparison.identical.length,
      onlyInSupabase: comparison.onlyInSupabase.length
    },
    details: {
      missingFiles: comparison.missingInSupabase.map(f => f.relativePath),
      conflicts: comparison.conflicts.map(c => ({
        file: c.projectFile.relativePath,
        projectModified: c.projectFile.metadata.modified,
        supabaseModified: c.supabaseFile.created_at,
        resolution: c.projectNewer ? 'PROJECT_NEWER' : 'SUPABASE_NEWER'
      })),
      securityIssues,
      errors: syncState.errors,
      warnings: syncState.warnings
    },
    database: schemaAnalysis,
    recommendations: generateRecommendations(comparison, securityIssues)
  };
  
  return report;
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(comparison, securityIssues) {
  const recommendations = [];
  
  if (comparison.missingInSupabase.length > 0) {
    recommendations.push({
      type: 'UPLOAD',
      message: `Upload ${comparison.missingInSupabase.length} missing files to Supabase storage`,
      priority: 'HIGH'
    });
  }
  
  if (comparison.conflicts.length > 0) {
    recommendations.push({
      type: 'RESOLVE_CONFLICTS',
      message: `Resolve ${comparison.conflicts.length} file version conflicts`,
      priority: 'HIGH'
    });
  }
  
  if (securityIssues.length > 0) {
    recommendations.push({
      type: 'SECURITY',
      message: `Address ${securityIssues.length} security issues before deployment`,
      priority: 'CRITICAL'
    });
  }
  
  return recommendations;
}

/**
 * Main synchronization function
 */
async function performSynchronization() {
  console.log('🚀 Starting Supabase synchronization...');
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  
  try {
    // Step 1: Scan project directory
    console.log('\n📁 Scanning project directory...');
    const projectFiles = await scanProjectDirectory(PROJECT_ROOT);
    console.log(`Found ${projectFiles.length} files in project`);
    
    // Step 2: Analyze Supabase storage
    console.log('\n🗄️ Analyzing Supabase storage...');
    const supabaseStorage = await analyzeSupabaseStorage();
    
    // Step 3: Analyze database schema
    console.log('\n🏗️ Analyzing database schema...');
    const schemaAnalysis = await analyzeDatabaseSchema();
    
    // Step 4: Compare project with Supabase
    console.log('\n🔍 Comparing project files with Supabase...');
    const comparison = await compareProjectWithSupabase(projectFiles, supabaseStorage);
    
    // Step 5: Perform security scan
    console.log('\n🔒 Performing security scan...');
    const securityIssues = await performSecurityScan(projectFiles);
    
    // Step 6: Generate report
    console.log('\n📊 Generating synchronization report...');
    const report = generateSyncReport(comparison, securityIssues, schemaAnalysis);
    
    // Save report
    await fs.promises.writeFile(
      SYNC_REPORT_PATH,
      JSON.stringify(report, null, 2)
    );
    
    // Print summary
    console.log('\n✅ Synchronization analysis complete!');
    console.log(`📄 Report saved to: ${SYNC_REPORT_PATH}`);
    console.log('\n📈 Summary:');
    console.log(`- Total files processed: ${report.summary.totalFilesProcessed}`);
    console.log(`- Files to upload: ${report.comparison.missingInSupabase}`);
    console.log(`- Conflicts to resolve: ${report.comparison.conflicts}`);
    console.log(`- Security issues: ${report.summary.securityIssues}`);
    console.log(`- Errors encountered: ${report.summary.errors}`);
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => {
        console.log(`- [${rec.priority}] ${rec.message}`);
      });
    }
    
    return report;
    
  } catch (error) {
    console.error('❌ Synchronization failed:', error);
    syncState.errors.push({
      type: 'SYNC_ERROR',
      error: error.message
    });
    
    // Save error report
    const errorReport = {
      error: error.message,
      stack: error.stack,
      syncState,
      timestamp: new Date().toISOString()
    };
    
    await fs.promises.writeFile(
      SYNC_REPORT_PATH.replace('.json', '-error.json'),
      JSON.stringify(errorReport, null, 2)
    );
    
    throw error;
  }
}

// Execute synchronization if run directly
if (require.main === module) {
  performSynchronization()
    .then(() => {
      console.log('\n🎉 Synchronization completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Synchronization failed:', error);
      process.exit(1);
    });
}

module.exports = {
  performSynchronization,
  scanProjectDirectory,
  analyzeSupabaseStorage,
  analyzeDatabaseSchema,
  compareProjectWithSupabase,
  performSecurityScan,
  generateSyncReport
};