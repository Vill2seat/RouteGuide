import type { RoutePoint } from './database';

export type DayPlace = {
  id: string;
  title: string;
  timestamp: Date;
  latitude: number;
  longitude: number;
};

export type DayTrip = {
  id: string;
  startTime: Date;
  endTime: Date;
  distanceKm: number;
  durationSeconds: number;
  transportMode: string;
  transportConfidence: number | null;
  points: RoutePoint[];
};

export type DayVisit = {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  latitude: number;
  longitude: number;
  manual: boolean;
};

export type DayEvent =
  | { kind: 'trip'; timestamp: Date; trip: DayTrip }
  | { kind: 'visit'; timestamp: Date; visit: DayVisit };

export type DayMetrics = {
  distanceKm: number;
  movingSeconds: number;
  transportModes: string[];
};

const stopMinimumDurationMs = 8 * 60 * 1000;
const stopMaximumGapMs = 15 * 60 * 1000;
const stopRadiusMeters = 80;

function distanceMeters(
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
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function pointSpeed(
  point: RoutePoint,
  previous: RoutePoint | undefined
): number | null {
  if (point.speed >= 0) return point.speed;
  if (!previous) return null;
  const seconds = (point.timestamp.getTime() - previous.timestamp.getTime()) / 1000;
  if (seconds <= 0 || seconds > 5 * 60) return null;
  return (
    distanceMeters(
      previous.latitude,
      previous.longitude,
      point.latitude,
      point.longitude
    ) / seconds
  );
}

function inferredMode(speed: number | null): string {
  if (speed === null || speed < 0.3) return 'Неизвестно';
  if (speed < 2.8) return 'Пешком';
  if (speed < 8.3) return 'Велосипед';
  return 'Моторизованный транспорт';
}

function dominantMode(points: RoutePoint[]): { mode: string; confidence: number | null } {
  const counts = new Map<string, number>();
  const manualCounts = new Map<string, number>();
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point.transportModeOverride) {
      manualCounts.set(
        point.transportModeOverride,
        (manualCounts.get(point.transportModeOverride) ?? 0) + 1
      );
      continue;
    }
    const mode = inferredMode(pointSpeed(point, points[index - 1]));
    if (mode !== 'Неизвестно') counts.set(mode, (counts.get(mode) ?? 0) + 1);
  }
  const manualMode = [...manualCounts.entries()].sort(
    (first, second) => second[1] - first[1]
  )[0];
  if (manualMode) return { mode: manualMode[0], confidence: null };
  const sorted = [...counts.entries()].sort((first, second) => second[1] - first[1]);
  const total = sorted.reduce((sum, entry) => sum + entry[1], 0);
  if (!sorted.length || total < 3) return { mode: 'Неизвестно', confidence: null };
  return { mode: sorted[0][0], confidence: sorted[0][1] / total };
}

type StopRun = { start: number; end: number };

function findStops(points: RoutePoint[]): StopRun[] {
  const stops: StopRun[] = [];
  let start = -1;
  let anchor: RoutePoint | null = null;
  let previous: RoutePoint | null = null;

  const closeStop = (end: number) => {
    if (
      start >= 0 &&
      anchor &&
      points[end].timestamp.getTime() - points[start].timestamp.getTime() >=
        stopMinimumDurationMs
    ) {
      stops.push({ start, end });
    }
    start = -1;
    anchor = null;
  };

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const timestamp = point.timestamp.getTime();
    const gap = previous ? timestamp - previous.timestamp.getTime() : 0;
    const speed = pointSpeed(point, previous ?? undefined);
    const previousDistance =
      previous === null
        ? Number.POSITIVE_INFINITY
        : distanceMeters(
            previous.latitude,
            previous.longitude,
            point.latitude,
            point.longitude
          );
    const stationary =
      (speed !== null && speed < 0.7) ||
      (previous !== null &&
        gap > 0 &&
        gap <= stopMaximumGapMs &&
        previousDistance <= stopRadiusMeters);
    if (
      start < 0 &&
      previous !== null &&
      gap >= stopMinimumDurationMs &&
      gap <= stopMaximumGapMs &&
      previousDistance <= stopRadiusMeters
    ) {
      const previousStop = stops[stops.length - 1];
      if (previousStop?.end === index - 1) {
        previousStop.end = index;
      } else {
        stops.push({ start: index - 1, end: index });
      }
      previous = point;
      continue;
    }
    const nearAnchor =
      anchor !== null &&
      distanceMeters(
        anchor.latitude,
        anchor.longitude,
        point.latitude,
        point.longitude
      ) <= stopRadiusMeters;

    if (stationary && (!previous || gap <= stopMaximumGapMs) && (!anchor || nearAnchor)) {
      if (start < 0) {
        start = index;
        anchor = point;
      }
    } else {
      closeStop(index - 1);
    }
    previous = point;
  }

  if (start >= 0) closeStop(points.length - 1);
  return stops;
}

