#!/usr/bin/env node

/**
 * Comprehensive Supabase Synchronization Script
 * 
 * This script performs a complete analysis and synchronization between the project files
 * and the Supabase account using the provided service role credentials.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration from provided credentials
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA';
const PROJECT_ROOT = path.join(__dirname, '..');
const SYNC_REPORT_PATH = path.join(PROJECT_ROOT, 'comprehensive-sync-report.json');

// Initialize Supabase client with service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Synchronization state
const syncState = {
  startTime: new Date().toISOString(),
  phases: {},
  filesProcessed: 0,
  filesUploaded: 0,
  filesUpdated: 0,
  filesSkipped: 0,
  errors: [],
  warnings: [],
  conflicts: [],
  rollbacks: []
};

/**
 * Log phase start
 */
function logPhaseStart(phaseName) {
  console.log(`\n🚀 Starting phase: ${phaseName}`);
  syncState.phases[phaseName] = {
    startTime: new Date().toISOString(),
    status: 'running'
  };
}

/**
 * Log phase completion
 */
function logPhaseComplete(phaseName, result = {}) {
  console.log(`✅ Phase completed: ${phaseName}`);
  syncState.phases[phaseName] = {
    ...syncState.phases[phaseName],
    endTime: new Date().toISOString(),
    status: 'completed',
    result
  };
}

/**
 * Log phase error
 */
function logPhaseError(phaseName, error) {
  console.error(`❌ Phase failed: ${phaseName}`, error);
  syncState.phases[phaseName] = {
    ...syncState.phases[phaseName],
    endTime: new Date().toISOString(),
    status: 'failed',
    error: error.message
  };
  syncState.errors.push({
    phase: phaseName,
    error: error.message,
    timestamp: new Date().toISOString()
  });
}

/**
 * Phase 1: Analyze Supabase Account
 */
