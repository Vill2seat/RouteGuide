import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { SQLiteDB } from './database';
import type { RoutePoint } from './database';

export const locationTaskName = 'route-guide-location-task';

TaskManager.defineTask(locationTaskName, ({ data, error }) => {
  if (error) return;
  if (data) {
    const locations = data.locations as Location.LocationObject[];
    // Handle background location events
    console.log('Background location update:', locations.length, 'points');
  }
});

export async function startLocationTask() {
  try {
    await Location.startLocationUpdatesAsync(locationTaskName, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 10,
      timeInterval: 60000,
      foreground: {
        interval: 60000,
        delayFastestInterval: 5000,
      },
    });
  } catch (e) {
    console.log('Location task already running or not permitted');
  }
}

export async function stopLocationTask() {
  try {
    await Location.stopLocationUpdatesAsync(locationTaskName);
  } catch (e) {
    console.log('Error stopping location task');
  }
}