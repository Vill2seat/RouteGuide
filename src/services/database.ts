import * as SQLite from 'expo-sqlite';

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
  points: RoutePoint[];
};

class SQLiteDB {
  private db: SQLite.SQLiteDatabase | null = null;

  async init() {
    this.db = await SQLite.openDatabaseAsync('route_guide.db');
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        distance REAL NOT NULL,
        duration INTEGER NOT NULL,
        transport_mode TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS route_points (
        id TEXT PRIMARY KEY,
        route_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        altitude REAL NOT NULL,
        accuracy REAL NOT NULL,
        speed REAL NOT NULL,
        heading REAL NOT NULL,
        FOREIGN KEY (route_id) REFERENCES routes(id)
      );
    `);
  }

  async saveRoute(route: Route) {
    if (!this.db) await this.init();

    await this.db!.execAsync('BEGIN TRANSACTION');
    try {
      await this.db!.runAsync(
        'INSERT INTO routes (id, start_time, end_time, distance, duration, transport_mode) VALUES (?, ?, ?, ?, ?, ?)',
        [route.id, route.startTime.toISOString(), route.endTime.toISOString(), route.distance, route.duration, route.transportMode]
      );

      for (const p of route.points) {
        await this.db!.runAsync(
          'INSERT INTO route_points (id, route_id, timestamp, latitude, longitude, altitude, accuracy, speed, heading) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [p.id, route.id, p.timestamp.toISOString(), p.latitude, p.longitude, p.altitude, p.accuracy, p.speed, p.heading]
        );
      }

      await this.db!.execAsync('COMMIT');
    } catch (e) {
      await this.db!.execAsync('ROLLBACK');
      throw e;
    }
  }

  async getRoutes(): Promise<Route[]> {
    if (!this.db) await this.init();

    const routesResult = await this.db!.getAllAsync<{ id: string; start_time: string; end_time: string; distance: number; duration: number; transport_mode: string }>(
      'SELECT * FROM routes ORDER BY start_time DESC'
    );

    const routes: Route[] = [];
    for (const r of routesResult) {
      const pointsResult = await this.db!.getAllAsync<{ id: string; timestamp: string; latitude: number; longitude: number; altitude: number; accuracy: number; speed: number; heading: number }>(
        'SELECT * FROM route_points WHERE route_id = ? ORDER BY timestamp ASC',
        [r.id]
      );

      routes.push({
        id: r.id,
        startTime: new Date(r.start_time),
        endTime: new Date(r.end_time),
        distance: r.distance,
        duration: r.duration,
        transportMode: r.transport_mode,
        points: pointsResult.map(p => ({
          id: p.id,
          timestamp: new Date(p.timestamp),
          latitude: p.latitude,
          longitude: p.longitude,
          altitude: p.altitude,
          accuracy: p.accuracy,
          speed: p.speed,
          heading: p.heading,
        })),
      });
    }

    return routes;
  }

  async getRouteById(id: string): Promise<Route | null> {
    if (!this.db) await this.init();

    const routeResult = await this.db!.getFirstAsync<{ id: string; start_time: string; end_time: string; distance: number; duration: number; transport_mode: string }>(
      'SELECT * FROM routes WHERE id = ?',
      [id]
    );

    if (!routeResult) return null;

    const pointsResult = await this.db!.getAllAsync<{ id: string; timestamp: string; latitude: number; longitude: number; altitude: number; accuracy: number; speed: number; heading: number }>(
      'SELECT * FROM route_points WHERE route_id = ? ORDER BY timestamp ASC',
      [id]
    );

    return {
      id: routeResult.id,
      startTime: new Date(routeResult.start_time),
      endTime: new Date(routeResult.end_time),
      distance: routeResult.distance,
      duration: routeResult.duration,
      transportMode: routeResult.transport_mode,
      points: pointsResult.map(p => ({
        id: p.id,
        timestamp: new Date(p.timestamp),
        latitude: p.latitude,
        longitude: p.longitude,
        altitude: p.altitude,
        accuracy: p.accuracy,
        speed: p.speed,
        heading: p.heading,
      })),
    };
  }

  async deleteRoute(id: string) {
    if (!this.db) await this.init();
    await this.db!.runAsync('DELETE FROM route_points WHERE route_id = ?', [id]);
    await this.db!.runAsync('DELETE FROM routes WHERE id = ?', [id]);
  }

  async clearAll() {
    if (!this.db) await this.init();
    await this.db!.runAsync('DELETE FROM route_points');
    await this.db!.runAsync('DELETE FROM routes');
  }
}

export const SQLiteDB = new SQLiteDB();