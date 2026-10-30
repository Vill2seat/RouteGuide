import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type * as Location from 'expo-location';
import { localDayBounds, getLocalDateKey } from './dayTimeline';
import { classifyTransport } from './transportClassifier';

export type RoutePoint = {
  id: string;
  timestamp: Date;
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  speed: number;
  heading: number;
  transportModeOverride?: string | null;
};

export type Route = {
  id: string;
  startTime: Date;
  endTime: Date;
  distance: number;
  duration: number;
  transportMode: string;
  transportConfidence: number | null;
  transportModeManual: boolean;
  points: RoutePoint[];
};

export type LocalProfile = {
  displayName: string;
  createdAt: Date;
};

export type DiagnosticLog = {
  createdAt: Date;
  level: 'info' | 'warning' | 'error';
  message: string;
};

export type DayPlace = {
  id: string;
  title: string;
  timestamp: Date;
  latitude: number;
  longitude: number;
};

export type LocalDaySnapshot = {
  dateKey: string;
  points: RoutePoint[];
  places: DayPlace[];
};

type RouteRow = {
  id: string;
  start_time: string;
  end_time: string;
  distance: number;
  duration: number;
  transport_mode: string;
  transport_confidence: number | null;
  mode_locked: number;
};

type ProfileRow = {
  display_name: string;
  created_at: string;
};

type PointRow = {
  id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  speed: number;
  heading: number;
  transport_mode_override: string | null;
};

type DiagnosticLogRow = {
  created_at: string;
  level: DiagnosticLog['level'];
  message: string;
};

type ActiveRouteRow = {
  route_id: string;
  start_time: string;
};

class RouteDatabase {
  private static readonly encryptionKeyName = 'route-guide-sqlite-key';
  private static readonly databaseName = 'route_guide.db';
  private static readonly encryptedDatabaseName = 'route_guide_encrypted.db';
  private db: SQLite.SQLiteDatabase | null = null;
  private initializing: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  async init(): Promise<void> {
    if (this.db) return;
    if (!this.initializing) {
      this.initializing = (async () => {
        const key = await this.getEncryptionKey();
        const db = await SQLite.openDatabaseAsync(RouteDatabase.encryptedDatabaseName);
        try {
          await db.execAsync(`PRAGMA key = "x'${key}'"`);
          await this.verifyCipher(db);
          await this.migrateLegacyDatabaseIfNeeded(db);
          await this.initializeSchema(db);
          await this.deleteLegacyDatabaseAfterVerification(db);
          this.db = db;
        } catch (error) {
          await db.closeAsync();
          throw error;
        }
      })().finally(() => {
        this.initializing = null;
      });
    }
    await this.initializing;
  }

  private async getEncryptionKey(): Promise<string> {
    let key = await SecureStore.getItemAsync(RouteDatabase.encryptionKeyName);
    if (!key) {
      key = Array.from(await Crypto.getRandomBytesAsync(32))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
      await SecureStore.setItemAsync(RouteDatabase.encryptionKeyName, key);
    }
    if (!/^[\da-f]{64}$/i.test(key)) {
      throw new Error('Ключ шифрования локальной базы данных некорректен.');
    }
    return key;
  }

  private async verifyCipher(db: SQLite.SQLiteDatabase): Promise<void> {
    const cipher = await db.getFirstAsync<{ cipher_version: string }>(
      'PRAGMA cipher_version'
    );
    if (!cipher?.cipher_version) {
      throw new Error('В этой сборке приложения не включено шифрование базы данных.');
    }
  }

