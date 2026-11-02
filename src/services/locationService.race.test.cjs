const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

// === Моки ===

let locationCallback;
let watcherStarted = 0;
let watcherRemoved = 0;
let backgroundTaskStarted = false;
let backgroundStartCount = 0;
let backgroundStopCount = 0;
let foregroundPermission = { status: 'granted' };
let backgroundPermission = { status: 'denied' };
let routeId = null;
let createdRoutes = 0;
let startLocationCallCount = 0;
let startLocationResolve;

// Задержка для имитации асинхронности нативного модуля ( гонка )
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const locationMock = {
  Accuracy: { Balanced: 3, High: 4 },
  ActivityType: { Fitness: 3 },
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
    startLocationCallCount += 1;
    backgroundTaskStarted = true;
    backgroundStartCount += 1;
    // Имитируем задержку нативного вызова, чтобы гонка проявилась
    await new Promise(resolve => { startLocationResolve = resolve; });
  },
  stopLocationUpdatesAsync: async () => {
    backgroundTaskStarted = false;
    backgroundStopCount += 1;
  },
};
const taskManagerMock = {
  isTaskDefined: () => true,
  defineTask: () => {},
};
const databaseMock = {
  appendLocations: async locations => {},
  isAutomaticRecordingEnabled: async () => true,
  getActiveRouteId: async () => routeId,
  startRoute: async () => {
    createdRoutes += 1;
    routeId = 'route_auto';
    return routeId;
  },
  finishRoute: async () => {},
};
const diagnosticsMock = { recordDiagnostic: async () => {} };

// === Загрузка модуля ===

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

// Сбрасываем состояние между тестами
function resetState() {
  locationCallback = undefined;
  watcherStarted = 0;
  watcherRemoved = 0;
  backgroundTaskStarted = false;
  backgroundStartCount = 0;
  backgroundStopCount = 0;
  foregroundPermission = { status: 'granted' };
  backgroundPermission = { status: 'denied' };
  routeId = null;
  createdRoutes = 0;
  startLocationCallCount = 0;
  startLocationResolve = null;
}

test('LS-RACE-01: два параллельных вызова startLocationTask не создают два watcher-а', async () => {
  resetState();
  const service = loadService();

  // Оба вызова стартуют одновременно
  const p1 = service.startLocationTask();
  const p2 = service.startLocationTask();

  // Разрешаем нативный вызов
  if (startLocationResolve) startLocationResolve();
  await p1;
  await p2;

  // Ожидаем, что watcherStarted === 1 (идемпотентность), а не 2
  assert.equal(watcherStarted, 1, `Ожидался 1 watcher, получен ${watcherStarted} (гонка)`);
});

test('LS-RACE-02: повторный startLocationTask после завершения первого не сбрасывает состояние', async () => {
  resetState();
  const service = loadService();

  await service.startLocationTask();
  if (startLocationResolve) startLocationResolve();
  await delay(10);

  assert.equal(watcherStarted, 1);

  // Второй вызов после завершения первого
  await service.startLocationTask();
  if (startLocationResolve) startLocationResolve();
  await delay(10);

  assert.equal(watcherStarted, 1, `Повторный вызов не должен создавать новый watcher`);
});

test('LS-RACE-03: startLocationTask при уже запущенном фоновом таске не удваивает startLocationUpdatesAsync', async () => {
  resetState();
  foregroundPermission = { status: 'granted' };
  backgroundPermission = { status: 'granted' };
  const service = loadService();

  const p1 = service.startLocationTask();
  const p2 = service.startLocationTask();

  if (startLocationResolve) startLocationResolve();
  await p1;
  await p2;

  // backgroundStartCount должен быть 1, а не 2
  assert.equal(backgroundStartCount, 1, `Ожидался 1 старт фонового таска, получен ${backgroundStartCount}`);
});

test('LS-RACE-04: отказ foreground-разрешения не оставляет висящий promise', async () => {
  resetState();
  foregroundPermission = { status: 'denied' };
  const service = loadService();

  await assert.rejects(service.startLocationTask(), /разрешение на геолокацию/);

  //После провала startingLocationUpdates должен быть null, чтобы следующий вызов работал
  await service.startLocationTask(); // должен снова упасть с той же ошибкой
  await assert.rejects(service.startLocationTask(), /разрешение на геолокацию/);
});

test('LS-RACE-05: stopLocationTask не падает, если startLocationTask не вызывался', async () => {
  resetState();
  const service = loadService();

  // Не должно бросать исключение
  await service.stopLocationTask();
  assert.equal(watcherRemoved, 0);
});
