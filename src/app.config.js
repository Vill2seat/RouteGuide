require('dotenv').config();

const baseApp = require('./app.json').expo;

module.exports = ({ config }) => {
  const app = {
    ...baseApp,
    plugins: [
      ...(baseApp.plugins ?? []).filter(
        plugin => plugin !== 'expo-sqlite'
      ),
      ['expo-sqlite', { useSQLCipher: true }],
      ['expo-secure-store', { configureAndroidBackup: true }],
      '@maplibre/maplibre-react-native',
    ],
    extra: {
      ...config.extra,
      mapProvider: 'openfreemap',
      mapStyleUrl:
        process.env.EXPO_PUBLIC_MAP_STYLE_URL ??
        'https://tiles.openfreemap.org/styles/liberty',
      routingEndpoint:
        process.env.EXPO_PUBLIC_ROUTING_ENDPOINT ??
        'https://valhalla1.openstreetmap.de/route',
      airQualityEndpoint:
        process.env.EXPO_PUBLIC_AIR_QUALITY_ENDPOINT ??
        'https://air-quality-api.open-meteo.com/v1/air-quality',
      osmQueryEndpoint:
        process.env.EXPO_PUBLIC_OSM_QUERY_ENDPOINT ??
        'https://overpass-api.de/api/interpreter',
    },
  };

  return { ...config, ...app };
};
