import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as NativeMap,
  type InitialViewState,
} from '@maplibre/maplibre-react-native';
import { mapStyleUrl } from '@services/mapProvider';
import { recordDiagnostic } from '@services/diagnostics';
import type { Coordinate } from '@services/routeQuality';

type RouteMapProps = {
  coordinates: Coordinate[];
  style?: StyleProp<ViewStyle>;
};

function routeBounds(coordinates: Coordinate[]): InitialViewState {
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

export default function RouteMap({ coordinates, style }: RouteMapProps) {
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const failureLogged = useRef(false);
  const routeFeature = useMemo<Feature<LineString> | null>(() => {
    if (coordinates.length < 2) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coordinates.map(point => [point.longitude, point.latitude]),
      },
    };
  }, [coordinates]);

  const markerFeatures = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: coordinates.length
        ? [
            {
              type: 'Feature',
              properties: { kind: 'start' },
              geometry: {
                type: 'Point',
                coordinates: [coordinates[0].longitude, coordinates[0].latitude],
              },
            },
            ...(coordinates.length > 1
              ? [
                  {
                    type: 'Feature' as const,
                    properties: { kind: 'end' },
                    geometry: {
                      type: 'Point' as const,
                      coordinates: [
                        coordinates[coordinates.length - 1].longitude,
                        coordinates[coordinates.length - 1].latitude,
                      ],
                    },
                  },
                ]
              : []),
          ]
        : [],
    }),
    [coordinates]
  );
  const camera = useMemo(() => routeBounds(coordinates), [coordinates]);

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
        {routeFeature && (
          <GeoJSONSource id="route-line-source" data={routeFeature}>
            <Layer
              id="route-line"
              type="line"
              paint={{
                'line-color': '#168A57',
                'line-width': 5,
                'line-opacity': 0.9,
              }}
            />
          </GeoJSONSource>
        )}
        {markerFeatures.features.length > 0 && (
          <GeoJSONSource id="route-markers-source" data={markerFeatures}>
            <Layer
              id="route-markers"
              type="circle"
              paint={{
                'circle-radius': 7,
                'circle-color': [
                  'match',
                  ['get', 'kind'],
                  'start',
                  '#168A57',
                  '#B42318',
                ],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#FFFFFF',
              }}
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
