---
name: data-engineering-api-reliability
description: "Use when adding or reviewing external APIs, provider adapters, data formats, caching, freshness, rate limits, retries, offline fallback, coordinate/time validation or source provenance for Road Guide."
---

# Data Engineering and API Reliability

## Goal

Make external data bounded, validated, source-attributed and safe to fail. Do not let a provider outage or partial response produce a plausible-looking but false environmental conclusion.

## Road Guide Baseline

Read [external sources](../../../docs/ai/EXTERNAL_DATA_SOURCES.md), [environmental intelligence](../../../docs/ai/ENVIRONMENTAL_INTELLIGENCE.md), [GPS/storage](../../../docs/ai/GPS_HISTORY_AND_STORAGE.md) and [audit](../../../docs/ai/IMPLEMENTATION_AUDIT.md). Current outbound boundaries are platform geocoding, public Valhalla route requests, Open-Meteo area requests and OpenFreeMap tile/style calls. Services currently use `fetch`, timeouts and limited in-memory cache; there is no server-side provider layer or durable environment cache.

## Procedure

1. Identify what data leaves the device, exact/rounded precision, user consent, provider recipient, retention policy and whether the endpoint needs a privileged key. Mobile bundles are public; never ship a private API secret in JS/native resources.
2. Read current provider docs/terms, schema, rate limits, license, attribution, commercial use, caching rights, coverage, date/units and endpoint version. Record the date of the decision.
3. Define a typed boundary contract before mapping provider JSON into UI. Validate HTTP status, content type, required fields, finite numbers, coordinate ranges, timestamp format/time zone, units and response size.
4. Use a request timeout and cancellation strategy. Retry only transient failures with bounded backoff and jitter; avoid retry loops on 4xx/consent/validation errors. Make overlapping requests safe with request IDs or per-query cancellation.
5. Design cache keys from all material inputs: rounded coordinates, provider/model, metric set, valid time and profile. Bound memory/disk size and TTL. Mark stale values explicitly and never present retrieval time as observation time.
6. Handle partial responses field-by-field. Preserve source/valid-time metadata. If data are absent, represent `null`/unknown with a reason; do not substitute 0, last known value without stale marking, or a fabricated default.
7. Make offline behavior explicit per feature: local history can work offline; map tiles, route search and current provider data may not. Cache only where provider license permits.
8. Protect privacy: avoid exact coordinates unless the task needs them; use the documented rounded city coordinate when area data suffice; no route points in diagnostics; show provider disclosure before exact route transmission.
9. Add fixture-driven tests for valid, empty, malformed, partial, timeout, non-2xx, stale cache, cache-key separation, invalid time/units and out-of-order responses.
10. Review real provider availability/terms before release. Public endpoint success in a mock or one curl call is not a service-level guarantee.

## Data Quality Contract

Keep at least: `value`, `unit`, `source`, `retrievedAt`, `validAt` or interval, `spatialSupport`, `resolution`, `method/modelVersion`, `stale`, `quality/uncertainty` and license/attribution. Validate units before combining providers. Preserve raw provenance separately from derived calculations.

## Validation Checklist

- Consent and transmitted data match user-visible disclosure.
- No secret key is embedded in the mobile client.
- Invalid coordinates, timestamps and numeric payloads fail safely.
- Timeout, cancellation, rate limits and partial outage have explicit UI states.
- Cache is bounded, correctly keyed and marks stale data.
- No-data is distinct from numeric zero.
- Provider data are within coverage, time and spatial resolution for the feature.
- Terms, attribution, retention, cost and commercial use are current.

## References

- [Open-Meteo terms](https://open-meteo.com/en/terms)
- [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- [Copernicus ADS](https://ads.atmosphere.copernicus.eu/)
- [RFC 3339 timestamps](https://www.rfc-editor.org/rfc/rfc3339)
- [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/)
