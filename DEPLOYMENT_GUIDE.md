# 🚀 Bitcoin Blocks - Enhanced Deployment Guide

## Supabase Real-Time Database Setup

This application uses **Supabase** for real-time multiplayer functionality, authentication, and data persistence. This guide covers complete setup and deployment.

---

## 📋 Prerequisites

### Required Accounts & Services
- **Supabase Account** - [https://supabase.com](https://supabase.com)
- **Vercel Account** - [https://vercel.com](https://vercel.com) (for deployment)
- **Farcaster Developer Account** - For mini-app configuration

### Required Tools
- **Node.js** (v18 or higher)
- **pnpm** (package manager)
- **Git** (version control)

---

## 🗄️ Supabase Project Setup

### Step 1: Create Supabase Project

1. **Sign in** to [Supabase Dashboard](https://supabase.com/dashboard)
2. **Click "New Project"**
3. **Configure Project**:
   - **Organization**: Select your organization
   - **Project Name**: `bitcoin-blocks`
   - **Database Password**: Generate a strong password
   - **Region**: Choose nearest region to your users
4. **Click "Create new project"**
5. **Wait for project creation** (2-3 minutes)

### Step 2: Get Project Credentials

1. **Navigate to Project Settings** → **API**
2. **Copy these values**:
   - **Project URL** (e.g., `https://xxx.supabase.co`)
   - **anon public** key
   - **service_role** key (secret, keep safe)

### Step 3: Configure Database

1. **Navigate to SQL Editor**
2. **Execute the schema** from `supabase/schema.sql`
3. **Run migrations** from `supabase/migrations/` folder:
   - `001_initial_schema.sql`
   - `002_error_logs.sql`
   - `003_schema_optimizations.sql`

### Step 4: Set Up Authentication

1. **Navigate to Authentication** → **Settings**
2. **Configure Site URL**: `https://bitcoin-block.vercel.app`
3. **Add Redirect URLs**:
   - `https://bitcoin-block.vercel.app/**`
   - `http://localhost:3000/**` (for development)

### Step 5: Configure Row Level Security (RLS)

1. **Navigate to Authentication** → **Policies**
2. **Enable RLS** on all tables
3. **Review policies** in the schema file

---

## 🔧 Environment Configuration

### Step 1: Environment Variables

Create `.env` file in project root:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Farcaster Configuration
FARCASTER_API_KEY=your_farcaster_api_key_here
NEXT_PUBLIC_FARCASTER_SDK_KEY=your_farcaster_sdk_key_here

# Application URLs
NEXT_PUBLIC_SITE_URL=https://bitcoin-block.vercel.app
SITE_URL=https://bitcoin-block.vercel.app
NEXT_PUBLIC_HOST=bitcoin-block.vercel.app
NEXTAUTH_URL=https://bitcoin-block.vercel.app

# Performance & Monitoring
NEXT_PUBLIC_ENABLE_PERFORMANCE_MONITORING=true
SENTRY_DSN=your_sentry_dsn_here
ANALYTICS_API_KEY=your_analytics_api_key_here

# Security Configuration
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
SECURITY_SECRET_KEY=your_security_secret_key_here

# External APIs
MEMPOOL_API_URL=https://mempool.space/api/v1
NEXT_PUBLIC_API_BASE_URL=https://bitcoin-block.vercel.app/api

# Admin Configuration
DEV_ADMIN_FIDS=250704,1107084
```

### Step 2: Vercel Environment Variables

1. **Go to Vercel Dashboard** → **Your Project** → **Settings** → **Environment Variables**
2. **Add all variables** from `.env` file
3. **Mark sensitive variables** as secret:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SECURITY_SECRET_KEY`
   - `FARCASTER_API_KEY`

---

## 🚀 Deployment Process

### Step 1: Install Dependencies

```bash
# Install dependencies
pnpm install

# Verify installation
pnpm run build
```

### Step 2: Local Testing

```bash
# Start development server
pnpm dev

# Test functionality:
# - User authentication
# - Round creation
# - Guess submission
# - Real-time updates
# - Admin panel
```

### Step 3: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy project
vercel --prod

# Or connect to existing project
vercel link
vercel --prod
```

### Step 4: Post-Deployment Verification

1. **Check Application Status**:
   - Navigate to `https://bitcoin-block.vercel.app`
   - Verify connection status shows "Connected"
   - Test authentication flow

2. **Test Core Features**:
   - User sign-in with Farcaster
   - Round creation (admin only)
   - Guess submission
   - Real-time chat
   - Leaderboard updates

3. **Monitor Performance**:
   - Check performance dashboard
   - Verify error logging is working
   - Monitor database performance

---

## 🔍 Enhanced Features Configuration

### Performance Monitoring

1. **Enable Performance Dashboard**:
   - Set `NEXT_PUBLIC_ENABLE_PERFORMANCE_MONITORING=true`
   - Configure Sentry DSN for error tracking
   - Set up analytics API key

2. **Monitor Key Metrics**:
   - Page load time
   - API response time
   - Database query performance
   - Error rates

### Security Configuration

1. **Rate Limiting**:
   - Configure limits per endpoint
   - Set appropriate windows
   - Monitor for abuse

2. **Content Security Policy**:
   - Review CSP headers in middleware
   - Adjust for your specific needs
   - Test with browser dev tools

3. **Input Validation**:
   - All inputs are validated server-side
   - XSS protection enabled
   - SQL injection prevention via RLS

### Real-time Features

1. **Supabase Realtime**:
   - Subscriptions automatically reconnect
   - Connection monitoring enabled
   - Optimistic updates for better UX

2. **Performance Optimization**:
   - Database indexes configured
   - Materialized views for analytics
   - Connection pooling enabled

---

## 🔧 Database Management

### Backup Strategy

1. **Automatic Backups**:
   - Supabase provides daily backups
   - Point-in-time recovery available
   - Export functionality for manual backups

2. **Schema Changes**:
   - Use migration files for version control
   - Test changes in staging first
   - Document all schema modifications

### Performance Optimization

1. **Indexes**:
   - Primary keys indexed
   - Foreign keys indexed
   - Query-specific indexes added

2. **Materialized Views**:
   - Analytics views pre-computed
   - Refresh strategies configured
   - Query performance monitored

---

## 📊 Monitoring & Analytics

### Application Monitoring

1. **Performance Dashboard**:
   - Real-time metrics available
   - Error tracking enabled
   - User behavior analytics

2. **Database Monitoring**:
   - Query performance tracked
   - Connection pool monitored
   - Resource usage tracked

### Error Handling

1. **Centralized Logging**:
   - All errors logged to database
   - Context information captured
   - Recovery mechanisms in place

2. **Alert Configuration**:
   - High error rate alerts
   - Performance degradation alerts
   - Security incident alerts

---

## 🔐 Security Best Practices

### Authentication & Authorization

1. **Farcaster Integration**:
   - JWT token validation
   - Session management
   - Admin verification

2. **Row Level Security**:
   - Users can only access their data
   - Admin permissions properly scoped
   - API access controlled

### Data Protection

1. **Input Validation**:
   - All inputs sanitized
   - Type checking enforced
   - Length limits applied

2. **Secure Headers**:
   - CSP headers configured
   - CORS properly set
   - Security headers enabled

---

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Issues
**Symptoms**: "Database Offline" message
**Solutions**:
1. Check Supabase project status
2. Verify environment variables
3. Test database connectivity
4. Check network policies

#### Authentication Issues
**Symptoms**: Login failures, permission errors
**Solutions**:
1. Verify Farcaster API keys
2. Check redirect URLs
3. Review RLS policies
4. Clear browser cache

#### Performance Issues
**Symptoms**: Slow page loads, timeouts
**Solutions**:
1. Check performance dashboard
2. Review database queries
3. Monitor resource usage
4. Optimize large operations

#### Real-time Issues
**Symptoms**: Updates not appearing, connection drops
**Solutions**:
1. Check Supabase Realtime status
2. Verify subscription configuration
3. Review network connectivity
4. Check browser console for errors

### Debug Tools

1. **Browser Console**:
   - Check for JavaScript errors
   - Monitor network requests
   - Review performance metrics

2. **Supabase Dashboard**:
   - Monitor database performance
   - Review authentication logs
   - Check real-time subscriptions

3. **Vercel Analytics**:
   - Monitor application performance
   - Review error rates
   - Track user behavior

---

## 📈 Scaling Considerations

### Database Scaling

1. **Connection Pooling**:
   - Supabase manages automatically
   - Monitor connection usage
   - Optimize query patterns

2. **Resource Limits**:
   - Monitor disk usage
   - Track compute usage
   - Plan for growth

### Application Scaling

1. **CDN Optimization**:
   - Static assets cached
   - Global distribution
   - Edge functions considered

2. **Load Balancing**:
   - Vercel handles automatically
   - Monitor response times
   - Optimize critical paths

---

## ✅ Success Checklist

After following this guide, verify:

- [ ] Supabase project created and configured
- [ ] Database schema applied successfully
- [ ] Environment variables configured
- [ ] Application deployed to Vercel
- [ ] Authentication flow working
- [ ] Real-time features functional
- [ ] Admin panel accessible
- [ ] Performance monitoring active
- [ ] Security measures in place
- [ ] Error logging functional
- [ ] Backup strategy configured
- [ ] Monitoring alerts set up

---

## 📚 Additional Resources

- **Supabase Documentation**: https://supabase.com/docs
- **Vercel Deployment Guide**: https://vercel.com/docs
- **Farcaster Developer Docs**: https://docs.farcaster.xyz
- **Next.js Documentation**: https://nextjs.org/docs
- **Performance Best Practices**: https://web.dev/performance/

---

## 🆘 Support

If you encounter issues:

1. **Check browser console** for detailed error messages
2. **Review Supabase logs** in dashboard
3. **Monitor Vercel function logs**
4. **Check performance dashboard** for insights
5. **Review this troubleshooting guide**

---

**Last Updated**: 2025  
**Version**: 2.0.0  
**Database**: Supabase PostgreSQL  
**Framework**: Next.js 14  
**Deployment**: Vercel
