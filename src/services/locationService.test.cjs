const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const serviceSource = fs.readFileSync(
  path.join(__dirname, 'locationService.ts'),
  'utf8'
);
const javascript = ts.transpile(serviceSource, {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
});

const appendedLocations = [];
let foregroundPermission = { status: 'granted' };
let backgroundPermission = { status: 'denied' };
let locationCallback;
let watcherStarted = 0;
let watcherRemoved = 0;
let backgroundTaskStarted = false;
let backgroundStartCount = 0;
let backgroundStopCount = 0;
let backgroundLocationOptions = null;
let backgroundStartError = null;
let backgroundStopError = null;
let routeId = null;
let createdRoutes = 0;
let automaticRecordingEnabled = true;
let finishedRoutes = 0;

const locationMock = {
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: async () => foregroundPermission,
  requestForegroundPermissionsAsync: async () => foregroundPermission,
  getBackgroundPermissionsAsync: async () => backgroundPermission,
  watchPositionAsync: async (_options, callback) => {
    watcherStarted += 1;
    locationCallback = callback;
    return { remove: () => { watcherRemoved += 1; } };
  },
  hasStartedLocationUpdatesAsync: async () => backgroundTaskStarted,
  startLocationUpdatesAsync: async (_taskName, options) => {
    if (backgroundStartError) throw backgroundStartError;
    backgroundTaskStarted = true;
    backgroundStartCount += 1;
    backgroundLocationOptions = options;
  },
  stopLocationUpdatesAsync: async () => {
    if (backgroundStopError) throw backgroundStopError;
    backgroundTaskStarted = false;
    backgroundStopCount += 1;
  },
};
const taskManagerMock = {
  isTaskDefined: () => true,
  defineTask: () => {},
};
const databaseMock = {
  appendLocations: async locations => appendedLocations.push(...locations),
  isAutomaticRecordingEnabled: async () => automaticRecordingEnabled,
  setAutomaticRecordingEnabled: async enabled => {
    automaticRecordingEnabled = enabled;
  },
  getActiveRouteId: async () => routeId,
  startRoute: async () => {
    createdRoutes += 1;
    routeId = 'route_auto';
    return routeId;
  },
  finishRoute: async () => {
    finishedRoutes += 1;
    routeId = null;
  },
};

const loadedModule = { exports: {} };
vm.runInNewContext(javascript, {
  module: loadedModule,
  exports: loadedModule.exports,
  require: specifier => {
    if (specifier === 'expo-location') return locationMock;
    if (specifier === 'expo-task-manager') return taskManagerMock;
    if (specifier === './database') return { SQLiteDB: databaseMock };
    if (specifier === './diagnostics') {
      return { recordDiagnostic: async () => {} };
    }
    return require(specifier);
  },
  console,
});

const service = loadedModule.exports;

test('foreground-only permission starts a watcher and saves location updates', async () => {
  await service.startLocationTask();
  await service.startLocationTask();

  assert.equal(watcherStarted, 1);
  assert.equal(typeof locationCallback, 'function');

  const location = {
    timestamp: Date.now(),
    coords: {
      latitude: 55.7558,
      longitude: 37.6173,
      altitude: null,
      accuracy: 10,
      speed: 0,
      heading: null,
    },
  };
  locationCallback(location);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(appendedLocations[0], location);
  await service.stopLocationTask();
  assert.equal(watcherRemoved, 1);
});

test('automatic recording creates a route before location updates start', async () => {
  routeId = null;
  foregroundPermission = { status: 'granted' };
  backgroundPermission = { status: 'denied' };

  const started = await service.ensureAutomaticRecording();

  assert.equal(started, true);
  assert.equal(createdRoutes, 1);
  assert.equal(routeId, 'route_auto');
  assert.equal(watcherStarted, 2);
});

test('foreground permission denial blocks location access explicitly', async () => {
  foregroundPermission = { status: 'denied' };

  await assert.rejects(
    service.startLocationTask(),
    /разрешение на геолокацию/
  );
  assert.equal(watcherStarted, 2);
});

test('background permission starts and stops the native location task', async () => {
  foregroundPermission = { status: 'granted' };
  backgroundPermission = { status: 'granted' };

  await service.startLocationTask();
  assert.equal(backgroundTaskStarted, true);
  assert.equal(backgroundStartCount, 1);
  assert.equal(watcherStarted, 2);
  assert.equal(backgroundLocationOptions.distanceInterval, 50);
  assert.equal(backgroundLocationOptions.timeInterval, 60_000);
  assert.equal(backgroundLocationOptions.pausesUpdatesAutomatically, true);
  assert.equal(backgroundLocationOptions.deferredUpdatesInterval, 120_000);

  await service.stopLocationTask();
  assert.equal(backgroundTaskStarted, false);
  assert.equal(backgroundStopCount, 1);
});

test('falls back to foreground updates if Android rejects the background service start', async () => {
  foregroundPermission = { status: 'granted' };
  backgroundPermission = { status: 'granted' };
  backgroundStartError = new Error('Foreground service unavailable');

  await service.startLocationTask();

  assert.equal(watcherStarted, 3);
  assert.equal(await service.getLocationRecordingMode(), 'foreground');

  backgroundStartError = null;
  await service.stopLocationTask();
  assert.equal(watcherRemoved, 3);
});

test('does not report recording stopped when the native service cannot stop', async () => {
  foregroundPermission = { status: 'granted' };
  backgroundPermission = { status: 'granted' };
  await service.startLocationTask();

  automaticRecordingEnabled = true;
  const finishedBefore = finishedRoutes;
  backgroundStopError = new Error('Native stop failed');

  await assert.rejects(service.disableAutomaticRecording(), /Native stop failed/);
  assert.equal(automaticRecordingEnabled, true);
  assert.equal(finishedRoutes, finishedBefore);
  assert.equal(backgroundTaskStarted, true);

  backgroundStopError = null;
  await service.disableAutomaticRecording();
  assert.equal(automaticRecordingEnabled, false);
  assert.equal(finishedRoutes, finishedBefore + 1);
  assert.equal(backgroundTaskStarted, false);
});
