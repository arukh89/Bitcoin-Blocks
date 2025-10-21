#!/usr/bin/env node

/**
 * Supabase Storage Manager
 * 
 * This script handles the creation and management of Supabase storage buckets
 * and policies for the synchronization process.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
const SUPABASE_SERVICE_KEY = 'sbp_6d4e7f74315a3ab6646ca23441ddc03b7e25333d';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Required buckets
const REQUIRED_BUCKETS = [
  {
    name: 'project-files',
    public: false,
    description: 'Project source files and configurations'
  },
  {
    name: 'assets',
    public: true,
    description: 'Public assets and media files'
  },
  {
    name: 'migrations',
    public: false,
    description: 'Database migration files'
  },
  {
    name: 'backups',
    public: false,
    description: 'Application backups and snapshots'
  }
];

// Storage policies
const STORAGE_POLICIES = [
  {
    bucket: 'project-files',
    name: 'Allow authenticated uploads',
    definition: `
      CREATE POLICY "Allow authenticated uploads" ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'project-files' AND 
        auth.role() = 'authenticated'
      );
    `
  },
  {
    bucket: 'project-files',
    name: 'Allow authenticated updates',
    definition: `
      CREATE POLICY "Allow authenticated updates" ON storage.objects
      FOR UPDATE USING (
        bucket_id = 'project-files' AND 
        auth.role() = 'authenticated'
      );
    `
  },
  {
    bucket: 'project-files',
    name: 'Allow authenticated reads',
    definition: `
      CREATE POLICY "Allow authenticated reads" ON storage.objects
      FOR SELECT USING (
        bucket_id = 'project-files' AND 
        auth.role() = 'authenticated'
      );
    `
  },
  {
    bucket: 'assets',
    name: 'Public read access',
    definition: `
      CREATE POLICY "Public read access" ON storage.objects
      FOR SELECT USING (
        bucket_id = 'assets'
      );
    `
  },
  {
    bucket: 'assets',
    name: 'Allow authenticated uploads',
    definition: `
      CREATE POLICY "Allow authenticated uploads" ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'assets' AND 
        auth.role() = 'authenticated'
      );
    `
  }
];

/**
 * Create storage buckets if they don't exist
 */
async function createStorageBuckets() {
  console.log('Creating storage buckets...');
  
  try {
    // Get existing buckets
    const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      throw listError;
    }
    
    const existingBucketNames = existingBuckets.map(b => b.name);
    const createdBuckets = [];
    
    for (const bucketConfig of REQUIRED_BUCKETS) {
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
          continue;
        }
        
        createdBuckets.push(bucketConfig.name);
        console.log(`✅ Created bucket: ${bucketConfig.name}`);
      } else {
        console.log(`✅ Bucket already exists: ${bucketConfig.name}`);
      }
    }
    
    return createdBuckets;
  } catch (error) {
    console.error('Error creating storage buckets:', error);
    throw error;
  }
}

/**
 * Apply storage policies
 */
async function applyStoragePolicies() {
  console.log('Applying storage policies...');
  
  try {
    const appliedPolicies = [];
    
    for (const policy of STORAGE_POLICIES) {
      try {
        console.log(`Applying policy: ${policy.name} for bucket: ${policy.bucket}`);
        
        // Execute the policy SQL
        const { data, error } = await supabase.rpc('exec_sql', {
          sql: policy.definition
        });
        
        if (error) {
          // Try direct SQL execution if RPC fails
          const { data: directData, error: directError } = await supabase
            .from('storage.policies')
            .insert({
              name: policy.name,
              definition: policy.definition,
              bucket_id: policy.bucket
            });
          
          if (directError) {
            console.error(`Error applying policy ${policy.name}:`, directError);
            continue;
          }
        }
        
        appliedPolicies.push(policy.name);
        console.log(`✅ Applied policy: ${policy.name}`);
        
      } catch (policyError) {
        console.error(`Error applying policy ${policy.name}:`, policyError);
      }
    }
    
    return appliedPolicies;
  } catch (error) {
    console.error('Error applying storage policies:', error);
    throw error;
  }
}

