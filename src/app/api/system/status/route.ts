import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
export async function GET() {
    const ready = existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath());
    return Response.json({ demoOnly: process.env.SEO_BUNNY_DEMO_ONLY === '1', browser: { ready, message: ready ? 'Browser engine ready for rank scans.' : process.env.GEORANKER_IS_ELECTRON === '1' ? 'The desktop app is preparing the browser engine. Download progress appears here while setup runs; restart the app if setup fails.' : 'Browser engine missing. Run npm run setup:local, then refresh. The demo works without it.' }, google: { requiredForScanning: false, requiresApprovalForManagement: true } });
}

