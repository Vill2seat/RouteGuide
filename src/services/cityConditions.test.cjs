const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'cityConditions.ts'), 'utf8');
const javascript = ts.transpile(source, {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
});
const requestedUrls = [];
const now = new Date();
const currentHour = `${now.toISOString().slice(0, 13)}:00`;
const fetchMock = async url => {
  requestedUrls.push(String(url));
  const isAir = String(url).includes('air-quality');
  return {
    ok: true,
    json: async () =>
      isAir
        ? { hourly: { time: [currentHour], pm2_5: [12] } }
        : {
            current: {
              time: currentHour,
              temperature_2m: 14,
              precipitation: 0,
              wind_speed_10m: 6,
              wind_direction_10m: 270,
              weather_code: 61,
              precipitation_probability: 70,
              cloud_cover: 95,
            },
          },
  };
};
const loadedModule = { exports: {} };
vm.runInNewContext(javascript, {
  module: loadedModule,
  exports: loadedModule.exports,
  require: specifier => {
    if (specifier === 'expo-constants') {
      return { default: { expoConfig: { extra: {} } } };
    }
    return require(specifier);
  },
  fetch: fetchMock,
  URLSearchParams,
  AbortController,
  setTimeout,
  clearTimeout,
  Date,
});
const {
  getCityConditions,
  getCompassDirection,
  getSunAzimuth,
  getWeatherDescription,
  getWindTravelBearing,
} = loadedModule.exports;

test('requests city-level pollution and weather using rounded coordinates', async () => {
  const conditions = await getCityConditions({
    latitude: 50.04,
    longitude: 19.06,
  });

  assert.equal(requestedUrls.length, 2);
  assert.ok(requestedUrls.every(url => url.includes('latitude=50')));
  assert.ok(requestedUrls.every(url => url.includes('longitude=19.1')));
  assert.equal(conditions.pm25.value, 12);
  assert.equal(conditions.temperature.value, 14);
  assert.equal(
    conditions.temperature.updatedAt?.toISOString(),
    new Date(`${currentHour}:00Z`).toISOString()
  );
  assert.equal(conditions.precipitation.value, 0);
  assert.equal(conditions.windDirection.value, 270);
  assert.equal(conditions.weatherCode, 61);
  assert.equal(conditions.precipitationProbability, 70);
  assert.equal(conditions.cloudCover, 95);
  assert.match(requestedUrls[1], /wind_direction_10m/);
  assert.match(requestedUrls[1], /weather_code/);
  assert.equal(conditions.traffic.available, false);
  assert.equal(conditions.pm25.stale, false);
});

test('reuses recent cached conditions for the same rounded city', async () => {
  const before = requestedUrls.length;
  const result = await getCityConditions({
    latitude: 50.03,
    longitude: 19.06,
  });

  assert.equal(requestedUrls.length, before);
  assert.equal(result.pm25.value, 12);
});

test('does not reuse cached weather across different rounded locations', async () => {
  const before = requestedUrls.length;
  const result = await getCityConditions({
    latitude: 50.14,
    longitude: 19.24,
  });

  assert.equal(requestedUrls.length, before + 2);
  assert.ok(requestedUrls.slice(-2).every(url => url.includes('latitude=50.1')));
  assert.ok(requestedUrls.slice(-2).every(url => url.includes('longitude=19.2')));
  assert.equal(result.windDirection.value, 270);
});

test('uses the direction the wind travels toward, not the meteorological from direction', () => {
  assert.equal(getWindTravelBearing(270), 90);
  assert.equal(getWindTravelBearing(0), 180);
  assert.equal(getCompassDirection(90), 'В');
  assert.equal(getCompassDirection(null), null);
});

test('calculates the sun azimuth and hides the ray when the sun is below the horizon', () => {
  const midday = getSunAzimuth(new Date('2026-06-21T12:00:00Z'), 50, 0);
  assert.ok(midday !== null && midday > 150 && midday < 210);
  assert.equal(getSunAzimuth(new Date('2026-12-21T00:00:00Z'), 0, 0), null);
});

test('maps weather codes to user-facing current conditions', () => {
  const rain = getWeatherDescription(61, 0);
  assert.equal(rain.label, 'Дождь');
  assert.equal(rain.icon, '🌧');
  const clear = getWeatherDescription(0, 0);
  assert.equal(clear.label, 'Ясно');
  assert.equal(clear.icon, '☀');
  const precipitation = getWeatherDescription(null, 0.4);
  assert.equal(precipitation.label, 'Осадки');
  assert.equal(precipitation.icon, '🌧');
});
