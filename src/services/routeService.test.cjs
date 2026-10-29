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
const { parseRouteCandidate } = loadedModule.exports;

test('parses a saved route when its identity and geometry are valid', () => {
  const route = {
    id: 'route-id',
    coordinates: [
      { latitude: 50.06, longitude: 19.94 },
      { latitude: 50.07, longitude: 19.95 },
    ],
    distanceKm: 1.4,
    durationMinutes: 21,
  };

  assert.deepEqual(
    JSON.parse(JSON.stringify(parseRouteCandidate(JSON.stringify(route), 'route-id'))),
    route
  );
});

test('rejects saved routes with mismatched ids or invalid coordinates', () => {
  const route = {
    id: 'route-id',
    coordinates: [
      { latitude: 95, longitude: 19.94 },
      { latitude: 50.07, longitude: 19.95 },
    ],
    distanceKm: 1.4,
    durationMinutes: 21,
  };

  assert.throws(() => parseRouteCandidate(JSON.stringify(route), 'other-id'));
  assert.throws(() => parseRouteCandidate(JSON.stringify(route), 'route-id'));
  assert.throws(() => parseRouteCandidate('{'));
});
