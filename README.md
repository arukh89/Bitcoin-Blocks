# ⛓️ Bitcoin Blocks - Enhanced Mini App

A real-time Bitcoin transaction prediction game built with Next.js 14, Supabase, and Farcaster authentication. Features comprehensive performance monitoring, security enhancements, and scalable architecture.

## 🎮 How It Works

Users predict the number of transactions in the next Bitcoin block. The winner is whoever gets closest to the actual count!

### Enhanced Game Flow:
1. **Admin creates a round** with start/end times and prize configuration
2. **Users sign in** with enhanced Farcaster authentication and submit predictions (0-10,000 transactions)
3. **Real-time updates** via Supabase subscriptions with optimistic updates
4. **Round closes** automatically at end time with retry mechanisms
5. **Admin fetches results** from mempool.space API with error handling
6. **Winner announced** - closest guess wins (earliest submission breaks ties)
7. **Performance metrics** tracked throughout the entire process

## 🚀 Enhanced Tech Stack

- **Frontend**: Next.js 14 (App Router) + React 18 + TypeScript
- **Database**: Supabase (PostgreSQL + Realtime + Auth + Storage + Edge Functions)
- **Authentication**: Enhanced Farcaster SDK with retry mechanisms
- **Blockchain Data**: mempool.space API with caching and rate limiting
- **UI**: Tailwind CSS + shadcn/ui + Framer Motion
- **Performance**: Custom performance monitoring system
- **Security**: Comprehensive security middleware with rate limiting
- **Error Handling**: Centralized error logging and recovery

## 📦 Enhanced Setup

### Quick Start (Development Mode)

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Required Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

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

## 🔑 Enhanced Admin Access

Admin FIDs **250704** and **1107084** have access to:
- **Enhanced Admin Panel** with comprehensive analytics
- **Round Management** with batch operations
- **Performance Monitoring** with real-time metrics
- **Audit Logging** for all admin actions
- **Security Monitoring** with suspicious activity detection
- **Configuration Management** with validation

## 🎯 Enhanced Features

### Core Features
✅ **Real-time Updates** - Supabase Realtime with connection monitoring  
✅ **Enhanced Farcaster Auth** - SDK with retry mechanisms and session management  
✅ **Live Countdown** - Synchronized timer with automatic refresh  
✅ **Dynamic Leaderboard** - Optimistic updates with conflict resolution  
✅ **Anti-cheat** - One guess per user per round with validation  
✅ **Transparent Results** - Actual Bitcoin block data with retry logic  
✅ **Complete Audit Trail** - All events logged with error tracking  

### New Enhanced Features
🆕 **Performance Monitoring** - Real-time performance metrics and alerts  
🆕 **Security Middleware** - Rate limiting, CORS, and suspicious activity detection  
🆕 **Error Handling** - Centralized error logging with recovery mechanisms  
🆕 **Optimistic Updates** - Instant UI feedback with conflict resolution  
🆕 **Connection Monitoring** - Automatic reconnection with exponential backoff  
🆕 **Analytics Dashboard** - Comprehensive application metrics  
🆕 **Session Management** - Secure session handling with automatic refresh  
🆕 **Input Validation** - Comprehensive sanitization and XSS prevention  

## 🗄️ Enhanced Supabase Schema

### Tables:
- **rounds** - Game rounds with enhanced metadata and indexes
- **guesses** - User predictions with validation and constraints
- **chat_messages** - Real-time chat with message types and filtering
- **prize_configs** - Configurable prize distribution system
- **admin_fids** - Dynamic admin permission management
- **user_sessions** - Secure session tracking with expiration
- **audit_logs** - Complete audit trail for admin actions
- **error_logs** - Centralized error logging and analysis
- **analytics_events** - Custom analytics event tracking

### Enhanced Features:
- **Row Level Security (RLS)** policies for all tables
- **Optimized indexes** for performance
- **Materialized views** for analytics
- **Database functions** for common operations
- **Triggers** for data validation and auditing

## 🔌 Enhanced API Integration

### New API Endpoints:
- **`/api/analytics`** - Performance metrics and application analytics
- **`/api/proxy`** - Universal proxy with security headers
- **`/api/errors`** - Centralized error logging endpoint
- **`/api/admin`** - Enhanced admin operations with batch support
- **`/api/auth/me`** - Enhanced authentication with retry logic

### Enhanced External APIs:
- **mempool.space API** with caching, rate limiting, and retry mechanisms
- **Farcaster SDK** with enhanced error handling and connection monitoring
- **Supabase Edge Functions** for server-side operations

