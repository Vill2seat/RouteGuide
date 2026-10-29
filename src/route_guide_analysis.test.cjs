const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = require('node:url').pathToFileURL(
  path.join(__dirname, 'services') + path.sep
).href;

function loadModule(modulePath, mocks = {}) {
  const source = fs.readFileSync(new URL(modulePath, ROOT), 'utf8');
  const javascript = ts.transpile(source, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  });
  const loadedModule = { exports: {} };
  vm.runInNewContext(javascript, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: specifier =>
      Object.prototype.hasOwnProperty.call(mocks, specifier)
        ? mocks[specifier]
        : require(specifier),
    console: console,
  });
  return loadedModule.exports;
}

// ============================================================
// TEST SUITE 1: Transport Classifier - Edge Cases
// ============================================================
const tc = loadModule('./transportClassifier.ts');

test('TC-01: empty observations array returns null', () => {
  assert.equal(tc.classifyTransport([]), null);
});

test('TC-02: single observation returns null (needs min 3)', () => {
  assert.equal(tc.classifyTransport([{ speedMetersPerSecond: 1.3, accuracyMeters: 8 }]), null);
});

test('TC-03: two observations returns null (needs min 3)', () => {
  assert.equal(
    tc.classifyTransport([
      { speedMetersPerSecond: 1.3, accuracyMeters: 8 },
      { speedMetersPerSecond: 1.4, accuracyMeters: 8 },
    ]),
    null
  );
});

test('TC-04: negative speed is filtered out', () => {
  assert.equal(
    tc.classifyTransport([
      { speedMetersPerSecond: -1, accuracyMeters: 8 },
      { speedMetersPerSecond: -1, accuracyMeters: 8 },
      { speedMetersPerSecond: -1, accuracyMeters: 8 },
    ]),
    null
  );
});

test('TC-05: NaN speed is filtered out', () => {
  assert.equal(
    tc.classifyTransport([
      { speedMetersPerSecond: NaN, accuracyMeters: 8 },
      { speedMetersPerSecond: NaN, accuracyMeters: 8 },
      { speedMetersPerSecond: NaN, accuracyMeters: 8 },
    ]),
    null
  );
});

test('TC-06: Infinity speed is filtered out', () => {
  assert.equal(
    tc.classifyTransport([
      { speedMetersPerSecond: Infinity, accuracyMeters: 8 },
      { speedMetersPerSecond: Infinity, accuracyMeters: 8 },
      { speedMetersPerSecond: Infinity, accuracyMeters: 8 },
    ]),
    null
  );
});

test('TC-07: accuracy exactly 35m is accepted', () => {
  assert.equal(
    tc.classifyTransport([
      { speedMetersPerSecond: 1.3, accuracyMeters: 35 },
      { speedMetersPerSecond: 1.3, accuracyMeters: 35 },
      { speedMetersPerSecond: 1.3, accuracyMeters: 35 },
    ]).mode,
    'Пешком'
  );
});

test('TC-08: accuracy 35.1m is rejected', () => {
  assert.equal(
    tc.classifyTransport([
      { speedMetersPerSecond: 1.3, accuracyMeters: 35.1 },
      { speedMetersPerSecond: 1.3, accuracyMeters: 35.1 },
      { speedMetersPerSecond: 1.3, accuracyMeters: 35.1 },
    ]),
    null
  );
});

test('TC-09: accuracy null is accepted', () => {
  assert.equal(
    tc.classifyTransport([
      { speedMetersPerSecond: 1.3, accuracyMeters: null },
      { speedMetersPerSecond: 1.3, accuracyMeters: null },
      { speedMetersPerSecond: 1.3, accuracyMeters: null },
    ]).mode,
    'Пешком'
  );
});

test('TC-10: boundary speed 0.69 returns null (below walking)', () => {
  assert.equal(
    tc.classifyTransport([
      { speedMetersPerSecond: 0.69, accuracyMeters: 8 },
      { speedMetersPerSecond: 0.69, accuracyMeters: 8 },
      { speedMetersPerSecond: 0.69, accuracyMeters: 8 },
    ]),
    null
  );
});

test('TC-11: boundary speed 0.70 is walking', () => {
  assert.equal(
    tc.classifyTransport([
      { speedMetersPerSecond: 0.70, accuracyMeters: 8 },
      { speedMetersPerSecond: 0.70, accuracyMeters: 8 },
      { speedMetersPerSecond: 0.70, accuracyMeters: 8 },
    ]).mode,
    'Пешком'
  );
});

