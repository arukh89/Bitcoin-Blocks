/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimize build for Vercel deployment
  swcMinify: true,
  
  // Ensure proper environment variable handling
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  
  // Configure API routes to use Node.js runtime by default
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js'],
  },
  
  // Webpack configuration to handle Supabase client properly
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude Node.js-specific modules from client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      }
    }
    return config
  },
}

module.exports = nextConfig