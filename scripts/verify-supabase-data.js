const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifySupabaseData() {
    console.log('🔍 Memeriksa data di Supabase...\n');
    
    try {
        // 1. Cek tabel yang ada
        console.log('📋 Memeriksa tabel yang ada...');
        const { data: tables, error: tablesError } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
            .in('table_name', ['prize_configs', 'admin_fids', 'audit_logs']);
        
        if (tablesError) {
            console.error('❌ Error checking tables:', tablesError);
        } else {
            console.log('✅ Tabel yang ditemukan:', tables.map(t => t.table_name).join(', '));
        }
        
        // 2. Cek data admin_fids
        console.log('\n👥 Memeriksa data admin_fids...');
        const { data: adminFids, error: adminError } = await supabase
            .from('admin_fids')
            .select('*');
            
        if (adminError) {
            console.error('❌ Error checking admin_fids:', adminError);
        } else {
            console.log('✅ Data admin_fids:', adminFids.length, 'records');
            adminFids.forEach(admin => {
                console.log(`   - FID: ${admin.fid}, Permissions: ${JSON.stringify(admin.permissions)}`);
            });
        }
        
        // 3. Cek data prize_configs
        console.log('\n🏆 Memeriksa data prize_configs...');
        const { data: prizeConfigs, error: prizeError } = await supabase
            .from('prize_configs')
            .select('*');
            
        if (prizeError) {
            console.error('❌ Error checking prize_configs:', prizeError);
        } else {
            console.log('✅ Data prize_configs:', prizeConfigs.length, 'records');
            prizeConfigs.forEach(config => {
                const configData = typeof config.config_data === 'string' 
                    ? JSON.parse(config.config_data) 
                    : config.config_data;
                console.log(`   - Version: ${config.version}`);
                console.log(`   - Token: ${configData.tokenTicker || 'N/A'} (${configData.tokenName || 'N/A'})`);
                console.log(`   - Contract: ${configData.tokenContractAddress || 'N/A'}`);
                console.log(`   - Network: ${configData.network || 'N/A'}`);
            });
        }
        
        // 4. Cek data audit_logs
        console.log('\n📝 Memeriksa data audit_logs...');
        const { data: auditLogs, error: auditError } = await supabase
            .from('audit_logs')
            .select('*')
            .limit(5);
            
        if (auditError) {
            console.error('❌ Error checking audit_logs:', auditError);
        } else {
            console.log('✅ Data audit_logs:', auditLogs.length, 'records (showing latest 5)');
            auditLogs.forEach(log => {
                console.log(`   - ID: ${log.id}, Action: ${log.action}, Admin: ${log.admin_fid}`);
            });
        }
        
        // 5. Cek apakah ada error logs
        console.log('\n🚨 Memeriksa error logs...');
        const { data: errorLogs, error: errorLogsError } = await supabase
            .from('error_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
            
        if (errorLogsError) {
            console.log('ℹ️ Tabel error_logs tidak ditemukan atau tidak ada akses');
        } else {
            console.log('⚠️ Error logs ditemukan:', errorLogs.length, 'records');
            errorLogs.forEach(log => {
                console.log(`   - ${log.error_message} (${log.created_at})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error during verification:', error);
    }
}

// Cek status file lokal
function checkLocalFiles() {
    console.log('\n💻 Memeriksa file lokal yang berubah...');
    
    const { execSync } = require('child_process');
    
    try {
        // Cek git status
        const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
        
        if (gitStatus.trim()) {
            console.log('📝 File yang berubah:');
            console.log(gitStatus);
            console.log('\n💡 Rekomendasi: Push perubahan ke GitHub dengan perintah:');
            console.log('   git add .');
            console.log('   git commit -m "Fix migration tables and update prize config"');
            console.log('   git push');
        } else {
            console.log('✅ Tidak ada perubahan file lokal');
        }
    } catch (error) {
        console.log('ℹ️ Tidak bisa cek git status (bukan git repository atau git tidak terinstall)');
    }
}

async function main() {
    await verifySupabaseData();
    checkLocalFiles();
    
    console.log('\n🎯 Rekomendasi:');
    console.log('1. Jika ada tabel yang hilang, jalankan kembali migration dari file 004_missing_tables_fix.sql');
    console.log('2. Jika ada perubahan file lokal, push ke GitHub untuk backup');
    console.log('3. Jika ada error logs, periksa aplikasi untuk troubleshooting');
}

main();