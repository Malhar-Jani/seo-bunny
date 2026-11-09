import { NextResponse } from 'next/server';


import path from 'path';
import fs from 'fs';




// Root directory of the project
const PROJECT_ROOT = process.cwd();

export async function GET() {
    // Return the current local version
    try {
        const pkgPath = path.join(PROJECT_ROOT, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return NextResponse.json({ version: pkg.version });
    } catch {
        return NextResponse.json({ version: 'unknown' });
    }
}

export async function POST() {
    return NextResponse.json({ error: process.env.GEORANKER_IS_ELECTRON === '1'
        ? 'Use the desktop app updater instead.'
        : 'Back up your workspace, stop the app, and update the source manually. Automatic database replacement is disabled.' }, { status: 409 });
}