  private async migrateLegacyDatabaseIfNeeded(
    encryptedDatabase: SQLite.SQLiteDatabase
  ): Promise<void> {
    const encryptedTables = await encryptedDatabase.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1`
    );
    if (encryptedTables) {
      return;
    }

    const legacyDatabase = await SQLite.openDatabaseAsync(RouteDatabase.databaseName);
    let hasLegacyTables = false;
    try {
      const tables = await legacyDatabase.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1`
      );
      hasLegacyTables = tables.length > 0;
      if (hasLegacyTables) {
        await SQLite.backupDatabaseAsync({
          sourceDatabase: legacyDatabase,
          destDatabase: encryptedDatabase,
        });
        const migratedTable = await encryptedDatabase.getFirstAsync<{ name: string }>(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1`
        );
        if (!migratedTable) {
          throw new Error('Не удалось проверить перенос локальной истории в зашифрованную базу.');
        }
      }
    } finally {
      await legacyDatabase.closeAsync();
    }
  }

  private async deleteLegacyDatabaseAfterVerification(
    encryptedDatabase: SQLite.SQLiteDatabase
  ): Promise<void> {
    const applicationTables = [
      'routes',
      'route_points',
      'active_tracking',
      'local_profile',
      'diagnostic_logs',
      'day_places',
      'app_settings',
      'route_bookmarks',
    ];
    const legacyDatabase = await SQLite.openDatabaseAsync(RouteDatabase.databaseName);
    try {
      const tables = await legacyDatabase.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
      );
      if (tables.some(table => !applicationTables.includes(table.name))) {
        throw new Error('Старая база содержит неизвестные таблицы; исходные данные сохранены.');
      }
      for (const tableName of applicationTables) {
        if (!tables.some(table => table.name === tableName)) continue;
        const [legacyCount, encryptedCount] = await Promise.all([
          legacyDatabase.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) AS count FROM ${tableName}`
          ),
          encryptedDatabase.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) AS count FROM ${tableName}`
          ),
        ]);
        if (legacyCount?.count !== encryptedCount?.count) {
          throw new Error(
            `Проверка переноса таблицы ${tableName} не прошла; исходные данные сохранены.`
          );
        }
      }
    } finally {
      await legacyDatabase.closeAsync();
    }
    await SQLite.deleteDatabaseAsync(RouteDatabase.databaseName);
  }

  private async initializeSchema(db: SQLite.SQLiteDatabase): Promise<void> {
    await db.execAsync(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        distance REAL NOT NULL DEFAULT 0,
        duration INTEGER NOT NULL DEFAULT 0,
        transport_mode TEXT NOT NULL,
        transport_confidence REAL,
        mode_locked INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS route_points (
        id TEXT PRIMARY KEY NOT NULL,
        route_id TEXT NOT NULL REFERENCES routes(id),
        timestamp TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        altitude REAL NOT NULL DEFAULT 0,
        accuracy REAL NOT NULL DEFAULT 0,
        speed REAL NOT NULL DEFAULT 0,
        heading REAL NOT NULL DEFAULT 0,
        transport_mode_override TEXT
      );
      CREATE INDEX IF NOT EXISTS route_points_route_timestamp
        ON route_points(route_id, timestamp);
      CREATE INDEX IF NOT EXISTS route_points_timestamp
        ON route_points(timestamp);
      CREATE INDEX IF NOT EXISTS routes_start_time
        ON routes(start_time);
      CREATE TABLE IF NOT EXISTS active_tracking (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        route_id TEXT NOT NULL REFERENCES routes(id)
      );
      CREATE TABLE IF NOT EXISTS local_profile (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS diagnostic_logs (
        id TEXT PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL,
        level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
        message TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS diagnostic_logs_created_at
        ON diagnostic_logs(created_at);
      CREATE TABLE IF NOT EXISTS day_places (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS day_places_created_at
        ON day_places(created_at);
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS route_bookmarks (
        id TEXT PRIMARY KEY NOT NULL,
        route_data TEXT NOT NULL,
        saved_at TEXT NOT NULL
      );
    `);

    await this.ensureColumn(db, 'routes', 'transport_confidence', 'REAL');
    await this.ensureColumn(db, 'routes', 'mode_locked', 'INTEGER NOT NULL DEFAULT 1');
    await this.ensureColumn(db, 'route_points', 'transport_mode_override', 'TEXT');
    await this.ensureColumn(db, 'local_profile', 'created_at', "TEXT NOT NULL DEFAULT ''");
    await this.ensureColumn(db, 'local_profile', 'updated_at', "TEXT NOT NULL DEFAULT ''");
  }

  private async ensureColumn(
    db: SQLite.SQLiteDatabase,
    table: string,
    column: string,
    declaration: string
  ): Promise<void> {
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!columns.some(existing => existing.name === column)) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
    }
  }

  private async database(): Promise<SQLite.SQLiteDatabase> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Route database failed to initialize');
    return this.db;
  }

  private async serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writeQueue.then(operation);
    this.writeQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async startRoute(transportMode: string, manual = false): Promise<string> {
    const db = await this.database();
    return this.serializeWrite(async () => {
      const id = `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      await db.withTransactionAsync(async () => {
        const active = await db.getFirstAsync<{ route_id: string }>(
          'SELECT route_id FROM active_tracking WHERE singleton = 1'
        );
        if (active) throw new Error('Сначала завершите текущую запись маршрута.');
        await db.runAsync(
          `INSERT INTO routes
           (id, start_time, end_time, transport_mode, mode_locked)
           VALUES (?, ?, ?, ?, ?)`,
          [id, now, now, transportMode, manual ? 1 : 0]
        );
        await db.runAsync(
          'INSERT OR REPLACE INTO active_tracking (singleton, route_id) VALUES (1, ?)',
          [id]
        );
      });
      return id;
    });
  }

  async getActiveRouteId(): Promise<string | null> {
    const db = await this.database();
    const row = await db.getFirstAsync<{ route_id: string }>(
      'SELECT route_id FROM active_tracking WHERE singleton = 1'
    );
    return row?.route_id ?? null;
  }

  async setActiveRoute(routeId: string): Promise<void> {
    const db = await this.database();
    await db.runAsync(
      'INSERT OR REPLACE INTO active_tracking (singleton, route_id) VALUES (1, ?)',
      [routeId]
    );
  }

  async clearActiveRoute(): Promise<void> {
    const db = await this.database();
    await db.runAsync('DELETE FROM active_tracking WHERE singleton = 1');
  }

  async getLocalProfile(): Promise<LocalProfile | null> {
    const db = await this.database();
    const row = await db.getFirstAsync<ProfileRow>(
      'SELECT display_name, created_at FROM local_profile WHERE singleton = 1'
    );
    return row
      ? { displayName: row.display_name, createdAt: new Date(row.created_at) }
      : null;
  }

  async saveLocalProfile(displayName: string): Promise<void> {
    const normalizedName = displayName.trim();
    if (normalizedName.length < 2 || normalizedName.length > 50) {
      throw new Error('Имя профиля должно содержать от 2 до 50 символов.');
    }
    const db = await this.database();
    const now = new Date().toISOString();
    const existing = await db.getFirstAsync<{ singleton: number }>(
      'SELECT singleton FROM local_profile WHERE singleton = 1'
    );
    if (existing) {
      await db.runAsync(
        'UPDATE local_profile SET display_name = ?, updated_at = ? WHERE singleton = 1',
        [normalizedName, now]
      );
    } else {
      await db.runAsync(
        `INSERT INTO local_profile (singleton, display_name, created_at, updated_at)
         VALUES (1, ?, ?, ?)`,
        [normalizedName, now, now]
      );
    }
  }

  async isAutomaticRecordingEnabled(): Promise<boolean> {
    const db = await this.database();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'automatic_recording'"
    );
    return row?.value !== 'false';
  }

  async setAutomaticRecordingEnabled(enabled: boolean): Promise<void> {
    const db = await this.database();
    await db.runAsync(
      `INSERT INTO app_settings (key, value) VALUES ('automatic_recording', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(enabled)]
    );
  }

  async addDiagnosticLog(
    level: DiagnosticLog['level'],
    message: string
  ): Promise<void> {
    const db = await this.database();
    const columns = await db.getAllAsync<{ name: string; type: string }>(
      'PRAGMA table_info(diagnostic_logs)'
    );
    const integerPrimaryKey = columns.some(
      column => column.name === 'id' && column.type.toUpperCase() === 'INTEGER'
    );
    if (integerPrimaryKey) {
      await db.runAsync(
        'INSERT INTO diagnostic_logs (created_at, level, message) VALUES (?, ?, ?)',
        [new Date().toISOString(), level, message.slice(0, 500)]
      );
    } else {
      await db.runAsync(
        'INSERT INTO diagnostic_logs (id, created_at, level, message) VALUES (?, ?, ?, ?)',
        [
          `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          new Date().toISOString(),
          level,
          message.slice(0, 500),
        ]
      );
    }
    await db.runAsync(
      `DELETE FROM diagnostic_logs
       WHERE id NOT IN (
         SELECT id FROM diagnostic_logs ORDER BY created_at DESC LIMIT 500
       )`
    );
  }

  async getDiagnosticLogs(): Promise<DiagnosticLog[]> {
    const db = await this.database();
    const rows = await db.getAllAsync<DiagnosticLogRow>(
      'SELECT created_at, level, message FROM diagnostic_logs ORDER BY created_at DESC LIMIT 500'
    );
    return rows.map(row => ({
      createdAt: new Date(row.created_at),
      level: row.level,
      message: row.message,
    }));
  }

  async clearDiagnosticLogs(): Promise<void> {
    const db = await this.database();
    await db.runAsync('DELETE FROM diagnostic_logs');
  }

  async appendLocations(locations: Location.LocationObject[]): Promise<void> {
    if (!locations.length) return;
    const db = await this.database();
    await this.serializeWrite(async () => {
      let activeRouteId: string | null = null;
      await db.withTransactionAsync(async () => {
        const active = await db.getFirstAsync<ActiveRouteRow>(
          `SELECT a.route_id, r.start_time
           FROM active_tracking a JOIN routes r ON r.id = a.route_id
           WHERE a.singleton = 1`
        );
        if (!active) return;
        activeRouteId = active.route_id;
        for (const location of [...locations].sort((a, b) => a.timestamp - b.timestamp)) {
          const { latitude, longitude, altitude, accuracy, speed, heading } = location.coords;
          if (
            !Number.isFinite(location.timestamp) ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180 ||
            (accuracy !== null &&
              (!Number.isFinite(accuracy) || accuracy < 0))
          ) {
            continue;
          }
          const timestamp = new Date(location.timestamp).toISOString();
          const previous = await db.getFirstAsync<{
            latitude: number;
            longitude: number;
            timestamp: string;
            accuracy: number;
          }>(
            `SELECT latitude, longitude, timestamp, accuracy FROM route_points
             WHERE route_id = ? ORDER BY timestamp DESC LIMIT 1`,
            [active.route_id]
          );
          if (previous && Date.parse(previous.timestamp) >= location.timestamp) continue;

          const elapsedSeconds = previous
            ? (location.timestamp - Date.parse(previous.timestamp)) / 1000
            : 0;
          const accuracyMeters = accuracy ?? 1_000;
          const distance = previous &&
            previous.accuracy <= 100 &&
            accuracyMeters <= 100 &&
            elapsedSeconds > 0 &&
            elapsedSeconds <= 10 * 60
            ? this.distanceInKm(previous.latitude, previous.longitude, latitude, longitude)
            : 0;
          const plausibleDistance =
            elapsedSeconds > 0 && distance * 1000 / elapsedSeconds <= 70;
          const pointId = `${active.route_id}_${Crypto.randomUUID()}`;
          await db.runAsync(
            `INSERT OR IGNORE INTO route_points
             (id, route_id, timestamp, latitude, longitude, altitude, accuracy, speed, heading)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              pointId,
              active.route_id,
              timestamp,
              latitude,
              longitude,
              Number.isFinite(altitude) ? altitude : 0,
              accuracyMeters,
              Number.isFinite(speed) ? speed : 0,
              Number.isFinite(heading) ? heading : 0,
            ]
          );
          await db.runAsync(
            `UPDATE routes
             SET distance = distance + ?, end_time = ?, duration = ?
             WHERE id = ?`,
            [
              plausibleDistance ? distance : 0,
              timestamp,
              Math.max(0, Math.floor((location.timestamp - Date.parse(active.start_time)) / 1000)),
              active.route_id,
            ]
          );
        }
      });
      if (!activeRouteId) return;

      const route = await db.getFirstAsync<{ mode_locked: number }>(
        'SELECT mode_locked FROM routes WHERE id = ?',
        [activeRouteId]
      );
      if (route?.mode_locked) return;
      const recent = await db.getAllAsync<{
        timestamp: string;
        latitude: number;
        longitude: number;
        accuracy: number;
        speed: number;
      }>(
        `SELECT timestamp, latitude, longitude, accuracy, speed
         FROM route_points WHERE route_id = ?
         ORDER BY timestamp DESC LIMIT 7`,
        [activeRouteId]
      );
      const ordered = recent.reverse();
      const classification = classifyTransport(
        ordered.map((point, index) => {
          let speed = point.speed;
          if (speed <= 0 && index > 0) {
            const previous = ordered[index - 1];
            const seconds = (Date.parse(point.timestamp) - Date.parse(previous.timestamp)) / 1000;
            if (seconds > 0) {
              speed =
                this.distanceInKm(
                  previous.latitude,
                  previous.longitude,
                  point.latitude,
                  point.longitude
                ) * 1000 / seconds;
            }
          }
          return { speedMetersPerSecond: speed, accuracyMeters: point.accuracy };
        })
      );
      if (classification) {
        await db.runAsync(
          `UPDATE routes SET transport_mode = ?, transport_confidence = ?
           WHERE id = ? AND mode_locked = 0`,
          [classification.mode, classification.confidence, activeRouteId]
        );
      }
    });
  }

  async setManualTransportMode(routeId: string, mode: string): Promise<void> {
    const db = await this.database();
    await db.runAsync(
      'UPDATE routes SET transport_mode = ?, transport_confidence = NULL, mode_locked = 1 WHERE id = ?',
      [mode, routeId]
    );
  }

  async setTransportModeForTimeRange(
    start: Date,
    end: Date,
    mode: string
  ): Promise<void> {
    const db = await this.database();
    await db.runAsync(
      `UPDATE route_points SET transport_mode_override = ?
       WHERE timestamp >= ? AND timestamp <= ?`,
      [mode, start.toISOString(), end.toISOString()]
    );
  }

  async finishRoute(): Promise<void> {
    const db = await this.database();
    await this.serializeWrite(async () => {
      const active = await db.getFirstAsync<ActiveRouteRow>(
        `SELECT a.route_id, r.start_time
         FROM active_tracking a JOIN routes r ON r.id = a.route_id
         WHERE a.singleton = 1`
      );
      if (!active) return;
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `UPDATE routes SET end_time = ?, duration = MAX(duration, ?)
           WHERE id = ?`,
          [
            new Date().toISOString(),
            Math.max(0, Math.floor((Date.now() - Date.parse(active.start_time)) / 1000)),
            active.route_id,
          ]
        );
        await db.runAsync('DELETE FROM active_tracking WHERE singleton = 1');
      });
    });
  }

  async getRoutes(): Promise<Route[]> {
    const db = await this.database();
    const rows = await db.getAllAsync<RouteRow>(
      'SELECT * FROM routes ORDER BY start_time DESC'
    );
    return rows.map(row => this.mapRoute(row, []));
  }

  async getRouteById(id: string, pointLimit?: number): Promise<Route | null> {
    const db = await this.database();
    const row = await db.getFirstAsync<RouteRow>(
      'SELECT * FROM routes WHERE id = ?',
      [id]
    );
    if (!row) return null;
    const limitSql = pointLimit ? ' LIMIT ?' : '';
    const values: (string | number)[] = pointLimit ? [id, pointLimit] : [id];
    const points = await db.getAllAsync<PointRow>(
      `SELECT * FROM route_points WHERE route_id = ? ORDER BY timestamp ASC${limitSql}`,
      values
    );
    return this.mapRoute(row, points);
  }

  async getLocalDaySnapshot(date: Date): Promise<LocalDaySnapshot> {
    const db = await this.database();
    const { start, end } = localDayBounds(date);
    const [pointRows, placeRows] = await Promise.all([
      db.getAllAsync<PointRow>(
        `SELECT p.* FROM route_points p
         JOIN routes r ON r.id = p.route_id
         WHERE p.timestamp >= ? AND p.timestamp < ?
         ORDER BY p.timestamp ASC`,
        [start.toISOString(), end.toISOString()]
      ),
      db.getAllAsync<{
        id: string;
        title: string;
        created_at: string;
        latitude: number;
        longitude: number;
      }>(
        `SELECT id, title, created_at, latitude, longitude FROM day_places
         WHERE created_at >= ? AND created_at < ? ORDER BY created_at ASC`,
        [start.toISOString(), end.toISOString()]
      ),
    ]);
    return {
      dateKey: getLocalDateKey(date),
      points: pointRows.map(point => this.mapPoint(point)),
      places: placeRows.map(place => ({
        id: place.id,
        title: place.title,
        timestamp: new Date(place.created_at),
        latitude: place.latitude,
        longitude: place.longitude,
      })),
    };
  }

  async addDayPlace(
    date: Date,
    title: string,
    location: { latitude: number; longitude: number }
  ): Promise<void> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle || normalizedTitle.length > 80) {
      throw new Error('Название места должно содержать от 1 до 80 символов.');
    }
    if (
      !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      Math.abs(location.latitude) > 90 ||
      Math.abs(location.longitude) > 180
    ) {
      throw new Error('Координаты места некорректны.');
    }
    const db = await this.database();
    await db.runAsync(
      `INSERT INTO day_places (id, title, created_at, latitude, longitude)
       VALUES (?, ?, ?, ?, ?)`,
      [
        `place_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        normalizedTitle,
        date.toISOString(),
        location.latitude,
        location.longitude,
      ]
    );
  }

  async deleteDayPlace(id: string): Promise<void> {
    const db = await this.database();
    await db.runAsync('DELETE FROM day_places WHERE id = ?', [id]);
  }

  async updateDayPlaceTitle(id: string, title: string): Promise<void> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle || normalizedTitle.length > 80) {
      throw new Error('Название места должно содержать от 1 до 80 символов.');
    }
    const db = await this.database();
    const result = await db.runAsync(
      'UPDATE day_places SET title = ? WHERE id = ?',
      [normalizedTitle, id]
    );
    if (result.changes === 0) {
      throw new Error('Это место больше не найдено в истории.');
    }
  }

  async saveRouteBookmark(id: string, routeData: string): Promise<void> {
    if (!id || !routeData) throw new Error('Не удалось сохранить маршрут без данных.');
    const db = await this.database();
    await db.runAsync(
      `INSERT INTO route_bookmarks (id, route_data, saved_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET route_data = excluded.route_data, saved_at = excluded.saved_at`,
      [id, routeData, new Date().toISOString()]
    );
  }

  async getRouteBookmarks(): Promise<Array<{ id: string; routeData: string }>> {
    const db = await this.database();
    return db.getAllAsync<{ id: string; route_data: string }>(
      'SELECT id, route_data FROM route_bookmarks ORDER BY saved_at DESC'
    ).then(rows => rows.map(row => ({ id: row.id, routeData: row.route_data })));
  }

  async deleteRouteBookmark(id: string): Promise<void> {
    const db = await this.database();
    await db.runAsync('DELETE FROM route_bookmarks WHERE id = ?', [id]);
  }

  async getAllDayPlaces(): Promise<DayPlace[]> {
    const db = await this.database();
    const rows = await db.getAllAsync<{
      id: string;
      title: string;
      created_at: string;
      latitude: number;
      longitude: number;
    }>('SELECT id, title, created_at, latitude, longitude FROM day_places ORDER BY created_at DESC');
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      timestamp: new Date(row.created_at),
      latitude: row.latitude,
      longitude: row.longitude,
    }));
  }

  async deleteRoute(id: string): Promise<void> {
    const db = await this.database();
    await db.withTransactionAsync(async () => {
      const active = await db.getFirstAsync<{ route_id: string }>(
        'SELECT route_id FROM active_tracking WHERE singleton = 1'
      );
      if (active?.route_id === id) {
        throw new Error('Нельзя удалить маршрут, пока его запись активна.');
      }
      await db.runAsync('DELETE FROM route_points WHERE route_id = ?', [id]);
      await db.runAsync('DELETE FROM routes WHERE id = ?', [id]);
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.database();
    const active = await db.getFirstAsync<{ route_id: string }>(
      'SELECT route_id FROM active_tracking WHERE singleton = 1'
    );
    if (active?.route_id) {
      throw new Error(
        'Нельзя удалить все данные, пока запись маршрута ещё активна. Сначала остановите запись.'
      );
    }
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM route_points');
      await db.runAsync('DELETE FROM routes');
      await db.runAsync('DELETE FROM day_places');
      await db.runAsync('DELETE FROM route_bookmarks');
      await db.runAsync('DELETE FROM diagnostic_logs');
      await db.runAsync('DELETE FROM local_profile');
      await db.runAsync('DELETE FROM app_settings');
    });
  }

  async clearAllLocalData(): Promise<void> {
    const db = await this.database();
    const active = await db.getFirstAsync<{ route_id: string }>(
      'SELECT route_id FROM active_tracking WHERE singleton = 1'
    );
    if (active?.route_id) {
      throw new Error(
        'Нельзя удалить все локальные данные, пока запись маршрута ещё активна. Сначала остановите запись.'
      );
    }
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM route_points');
      await db.runAsync('DELETE FROM routes');
      await db.runAsync('DELETE FROM day_places');
      await db.runAsync('DELETE FROM route_bookmarks');
      await db.runAsync('DELETE FROM diagnostic_logs');
      await db.runAsync('DELETE FROM local_profile');
      await db.runAsync('DELETE FROM app_settings');
    });
  }

  private mapRoute(row: RouteRow, pointRows: PointRow[]): Route {
    return {
      id: row.id,
      startTime: new Date(row.start_time),
      endTime: new Date(row.end_time),
      distance: row.distance,
      duration: row.duration,
      transportMode: row.transport_mode,
      transportConfidence: row.transport_confidence,
      transportModeManual: Boolean(row.mode_locked),
      points: pointRows.map(point => this.mapPoint(point)),
    };
  }

  private mapPoint(point: PointRow): RoutePoint {
    return {
      id: point.id,
      timestamp: new Date(point.timestamp),
      latitude: point.latitude,
      longitude: point.longitude,
      altitude: point.altitude,
      accuracy: point.accuracy,
      speed: point.speed,
      heading: point.heading,
      transportModeOverride: point.transport_mode_override,
    };
  }

  private distanceInKm(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number
  ): number {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const deltaLatitude = radians(latitude2 - latitude1);
    const deltaLongitude = radians(longitude2 - longitude1);
    const haversine =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(radians(latitude1)) *
        Math.cos(radians(latitude2)) *
        Math.sin(deltaLongitude / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }
}

export const SQLiteDB = new RouteDatabase();
