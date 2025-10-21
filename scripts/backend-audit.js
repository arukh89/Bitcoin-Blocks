const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Kredensial Supabase
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA'

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

class BackendAuditor {
  constructor() {
    this.issues = []
    this.fixes = []
    this.warnings = []
  }

  async auditBackend() {
    console.log('🔍 MEMULAI AUDIT BACKEND KOMPREHENSIF...')
    console.log('Timestamp:', new Date().toISOString())

    // 1. Cek struktur database
    await this.auditDatabaseStructure()
    
    // 2. Cek API routes
    await this.auditApiRoutes()
    
    // 3. Cek konfigurasi Supabase
    await this.auditSupabaseConfig()
    
    // 4. Cek environment variables
    await this.auditEnvironmentVariables()
    
    // 5. Cek security
    await this.auditSecurity()
    
    // 6. Generate report
    this.generateReport()
  }

  async auditDatabaseStructure() {
    console.log('\n=== AUDIT DATABASE STRUCTURE ===')
    
    // Cek tabel yang ada
    const requiredTables = [
      'rounds',
      'guesses', 
      'chat_messages',
      'prize_configs',
      'admin_fids',
      'user_sessions',
      'audit_logs'
    ]

    for (const table of requiredTables) {
      try {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select('*')
          .limit(1)

        if (error) {
          if (error.message.includes('Could not find the table')) {
            this.issues.push(`Missing table: ${table}`)
            console.log(`❌ Table ${table}: MISSING`)
          } else {
            this.warnings.push(`Table ${table} access error: ${error.message}`)
            console.log(`⚠️ Table ${table}: ERROR - ${error.message}`)
          }
        } else {
          console.log(`✅ Table ${table}: OK`)
          
          // Cek struktur kolom
          if (data && data.length > 0) {
            const columns = Object.keys(data[0])
            console.log(`   Columns: ${columns.join(', ')}`)
          }
        }
      } catch (err) {
        this.issues.push(`Table ${table} exception: ${err.message}`)
        console.log(`❌ Table ${table}: EXCEPTION - ${err.message}`)
      }
    }

    // Cek foreign keys dan constraints
    console.log('\n--- Checking Relationships ---')
    try {
      const { data: roundsData } = await supabaseAdmin
        .from('rounds')
        .select('id, round_number')
        .limit(5)

      if (roundsData && roundsData.length > 0) {
        const testRoundId = roundsData[0].id
        
        // Test foreign key relationship
        const { data: guessesData, error: guessesError } = await supabaseAdmin
          .from('guesses')
          .select('*')
          .eq('round_id', testRoundId)
          .limit(1)

        if (guessesError) {
          this.warnings.push(`Foreign key issue rounds->guesses: ${guessesError.message}`)
          console.log(`⚠️ Foreign key rounds->guesses: ISSUE`)
        } else {
          console.log(`✅ Foreign key rounds->guesses: OK`)
        }
      }
    } catch (err) {
      this.warnings.push(`Relationship check failed: ${err.message}`)
      console.log(`⚠️ Relationship check: FAILED`)
    }
  }

  async auditApiRoutes() {
    console.log('\n=== AUDIT API ROUTES ===')
    
    const apiDir = path.join(__dirname, '../src/app/api')
    
    if (!fs.existsSync(apiDir)) {
      this.issues.push('API directory not found')
      console.log('❌ API directory: MISSING')
      return
    }

    // Scan API routes
    const scanDirectory = (dir, prefix = '') => {
      const items = fs.readdirSync(dir)
      
      for (const item of items) {
        const fullPath = path.join(dir, item)
        const stat = fs.statSync(fullPath)
        
        if (stat.isDirectory()) {
          scanDirectory(fullPath, `${prefix}${item}/`)
        } else if (item === 'route.ts' || item === 'route.js') {
          const route = `${prefix}${item}`
          console.log(`📁 API Route: /api/${prefix.replace(/\/$/, '')}`)
          
          // Analyze route file
          this.analyzeRouteFile(fullPath, prefix)
        }
      }
    }

    scanDirectory(apiDir)
  }

  analyzeRouteFile(filePath, routePrefix) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      
      // Check for common issues
      if (!content.includes('try') && !content.includes('catch')) {
        this.warnings.push(`Route ${routePrefix} missing error handling`)
      }
      
      if (content.includes('console.log') || content.includes('console.error')) {
        this.warnings.push(`Route ${routePrefix} has console logging`)
      }
      
      if (!content.includes('supabase') && !content.includes('Supabase')) {
        this.warnings.push(`Route ${routePrefix} may not use Supabase`)
      }
      
