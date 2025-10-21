#!/usr/bin/env node

/**
 * Supabase MCP File Upload Script
 * 
 * This script uses the Supabase MCP (Model Context Protocol) to upload
 * all project files to the Supabase account with proper organization.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration from provided credentials
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA';
const PROJECT_ROOT = path.join(__dirname, '..');
const UPLOAD_REPORT_PATH = path.join(PROJECT_ROOT, 'supabase-mcp-upload-report.json');

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Upload state
const uploadState = {
  startTime: new Date().toISOString(),
  filesProcessed: 0,
  filesUploaded: 0,
  filesFailed: 0,
  totalSize: 0,
  errors: [],
  warnings: [],
  buckets: {}
};

/**
 * Log message with timestamp
 */
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

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
    '.tsx': 'application/typescript',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Ensure storage buckets exist
 */
async function ensureStorageBuckets() {
  log('Ensuring storage buckets exist...');
  
  const requiredBuckets = [
    { name: 'project-files', public: false },
    { name: 'assets', public: true },
    { name: 'migrations', public: false },
    { name: 'backups', public: false }
  ];
  
  // Get existing buckets
  const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    throw listError;
  }
  
  const existingBucketNames = existingBuckets.map(b => b.name);
  const createdBuckets = [];
  
  for (const bucketConfig of requiredBuckets) {
    if (!existingBucketNames.includes(bucketConfig.name)) {
      log(`Creating bucket: ${bucketConfig.name}`);
      
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
        uploadState.errors.push({
          type: 'BUCKET_CREATION_ERROR',
          bucket: bucketConfig.name,
          error: error.message
        });
        continue;
      }
      
      createdBuckets.push(bucketConfig.name);
      log(`✅ Created bucket: ${bucketConfig.name}`);
    } else {
      log(`✅ Bucket already exists: ${bucketConfig.name}`);
    }
    
    uploadState.buckets[bucketConfig.name] = {
      created: existingBucketNames.includes(bucketConfig.name),
      files: []
    };
  }
  
  return createdBuckets;
}

/**
 * Upload file to Supabase storage
 */
async function uploadFileToSupabase(fileInfo, bucketName) {
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
    
    // Upload file with upsert to handle existing files
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        contentType: fileInfo.mimeType,
        cacheControl: '3600',
        metadata,
        upsert: true
      });
    
    if (error) {
      throw error;
    }
    
    uploadState.filesProcessed++;
    uploadState.filesUploaded++;
    uploadState.totalSize += fileBuffer.length;
    uploadState.buckets[bucketName].files.push(fileName);
    
    return {
      success: true,
      path: fileName,
      bucket: bucketName,
      action: 'uploaded',
      size: fileBuffer.length,
      hash: fileInfo.hash
    };
  } catch (error) {
    uploadState.filesFailed++;
    uploadState.errors.push({
      type: 'FILE_UPLOAD_ERROR',
      path: fileInfo.relativePath,
      bucket: bucketName,
      error: error.message
    });
    
    return {
      success: false,
      path: fileInfo.relativePath,
      bucket: bucketName,
      error: error.message
    };
  }
}

/**
 * Scan project directory and upload files
 */
