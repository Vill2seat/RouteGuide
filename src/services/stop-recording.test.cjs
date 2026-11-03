const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

function loadService() {
  let foregroundSubscriptionRemoveCalled = 0;
  let foregroundSubscriptionRemoveThrows = false;
  let backgroundTaskStarted = false;
  let backgroundStopCount = 0;
  let stopLocationUpdatesThrows = false;
  let finishRouteThrows = false;
  let finishRouteCount = 0;
  let setAutomaticRecordingThrows = false;
  let automaticRecordingEnabled = true;
  let activeRoute = true;

  const locationMock = {
    Accuracy: { Balanced: 3 },
    ActivityType: { Fitness: 3 },
    getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    getBackgroundPermissionsAsync: async () => ({
      status: backgroundTaskStarted ? 'granted' : backgroundPermission,
    }),
    watchPositionAsync: async () => ({
      remove: () => {
        foregroundSubscriptionRemoveCalled += 1;
        if (foregroundSubscriptionRemoveThrows) throw new Error('remove failed');
      },
    }),
    hasStartedLocationUpdatesAsync: async () => backgroundTaskStarted,
    startLocationUpdatesAsync: async () => {
      backgroundTaskStarted = true;
    },
    stopLocationUpdatesAsync: async () => {
      backgroundStopCount += 1;
      if (stopLocationUpdatesThrows) throw new Error('stop failed');
      backgroundTaskStarted = false;
    },
  };
  let backgroundPermission = 'denied';
  const taskManagerMock = {
    isTaskDefined: () => true,
    defineTask: () => {},
  };
  const databaseMock = {
    appendLocations: async () => {},
    finishRoute: async () => {
      finishRouteCount += 1;
      if (finishRouteThrows) throw new Error('finishRoute failed');
      activeRoute = false;
    },
    setAutomaticRecordingEnabled: async enabled => {
      if (setAutomaticRecordingThrows) throw new Error('setAuto failed');
      automaticRecordingEnabled = enabled;
    },
    getActiveRouteId: async () => (activeRoute ? 'route-1' : null),
    startRoute: async () => {
      activeRoute = true;
      return 'route-1';
    },
  };
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
      if (specifier === './diagnostics') {
        return { recordDiagnostic: async () => {} };
      }
      return require(specifier);
    },
    console,
  });

  return {
    service: loadedModule.exports,
    setBackgroundPermission: value => { backgroundPermission = value; },
    setForegroundSubscriptionRemoveThrows: value => { foregroundSubscriptionRemoveThrows = value; },
    setStopLocationUpdatesThrows: value => { stopLocationUpdatesThrows = value; },
    setFinishRouteThrows: value => { finishRouteThrows = value; },
    setAutomaticRecordingThrows: value => { setAutomaticRecordingThrows = value; },
    get foregroundSubscriptionRemoveCalled() { return foregroundSubscriptionRemoveCalled; },
    get backgroundTaskStarted() { return backgroundTaskStarted; },
    get backgroundStopCount() { return backgroundStopCount; },
    get finishRouteCount() { return finishRouteCount; },
    get automaticRecordingEnabled() { return automaticRecordingEnabled; },
    get activeRoute() { return activeRoute; },
  };
}

test('STOP-01: watcher removal failure is rejected and recording remains active', async () => {
  const harness = loadService();
  harness.setForegroundSubscriptionRemoveThrows(true);
  await harness.service.startLocationTask();

  await assert.rejects(harness.service.stopLocationTask(), /remove failed/);

  assert.equal(harness.foregroundSubscriptionRemoveCalled, 1);
  assert.equal(await harness.service.getLocationRecordingMode(), 'foreground');
});

test('STOP-02: finishRoute failure propagates after location updates stop', async () => {
  const harness = loadService();
  await harness.service.startLocationTask();
  harness.setFinishRouteThrows(true);

  await assert.rejects(
    harness.service.disableAutomaticRecording(),
    /finishRoute failed/
  );

  assert.equal(harness.foregroundSubscriptionRemoveCalled, 1);
  assert.equal(harness.finishRouteCount, 1);
  assert.equal(harness.activeRoute, true);
  assert.equal(harness.automaticRecordingEnabled, true);
  assert.equal(await harness.service.getLocationRecordingMode(), null);
});

test('STOP-03: background stop failure is exercised and does not report recording stopped', async () => {
  const harness = loadService();
  harness.setBackgroundPermission('granted');
  await harness.service.startLocationTask();
  harness.setStopLocationUpdatesThrows(true);

  await assert.rejects(
    harness.service.disableAutomaticRecording(),
    /stop failed/
  );
  assert.equal(harness.backgroundStopCount, 1);
  assert.equal(harness.backgroundTaskStarted, true);
  assert.equal(harness.finishRouteCount, 0);
  assert.equal(harness.automaticRecordingEnabled, true);

  harness.setStopLocationUpdatesThrows(false);
  await harness.service.disableAutomaticRecording();
  assert.equal(harness.backgroundStopCount, 2);
  assert.equal(harness.backgroundTaskStarted, false);
  assert.equal(harness.finishRouteCount, 1);
  assert.equal(harness.automaticRecordingEnabled, false);
});

test('STOP-04: preference write failure propagates after route is stopped and finished', async () => {
  const harness = loadService();
  await harness.service.startLocationTask();
  harness.setAutomaticRecordingThrows(true);

  await assert.rejects(
    harness.service.disableAutomaticRecording(),
    /setAuto failed/
  );

  assert.equal(harness.foregroundSubscriptionRemoveCalled, 1);
  assert.equal(harness.finishRouteCount, 1);
  assert.equal(harness.activeRoute, false);
  assert.equal(harness.automaticRecordingEnabled, true);
  assert.equal(await harness.service.getLocationRecordingMode(), null);
});
