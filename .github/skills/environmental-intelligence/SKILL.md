---
name: environmental-intelligence
description: "Use when evaluating air quality, PM2.5/PM10/NO2/O3/SO2/CO, AQI, weather, wind, noise, traffic, parks, green cover, industrial sources, exposure or environmental route scoring in Road Guide."
---

# Environmental Intelligence

## Goal

Represent what a source can support, where and when it applies, how uncertain it is, and what the user may safely conclude. Prefer an honest unknown to fabricated precision.

## Road Guide Baseline

Read [environmental intelligence](../../../docs/ai/ENVIRONMENTAL_INTELLIGENCE.md), [external sources](../../../docs/ai/EXTERNAL_DATA_SOURCES.md), [product guardrails](../../../docs/ai/PRODUCT_AND_REQUIREMENTS.md) and [audit](../../../docs/ai/IMPLEMENTATION_AUDIT.md). `src/services/cityConditions.ts` fetches hourly modelled PM2.5 and current Open-Meteo weather at coordinates rounded to 0.1 degrees, caches in memory and labels the values area-level. It does not read other pollutants or rank route segments. Noise and traffic data are unavailable.

## Procedure

1. Name the user-facing decision: weather comfort, air context, route exposure proxy, noise context or green-space proximity. These are different outcomes; do not combine them under an undefined “health score.”
2. For every provider, verify product docs, geography, spatial support, time step, historical/forecast availability, authentication, rate limits, license, attribution, retention and commercial terms for the actual launch market.
3. Store provenance with the raw value: metric, unit, source, geometry/support, observed/forecast status, valid time, retrieval time, resolution, method/model version, quality, uncertainty and license.
4. Preserve source-specific concentration values. AQI uses jurisdiction-specific breakpoints and averaging periods; store the scale/version and do not compare unlike AQIs as if they were physical concentrations.
5. Align environmental valid time with estimated segment travel time. A city-grid current value is not a historical condition at the time of a past trip. Wind direction is meteorological “from”; reverse only when drawing a downwind bearing, not when inferring concentration.
6. Distinguish direct measurement, gridded model, forecast, official strategic map and proxy. OSM major-road proximity is not dB or traffic count; a park polygon is not measured canopy or air purification.
7. For a route exposure proxy, segment geometry and estimate residence time explicitly. A concentration-time sum is not inhaled personal dose. Do not average decibels arithmetically; account for logarithmic energy aggregation and valid time support.
8. Preserve `missing`, `stale`, `out-of-coverage`, `low-resolution` and `invalid` states. Never map these to zero, “clean,” or a confident rank.
9. Build pure deterministic calculations with unit conversion, time-window, missingness and uncertainty tests. Version any score and expose factor contributions.
10. Validate a pilot against suitable local observations/official sources. Report station-to-route distance, temporal mismatch, resolution and error; withhold recommendations when claimed change is smaller than uncertainty.

## Source Choices

- Open-Meteo: current disclosed area-level prototype; repo documents free API non-commercial use and CC BY 4.0, so re-check terms before commercial distribution.
- CAMS: candidate for broader gridded atmospheric data; product resolution/authentication/coverage vary and it is not curbside measurement.
- EEA/national noise maps: potential periodic modelled context where covered, not live sidewalk noise.
- OSM parks/land use: mapped proximity/context, not quantified canopy or exposure reduction.

## Validation Checklist

- Units and averaging periods are explicit and compatible.
- Retrieval time and valid time are not conflated.
- Geographic/time support covers the route segment and trip time.
- Data source and model version are user-visible or inspectable.
- Partial failure and cached stale values stay visibly stale.
- No medical, “clean air” or dB claim exceeds evidence.
- Score reproducibility and missing-data behavior are unit-tested.
- Provider license, consent, request privacy and commercial use are checked.

## Primary References

- [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- [Open-Meteo terms](https://open-meteo.com/en/terms)
- [Copernicus Atmosphere Data Store](https://ads.atmosphere.copernicus.eu/)
- [EEA Environmental Noise](https://noise.eea.europa.eu/)
- [WHO Global Air Quality Guidelines](https://www.who.int/publications/i/item/9789240034228)
