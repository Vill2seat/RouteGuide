import Constants from 'expo-constants';
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
  pm25: number | null;
  majorRoadExposure: number | null;
  greenSpaceScore: number | null;
  qualityScore: number | null;
  scoreSource: string;
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

const ROUTING_ENDPOINT =
  Constants.expoConfig?.extra?.routingEndpoint ??
  'https://valhalla1.openstreetmap.de/route';
const OPEN_METEO_ENDPOINT =
  Constants.expoConfig?.extra?.airQualityEndpoint ??
  'https://air-quality-api.open-meteo.com/v1/air-quality';
const OVERPASS_ENDPOINT =
  Constants.expoConfig?.extra?.osmQueryEndpoint ??
  'https://overpass-api.de/api/interpreter';
const FETCH_TIMEOUT_MS = 15_000;

function assertCoordinate(point: Coordinate): void {
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

  while (index < encoded.length) {
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

    latitude += readDelta();
    longitude += readDelta();
    coordinates.push({
      latitude: latitude / 1_000_000,
      longitude: longitude / 1_000_000,
    });
  }
  return coordinates;
}

function sampleRoute(route: Coordinate[], maxSamples = 5): Coordinate[] {
  if (route.length <= maxSamples) return route;
  const samples: Coordinate[] = [];
  for (let index = 0; index < maxSamples; index += 1) {
    samples.push(route[Math.round((index * (route.length - 1)) / (maxSamples - 1))]);
  }
  return samples;
}

