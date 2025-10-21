#!/usr/bin/env node

/**
 * Supabase Analysis and Manual Steps Guide
 * 
 * This script analyzes the Supabase account and provides detailed manual steps
 * for completing the synchronization when API access is limited.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration from provided credentials
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA';
const SUPABASE_ACCESS_TOKEN = 'sbp_6d4e7f74315a3ab6646ca23441ddc03b7e25333d';
const PROJECT_ROOT = path.join(__dirname, '..');
const ANALYSIS_REPORT_PATH = path.join(PROJECT_ROOT, 'supabase-analysis-manual-steps.json');

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Analysis state
const analysisState = {
  startTime: new Date().toISOString(),
  projectFiles: [],
  supabaseStatus: {},
  manualSteps: [],
  errors: [],
  warnings: []
};

/**
 * Analyze project files
 */
async function analyzeProjectFiles() {
  console.log('🔍 Analyzing project files...');
  
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
              hash,
              category: categorizeFile(entry.name),
              isBinary: isBinaryFile(entry.name),
              mimeType: getMimeType(entry.name),
              targetBucket: determineTargetBucket(relativeFilePath)
            });
          } catch (fileError) {
            console.warn(`Warning: Could not process file ${fullPath}:`, fileError.message);
            analysisState.warnings.push({
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
    
    analysisState.projectFiles = {
      files,
      totalFiles: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      categories,
      bucketDistribution,
      binaryFiles: files.filter(f => f.isBinary).length,
      textFiles: files.filter(f => !f.isBinary).length
    };
    
    console.log(`✅ Analyzed ${files.length} project files`);
    return analysisState.projectFiles;
    
  } catch (error) {
    console.error('❌ Error analyzing project files:', error);
    analysisState.errors.push({
      type: 'PROJECT_ANALYSIS_ERROR',
      error: error.message
    });
    throw error;
  }
}

/**
 * Test Supabase connectivity
 */
async function testSupabaseConnectivity() {
  console.log('🔌 Testing Supabase connectivity...');
  
  try {
    const status = {
      auth: false,
      database: false,
      storage: false,
      overall: false
    };
    
    // Test auth
    try {
      const { data, error } = await supabase.auth.getSession();
      status.auth = !error;
      console.log(`${status.auth ? '✅' : '❌'} Auth connectivity`);
    } catch (error) {
      console.log('❌ Auth connectivity failed:', error.message);
    }
    
    // Test database
    try {
      const { data, error } = await supabase.from('rounds').select('count').limit(1);
      status.database = !error || error.code === 'PGRST116'; // Table doesn't exist but connection works
      console.log(`${status.database ? '✅' : '❌'} Database connectivity`);
    } catch (error) {
      console.log('❌ Database connectivity failed:', error.message);
    }
    
    // Test storage
    try {
      const { data, error } = await supabase.storage.listBuckets();
      status.storage = !error;
      console.log(`${status.storage ? '✅' : '❌'} Storage connectivity`);
    } catch (error) {
      console.log('❌ Storage connectivity failed:', error.message);
    }
    
    status.overall = status.auth && status.database;
    analysisState.supabaseStatus = status;
    
    return status;
    
  } catch (error) {
    console.error('❌ Error testing connectivity:', error);
    analysisState.errors.push({
      type: 'CONNECTIVITY_ERROR',
      error: error.message
    });
    throw error;
  }
}

/**
 * Generate manual steps
 */
function generateManualSteps() {
  console.log('📋 Generating manual steps...');
  
  const steps = [];
  
  // Step 1: Storage Bucket Creation
  steps.push({
    id: 1,
    title: 'Create Storage Buckets',
    priority: 'HIGH',
    category: 'STORAGE',
    description: 'Manually create the required storage buckets in Supabase Dashboard',
    manualSteps: [
      '1. Go to Supabase Dashboard: https://supabase.com/dashboard',
      '2. Select project: masgfwpxfytraiwkvbmg',
      '3. Navigate to Storage section',
      '4. Create the following buckets:',
      '   - project-files (private)',
      '   - assets (public)',
      '   - migrations (private)',
      '   - backups (private)',
      '5. For each bucket, set file size limit to 50MB',
      '6. Enable appropriate MIME types'
    ],
    verification: 'Buckets appear in Storage section with correct settings'
  });
  
  // Step 2: Database Schema Setup
  steps.push({
    id: 2,
    title: 'Execute Database Migrations',
    priority: 'HIGH',
    category: 'DATABASE',
    description: 'Execute the database migration files in the correct order',
    manualSteps: [
      '1. Go to Supabase Dashboard → SQL Editor',
      '2. Execute migration files in order:',
      '   - supabase/migrations/001_initial_schema.sql',
      '   - supabase/migrations/002_error_logs.sql',
      '   - supabase/migrations/003_schema_optimizations.sql',
      '3. Verify table creation in Table Editor',
      '4. Check that all 9 tables are created',
      '5. Verify indexes and constraints'
    ],
    verification: 'All tables exist with correct structure'
  });
  
  // Step 3: File Upload Strategy
  const bucketFiles = {};
  for (const file of analysisState.projectFiles.files) {
    if (!bucketFiles[file.targetBucket]) {
      bucketFiles[file.targetBucket] = [];
    }
    bucketFiles[file.targetBucket].push(file);
  }
  
  steps.push({
    id: 3,
    title: 'Upload Project Files',
    priority: 'MEDIUM',
    category: 'STORAGE',
    description: 'Upload project files to appropriate storage buckets',
    manualSteps: [
      '1. Use Supabase Dashboard Storage section',
      '2. Upload files by bucket:',
      ...Object.entries(bucketFiles).map(([bucket, files]) => 
        `   - ${bucket}: ${files.length} files`
      ),
      '3. Maintain directory structure',
      '4. Set appropriate cache headers',
      '5. Verify file accessibility'
    ],
    verification: 'All files uploaded and accessible',
    fileDetails: bucketFiles
  });
  
  // Step 4: Storage Policies
  steps.push({
    id: 4,
    title: 'Configure Storage Policies',
    priority: 'MEDIUM',
    category: 'SECURITY',
    description: 'Set up Row Level Security policies for storage buckets',
    manualSteps: [
      '1. Go to Authentication → Policies',
      '2. Create policies for each bucket:',
      '   - project-files: Authenticated users only',
      '   - assets: Public read, authenticated write',
      '   - migrations: Admin only',
      '   - backups: Admin only',
      '3. Test policy enforcement'
    ],
    verification: 'Policies correctly enforce access control'
  });
  
  // Step 5: Environment Configuration
  steps.push({
    id: 5,
    title: 'Configure Environment Variables',
    priority: 'LOW',
    category: 'CONFIGURATION',
    description: 'Ensure all environment variables are properly configured',
    manualSteps: [
      '1. Review .env file for all required variables',
      '2. Update production URLs: https://bitcoin-block.vercel.app',
      '3. Verify Supabase credentials',
      '4. Check Farcaster API key',
      '5. Validate all external API configurations'
    ],
    verification: 'All environment variables correctly set'
  });
  
  analysisState.manualSteps = steps;
  return steps;
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
 * Generate comprehensive analysis report
 */
function generateAnalysisReport() {
  console.log('\n📊 Generating comprehensive analysis report...');
  
  const endTime = new Date().toISOString();
  const duration = Date.now() - new Date(analysisState.startTime).getTime();
  
  const report = {
    metadata: {
      startTime: analysisState.startTime,
      endTime,
      duration: Math.round(duration / 1000),
      version: '1.0.0',
      supabaseUrl: SUPABASE_URL,
      credentials: {
        serviceKeyProvided: !!SUPABASE_SERVICE_KEY,
        accessTokenProvided: !!SUPABASE_ACCESS_TOKEN
      }
    },
    summary: {
      totalProjectFiles: analysisState.projectFiles.totalFiles || 0,
      totalProjectSize: analysisState.projectFiles.totalSize || 0,
      manualStepsRequired: analysisState.manualSteps.length,
      highPrioritySteps: analysisState.manualSteps.filter(s => s.priority === 'HIGH').length,
      totalErrors: analysisState.errors.length,
      totalWarnings: analysisState.warnings.length,
      connectivityStatus: analysisState.supabaseStatus
    },
    projectAnalysis: analysisState.projectFiles,
    supabaseStatus: analysisState.supabaseStatus,
    manualSteps: analysisState.manualSteps,
    errors: analysisState.errors,
    warnings: analysisState.warnings,
    recommendations: generateRecommendations()
  };
  
  return report;
}

/**
 * Generate recommendations
 */
function generateRecommendations() {
  const recommendations = [];
  
  if (analysisState.supabaseStatus.storage === false) {
    recommendations.push({
      type: 'STORAGE_ACCESS',
      priority: 'CRITICAL',
      message: 'Storage API access is blocked. All storage operations must be done manually through the dashboard.',
      action: 'Follow manual steps for storage bucket creation and file uploads.'
    });
  }
  
  if (analysisState.supabaseStatus.database === false) {
    recommendations.push({
      type: 'DATABASE_ACCESS',
      priority: 'CRITICAL',
      message: 'Database API access is limited. Schema operations must be done manually.',
      action: 'Execute migrations manually through Supabase SQL Editor.'
    });
  }
  
  if (analysisState.errors.length > 0) {
    recommendations.push({
      type: 'ERRORS_FOUND',
      priority: 'HIGH',
      message: `${analysisState.errors.length} errors encountered during analysis.`,
      action: 'Review error details and address each issue manually.'
    });
  }
  
  recommendations.push({
    type: 'MANUAL_EXECUTION',
    priority: 'HIGH',
    message: 'All synchronization steps require manual execution due to API limitations.',
    action: 'Follow the provided manual steps in order to complete the synchronization.'
  });
  
  return recommendations;
}

/**
 * Main analysis function
 */
async function performAnalysisAndGenerateManualSteps() {
  console.log('🔍 Supabase Analysis and Manual Steps Generator');
  console.log(`Started at: ${analysisState.startTime}`);
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  
  try {
    // Analyze project files
    await analyzeProjectFiles();
    
    // Test Supabase connectivity
    await testSupabaseConnectivity();
    
    // Generate manual steps
    await generateManualSteps();
    
    // Generate final report
    const report = generateAnalysisReport();
    
    // Save report
    await fs.promises.writeFile(
      ANALYSIS_REPORT_PATH,
      JSON.stringify(report, null, 2)
    );
    
    // Print summary
    console.log('\n🎉 Analysis completed!');
    console.log(`📄 Report saved to: ${ANALYSIS_REPORT_PATH}`);
    
    console.log('\n📈 Summary:');
    console.log(`- Duration: ${report.metadata.duration} seconds`);
    console.log(`- Project files: ${report.summary.totalProjectFiles}`);
    console.log(`- Project size: ${(report.summary.totalProjectSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Manual steps required: ${report.summary.manualStepsRequired}`);
    console.log(`- High priority steps: ${report.summary.highPrioritySteps}`);
    console.log(`- Errors: ${report.summary.totalErrors}`);
    console.log(`- Warnings: ${report.summary.totalWarnings}`);
    
    console.log('\n🔌 Connectivity Status:');
    console.log(`- Auth: ${report.summary.connectivityStatus.auth ? '✅' : '❌'}`);
    console.log(`- Database: ${report.summary.connectivityStatus.database ? '✅' : '❌'}`);
    console.log(`- Storage: ${report.summary.connectivityStatus.storage ? '✅' : '❌'}`);
    
    console.log('\n📋 Manual Steps Required:');
    report.manualSteps.forEach(step => {
      console.log(`${step.id}. [${step.priority}] ${step.title} (${step.category})`);
      console.log(`   ${step.description}`);
    });
    
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
  performAnalysisAndGenerateManualSteps()
    .then(() => {
      console.log('\n🎉 Analysis completed successfully!');
      console.log('\n📝 Next Steps:');
      console.log('1. Review the generated report');
      console.log('2. Follow the manual steps in order');
      console.log('3. Execute high priority steps first');
      console.log('4. Verify each step completion');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Analysis failed:', error);
      process.exit(1);
    });
}

module.exports = {
  performAnalysisAndGenerateManualSteps,
  analyzeProjectFiles,
  testSupabaseConnectivity,
  generateManualSteps
};