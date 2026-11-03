const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'routeService.ts'), 'utf8');
const javascript = ts.transpile(source, {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
});
const loadedModule = { exports: {} };
vm.runInNewContext(javascript, {
  module: loadedModule,
  exports: loadedModule.exports,
  require: specifier => {
    if (specifier === 'expo-constants') return { default: { expoConfig: null } };
    if (specifier === 'expo-crypto') return { randomUUID: () => 'route-id' };
    if (specifier === './diagnostics') return { recordDiagnostic: async () => {} };
    return require(specifier);
  },
});
const { assertCoordinate } = loadedModule.exports;

test('rejects invalid latitude', () => {
  assert.throws(
    () => assertCoordinate({ latitude: 91, longitude: 37.6173 }),
    /Проверьте координаты/
  );
});

test('rejects invalid longitude', () => {
  assert.throws(
    () => assertCoordinate({ latitude: 55.7558, longitude: 181 }),
    /Проверьте координаты/
  );
});

test('rejects NaN coordinates', () => {
  assert.throws(
    () => assertCoordinate({ latitude: NaN, longitude: 0 }),
    /Проверьте координаты/
  );
});

test('accepts inclusive geographic boundaries', () => {
  assert.doesNotThrow(() => assertCoordinate({ latitude: -90, longitude: -180 }));
  assert.doesNotThrow(() => assertCoordinate({ latitude: 90, longitude: 180 }));
});

test('getRouteRecommendations remains available', () => {
  assert.equal(typeof loadedModule.exports.getRouteRecommendations, 'function');
});
