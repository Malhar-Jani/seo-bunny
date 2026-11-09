// Capture only public, same-origin assets for a reproducible REA inspection.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const origin = 'https://apnadhandha.retner.ai';
const directory = '.rea/apnadhandha';
await mkdir(`${directory}/bundle`, { recursive: true });
const records = [];
const scripts = new Set();
for (const route of ['/', '/features/ai-review-agent', '/features/ai-post-generator', '/features/qr-code-studio', '/features/ai-smart-audit']) {
    const response = await fetch(origin + route, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Public page returned ${response.status}`);
    const html = await response.text();
    const file = (route === '/' ? 'home' : route.split('/').at(-1)) + '.html';
    await writeFile(`${directory}/${file}`, html);
    records.push({ url: origin + route, file, sha256: createHash('sha256').update(html).digest('hex') });
    for (const match of html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/g)) {
        const url = new URL(match[1], origin);
        if (url.origin === origin) scripts.add(url.href);
    }
}
for (const url of scripts) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) continue;
    const data = Buffer.from(await response.arrayBuffer());
    const file = new URL(url).pathname.split('/').at(-1);
    await writeFile(`${directory}/bundle/${file}`, data);
    records.push({ url, file: `bundle/${file}`, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
await writeFile(`${directory}/capture.json`, JSON.stringify({ capturedAt: new Date().toISOString(), records }, null, 2));
console.log(JSON.stringify({ pages: 5, scripts: scripts.size, files: records.map(r => ({ file: r.file, bytes: r.bytes })) }));
