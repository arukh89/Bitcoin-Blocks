#!/usr/bin/env node

/**
 * Master Synchronization Script
 * 
 * This script orchestrates the complete synchronization process between the project
 * and the Supabase account, including storage setup, schema validation, file upload,
 * and comprehensive reporting.
 */

const { performSynchronization } = require('./sync-supabase');
const { createStorageBuckets, applyStoragePolicies, getBucketInfo } = require('./supabase-storage-manager');
const { validateDatabaseSchema } = require('./db-schema-validator');
const fs = require('fs');
const path = require('path');

// Configuration
const PROJECT_ROOT = path.join(__dirname, '..');
const SYNC_LOG_PATH = path.join(PROJECT_ROOT, 'master-sync-log.json');

// Synchronization state
const syncLog = {
  startTime: new Date().toISOString(),
  phases: {},
  errors: [],
  warnings: [],
  summary: {}
};

/**
 * Log phase start
 */
function logPhaseStart(phaseName) {
  console.log(`\n🚀 Starting phase: ${phaseName}`);
  syncLog.phases[phaseName] = {
    startTime: new Date().toISOString(),
    status: 'running'
  };
}

/**
 * Log phase completion
 */
function logPhaseComplete(phaseName, result = {}) {
  console.log(`✅ Phase completed: ${phaseName}`);
  syncLog.phases[phaseName] = {
    ...syncLog.phases[phaseName],
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
  syncLog.phases[phaseName] = {
    ...syncLog.phases[phaseName],
    endTime: new Date().toISOString(),
    status: 'failed',
    error: error.message
  };
  syncLog.errors.push({
    phase: phaseName,
    error: error.message,
    timestamp: new Date().toISOString()
  });
}

/**
 * Phase 1: Storage Setup
 */
async function phase1_StorageSetup() {
  logPhaseStart('Storage Setup');
  
  try {
    // Create storage buckets
    const createdBuckets = await createStorageBuckets();
    
    // Apply storage policies
    const appliedPolicies = await applyStoragePolicies();
    
    // Get bucket information
    const bucketInfo = await getBucketInfo();
    
    logPhaseComplete('Storage Setup', {
      createdBuckets,
      appliedPolicies,
      bucketInfo
    });
    
    return {
      createdBuckets,
      appliedPolicies,
      bucketInfo
    };
  } catch (error) {
    logPhaseError('Storage Setup', error);
    throw error;
  }
}

/**
 * Phase 2: Database Schema Validation
 */
async function phase2_SchemaValidation() {
  logPhaseStart('Schema Validation');
  
  try {
    const schemaReport = await validateDatabaseSchema();
    
    logPhaseComplete('Schema Validation', schemaReport);
    
    return schemaReport;
  } catch (error) {
    logPhaseError('Schema Validation', error);
    throw error;
  }
}

/**
 * Phase 3: File Analysis and Comparison
 */
async function phase3_FileAnalysis() {
  logPhaseStart('File Analysis');
  
  try {
    const syncReport = await performSynchronization();
    
    logPhaseComplete('File Analysis', syncReport);
    
    return syncReport;
  } catch (error) {
    logPhaseError('File Analysis', error);
    throw error;
  }
}

/**
 * Phase 4: File Upload and Synchronization
 */
async function phase4_FileUpload(syncReport) {
  logPhaseStart('File Upload');
  
  try {
    const { uploadFileToSupabase } = require('./sync-supabase');
    const { createClient } = require('@supabase/supabase-js');
    
    const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
    const SUPABASE_SERVICE_KEY = 'sbp_6d4e7f74315a3ab6646ca23441ddc03b7e25333d';
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const uploadResults = {
      uploaded: [],
      updated: [],
      failed: []
    };
    
    // Upload missing files
    if (syncReport.details.missingFiles && syncReport.details.missingFiles.length > 0) {
      console.log(`Uploading ${syncReport.details.missingFiles.length} missing files...`);
      
      for (const filePath of syncReport.details.missingFiles) {
        try {
          const fullPath = path.join(PROJECT_ROOT, filePath);
          const fileInfo = {
            path: fullPath,
            relativePath: filePath,
            metadata: await require('./sync-supabase').getFileMetadata(fullPath),
            category: require('./sync-supabase').categorizeFile(filePath)
          };
          
          const result = await uploadFileToSupabase(fileInfo, 'project-files');
          
          if (result.success) {
            uploadResults.uploaded.push(result);
            console.log(`✅ Uploaded: ${filePath}`);
          } else {
            uploadResults.failed.push(result);
            console.error(`❌ Failed to upload: ${filePath}`);
          }
        } catch (error) {
          uploadResults.failed.push({
            path: filePath,
            error: error.message
          });
          console.error(`❌ Error uploading ${filePath}:`, error);
        }
      }
    }
    
    // Handle conflicts
    if (syncReport.details.conflicts && syncReport.details.conflicts.length > 0) {
      console.log(`Resolving ${syncReport.details.conflicts.length} conflicts...`);
      
      for (const conflict of syncReport.details.conflicts) {
        if (conflict.projectNewer) {
          try {
            const fullPath = path.join(PROJECT_ROOT, conflict.file);
            const fileInfo = {
              path: fullPath,
              relativePath: conflict.file,
              metadata: await require('./sync-supabase').getFileMetadata(fullPath),
              category: require('./sync-supabase').categorizeFile(conflict.file)
            };
            
            const result = await uploadFileToSupabase(fileInfo, 'project-files');
            
            if (result.success) {
              uploadResults.updated.push(result);
              console.log(`✅ Updated: ${conflict.file}`);
            } else {
              uploadResults.failed.push(result);
              console.error(`❌ Failed to update: ${conflict.file}`);
            }
          } catch (error) {
            uploadResults.failed.push({
              path: conflict.file,
              error: error.message
            });
            console.error(`❌ Error updating ${conflict.file}:`, error);
          }
        } else {
          console.log(`⏭️ Skipping older file: ${conflict.file}`);
        }
      }
    }
    
    logPhaseComplete('File Upload', uploadResults);
    
    return uploadResults;
  } catch (error) {
    logPhaseError('File Upload', error);
    throw error;
  }
}

/**
 * Phase 5: Security Validation
 */
async function phase5_SecurityValidation(syncReport) {
  logPhaseStart('Security Validation');
  
  try {
    const securityIssues = syncReport.details.securityIssues || [];
    
    // Categorize security issues
    const criticalIssues = securityIssues.filter(issue => issue.severity === 'HIGH' || issue.severity === 'CRITICAL');
    const mediumIssues = securityIssues.filter(issue => issue.severity === 'MEDIUM');
    const lowIssues = securityIssues.filter(issue => issue.severity === 'LOW');
    
    const securityResult = {
      total: securityIssues.length,
      critical: criticalIssues.length,
      medium: mediumIssues.length,
      low: lowIssues.length,
      issues: securityIssues
    };
    
    if (criticalIssues.length > 0) {
      syncLog.warnings.push({
        type: 'SECURITY_CRITICAL',
        message: `Found ${criticalIssues.length} critical security issues`,
        issues: criticalIssues
      });
    }
    
    logPhaseComplete('Security Validation', securityResult);
    
    return securityResult;
  } catch (error) {
    logPhaseError('Security Validation', error);
    throw error;
  }
}

/**
 * Phase 6: Final Validation and Testing
 */
async function phase6_FinalValidation() {
  logPhaseStart('Final Validation');
  
  try {
    const { createClient } = require('@supabase/supabase-js');
    
    const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co';
    const SUPABASE_SERVICE_KEY = 'sbp_6d4e7f74315a3ab6646ca23441ddc03b7e25333d';
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const validationResults = {
      database: false,
      storage: false,
      connectivity: false
    };
    
    // Test database connectivity
    try {
      const { data, error } = await supabase.from('rounds').select('count').limit(1);
      validationResults.database = !error;
      validationResults.connectivity = true;
    } catch (error) {
      console.error('Database connectivity test failed:', error);
    }
    
    // Test storage connectivity
    try {
      const { data, error } = await supabase.storage.listBuckets();
      validationResults.storage = !error;
    } catch (error) {
      console.error('Storage connectivity test failed:', error);
    }
    
    // Test API endpoints
    const apiEndpoints = [
      '/api/auth/me',
      '/api/mempool',
      '/api/analytics'
    ];
    
    const apiResults = {};
    
    for (const endpoint of apiEndpoints) {
      try {
        // Note: This would require the development server to be running
        // For now, we'll just mark as pending
        apiResults[endpoint] = 'pending';
      } catch (error) {
        apiResults[endpoint] = 'failed';
      }
    }
    
    const finalResult = {
      validation: validationResults,
      apiTests: apiResults,
      overall: validationResults.database && validationResults.storage && validationResults.connectivity
    };
    
    logPhaseComplete('Final Validation', finalResult);
    
    return finalResult;
  } catch (error) {
    logPhaseError('Final Validation', error);
    throw error;
  }
}

/**
 * Generate comprehensive report
 */
function generateFinalReport(results) {
  console.log('\n📊 Generating final report...');
  
  const endTime = new Date().toISOString();
  const duration = Date.now() - new Date(syncLog.startTime).getTime();
  
  const finalReport = {
    metadata: {
      startTime: syncLog.startTime,
      endTime,
      duration: Math.round(duration / 1000), // seconds
      version: '1.0.0'
    },
    summary: {
      totalPhases: Object.keys(syncLog.phases).length,
      completedPhases: Object.values(syncLog.phases).filter(p => p.status === 'completed').length,
      failedPhases: Object.values(syncLog.phases).filter(p => p.status === 'failed').length,
      totalErrors: syncLog.errors.length,
      totalWarnings: syncLog.warnings.length
    },
    phases: syncLog.phases,
    results,
    errors: syncLog.errors,
    warnings: syncLog.warnings,
    recommendations: generateRecommendations(results)
  };
  
  return finalReport;
}

/**
 * Generate recommendations based on results
 */
function generateRecommendations(results) {
  const recommendations = [];
  
  // Check for failed phases
  const failedPhases = Object.entries(syncLog.phases)
    .filter(([_, phase]) => phase.status === 'failed')
    .map(([name, _]) => name);
  
  if (failedPhases.length > 0) {
    recommendations.push({
      type: 'FAILED_PHASES',
      priority: 'CRITICAL',
      message: `Address failed phases: ${failedPhases.join(', ')}`
    });
  }
  
  // Check for security issues
  if (results.securityValidation && results.securityValidation.critical > 0) {
    recommendations.push({
      type: 'SECURITY',
      priority: 'CRITICAL',
      message: `Resolve ${results.securityValidation.critical} critical security issues`
    });
  }
  
  // Check for schema differences
  if (results.schemaValidation && results.schemaValidation.summary.hasDifferences) {
    recommendations.push({
      type: 'SCHEMA',
      priority: 'HIGH',
      message: 'Apply database schema migration to resolve differences'
    });
  }
  
  // Check for upload failures
  if (results.fileUpload && results.fileUpload.failed.length > 0) {
    recommendations.push({
      type: 'UPLOAD',
      priority: 'MEDIUM',
      message: `Retry uploading ${results.fileUpload.failed.length} failed files`
    });
  }
  
  // Check validation results
  if (results.finalValidation && !results.finalValidation.overall) {
    recommendations.push({
      type: 'VALIDATION',
      priority: 'HIGH',
      message: 'Address connectivity or validation issues'
    });
  }
  
  return recommendations;
}

/**
 * Main synchronization function
 */
async function performMasterSync() {
  console.log('🚀 Master Synchronization Process');
  console.log(`Started at: ${syncLog.startTime}`);
  console.log(`Project root: ${PROJECT_ROOT}`);
  
  const results = {};
  
  try {
    // Phase 1: Storage Setup
    results.storageSetup = await phase1_StorageSetup();
    
    // Phase 2: Database Schema Validation
    results.schemaValidation = await phase2_SchemaValidation();
    
    // Phase 3: File Analysis
    results.fileAnalysis = await phase3_FileAnalysis();
    
    // Phase 4: File Upload
    results.fileUpload = await phase4_FileUpload(results.fileAnalysis);
    
    // Phase 5: Security Validation
    results.securityValidation = await phase5_SecurityValidation(results.fileAnalysis);
    
    // Phase 6: Final Validation
    results.finalValidation = await phase6_FinalValidation();
    
    // Generate final report
    const finalReport = generateFinalReport(results);
    
    // Save report
    await fs.promises.writeFile(
      SYNC_LOG_PATH,
      JSON.stringify(finalReport, null, 2)
    );
    
    // Print summary
    console.log('\n🎉 Master synchronization completed!');
    console.log(`📄 Report saved to: ${SYNC_LOG_PATH}`);
    
    console.log('\n📈 Summary:');
    console.log(`- Duration: ${finalReport.metadata.duration} seconds`);
    console.log(`- Phases completed: ${finalReport.summary.completedPhases}/${finalReport.summary.totalPhases}`);
    console.log(`- Errors: ${finalReport.summary.totalErrors}`);
    console.log(`- Warnings: ${finalReport.summary.totalWarnings}`);
    
    if (results.fileUpload) {
      console.log(`- Files uploaded: ${results.fileUpload.uploaded.length}`);
      console.log(`- Files updated: ${results.fileUpload.updated.length}`);
      console.log(`- Upload failures: ${results.fileUpload.failed.length}`);
    }
    
    if (finalReport.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      finalReport.recommendations.forEach(rec => {
        console.log(`- [${rec.priority}] ${rec.message}`);
      });
    }
    
    return finalReport;
    
  } catch (error) {
    console.error('❌ Master synchronization failed:', error);
    
    // Save error report
    const errorReport = {
      ...syncLog,
      endTime: new Date().toISOString(),
      fatalError: {
        message: error.message,
        stack: error.stack
      }
    };
    
    await fs.promises.writeFile(
      SYNC_LOG_PATH.replace('.json', '-error.json'),
      JSON.stringify(errorReport, null, 2)
    );
    
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  performMasterSync()
    .then(() => {
      console.log('\n🎉 All synchronization processes completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Master synchronization failed:', error);
      process.exit(1);
    });
}

module.exports = {
  performMasterSync,
  phase1_StorageSetup,
  phase2_SchemaValidation,
  phase3_FileAnalysis,
  phase4_FileUpload,
  phase5_SecurityValidation,
  phase6_FinalValidation
};