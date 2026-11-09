const { spawnSync } = require('child_process');
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
    stdio: 'inherit', env: { ...process.env, GEORANKER_IS_ELECTRON: '1' },
});
if (result.error) throw result.error;
process.exit(result.status || 0);
