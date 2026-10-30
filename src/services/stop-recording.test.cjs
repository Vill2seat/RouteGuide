const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

let foregroundSubscriptionRemoveCalled = 0;
let foregroundSubscriptionRemoveThrows = false;
let backgroundTaskStarted = false;
let backgroundStopCount = 0;
let stopLocationUpdatesThrows = false;
let finishRouteThrows = false;
let setAutomaticRecordingThrows = false;

const locationMock = {
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  getBackgroundPermissionsAsync: async () => ({ status: 'denied' }),
  watchPositionAsync: async (_options, callback) => {
    callback({ timestamp: Date.now(), coords: { latitude: 55.7558, longitude: 37.6173, accuracy: 10 } });
    return { remove: () => { foregroundSubscriptionRemoveCalled += 1; if (foregroundSubscriptionRemoveThrows) throw new Error('remove failed'); } };
  },
  hasStartedLocationUpdatesAsync: async () => backgroundTaskStarted,
  startLocationUpdatesAsync: async () => { backgroundTaskStarted = true; },
  stopLocationUpdatesAsync: async () => {
    backgroundTaskStarted = false;
    backgroundStopCount += 1;
    if (stopLocationUpdatesThrows) throw new Error('stop failed');
  },
};
const taskManagerMock = {
  isTaskDefined: () => true,
  defineTask: () => {},
};
const databaseMock = {
  appendLocations: async locations => {},
  finishRoute: async () => { if (finishRouteThrows) throw new Error('finishRoute failed'); },
  setAutomaticRecordingEnabled: async () => { if (setAutomaticRecordingThrows) throw new Error('setAuto failed'); },
  getActiveRouteId: async () => null,
  startRoute: async () => 'route-1',
};
const diagnosticsMock = { recordDiagnostic: async () => {} };

function loadService() {
  const serviceSource = fs.readFileSync(path.join(__dirname, 'locationService.ts'), 'utf8');
  const javascript = ts.transpile(serviceSource, {
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
  return loadedModule.exports;
}

function reset() {
  foregroundSubscriptionRemoveCalled = 0;
  foregroundSubscriptionRemoveThrows = false;
  backgroundTaskStarted = false;
  backgroundStopCount = 0;
  stopLocationUpdatesThrows = false;
  finishRouteThrows = false;
  setAutomaticRecordingThrows = false;
}

test('STOP-01: stopLocationTask не бросает исключение, если remove() падает', async () => {
  reset();
  foregroundSubscriptionRemoveThrows = true;
  const service = loadService();

  // startLocationTask чтобы создать подписку
  await service.startLocationTask();

  // stopLocationTask должен обработать ошибку remove()
  // Но текущий код не имеет try/catch вокруг remove()
  // Это может привести к вылету
  let threw = false;
  try {
    await service.stopLocationTask();
  } catch (e) {
    threw = true;
  }
  // Если threw === true, это означает что ошибка не обработана и может вызвать вылет приложения
  assert.equal(threw, false, 'stopLocationTask не должен выбрасывать исключение при ошибке remove()');
});

test('STOP-02: disableAutomaticRecording обрабатывает ошибку finishRoute', async () => {
  reset();
  finishRouteThrows = true;
  const service = loadService();

  let threw = false;
  try {
    await service.disableAutomaticRecording();
  } catch (e) {
    threw = true;
  }
  assert.equal(threw, false, 'disableAutomaticRecording не должен выбрасывать исключение при ошибке finishRoute');
});

test('STOP-03: disableAutomaticRecording обрабатывает ошибку stopLocationTask', async () => {
  reset();
  stopLocationUpdatesThrows = true;
  const service = loadService();

  await service.startLocationTask();
  let threw = false;
  try {
    await service.disableAutomaticRecording();
  } catch (e) {
    threw = true;
  }
  assert.equal(threw, false, 'disableAutomaticRecording не должен выбрасывать исключение при ошибке stopLocationTask');
});

test('STOP-04: disableAutomaticRecording обрабатывает ошибку setAutomaticRecordingEnabled', async () => {
  reset();
  setAutomaticRecordingThrows = true;
  const service = loadService();

  let threw = false;
  try {
    await service.disableAutomaticRecording();
  } catch (e) {
    threw = true;
  }
  assert.equal(threw, false, 'disableAutomaticRecording не должен выбрасывать исключение при ошибке setAutomaticRecordingEnabled');
});
