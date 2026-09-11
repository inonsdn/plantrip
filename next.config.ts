import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Member avatars come straight from Google's CDN as plain <img> tags, so no
  // image optimisation config is needed here.
  agentRules: false,
};

export default nextConfig;
