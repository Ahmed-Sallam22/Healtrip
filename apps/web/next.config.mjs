import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the Docker image.
  output: 'standalone',
  // Trace from the monorepo root so the workspace package (@healtrip/shared) is included.
  outputFileTracingRoot: path.join(here, '../..'),
  transpilePackages: ['@healtrip/shared'],
  // Linting runs once from the root flat config (`pnpm lint`), not inside `next build`.
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
