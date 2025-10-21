# Vercel Deployment Fix Guide

## Issues Identified and Fixed

### 1. Edge Runtime Compatibility Issues
**Problem**: Supabase client was using Node.js APIs (`process.versions` and `process.version`) not supported in Edge Runtime.

**Solution**: 
- Created `vercel.json` to force Node.js runtime for all API routes
- Updated `next.config.js` with proper webpack configuration
- Added fallbacks for Node.js modules in client bundle

### 2. Environment Variables URL Mismatch
**Problem**: Environment variables had incorrect URLs (`bitcoin-block.vercel.app` instead of `bitcoin-blocks.vercel.app`)

**Solution**:
- Updated `.env` file with correct URLs
- Added environment variables to `vercel.json` for deployment
- Ensured consistency across all configuration files

### 3. Middleware Configuration
**Problem**: Middleware was running in Edge Runtime causing compatibility issues

**Solution**:
- Added diagnostic logging to middleware
- Configured proper runtime settings in `vercel.json`

## Files Modified

1. **`.env`** - Fixed URL mismatches
2. **`src/middleware.ts`** - Added diagnostic logging
3. **`src/lib/supabase-client.ts`** - Added debug logging and cleaned up configuration
4. **`src/app/api/debug/route.ts`** - Created debug endpoint for testing
5. **`next.config.js`** - Added webpack configuration for Node.js modules
6. **`vercel.json`** - Configured Node.js runtime for API routes

## Vercel Environment Variables Configuration

Make sure to set these environment variables in your Vercel project settings:

### Required Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- `SUPABASE_JWT_SECRET` - Your Supabase JWT secret
- `FARCASTER_API_KEY` - Your Farcaster API key

### URL Configuration:
- `NEXT_PUBLIC_SITE_URL` - `https://bitcoin-blocks.vercel.app`
- `SITE_URL` - `https://bitcoin-blocks.vercel.app`
- `NEXTAUTH_URL` - `https://bitcoin-blocks.vercel.app`
- `CORS_ORIGIN` - `https://bitcoin-blocks.vercel.app`
- `NEXT_PUBLIC_API_BASE_URL` - `https://bitcoin-blocks.vercel.app/api`

## Deployment Steps

1. **Push changes to GitHub**:
   ```bash
   git add .
   git commit -m "Fix Edge Runtime compatibility and environment variables"
   git push origin main
   ```

2. **Configure Vercel Environment Variables**:
   - Go to your Vercel project dashboard
   - Navigate to Settings → Environment Variables
   - Add all required environment variables listed above

3. **Redeploy**:
   - Either trigger automatic deployment from GitHub push
   - Or manually redeploy from Vercel dashboard

4. **Test Deployment**:
   - Visit `https://bitcoin-blocks.vercel.app/api/debug` to test configuration
   - Check that all services are working properly
   - Monitor Vercel function logs for any remaining issues

## Debugging

If issues persist after deployment:

1. **Check the debug endpoint**: `https://bitcoin-blocks.vercel.app/api/debug`
2. **Review Vercel function logs** in the dashboard
3. **Verify environment variables** are correctly set
4. **Check Supabase connection** using the debug endpoint

## Expected Results

After applying these fixes:
- ✅ Edge Runtime warnings should be eliminated
- ✅ All API routes should use Node.js runtime
- ✅ Environment variables should be correctly configured
- ✅ Supabase client should work properly
- ✅ Application should deploy successfully without warnings