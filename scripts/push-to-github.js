const { execSync } = require('child_process');

console.log('🚀 Memulai proses push ke GitHub...\n');

try {
    // 1. Check git status
    console.log('📋 Memeriksa status git...');
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    console.log(status);
    
    // 2. Add all changes
    console.log('➕ Menambahkan semua perubahan...');
    execSync('git add .', { stdio: 'inherit' });
    
    // 3. Commit changes
    console.log('💾 Membuat commit...');
    const commitMessage = 'Fix migration tables and update prize config with $Seconds token';
    execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
    
    // 4. Push to remote
    console.log('📤 Push ke GitHub...');
    execSync('git push', { stdio: 'inherit' });
    
    console.log('\n✅ Semua perubahan berhasil di-push ke GitHub!');
    console.log('\n📝 Ringkasan perubahan:');
    console.log('- Fixed SQL migration syntax errors');
    console.log('- Updated prize config with $Seconds token (Time is money)');
    console.log('- Added verification and debugging scripts');
    console.log('- Database tables: prize_configs, admin_fids, audit_logs');
    
} catch (error) {
    console.error('❌ Error during git operations:', error.message);
    
    if (error.message.includes('git')) {
        console.log('\n💡 Pastikan:');
        console.log('1. Git sudah terinstall');
        console.log('2. Repository sudah diinisialisasi (git init)');
        console.log('3. Remote repository sudah dikonfigurasi (git remote add origin <url>)');
    }
}