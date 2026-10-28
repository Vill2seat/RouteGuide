const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(
  new URL('./routeRecommendation.ts', `file://${__dirname}/`),
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

test('prefers environmental quality only within five minutes of the fastest route', () => {
  assert.equal(
    recommendRouteIndex([
      { durationMinutes: 20, qualityScore: 60 },
      { durationMinutes: 25, qualityScore: 90 },
      { durationMinutes: 26, qualityScore: 100 },
    ]),
    1
  );
});

test('uses the fastest route when eligible routes have no environmental scores', () => {
  assert.equal(
    recommendRouteIndex([
      { durationMinutes: 18, qualityScore: null },
      { durationMinutes: 20, qualityScore: null },
    ]),
    0
  );
});

test('prefers the quicker route when eligible environmental scores tie', () => {
  assert.equal(
    recommendRouteIndex([
      { durationMinutes: 20, qualityScore: 80 },
      { durationMinutes: 23, qualityScore: 80 },
    ]),
    0
  );
});

test('returns no index when there are no routes', () => {
  assert.equal(recommendRouteIndex([]), -1);
});
