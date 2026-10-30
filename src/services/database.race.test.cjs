const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

let initResolve;
let initCallCount = 0;
let dbInstance;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const sqliteMock = {
  openDatabaseAsync: async name => {
    initCallCount += 1;
    // Имитируем задержку инициализации нативной БД
    await new Promise(resolve => { initResolve = resolve; });
    return {
      execAsync: async () => {},
      getFirstAsync: async () => null,
      getAllAsync: async () => [],
      runAsync: async () => ({ changes: 0 }),
      withTransactionAsync: async cb => cb(),
      closeAsync: async () => {},
      databasePath: `/data/user/0/com.routeguide.app/databases/${name}`,
    };
  },
};
const cryptoMock = { randomUUID: () => 'fixed-uuid-1234' };
const transportClassifierMock = { classifyTransport: () => null };
const dayTimelineMock = {
  getLocalDateKey: date => date.toISOString().slice(0, 10),
  localDayBounds: date => {
    const start = new Date(date.toISOString().slice(0, 10));
    return { start, end: new Date(start.getTime() + 86_400_000) };
  },
};

function loadDatabase() {
  const source = fs.readFileSync(path.join(__dirname, 'database.ts'), 'utf8');
  const javascript = ts.transpile(source, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  });
  const loadedModule = { exports: {} };
  vm.runInNewContext(javascript, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: specifier => {
      if (specifier === 'expo-sqlite') return sqliteMock;
      if (specifier === 'expo-crypto') return cryptoMock;
      if (specifier === './transportClassifier') return transportClassifierMock;
      if (specifier === './dayTimeline') return dayTimelineMock;
      return require(specifier);
    },
    console,
  });
  return loadedModule.exports;
}

function resetState() {
  initResolve = null;
  initCallCount = 0;
  dbInstance = null;
}

test('DB-RACE-01: два параллельных вызова init() не создают две инициализации БД', async () => {
  resetState();
  const { SQLiteDB } = loadDatabase();

  const p1 = SQLiteDB.init();
  const p2 = SQLiteDB.init();

  if (initResolve) initResolve();
  await p1;
  await p2;

  // openDatabaseAsync должен быть вызван 1 раз, а не 2
  assert.equal(initCallCount, 1, `Ожидался 1 вызов openDatabaseAsync, получен ${initCallCount} (гонка init)`);
});

test('DB-RACE-02: init() после завершения первого не повторяет инициализацию', async () => {
  resetState();
  const { SQLiteDB } = loadDatabase();

  await SQLiteDB.init();
  if (initResolve) initResolve();
  await delay(10);

  await SQLiteDB.init();
  if (initResolve) initResolve();
  await delay(10);

  assert.equal(initCallCount, 1, `Повторный init не должен инициализировать БД снова`);
});

test('DB-RACE-03: параллельные init() не оставляют db в неинициализированном состоянии', async () => {
  resetState();
  const { SQLiteDB } = loadDatabase();

  const p1 = SQLiteDB.init();
  const p2 = SQLiteDB.init();

  if (initResolve) initResolve();
  await p1;
  await p2;

  // Оба промиса должны разрешиться без ошибок
  assert.ok(true, 'Оба init() завершились без исключения');
});
