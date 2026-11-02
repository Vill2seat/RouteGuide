import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { NativeSyntheticEvent } from 'react-native';
import type { FeatureCollection, LineString, Point } from 'geojson';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as NativeMap,
  type PressEventWithFeatures,
  type InitialViewState,
} from '@maplibre/maplibre-react-native';
import { mapStyleUrl } from '@services/mapProvider';
import { recordDiagnostic } from '@services/diagnostics';
import type { Coordinate } from '@services/routeService';

type RouteMapProps = {
  coordinates: Coordinate[];
  routeColor?: string;
  cameraTarget?: Coordinate | null;
  currentLocation?: Coordinate | null;
  weatherOverlay?: {
    conditionLabel: string;
    conditionIcon: string;
    temperature: number | null;
    windSpeed: number | null;
    windDirection: string | null;
    windBearing: number | null;
    sunDirection: string | null;
    sunBearing: number | null;
    precipitation: number | null;
    precipitationProbability: number | null;
    cloudCover: number | null;
    fetchedAt: Date;
    stale: boolean;
    modelTime: Date | null;
  } | null;
  visitMarkers?: Array<Coordinate & { id: string; label: string }>;
  onVisitPress?: (visitId: string) => void;
  alternativeRoutes?: Array<{
    id: string;
    coordinates: Coordinate[];
    color: string;
  }>;
  style?: StyleProp<ViewStyle>;
};

const maxRenderedRoutePoints = 1_200;

function isValidCoordinate(point: Coordinate): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

function simplifyCoordinates(coordinates: Coordinate[]): Coordinate[] {
  if (coordinates.length <= maxRenderedRoutePoints) return coordinates;

  const stride = (coordinates.length - 1) / (maxRenderedRoutePoints - 1);
  return Array.from({ length: maxRenderedRoutePoints }, (_, index) =>
    coordinates[Math.round(index * stride)]
  );
}

function coordinateAtBearing(
  origin: Coordinate,
  bearingDegrees: number,
  distanceMeters = 450
): Coordinate {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const angularDistance = distanceMeters / 6_371_000;
  const bearing = radians(bearingDegrees);
  const latitude = radians(origin.latitude);
  const longitude = radians(origin.longitude);
  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const destinationLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) -
        Math.sin(latitude) * Math.sin(destinationLatitude)
    );
  return {
    latitude: destinationLatitude * 180 / Math.PI,
    longitude: ((destinationLongitude * 180 / Math.PI + 540) % 360) - 180,
  };
}

function routeBounds(coordinates: Coordinate[]): InitialViewState {
  coordinates = coordinates.filter(isValidCoordinate);
  if (!coordinates.length) {
    return { center: [0, 20], zoom: 1.5 };
  }

  const bounds = coordinates.reduce(
    (result, point) => ({
      west: Math.min(result.west, point.longitude),
      east: Math.max(result.east, point.longitude),
      south: Math.min(result.south, point.latitude),
      north: Math.max(result.north, point.latitude),
    }),
    {
      west: Number.POSITIVE_INFINITY,
      east: Number.NEGATIVE_INFINITY,
      south: Number.POSITIVE_INFINITY,
      north: Number.NEGATIVE_INFINITY,
    }
  );
  const { west, east, south, north } = bounds;

  if (coordinates.length === 1 || (west === east && south === north)) {
    return {
      center: [coordinates[0].longitude, coordinates[0].latitude] as [number, number],
      zoom: 15,
    };
  }

  return {
    bounds: [west, south, east, north] as [number, number, number, number],
    padding: { top: 36, right: 36, bottom: 36, left: 36 },
    zoom: 12,
  };
}

