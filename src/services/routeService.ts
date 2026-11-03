import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { recordDiagnostic } from './diagnostics';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type RouteProfile = 'pedestrian' | 'bicycle';

export type RouteCandidate = {
  id: string;
  profile: RouteProfile;
  coordinates: Coordinate[];
  distanceKm: number;
  durationMinutes: number;
};

export type RouteCandidateComparison =
  | { status: 'fastest' }
  | { status: 'alternative'; minutesSlower: number }
  | { status: 'unknown' };

type ValhallaLeg = {
  shape?: string;
  summary?: { length?: number; time?: number };
};

type ValhallaTrip = {
  legs?: ValhallaLeg[];
  summary?: { length?: number; time?: number };
};

type ValhallaResponse = {
  trip?: ValhallaTrip;
  alternates?: Array<{ trip?: ValhallaTrip }>;
  error?: string;
  status_message?: string;
};

export function isRouteProfile(value: unknown): value is RouteProfile {
  return value === 'pedestrian' || value === 'bicycle';
}

export function getRouteProfileLabel(profile: RouteProfile): string {
  return profile === 'bicycle' ? 'На велосипеде' : 'Пешком';
}

const routingEndpoint =
  Constants.expoConfig?.extra?.routingEndpoint ??
  'https://valhalla1.openstreetmap.de/route';

type RouteCandidateGroup = {
  requestId: number;
  candidates: RouteCandidate[];
};

let currentRouteCandidateGroup: RouteCandidateGroup | null = null;
let currentRequestId = 0;

function getCurrentCandidates(): RouteCandidate[] {
  if (currentRouteCandidateGroup?.requestId !== currentRequestId) return [];
  return currentRouteCandidateGroup.candidates;
}

export function getRouteCandidateById(id: string): RouteCandidate | null {
  return getCurrentCandidates().find(candidate => candidate.id === id) ?? null;
}

export function getRouteCandidateGroupById(id: string): RouteCandidate[] {
  const candidates = getCurrentCandidates();
  return candidates.some(candidate => candidate.id === id) ? candidates : [];
}

export function getRouteCandidateComparison(
  candidate: RouteCandidate
): RouteCandidateComparison {
  const group = getRouteCandidateGroupById(candidate.id);
  const currentCandidate = group.find(item => item.id === candidate.id);
  if (!currentCandidate || currentCandidate.durationMinutes !== candidate.durationMinutes) {
    return { status: 'unknown' };
  }

  const fastestDuration = Math.min(...group.map(item => item.durationMinutes));
  if (currentCandidate.durationMinutes === fastestDuration) {
    return { status: 'fastest' };
  }
  return {
    status: 'alternative',
    minutesSlower: Math.max(0, Math.round(currentCandidate.durationMinutes - fastestDuration)),
  };
}

export function getCurrentRouteCandidates(): RouteCandidate[] {
  return getCurrentCandidates();
}

export function parseRouteCandidate(routeData: string, expectedId?: string): RouteCandidate {
  const parsed: unknown = JSON.parse(routeData);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('В сохранённом маршруте отсутствуют данные.');
  }
  const candidate = parsed as Partial<RouteCandidate>;
  const profile = candidate.profile ?? 'pedestrian';
  if (
    typeof candidate.id !== 'string' ||
    (expectedId !== undefined && candidate.id !== expectedId) ||
    !isRouteProfile(profile) ||
    !Array.isArray(candidate.coordinates) ||
    candidate.coordinates.length < 2 ||
    !candidate.coordinates.every(
      point =>
        point !== null &&
        typeof point === 'object' &&
        typeof point.latitude === 'number' &&
        Number.isFinite(point.latitude) &&
        Math.abs(point.latitude) <= 90 &&
        typeof point.longitude === 'number' &&
        Number.isFinite(point.longitude) &&
        Math.abs(point.longitude) <= 180
    ) ||
    typeof candidate.distanceKm !== 'number' ||
    !Number.isFinite(candidate.distanceKm) ||
    candidate.distanceKm < 0 ||
    typeof candidate.durationMinutes !== 'number' ||
    !Number.isFinite(candidate.durationMinutes) ||
    candidate.durationMinutes < 0
  ) {
    throw new Error('Сохранённый маршрут повреждён или неполон.');
  }
  return { ...candidate, profile } as RouteCandidate;
}

export function assertCoordinate(point: Coordinate): void {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    throw new Error('Проверьте координаты начала и конца маршрута.');
  }
}

function decodePolyline6(encoded: string): Coordinate[] {
  const coordinates: Coordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  const readDelta = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length || shift > 30) {
        throw new Error('Сервис вернул поврежденную геометрию маршрута.');
      }
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) {
        throw new Error('Сервис вернул некорректную геометрию маршрута.');
      }
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    latitude += readDelta();
    longitude += readDelta();
    coordinates.push({
      latitude: latitude / 1_000_000,
      longitude: longitude / 1_000_000,
    });
  }
  return coordinates;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRouteAlternatives(
  start: Coordinate,
  end: Coordinate,
  profile: RouteProfile
): Promise<RouteCandidate[]> {
  const response = await fetchWithTimeout(routingEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: [
        { lat: start.latitude, lon: start.longitude },
        { lat: end.latitude, lon: end.longitude },
      ],
      costing: profile,
      units: 'kilometers',
      alternates: 2,
    }),
  });
  if (!response.ok) {
    throw new Error(`Сервис маршрутов недоступен (HTTP ${response.status}).`);
  }

  const body = (await response.json()) as ValhallaResponse;
  if (!body.trip?.legs?.length) {
    throw new Error(body.error ?? body.status_message ?? 'Маршрут не найден.');
  }

  const trips = [body.trip, ...(body.alternates ?? []).map(item => item.trip)]
    .filter((trip): trip is ValhallaTrip => Boolean(trip?.legs?.length))
    .slice(0, 3);

  return trips.map(trip => {
    const legs = trip.legs ?? [];
    const summary = trip.summary ?? legs[0]?.summary;
    const coordinates = legs.flatMap(leg =>
      leg.shape ? decodePolyline6(leg.shape) : []
    );
    if (
      coordinates.length < 2 ||
      typeof summary?.length !== 'number' ||
      !Number.isFinite(summary.length) ||
      typeof summary.time !== 'number' ||
      !Number.isFinite(summary.time)
    ) {
      throw new Error('Сервис вернул неполные данные маршрута.');
    }

    return {
      id: randomUUID(),
      profile,
      coordinates,
      distanceKm: summary.length,
      durationMinutes: summary.time / 60,
    };
  });
}

export async function getRouteRecommendations(
  start: Coordinate,
  end: Coordinate,
  profile: RouteProfile = 'pedestrian'
): Promise<RouteCandidate[]> {
  assertCoordinate(start);
  assertCoordinate(end);
  if (!isRouteProfile(profile)) {
    throw new Error('Выбран неподдерживаемый профиль маршрута.');
  }

  currentRequestId += 1;
  const requestId = currentRequestId;
  currentRouteCandidateGroup = null;

  try {
    const candidates = await fetchRouteAlternatives(start, end, profile);
    if (currentRequestId === requestId) {
      currentRouteCandidateGroup = { requestId, candidates };
    }
    return candidates;
  } catch (error) {
    await recordDiagnostic('warning', 'Public route provider request failed');
    throw error;
  }
}
