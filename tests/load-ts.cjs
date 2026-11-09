const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
module.exports = function loadTs(filename, overrides = {}, cache = new Map()) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = request => {
        if (Object.hasOwn(overrides, request)) return overrides[request];
        const target = request.startsWith('@/') ? path.resolve('src', request.slice(2)) : path.resolve(path.dirname(filename), request);
        if ((request.startsWith('.') || request.startsWith('@/')) && fs.existsSync(target + '.ts')) return loadTs(target + '.ts', overrides, cache);
        return require(require.resolve(request, { paths: [path.dirname(filename)] }));
    };
    new Function('require', 'module', 'exports', 'setTimeout', code)(localRequire, module, module.exports, overrides.__setTimeout || setTimeout);
    return module.exports;
};
