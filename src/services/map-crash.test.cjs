const { test } = require('node:test');
const assert = require('node:assert/strict');

// === Тест 1: assertCoordinate от routeService должен отсеивать невалидные координаты ===

function assertCoordinate(point) {
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

test('MAP-CRASH-01: NaN latitude вызывает ошибку (не должно попасть в MapLibre)', () => {
  assert.throws(() => assertCoordinate({ latitude: NaN, longitude: 0 }), /Проверьте координаты/);
});

test('MAP-CRASH-02: Infinity longitude вызывает ошибку', () => {
  assert.throws(() => assertCoordinate({ latitude: 0, longitude: Infinity }), /Проверьте координаты/);
});

test('MAP-CRASH-03: latitude > 90 вызывает ошибку', () => {
  assert.throws(() => assertCoordinate({ latitude: 91, longitude: 0 }), /Проверьте координаты/);
});

test('MAP-CRASH-04: longitude < -180 вызывает ошибку', () => {
  assert.throws(() => assertCoordinate({ latitude: 0, longitude: -181 }), /Проверьте координаты/);
});

test('MAP-CRASH-05: валидные координаты проходят валидацию', () => {
  assert.doesNotThrow(() => assertCoordinate({ latitude: 55.7558, longitude: 37.6173 }));
  assert.doesNotThrow(() => assertCoordinate({ latitude: -90, longitude: -180 }));
  assert.doesNotThrow(() => assertCoordinate({ latitude: 90, longitude: 180 }));
});

test('MAP-CRASH-06: null coordinates не проходят Number.isFinite', () => {
  assert.throws(() => assertCoordinate({ latitude: null, longitude: 0 }), /Проверьте координаты/);
});

test('MAP-CRASH-07: undefined latitude не проходит Number.isFinite', () => {
  assert.throws(() => assertCoordinate({ latitude: undefined, longitude: 0 }), /Проверьте координаты/);
});
