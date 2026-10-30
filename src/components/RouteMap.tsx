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
      ],
    }),
    [allCoordinates, validCurrentLocation, validVisitMarkers]
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
                  'current-location',
                  9,
                  7,
                ],
                'circle-color': [
                  'match',
                  ['get', 'kind'],
                  'visit',
                  '#23644F',
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
});
