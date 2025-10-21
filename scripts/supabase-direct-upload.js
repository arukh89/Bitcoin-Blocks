#!/usr/bin/env node

/**
 * Direct Supabase Upload Script
 * 
 * This script uses a different approach to upload files to Supabase,
 * handling MIME type issues and providing better error handling.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration from provided credentials
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA';
const PROJECT_ROOT = path.join(__dirname, '..');
const UPLOAD_REPORT_PATH = path.join(PROJECT_ROOT, 'direct-upload-report.json');

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
  successfulUploads: []
};

/**
 * Log message with timestamp
 */
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
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
      isDirectory: stats.isDirectory()
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
  if (relativePath.startsWith('public/') && relativePath.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/)) {
    return 'assets';
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
 * Upload file to Supabase storage with multiple fallback strategies
 */
async function uploadFileToSupabase(filePath, relativePath, bucketName, retryCount = 0) {
  const maxRetries = 3;
  
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    const fileName = relativePath.replace(/\\/g, '/');
    
    // Strategy 1: Try with generic content type
    const contentTypes = [
      'application/octet-stream',
      'text/plain',
      'application/json',
      'application/javascript',
      'text/css',
      'text/html',
      'text/markdown',
      'application/sql',
      'application/typescript'
    ];
    
    for (const contentType of contentTypes) {
      try {
        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(fileName, fileBuffer, {
            contentType,
            cacheControl: '3600',
            upsert: true
          });
        
        if (!error) {
          uploadState.filesUploaded++;
          uploadState.totalSize += fileBuffer.length;
          uploadState.successfulUploads.push({
            path: fileName,
            bucket: bucketName,
            size: fileBuffer.length,
            contentType
          });
          
          return {
            success: true,
            path: fileName,
            bucket: bucketName,
            size: fileBuffer.length,
            contentType
          };
        }
      } catch (uploadError) {
        // Continue to next content type
        continue;
      }
    }
    
    // Strategy 2: Try with no content type
    try {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, fileBuffer, {
          cacheControl: '3600',
          upsert: true
        });
      
      if (!error) {
        uploadState.filesUploaded++;
        uploadState.totalSize += fileBuffer.length;
        uploadState.successfulUploads.push({
          path: fileName,
          bucket: bucketName,
          size: fileBuffer.length,
          contentType: 'auto-detected'
        });
        
        return {
          success: true,
          path: fileName,
          bucket: bucketName,
          size: fileBuffer.length,
          contentType: 'auto-detected'
        };
      }
    } catch (uploadError) {
      // Continue to retry logic
    }
    
    // Strategy 3: Retry with delay
    if (retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
      log(`Retrying upload for ${fileName} in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return uploadFileToSupabase(filePath, relativePath, bucketName, retryCount + 1);
    }
    
    // If all strategies failed, record the error
    uploadState.filesFailed++;
    uploadState.errors.push({
      type: 'FILE_UPLOAD_ERROR',
      path: relativePath,
      bucket: bucketName,
      error: 'All upload strategies failed'
    });
    
    return {
      success: false,
      path: relativePath,
      bucket: bucketName,
      error: 'All upload strategies failed'
    };
    
  } catch (error) {
    uploadState.filesFailed++;
    uploadState.errors.push({
      type: 'FILE_UPLOAD_ERROR',
      path: relativePath,
      bucket: bucketName,
      error: error.message
    });
    
    return {
      success: false,
      path: relativePath,
      bucket: bucketName,
      error: error.message
    };
  }
}

/**
 * Scan and upload project files
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
        // Skip very large files
        const metadata = await getFileMetadata(fullPath);
        if (metadata && metadata.size < 10 * 1024 * 1024) { // 10MB limit
          files.push({
            path: fullPath,
            relativePath: relativeFilePath.replace(/\\/g, '/'),
            size: metadata.size,
            modified: metadata.modified,
            targetBucket: determineTargetBucket(relativeFilePath)
          });
        } else {
          log(`Skipping large file: ${relativeFilePath}`);
        }
      }
    }
  }
  
  await scanDirectory(PROJECT_ROOT);
  
  log(`Found ${files.length} files to upload`);
  
  // Upload files in batches
  const batchSize = 10;
  let uploadCount = 0;
  
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    uploadCount += batch.length;
    
    log(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} files)...`);
    
    for (const file of batch) {
      try {
        const result = await uploadFileToSupabase(file.path, file.relativePath, file.targetBucket);
        uploadState.filesProcessed++;
        
        if (result.success) {
          if (uploadState.filesUploaded % 5 === 0) {
            log(`✅ Uploaded ${uploadState.filesUploaded}/${files.length} files...`);
          }
        } else {
          log(`❌ Failed to upload: ${file.relativePath}`);
        }
      } catch (error) {
        log(`❌ Error uploading ${file.relativePath}:`, error.message);
      }
    }
  }
  
  return {
    totalFiles: files.length,
    successfulUploads: uploadState.successfulUploads.length,
    failedUploads: uploadState.filesFailed
  };
}

/**
 * Generate upload report
 */
function generateUploadReport(scanResults) {
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
    successfulUploads: uploadState.successfulUploads,
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
      message: `${uploadState.filesFailed} files failed to upload`,
      action: 'Review error logs and retry failed uploads'
    });
  }
  
  if (uploadState.filesUploaded === 0) {
    recommendations.push({
      type: 'NO_FILES_UPLOADED',
      priority: 'CRITICAL',
      message: 'No files were successfully uploaded',
      action: 'Check Supabase permissions and bucket configuration'
    });
  }
  
  return recommendations;
}

/**
 * Main upload function
 */
async function performDirectUpload() {
  console.log('🚀 Direct Supabase Upload');
  console.log(`Started at: ${uploadState.startTime}`);
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  
  try {
    // Scan and upload project files
    const scanResults = await scanAndUploadProjectFiles();
    
    // Generate report
    const report = generateUploadReport(scanResults);
    
    // Save report
    await fs.promises.writeFile(
      UPLOAD_REPORT_PATH,
      JSON.stringify(report, null, 2)
    );
    
    // Print summary
    console.log('\n🎉 Direct Upload completed!');
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
    
    if (report.successfulUploads.length > 0) {
      console.log(`\n✅ Successfully uploaded ${report.successfulUploads.length} files:`);
      report.successfulUploads.slice(0, 10).forEach(file => {
        console.log(`- ${file.path} (${file.size} bytes, ${file.contentType})`);
      });
      
      if (report.successfulUploads.length > 10) {
        console.log(`... and ${report.successfulUploads.length - 10} more files`);
      }
    }
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => {
        console.log(`- [${rec.priority}] ${rec.message}`);
      });
    }
    
    return report;
    
  } catch (error) {
    console.error('❌ Direct Upload failed:', error);
    
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
  performDirectUpload()
    .then(() => {
      console.log('\n🎉 Direct file upload completed!');
      console.log('\n📝 Next Steps:');
      console.log('1. Review the upload report');
      console.log('2. Execute database migrations if needed');
      console.log('3. Configure storage policies');
      console.log('4. Test application functionality');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Direct upload failed:', error);
      process.exit(1);
    });
}

module.exports = {
  performDirectUpload,
  uploadFileToSupabase,
  scanAndUploadProjectFiles
};