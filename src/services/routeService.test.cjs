const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function loadRouteService() {
  const source = fs.readFileSync(path.join(__dirname, 'routeService.ts'), 'utf8');
  const javascript = ts.transpile(source, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  });
  const loadedModule = { exports: {} };
  const requests = [];
  let nextId = 0;
  vm.runInNewContext(javascript, {
    module: loadedModule,
    exports: loadedModule.exports,
    fetch: (url, init) => {
      const request = deferred();
      requests.push({ url, init, ...request });
      return request.promise;
    },
    setTimeout,
    clearTimeout,
    AbortController,
    require: specifier => {
      if (specifier === 'expo-constants') return { default: { expoConfig: null } };
      if (specifier === 'expo-crypto') return { randomUUID: () => `uuid-${++nextId}` };
      if (specifier === './diagnostics') return { recordDiagnostic: async () => {} };
      return require(specifier);
    },
  });
  return { ...loadedModule.exports, requests };
}

function encodePolyline6(points) {
  let previousLatitude = 0;
  let previousLongitude = 0;
  let encoded = '';

  const encodeValue = value => {
    let remaining = value < 0 ? ~(value << 1) : value << 1;
    let result = '';
    while (remaining >= 0x20) {
      result += String.fromCharCode((0x20 | (remaining & 0x1f)) + 63);
      remaining >>= 5;
    }
    return result + String.fromCharCode(remaining + 63);
  };

  for (const point of points) {
    const latitude = Math.round(point.latitude * 1_000_000);
    const longitude = Math.round(point.longitude * 1_000_000);
    encoded += encodeValue(latitude - previousLatitude);
    encoded += encodeValue(longitude - previousLongitude);
    previousLatitude = latitude;
    previousLongitude = longitude;
  }
  return encoded;
}

function makeRouteResponse(durationsSeconds) {
  const trips = durationsSeconds.map(duration => ({
    legs: [{
      shape: encodePolyline6([
        { latitude: 50.06, longitude: 19.94 },
        { latitude: 50.07, longitude: 19.95 },
      ]),
      summary: { length: 1.4, time: duration },
    }],
  }));
  return {
    ok: true,
    json: async () => ({
      trip: trips[0],
      alternates: trips.slice(1).map(trip => ({ trip })),
    }),
  };
}

function coordinates(offset = 0) {
  return [
    { latitude: 50 + offset, longitude: 19.9 },
    { latitude: 50.1 + offset, longitude: 20 },
  ];
}

test('parses a saved route when its identity and geometry are valid', () => {
  const { parseRouteCandidate } = loadRouteService();
  const route = {
    id: 'route-id',
    profile: 'bicycle',
    coordinates: [
      { latitude: 50.06, longitude: 19.94 },
      { latitude: 50.07, longitude: 19.95 },
    ],
    distanceKm: 1.4,
    durationMinutes: 21,
  };

  assert.deepEqual(
    JSON.parse(JSON.stringify(parseRouteCandidate(JSON.stringify(route), 'route-id'))),
    route
  );
});

test('defaults legacy saved routes without a profile to pedestrian', () => {
  const { parseRouteCandidate } = loadRouteService();
  const legacyRoute = {
    id: 'legacy-route',
    coordinates: [
      { latitude: 50.06, longitude: 19.94 },
      { latitude: 50.07, longitude: 19.95 },
    ],
    distanceKm: 1.4,
    durationMinutes: 21,
  };

  assert.equal(
    parseRouteCandidate(JSON.stringify(legacyRoute)).profile,
    'pedestrian'
  );
});

test('returns a consistent user-facing label for each route profile', () => {
  const { getRouteProfileLabel } = loadRouteService();

  assert.equal(getRouteProfileLabel('pedestrian'), 'Пешком');
  assert.equal(getRouteProfileLabel('bicycle'), 'На велосипеде');
});

test('rejects saved routes with mismatched ids or invalid coordinates', () => {
  const { parseRouteCandidate } = loadRouteService();
  const route = {
    id: 'route-id',
    coordinates: [
      { latitude: 95, longitude: 19.94 },
      { latitude: 50.07, longitude: 19.95 },
    ],
    distanceKm: 1.4,
    durationMinutes: 21,
  };

  assert.throws(() => parseRouteCandidate(JSON.stringify(route), 'other-id'));
  assert.throws(() => parseRouteCandidate(JSON.stringify(route), 'route-id'));
  assert.throws(() => parseRouteCandidate('{'));
});

