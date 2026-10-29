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
const { getCityConditions } = loadedModule.exports;

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
  assert.equal(conditions.precipitation.value, 0);
  assert.equal(conditions.traffic.available, false);
  assert.equal(conditions.pm25.stale, false);
});

test('reuses recent cached conditions for the same rounded city', async () => {
  const before = requestedUrls.length;
  const result = await getCityConditions({
    latitude: 50.03,
    longitude: 19.04,
  });

  assert.equal(requestedUrls.length, before);
  assert.equal(result.pm25.value, 12);
});
