#!/bin/bash

# Bitcoin Blocks Mini App - Supabase Deployment Script
# This script helps deploy the Supabase migration

set -e

echo "🚀 Bitcoin Blocks - Supabase Deployment Script"
echo "=============================================="

# Check if required environment variables are set
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    echo "❌ NEXT_PUBLIC_SUPABASE_URL is not set"
    exit 1
fi

if [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
    echo "❌ NEXT_PUBLIC_SUPABASE_ANON_KEY is not set"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ SUPABASE_SERVICE_ROLE_KEY is not set"
    exit 1
fi

echo "✅ Environment variables validated"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Build the application
echo "🔨 Building application..."
pnpm build

# Run database setup if requested
if [ "$1" = "--setup-db" ]; then
    echo "🗄️ Setting up database schema..."
    node -e "
    const { setupDatabaseSchema } = require('./supabase/setup-schema.ts');
    setupDatabaseSchema().then(success => {
        if (success) {
            console.log('✅ Database setup completed successfully');
            process.exit(0);
        } else {
            console.log('❌ Database setup failed');
            process.exit(1);
        }
    }).catch(error => {
        console.error('💥 Database setup error:', error);
        process.exit(1);
    });
    "
fi

# Verify Supabase connection
echo "🔍 Verifying Supabase connection..."
node -e "
const { supabase } = require('./src/lib/supabase-client.ts');
supabase.from('admin_fids').select('fid').limit(1).then(({ data, error }) => {
    if (error) {
        console.error('❌ Supabase connection failed:', error);
        process.exit(1);
    } else {
        console.log('✅ Supabase connection verified');
        process.exit(0);
    }
}).catch(error => {
    console.error('💥 Connection error:', error);
    process.exit(1);
});
"

echo "🎉 Deployment preparation completed!"
echo ""
echo "Next steps:"
echo "1. Deploy to Vercel: vercel --prod"
echo "2. Test the application at your domain"
echo "3. Verify real-time subscriptions work"
echo "4. Test admin functionality"
echo ""
echo "For troubleshooting, see SUPABASE_MIGRATION_GUIDE.md"