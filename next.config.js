/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '10mb' } }, // customer file uploads
};
module.exports = nextConfig;
