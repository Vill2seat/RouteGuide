const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

let fetchCalled = 0;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const constantsMock = {
  expoConfig: { extra: { routingEndpoint: 'https://valhalla1.openstreetmap.de/route' } },
};
const cryptoMock = { randomUUID: () => 'route-id' };
const diagnosticsMock = { recordDiagnostic: async () => {} };

function loadService() {
  const source = fs.readFileSync(path.join(__dirname, 'routeService.ts'), 'utf8');
  const javascript = ts.transpile(source, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  });
  const loadedModule = { exports: {} };
  vm.runInNewContext(javascript, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: specifier => {
      if (specifier === 'expo-constants') return { default: constantsMock };
      if (specifier === 'expo-crypto') return cryptoMock;
      if (specifier === './diagnostics') return diagnosticsMock;
      return require(specifier);
    },
    console,
  });
  return loadedModule.exports;
}

function reset() {
  fetchCalled = 0;
}

test('ROUTE-01: getRouteRecommendations с NaN координатами бросает ошибку assertCoordinate', async () => {
  reset();
  const { getRouteRecommendations } = loadService();

  await assert.rejects(
    getRouteRecommendations({ latitude: NaN, longitude: 0 }),
    /Проверьте координаты/
  );
});

test('ROUTE-02: getRouteRecommendations с Infinity координатами бросает ошибку', async () => {
  reset();
  const { getRouteRecommendations } = loadService();

  await assert.rejects(
    getRouteRecommendations({ latitude: 0, longitude: Infinity }),
    /Проверьте координаты/
  );
});

test('ROUTE-03: getRouteRecommendations с валидными координатами не падает на assertCoordinate', async () => {
  reset();
  const { getRouteRecommendations } = loadService();

  // Вызов с валидными координатами не должен вызвать ошибку валидации
  // (любая другая ошибка — сетевая, а не из assertCoordinate)
  let validationError = null;
  try {
    await getRouteRecommendations({ latitude: 55.7558, longitude: 37.6173 });
  } catch (error) {
    validationError = error;
  }
  if (validationError) {
    assert.ok(!/Проверьте координаты/.test(validationError.message), 'Ошибка не должна быть от валидации координат');
  }
  // Если ошибки нет вовсе — тоже нормально (fetch в тестовом окружении может быть недоступен)
});

