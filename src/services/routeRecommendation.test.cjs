const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, 'routeRecommendation.ts'),
  'utf8'
);
const javascript = ts.transpile(source, {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
});
const loadedModule = { exports: {} };
vm.runInNewContext(javascript, {
  module: loadedModule,
  exports: loadedModule.exports,
});
const { recommendRouteIndex } = loadedModule.exports;

test('selects the fastest route using duration only', () => {
  assert.equal(
    recommendRouteIndex([
      { durationMinutes: 20, qualityScore: 100 },
      { durationMinutes: 25, qualityScore: 0 },
      { durationMinutes: 26, qualityScore: 0 },
    ]),
    0
  );
});

test('selects the first route when durations tie', () => {
  assert.equal(
    recommendRouteIndex([
      { durationMinutes: 20 },
      { durationMinutes: 20 },
    ]),
    0
  );
});

test('ignores invalid durations when finding the fastest option', () => {
  assert.equal(
    recommendRouteIndex([
      { durationMinutes: -1 },
      { durationMinutes: Number.NaN },
      { durationMinutes: 18 },
    ]),
    2
  );
});

test('returns no index when there are no routes or no valid durations', () => {
  assert.equal(recommendRouteIndex([]), -1);
  assert.equal(recommendRouteIndex([{ durationMinutes: Number.POSITIVE_INFINITY }]), -1);
});