export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildDayMetrics(points: RoutePoint[]): DayMetrics {
  let distanceKm = 0;
  let movingSeconds = 0;
  const modes = new Set<string>();

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous.accuracy > 200 || point.accuracy > 200) continue;
    const seconds = (point.timestamp.getTime() - previous.timestamp.getTime()) / 1000;
    if (seconds <= 0 || seconds > 10 * 60) continue;

    const distance = distanceMeters(
      previous.latitude,
      previous.longitude,
      point.latitude,
      point.longitude
    );
    if (distance > 5_000) continue;

    const speed = pointSpeed(point, previous);
    if (speed === null || speed < 0.3) continue;
    distanceKm += distance / 1_000;
    movingSeconds += Math.min(seconds, 120);
    const mode = point.transportModeOverride ?? inferredMode(speed);
    if (mode !== 'Неизвестно') modes.add(mode);
  }

  return {
    distanceKm,
    movingSeconds,
    transportModes: [...modes],
  };
}

export function buildDayTimeline(
  rawPoints: RoutePoint[],
  places: DayPlace[]
): DayEvent[] {
  const points = [...rawPoints].sort(
    (first, second) => first.timestamp.getTime() - second.timestamp.getTime()
  );
  if (!points.length) {
    return places
      .map(visit => ({
        kind: 'visit' as const,
        timestamp: visit.timestamp,
        visit: {
          id: visit.id,
          title: visit.title,
          startTime: visit.timestamp,
          endTime: visit.timestamp,
          latitude: visit.latitude,
          longitude: visit.longitude,
          manual: true,
        },
      }))
      .sort((first, second) => first.timestamp.getTime() - second.timestamp.getTime());
  }

  const stops = findStops(points);
  const events: DayEvent[] = [];
  const consumedPlaces = new Set<string>();
  let tripStart = 0;

  const addTrip = (start: number, end: number) => {
    const tripPoints = points.slice(start, end + 1);
    if (tripPoints.length < 2) return;
    let distanceKm = 0;
    let durationSeconds = 0;
    for (let index = 1; index < tripPoints.length; index += 1) {
      const previous = tripPoints[index - 1];
      const point = tripPoints[index];
      const seconds = (point.timestamp.getTime() - previous.timestamp.getTime()) / 1000;
      if (seconds <= 0 || seconds > 5 * 60) continue;
      distanceKm +=
        distanceMeters(
          previous.latitude,
          previous.longitude,
          point.latitude,
          point.longitude
        ) / 1_000;
      durationSeconds += Math.min(seconds, 120);
    }
    const { mode, confidence } = dominantMode(tripPoints);
    const trip: DayTrip = {
      id: tripPoints[0].id,
      startTime: tripPoints[0].timestamp,
      endTime: tripPoints[tripPoints.length - 1].timestamp,
      distanceKm,
      durationSeconds,
      transportMode: mode,
      transportConfidence: confidence,
      points: tripPoints,
    };
    events.push({ kind: 'trip', timestamp: trip.startTime, trip });
  };

  for (const stop of stops) {
    addTrip(tripStart, stop.start - 1);
    const first = points[stop.start];
    const last = points[stop.end];
    const latitude =
      points.slice(stop.start, stop.end + 1).reduce((sum, point) => sum + point.latitude, 0) /
      (stop.end - stop.start + 1);
    const longitude =
      points.slice(stop.start, stop.end + 1).reduce((sum, point) => sum + point.longitude, 0) /
      (stop.end - stop.start + 1);
    const matchingPlace = places.find(
      place =>
        !consumedPlaces.has(place.id) &&
        distanceMeters(latitude, longitude, place.latitude, place.longitude) <= 150 &&
        place.timestamp.getTime() >= first.timestamp.getTime() - 10 * 60 * 1000 &&
        place.timestamp.getTime() <= last.timestamp.getTime() + 10 * 60 * 1000
    );
    if (matchingPlace) consumedPlaces.add(matchingPlace.id);
    const visit: DayVisit = {
      id: matchingPlace?.id ?? `visit-${first.id}`,
      title: matchingPlace?.title ?? 'Место остановки',
      startTime: first.timestamp,
      endTime: last.timestamp,
      latitude,
      longitude,
      manual: Boolean(matchingPlace),
    };
    events.push({ kind: 'visit', timestamp: visit.startTime, visit });
    tripStart = stop.end + 1;
  }
  addTrip(tripStart, points.length - 1);

  for (const place of places) {
    if (consumedPlaces.has(place.id)) continue;
    const visit: DayVisit = {
      id: place.id,
      title: place.title,
      startTime: place.timestamp,
      endTime: place.timestamp,
      latitude: place.latitude,
      longitude: place.longitude,
      manual: true,
    };
    events.push({ kind: 'visit', timestamp: visit.startTime, visit });
  }

  return events.sort(
    (first, second) => first.timestamp.getTime() - second.timestamp.getTime()
  );
}

export function localDayBounds(date: Date): { start: Date; end: Date } {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
  };
}

export function metersBetween(
  first: Pick<RoutePoint, 'latitude' | 'longitude'>,
  second: Pick<RoutePoint, 'latitude' | 'longitude'>
): number {
  return distanceMeters(
    first.latitude,
    first.longitude,
    second.latitude,
    second.longitude
  );
}
