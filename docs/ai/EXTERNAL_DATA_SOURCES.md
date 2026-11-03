# External Data Sources and Technical References

Snapshot date: 2026-11-03. Links below point to primary documentation or source portals. Pricing, coverage, quotas, license text, terms and API behavior can change; verify the exact selected plan and launch market before release. “Free/open” does not mean unlimited, SLA-backed, commercially unrestricted or privacy-neutral.

## Providers and Geospatial Sources

| Source | What it provides / Road Guide use | Limits, key and cost | License/Android fit | Recommendation |
|---|---|---|---|---|
| [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright), [OSM Wiki](https://wiki.openstreetmap.org/) | Editable roads, paths, access, land use and POIs; basis for map/routing data | No API key for the database itself. Tag coverage and edits vary by region. ODbL attribution and obligations for derivative databases matter | Data is platform-agnostic; attribution must be visible in map UI. Tiles are a separate service | Use as a data source, not as ground truth for noise/air/traffic |
| [OpenFreeMap](https://openfreemap.org/) | Public vector tiles/styles; current MapLibre basemap | Current project docs say public service/no SLA and no key. Tile/style URLs, cache policy and capacity remain provider-controlled | Native MapLibre integration already present; honor attribution and service terms | Good prototype/default for MVP; assess/self-host or choose SLA provider for release |
| [Overpass API](https://dev.overpass-api.de/overpass-doc/en/) | Read/query OSM objects by tags and area | Shared instances have resource/rate limits; generally no API key; not a production mobile query guarantee | Results can be consumed on Android but must follow OSM license/attribution | Use for bounded research/data prep, not repeated broad client queries |
| [Valhalla API](https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/) | OSM-based routing profiles, directions and alternatives; existing pedestrian request | Public demo endpoint in the repo has no SLA and can rate-limit; no key for current public endpoint. A managed host may require credentials/payment; self-hosting costs operations | API works from a mobile client, but direct requests expose endpoints/coordinates to provider; embedded routing is more involved | Keep current adapter for prototype; choose a dependable endpoint before launch |
| [GraphHopper Routing API](https://docs.graphhopper.com/openapi/routing) | Hosted routing API and OSM-based routing engine | Hosted service requires an API key and follows current quota/pricing plan; self-hosting has infrastructure and license review costs | HTTP API is mobile-usable; graph prep/server operations are not app-only concerns | Evaluate for a chosen geography/service requirement; not required now |
| [OSRM API](https://project-osrm.org/docs/v5.24.0/api/) | Fast OSM route, table, match and nearest-road services | Open-source self-hosted engine needs deployment and regular graph updates; public demo is not a production SLA; key depends on hosting | HTTP is mobile-usable; standard profiles do not equal an environmental optimizer | Consider if vehicle routing/performance is a demonstrated need; lower priority than Valhalla for current pedestrian path |
| [OSMnx](https://osmnx.readthedocs.io/) | Python download/model/analysis of OSM street networks | Uses OSM/Overpass-backed data sources; large queries and data preparation need resource and policy management | Excellent research/offline preprocessing tool; not a reasonable direct Android runtime dependency | Use in research notebooks or controlled pipeline, not the mobile app |
| [GeoJSON RFC 7946](https://www.rfc-editor.org/rfc/rfc7946) | Interchange of geographic features | No hosted API or key; coordinate order is longitude then latitude in WGS 84 | Highly suitable for MapLibre/app interchange | Use as the route/environment interchange contract; test coordinate order |
| [OGC GeoPackage](https://www.ogc.org/standard/geopackage/) | SQLite-based open container for vector/raster geodata and metadata | No API key; package generation, file size, update and query strategy are product responsibilities | Can support offline area packs; Android needs a compatible query/native integration | Consider only after offline coverage and spatial query volume are defined |

## Air, Weather and Noise

| Source | What it provides / Road Guide use | Limits, key and cost | License/Android fit | Recommendation |
|---|---|---|---|---|
| [Open-Meteo terms](https://open-meteo.com/en/terms), [Air Quality API](https://open-meteo.com/en/docs/air-quality-api), [Weather API](https://open-meteo.com/en/docs) | Modelled hourly pollutants/air quality and weather/current forecasts; current app reads PM2.5 plus weather | Current repo documents free API as non-commercial and CC BY 4.0 data. Public service may rate-limit; commercial use requires a suitable plan/provider. No key for current free endpoints | Simple HTTPS works on Android; follow attribution, usage and commercial terms | Keep for disclosed area context/MVP; never call it street-level data or rank routes with one rounded point |
| [Copernicus Atmosphere Data Store / CAMS](https://ads.atmosphere.copernicus.eu/) | Copernicus atmospheric composition observations, forecasts/reanalysis products; potential broader air data | Product resolution, forecast/archive availability and update cycle vary. ADS requires registration/authentication for many download flows; API credentials and request limits apply. Terms/attribution are product-specific; no blanket promise of curbside accuracy | Large gridded datasets are better normalized/served or packaged than fetched per route from Android | Evaluate per pilot market and product; likely future provider, not a direct MVP replacement without coverage proof |
| [EEA Environmental Noise](https://noise.eea.europa.eu/) | Strategic noise mapping/reporting for covered European sources/areas; possible Lden/Lnight context | Periodic modelled maps, not live noise; coverage/age/source differ; dataset reuse terms must be checked. No general API key guarantee | A preprocessed dataset can support mobile display; direct provider UI may not be suitable | Use only with date/method/coverage; label as strategic map, not current sidewalk dB |
| [European Environment Agency](https://www.eea.europa.eu/en/topics/in-depth/noise) | Policy, reporting and links on environmental noise | Not a uniform real-time route API | Android use depends on downloaded dataset and reuse terms | Research/official context; do not infer missing street values |
| National/regional monitoring agencies | Ground-station concentrations, regulatory reports, sometimes open endpoints | Coverage, access, API key, quotas, historic data and commercial license vary by country/city | Usually feasible through an adapter or preprocessed local data | Prefer for validation and pilot-city measurements; assess station-to-route distance and time alignment |
| Open industrial/emissions registries | Facility locations and reported emissions, depending on jurisdiction | Reporting delay, pollutant coverage, access and reuse rules vary; facility proximity is not personal exposure | Preprocess/attribute data rather than querying each mobile route | Future contextual factor only, with source and uncertainty shown |

## Android and Data Standards

| Source | What it provides / relevance | Cost/key/license | Android fit / recommendation |
|---|---|---|---|
| [Android background location](https://developer.android.com/develop/sensors-and-location/location/background) | Platform permission, throttling and background location constraints | No API fee; app-store/system policy applies | Mandatory for current capture claims and generated manifest validation |
| [Android architecture guidance](https://developer.android.com/topic/architecture) | UI/data/domain separation, lifecycle-aware state and architecture practices | No API fee | Reference for future native modules; apply incrementally to React Native boundaries |
| [Kotlin coroutines](https://kotlinlang.org/docs/coroutines-overview.html) | Structured concurrency, cancellation and asynchronous Kotlin code | No API fee | Relevant only for future Kotlin/Expo native modules; no Kotlin implementation exists |
| [Jetpack Compose](https://developer.android.com/develop/ui/compose) | Declarative native Android UI and testing approach | No API fee | Not current UI: current screens are React Native; do not rewrite for fashion |
| [Room](https://developer.android.com/training/data-storage/room) | SQLite object mapping, migrations and DAO abstraction | No API fee; dependencies/build changes required | Not current storage. Current Expo SQLite/SQLCipher is in use; evaluate only if moving native data ownership |

## Existing Runtime Request Boundaries

- Visible map sends tile/style requests to OpenFreeMap and uses OSM attribution.
- Planner sends exact origin/destination coordinates to Valhalla after its disclosure checkbox is accepted.
- Address search uses platform geocoding through Expo Location (Apple/Google platform services may process it).
- Open-Meteo gets coordinates rounded to one decimal degree; it does not receive the GPS history.
- External navigation receives/hands off the selected endpoints; its provider recalculates its own path.

The app has no mandatory API key today for these public defaults. Do not place future privileged secrets in a mobile bundle; if a provider requires a secret, use a provider-approved restricted client key or a minimal proxy, with its added cost and privacy scope documented. A server is not otherwise required by the current local-first design.

## Kazan / Russia Validation Status

The approved pilot is Kazan, Republic of Tatarstan, Russian Federation. No provider in this inventory has yet been confirmed reachable, sufficiently covered or contractually usable for this pilot. Verify OSM/Overpass tag coverage, OSM-based basemap terms, Valhalla/OSRM pedestrian and vehicle/transit profiles, Open-Meteo/CAMS pollutant coverage, dataset resolution and temporal validity from the target Russian network. Terms/licensing, sanctions/export restrictions, DNS/TLS reachability, public-service blocking, data coverage and privacy jurisdiction are separate checks. Record date, request/response, failure mode and any policy limitation. A successful request from this workspace or a public demo endpoint is not proof of Kazan/Pixel 9 availability. Prefer an open-data/local-hosting fallback only after its license, update source, operational cost and attribution are established.

## Skills Format Evidence

The installed VS Code Copilot customization documentation defines Agent Skills under `.github/skills/<name>/SKILL.md` with YAML frontmatter. No Kilo Code extension is installed in this workspace; a checked Kilo docs path returned 404. Therefore the project skills use the verified VS Code Copilot format and no Kilo compatibility claim is made. No extension or library was installed.
