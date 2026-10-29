const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'dayTimeline.ts'), 'utf8');
const javascript = ts.transpile(source, {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
});
const loadedModule = { exports: {} };
vm.runInNewContext(javascript, {
  module: loadedModule,
  exports: loadedModule.exports,
});
const { buildDayMetrics, buildDayTimeline, getLocalDateKey } = loadedModule.exports;

function point(id, minute, latitude, longitude, speed) {
  return {
    id,
    timestamp: new Date(`2026-10-29T08:${String(minute).padStart(2, '0')}:00.000Z`),
    latitude,
    longitude,
    altitude: 0,
    accuracy: 10,
    speed,
    heading: 0,
    transportModeOverride: null,
  };
}

test('builds one movement event and calculates distance and time from valid fixes', () => {
  const points = [
    point('a', 0, 50, 19, 1.4),
    point('b', 1, 50.001, 19, 1.4),
    point('c', 2, 50.002, 19, 1.4),
  ];
  const events = buildDayTimeline(points, []);
  const metrics = buildDayMetrics(points);

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'trip');
  assert.equal(events[0].trip.transportMode, 'Пешком');
  assert.ok(metrics.distanceKm > 0.2 && metrics.distanceKm < 0.25);
  assert.equal(metrics.movingSeconds, 120);
});

test('preserves a manual transport correction even for a short segment', () => {
  const first = point('manual-1', 0, 50, 19, 1.4);
  const second = point('manual-2', 1, 50.001, 19, 1.4);
  first.transportModeOverride = 'Автобус/трамвай';
  second.transportModeOverride = 'Автобус/трамвай';

  const events = buildDayTimeline([first, second], []);
  assert.equal(events[0].trip.transportMode, 'Автобус/трамвай');
  assert.equal(events[0].trip.transportConfidence, null);
});

test('splits a long stationary interval into a visit and keeps its manually added name', () => {
  const points = [
    point('move-1', 0, 50, 19, 1.4),
    point('move-2', 1, 50.001, 19, 1.4),
    point('stop-1', 2, 50.002, 19, 0),
    point('stop-2', 10, 50.002, 19, 0),
    point('stop-3', 18, 50.002, 19, 0),
    point('move-3', 19, 50.003, 19, 1.4),
    point('move-4', 20, 50.004, 19, 1.4),
  ];
  const events = buildDayTimeline(points, [{
    id: 'place-1',
    title: 'Кофейня',
    timestamp: points[2].timestamp,
    latitude: 50.002,
    longitude: 19,
  }]);

  assert.equal(events.map(event => event.kind).join(','), 'trip,visit,trip');
  assert.equal(events[1].visit.title, 'Кофейня');
  assert.equal(events[1].visit.manual, true);
});

test('uses local calendar fields for the day key', () => {
  const date = new Date(2026, 9, 29, 23, 45);
  assert.equal(getLocalDateKey(date), '2026-10-29');
});

test('marks a long location gap at the same coordinates as a likely stop', () => {
  const points = [
    point('before-stop', 0, 50, 19, 1.4),
    point('after-stop', 10, 50, 19, 0),
    point('after-moving-1', 11, 50.001, 19, 1.4),
    point('after-moving-2', 12, 50.002, 19, 1.4),
  ];
  const events = buildDayTimeline(points, []);
  assert.equal(events.some(event => event.kind === 'visit'), true);
});

test('does not count long location gaps as traveled distance or moving time', () => {
  const points = [
    point('a', 0, 50, 19, 2),
    point('b', 1, 50.001, 19, 2),
    point('c', 20, 50.01, 19, 2),
  ];
  const metrics = buildDayMetrics(points);
  assert.ok(metrics.distanceKm < 0.2);
  assert.equal(metrics.movingSeconds, 60);
});
