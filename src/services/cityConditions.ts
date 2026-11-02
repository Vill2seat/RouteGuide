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
  windDirection: CityConditionValue;
  weatherCode: number | null;
  precipitationProbability: number | null;
  cloudCover: number | null;
  fetchedAt: Date;
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
const cacheDurationMs = 30 * 60 * 1000;
const timeoutMs = 12_000;
const cache = new Map<string, CacheEntry>();

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
  const updatedAt =
    typeof time === 'string'
      ? new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(time) ? time : `${time}Z`)
      : null;
  return {
    value: typeof value === 'number' && Number.isFinite(value) ? value : null,
    updatedAt: updatedAt && Number.isFinite(updatedAt.getTime()) ? updatedAt : null,
  };
}

function currentNumber(source: unknown, field: string): number | null {
  if (!source || typeof source !== 'object') return null;
  const value = (source as { current?: Record<string, unknown> }).current?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getWeatherDescription(
  code: number | null,
  precipitationMm: number | null
): { label: string; icon: string } {
  if (code === null) {
    return precipitationMm !== null && precipitationMm > 0
      ? { label: 'Осадки', icon: '🌧' }
      : { label: 'Нет описания', icon: '☁' };
  }
  if (code === 0) return { label: 'Ясно', icon: '☀' };
  if (code === 1) return { label: 'Преимущественно ясно', icon: '🌤' };
  if (code === 2) return { label: 'Переменная облачность', icon: '⛅' };
  if (code === 3) return { label: 'Облачно', icon: '☁' };
  if (code === 45 || code === 48) return { label: 'Туман', icon: '🌫' };
  if ([51, 53, 55, 56, 57].includes(code)) {
    return { label: 'Морось', icon: '🌦' };
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { label: 'Дождь', icon: '🌧' };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { label: 'Снег', icon: '❄' };
  }
  if ([95, 96, 99].includes(code)) {
    return { label: 'Гроза', icon: '⛈' };
  }
  return { label: 'Переменная погода', icon: '☁' };
}

export function getWindTravelBearing(windFromDegrees: number | null): number | null {
  if (windFromDegrees === null || !Number.isFinite(windFromDegrees)) return null;
  return (windFromDegrees + 180) % 360;
}

export function getCompassDirection(bearingDegrees: number | null): string | null {
  if (bearingDegrees === null || !Number.isFinite(bearingDegrees)) return null;
  const directions = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  return directions[Math.round(((bearingDegrees % 360) + 360) % 360 / 45) % 8];
}

export function getSunAzimuth(
  date: Date,
  latitude: number,
  longitude: number
): number | null {
  if (
    !Number.isFinite(date.getTime()) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ) - yearStart) / 86_400_000);
  const hour =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3_600;
  const angle = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(angle) -
      0.032077 * Math.sin(angle) -
      0.014615 * Math.cos(2 * angle) -
      0.040849 * Math.sin(2 * angle));
  const declination =
    0.006918 -
    0.399912 * Math.cos(angle) +
    0.070257 * Math.sin(angle) -
    0.006758 * Math.cos(2 * angle) +
    0.000907 * Math.sin(2 * angle) -
    0.002697 * Math.cos(3 * angle) +
    0.00148 * Math.sin(3 * angle);
  const solarMinutes = hour * 60 + equationOfTime + 4 * longitude;
  const hourAngle = (solarMinutes / 4 - 180) * Math.PI / 180;
  const latitudeRadians = latitude * Math.PI / 180;
  const elevationSine =
    Math.sin(latitudeRadians) * Math.sin(declination) +
    Math.cos(latitudeRadians) * Math.cos(declination) * Math.cos(hourAngle);
  if (elevationSine <= 0) return null;

  const azimuth =
    Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(latitudeRadians) -
        Math.tan(declination) * Math.cos(latitudeRadians)
    ) *
      180 /
      Math.PI +
    180;
  return (azimuth + 360) % 360;
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

  const latitude = roundedCityCoordinate(location.latitude);
  const longitude = roundedCityCoordinate(location.longitude);
  const cacheKey = `${latitude},${longitude}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < cacheDurationMs) return cached.value;
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
    'temperature_2m,apparent_temperature,precipitation,rain,showers,snowfall,precipitation_probability,weather_code,cloud_cover,is_day,wind_speed_10m,wind_direction_10m'
  );
  const results = await Promise.allSettled([
    fetchJson(`${airEndpoint}?${airParams}`),
    fetchJson(`${weatherEndpoint}?${weatherParams}`),
  ]);
  const air =
    results[0].status === 'fulfilled'
      ? airValue(results[0].value)
      : cached
        ? cached.value.pm25
        : null;
  const weather =
    results[1].status === 'fulfilled'
      ? results[1].value
      : null;
  const cachedTemperature =
    results[1].status === 'rejected' && cached
      ? cached.value.temperature
      : null;
  const cachedPrecipitation =
    results[1].status === 'rejected' && cached
      ? cached.value.precipitation
      : null;
  const cachedWind =
    results[1].status === 'rejected' && cached
      ? cached.value.windSpeed
      : null;
  const cachedWindDirection =
    results[1].status === 'rejected' && cached
      ? cached.value.windDirection
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
  const windDirection = weather
    ? currentValue(weather, 'wind_direction_10m')
    : cachedWindDirection;

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
    windDirection: {
      value: windDirection?.value ?? null,
      updatedAt: windDirection?.updatedAt ?? null,
      unit: '°',
      source: 'Open-Meteo · направление, откуда дует ветер',
      stale: results[1].status === 'rejected' && cachedWindDirection !== null,
    },
    weatherCode: weather
      ? currentNumber(weather, 'weather_code')
      : cached?.value.weatherCode ?? null,
    precipitationProbability: weather
      ? currentNumber(weather, 'precipitation_probability')
      : cached?.value.precipitationProbability ?? null,
    cloudCover: weather
      ? currentNumber(weather, 'cloud_cover')
      : cached?.value.cloudCover ?? null,
    fetchedAt: new Date(),
    traffic: {
      available: false,
      source: 'Достоверный бесплатный источник данных о пробках не подключён',
    },
  };

  if (results.every(result => result.status === 'rejected')) {
    if (cached) {
      return {
        ...cached.value,
        pm25: { ...cached.value.pm25, stale: true },
        temperature: { ...cached.value.temperature, stale: true },
        precipitation: { ...cached.value.precipitation, stale: true },
        windSpeed: { ...cached.value.windSpeed, stale: true },
        windDirection: { ...cached.value.windDirection, stale: true },
      };
    }
    throw new Error('Не удалось получить данные о воздухе и погоде.');
  }

  cache.set(cacheKey, { key: cacheKey, fetchedAt: Date.now(), value });
  if (cache.size > 12) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  return value;
}
