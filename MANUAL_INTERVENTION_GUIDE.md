# 🔧 Manual Intervention Guide - Bitcoin Blocks Mini App

## 🚨 Critical Issues Requiring Manual Intervention

This guide provides step-by-step instructions for resolving the critical issues identified during the synchronization analysis that prevent automated deployment.

## 📋 Issue Summary

| Issue | Severity | Impact | Resolution Time |
|-------|----------|--------|-----------------|
| Supabase Authentication | Critical | Blocks all automated operations | 15-30 minutes |
| Security Vulnerabilities | Critical | Production security risk | 30-60 minutes |
| Database Migration | High | Required for functionality | 10-20 minutes |
| Storage Setup | High | File upload capability | 15-25 minutes |

---

## 🔐 Issue 1: Supabase Authentication Resolution

### Problem
Service role key authentication failing with "Invalid Compact JWS" error, preventing access to Supabase services.

### Symptoms
- Error: `Could not find the table 'public.information_schema.tables' in the schema cache`
- Error: `StorageApiError: Invalid Compact JWS`
- Cannot access database or storage via API

### Resolution Steps

#### Step 1: Verify Current Credentials
1. **Access Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Navigate to project: `masgfwpxfytraiwkvbmg`

2. **Check Project Status**
   - Verify project is active and not paused
   - Check billing status
   - Confirm project URL: `https://masgfwpxfytraiwkvbmg.supabase.co`

#### Step 2: Validate Service Role Key
1. **Navigate to Settings → API**
2. **Copy the current Service Role Key**
3. **Compare with .env file value**:
   ```env
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hc2dmd3B4Znl0cmFpd2t2Ym1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDY5NDk1NiwiZXhwIjoyMDc2MjcwOTU2fQ.fqzMqkFBZW9dydhH5yBCp35wdfQUT5clVYH-umfa1ZA
   ```

#### Step 3: Regenerate if Necessary
1. **Click "Regenerate" next to Service Role Key**
2. **Copy the new key immediately**
3. **Update .env file** with new key
4. **Restart development server**

#### Step 4: Test Connection
```bash
# Test with new credentials
node scripts/analyze-supabase.js
```

### Expected Outcome
- Successful connection to Supabase
- Access to database schema
- Storage bucket accessibility
- No authentication errors

---

## 🛡️ Issue 2: Security Vulnerabilities Resolution

### Problem
5 critical security issues identified that must be addressed before production deployment.

### Resolution Steps

#### Step 1: Rotate Exposed API Keys
1. **GitHub Token**
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Revoke current token: `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`
   - Generate new token with appropriate permissions
   - Update .env file

2. **Farcaster API Key**
   - Contact Farcaster support for key rotation
   - Generate new API key
   - Update .env file

#### Step 2: Remove Unsafe JavaScript Patterns
1. **Search for eval() usage**:
   ```bash
   grep -r "eval(" src/
   ```

2. **Replace with safer alternatives**:
   ```typescript
   // Instead of eval()
   const result = JSON.parse jsonString;
   // or
   const result = new Function('return ' + jsonString)();
   ```

3. **Search for innerHTML usage**:
   ```bash
   grep -r "innerHTML" src/
   ```

4. **Replace with safe alternatives**:
   ```typescript
   // Instead of innerHTML
   element.textContent = safeContent;
   // or for HTML content
   element.innerHTML = DOMPurify.sanitize(unsafeContent);
   ```

#### Step 3: Implement Security Headers
1. **Update middleware.ts**:
   ```typescript
   import { NextResponse } from 'next/server';
   import type { NextRequest } from 'next/server';
   
   export function middleware(request: NextRequest) {
     const response = NextResponse.next();
     
     // Security headers
     response.headers.set('X-Content-Type-Options', 'nosniff');
     response.headers.set('X-Frame-Options', 'DENY');
     response.headers.set('X-XSS-Protection', '1; mode=block');
     response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
     response.headers.set(
       'Content-Security-Policy',
       "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
     );
     
     return response;
   }
   ```

#### Step 4: Validate Input Sanitization
1. **Review all API endpoints** for input validation
2. **Ensure proper sanitization** in form submissions
3. **Test for XSS vulnerabilities**

### Expected Outcome
- No exposed API keys in codebase
- Safe JavaScript practices implemented
- Security headers properly configured
- Input validation and sanitization in place

---

## 🗄️ Issue 3: Database Migration

### Problem
Database schema needs to be created manually due to authentication issues.

### Resolution Steps

#### Step 1: Access Supabase SQL Editor
1. **Go to Supabase Dashboard**
2. **Navigate to SQL Editor**
3. **Create new query**

#### Step 2: Execute Migration Files in Order
1. **Execute initial schema**:
   ```sql
   -- Copy contents from supabase/migrations/001_initial_schema.sql
   ```

2. **Execute error logs**:
   ```sql
   -- Copy contents from supabase/migrations/002_error_logs.sql
   ```

3. **Execute optimizations**:
   ```sql
   -- Copy contents from supabase/migrations/003_schema_optimizations.sql
   ```

