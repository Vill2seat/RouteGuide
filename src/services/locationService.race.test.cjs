const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function loadService({ backgroundPermission = 'denied', foregroundPermission = 'granted' } = {}) {
  let watcherStarted = 0;
  let watcherRemoved = 0;
  let backgroundTaskStarted = false;
  let backgroundStartCount = 0;
  let backgroundStopCount = 0;
  const backgroundStartEntered = deferred();
  const backgroundStartGate = deferred();

  const locationMock = {
    Accuracy: { Balanced: 3, High: 4 },
    ActivityType: { Fitness: 3 },
    getForegroundPermissionsAsync: async () => ({ status: foregroundPermission }),
    requestForegroundPermissionsAsync: async () => ({ status: foregroundPermission }),
    getBackgroundPermissionsAsync: async () => ({ status: backgroundPermission }),
    watchPositionAsync: async () => {
      watcherStarted += 1;
      return { remove: () => { watcherRemoved += 1; } };
    },
    hasStartedLocationUpdatesAsync: async () => backgroundTaskStarted,
    startLocationUpdatesAsync: async () => {
      backgroundStartCount += 1;
      backgroundStartEntered.resolve();
      await backgroundStartGate.promise;
      backgroundTaskStarted = true;
    },
    stopLocationUpdatesAsync: async () => {
      backgroundStopCount += 1;
      backgroundTaskStarted = false;
    },
  };
  const taskManagerMock = {
    isTaskDefined: () => true,
    defineTask: () => {},
  };
  const databaseMock = {
    appendLocations: async () => {},
    isAutomaticRecordingEnabled: async () => true,
    getActiveRouteId: async () => null,
    startRoute: async () => 'route_auto',
    finishRoute: async () => {},
  };
  const diagnosticsMock = { recordDiagnostic: async () => {} };
  const source = fs.readFileSync(path.join(__dirname, 'locationService.ts'), 'utf8');
  const javascript = ts.transpile(source, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  });
  const loadedModule = { exports: {} };
  vm.runInNewContext(javascript, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: specifier => {
      if (specifier === 'expo-location') return locationMock;
      if (specifier === 'expo-task-manager') return taskManagerMock;
      if (specifier === './database') return { SQLiteDB: databaseMock };
      if (specifier === './diagnostics') return diagnosticsMock;
      return require(specifier);
    },
    console,
  });

  return {
    service: loadedModule.exports,
    backgroundStartEntered: backgroundStartEntered.promise,
    releaseBackgroundStart: backgroundStartGate.resolve,
    get watcherStarted() { return watcherStarted; },
    get watcherRemoved() { return watcherRemoved; },
    get backgroundTaskStarted() { return backgroundTaskStarted; },
    get backgroundStartCount() { return backgroundStartCount; },
    get backgroundStopCount() { return backgroundStopCount; },
  };
}

test('LS-RACE-01: parallel foreground starts create one watcher', async () => {
  const harness = loadService();

  await Promise.all([
    harness.service.startLocationTask(),
    harness.service.startLocationTask(),
  ]);

  assert.equal(harness.watcherStarted, 1);
});

test('LS-RACE-02: a repeated start reuses the existing watcher', async () => {
  const harness = loadService();

  await harness.service.startLocationTask();
  await harness.service.startLocationTask();

  assert.equal(harness.watcherStarted, 1);
});

test('LS-RACE-03: parallel background starts share one native start', async () => {
  const harness = loadService({ backgroundPermission: 'granted' });
  const first = harness.service.startLocationTask();
  const second = harness.service.startLocationTask();

  await harness.backgroundStartEntered;
  assert.equal(harness.backgroundStartCount, 1);
  harness.releaseBackgroundStart();
  await Promise.all([first, second]);

  assert.equal(harness.backgroundStartCount, 1);
  assert.equal(harness.backgroundTaskStarted, true);
});

test('LS-RACE-04: denied foreground permission rejects each start without hanging', async () => {
  const harness = loadService({ foregroundPermission: 'denied' });

  await assert.rejects(
    harness.service.startLocationTask(),
    /разрешение на геолокацию/
  );
  await assert.rejects(
    harness.service.startLocationTask(),
    /разрешение на геолокацию/
  );
});

test('LS-RACE-05: stopping before start is idempotent', async () => {
  const harness = loadService();

  await harness.service.stopLocationTask();

  assert.equal(harness.watcherRemoved, 0);
  assert.equal(harness.backgroundStopCount, 0);
});

test('LS-RACE-06: stop requested during native start runs after start completes', async () => {
  const harness = loadService({ backgroundPermission: 'granted' });
  const start = harness.service.startLocationTask();

  await harness.backgroundStartEntered;
  const stop = harness.service.stopLocationTask();
  harness.releaseBackgroundStart();
  await Promise.all([start, stop]);

  assert.equal(harness.backgroundStartCount, 1);
  assert.equal(harness.backgroundStopCount, 1);
  assert.equal(harness.backgroundTaskStarted, false);
});