async function scanAndUploadProjectFiles() {
  log('Scanning and uploading project files...');
  
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
          const metadata = await getFileMetadata(fullPath);
          if (metadata) {
            files.push({
              path: fullPath,
              relativePath: relativeFilePath.replace(/\\/g, '/'),
              size: metadata.size,
              modified: metadata.modified,
              hash: metadata.hash,
              category: categorizeFile(entry.name),
              mimeType: getMimeType(entry.name),
              targetBucket: determineTargetBucket(relativeFilePath)
            });
          }
        } catch (fileError) {
          console.warn(`Warning: Could not process file ${fullPath}:`, fileError.message);
          uploadState.warnings.push({
            type: 'FILE_PROCESSING_WARNING',
            file: relativeFilePath,
            error: fileError.message
          });
        }
      }
    }
  }
  
  await scanDirectory(PROJECT_ROOT);
  
  log(`Found ${files.length} files to upload`);
  
  // Categorize files
  const categories = {};
  const bucketDistribution = {};
  
  for (const file of files) {
    if (!categories[file.category]) {
      categories[file.category] = 0;
    }
    categories[file.category]++;
    
    if (!bucketDistribution[file.targetBucket]) {
      bucketDistribution[file.targetBucket] = 0;
    }
    bucketDistribution[file.targetBucket]++;
  }
  
  log(`File categories: ${JSON.stringify(categories, null, 2)}`);
  log(`Bucket distribution: ${JSON.stringify(bucketDistribution, null, 2)}`);
  
  // Upload files by bucket
  const uploadResults = {
    uploaded: [],
    failed: []
  };
  
  // Group files by bucket
  const filesByBucket = {};
  for (const file of files) {
    if (!filesByBucket[file.targetBucket]) {
      filesByBucket[file.targetBucket] = [];
    }
    filesByBucket[file.targetBucket].push(file);
  }
  
  // Upload files for each bucket
  for (const [bucketName, bucketFiles] of Object.entries(filesByBucket)) {
    log(`Uploading ${bucketFiles.length} files to ${bucketName} bucket...`);
    
    for (const file of bucketFiles) {
      try {
        const result = await uploadFileToSupabase(file, bucketName);
        
        if (result.success) {
          uploadResults.uploaded.push(result);
          if (uploadResults.uploaded.length % 10 === 0) {
            log(`✅ Uploaded ${uploadResults.uploaded.length}/${files.length} files...`);
          }
        } else {
          uploadResults.failed.push(result);
          console.error(`❌ Failed to upload: ${file.relativePath}`);
        }
      } catch (error) {
        uploadResults.failed.push({
          path: file.relativePath,
          bucket: bucketName,
          error: error.message
        });
        console.error(`❌ Error uploading ${file.relativePath}:`, error);
      }
    }
    
    log(`✅ Completed uploading to ${bucketName} bucket`);
  }
  
  return {
    totalFiles: files.length,
    categories,
    bucketDistribution,
    uploadResults
  };
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
 * Test uploaded files
 */
async function testUploadedFiles() {
  log('Testing uploaded files...');
  
  const testResults = {
    tested: [],
    failed: [],
    success: 0,
    total: 10 // Test first 10 files
  };
  
  for (const bucketName of Object.keys(uploadState.buckets)) {
    if (uploadState.buckets[bucketName].files.length > 0) {
      const filesToTest = uploadState.buckets[bucketName].files.slice(0, 5);
      
      for (const fileName of filesToTest) {
        try {
          const { data, error } = await supabase.storage
            .from(bucketName)
            .getPublicUrl(fileName);
          
          if (error) {
            testResults.failed.push({
              bucket: bucketName,
              fileName,
              error: error.message
            });
          } else {
            testResults.tested.push({
              bucket: bucketName,
              fileName,
              publicUrl: data.publicUrl
            });
            testResults.success++;
          }
        } catch (error) {
          testResults.failed.push({
            bucket: bucketName,
            fileName,
            error: error.message
          });
        }
      }
    }
  }
  
  log(`✅ Tested ${testResults.success} files successfully`);
  if (testResults.failed.length > 0) {
    log(`⚠️ ${testResults.failed.length} files failed accessibility test`);
  }
  
  return testResults;
}

/**
 * Generate upload report
 */
function generateUploadReport(scanResults, testResults) {
  log('Generating upload report...');
  
  const endTime = new Date().toISOString();
  const duration = Date.now() - new Date(uploadState.startTime).getTime();
  
  const report = {
    metadata: {
      startTime: uploadState.startTime,
      endTime,
      duration: Math.round(duration / 1000), // seconds
      version: '1.0.0',
      supabaseUrl: SUPABASE_URL
    },
    summary: {
      totalFiles: scanResults.totalFiles,
      filesProcessed: uploadState.filesProcessed,
      filesUploaded: uploadState.filesUploaded,
      filesFailed: uploadState.filesFailed,
      totalSize: uploadState.totalSize,
      errors: uploadState.errors.length,
      warnings: uploadState.warnings.length,
      successRate: Math.round((uploadState.filesUploaded / scanResults.totalFiles) * 100)
    },
    buckets: uploadState.buckets,
    categories: scanResults.categories,
    bucketDistribution: scanResults.bucketDistribution,
    uploadResults: scanResults.uploadResults,
    testResults,
    errors: uploadState.errors,
    warnings: uploadState.warnings,
    recommendations: generateRecommendations()
  };
  
  return report;
}