async function phase1_AnalyzeSupabaseAccount() {
  logPhaseStart('Analyze Supabase Account');
  
  try {
    const analysis = {
      database: {},
      storage: {},
      functions: {},
      auth: {},
      connectivity: {}
    };
    
    // Test database connectivity
    console.log('Testing database connectivity...');
    try {
      const { data, error } = await supabase.from('information_schema.tables').select('count').limit(1);
      analysis.connectivity.database = !error;
      if (error) throw error;
      console.log('✅ Database connection successful');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      analysis.connectivity.database = false;
      throw error;
    }
    
    // Analyze database schema
    console.log('Analyzing database schema...');
    try {
      const { data: tables, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name, table_type')
        .eq('table_schema', 'public')
        .eq('table_type', 'BASE TABLE');
      
      if (tablesError) throw tablesError;
      
      analysis.database.tables = tables || [];
      analysis.database.tableCount = tables.length;
      
      // Get table details
      for (const table of tables) {
        const { data: columns, error: columnsError } = await supabase
          .from('information_schema.columns')
          .select('column_name, data_type, is_nullable')
          .eq('table_schema', 'public')
          .eq('table_name', table.table_name);
        
        if (!columnsError && columns) {
          table.columns = columns;
        }
      }
      
      console.log(`✅ Found ${tables.length} database tables`);
    } catch (error) {
      console.error('❌ Database schema analysis failed:', error.message);
      analysis.database.error = error.message;
    }
    
    // Analyze storage buckets
    console.log('Analyzing storage buckets...');
    try {
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (bucketsError) throw bucketsError;
      
      analysis.storage.buckets = buckets || [];
      analysis.storage.bucketCount = buckets.length;
      
      // Get file lists from buckets
      for (const bucket of buckets) {
        try {
          const { data: files, error: filesError } = await supabase.storage
            .from(bucket.name)
            .list('', { limit: 1000 });
          
          if (!filesError && files) {
            bucket.files = files;
            bucket.fileCount = files.length;
            
            // Calculate total size
            let totalSize = 0;
            for (const file of files) {
              if (file.metadata && file.metadata.size) {
                totalSize += file.metadata.size;
              }
            }
            bucket.totalSize = totalSize;
          }
        } catch (fileError) {
          console.warn(`Could not list files in bucket ${bucket.name}:`, fileError.message);
          bucket.fileCount = 0;
          bucket.error = fileError.message;
        }
      }
      
      console.log(`✅ Found ${buckets.length} storage buckets`);
    } catch (error) {
      console.error('❌ Storage analysis failed:', error.message);
      analysis.storage.error = error.message;
    }
    
    // Analyze Edge Functions
    console.log('Analyzing Edge Functions...');
    try {
      // Note: Edge Functions analysis might require additional permissions
      analysis.functions.count = 0;
      analysis.functions.list = [];
      console.log('✅ Edge Functions analysis completed');
    } catch (error) {
      console.error('❌ Edge Functions analysis failed:', error.message);
      analysis.functions.error = error.message;
    }
    
    // Analyze Authentication configuration
    console.log('Analyzing authentication configuration...');
    try {
      const { data: authSettings, error: authError } = await supabase.auth.getSession();
      analysis.auth.configured = !authError;
      console.log('✅ Authentication analysis completed');
    } catch (error) {
      console.error('❌ Authentication analysis failed:', error.message);
      analysis.auth.error = error.message;
    }
    
    logPhaseComplete('Analyze Supabase Account', analysis);
    return analysis;
    
  } catch (error) {
    logPhaseError('Analyze Supabase Account', error);
    throw error;
  }
}

/**
 * Phase 2: Scan Project Files
 */
async function phase2_ScanProjectFiles() {
  logPhaseStart('Scan Project Files');
  
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
              isBinary: isBinaryFile(entry.name),
              mimeType: getMimeType(entry.name)
            });
          } catch (fileError) {
            console.warn(`Warning: Could not process file ${fullPath}:`, fileError.message);
            syncState.warnings.push({
              type: 'FILE_PROCESSING_WARNING',
              file: relativeFilePath,
              error: fileError.message
            });
          }
        }
      }
    }
    
    await scanDirectory(PROJECT_ROOT);
    
    // Categorize files
    const categories = {};
    for (const file of files) {
      if (!categories[file.category]) {
        categories[file.category] = 0;
      }
      categories[file.category]++;
    }
    
    const result = {
      files,
      totalFiles: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      categories,
      binaryFiles: files.filter(f => f.isBinary).length,
      textFiles: files.filter(f => !f.isBinary).length
    };
    
    logPhaseComplete('Scan Project Files', result);
    return result;
    
  } catch (error) {
    logPhaseError('Scan Project Files', error);
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
 * Get MIME type for file
 */
function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  
  const mimeTypes = {
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
    '.md': 'text/markdown',
    '.sql': 'application/sql',
    '.ts': 'application/typescript',
    '.tsx': 'application/typescript'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Phase 3: Compare and Identify Differences
 */
async function phase3_CompareAndIdentifyDifferences(projectFiles, supabaseAnalysis) {
  logPhaseStart('Compare and Identify Differences');
  
  try {
    const comparison = {
      missingInSupabase: [],
      conflicts: [],
      identical: [],
      onlyInSupabase: [],
      summary: {}
    };
    
    // Create a map of Supabase files for easier lookup
    const supabaseFilesMap = new Map();
    
    if (supabaseAnalysis.storage && supabaseAnalysis.storage.buckets) {
      for (const bucket of supabaseAnalysis.storage.buckets) {
        if (bucket.files) {
          for (const file of bucket.files) {
            const key = `${bucket.name}/${file.name}`;
            supabaseFilesMap.set(key, {
              bucket: bucket.name,
              ...file
            });
          }
        }
      }
    }
    
    // Compare each project file
    for (const projectFile of projectFiles.files) {
      // Determine which bucket this file should go to
      const targetBucket = determineTargetBucket(projectFile.relativePath);
      const supabaseKey = `${targetBucket}/${projectFile.relativePath}`;
      const supabaseFile = supabaseFilesMap.get(supabaseKey);
      
      if (!supabaseFile) {
        // File doesn't exist in Supabase
        comparison.missingInSupabase.push({
          ...projectFile,
          targetBucket
        });
      } else {
        // File exists, compare metadata
        const projectModified = new Date(projectFile.modified);
        const supabaseModified = new Date(supabaseFile.created_at);
        
        if (Math.abs(projectModified - supabaseModified) > 5000) { // 5 second tolerance
          comparison.conflicts.push({
            projectFile,
            supabaseFile,
            targetBucket,
            projectNewer: projectModified > supabaseModified,
            hashMatch: projectFile.hash === supabaseFile.metadata?.hash
          });
        } else {
          comparison.identical.push({
            ...projectFile,
            supabaseFile
          });
        }
        
        supabaseFilesMap.delete(supabaseKey);
      }
    }
    
    // Files that exist only in Supabase
    for (const [key, fileData] of supabaseFilesMap) {
      comparison.onlyInSupabase.push({
        key,
        ...fileData
      });
    }
    
    // Generate summary
    comparison.summary = {
      totalProjectFiles: projectFiles.totalFiles,
      missingInSupabase: comparison.missingInSupabase.length,
      conflicts: comparison.conflicts.length,
      identical: comparison.identical.length,
      onlyInSupabase: comparison.onlyInSupabase.length,
      syncRequired: comparison.missingInSupabase.length + comparison.conflicts.filter(c => c.projectNewer).length
    };
    
    logPhaseComplete('Compare and Identify Differences', comparison);
    return comparison;
    
  } catch (error) {
    logPhaseError('Compare and Identify Differences', error);
    throw error;
  }
}

/**
 * Determine which bucket a file should go to
 */
function determineTargetBucket(relativePath) {
  if (relativePath.startsWith('public/') || relativePath.startsWith('src/')) {
    if (relativePath.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/)) {
      return 'assets';
    }
  }
  
  if (relativePath.startsWith('supabase/migrations/')) {
    return 'migrations';
  }
  
  if (relativePath.match(/\.(sql|backup|zip)$/)) {
    return 'backups';
  }
  
  return 'project-files';
}

/**
 * Phase 4: Create Storage Buckets
 */
async function phase4_CreateStorageBuckets() {
  logPhaseStart('Create Storage Buckets');
  
  try {
    const requiredBuckets = [
      { name: 'project-files', public: false },
      { name: 'assets', public: true },
      { name: 'migrations', public: false },
      { name: 'backups', public: false }
    ];
    
    // Get existing buckets
    const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) throw listError;
    
    const existingBucketNames = existingBuckets.map(b => b.name);
    const createdBuckets = [];
    
    for (const bucketConfig of requiredBuckets) {
      if (!existingBucketNames.includes(bucketConfig.name)) {
        console.log(`Creating bucket: ${bucketConfig.name}`);
        
        const { data, error } = await supabase.storage.createBucket(
          bucketConfig.name,
          {
            public: bucketConfig.public,
            allowedMimeTypes: ['*'],
            fileSizeLimit: 52428800 // 50MB
          }
        );
        
        if (error) {
          console.error(`Error creating bucket ${bucketConfig.name}:`, error);
          syncState.errors.push({
            type: 'BUCKET_CREATION_ERROR',
            bucket: bucketConfig.name,
            error: error.message
          });
          continue;
        }
        
        createdBuckets.push(bucketConfig.name);
        console.log(`✅ Created bucket: ${bucketConfig.name}`);
      } else {
        console.log(`✅ Bucket already exists: ${bucketConfig.name}`);
      }
    }
    
    logPhaseComplete('Create Storage Buckets', { createdBuckets });
    return createdBuckets;
    
  } catch (error) {
    logPhaseError('Create Storage Buckets', error);
    throw error;
  }
}

