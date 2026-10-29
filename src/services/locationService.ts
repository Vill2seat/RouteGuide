import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { SQLiteDB } from './database';
import { recordDiagnostic } from './diagnostics';

export const locationTaskName = 'route-guide-location-task';

let foregroundSubscription: Location.LocationSubscription | null = null;
let startingLocationUpdates: Promise<void> | null = null;

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

async function startForegroundUpdates(): Promise<void> {
  if (foregroundSubscription) return;
  foregroundSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 50,
      timeInterval: 60_000,
    },
    location => {
      void SQLiteDB.appendLocations([location]).catch(error => {
        console.error('Could not save a foreground location update:', error);
        void recordDiagnostic('error', 'Could not save a foreground location update');
      });
    }
  );
}

export async function startLocationTask(): Promise<void> {
  if (startingLocationUpdates) return startingLocationUpdates;

  startingLocationUpdates = (async () => {
    const foreground = await Location.getForegroundPermissionsAsync();
    if (foreground.status !== 'granted') {
      throw new Error('Для записи маршрута требуется разрешение на геолокацию.');
    }

    let hasBackgroundPermission = false;
    try {
      hasBackgroundPermission =
        (await Location.getBackgroundPermissionsAsync()).status === 'granted';
    } catch (error) {
      console.warn('Could not check background location permission:', error);
      await recordDiagnostic('warning', 'Could not check background location permission');
    }

    if (hasBackgroundPermission) {
      const alreadyStarted =
        await Location.hasStartedLocationUpdatesAsync(locationTaskName);
      if (!alreadyStarted) {
        try {
          await Location.startLocationUpdatesAsync(locationTaskName, {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 50,
            timeInterval: 60_000,
            deferredUpdatesInterval: 120_000,
            pausesUpdatesAutomatically: true,
            foregroundService: {
              notificationTitle: 'Route Guide записывает маршрут',
              notificationBody: 'Нажмите, чтобы открыть приложение и остановить запись.',
              notificationColor: '#168A57',
            },
          });
        } catch (error) {
          console.warn('Could not start background location updates:', error);
          await recordDiagnostic('warning', 'Could not start background location updates');
          await startForegroundUpdates();
        }
      }
      return;
    }

    await recordDiagnostic(
      'warning',
      'Background location permission not granted; using foreground location updates'
    );
    await startForegroundUpdates();
  })().finally(() => {
    startingLocationUpdates = null;
  });

  return startingLocationUpdates;
}

export async function stopLocationTask(): Promise<void> {
  const subscription = foregroundSubscription;
  foregroundSubscription = null;
  subscription?.remove();

  const isStarted =
    await Location.hasStartedLocationUpdatesAsync(locationTaskName);
  if (isStarted) {
    await Location.stopLocationUpdatesAsync(locationTaskName);
  }
}

async function startRecordingIfNeeded(): Promise<void> {
  let routeId = await SQLiteDB.getActiveRouteId();
  let createdRoute = false;
  if (!routeId) {
    routeId = await SQLiteDB.startRoute('Определяется');
    createdRoute = true;
  }

  try {
    await startLocationTask();
  } catch (error) {
    if (createdRoute) await SQLiteDB.finishRoute();
    throw error;
  }
}

export async function ensureAutomaticRecording(): Promise<boolean> {
  if (!(await SQLiteDB.isAutomaticRecordingEnabled())) return false;
  await startRecordingIfNeeded();
  return true;
}

export async function enableAutomaticRecording(): Promise<void> {
  await startRecordingIfNeeded();
  await SQLiteDB.setAutomaticRecordingEnabled(true);
  await recordDiagnostic('info', 'Automatic route recording started');
}

export async function disableAutomaticRecording(): Promise<void> {
  await stopLocationTask();
  await SQLiteDB.finishRoute();
  await SQLiteDB.setAutomaticRecordingEnabled(false);
  await recordDiagnostic('info', 'Automatic route recording stopped');
}
