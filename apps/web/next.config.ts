import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The shared contract is TypeScript source in a sibling workspace, so Next has
  // to compile it rather than treat it as a prebuilt dependency.
  transpilePackages: ['@corpus/shared'],
};

export default config;
