export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SEO_BUNNY_DISABLE_BACKGROUND !== '1') {
        const { startBackgroundWork } = await import('./lib/background');
        await startBackgroundWork();
    }
}
