const { createClient } = require('@supabase/supabase-js')

// Kredensial Supabase
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2OTQ5NTYsImV4cCI6MjA3NjI3MDk1Nn0.QAVE2pVMR869KycgzXe2MaQyJTyQb-yZM5zfIbtsMDM'

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

class BackendTester {
  constructor() {
    this.testResults = []
    this.errors = []
  }

  async runAllTests() {
    console.log('🧪 MEMULAI TESTING BACKEND FIXES...')
    console.log('Timestamp:', new Date().toISOString())
    console.log('='.repeat(60))

    // Test 1: Database Connection
    await this.testDatabaseConnection()

    // Test 2: Table Status
    await this.testTableStatus()

    // Test 3: Core Operations
    await this.testCoreOperations()

    // Test 4: Admin Operations
    await this.testAdminOperations()

    // Test 5: API Endpoints
    await this.testAPIEndpoints()

    // Generate Report
    this.generateTestReport()
  }

  async testDatabaseConnection() {
    console.log('\n📡 TEST 1: DATABASE CONNECTION')
    
    try {
      // Test Service Role Key
      const { data, error } = await supabaseAdmin
        .from('rounds')
        .select('id')
        .limit(1)

      if (error) {
        this.addTestResult('Service Role Connection', false, error.message)
      } else {
        this.addTestResult('Service Role Connection', true, 'Connected successfully')
      }

      // Test Anon Key
      const { data: anonData, error: anonError } = await supabase
        .from('rounds')
        .select('id')
        .limit(1)

      if (anonError) {
        this.addTestResult('Anon Key Connection', false, anonError.message)
      } else {
        this.addTestResult('Anon Key Connection', true, 'Connected successfully')
      }

    } catch (error) {
      this.addTestResult('Database Connection', false, error.message)
    }
  }

  async testTableStatus() {
    console.log('\n📊 TEST 2: TABLE STATUS')
    
    const tables = ['rounds', 'guesses', 'chat_messages', 'prize_configs', 'admin_fids', 'user_sessions', 'audit_logs']
    
    for (const table of tables) {
      try {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select('*')
          .limit(1)

        if (error) {
          if (error.message.includes('Does not exist')) {
            this.addTestResult(`Table ${table}`, false, 'Table does not exist')
          } else {
            this.addTestResult(`Table ${table}`, false, error.message)
          }
        } else {
          const count = data ? data.length : 0
          this.addTestResult(`Table ${table}`, true, `Exists (${count} rows)`)
        }
      } catch (error) {
        this.addTestResult(`Table ${table}`, false, error.message)
      }
    }
  }

  async testCoreOperations() {
    console.log('\n⚙️ TEST 3: CORE OPERATIONS')
    
    try {
      // Test Create Round
      const testRound = {
        round_number: 99999,
        start_time: Date.now(),
        end_time: Date.now() + 3600000,
        prize: 'test',
        status: 'test',
        created_at: Date.now(),
        duration_min: 60
      }

      const { data: createdRound, error: createError } = await supabaseAdmin
        .from('rounds')
        .insert(testRound)
        .select()
        .single()

      if (createError) {
        this.addTestResult('Create Round', false, createError.message)
      } else {
        this.addTestResult('Create Round', true, `Round created with ID: ${createdRound.id}`)

        // Test Update Round
        const { data: updatedRound, error: updateError } = await supabaseAdmin
          .from('rounds')
          .update({ status: 'updated' })
          .eq('id', createdRound.id)
          .select()
          .single()

        if (updateError) {
          this.addTestResult('Update Round', false, updateError.message)
        } else {
          this.addTestResult('Update Round', true, 'Round updated successfully')
        }

        // Test Delete Round (cleanup)
        const { error: deleteError } = await supabaseAdmin
          .from('rounds')
          .delete()
          .eq('id', createdRound.id)

        if (deleteError) {
          this.addTestResult('Delete Round', false, deleteError.message)
        } else {
          this.addTestResult('Delete Round', true, 'Round deleted successfully')
        }
      }

      // Test Guess Operations
      if (createdRound) {
        const testGuess = {
          round_id: createdRound.id,
          user_fid: 'test_user',
          guess_amount: 100,
          username: 'testuser',
          created_at: Date.now()
        }

        const { data: createdGuess, error: guessError } = await supabase
          .from('guesses')
          .insert(testGuess)
          .select()
          .single()

        if (guessError) {
          this.addTestResult('Create Guess', false, guessError.message)
        } else {
          this.addTestResult('Create Guess', true, `Guess created with ID: ${createdGuess.id}`)
        }
      }

    } catch (error) {
      this.addTestResult('Core Operations', false, error.message)
    }
  }