/**
 * Get bucket information
 */
async function getBucketInfo() {
  console.log('Retrieving bucket information...');
  
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      throw error;
    }
    
    const bucketInfo = {};
    
    for (const bucket of buckets) {
      const { data: files, error: filesError } = await supabase.storage
        .from(bucket.name)
        .list('', { limit: 1000 });
      
      if (filesError) {
        console.error(`Error listing files in bucket ${bucket.name}:`, filesError);
        bucketInfo[bucket.name] = {
          ...bucket,
          files: [],
          error: filesError.message
        };
        continue;
      }
      
      // Calculate total size
      let totalSize = 0;
      for (const file of files) {
        if (file.metadata) {
          totalSize += file.metadata.size || 0;
        }
      }
      
      bucketInfo[bucket.name] = {
        ...bucket,
        fileCount: files.length,
        totalSize,
        files: files
      };
    }
    
    return bucketInfo;
  } catch (error) {
    console.error('Error getting bucket information:', error);
    throw error;
  }
}

/**
 * Clean up old files (optional)
 */
async function cleanupOldFiles(bucketName, olderThanDays = 30) {
  console.log(`Cleaning up files older than ${olderThanDays} days in bucket: ${bucketName}`);
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const { data: files, error } = await supabase.storage
      .from(bucketName)
      .list('', { limit: 1000 });
    
    if (error) {
      throw error;
    }
    
    const filesToDelete = [];
    
    for (const file of files) {
      const createdDate = new Date(file.created_at);
      if (createdDate < cutoffDate) {
        filesToDelete.push(file.name);
      }
    }
    
    if (filesToDelete.length === 0) {
      console.log('No files to clean up');
      return [];
    }
    
    console.log(`Found ${filesToDelete.length} files to delete`);
    
    const deletedFiles = [];
    
    for (const fileName of filesToDelete) {
      const { error: deleteError } = await supabase.storage
        .from(bucketName)
        .remove([fileName]);
      
      if (deleteError) {
        console.error(`Error deleting file ${fileName}:`, deleteError);
        continue;
      }
      
      deletedFiles.push(fileName);
      console.log(`✅ Deleted: ${fileName}`);
    }
    
    return deletedFiles;
  } catch (error) {
    console.error('Error cleaning up old files:', error);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Supabase Storage Manager');
  console.log(`URL: ${SUPABASE_URL}`);
  
  try {
    // Step 1: Create buckets
    console.log('\n📦 Creating storage buckets...');
    const createdBuckets = await createStorageBuckets();
    
    // Step 2: Apply policies
    console.log('\n🔐 Applying storage policies...');
    const appliedPolicies = await applyStoragePolicies();
    
    // Step 3: Get bucket information
    console.log('\n📊 Retrieving bucket information...');
    const bucketInfo = await getBucketInfo();
    
    // Print summary
    console.log('\n✅ Storage setup complete!');
    console.log('\n📈 Summary:');
    console.log(`- Buckets created: ${createdBuckets.length}`);
    console.log(`- Policies applied: ${appliedPolicies.length}`);
    
    console.log('\n📋 Bucket Information:');
    for (const [bucketName, info] of Object.entries(bucketInfo)) {
      console.log(`- ${bucketName}: ${info.fileCount} files, ${(info.totalSize / 1024 / 1024).toFixed(2)} MB`);
    }
    
    // Save bucket info to file
    const reportPath = path.join(__dirname, '..', 'storage-report.json');
    await fs.promises.writeFile(
      reportPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        createdBuckets,
        appliedPolicies,
        bucketInfo
      }, null, 2)
    );
    
    console.log(`\n📄 Report saved to: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ Storage setup failed:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = {
  createStorageBuckets,
  applyStoragePolicies,
  getBucketInfo,
  cleanupOldFiles
};