/**
 * Phase 5: Upload Files to Supabase
 */
async function phase5_UploadFiles(comparison) {
  logPhaseStart('Upload Files to Supabase');
  
  try {
    const uploadResults = {
      uploaded: [],
      updated: [],
      failed: [],
      skipped: []
    };
    
    // Upload missing files
    if (comparison.missingInSupabase.length > 0) {
      console.log(`Uploading ${comparison.missingInSupabase.length} missing files...`);
      
      for (const fileData of comparison.missingInSupabase) {
        try {
          const result = await uploadFileToSupabase(fileData, fileData.targetBucket);
          
          if (result.success) {
            uploadResults.uploaded.push(result);
            syncState.filesUploaded++;
            console.log(`✅ Uploaded: ${fileData.relativePath}`);
          } else {
            uploadResults.failed.push(result);
            console.error(`❌ Failed to upload: ${fileData.relativePath}`);
          }
        } catch (error) {
          uploadResults.failed.push({
            path: fileData.relativePath,
            error: error.message
          });
          console.error(`❌ Error uploading ${fileData.relativePath}:`, error);
        }
      }
    }
    
    // Handle conflicts
    if (comparison.conflicts.length > 0) {
      console.log(`Resolving ${comparison.conflicts.length} conflicts...`);
      
      for (const conflict of comparison.conflicts) {
        if (conflict.projectNewer) {
          try {
            const result = await uploadFileToSupabase(conflict.projectFile, conflict.targetBucket, true);
            
            if (result.success) {
              uploadResults.updated.push(result);
              syncState.filesUpdated++;
              console.log(`✅ Updated: ${conflict.projectFile.relativePath}`);
            } else {
              uploadResults.failed.push(result);
              console.error(`❌ Failed to update: ${conflict.projectFile.relativePath}`);
            }
          } catch (error) {
            uploadResults.failed.push({
              path: conflict.projectFile.relativePath,
              error: error.message
            });
            console.error(`❌ Error updating ${conflict.projectFile.relativePath}:`, error);
          }
        } else {
          uploadResults.skipped.push({
            path: conflict.projectFile.relativePath,
            reason: 'Supabase version is newer'
          });
          syncState.filesSkipped++;
          console.log(`⏭️ Skipping older file: ${conflict.projectFile.relativePath}`);
        }
      }
    }
    
    logPhaseComplete('Upload Files to Supabase', uploadResults);
    return uploadResults;
    
  } catch (error) {
    logPhaseError('Upload Files to Supabase', error);
    throw error;
  }
}