#### Step 3: Verify Schema Creation
1. **Check Table Editor** for all tables
2. **Verify indexes** in Database → Indexes
3. **Test RLS policies** in Authentication → Policies

#### Step 4: Test Database Connection
```bash
# Test database access
curl -X POST https://masgfwpxfytraiwkvbmg.supabase.co/rest/v1/rounds \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Expected Outcome
- All 9 tables created successfully
- Indexes properly configured
- RLS policies active
- Database accessible via API

---

## 📁 Issue 4: Storage Bucket Setup

### Problem
Supabase storage buckets need to be created manually for file uploads.

### Resolution Steps

#### Step 1: Create Storage Buckets
1. **Go to Supabase Dashboard → Storage**
2. **Create buckets**:

   **Bucket 1: project-files**
   - Name: `project-files`
   - Public: No
   - File size limit: 50MB
   - Allowed MIME types: `*`

   **Bucket 2: assets**
   - Name: `assets`
   - Public: Yes
   - File size limit: 10MB
   - Allowed MIME types: `image/*`

   **Bucket 3: migrations**
   - Name: `migrations`
   - Public: No
   - File size limit: 1MB
   - Allowed MIME types: `text/sql`

   **Bucket 4: backups**
   - Name: `backups`
   - Public: No
   - File size limit: 100MB
   - Allowed MIME types: `*`

#### Step 2: Apply Storage Policies
1. **Go to Authentication → Policies**
2. **Create policies** for each bucket:

   **project-files bucket**:
   ```sql
   CREATE POLICY "Allow authenticated uploads" ON storage.objects
   FOR INSERT WITH CHECK (
     bucket_id = 'project-files' AND 
     auth.role() = 'authenticated'
   );
   
   CREATE POLICY "Allow authenticated reads" ON storage.objects
   FOR SELECT USING (
     bucket_id = 'project-files' AND 
     auth.role() = 'authenticated'
   );
   ```

   **assets bucket**:
   ```sql
   CREATE POLICY "Public read access" ON storage.objects
   FOR SELECT USING (
     bucket_id = 'assets'
   );
   ```

#### Step 3: Test Bucket Access
1. **Upload test file** via Dashboard
2. **Test file access** via API
3. **Verify permissions** work correctly

### Expected Outcome
- All 4 storage buckets created
- Proper access policies applied
- File upload/download working
- Permissions correctly configured

---

## 🔄 Verification Steps

After completing all interventions, verify success:

### 1. Run Analysis Script
```bash
node scripts/analyze-supabase.js
```
**Expected**: No connection errors, storage accessible

### 2. Test Application
```bash
pnpm dev
```
**Expected**: Application runs without errors

### 3. Test Database Operations
- Create test round
- Submit test guess
- Verify data persistence

### 4. Test File Upload
- Upload test file to storage
- Verify file accessibility
- Test permissions

### 5. Security Scan
```bash
npm audit
```
**Expected**: No high-severity vulnerabilities

---

## 📞 Troubleshooting

### Common Issues and Solutions

#### Issue: "Invalid Compact JWS" persists
**Solution**: 
1. Clear browser cache and cookies
2. Generate new service role key
3. Wait 5-10 minutes for propagation
4. Restart development server

#### Issue: Migration fails with permission error
**Solution**:
1. Verify service role key has admin privileges
2. Check if tables already exist
3. Drop existing tables if needed
4. Re-run migration

#### Issue: Storage bucket creation fails
**Solution**:
1. Check storage permissions in project settings
2. Verify service role key has storage access
3. Try creating bucket via SQL instead
4. Contact Supabase support if needed

#### Issue: Security vulnerabilities persist
**Solution**:
1. Use `git grep` to find all instances
2. Check node_modules for vulnerable packages
3. Update dependencies to latest versions
4. Run security scan again

---

## 📝 Post-Intervention Checklist

- [ ] Supabase connection successful
- [ ] All database tables created
- [ ] Storage buckets accessible
- [ ] Security vulnerabilities resolved
- [ ] Application runs without errors
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Backup procedures in place

---

## ⏰ Time Estimates

| Task | Minimum Time | Maximum Time |
|------|--------------|--------------|
| Authentication Resolution | 15 minutes | 30 minutes |
| Security Fixes | 30 minutes | 60 minutes |
| Database Migration | 10 minutes | 20 minutes |
| Storage Setup | 15 minutes | 25 minutes |
| Verification & Testing | 20 minutes | 40 minutes |
| **Total** | **90 minutes** | **175 minutes** |

---

## 🎯 Success Criteria

The intervention is successful when:
1. ✅ All automated scripts run without errors
2. ✅ Database schema is fully deployed
3. ✅ Storage buckets are accessible
4. ✅ Security scan shows no critical issues
5. ✅ Application functions correctly in development
6. ✅ Ready for production deployment

---

**Last Updated**: October 20, 2025  
**Version**: 1.0.0  
**Next Review**: After intervention completion