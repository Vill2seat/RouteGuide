import Constants from 'expo-constants';

export type MapProviderId = 'openfreemap';

export type MapProviderAdapter = {
  id: MapProviderId;
  styleUrl: string;
  attribution: string;
};

export const mapProvider: MapProviderAdapter = {
  id: 'openfreemap',
  styleUrl:
    Constants.expoConfig?.extra?.mapStyleUrl ??
    'https://tiles.openfreemap.org/styles/liberty',
  attribution: 'OpenStreetMap contributors · OpenMapTiles · OpenFreeMap',
};

export const mapStyleUrl = mapProvider.styleUrl;
