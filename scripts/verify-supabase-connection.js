const { createClient } = require('@supabase/supabase-js')

// Kredensial Supabase dari user
const SUPABASE_URL = 'https://masgfwpxfytraiwkvbmg.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2OTQ5NTYsImV4cCI6MjA3NjI3MDk1Nn0.QAVE2pVMR869KycgzXe2MaQyJTyQb-yZM5zfIbtsMDM'

console.log('🔍 Memulai verifikasi koneksi Supabase...')
console.log('Project URL:', SUPABASE_URL)
console.log('Timestamp:', new Date().toISOString())

// Buat client dengan Service Role Key
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Buat client dengan Anon Key
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function verifyConnection() {
  console.log('\n=== VERIFIKASI KONEKSI SUPABASE ===')
  
  // Test 1: Koneksi dengan Service Role Key
  console.log('\n1. Testing Service Role Key connection...')
  try {
    const { data, error } = await supabaseAdmin
      .from('rounds')
      .select('id')
      .limit(1)
    
    if (error) {
      console.error('❌ Service Role Key FAILED:', error.message)
      return false
    } else {
      console.log('✅ Service Role Key SUCCESS')
      console.log('   Sample data:', data)
    }
  } catch (err) {
    console.error('❌ Service Role Key EXCEPTION:', err.message)
    return false
  }

  // Test 2: Koneksi dengan Anon Key
  console.log('\n2. Testing Anon Key connection...')
  try {
    const { data, error } = await supabase
      .from('rounds')
      .select('id')
      .limit(1)
    
    if (error) {
      console.error('❌ Anon Key FAILED:', error.message)
    } else {
      console.log('✅ Anon Key SUCCESS')
      console.log('   Sample data:', data)
    }
  } catch (err) {
    console.error('❌ Anon Key EXCEPTION:', err.message)
  }

  // Test 3: Cek struktur tabel
  console.log('\n3. Testing table structure...')
  const tables = ['rounds', 'guesses', 'chat_messages', 'prize_configs', 'admin_fids', 'user_sessions', 'audit_logs']
  
  for (const table of tables) {
    try {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*')
        .limit(1)
      
      if (error) {
        console.error(`❌ Table ${table}:`, error.message)
      } else {
        console.log(`✅ Table ${table}: OK`)
        if (data && data.length > 0) {
          console.log(`   Columns:`, Object.keys(data[0]))
        }
      }
    } catch (err) {
      console.error(`❌ Table ${table} EXCEPTION:`, err.message)
    }
  }

  // Test 4: Cek RLS policies
  console.log('\n4. Testing RLS policies...')
  try {
    const { data, error } = await supabaseAdmin.rpc('get_table_policies', { 
      table_name: 'rounds' 
    })
    
    if (error) {
      console.log('⚠️ Cannot check RLS policies (function may not exist):', error.message)
    } else {
      console.log('✅ RLS policies:', data)
    }
  } catch (err) {
    console.log('⚠️ RLS policy check failed:', err.message)
  }

  // Test 5: Test write operation
  console.log('\n5. Testing write operations...')
  try {
    const testRound = {
      round_number: 99999,
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      prize: 'test',
      status: 'test',
      created_at: Date.now(),
      duration_min: 60
    }
    
    const { data, error } = await supabaseAdmin
      .from('rounds')
      .insert(testRound)
      .select()
    
    if (error) {
      console.error('❌ Write operation FAILED:', error.message)
    } else {
      console.log('✅ Write operation SUCCESS')
      console.log('   Created test round:', data[0])
      
      // Cleanup test data
      await supabaseAdmin
        .from('rounds')
        .delete()
        .eq('id', data[0].id)
      
      console.log('✅ Test data cleaned up')
    }
  } catch (err) {
    console.error('❌ Write operation EXCEPTION:', err.message)
  }

  // Test 6: Health check
  console.log('\n6. Database health check...')
  try {
    const startTime = Date.now()
    const { data, error } = await supabaseAdmin
      .from('rounds')
      .select('count', { count: 'exact', head: true })
    
    const responseTime = Date.now() - startTime
    
    if (error) {
      console.error('❌ Health check FAILED:', error.message)
    } else {
      console.log('✅ Health check SUCCESS')
      console.log(`   Response time: ${responseTime}ms`)
      console.log(`   Total rounds: ${data?.[0]?.count || 0}`)
    }
  } catch (err) {
    console.error('❌ Health check EXCEPTION:', err.message)
  }

  console.log('\n=== VERIFIKASI SELESAI ===')
  return true
}

// Jalankan verifikasi
verifyConnection()
  .then(success => {
    if (success) {
      console.log('\n🎉 Verifikasi koneksi Supabase berhasil!')
    } else {
      console.log('\n💥 Verifikasi koneksi Supabase gagal!')
    }
    process.exit(success ? 0 : 1)
  })
  .catch(error => {
    console.error('\n💥 Unexpected error:', error)
    process.exit(1)
  })