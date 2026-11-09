import type { NextConfig } from 'next';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const nextConfig: NextConfig = {
    output: process.env.GEORANKER_IS_ELECTRON === '1' ? 'standalone' : undefined,
    devIndicators: false,
    serverExternalPackages: ['playwright-core'],
    outputFileTracingExcludes: { '*': ['./.local-backups/**/*', './artifacts/**/*', './.rea/**/*', './prisma/*.db*'] },
    async headers() {
        return [{ source: '/:path*', headers: [
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
        ] }];
    },
    env: {
        NEXT_PUBLIC_APP_VERSION: pkg.version,
        NEXT_PUBLIC_IS_ELECTRON: process.env.GEORANKER_IS_ELECTRON || '',
    },
};

export default nextConfig;