export default function RouteMap({
  coordinates,
  routeColor = '#168A57',
  cameraTarget,
  currentLocation,
  weatherOverlay,
  visitMarkers = [],
  onVisitPress,
  alternativeRoutes,
  style,
}: RouteMapProps) {
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const failureLogged = useRef(false);
  const routes = useMemo(
    () =>
      alternativeRoutes?.length
        ? alternativeRoutes
        : [{ id: 'route', coordinates, color: routeColor }],
    [alternativeRoutes, coordinates, routeColor]
  );
  const routeFeatures = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: routes.flatMap(route => {
        const validCoordinates = route.coordinates.filter(isValidCoordinate);
        if (validCoordinates.length < 2) return [];
        const renderCoordinates = simplifyCoordinates(validCoordinates);
        return [
          {
            type: 'Feature' as const,
            properties: { id: route.id, color: route.color },
            geometry: {
              type: 'LineString' as const,
              coordinates: renderCoordinates.map(point => [point.longitude, point.latitude]),
            },
          },
        ];
      }),
    }),
    [routes]
  );
  const allCoordinates = useMemo(
    () => routes.flatMap(route => route.coordinates.filter(isValidCoordinate)),
    [routes]
  );
  const validVisitMarkers = useMemo(
    () => visitMarkers.filter(isValidCoordinate),
    [visitMarkers]
  );
  const validCurrentLocation =
    currentLocation && isValidCoordinate(currentLocation) ? currentLocation : null;
  const weatherDirections = useMemo(() => {
    if (!weatherOverlay || !validCurrentLocation) return [];
    return [
      ...(weatherOverlay.windBearing === null
        ? []
        : [{
            id: 'wind',
            bearing: weatherOverlay.windBearing,
            color: '#167FA5',
          }]),
      ...(weatherOverlay.sunBearing === null
        ? []
        : [{
            id: 'sun',
            bearing: weatherOverlay.sunBearing,
            color: '#D99A22',
          }]),
    ].map(direction => ({
      ...direction,
      endpoint: coordinateAtBearing(validCurrentLocation, direction.bearing),
    }));
  }, [validCurrentLocation, weatherOverlay]);
  const weatherDirectionFeatures = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: validCurrentLocation
        ? weatherDirections.map(direction => ({
            type: 'Feature' as const,
            properties: { id: direction.id, color: direction.color },
            geometry: {
              type: 'LineString' as const,
              coordinates: [
                [validCurrentLocation.longitude, validCurrentLocation.latitude],
                [direction.endpoint.longitude, direction.endpoint.latitude],
              ],
            },
          }))
        : [],
    }),
    [validCurrentLocation, weatherDirections]
  );
  const mapCoordinates = useMemo(
    () => [...allCoordinates, ...validVisitMarkers],
    [allCoordinates, validVisitMarkers]
  );
  const camera = useMemo(
    () =>
      routeBounds(
        cameraTarget && isValidCoordinate(cameraTarget) ? [cameraTarget] : mapCoordinates
      ),
    [cameraTarget, mapCoordinates]
  );
  const markerFeatures = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: [
        ...(allCoordinates.length
          ? [
              {
                type: 'Feature' as const,
                properties: { kind: 'start', label: '' },
                geometry: {
                  type: 'Point' as const,
                  coordinates: [allCoordinates[0].longitude, allCoordinates[0].latitude],
                },
              },
              ...(allCoordinates.length > 1
                ? [
                    {
                      type: 'Feature' as const,
                      properties: { kind: 'end', label: '' },
                      geometry: {
                        type: 'Point' as const,
                        coordinates: [
                          allCoordinates[allCoordinates.length - 1].longitude,
                          allCoordinates[allCoordinates.length - 1].latitude,
                        ],
                      },
                    },
                  ]
                : []),
            ]
          : []),
        ...validVisitMarkers.map(visit => ({
          type: 'Feature' as const,
          properties: { kind: 'visit', label: visit.label, id: visit.id },
          geometry: {
            type: 'Point' as const,
            coordinates: [visit.longitude, visit.latitude],
          },
        })),
        ...(validCurrentLocation
          ? [
              {
                type: 'Feature' as const,
                properties: { kind: 'current-location', label: '' },
                geometry: {
                  type: 'Point' as const,
                  coordinates: [
                    validCurrentLocation.longitude,
                    validCurrentLocation.latitude,
                  ],
                },
              },
            ]
          : []),
        ...weatherDirections
          .filter(direction => direction.id === 'sun')
          .map(direction => ({
            type: 'Feature' as const,
            properties: { kind: 'weather-sun', label: '☀' },
            geometry: {
              type: 'Point' as const,
              coordinates: [direction.endpoint.longitude, direction.endpoint.latitude],
            },
          })),
      ],
    }),
    [allCoordinates, validCurrentLocation, validVisitMarkers, weatherDirections]
  );

  function handleMarkerPress(
    event: NativeSyntheticEvent<PressEventWithFeatures>
  ) {
    const visit = event.nativeEvent.features.find(
      feature => feature.properties?.kind === 'visit'
    );
    const id = visit?.properties?.id;
    if (typeof id === 'string') onVisitPress?.(id);
  }

  return (
    <View style={[styles.container, style]}>
      <NativeMap
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyleUrl}
        attribution
        logo
        compass
        onDidFinishLoadingMap={() => setMapUnavailable(false)}
        onDidFailLoadingMap={() => {
          setMapUnavailable(true);
          if (!failureLogged.current) {
            failureLogged.current = true;
            void recordDiagnostic('warning', 'OpenFreeMap basemap could not be loaded');
          }
        }}
      >
        <Camera initialViewState={camera} />
        {routeFeatures.features.length > 0 && (
          <GeoJSONSource id="route-comparison-source" data={routeFeatures}>
            <Layer
              id="route-comparison-lines"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 5,
                'line-opacity': 0.82,
              }}
            />
          </GeoJSONSource>
        )}
        {weatherDirectionFeatures.features.length > 0 && (
          <GeoJSONSource id="weather-directions-source" data={weatherDirectionFeatures}>
            <Layer
              id="weather-direction-lines"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 3,
                'line-opacity': 0.9,
              }}
            />
            <Layer
              id="weather-direction-arrows"
              type="symbol"
              layout={{
                'symbol-placement': 'line',
                'symbol-spacing': 100,
                'text-field': '→',
                'text-size': 20,
                'text-rotation-alignment': 'map',
                'text-keep-upright': false,
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              }}
              paint={{
                'text-color': ['get', 'color'],
                'text-halo-color': '#FFFFFF',
                'text-halo-width': 1.5,
              }}
            />
          </GeoJSONSource>
        )}
        {markerFeatures.features.length > 0 && (
          <GeoJSONSource
            id="route-markers-source"
            data={markerFeatures}
            onPress={onVisitPress ? handleMarkerPress : undefined}
          >
            <Layer
              id="route-markers"
              type="circle"
              paint={{
                'circle-radius': [
                  'match',
                  ['get', 'kind'],
                  'visit',
                  13,
                  'weather-sun',
                  9,
                  'current-location',
                  9,
                  7,
                ],
                'circle-color': [
                  'match',
                  ['get', 'kind'],
                  'visit',
                  '#23644F',
                  'weather-sun',
                  '#E5A927',
                  'current-location',
                  '#23644F',
                  'start',
                  '#23644F',
                  '#69766E',
                ],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#FFFFFF',
              }}
            />
            <Layer
              id="route-visit-labels"
              type="symbol"
              layout={{
                'text-field': ['get', 'label'],
                'text-size': 12,
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              }}
              paint={{ 'text-color': '#FFFFFF' }}
            />
          </GeoJSONSource>
        )}
      </NativeMap>
      {weatherOverlay && (
        <View pointerEvents="none" style={styles.weatherCard}>
          <View style={styles.weatherHeading}>
            <Text style={styles.weatherIcon}>{weatherOverlay.conditionIcon}</Text>
            <View style={styles.weatherHeadingText}>
              <Text style={styles.weatherTitle}>Погода в районе</Text>
              <Text style={styles.weatherCondition}>{weatherOverlay.conditionLabel}</Text>
            </View>
            {weatherOverlay.temperature !== null && (
              <Text style={styles.weatherTemperature}>
                {Math.round(weatherOverlay.temperature)}°
              </Text>
            )}
          </View>
          <Text style={styles.weatherDetail}>
            {weatherOverlay.windSpeed !== null && weatherOverlay.windSpeed < 1
              ? 'Ветер: штиль'
              : weatherOverlay.windDirection && weatherOverlay.windSpeed !== null
                ? `Ветер → ${weatherOverlay.windDirection} · ${Math.round(weatherOverlay.windSpeed)} км/ч`
                : 'Направление ветра недоступно'}
          </Text>
          <Text style={styles.weatherDetail}>
            {weatherOverlay.precipitationProbability !== null
              ? `Вероятность осадков ${Math.round(weatherOverlay.precipitationProbability)}%`
              : weatherOverlay.precipitation !== null
                ? `Осадки за последний час: ${weatherOverlay.precipitation.toFixed(1)} мм`
                : 'Данные об осадках недоступны'}
            {weatherOverlay.cloudCover !== null
              ? ` · облачность ${Math.round(weatherOverlay.cloudCover)}%`
              : ''}
          </Text>
          <Text style={styles.weatherDetail}>
            {weatherOverlay.sunDirection
              ? `Солнце → ${weatherOverlay.sunDirection}`
              : 'Солнце ниже горизонта'}
          </Text>
          <Text style={styles.weatherSource}>
            {weatherOverlay.windBearing !== null || weatherOverlay.sunBearing !== null
              ? 'Стрелки на карте: синяя — ветер · жёлтая — солнце'
              : 'Сейчас направляющие на карте не отображаются'}
          </Text>
          <Text style={styles.weatherSource}>
            Open-Meteo · модель района · {weatherOverlay.modelTime
              ? weatherOverlay.modelTime.toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'время модели недоступно'}
            {' · запрос '}
            {weatherOverlay.fetchedAt.toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {weatherOverlay.stale ? ' · сохранённые данные' : ''}
          </Text>
        </View>
      )}
      {mapUnavailable && (
        <View pointerEvents="none" style={styles.mapUnavailable}>
          <Text style={styles.mapUnavailableText}>
            Не удалось загрузить карту. Проверьте подключение к интернету.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 12,
    minHeight: 240,
  },
  mapUnavailable: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  mapUnavailableText: {
    color: '#46534A',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  weatherCard: {
    position: 'absolute',
    top: 10,
    left: 10,
    maxWidth: '88%',
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: '#14231B',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  weatherHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  weatherIcon: { color: '#D99A22', fontSize: 20 },
  weatherHeadingText: { flex: 1 },
  weatherTitle: { color: '#26362C', fontSize: 11, fontWeight: '700' },
  weatherCondition: { color: '#536259', fontSize: 12, marginTop: 1 },
  weatherTemperature: { color: '#26362C', fontSize: 21, fontWeight: '600' },
  weatherDetail: { color: '#34443A', fontSize: 10, lineHeight: 15 },
  weatherSource: { color: '#768279', fontSize: 9, lineHeight: 13, marginTop: 3 },
});
