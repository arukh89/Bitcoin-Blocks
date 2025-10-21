#!/usr/bin/env node

/**
 * Fix Supabase Bucket MIME Types
 * 
 * This script updates the bucket policies to allow all MIME types
 * for successful file uploads.
 */

const { createClient } = require('@supabase/supabase-js');

// Configuration from provided credentials
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Update bucket MIME type policies
 */
async function updateBucketMimeTypes() {
  console.log('🔧 Updating Supabase bucket MIME type policies...');
  
  const buckets = ['project-files', 'assets', 'migrations', 'backups'];
  const results = [];
  
  for (const bucketName of buckets) {
    try {
      console.log(`Updating ${bucketName} bucket...`);
      
      // Update bucket to allow all MIME types
      const { data, error } = await supabase.storage.updateBucket(bucketName, {
        public: bucketName === 'assets', // Keep assets public
        allowedMimeTypes: ['*'], // Allow all MIME types
        fileSizeLimit: 52428800 // 50MB
      });
      
      if (error) {
        console.error(`❌ Error updating ${bucketName}:`, error);
        results.push({
          bucket: bucketName,
          success: false,
          error: error.message
        });
      } else {
        console.log(`✅ Successfully updated ${bucketName} bucket`);
        results.push({
          bucket: bucketName,
          success: true
        });
      }
    } catch (error) {
      console.error(`❌ Error updating ${bucketName}:`, error);
      results.push({
        bucket: bucketName,
        success: false,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Test file upload
 */
async function testFileUpload() {
  console.log('🧪 Testing file upload...');
  
  try {
    // Create a simple test file
    const testContent = 'Hello Supabase!';
    const testBuffer = Buffer.from(testContent, 'utf8');
    
    // Upload to project-files bucket
    const { data, error } = await supabase.storage
      .from('project-files')
      .upload('test-file.txt', testBuffer, {
        contentType: 'text/plain',
        cacheControl: '3600',
        upsert: true
      });
    
    if (error) {
      console.error('❌ Test upload failed:', error);
      return false;
    }
    
    console.log('✅ Test upload successful');
    
    // Clean up test file
    await supabase.storage
      .from('project-files')
      .remove(['test-file.txt']);
    
    return true;
  } catch (error) {
    console.error('❌ Test upload error:', error);
    return false;
  }
}

/**
 * Main function
 */
async function fixSupabaseMimeTypes() {
  console.log('🚀 Fixing Supabase Bucket MIME Types');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  
  try {
    // Update bucket MIME type policies
    const updateResults = await updateBucketMimeTypes();
    
    // Test file upload
    const testSuccess = await testFileUpload();
    
    // Print summary
    console.log('\n📊 Summary:');
    console.log(`- Buckets updated: ${updateResults.filter(r => r.success).length}/${updateResults.length}`);
    console.log(`- Test upload: ${testSuccess ? '✅ Success' : '❌ Failed'}`);
    
    if (updateResults.some(r => !r.success)) {
      console.log('\n⚠️ Some bucket updates failed. Please check the errors above.');
    }
    
    if (!testSuccess) {
      console.log('\n⚠️ Test upload failed. Please check the error above.');
    }
    
    if (updateResults.every(r => r.success) && testSuccess) {
      console.log('\n✅ All MIME type policies updated successfully!');
      console.log('\n📝 Next Steps:');
      console.log('1. Run the upload script again: node scripts/supabase-mcp-upload.js');
      console.log('2. Verify all files are uploaded successfully');
    }
    
    return {
      success: updateResults.every(r => r.success) && testSuccess,
      updateResults,
      testSuccess
    };
    
  } catch (error) {
    console.error('❌ Failed to fix MIME types:', error);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  fixSupabaseMimeTypes()
    .then(() => {
      console.log('\n🎉 MIME type fixing completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 MIME type fixing failed:', error);
      process.exit(1);
    });
}

module.exports = {
  fixSupabaseMimeTypes,
  updateBucketMimeTypes,
  testFileUpload
};