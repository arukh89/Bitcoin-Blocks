# Bitcoin Blocks Mini App - Supabase Migration Guide

## Overview
This guide documents the complete migration from SpacetimeDB to Supabase for the Bitcoin Blocks Mini App. The migration provides improved performance, security, scalability, and better integration with modern web technologies.

## Architecture Changes

### Before (SpacetimeDB)
- Real-time database with custom binary protocol
- TypeScript-generated client bindings
- Custom authentication system
- Limited RLS and security features
- WebSocket-based real-time subscriptions

### After (Supabase)
- PostgreSQL database with full SQL support
- RESTful API with automatic type generation
- Built-in authentication and Row Level Security (RLS)
- Comprehensive security and audit logging
- Real-time subscriptions with PostgreSQL replication

## Database Schema

### Tables Created

#### `admin_fids`
- Stores admin Farcaster IDs for role-based access control
- Includes permissions and timestamps

#### `user_sessions`
- Manages user authentication sessions
- Stores session data and expiration times

#### `rounds`
- Game rounds with status tracking
- Includes timing, prize information, and results

#### `guesses`
- User predictions for each round
- Enforces unique guesses per user per round

#### `chat_messages`
- Global chat functionality
- Supports different message types (chat, system, winner, guess)

#### `prize_configs`
- Configuration for prize distribution
- Versioned for audit trail

#### `audit_logs`
- Comprehensive logging of admin actions
- Immutable records for compliance

### Key Features

#### Row Level Security (RLS)
- Fine-grained access control at the database level
- Users can only access their own data
- Admins have elevated privileges with audit logging

#### Indexes for Performance
- Optimized queries for common operations
- Composite indexes for complex queries

#### Real-time Subscriptions
- PostgreSQL change data capture
- Efficient real-time updates to clients

## Authentication System

### Farcaster Integration
- Farcaster SDK integration for user authentication
- Automatic user profile retrieval
- Admin privilege verification

### Session Management
- Secure session storage in Supabase
- Automatic session refresh
- Session expiration handling

### User Context
- Automatic context setting for RLS
- Session persistence across page reloads
- Secure token management

## API Changes

### New Endpoints

#### `/api/admin`
- Admin-only operations
- Statistics and analytics
- Round management
- Prize configuration updates

#### Enhanced `/api/auth/me`
- Integration with Supabase sessions
- Admin status detection
- Profile caching

### Existing Endpoints
- `/api/mempool` - Unchanged (Bitcoin API proxy)
- `/api/farcaster-announce` - Unchanged

## Component Updates

### GameContext
- Complete rewrite for Supabase integration
- Real-time subscription management
- Improved error handling and loading states
- Optimistic updates for better UX

### AuthButton
- Integration with Supabase authentication
- Improved user state management
- Disconnect functionality

### FarcasterWrapper
- New component for initialization
- Automatic authentication flow
- Loading states and error handling

## Configuration

### Environment Variables
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Farcaster Configuration
FARCASTER_API_KEY=your_farcaster_api_key

# App Configuration
NEXT_PUBLIC_HOST=your_domain
```

### App Configuration
- Updated to use 'supabase' mode instead of 'realtime'
- Configurable Supabase connection settings
- Real-time subscription parameters

## Security Enhancements

### Row Level Security Policies
- Users can only access their own data
- Admin operations require verification
- Automatic audit logging for all admin actions

### Authentication Security
- JWT token validation
- Session expiration handling
- Secure context setting for database operations

### Data Validation
- Server-side validation for all inputs
- Type safety with TypeScript
- SQL injection prevention

## Performance Improvements

### Database Optimization
- Optimized queries with proper indexing
- Efficient real-time subscriptions
- Connection pooling

### Client-side Optimizations
- Optimistic updates
- Efficient state management
- Reduced API calls through caching

### Real-time Performance
- PostgreSQL replication for real-time updates
- Efficient change data capture
- Configurable event throttling

## Deployment

### Database Setup
1. Create Supabase project
2. Run schema setup script
3. Configure environment variables
4. Test authentication flow

### Application Deployment
1. Update environment variables
2. Deploy to Vercel/Netlify
3. Verify real-time subscriptions
4. Test admin functionality

### Monitoring
- Built-in error logging
- Performance monitoring
- Audit log review

## Migration Steps

### 1. Database Setup
```bash
# Run the schema setup script
npm run setup:supabase
```

### 2. Environment Configuration
```bash
# Copy environment template
cp .env.example .env.local

# Update with your Supabase credentials
```

### 3. Application Configuration
- Update `src/config/app-config.ts` to use 'supabase' mode
- Verify all import paths are correct
- Test authentication flow

### 4. Testing
- Test user authentication
- Verify real-time subscriptions
- Test admin functionality
- Validate all game mechanics

## Rollback Plan

### If Issues Occur
1. Switch back to 'mock' mode in configuration
2. Disable Supabase integration
3. Restore previous version if needed
4. Investigate and fix issues

### Data Migration
- Export data from Supabase if needed
- Import to previous system if rollback required
- Maintain backup of all data

## Troubleshooting

### Common Issues

#### Authentication Failures
- Verify Farcaster API key
- Check Supabase configuration
- Review JWT token validation

#### Real-time Subscriptions
- Check PostgreSQL replication settings
- Verify RLS policies
- Review network connectivity

#### Performance Issues
- Check database indexes
- Review query performance
- Monitor connection pooling

### Debug Tools
- Supabase dashboard
- Browser developer tools
- Application logs

## Future Enhancements

### Planned Features
- Enhanced analytics dashboard
- Automated backup systems
- Advanced admin controls
- Performance monitoring

### Scalability
- Database optimization
- Caching strategies
- Load balancing
- CDN integration

## Support

### Documentation
- Supabase documentation
- Farcaster SDK documentation
- Next.js documentation

### Community
- GitHub issues
- Discord community
- Stack Overflow

## Conclusion

The migration to Supabase provides a more robust, scalable, and maintainable foundation for the Bitcoin Blocks Mini App. The enhanced security features, improved performance, and better developer experience will support future growth and feature development.

All existing functionality has been preserved while adding new capabilities for administration, monitoring, and user experience improvements.