module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
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
    'react-native-worklets/plugin',
  ],
};