async function fetchWithTimeout(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRouteAlternatives(
  start: Coordinate,
  end: Coordinate
): Promise<RouteCandidate[]> {
  const response = await fetchWithTimeout(ROUTING_ENDPOINT, {
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

  return trips.map((trip, index) => {
    const legs = trip.legs ?? [];
    const summary = trip.summary ?? legs[0]?.summary;
    const shape = legs.flatMap(leg =>
      leg.shape ? decodePolyline6(leg.shape) : []
    );
    if (shape.length < 2 || !summary?.length || !summary.time) {
      throw new Error('Сервис вернул неполные данные маршрута.');
    }

    return {
      id: `route-option-${index + 1}`,
      coordinates: shape,
      distanceKm: summary.length,
      durationMinutes: summary.time / 60,
      pm25: null,
      majorRoadExposure: null,
      greenSpaceScore: null,
      qualityScore: null,
      scoreSource: 'Оценка среды загружается',
    };
  });
}

async function fetchAirQuality(
  route: Coordinate[]
): Promise<{ pm25: number | null; source: string }> {
  const samples = sampleRoute(route);
  const query = new URLSearchParams({
    latitude: samples.map(point => point.latitude.toFixed(5)).join(','),
    longitude: samples.map(point => point.longitude.toFixed(5)).join(','),
    hourly: 'pm2_5',
    forecast_days: '1',
    timezone: 'UTC',
  });
  const response = await fetchWithTimeout(`${OPEN_METEO_ENDPOINT}?${query}`);
  if (!response.ok) throw new Error(`Air quality API returned HTTP ${response.status}`);

  const result = (await response.json()) as
    | { hourly?: { time?: string[]; pm2_5?: Array<number | null> } }
    | Array<{ hourly?: { time?: string[]; pm2_5?: Array<number | null> } }>;
  const locations = Array.isArray(result) ? result : [result];
  const nowHour = new Date();
  nowHour.setUTCMinutes(0, 0, 0);
  const now = nowHour.getTime();
  const values: number[] = [];

  for (const location of locations) {
    const times = location.hourly?.time ?? [];
    const measurements = location.hourly?.pm2_5 ?? [];
    let nearestIndex = -1;
    let nearestDifference = Number.POSITIVE_INFINITY;
    for (let index = 0; index < times.length; index += 1) {
      const difference = Math.abs(Date.parse(`${times[index]}Z`) - now);
      if (difference < nearestDifference) {
        nearestDifference = difference;
        nearestIndex = index;
      }
    }
    const value = nearestIndex >= 0 ? measurements[nearestIndex] : null;
    if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
  }

  return {
    pm25: values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null,
    source: 'Open-Meteo: расчетная модель PM2.5, не измерение у дороги',
  };
}

async function fetchStreetProxy(
  route: Coordinate[]
): Promise<{ majorRoadExposure: number | null; greenSpaceScore: number | null }> {
  const samples = sampleRoute(route, 4);
  const aroundQueries = samples
    .map(
      point =>
        `way(around:80,${point.latitude},${point.longitude})["highway"~"^(motorway|trunk|primary|secondary)$"];`
    )
    .join('');
  const parkQueries = samples
    .map(
      point =>
        `nwr(around:120,${point.latitude},${point.longitude})["leisure"="park"];`
    )
    .join('');
  const query = `[out:json][timeout:12];(${aroundQueries}${parkQueries});out center tags;`;
  const response = await fetchWithTimeout(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'RouteGuide/0.1.0 (mobile app)',
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!response.ok) throw new Error(`OpenStreetMap Overpass returned HTTP ${response.status}`);

  const result = (await response.json()) as {
    elements?: Array<{
      tags?: { highway?: string; leisure?: string };
    }>;
  };
  const elements = result.elements ?? [];
  if (!elements.length) return { majorRoadExposure: null, greenSpaceScore: null };

  const majorRoads = elements.filter(element =>
    ['motorway', 'trunk', 'primary', 'secondary'].includes(
      element.tags?.highway ?? ''
    )
  ).length;
  const parks = elements.filter(element => element.tags?.leisure === 'park').length;
  return {
    majorRoadExposure: Math.min(1, majorRoads / samples.length),
    greenSpaceScore: Math.min(1, parks / samples.length),
  };
}

async function scoreRoute(candidate: RouteCandidate): Promise<RouteCandidate> {
  const [airResult, streetResult] = await Promise.allSettled([
    fetchAirQuality(candidate.coordinates),
    fetchStreetProxy(candidate.coordinates),
  ]);
  const air = airResult.status === 'fulfilled' ? airResult.value : null;
  const streets = streetResult.status === 'fulfilled' ? streetResult.value : null;
  if (airResult.status === 'rejected') {
    console.warn('Route PM2.5 data unavailable:', airResult.reason);
    await recordDiagnostic('warning', 'PM2.5 data provider request failed');
  }
  if (streetResult.status === 'rejected') {
    console.warn('Route road/park data unavailable:', streetResult.reason);
    await recordDiagnostic('warning', 'OpenStreetMap road/park data provider request failed');
  }
  const hasAir = air?.pm25 !== null && air?.pm25 !== undefined;
  const hasRoad = streets?.majorRoadExposure !== null && streets?.majorRoadExposure !== undefined;
  const hasParks = streets?.greenSpaceScore !== null && streets?.greenSpaceScore !== undefined;

  let score: number | null = null;
  if (hasAir || hasRoad || hasParks) {
    let weightedScore = 0;
    let totalWeight = 0;
    if (air && air.pm25 !== null) {
      weightedScore += Math.max(0, 100 - (air.pm25 / 35) * 100) * 0.6;
      totalWeight += 0.6;
    }
    if (streets && streets.majorRoadExposure !== null) {
      weightedScore += (1 - streets.majorRoadExposure) * 100 * 0.25;
      totalWeight += 0.25;
    }
    if (streets && streets.greenSpaceScore !== null) {
      weightedScore += streets.greenSpaceScore * 100 * 0.15;
      totalWeight += 0.15;
    }
    score = weightedScore / totalWeight;
  }

  const sources = [
    hasAir ? air.source : null,
    hasRoad || hasParks ? 'OSM: близость к дорогам/паркам — приблизительный прокси, не измерение шума' : null,
    airResult.status === 'rejected' ? 'Данные PM2.5 недоступны' : null,
    streetResult.status === 'rejected' ? 'Данные дорог/парков недоступны' : null,
  ].filter((source): source is string => source !== null);

  return {
    ...candidate,
    pm25: air?.pm25 ?? null,
    majorRoadExposure: streets?.majorRoadExposure ?? null,
    greenSpaceScore: streets?.greenSpaceScore ?? null,
    qualityScore: score,
    scoreSource: sources.length
      ? sources.join('; ')
      : 'Нет доступных данных о качестве среды для этого маршрута',
  };
}

export async function getRouteRecommendations(
  start: Coordinate,
  end: Coordinate
): Promise<RouteCandidate[]> {
  assertCoordinate(start);
  assertCoordinate(end);

  const candidates = await fetchRouteAlternatives(start, end);
  return Promise.all(candidates.map(scoreRoute));
}
