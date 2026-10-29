const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

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
    if (specifier === 'expo-sqlite') return {};
    if (specifier === 'expo-crypto') return {};
    if (specifier === 'expo-secure-store') return {};
    if (specifier === './transportClassifier') {
      return { classifyTransport: () => null };
    }
    if (specifier === './dayTimeline') {
      return {
        getLocalDateKey: date => date.toISOString().slice(0, 10),
        localDayBounds: date => {
          const start = new Date(date.toISOString().slice(0, 10));
          return {
            start,
            end: new Date(start.getTime() + 86_400_000),
          };
        },
      };
    }
    return require(specifier);
  },
});

const { SQLiteDB } = loadedModule.exports;
const routeId = 'route_test';
const startTime = '2026-10-28T12:00:00.000Z';

function installDatabase(fakeDatabase) {
  SQLiteDB.db = fakeDatabase;
}

test('finishRoute persists a session even when no GPS fix arrived', async () => {
  const statements = [];
  installDatabase({
    getFirstAsync: async () => ({ route_id: routeId, start_time: startTime }),
    withTransactionAsync: async callback => callback(),
    runAsync: async sql => statements.push(sql),
  });

  await SQLiteDB.finishRoute();

  assert.ok(statements.some(sql => sql.includes('UPDATE routes')));
  assert.ok(statements.some(sql => sql.includes('DELETE FROM active_tracking')));
  assert.ok(!statements.some(sql => sql.includes('DELETE FROM routes')));
});

test('getRoutes loads route summaries without reading every GPS point', async () => {
  let pointQueryCount = 0;
  installDatabase({
    getAllAsync: async sql => {
      if (sql.includes('route_points')) {
        pointQueryCount += 1;
        return [];
      }
      return [{
        id: routeId,
        start_time: startTime,
        end_time: startTime,
        distance: 0,
        duration: 0,
        transport_mode: 'Определяется',
        transport_confidence: null,
        mode_locked: 0,
      }];
    },
  });

  const routes = await SQLiteDB.getRoutes();

  assert.equal(routes.length, 1);
  assert.equal(routes[0].points.length, 0);
  assert.equal(pointQueryCount, 0);
});

test('appendLocations stores a new point once and ignores duplicate timestamps', async () => {
  const insertedPointStatements = [];
  let previousTimestamp = startTime;
  const fakeDatabase = {
    getFirstAsync: async sql => {
      if (sql.includes('JOIN routes')) {
        return { route_id: routeId, start_time: startTime };
      }
      if (sql.includes('SELECT latitude, longitude, timestamp')) {
        return previousTimestamp === startTime
          ? {
              latitude: 55.7558,
              longitude: 37.6173,
              timestamp: previousTimestamp,
            }
          : {
              latitude: 55.756,
              longitude: 37.618,
              timestamp: previousTimestamp,
            };
      }
      if (sql.includes('mode_locked')) return { mode_locked: 1 };
      return null;
    },
    withTransactionAsync: async callback => callback(),
    runAsync: async (sql, params) => {
      if (sql.includes('INTO route_points')) {
        insertedPointStatements.push(sql);
        previousTimestamp = params[2];
      }
    },
    getAllAsync: async () => [],
  };
  installDatabase(fakeDatabase);

  const timestamp = Date.parse(startTime) + 60_000;
  const location = {
    timestamp,
    coords: {
      latitude: 55.756,
      longitude: 37.618,
      altitude: null,
      accuracy: 10,
      speed: 1.2,
      heading: null,
    },
  };
  await Promise.all([
    SQLiteDB.appendLocations([location]),
    SQLiteDB.appendLocations([location]),
  ]);

  assert.equal(insertedPointStatements.length, 1);
});

test('getLocalDaySnapshot reads only the selected local day and maps places', async () => {
  const calls = [];
  installDatabase({
    getAllAsync: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM route_points')) {
        return [{
          id: 'point_1',
          timestamp: '2026-10-29T08:00:00.000Z',
          latitude: 50,
          longitude: 19,
          altitude: 0,
          accuracy: 10,
          speed: 1.2,
          heading: 0,
          transport_mode_override: 'Пешком',
        }];
      }
      return [{
        id: 'place_1',
        title: 'Дом',
        created_at: '2026-10-29T08:10:00.000Z',
        latitude: 50,
        longitude: 19,
      }];
    },
  });

  const snapshot = await SQLiteDB.getLocalDaySnapshot(new Date('2026-10-29T12:00:00.000Z'));

  assert.equal(snapshot.dateKey, '2026-10-29');
  assert.equal(snapshot.points.length, 1);
  assert.equal(snapshot.points[0].transportModeOverride, 'Пешком');
  assert.equal(snapshot.places[0].title, 'Дом');
  assert.equal(calls.length, 2);
  assert.ok(calls[0].sql.includes('timestamp >= ? AND p.timestamp < ?'));
});