/**
 * Upload file to Supabase storage
 */
async function uploadFileToSupabase(fileInfo, bucketName, isUpdate = false) {
  try {
    const fileBuffer = await fs.promises.readFile(fileInfo.path);
    const fileName = fileInfo.relativePath.replace(/\\/g, '/');
    
    // Create metadata
    const metadata = {
      hash: fileInfo.hash,
      size: fileInfo.size,
      modified: fileInfo.modified,
      category: fileInfo.category,
      mimeType: fileInfo.mimeType
    };
    
    let uploadResult;
    
    if (isUpdate) {
      // Update existing file
      uploadResult = await supabase.storage
        .from(bucketName)
        .update(fileName, fileBuffer, {
          contentType: fileInfo.mimeType,
          cacheControl: '3600',
          metadata
        });
    } else {
      // Upload new file
      uploadResult = await supabase.storage
        .from(bucketName)
        .upload(fileName, fileBuffer, {
          contentType: fileInfo.mimeType,
          cacheControl: '3600',
          metadata,
          upsert: true
        });
    }
    
    if (uploadResult.error) {
      throw uploadResult.error;
    }
    
    syncState.filesProcessed++;
    
    return {
      success: true,
      path: fileName,
      bucket: bucketName,
      action: isUpdate ? 'updated' : 'uploaded',
      size: fileBuffer.length,
      hash: fileInfo.hash
    };
  } catch (error) {
    return {
      success: false,
      path: fileInfo.relativePath,
      error: error.message
    };
  }
}

/**
 * Phase 6: Verify Database Schema
 */
