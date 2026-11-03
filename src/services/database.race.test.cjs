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

function loadDatabase(options = {}) {
  const openStarted = deferred();
  const openGate = deferred();
  let encryptedOpenCount = 0;
  const fakeDatabase = {
    execAsync: async () => {},
    getFirstAsync: async query => {
      if (query.includes('PRAGMA cipher_version')) {
        return { cipher_version: '4.9.0' };
      }
      return null;
    },
    getAllAsync: async () => [],
    runAsync: async () => ({ changes: 0 }),
    withTransactionAsync: async callback => callback(),
    closeAsync: async () => {},
    databasePath: '/data/user/0/com.routeguide.app/databases/route_guide.db',
  };
  const sqliteMock = {
    openDatabaseAsync: async name => {
      if (name === 'route_guide_encrypted.db') {
        encryptedOpenCount += 1;
        if (encryptedOpenCount === 1) {
          openStarted.resolve();
          await openGate.promise;
        }
      }
      return fakeDatabase;
    },
    backupDatabaseAsync: async () => {},
    deleteDatabaseAsync: async () => {},
  };
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
      if (specifier === 'expo-crypto') {
        return { randomUUID: () => 'fixed-uuid-1234' };
      }
      if (specifier === 'expo-secure-store') {
        return {
          getItemAsync: async () => 'a'.repeat(64),
          setItemAsync: async () => {},
        };
      }
      if (specifier === './transportClassifier') {
        return { classifyTransport: () => null };
      }
      if (specifier === './dayTimeline') {
        return {
          getLocalDateKey: date => date.toISOString().slice(0, 10),
          localDayBounds: date => {
            const start = new Date(date.toISOString().slice(0, 10));
            return { start, end: new Date(start.getTime() + 86_400_000) };
          },
        };
      }
      return require(specifier);
    },
    console,
  });
  return {
    SQLiteDB: loadedModule.exports.SQLiteDB,
    openStarted: openStarted.promise,
    releaseOpen: openGate.resolve,
    get encryptedOpenCount() {
      return encryptedOpenCount;
    },
    ...options,
  };
}

test('DB-RACE-01: parallel init calls share one in-flight database open', async () => {
  const harness = loadDatabase();
  const first = harness.SQLiteDB.init();
  const second = harness.SQLiteDB.init();

  await harness.openStarted;
  assert.equal(harness.encryptedOpenCount, 1);
  harness.releaseOpen();
  await Promise.all([first, second]);
  assert.equal(harness.encryptedOpenCount, 1);
});

test('DB-RACE-02: init after completion reuses the initialized database', async () => {
  const harness = loadDatabase();
  const first = harness.SQLiteDB.init();
  await harness.openStarted;
  harness.releaseOpen();
  await first;

  await harness.SQLiteDB.init();
  assert.equal(harness.encryptedOpenCount, 1);
});

test('DB-RACE-03: parallel init callers can use the initialized database', async () => {
  const harness = loadDatabase();
  const first = harness.SQLiteDB.init();
  const second = harness.SQLiteDB.init();

  await harness.openStarted;
  harness.releaseOpen();
  await Promise.all([first, second]);

  assert.deepEqual(
    JSON.parse(JSON.stringify(await harness.SQLiteDB.getRoutes())),
    []
  );
  assert.equal(harness.encryptedOpenCount, 1);
});
