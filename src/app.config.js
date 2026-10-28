require('dotenv').config();

const app = require('./app.json').expo;

module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

  if (googleMapsApiKey) {
    app.android = {
      ...app.android,
      config: {
        ...app.android?.config,
        googleMaps: { apiKey: googleMapsApiKey },
      },
    };
  }

  app.extra = {
    ...config.extra,
    googleMapsConfigured: Boolean(googleMapsApiKey),
    routingEndpoint:
      process.env.EXPO_PUBLIC_ROUTING_ENDPOINT ??
      'https://valhalla1.openstreetmap.de/route',
  };

  return { ...config, ...app };
};