test('returns every candidate belonging to the same search group', async () => {
  const service = loadRouteService();
  const resultPromise = service.getRouteRecommendations(...coordinates());
  service.requests[0].resolve(makeRouteResponse([600, 900, 1_200]));
  const candidates = await resultPromise;

  assert.equal(candidates.length, 3);
  assert.ok(candidates.every(candidate => !Object.hasOwn(candidate, 'groupId')));
  assert.deepEqual(
    JSON.parse(JSON.stringify(service.getRouteCandidateGroupById(candidates[1].id))),
    JSON.parse(JSON.stringify(candidates))
  );
});

test('defaults route searches to the pedestrian Valhalla costing', async () => {
  const service = loadRouteService();
  const resultPromise = service.getRouteRecommendations(...coordinates());
  const request = service.requests[0];
  assert.equal(JSON.parse(request.init.body).costing, 'pedestrian');

  request.resolve(makeRouteResponse([600]));
  const candidates = await resultPromise;
  assert.equal(candidates[0].profile, 'pedestrian');
});

test('uses bicycle costing and persists the profile with route candidates', async () => {
  const service = loadRouteService();
  const resultPromise = service.getRouteRecommendations(
    ...coordinates(),
    'bicycle'
  );
  const request = service.requests[0];
  assert.equal(JSON.parse(request.init.body).costing, 'bicycle');

  request.resolve(makeRouteResponse([600, 900]));
  const candidates = await resultPromise;
  assert.ok(candidates.every(candidate => candidate.profile === 'bicycle'));

  const saved = JSON.stringify(candidates[0]);
  assert.equal(service.parseRouteCandidate(saved, candidates[0].id).profile, 'bicycle');
});

test('switching profiles replaces, rather than mixes, current candidate groups', async () => {
  const service = loadRouteService();
  const pedestrianRequest = service.getRouteRecommendations(...coordinates());
  service.requests[0].resolve(makeRouteResponse([600, 900]));
  const pedestrianCandidates = await pedestrianRequest;

  const bicycleRequest = service.getRouteRecommendations(
    ...coordinates(),
    'bicycle'
  );
  service.requests[1].resolve(makeRouteResponse([700, 1_000]));
  const bicycleCandidates = await bicycleRequest;

  assert.equal(service.getRouteCandidateGroupById(pedestrianCandidates[0].id).length, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(service.getCurrentRouteCandidates())),
    JSON.parse(JSON.stringify(bicycleCandidates))
  );
  assert.ok(service.getCurrentRouteCandidates().every(candidate => candidate.profile === 'bicycle'));
});

test('an older successful request cannot replace a newer completed request', async () => {
  const service = loadRouteService();
  const oldRequest = service.getRouteRecommendations(...coordinates());
  const newRequest = service.getRouteRecommendations(...coordinates(1));

  service.requests[1].resolve(makeRouteResponse([900, 600]));
  const newestCandidates = await newRequest;
  service.requests[0].resolve(makeRouteResponse([300]));
  await oldRequest;

  assert.deepEqual(
    JSON.parse(JSON.stringify(service.getCurrentRouteCandidates())),
    JSON.parse(JSON.stringify(newestCandidates))
  );
});

test('an older failed request cannot clear a newer completed request', async () => {
  const service = loadRouteService();
  const oldRequest = service.getRouteRecommendations(...coordinates());
  const newRequest = service.getRouteRecommendations(...coordinates(1));

  service.requests[1].resolve(makeRouteResponse([900, 600]));
  const newestCandidates = await newRequest;
  service.requests[0].reject(new Error('old request failed'));
  await assert.rejects(oldRequest, /old request failed/);

  assert.deepEqual(
    JSON.parse(JSON.stringify(service.getCurrentRouteCandidates())),
    JSON.parse(JSON.stringify(newestCandidates))
  );
});

test('compares a route only when its current search group is available', async () => {
  const service = loadRouteService();
  const request = service.getRouteRecommendations(...coordinates());
  service.requests[0].resolve(makeRouteResponse([600, 900]));
  const candidates = await request;

  assert.deepEqual(
    JSON.parse(JSON.stringify(service.getRouteCandidateComparison(candidates[0]))),
    { status: 'fastest' }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(service.getRouteCandidateComparison(candidates[1]))),
    { status: 'alternative', minutesSlower: 5 }
  );
});

test('a saved route without its original group has an unknown comparison', () => {
  const { getRouteCandidateComparison, parseRouteCandidate } = loadRouteService();
  const savedRoute = parseRouteCandidate(JSON.stringify({
    id: 'saved-route',
    coordinates: [
      { latitude: 50.06, longitude: 19.94 },
      { latitude: 50.07, longitude: 19.95 },
    ],
    distanceKm: 1.4,
    durationMinutes: 10,
  }));

  assert.deepEqual(
    JSON.parse(JSON.stringify(getRouteCandidateComparison(savedRoute))),
    { status: 'unknown' }
  );
});
