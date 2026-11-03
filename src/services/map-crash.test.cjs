const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

function loadAssertCoordinate() {
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
  return loadedModule.exports.assertCoordinate;
}

const assertCoordinate = loadAssertCoordinate();

test('rejects NaN latitude before route geometry reaches the map', () => {
  assert.throws(() => assertCoordinate({ latitude: NaN, longitude: 0 }), /Проверьте координаты/);
});

test('rejects infinite longitude before route geometry reaches the map', () => {
  assert.throws(() => assertCoordinate({ latitude: 0, longitude: Infinity }), /Проверьте координаты/);
});

test('rejects latitude outside the geographic range', () => {
  assert.throws(() => assertCoordinate({ latitude: 91, longitude: 0 }), /Проверьте координаты/);
});

test('rejects longitude outside the geographic range', () => {
  assert.throws(() => assertCoordinate({ latitude: 0, longitude: -181 }), /Проверьте координаты/);
});

test('accepts valid coordinates and geographic boundary values', () => {
  assert.doesNotThrow(() => assertCoordinate({ latitude: 55.7558, longitude: 37.6173 }));
  assert.doesNotThrow(() => assertCoordinate({ latitude: -90, longitude: -180 }));
  assert.doesNotThrow(() => assertCoordinate({ latitude: 90, longitude: 180 }));
});

test('rejects null and undefined coordinate values', () => {
  assert.throws(() => assertCoordinate({ latitude: null, longitude: 0 }), /Проверьте координаты/);
  assert.throws(() => assertCoordinate({ latitude: undefined, longitude: 0 }), /Проверьте координаты/);
});
