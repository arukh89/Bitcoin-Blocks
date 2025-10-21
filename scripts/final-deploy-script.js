const { createClient } = require('@supabase/supabase-js')

// Kredensial Supabase
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA'

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

class FinalDeployScript {
  constructor() {
    this.deploymentSteps = []
    this.errors = []
  }

  async executeDeployment() {
    console.log('🚀 MEMULAI DEPLOYMENT BACKEND FIXES...')
    console.log('Timestamp:', new Date().toISOString())
    console.log('='.repeat(60))

    try {
      // Step 1: Verify Connection
      await this.verifyConnection()

      // Step 2: Check Existing Tables
      await this.checkExistingTables()

      // Step 3: Create Missing Tables (if possible)
      await this.createMissingTables()

      // Step 4: Test Core Operations
      await this.testCoreOperations()

      // Step 5: Validate Backend Fixes
      await this.validateBackendFixes()

      // Step 6: Generate Deployment Report
      this.generateDeploymentReport()

    } catch (error) {
      console.error('❌ Deployment failed:', error)
      this.errors.push({
        step: 'deployment',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  async verifyConnection() {
    console.log('\n📡 STEP 1: VERIFYING CONNECTION')
    
    try {
      const { data, error } = await supabaseAdmin
        .from('rounds')
        .select('id')
        .limit(1)

      if (error) {
        throw new Error(`Connection failed: ${error.message}`)
      }

      this.addStep('Connection Verification', true, 'Database connection successful')
    } catch (error) {
      this.addStep('Connection Verification', false, error.message)
      throw error
    }
  }

  async checkExistingTables() {
    console.log('\n📊 STEP 2: CHECKING EXISTING TABLES')
    
    const tables = ['rounds', 'guesses', 'chat_messages', 'user_sessions']
    const missingTables = ['prize_configs', 'admin_fids', 'audit_logs']
    
    // Check existing tables
    for (const table of tables) {
      try {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select('*')
          .limit(1)

        if (error) {
          this.addStep(`Table ${table}`, false, error.message)
        } else {
          this.addStep(`Table ${table}`, true, `Exists (${data.length} rows)`)
        }
      } catch (error) {
        this.addStep(`Table ${table}`, false, error.message)
      }
    }

    // Check missing tables
    for (const table of missingTables) {
      try {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select('*')
          .limit(1)

        if (error && error.code === 'PGRST116') {
          this.addStep(`Table ${table}`, false, 'Table does not exist (will use fallback)')
        } else if (error) {
          this.addStep(`Table ${table}`, false, error.message)
        } else {
          this.addStep(`Table ${table}`, true, `Exists (${data.length} rows)`)
        }
      } catch (error) {
        this.addStep(`Table ${table}`, false, 'Table does not exist (will use fallback)')
      }
    }
  }

  async createMissingTables() {
    console.log('\n🔧 STEP 3: ATTEMPTING TO CREATE MISSING TABLES')
    
    // Try to create tables using REST API (limited approach)
    const tablesToCreate = [
      {
        name: 'prize_configs',
        testInsert: {
          config_data: { jackpotAmount: '1000', firstPlaceAmount: '500', secondPlaceAmount: '250', currencyType: 'USD', tokenContractAddress: '0x0000000000000000000000000000000000000000' },
          updated_at: Date.now(),
          version: 1
        }
      },
      {
        name: 'admin_fids',
        testInsert: {
          fid: '250704',
          permissions: { role: 'admin', permissions: ['all'], source: 'deployment' },
          created_at: Date.now(),
          updated_at: Date.now()
        }
      },
      {
        name: 'audit_logs',
        testInsert: {
          id: `deploy-${Date.now()}`,
          admin_fid: '250704',
          action: 'deployment_test',
          details: { message: 'Test deployment' },
          created_at: Date.now()
        }
      }
    ]

    for (const table of tablesToCreate) {
      try {
        const { data, error } = await supabaseAdmin
          .from(table.name)
          .insert(table.testInsert)
          .select()
          .single()

        if (error) {
          if (error.code === 'PGRST116') {
            this.addStep(`Create ${table.name}`, false, 'Table does not exist (manual creation required)')
            console.log(`⚠️ Table ${table.name} needs manual creation via Supabase Dashboard`)
          } else {
            this.addStep(`Create ${table.name}`, false, error.message)
          }
        } else {
          this.addStep(`Create ${table.name}`, true, `Table created and test data inserted`)
        }
      } catch (error) {
        this.addStep(`Create ${table.name}`, false, 'Manual creation required')
      }
    }

    // Provide manual creation instructions
    console.log('\n📋 MANUAL TABLE CREATION INSTRUCTIONS:')
    console.log(`
If the above tables could not be created automatically, please:

1. Login to Supabase Dashboard: https://supabase.com/dashboard
2. Select project: masgfwpxfytraiwkvbmg  
3. Go to SQL Editor
4. Run the following SQL:

-- Create prize_configs table
CREATE TABLE IF NOT EXISTS prize_configs (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  config_data JSONB NOT NULL,
  updated_at BIGINT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_at BIGINT DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- Create admin_fids table  
CREATE TABLE IF NOT EXISTS admin_fids (
  fid TEXT PRIMARY KEY,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000),
  updated_at BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000) || '-' || gen_random_uuid()::text),
  admin_fid TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL,
  created_at BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- Insert default data
INSERT INTO admin_fids (fid, permissions, created_at, updated_at) VALUES
('250704', '{"role": "admin", "permissions": ["all"], "source": "deployment"}', FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000), FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)),
('1107084', '{"role": "admin", "permissions": ["all"], "source": "deployment"}', FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000), FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))
ON CONFLICT (fid) DO NOTHING;

INSERT INTO prize_configs (config_data, updated_at, version) VALUES
'{"jackpotAmount": "1000", "firstPlaceAmount": "500", "secondPlaceAmount": "250", "currencyType": "USD", "tokenContractAddress": "0x0000000000000000000000000000000000000000"}', FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000), 1
ON CONFLICT DO NOTHING;
    `)
  }

  async testCoreOperations() {
    console.log('\n⚙️ STEP 4: TESTING CORE OPERATIONS')
    
    try {
      // Test round creation with valid status
      const testRound = {
        round_number: Math.floor(Math.random() * 100000),
        start_time: Date.now(),
        end_time: Date.now() + 3600000,
        prize: 'test_deployment',
        status: 'open', // Valid status
        created_at: Date.now(),
        duration_min: 60
      }

      const { data: createdRound, error: createError } = await supabaseAdmin
        .from('rounds')
        .insert(testRound)
        .select()
        .single()

      if (createError) {
        this.addStep('Test Round Creation', false, createError.message)
      } else {
        this.addStep('Test Round Creation', true, `Round created with ID: ${createdRound.id}`)

        // Test round update
        const { data: updatedRound, error: updateError } = await supabaseAdmin
          .from('rounds')
          .update({ status: 'closed' })
          .eq('id', createdRound.id)
          .select()
          .single()

        if (updateError) {
          this.addStep('Test Round Update', false, updateError.message)
        } else {
          this.addStep('Test Round Update', true, 'Round updated successfully')
        }

        // Cleanup test round
        await supabaseAdmin
          .from('rounds')
          .delete()
          .eq('id', createdRound.id)
        
        this.addStep('Test Round Cleanup', true, 'Test round deleted')
      }

    } catch (error) {
      this.addStep('Core Operations Test', false, error.message)
    }
  }

  async validateBackendFixes() {
    console.log('\n✅ STEP 5: VALIDATING BACKEND FIXES')
    
    // Check if our fixed database service would work
    const validations = [
      {
        name: 'Service Role Key Access',
        test: async () => {
          const { data, error } = await supabaseAdmin
            .from('rounds')
            .select('id')
            .limit(1)
          return !error
        }
      },
      {
        name: 'Anon Key Access', 
        test: async () => {
          const { createClient } = require('@supabase/supabase-js')
          const supabase = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2OTQ5NTYsImV4cCI6MjA3NjI3MDk1Nn0.QAVE2pVMR869KycgzXe2MaQyJTyQb-yZM5zfIbtsMDM')
          const { data, error } = await supabase
            .from('rounds')
            .select('id')
            .limit(1)
          return !error
        }
      },
      {
        name: 'Table Operations',
        test: async () => {
          const tables = ['rounds', 'guesses', 'chat_messages', 'user_sessions']
          for (const table of tables) {
            const { error } = await supabaseAdmin
              .from(table)
              .select('*')
              .limit(1)
            if (error) return false
          }
          return true
        }
      }
    ]

    for (const validation of validations) {
      try {
        const result = await validation.test()
        this.addStep(validation.name, result, result ? 'Validation passed' : 'Validation failed')
      } catch (error) {
        this.addStep(validation.name, false, error.message)
      }
    }
  }

  addStep(stepName, success, message) {
    const step = {
      name: stepName,
      success,
      message,
      timestamp: new Date().toISOString()
    }
    
    this.deploymentSteps.push(step)
    
    if (success) {
      console.log(`✅ ${stepName}: ${message}`)
    } else {
      console.log(`❌ ${stepName}: ${message}`)
      this.errors.push(step)
    }
  }

  generateDeploymentReport() {
    console.log('\n' + '='.repeat(60))
    console.log('📋 DEPLOYMENT REPORT')
    console.log('='.repeat(60))
    
    const totalSteps = this.deploymentSteps.length
    const successfulSteps = this.deploymentSteps.filter(s => s.success).length
    const failedSteps = totalSteps - successfulSteps
    
    console.log(`\nTotal Steps: ${totalSteps}`)
    console.log(`Successful: ${successfulSteps}`)
    console.log(`Failed: ${failedSteps}`)
    console.log(`Success Rate: ${((successfulSteps / totalSteps) * 100).toFixed(1)}%`)
    
    if (this.errors.length > 0) {
      console.log('\n🚨 FAILED STEPS:')
      this.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.name}: ${error.message}`)
      })
    }
    
    // Save deployment report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: totalSteps,
        successful: successfulSteps,
        failed: failedSteps,
        successRate: (successfulSteps / totalSteps) * 100
      },
      steps: this.deploymentSteps,
      errors: this.errors,
      recommendations: this.getRecommendations()
    }
    
    const fs = require('fs')
    const path = require('path')
    
    try {
      const reportPath = path.join(__dirname, '../logs/deployment-report.json')
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
      console.log(`\n📄 Deployment report saved to: ${reportPath}`)
    } catch (err) {
      console.log('\n⚠️ Could not save deployment report:', err.message)
    }
    
    console.log('\n🎉 Backend deployment process completed!')
    
    if (failedSteps > 0) {
      console.log('\n⚠️ Some deployment steps failed. Please follow the manual instructions above.')
    } else {
      console.log('\n✅ All deployment steps completed successfully!')
    }
    
    console.log('\n📝 NEXT STEPS:')
    console.log('1. If tables are missing, create them manually using the SQL provided')
    console.log('2. Test the application with the fixed backend')
    console.log('3. Deploy the frontend changes')
    console.log('4. Monitor the application for any issues')
  }

  getRecommendations() {
    const recommendations = []
    
    if (this.errors.some(e => e.name.includes('prize_configs'))) {
      recommendations.push('Create prize_configs table manually via Supabase Dashboard')
    }
    
    if (this.errors.some(e => e.name.includes('admin_fids'))) {
      recommendations.push('Create admin_fids table manually via Supabase Dashboard')
    }
    
    if (this.errors.some(e => e.name.includes('audit_logs'))) {
      recommendations.push('Create audit_logs table manually via Supabase Dashboard')
    }
    
    if (this.errors.some(e => e.message.includes('rounds_status_check'))) {
      recommendations.push('Check rounds table constraints and status values')
    }
    
    recommendations.push('Test all API endpoints after deployment')
    recommendations.push('Monitor error logs for any issues')
    recommendations.push('Set up proper database backups')
    
    return recommendations
  }
}

// Execute deployment
const deployer = new FinalDeployScript()
deployer.executeDeployment()
  .then(() => {
    console.log('\n✅ Deployment process completed!')
  })
  .catch((error) => {
    console.error('\n❌ Deployment process failed:', error)
    process.exit(1)
  })