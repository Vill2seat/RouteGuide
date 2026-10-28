import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { SQLiteDB } from './database';
import { recordDiagnostic } from './diagnostics';

export const locationTaskName = 'route-guide-location-task';

if (!TaskManager.isTaskDefined(locationTaskName)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    locationTaskName,
    async ({ data, error }) => {
      if (error) {
        console.error('Background location task failed:', error);
        await recordDiagnostic('error', 'Background location task reported an error');
        return;
      }
      if (!data?.locations.length) return;

      try {
        await SQLiteDB.appendLocations(data.locations);
      } catch (databaseError) {
        console.error('Could not save background location updates:', databaseError);
        await recordDiagnostic('error', 'Could not save a background location update');
      }
    }
  );
}

export async function startLocationTask(): Promise<void> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    throw new Error('Для записи маршрута требуется разрешение на геолокацию.');
  }

  const background = await Location.getBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    throw new Error('Разрешите фоновую геолокацию в настройках устройства.');
  }

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(locationTaskName);
  if (alreadyStarted) return;

  await Location.startLocationUpdatesAsync(locationTaskName, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 10,
    timeInterval: 60000,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Route Guide записывает маршрут',
      notificationBody: 'Нажмите, чтобы открыть приложение и остановить запись.',
      notificationColor: '#168A57',
    },
  });
}

export async function stopLocationTask(): Promise<void> {
  const isStarted = await Location.hasStartedLocationUpdatesAsync(locationTaskName);
  if (isStarted) {
    await Location.stopLocationUpdatesAsync(locationTaskName);
  }
}