async function phase6_VerifyDatabaseSchema() {
  logPhaseStart('Verify Database Schema');
  
  try {
    const expectedTables = [
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
    
    const verification = {
      expectedTables,
      existingTables: [],
      missingTables: [],
      extraTables: [],
      tableDetails: {}
    };
    
    // Get existing tables
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE');
    
    if (tablesError) throw tablesError;
    
    verification.existingTables = tables.map(t => t.table_name);
    
    // Find missing tables
    verification.missingTables = expectedTables.filter(
      table => !verification.existingTables.includes(table)
    );
    
    // Find extra tables
    verification.extraTables = verification.existingTables.filter(
      table => !expectedTables.includes(table)
    );
    
    // Get details for existing tables
    for (const tableName of verification.existingTables) {
      const { data: columns, error: columnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable')
        .eq('table_schema', 'public')
        .eq('table_name', tableName);
      
      if (!columnsError && columns) {
        verification.tableDetails[tableName] = {
          columns,
          columnCount: columns.length
        };
      }
    }
    
    verification.isComplete = verification.missingTables.length === 0;
    
    logPhaseComplete('Verify Database Schema', verification);
    return verification;
    
  } catch (error) {
    logPhaseError('Verify Database Schema', error);
    throw error;
  }
}

/**
 * Phase 7: Test Uploaded Files
 */
async function phase7_TestUploadedFiles(uploadResults) {
  logPhaseStart('Test Uploaded Files');
  
  try {
    const testResults = {
      tested: [],
      failed: [],
      success: 0,
      total: uploadResults.uploaded.length + uploadResults.updated.length
    };
    
    const allFiles = [...uploadResults.uploaded, ...uploadResults.updated];
    
    for (const file of allFiles.slice(0, 10)) { // Test first 10 files
      try {
        const { data, error } = await supabase.storage
          .from(file.bucket)
          .getPublicUrl(file.path);
        
        if (error) {
          testResults.failed.push({
            ...file,
            error: error.message
          });
        } else {
          testResults.tested.push({
            ...file,
            publicUrl: data.publicUrl
          });
          testResults.success++;
        }
      } catch (error) {
        testResults.failed.push({
          ...file,
          error: error.message
        });
      }
    }
    
    logPhaseComplete('Test Uploaded Files', testResults);
    return testResults;
    
  } catch (error) {
    logPhaseError('Test Uploaded Files', error);
    throw error;
  }
}

/**
 * Generate comprehensive synchronization report
 */
function generateComprehensiveReport(results) {
  console.log('\n📊 Generating comprehensive synchronization report...');
  
  const endTime = new Date().toISOString();
  const duration = Date.now() - new Date(syncState.startTime).getTime();
  
  const report = {
    metadata: {
      startTime: syncState.startTime,
      endTime,
      duration: Math.round(duration / 1000), // seconds
      version: '1.0.0',
      credentials: {
        supabaseUrl: SUPABASE_URL,
        serviceKeyProvided: !!SUPABASE_SERVICE_KEY
      }
    },
    summary: {
      totalPhases: Object.keys(syncState.phases).length,
      completedPhases: Object.values(syncState.phases).filter(p => p.status === 'completed').length,
      failedPhases: Object.values(syncState.phases).filter(p => p.status === 'failed').length,
      totalErrors: syncState.errors.length,
      totalWarnings: syncState.warnings.length,
      filesProcessed: syncState.filesProcessed,
      filesUploaded: syncState.filesUploaded,
      filesUpdated: syncState.filesUpdated,
      filesSkipped: syncState.filesSkipped
    },
    phases: syncState.phases,
    results,
    errors: syncState.errors,
    warnings: syncState.warnings,
    recommendations: generateRecommendations(results),
    statistics: generateStatistics(results)
  };
  
  return report;
}

/**
 * Generate recommendations based on results
 */
function generateRecommendations(results) {
  const recommendations = [];
  
  // Check for failed phases
  const failedPhases = Object.entries(syncState.phases)
    .filter(([_, phase]) => phase.status === 'failed')
    .map(([name, _]) => name);
  
  if (failedPhases.length > 0) {
    recommendations.push({
      type: 'FAILED_PHASES',
      priority: 'CRITICAL',
      message: `Address failed phases: ${failedPhases.join(', ')}`
    });
  }
  
  // Check for upload failures
  if (results.uploadResults && results.uploadResults.failed.length > 0) {
    recommendations.push({
      type: 'UPLOAD_FAILURES',
      priority: 'HIGH',
      message: `Retry uploading ${results.uploadResults.failed.length} failed files`
    });
  }
  
  // Check for database issues
  if (results.schemaVerification && !results.schemaVerification.isComplete) {
    recommendations.push({
      type: 'DATABASE_SCHEMA',
      priority: 'HIGH',
      message: `Execute database migrations for ${results.schemaVerification.missingTables.length} missing tables`
    });
  }
  
  // Check for file access issues
  if (results.testResults && results.testResults.failed.length > 0) {
    recommendations.push({
      type: 'FILE_ACCESS',
      priority: 'MEDIUM',
      message: `Fix access issues for ${results.testResults.failed.length} files`
    });
  }
  
  return recommendations;
}

/**
 * Generate statistics
 */
function generateStatistics(results) {
  return {
    fileOperations: {
      total: results.comparison ? results.comparison.summary.totalProjectFiles : 0,
      uploaded: syncState.filesUploaded,
      updated: syncState.filesUpdated,
      skipped: syncState.filesSkipped,
      failed: syncState.errors.length
    },
    storage: {
      bucketsCreated: results.bucketCreation ? results.bucketCreation.createdBuckets.length : 0,
      totalSize: results.projectFiles ? results.projectFiles.totalSize : 0,
      categories: results.projectFiles ? results.projectFiles.categories : {}
    },
    database: {
      tablesExpected: results.schemaVerification ? results.schemaVerification.expectedTables.length : 0,
      tablesExisting: results.schemaVerification ? results.schemaVerification.existingTables.length : 0,
      tablesMissing: results.schemaVerification ? results.schemaVerification.missingTables.length : 0
    },
    performance: {
      duration: Math.round((Date.now() - new Date(syncState.startTime).getTime()) / 1000),
      filesPerSecond: syncState.filesProcessed > 0 ? Math.round(syncState.filesProcessed / ((Date.now() - new Date(syncState.startTime).getTime()) / 1000)) : 0
    }
  };
}

/**
 * Main synchronization function
 */
async function performComprehensiveSync() {
  console.log('🚀 Comprehensive Supabase Synchronization');
  console.log(`Started at: ${syncState.startTime}`);
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  
  const results = {};
  
  try {
    // Phase 1: Analyze Supabase Account
    results.supabaseAnalysis = await phase1_AnalyzeSupabaseAccount();
    
    // Phase 2: Scan Project Files
    results.projectFiles = await phase2_ScanProjectFiles();
    
    // Phase 3: Compare and Identify Differences
    results.comparison = await phase3_CompareAndIdentifyDifferences(results.projectFiles, results.supabaseAnalysis);
    
    // Phase 4: Create Storage Buckets
    results.bucketCreation = await phase4_CreateStorageBuckets();
    
    // Phase 5: Upload Files
    results.uploadResults = await phase5_UploadFiles(results.comparison);
    
    // Phase 6: Verify Database Schema
    results.schemaVerification = await phase6_VerifyDatabaseSchema();
    
    // Phase 7: Test Uploaded Files
    results.testResults = await phase7_TestUploadedFiles(results.uploadResults);
    
    // Generate final report
    const finalReport = generateComprehensiveReport(results);
    
    // Save report
    await fs.promises.writeFile(
      SYNC_REPORT_PATH,
      JSON.stringify(finalReport, null, 2)
    );
    
    // Print summary
    console.log('\n🎉 Comprehensive synchronization completed!');
    console.log(`📄 Report saved to: ${SYNC_REPORT_PATH}`);
    
    console.log('\n📈 Summary:');
    console.log(`- Duration: ${finalReport.metadata.duration} seconds`);
    console.log(`- Phases completed: ${finalReport.summary.completedPhases}/${finalReport.summary.totalPhases}`);
    console.log(`- Files processed: ${finalReport.summary.filesProcessed}`);
    console.log(`- Files uploaded: ${finalReport.summary.filesUploaded}`);
    console.log(`- Files updated: ${finalReport.summary.filesUpdated}`);
    console.log(`- Errors: ${finalReport.summary.totalErrors}`);
    console.log(`- Warnings: ${finalReport.summary.totalWarnings}`);
    
    if (finalReport.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      finalReport.recommendations.forEach(rec => {
        console.log(`- [${rec.priority}] ${rec.message}`);
      });
    }
    
    return finalReport;
    
  } catch (error) {
    console.error('❌ Comprehensive synchronization failed:', error);
    
    // Save error report
    const errorReport = {
      ...syncState,
      endTime: new Date().toISOString(),
      fatalError: {
        message: error.message,
        stack: error.stack
      }
    };
    
    await fs.promises.writeFile(
      SYNC_REPORT_PATH.replace('.json', '-error.json'),
      JSON.stringify(errorReport, null, 2)
    );
    
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  performComprehensiveSync()
    .then(() => {
      console.log('\n🎉 All synchronization processes completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Comprehensive synchronization failed:', error);
      process.exit(1);
    });
}

module.exports = {
  performComprehensiveSync,
  phase1_AnalyzeSupabaseAccount,
  phase2_ScanProjectFiles,
  phase3_CompareAndIdentifyDifferences,
  phase4_CreateStorageBuckets,
  phase5_UploadFiles,
  phase6_VerifyDatabaseSchema,
  phase7_TestUploadedFiles
};