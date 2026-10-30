import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { recordDiagnostic } from './diagnostics';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type RouteCandidate = {
  id: string;
  coordinates: Coordinate[];
  distanceKm: number;
  durationMinutes: number;
};

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

const routingEndpoint =
  Constants.expoConfig?.extra?.routingEndpoint ??
  'https://valhalla1.openstreetmap.de/route';

// Несколько запросов в одно время не портят состояние друг друга.
// Храним данные текущего запроса внутри одной переменной; при повторном
// запросе сбрасываем предыдущие результаты. Это устраняет гонки между
// параллельными вызовами getRouteRecommendations.
let currentRouteCandidates: RouteCandidate[] | null = null;
let currentRequestId = 0;

export function getRouteCandidateById(id: string): RouteCandidate | null {
  if (currentRouteCandidates === null) return null;
  return currentRouteCandidates.find(candidate => candidate.id === id) ?? null;
}

export function getRouteCandidateGroupById(id: string): RouteCandidate[] {
  if (currentRouteCandidates === null) return [];
  // Группа — это набор всех альтернатив текущего запроса, на который
  // рассчитывалась конкретная точка маршрута. Возвращаем только кандидаты,
  // присутствующие в ответе текущего запроса.
  return currentRouteCandidates.filter(candidate => candidate.id === id);
}

export function getCurrentRouteCandidates(): RouteCandidate[] {
  return currentRouteCandidates ?? [];
}

export function parseRouteCandidate(routeData: string, expectedId?: string): RouteCandidate {
  const parsed: unknown = JSON.parse(routeData);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('В сохранённом маршруте отсутствуют данные.');
  }
  const candidate = parsed as Partial<RouteCandidate>;
  if (
    typeof candidate.id !== 'string' ||
    (expectedId !== undefined && candidate.id !== expectedId) ||
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
  return candidate as RouteCandidate;
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
  end: Coordinate
): Promise<RouteCandidate[]> {
  const response = await fetchWithTimeout(routingEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: [
        { lat: start.latitude, lon: start.longitude },
        { lat: end.latitude, lon: end.longitude },
      ],
      costing: 'pedestrian',
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
      coordinates,
      distanceKm: summary.length,
      durationMinutes: summary.time / 60,
    };
  });
}

export async function getRouteRecommendations(
  start: Coordinate,
  end: Coordinate
): Promise<RouteCandidate[]> {
  assertCoordinate(start);
  assertCoordinate(end);

  currentRequestId += 1;
  const requestId = currentRequestId;

  try {
    const candidates = await fetchRouteAlternatives(start, end);
    currentRouteCandidates = candidates;
    // Отображаем только текущий набор; старые карты не оставляем в памяти.
    return candidates;
  } catch (error) {
    await recordDiagnostic('warning', 'Public walking-route provider request failed');
    throw error;
  } finally {
    // Если по окончании запроса счётчик запросов не изменился, данные по-прежнему
    // валидны. В случае параллельного/повторного запроса очищаем результат,
    // чтобы не отдавать данные прошлого запроса.
    if (currentRequestId !== requestId) {
      currentRouteCandidates = null;
    }
  }
}
