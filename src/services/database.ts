import * as SQLite from 'expo-sqlite';
import type * as Location from 'expo-location';
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

type PointRow = {
  id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  speed: number;
  heading: number;
};

class RouteDatabase {
  private db: SQLite.SQLiteDatabase | null = null;
  private initializing: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (!this.initializing) {
      this.initializing = (async () => {
        const db = await SQLite.openDatabaseAsync('route_guide.db');
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
            altitude REAL NOT NULL,
            accuracy REAL NOT NULL,
            speed REAL NOT NULL,
            heading REAL NOT NULL
          );
          CREATE INDEX IF NOT EXISTS route_points_route_timestamp
            ON route_points(route_id, timestamp);
          CREATE TABLE IF NOT EXISTS active_tracking (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            route_id TEXT NOT NULL REFERENCES routes(id)
          );
        `);
        const routeColumns = await db.getAllAsync<{ name: string }>(
          'PRAGMA table_info(routes)'
        );
        if (!routeColumns.some(column => column.name === 'transport_confidence')) {
          await db.execAsync('ALTER TABLE routes ADD COLUMN transport_confidence REAL');
        }
        if (!routeColumns.some(column => column.name === 'mode_locked')) {
          await db.execAsync(
            'ALTER TABLE routes ADD COLUMN mode_locked INTEGER NOT NULL DEFAULT 1'
          );
        }
        this.db = db;
      })().finally(() => {
        this.initializing = null;
      });
    }
    await this.initializing;
  }

  private async database(): Promise<SQLite.SQLiteDatabase> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Route database failed to initialize');
    return this.db;
  }

  async startRoute(transportMode: string, manual = false): Promise<string> {
    const db = await this.database();
    const id = `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      const active = await db.getFirstAsync<{ route_id: string }>(
        'SELECT route_id FROM active_tracking WHERE singleton = 1'
      );
      if (active) {
        throw new Error('Сначала завершите текущую запись маршрута.');
      }

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
  }

  async getActiveRouteId(): Promise<string | null> {
    const db = await this.database();
    const row = await db.getFirstAsync<{ route_id: string }>(
      'SELECT route_id FROM active_tracking WHERE singleton = 1'
    );
    return row?.route_id ?? null;
  }

  async appendLocations(locations: Location.LocationObject[]): Promise<void> {
    const db = await this.database();
    const active = await db.getFirstAsync<{ route_id: string; start_time: string }>(
      `SELECT a.route_id, r.start_time
       FROM active_tracking a JOIN routes r ON r.id = a.route_id
       WHERE a.singleton = 1`
    );
    if (!active) return;

    await db.withTransactionAsync(async () => {
      for (const location of locations) {
        const { latitude, longitude, altitude, accuracy, speed, heading } = location.coords;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180 ||
          (accuracy !== null && accuracy > 100)
        ) {
          continue;
        }

        const timestamp = new Date(location.timestamp).toISOString();
        const previous = await db.getFirstAsync<{ latitude: number; longitude: number }>(
          'SELECT latitude, longitude FROM route_points WHERE route_id = ? ORDER BY timestamp DESC LIMIT 1',
          [active.route_id]
        );
        const distance = previous
          ? this.distanceInKm(
              previous.latitude,
              previous.longitude,
              latitude,
              longitude
            )
          : 0;
        const pointId = `${active.route_id}_${location.timestamp}_${Math.random().toString(36).slice(2, 8)}`;

        await db.runAsync(
          `INSERT INTO route_points
           (id, route_id, timestamp, latitude, longitude, altitude, accuracy, speed, heading)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pointId,
            active.route_id,
            timestamp,
            latitude,
            longitude,
            altitude ?? 0,
            accuracy ?? 0,
            speed ?? 0,
            heading ?? 0,
          ]
        );

        await db.runAsync(
          `UPDATE routes
           SET distance = distance + ?, end_time = ?, duration = ?
           WHERE id = ?`,
          [
            distance,
            timestamp,
            Math.max(0, Math.floor((location.timestamp - Date.parse(active.start_time)) / 1000)),
            active.route_id,
          ]
        );
      }
    });

    const route = await db.getFirstAsync<{ mode_locked: number }>(
      'SELECT mode_locked FROM routes WHERE id = ?',
      [active.route_id]
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
      [active.route_id]
    );
    const ordered = recent.reverse();
    const observations = ordered.map((point, index) => {
      let speed = point.speed;
      if (speed <= 0 && index > 0) {
        const previous = ordered[index - 1];
        const seconds =
          (Date.parse(point.timestamp) - Date.parse(previous.timestamp)) / 1000;
        if (seconds > 0) {
          speed =
            (this.distanceInKm(
              previous.latitude,
              previous.longitude,
              point.latitude,
              point.longitude
            ) *
              1000) /
            seconds;
        }
      }
      return { speedMetersPerSecond: speed, accuracyMeters: point.accuracy };
    });
    const classification = classifyTransport(observations);
    if (classification) {
      await db.runAsync(
        `UPDATE routes SET transport_mode = ?, transport_confidence = ?
         WHERE id = ? AND mode_locked = 0`,
        [classification.mode, classification.confidence, active.route_id]
      );
    }
  }

  async setManualTransportMode(routeId: string, mode: string): Promise<void> {
    const db = await this.database();
    await db.runAsync(
      'UPDATE routes SET transport_mode = ?, transport_confidence = NULL, mode_locked = 1 WHERE id = ?',
      [mode, routeId]
    );
  }

  async finishRoute(): Promise<void> {
    const db = await this.database();
    const active = await db.getFirstAsync<{ route_id: string; start_time: string }>(
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
          Math.floor((Date.now() - Date.parse(active.start_time)) / 1000),
          active.route_id,
        ]
      );
      await db.runAsync(
        'DELETE FROM routes WHERE id = ? AND NOT EXISTS (SELECT 1 FROM route_points WHERE route_id = ?)',
        [active.route_id, active.route_id]
      );
      await db.runAsync('DELETE FROM active_tracking WHERE singleton = 1');
    });
  }

  async getRoutes(): Promise<Route[]> {
    const db = await this.database();
    const rows = await db.getAllAsync<RouteRow>(
      'SELECT * FROM routes ORDER BY start_time DESC'
    );
    return Promise.all(rows.map(row => this.loadRoute(db, row)));
  }

  async getRouteById(id: string): Promise<Route | null> {
    const db = await this.database();
    const row = await db.getFirstAsync<RouteRow>(
      'SELECT * FROM routes WHERE id = ?',
      [id]
    );
    return row ? this.loadRoute(db, row) : null;
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
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM active_tracking');
      await db.runAsync('DELETE FROM route_points');
      await db.runAsync('DELETE FROM routes');
    });
  }

  private async loadRoute(
    db: SQLite.SQLiteDatabase,
    row: RouteRow
  ): Promise<Route> {
    const points = await db.getAllAsync<PointRow>(
      'SELECT * FROM route_points WHERE route_id = ? ORDER BY timestamp ASC',
      [row.id]
    );

    return {
      id: row.id,
      startTime: new Date(row.start_time),
      endTime: new Date(row.end_time),
      distance: row.distance,
      duration: row.duration,
      transportMode: row.transport_mode,
      transportConfidence: row.transport_confidence,
      transportModeManual: Boolean(row.mode_locked),
      points: points.map(point => ({
        id: point.id,
        timestamp: new Date(point.timestamp),
        latitude: point.latitude,
        longitude: point.longitude,
        altitude: point.altitude,
        accuracy: point.accuracy,
        speed: point.speed,
        heading: point.heading,
      })),
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