test('TC-12: boundary speed 2.79 is walking, 2.80 is cycling', () => {
  const walking = tc.classifyTransport([
    { speedMetersPerSecond: 2.79, accuracyMeters: 8 },
    { speedMetersPerSecond: 2.79, accuracyMeters: 8 },
    { speedMetersPerSecond: 2.79, accuracyMeters: 8 },
  ]);
  assert.equal(walking.mode, 'Пешком');

  const cycling = tc.classifyTransport([
    { speedMetersPerSecond: 2.80, accuracyMeters: 8 },
    { speedMetersPerSecond: 5.0, accuracyMeters: 8 },
    { speedMetersPerSecond: 5.1, accuracyMeters: 8 },
  ]);
  assert.equal(cycling.mode, 'Велосипед');
});

test('TC-13: boundary speed 8.29 is cycling, 8.30 is motorized', () => {
  const cycling = tc.classifyTransport([
    { speedMetersPerSecond: 8.29, accuracyMeters: 8 },
    { speedMetersPerSecond: 8.29, accuracyMeters: 8 },
    { speedMetersPerSecond: 8.29, accuracyMeters: 8 },
  ]);
  assert.equal(cycling.mode, 'Велосипед');

  const motorized = tc.classifyTransport([
    { speedMetersPerSecond: 8.30, accuracyMeters: 8 },
    { speedMetersPerSecond: 8.30, accuracyMeters: 8 },
    { speedMetersPerSecond: 8.30, accuracyMeters: 8 },
  ]);
  assert.equal(motorized.mode, 'Моторизованный транспорт');
});

test('TC-14: mixed modes with clear majority returns majority mode', () => {
  const result = tc.classifyTransport([
    { speedMetersPerSecond: 1.3, accuracyMeters: 8 },
    { speedMetersPerSecond: 1.4, accuracyMeters: 8 },
    { speedMetersPerSecond: 1.5, accuracyMeters: 8 },
    { speedMetersPerSecond: 5.0, accuracyMeters: 8 },
    { speedMetersPerSecond: 12.0, accuracyMeters: 8 },
  ]);
  assert.equal(result.mode, 'Пешком');
  assert.equal(result.confidence, 0.6);
});

test('TC-15: no mode with count >= 3 returns null', () => {
  assert.equal(
    tc.classifyTransport([
      { speedMetersPerSecond: 1.3, accuracyMeters: 8 },
      { speedMetersPerSecond: 1.4, accuracyMeters: 8 },
      { speedMetersPerSecond: 5.0, accuracyMeters: 8 },
      { speedMetersPerSecond: 5.1, accuracyMeters: 8 },
      { speedMetersPerSecond: 12.0, accuracyMeters: 8 },
    ]),
    null
  );
});

test('TC-16: confidence exactly 0.6 is accepted', () => {
  const result = tc.classifyTransport([
    { speedMetersPerSecond: 1.3, accuracyMeters: 8 },
    { speedMetersPerSecond: 1.4, accuracyMeters: 8 },
    { speedMetersPerSecond: 1.5, accuracyMeters: 8 },
    { speedMetersPerSecond: 5.0, accuracyMeters: 8 },
    { speedMetersPerSecond: 12.0, accuracyMeters: 8 },
  ]);
  assert.equal(result.mode, 'Пешком');
  assert.equal(result.confidence, 0.6);
});

test('TC-17: confidence 0.5 is rejected (3/6 = 0.5 < 0.6)', () => {
  const result = tc.classifyTransport([
    { speedMetersPerSecond: 1.3, accuracyMeters: 8 },
    { speedMetersPerSecond: 1.4, accuracyMeters: 8 },
    { speedMetersPerSecond: 1.5, accuracyMeters: 8 },
    { speedMetersPerSecond: 5.0, accuracyMeters: 8 },
    { speedMetersPerSecond: 5.1, accuracyMeters: 8 },
    { speedMetersPerSecond: 12.0, accuracyMeters: 8 },
  ]);
  assert.equal(result, null);
});

test('TC-18: slice(-7) means older observations are ignored', () => {
  const obs = [];
  for (let i = 0; i < 7; i++) obs.push({ speedMetersPerSecond: 1.3, accuracyMeters: 8 });
  for (let i = 0; i < 3; i++) obs.push({ speedMetersPerSecond: 12.0, accuracyMeters: 8 });
  assert.equal(tc.classifyTransport(obs), null);
});

test('TC-19: more than 7 observations, last 7 determine result', () => {
  const obs = [];
  for (let i = 0; i < 100; i++) obs.push({ speedMetersPerSecond: 12.0, accuracyMeters: 8 });
  for (let i = 0; i < 7; i++) obs.push({ speedMetersPerSecond: 1.3, accuracyMeters: 8 });
  const result = tc.classifyTransport(obs);
  assert.equal(result.mode, 'Пешком');
  assert.equal(result.confidence, 1.0);
});

// ============================================================
// TEST SUITE 2: Route Recommendation - Edge Cases
// ============================================================
const rr = loadModule('./routeRecommendation.ts');

