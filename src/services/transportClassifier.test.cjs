const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(
  new URL('./transportClassifier.ts', `file://${__dirname}/`),
  'utf8'
);
const javascript = ts.transpile(source, {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
});
const loadedModule = { exports: {} };
vm.runInNewContext(javascript, {
  module: loadedModule,
  exports: loadedModule.exports,
});
const { classifyTransport } = loadedModule.exports;

const observations = (speed, count = 5, accuracy = 8) =>
  Array.from({ length: count }, () => ({
    speedMetersPerSecond: speed,
    accuracyMeters: accuracy,
  }));

test('classifies a stable walking pace', () => {
  assert.equal(classifyTransport(observations(1.3)).mode, 'Пешком');
});

test('classifies a stable cycling pace', () => {
  assert.equal(classifyTransport(observations(5)).mode, 'Велосипед');
});

test('classifies faster movement only as motorized transport', () => {
  assert.equal(
    classifyTransport(observations(12)).mode,
    'Моторизованный транспорт'
  );
});

test('does not claim a mode from stationary or poor-accuracy samples', () => {
  assert.equal(classifyTransport(observations(0.2)), null);
  assert.equal(classifyTransport(observations(5, 5, 80)), null);
  assert.equal(classifyTransport(observations(5, 2)), null);
});
