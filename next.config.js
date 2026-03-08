/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disabled: double-invocation breaks camera/model effects
  transpilePackages: ['@vladmandic/face-api'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // face-api / TF.js uses dynamic requires that don't exist in browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        os: false,
        util: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