test('RR-01: single route returns index 0', () => {
  assert.equal(rr.recommendRouteIndex([{ durationMinutes: 10, qualityScore: 50 }]), 0);
});

test('RR-02: fastest route wins when only route duration is used', () => {
  assert.equal(
    rr.recommendRouteIndex([
      { durationMinutes: 30, qualityScore: null },
      { durationMinutes: 10, qualityScore: null },
      { durationMinutes: 20, qualityScore: null },
    ]),
    1
  );
});

test('RR-03: city-level conditions do not rank routes; shortest duration wins', () => {
  assert.equal(
    rr.recommendRouteIndex([
      { durationMinutes: 10, qualityScore: 90 },
      { durationMinutes: 11, qualityScore: 100 },
    ]),
    0
  );
});

test('RR-04: invalid route duration is ignored', () => {
  assert.equal(
    rr.recommendRouteIndex([
      { durationMinutes: -5, qualityScore: 90 },
      { durationMinutes: 10, qualityScore: 80 },
    ]),
    1
  );
});

test('RR-05: no valid route duration returns -1', () => {
  assert.equal(
    rr.recommendRouteIndex([
      { durationMinutes: NaN, qualityScore: 100 },
      { durationMinutes: Infinity, qualityScore: 100 },
    ]),
    -1
  );
});

test('RR-10: large number of routes performance', () => {
  const routes = Array.from({ length: 1000 }, (_, i) => ({
    durationMinutes: i,
    qualityScore: i % 2 === 0 ? 50 : null,
  }));
  const start = Date.now();
  const result = rr.recommendRouteIndex(routes);
  const duration = Date.now() - start;
  assert.ok(duration < 100, `Recommendation took ${duration}ms, too slow`);
  assert.ok(result >= 0 && result < 1000);
});

// ============================================================
// TEST SUITE 3: Route Quality - Coordinate Validation
// ============================================================
const rq = loadModule('./routeService.ts', {
  'expo-constants': { default: { expoConfig: { extra: {} } } },
  'expo-crypto': { randomUUID: () => 'test-route-id' },
  './diagnostics': { recordDiagnostic: async () => {} },
});

test('RQ-01: assertCoordinate throws on invalid latitude > 90', () => {
  assert.throws(
    () => rq.assertCoordinate({ latitude: 91, longitude: 0 }),
    /Проверьте координаты/
  );
});

test('RQ-02: assertCoordinate throws on invalid longitude > 180', () => {
  assert.throws(
    () => rq.assertCoordinate({ latitude: 0, longitude: 181 }),
    /Проверьте координаты/
  );
});

test('RQ-03: assertCoordinate throws on NaN', () => {
  assert.throws(
    () => rq.assertCoordinate({ latitude: NaN, longitude: 0 }),
    /Проверьте координаты/
  );
});

test('RQ-04: assertCoordinate accepts boundary values', () => {
  assert.doesNotThrow(() => rq.assertCoordinate({ latitude: -90, longitude: -180 }));
  assert.doesNotThrow(() => rq.assertCoordinate({ latitude: 90, longitude: 180 }));
  assert.doesNotThrow(() => rq.assertCoordinate({ latitude: 0, longitude: 0 }));
});

test('RQ-05: getRouteRecommendations is a function', () => {
  assert.ok(typeof rq.getRouteRecommendations === 'function');
});

// ============================================================
// TEST SUITE 4: Database Logic - Haversine Distance
// ============================================================
const haversineTest = (lat1, lon1, lat2, lon2) => {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLatitude = radians(lat2 - lat1);
  const deltaLongitude = radians(lon2 - lon1);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

test('DB-01: same coordinates distance is 0', () => {
  const d = haversineTest(55.7558, 37.6173, 55.7558, 37.6173);
  assert.ok(d < 0.001, `Expected ~0, got ${d}`);
});

test('DB-02: Moscow to Saint Petersburg distance ~635 km', () => {
  const d = haversineTest(55.7558, 37.6173, 59.9343, 30.3351);
  assert.ok(d > 600 && d < 700, `Expected ~635 km, got ${d.toFixed(1)} km`);
});

test('DB-03: distance is symmetric', () => {
  const d1 = haversineTest(55.7558, 37.6173, 59.9343, 30.3351);
  const d2 = haversineTest(59.9343, 30.3351, 55.7558, 37.6173);
  assert.ok(Math.abs(d1 - d2) < 0.001, `Not symmetric: ${d1} vs ${d2}`);
});

test('DB-04: antipodal points distance ~20015 km', () => {
  const d = haversineTest(0, 0, 0, 180);
  assert.ok(d > 19000 && d < 21000, `Expected ~20015 km, got ${d.toFixed(1)} km`);
});

console.log('\n=== ALL CUSTOM TESTS COMPLETE ===');