      // Check for authentication
      if (routePrefix.includes('admin') && !content.includes('isAdmin') && !content.includes('auth')) {
        this.issues.push(`Admin route ${routePrefix} missing authentication`)
      }
      
    } catch (err) {
      this.warnings.push(`Failed to analyze route ${routePrefix}: ${err.message}`)
    }
  }

  async auditSupabaseConfig() {
    console.log('\n=== AUDIT SUPABASE CONFIG ===')
    
    // Check .env file
    const envPath = path.join(__dirname, '../.env')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8')
      
      const requiredVars = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_JWT_SECRET'
      ]
      
      for (const varName of requiredVars) {
        if (envContent.includes(`${varName}=`)) {
          console.log(`✅ Environment variable ${varName}: FOUND`)
        } else {
          this.issues.push(`Missing environment variable: ${varName}`)
          console.log(`❌ Environment variable ${varName}: MISSING`)
        }
      }
    } else {
      this.issues.push('.env file not found')
      console.log('❌ .env file: MISSING')
    }

    // Check Supabase client configuration
    const clientPath = path.join(__dirname, '../src/lib/supabase-client.ts')
    if (fs.existsSync(clientPath)) {
      console.log('✅ Supabase client: FOUND')
      
      const clientContent = fs.readFileSync(clientPath, 'utf8')
      
      if (clientContent.includes('createClient')) {
        console.log('✅ Supabase client initialization: OK')
      } else {
        this.issues.push('Supabase client not properly initialized')
      }
    } else {
      this.issues.push('Supabase client file not found')
      console.log('❌ Supabase client: MISSING')
    }
  }

  async auditEnvironmentVariables() {
    console.log('\n=== AUDIT ENVIRONMENT VARIABLES ===')
    
    const envPath = path.join(__dirname, '../.env')
    if (!fs.existsSync(envPath)) {
      this.issues.push('.env file missing')
      return
    }

    const envContent = fs.readFileSync(envPath, 'utf8')
    const lines = envContent.split('\n')
    
    const issues = []
    
    for (const line of lines) {
      if (line.trim() && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=')
        const value = valueParts.join('=')
        
        if (!value || value.includes('your_') || value.includes('placeholder')) {
          issues.push(`Environment variable ${key} has placeholder value`)
        }
        
        if (key.includes('SECRET') || key.includes('KEY') || key.includes('TOKEN')) {
          if (value.length < 20) {
            this.warnings.push(`Secret ${key} may be too short`)
          }
        }
      }
    }
    
    if (issues.length > 0) {
      this.issues.push(...issues)
      issues.forEach(issue => console.log(`⚠️ ${issue}`))
    } else {
      console.log('✅ Environment variables: OK')
    }
  }

  async auditSecurity() {
    console.log('\n=== AUDIT SECURITY ===')
    
    // Check for exposed secrets in code
    const scanFilesForSecrets = (dir, excludeDirs = ['node_modules', '.next', '.git']) => {
      if (!fs.existsSync(dir)) return []
      
      const secrets = []
      const items = fs.readdirSync(dir)
      
      for (const item of items) {
        const fullPath = path.join(dir, item)
        const stat = fs.statSync(fullPath)
        
        if (stat.isDirectory() && !excludeDirs.includes(item)) {
          secrets.push(...scanFilesForSecrets(fullPath, excludeDirs))
        } else if (item.match(/\.(ts|js|json)$/)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8')
            
            // Check for potential secrets
            const secretPatterns = [
              /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, // JWT
              /sk-[a-zA-Z0-9]{24,}/g, // Stripe keys
              /ghp_[a-zA-Z0-9]{36}/g, // GitHub tokens
              /sbp_[a-zA-Z0-9]{40,}/g // Supabase tokens
            ]
            
            for (const pattern of secretPatterns) {
              const matches = content.match(pattern)
              if (matches && !fullPath.includes('.env')) {
                secrets.push({ file: fullPath, matches })
              }
            }
          } catch (err) {
            // Skip files that can't be read
          }
        }
      }
      
      return secrets
    }

    const secretsFound = scanFilesForSecrets(path.join(__dirname, '..'))
    
    if (secretsFound.length > 0) {
      this.issues.push('Potential secrets exposed in source code')
      secretsFound.forEach(({ file, matches }) => {
        console.log(`⚠️ Potential secrets in ${file}`)
      })
    } else {
      console.log('✅ Security scan: OK')
    }

    // Check RLS policies
    console.log('\n--- Checking RLS Policies ---')
    try {
      // This would require admin access to system tables
      console.log('ℹ️ RLS policy check requires direct database access')
    } catch (err) {
      this.warnings.push(`RLS policy check failed: ${err.message}`)
    }
  }

  generateReport() {
    console.log('\n=== AUDIT REPORT ===')
    console.log(`Issues found: ${this.issues.length}`)
    console.log(`Warnings: ${this.warnings.length}`)
    console.log(`Fixes needed: ${this.fixes.length}`)
    
    if (this.issues.length > 0) {
      console.log('\n🚨 CRITICAL ISSUES:')
      this.issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`)
      })
    }
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️ WARNINGS:')
      this.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning}`)
      })
    }
    
    if (this.fixes.length > 0) {
      console.log('\n🔧 RECOMMENDED FIXES:')
      this.fixes.forEach((fix, index) => {
        console.log(`${index + 1}. ${fix}`)
      })
    }

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      issues: this.issues,
      warnings: this.warnings,
      fixes: this.fixes,
      summary: {
        totalIssues: this.issues.length,
        totalWarnings: this.warnings.length,
        totalFixes: this.fixes.length
      }
    }
    
    const reportPath = path.join(__dirname, '../logs/backend-audit-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(`\n📄 Detailed report saved to: ${reportPath}`)
  }
}

// Jalankan audit
const auditor = new BackendAuditor()
auditor.auditBackend()
  .then(() => {
    console.log('\n✅ Backend audit completed!')
  })
  .catch(error => {
    console.error('\n❌ Backend audit failed:', error)
    process.exit(1)
  })