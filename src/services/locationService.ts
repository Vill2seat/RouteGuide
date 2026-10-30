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

async function startBackgroundTask(): Promise<void> {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(locationTaskName);
  if (alreadyStarted) return;

  try {
    await Location.startLocationUpdatesAsync(locationTaskName, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 50,
      timeInterval: 60_000,
      deferredUpdatesInterval: 120_000,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Route Guide записывает маршрут',
        notificationBody: 'Нажмите, чтобы открыть приложение и остановить запись.',
        notificationColor: '#168A57',
      },
    });
  } catch (error) {
    console.error('Could not start background location updates:', error);
    await recordDiagnostic('warning', 'Could not start background location updates');
    throw error;
  }
}

async function startForegroundUpdates(): Promise<void> {
  if (foregroundSubscription) return;

  try {
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
  } catch (error) {
    console.error('Could not start foreground location updates:', error);
    void recordDiagnostic('warning', 'Could not start foreground location updates');
    throw error;
  }
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
      await startBackgroundTask();
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

  if (subscription) {
    try {
      subscription.remove();
    } catch (error) {
      console.error('Could not remove foreground location subscription:', error);
      void recordDiagnostic('warning', 'Could not remove foreground location subscription');
    }
  }

  try {
    const isStarted =
      await Location.hasStartedLocationUpdatesAsync(locationTaskName);
    if (isStarted) {
      await Location.stopLocationUpdatesAsync(locationTaskName);
    }
  } catch (error) {
    console.error('Could not stop background location updates:', error);
    void recordDiagnostic('warning', 'Could not stop background location updates');
  }
}

async function startRecordingIfNeeded(): Promise<void> {
  let routeId: string | null = null;
  let createdRoute = false;
  try {
    routeId = await SQLiteDB.getActiveRouteId();
  } catch (error) {
    console.error('getActiveRouteId failed:', error);
    void recordDiagnostic('warning', 'getActiveRouteId failed during start recording');
    throw error;
  }
  if (!routeId) {
    try {
      routeId = await SQLiteDB.startRoute('Определяется');
      createdRoute = true;
    } catch (error) {
      console.error('startRoute failed:', error);
      void recordDiagnostic('warning', 'startRoute failed during start recording');
      throw error;
    }
  }

  try {
    await startLocationTask();
  } catch (error) {
    if (createdRoute) {
      try {
        await SQLiteDB.finishRoute();
      } catch (finishError) {
        console.error('finishRoute cleanup failed:', finishError);
      }
    }
    throw error;
  }
}

export async function ensureAutomaticRecording(): Promise<boolean> {
  if (!(await SQLiteDB.isAutomaticRecordingEnabled())) return false;
  try {
    await startRecordingIfNeeded();
  } catch (error) {
    console.error('startRecordingIfNeeded failed during ensure:', error);
    void recordDiagnostic('warning', 'startRecordingIfNeeded failed during ensure');
    return false;
  }
  return true;
}

export async function enableAutomaticRecording(): Promise<void> {
  try {
    await startRecordingIfNeeded();
  } catch (error) {
    console.error('startRecordingIfNeeded failed during enable:', error);
    void recordDiagnostic('warning', 'startRecordingIfNeeded failed during enable recording');
    throw error;
  }
  try {
    await SQLiteDB.setAutomaticRecordingEnabled(true);
  } catch (error) {
    console.error('setAutomaticRecordingEnabled(true) failed during enable:', error);
    void recordDiagnostic('warning', 'setAutomaticRecordingEnabled failed during enable');
    throw error;
  }
  await recordDiagnostic('info', 'Automatic route recording started');
}

export async function disableAutomaticRecording(): Promise<void> {
  try {
    await stopLocationTask();
  } catch (error) {
    console.error('stopLocationTask failed during disable:', error);
    void recordDiagnostic('warning', 'stopLocationTask failed during disable recording');
  }

  try {
    await SQLiteDB.finishRoute();
  } catch (error) {
    console.error('finishRoute failed during disable:', error);
    void recordDiagnostic('warning', 'finishRoute failed during disable recording');
  }

  try {
    await SQLiteDB.setAutomaticRecordingEnabled(false);
  } catch (error) {
    console.error('setAutomaticRecordingEnabled(false) failed during disable:', error);
    void recordDiagnostic('warning', 'setAutomaticRecordingEnabled failed during disable');
  }

  await recordDiagnostic('info', 'Automatic route recording stopped');
}