  async testAdminOperations() {
    console.log('\n👨‍💼 TEST 4: ADMIN OPERATIONS')
    
    // Test admin verification fallback
    const adminFids = ['250704', '1107084']
    
    for (const fid of adminFids) {
      try {
        // Try to check admin_fids table
        const { data, error } = await supabaseAdmin
          .from('admin_fids')
          .select('fid')
          .eq('fid', fid)
          .single()

        if (error && error.code === 'PGRST116') {
          this.addTestResult(`Admin Check ${fid}`, true, 'Using fallback (table missing)')
        } else if (error) {
          this.addTestResult(`Admin Check ${fid}`, false, error.message)
        } else {
          this.addTestResult(`Admin Check ${fid}`, true, 'Found in admin_fids table')
        }
      } catch (error) {
        this.addTestResult(`Admin Check ${fid}`, false, error.message)
      }
    }

    // Test prize config fallback
    try {
      const { data, error } = await supabaseAdmin
        .from('prize_configs')
        .select('*')
        .limit(1)

      if (error && error.code === 'PGRST116') {
        this.addTestResult('Prize Config', true, 'Using default config (table missing)')
      } else if (error) {
        this.addTestResult('Prize Config', false, error.message)
      } else {
        this.addTestResult('Prize Config', true, 'Found prize config in table')
      }
    } catch (error) {
      this.addTestResult('Prize Config', false, error.message)
    }
  }

  async testAPIEndpoints() {
    console.log('\n🌐 TEST 5: API ENDPOINTS')
    
    const baseUrl = 'http://localhost:3000' // Assuming local development
    
    // Test endpoints that should work
    const endpoints = [
      { path: '/api/admin', method: 'GET', expectedStatus: 401 }, // Should require auth
      { path: '/api/analytics', method: 'GET', expectedStatus: 401 }, // Should require auth
      { path: '/api/auth/me', method: 'GET', expectedStatus: 401 } // Should require auth
    ]

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint.path}`, {
          method: endpoint.method,
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (response.status === endpoint.expectedStatus) {
          this.addTestResult(`API ${endpoint.path}`, true, `Status: ${response.status} (expected)`)
        } else {
          this.addTestResult(`API ${endpoint.path}`, false, `Status: ${response.status} (expected ${endpoint.expectedStatus})`)
        }
      } catch (error) {
        this.addTestResult(`API ${endpoint.path}`, false, `Connection failed: ${error.message}`)
      }
    }
  }

  addTestResult(testName, success, message) {
    const result = {
      test: testName,
      success,
      message,
      timestamp: new Date().toISOString()
    }
    
    this.testResults.push(result)
    
    if (success) {
      console.log(`✅ ${testName}: ${message}`)
    } else {
      console.log(`❌ ${testName}: ${message}`)
      this.errors.push(result)
    }
  }

  generateTestReport() {
    console.log('\n' + '='.repeat(60))
    console.log('📋 TEST REPORT SUMMARY')
    console.log('='.repeat(60))
    
    const totalTests = this.testResults.length
    const passedTests = this.testResults.filter(r => r.success).length
    const failedTests = totalTests - passedTests
    
    console.log(`\nTotal Tests: ${totalTests}`)
    console.log(`Passed: ${passedTests}`)
    console.log(`Failed: ${failedTests}`)
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`)
    
    if (this.errors.length > 0) {
      console.log('\n🚨 FAILED TESTS:')
      this.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.test}: ${error.message}`)
      })
    }
    
    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        successRate: (passedTests / totalTests) * 100
      },
      results: this.testResults,
      errors: this.errors
    }
    
    const fs = require('fs')
    const path = require('path')
    
    try {
      const reportPath = path.join(__dirname, '../logs/backend-test-report.json')
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
      console.log(`\n📄 Detailed report saved to: ${reportPath}`)
    } catch (err) {
      console.log('\n⚠️ Could not save detailed report:', err.message)
    }
    
    console.log('\n🎉 Backend testing completed!')
    
    if (failedTests > 0) {
      console.log('\n⚠️ Some tests failed. Please review the errors above.')
    } else {
      console.log('\n✅ All tests passed! Backend is ready for deployment.')
    }
  }
}

// Run tests
const tester = new BackendTester()
tester.runAllTests()
  .then(() => {
    console.log('\n✅ Test execution completed!')
  })
  .catch((error) => {
    console.error('\n❌ Test execution failed:', error)
    process.exit(1)
  })