/**
 * Generate recommendations
 */
function generateRecommendations() {
  const recommendations = [];
  
  if (uploadState.filesFailed > 0) {
    recommendations.push({
      type: 'UPLOAD_FAILURES',
      priority: 'HIGH',
      message: `Review and retry ${uploadState.filesFailed} failed file uploads`,
      action: 'Check error logs and retry failed uploads'
    });
  }
  
  if (uploadState.errors.length > 0) {
    recommendations.push({
      type: 'ERRORS_FOUND',
      priority: 'HIGH',
      message: `${uploadState.errors.length} errors encountered during upload`,
      action: 'Review error details and address issues'
    });
  }
  
  if (uploadState.warnings.length > 0) {
    recommendations.push({
      type: 'WARNINGS_FOUND',
      priority: 'MEDIUM',
      message: `${uploadState.warnings.length} warnings during upload`,
      action: 'Review warnings and address if needed'
    });
  }
  
  return recommendations;
}

/**
 * Main upload function
 */
async function performMCPUpload() {
  console.log('🚀 Supabase MCP File Upload');
  console.log(`Started at: ${uploadState.startTime}`);
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  
  try {
    // Step 1: Ensure storage buckets exist
    await ensureStorageBuckets();
    
    // Step 2: Scan and upload project files
    const scanResults = await scanAndUploadProjectFiles();
    
    // Step 3: Test uploaded files
    const testResults = await testUploadedFiles();
    
    // Step 4: Generate report
    const report = generateUploadReport(scanResults, testResults);
    
    // Save report
    await fs.promises.writeFile(
      UPLOAD_REPORT_PATH,
      JSON.stringify(report, null, 2)
    );
    
    // Print summary
    console.log('\n🎉 MCP Upload completed!');
    console.log(`📄 Report saved to: ${UPLOAD_REPORT_PATH}`);
    
    console.log('\n📈 Summary:');
    console.log(`- Duration: ${report.metadata.duration} seconds`);
    console.log(`- Total files: ${report.summary.totalFiles}`);
    console.log(`- Files uploaded: ${report.summary.filesUploaded}`);
    console.log(`- Files failed: ${report.summary.filesFailed}`);
    console.log(`- Total size: ${(report.summary.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Success rate: ${report.summary.successRate}%`);
    console.log(`- Errors: ${report.summary.errors}`);
    console.log(`- Warnings: ${report.summary.warnings}`);
    
    console.log('\n📊 Bucket Statistics:');
    for (const [bucketName, bucketInfo] of Object.entries(report.buckets)) {
      console.log(`- ${bucketName}: ${bucketInfo.files.length} files`);
    }
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => {
        console.log(`- [${rec.priority}] ${rec.message}`);
      });
    }
    
    return report;
    
  } catch (error) {
    console.error('❌ MCP Upload failed:', error);
    
    // Save error report
    const errorReport = {
      ...uploadState,
      endTime: new Date().toISOString(),
      fatalError: {
        message: error.message,
        stack: error.stack
      }
    };
    
    await fs.promises.writeFile(
      UPLOAD_REPORT_PATH.replace('.json', '-error.json'),
      JSON.stringify(errorReport, null, 2)
    );
    
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  performMCPUpload()
    .then(() => {
      console.log('\n🎉 All files uploaded to Supabase successfully!');
      console.log('\n📝 Next Steps:');
      console.log('1. Review the upload report');
      console.log('2. Execute database migrations if needed');
      console.log('3. Configure storage policies');
      console.log('4. Test application functionality');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 MCP Upload failed:', error);
      process.exit(1);
    });
}

module.exports = {
  performMCPUpload,
  ensureStorageBuckets,
  scanAndUploadProjectFiles,
  testUploadedFiles
};