test('transport correction updates only points in the chosen time interval', async () => {
  let update;
  installDatabase({
    runAsync: async (sql, params) => {
      update = { sql, params };
    },
  });
  const start = new Date('2026-10-29T08:00:00.000Z');
  const end = new Date('2026-10-29T08:20:00.000Z');

  await SQLiteDB.setTransportModeForTimeRange(start, end, 'Велосипед');

  assert.ok(update.sql.includes('timestamp >= ? AND timestamp <= ?'));
  assert.equal(update.params.join('|'), [
    'Велосипед',
    start.toISOString(),
    end.toISOString(),
  ].join('|'));
});

test('exports user-added places with coordinates and creation time', async () => {
  installDatabase({
    getAllAsync: async () => [{
      id: 'place_1',
      title: 'Дом',
      created_at: '2026-10-29T08:10:00.000Z',
      latitude: 50,
      longitude: 19,
    }],
  });

  const places = await SQLiteDB.getAllDayPlaces();

  assert.equal(places.length, 1);
  assert.equal(places[0].title, 'Дом');
  assert.equal(places[0].latitude, 50);
  assert.equal(places[0].timestamp.toISOString(), '2026-10-29T08:10:00.000Z');
});

test('renames a user-added place and rejects places removed from history', async () => {
  const statements = [];
  installDatabase({
    runAsync: async (sql, params) => {
      statements.push({ sql, params });
      return { changes: 1 };
    },
  });

  await SQLiteDB.updateDayPlaceTitle('place-1', 'Дом');

  assert.equal(statements[0].sql, 'UPDATE day_places SET title = ? WHERE id = ?');
  assert.equal(statements[0].params.join('|'), 'Дом|place-1');
  installDatabase({
    runAsync: async () => ({ changes: 0 }),
  });
  await assert.rejects(SQLiteDB.updateDayPlaceTitle('missing', 'Дом'));
});

test('stores and deletes locally saved route alternatives', async () => {
  const statements = [];
  installDatabase({
    runAsync: async (sql, params) => statements.push({ sql, params }),
    getAllAsync: async () => [{ id: 'route-1', route_data: '{"id":"route-1"}' }],
  });

  await SQLiteDB.saveRouteBookmark('route-1', '{"id":"route-1"}');
  const bookmarks = await SQLiteDB.getRouteBookmarks();
  await SQLiteDB.deleteRouteBookmark('route-1');

  assert.equal(bookmarks[0].id, 'route-1');
  assert.equal(bookmarks[0].routeData, '{"id":"route-1"}');
  assert.ok(statements[0].sql.includes('INSERT INTO route_bookmarks'));
  assert.ok(statements[1].sql.includes('DELETE FROM route_bookmarks'));
});

test('database schema creates local timeline tables and migrates older point tables', async () => {
  const statements = [];
  const fakeDatabase = {
    execAsync: async sql => statements.push(sql),
    getAllAsync: async sql => {
      if (sql.includes('table_info(routes)')) {
        return [
          { name: 'transport_confidence' },
          { name: 'mode_locked' },
        ];
      }
      if (sql.includes('table_info(route_points)')) {
        return [{ name: 'id' }, { name: 'route_id' }, { name: 'timestamp' }];
      }
      return [{ name: 'singleton' }, { name: 'display_name' }, { name: 'created_at' }, { name: 'updated_at' }];
    },
  };

  await SQLiteDB.initializeSchema(fakeDatabase);

  const schemaSql = statements.join('\n');
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS day_places/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS app_settings/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS route_bookmarks/);
  assert.match(schemaSql, /ALTER TABLE route_points ADD COLUMN transport_mode_override TEXT/);
  assert.doesNotMatch(schemaSql, /FROM metadata/);
});

test('profile updates work with a legacy table that has no singleton constraint', async () => {
  const statements = [];
  installDatabase({
    getFirstAsync: async () => ({ singleton: 1 }),
    runAsync: async (sql, params) => statements.push({ sql, params }),
  });

  await SQLiteDB.saveLocalProfile('Алекс');

  assert.ok(statements[0].sql.startsWith('UPDATE local_profile'));
  assert.equal(statements[0].params[0], 'Алекс');
});

test('diagnostic logging supports legacy integer primary keys', async () => {
  const statements = [];
  installDatabase({
    getAllAsync: async () => [
      { name: 'id', type: 'INTEGER' },
      { name: 'created_at', type: 'TEXT' },
      { name: 'level', type: 'TEXT' },
      { name: 'message', type: 'TEXT' },
    ],
    runAsync: async (sql, params) => statements.push({ sql, params }),
  });

  await SQLiteDB.addDiagnosticLog('warning', 'test');

  assert.ok(statements[0].sql.includes('INSERT INTO diagnostic_logs (created_at'));
  assert.equal(statements[0].params[1], 'warning');
  assert.equal(statements[0].params[2], 'test');
});
