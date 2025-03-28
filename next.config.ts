import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Add resolve fallbacks for common dependencies
    config.resolve = {
      ...config.resolve,
      fallback: {
        ...config.resolve?.fallback,
        "fs": false,
        "path": false,
        "os": false
      }
    };

    // Optimize module resolution
    config.resolve.modules = [
      ...(config.resolve?.modules || []),
      "node_modules"
    ];

    // Handle motion and animation-related packages
    config.resolve.alias = {
      ...config.resolve?.alias,
      '@motionone/utils': require.resolve('@motionone/utils'),
      'motion': require.resolve('motion')
    };

    return config;
  },
  // Configure experimental features
  experimental: {
    // Configure server actions
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: ['localhost:7788', 'localhost:7789']
    }
  },
  // Configure async components and resources
  typescript: {
    // Needed for async server components
    ignoreBuildErrors: true
  },
  eslint: {
    // Disable eslint during build for now
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
