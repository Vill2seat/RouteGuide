module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    'expo-router/babel',
    [
      'babel-plugin-module-resolver',
      {
        root: ['./'],
        alias: {
          '@components': './components',
          '@hooks': './hooks',
          '@services': './services',
          '@utils': './utils',
          '@assets': './assets',
        },
      },
    ],
  ],
};