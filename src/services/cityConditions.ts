import Constants from 'expo-constants';
import type { Coordinate } from './routeService';

export type CityConditionValue = {
  value: number | null;
  unit: string;
  updatedAt: Date | null;
  source: string;
  stale: boolean;
};

export type CityConditions = {
  pm25: CityConditionValue;
  temperature: CityConditionValue;
  precipitation: CityConditionValue;
  windSpeed: CityConditionValue;
  traffic: {
    available: false;
    source: string;
  };
};

type CacheEntry = { key: string; fetchedAt: number; value: CityConditions };

const airEndpoint =
  Constants.expoConfig?.extra?.airQualityEndpoint ??
  'https://air-quality-api.open-meteo.com/v1/air-quality';
const weatherEndpoint =
  Constants.expoConfig?.extra?.weatherEndpoint ??
  'https://api.open-meteo.com/v1/forecast';
const cacheDurationMs = 20 * 60 * 1000;
const timeoutMs = 12_000;
let cached: CacheEntry | null = null;

function roundedCityCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`City conditions API returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function currentValue(
  source: unknown,
  field: string
): { value: number | null; updatedAt: Date | null } {
  if (!source || typeof source !== 'object') return { value: null, updatedAt: null };
  const current = (source as { current?: Record<string, unknown> }).current;
  const value = current?.[field];
  const time = current?.time;
  return {
    value: typeof value === 'number' && Number.isFinite(value) ? value : null,
    updatedAt: typeof time === 'string' ? new Date(time) : null,
  };
}

function airValue(
  source: unknown
): { value: number | null; updatedAt: Date | null } {
  if (!source || typeof source !== 'object') return { value: null, updatedAt: null };
  const hourly = (source as {
    hourly?: { time?: unknown[]; pm2_5?: unknown[] };
  }).hourly;
  const times = hourly?.time ?? [];
  const values = hourly?.pm2_5 ?? [];
  const index = times.findIndex(
    value => typeof value === 'string' && !Number.isNaN(Date.parse(`${value}Z`))
  );
  if (index < 0 || typeof times[index] !== 'string') {
    return { value: null, updatedAt: null };
  }
  const currentHour = new Date();
  currentHour.setUTCMinutes(0, 0, 0);
  let nearest = -1;
  let difference = Number.POSITIVE_INFINITY;
  for (let position = 0; position < times.length; position += 1) {
    if (typeof times[position] !== 'string') continue;
    const delta = Math.abs(Date.parse(`${times[position]}Z`) - currentHour.getTime());
    if (delta < difference) {
      difference = delta;
      nearest = position;
    }
  }
  const value = nearest >= 0 ? values[nearest] : null;
  return {
    value: typeof value === 'number' && Number.isFinite(value) ? value : null,
    updatedAt:
      nearest >= 0 && typeof times[nearest] === 'string'
        ? new Date(`${times[nearest]}Z`)
        : null,
  };
}

export async function getCityConditions(location: Coordinate): Promise<CityConditions> {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    throw new Error('Для данных о погоде и воздухе нужны корректные координаты.');
  }
  if (cached && Date.now() - cached.fetchedAt < cacheDurationMs) return cached.value;

  const latitude = roundedCityCoordinate(location.latitude);
  const longitude = roundedCityCoordinate(location.longitude);
  const cacheKey = `${latitude},${longitude}`;
  if (
    cached?.key === cacheKey &&
    Date.now() - cached.fetchedAt < cacheDurationMs
  ) {
    return cached.value;
  }
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: 'UTC',
  });
  const airParams = new URLSearchParams(params);
  airParams.set('hourly', 'pm2_5');
  airParams.set('forecast_days', '1');
  const weatherParams = new URLSearchParams(params);
  weatherParams.set(
    'current',
    'temperature_2m,precipitation,wind_speed_10m'
  );
  const results = await Promise.allSettled([
    fetchJson(`${airEndpoint}?${airParams}`),
    fetchJson(`${weatherEndpoint}?${weatherParams}`),
  ]);
  const air =
    results[0].status === 'fulfilled'
      ? airValue(results[0].value)
      : cached?.key === cacheKey
        ? cached.value.pm25
        : null;
  const weather =
    results[1].status === 'fulfilled'
      ? results[1].value
      : null;
  const cachedTemperature =
    results[1].status === 'rejected' && cached?.key === cacheKey
      ? cached.value.temperature
      : null;
  const cachedPrecipitation =
    results[1].status === 'rejected' && cached?.key === cacheKey
      ? cached.value.precipitation
      : null;
  const cachedWind =
    results[1].status === 'rejected' && cached?.key === cacheKey
      ? cached.value.windSpeed
      : null;
  const temperature = weather
    ? currentValue(weather, 'temperature_2m')
    : cachedTemperature;
  const precipitation = weather
    ? currentValue(weather, 'precipitation')
    : cachedPrecipitation;
  const wind = weather
    ? currentValue(weather, 'wind_speed_10m')
    : cachedWind;

  const value: CityConditions = {
    pm25: {
      value: air?.value ?? null,
      updatedAt: air?.updatedAt ?? null,
      unit: 'мкг/м³',
      source: 'Open-Meteo · модель по району, не измерение у дороги',
      stale: results[0].status === 'rejected' && air !== null,
    },
    temperature: {
      value: temperature?.value ?? null,
      updatedAt: temperature?.updatedAt ?? null,
      unit: '°C',
      source: 'Open-Meteo · текущая погода',
      stale: results[1].status === 'rejected' && cachedTemperature !== null,
    },
    precipitation: {
      value: precipitation?.value ?? null,
      updatedAt: precipitation?.updatedAt ?? null,
      unit: 'мм',
      source: 'Open-Meteo · текущая погода',
      stale: results[1].status === 'rejected' && cachedPrecipitation !== null,
    },
    windSpeed: {
      value: wind?.value ?? null,
      updatedAt: wind?.updatedAt ?? null,
      unit: 'км/ч',
      source: 'Open-Meteo · текущая погода',
      stale: results[1].status === 'rejected' && cachedWind !== null,
    },
    traffic: {
      available: false,
      source: 'Достоверный бесплатный источник данных о пробках не подключён',
    },
  };

  if (results.every(result => result.status === 'rejected')) {
    if (cached?.key === cacheKey) {
      return {
        ...cached.value,
        pm25: { ...cached.value.pm25, stale: true },
        temperature: { ...cached.value.temperature, stale: true },
        precipitation: { ...cached.value.precipitation, stale: true },
        windSpeed: { ...cached.value.windSpeed, stale: true },
      };
    }
    throw new Error('Не удалось получить данные о воздухе и погоде.');
  }

  cached = { key: cacheKey, fetchedAt: Date.now(), value };
  return value;
}