## 📱 Enhanced Farcaster Integration

Built as a Farcaster mini-app with:
- **Enhanced Frame Metadata** for proper embedding
- **SDK Initialization** with retry mechanisms and error handling
- **Session Management** with automatic refresh and timeout handling
- **Profile Integration** with caching and validation
- **Admin Verification** with fallback mechanisms

## 🛠️ Enhanced Development Commands

```bash
# Development
pnpm dev              # Start development server
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm type-check       # Run TypeScript checks

# Database Management
pnpm db:push          # Push schema changes to Supabase
pnpm db:reset         # Reset database to initial state
pnpm db:seed          # Seed database with sample data

# Deployment
pnpm deploy:prod      # Deploy to production
pnpm deploy:staging   # Deploy to staging
```

## 🔧 Enhanced Configuration

### Performance Monitoring
- **Real-time Metrics** - Page load time, API response time, memory usage
- **Performance Dashboard** - Live monitoring with alerts
- **Error Tracking** - Comprehensive error logging and analysis
- **Analytics Integration** - Custom event tracking and user behavior

### Security Features
- **Rate Limiting** - Configurable limits per endpoint
- **CORS Configuration** - Secure cross-origin requests
- **Input Validation** - Comprehensive sanitization and validation
- **Suspicious Activity Detection** - Automated threat detection
- **Content Security Policy** - XSS prevention and secure headers

### Error Handling
- **Centralized Logging** - All errors logged with context
- **Retry Mechanisms** - Automatic retry with exponential backoff
- **Error Recovery** - Graceful degradation and recovery
- **User Feedback** - Clear error messages and guidance

## 📊 Enhanced Monitoring

### Performance Metrics
- **Page Load Time** - Comprehensive loading performance tracking
- **API Response Time** - Endpoint performance monitoring
- **Memory Usage** - Client-side memory tracking
- **Connection Health** - Real-time connection monitoring
- **User Interactions** - Event tracking and analysis

### Security Monitoring
- **Rate Limiting** - Request pattern analysis
- **Suspicious Activity** - Automated threat detection
- **Authentication Events** - Login/logout tracking
- **Admin Actions** - Complete audit trail

## 🚀 Enhanced Deployment

### Production Deployment
1. **Environment Setup** - Configure all environment variables
2. **Database Migration** - Apply schema changes and indexes
3. **Security Configuration** - Set up CORS, rate limiting, and CSP
4. **Performance Monitoring** - Enable analytics and error tracking
5. **Health Checks** - Verify all systems are operational

### Vercel Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod

# Environment variables
vercel env add
```

## 📝 Enhanced Documentation

### API Documentation
- **OpenAPI Specification** - Complete API documentation
- **Endpoint Reference** - Detailed parameter and response documentation
- **Authentication Guide** - Farcaster authentication flow
- **Error Handling** - Error codes and recovery procedures

### Development Guide
- **Architecture Overview** - System design and data flow
- **Component Library** - Reusable component documentation
- **Performance Optimization** - Best practices and guidelines
- **Security Guidelines** - Security best practices and implementation

## 🔍 Enhanced Troubleshooting

### Common Issues
- **Connection Problems** - Automatic reconnection with fallback
- **Authentication Issues** - Enhanced error messages and recovery
- **Performance Issues** - Real-time monitoring and alerts
- **Security Issues** - Automated detection and response

### Debug Tools
- **Performance Dashboard** - Real-time performance monitoring
- **Error Logs** - Centralized error tracking and analysis
- **Network Monitoring** - Request/response tracking
- **User Session Tracking** - Session state and health monitoring

## 📄 Enhanced License

MIT

---

Built with ❤️ using [Enhanced Bitcoin Blocks Architecture](https://bitcoin-block.vercel.app)

## 🆕 Enhanced Changelog

### v2.0.0 - Enhanced Release
- **Migrated** from SpacetimeDB to Supabase for better scalability
- **Added** comprehensive performance monitoring system
- **Implemented** enhanced security middleware with rate limiting
- **Created** centralized error handling and logging
- **Added** optimistic updates with conflict resolution
- **Enhanced** Farcaster authentication with retry mechanisms
- **Implemented** real-time subscriptions with connection monitoring
- **Added** comprehensive analytics and monitoring dashboard
- **Enhanced** admin panel with batch operations and audit logging
- **Implemented** comprehensive input validation and sanitization
- **Added** materialized views for analytics optimization
- **Enhanced** deployment configuration with health checks
- **Implemented** comprehensive documentation and guides
