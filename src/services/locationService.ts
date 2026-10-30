import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { SQLiteDB } from './database';
import { recordDiagnostic } from './diagnostics';

export const locationTaskName = 'route-guide-location-task';

let foregroundSubscription: Location.LocationSubscription | null = null;
let locationLifecycle: Promise<void> = Promise.resolve();

export type LocationRecordingMode = 'background' | 'foreground';

function serializeLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const pending = locationLifecycle.then(operation);
  locationLifecycle = pending.then(
    () => undefined,
    () => undefined
  );
  return pending;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (!TaskManager.isTaskDefined(locationTaskName)) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
    locationTaskName,
    async ({ data, error }) => {
      if (error) {
        console.error('Background location task failed:', error);
        await recordDiagnostic(
          'error',
          `Background location task reported an error: ${describeError(error)}`
        );
        return;
      }
      if (!data?.locations?.length) return;

      try {
        await SQLiteDB.appendLocations(data.locations);
      } catch (databaseError) {
        console.error('Could not save background location updates:', databaseError);
        await recordDiagnostic(
          'error',
          `Could not save a background location update: ${describeError(databaseError)}`
        );
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
          void recordDiagnostic(
            'error',
            `Could not save a foreground location update: ${describeError(error)}`
          );
        });
      }
    );
  } catch (error) {
    console.error('Could not start foreground location updates:', error);
    void recordDiagnostic('warning', 'Could not start foreground location updates');
    throw error;
  }
}

async function stopForegroundUpdates(): Promise<void> {
  if (!foregroundSubscription) return;
  foregroundSubscription.remove();
  foregroundSubscription = null;
}

async function stopBackgroundUpdates(): Promise<void> {
  const isStarted = await Location.hasStartedLocationUpdatesAsync(locationTaskName);
  if (isStarted) {
    await Location.stopLocationUpdatesAsync(locationTaskName);
  }
}

async function stopLocationUpdates(): Promise<void> {
  let firstError: unknown;
  try {
    await stopForegroundUpdates();
  } catch (error) {
    firstError = error;
    console.error('Could not remove foreground location subscription:', error);
    await recordDiagnostic(
      'error',
      `Could not remove foreground location subscription: ${describeError(error)}`
    );
  }

  try {
    await stopBackgroundUpdates();
  } catch (error) {
    firstError ??= error;
    console.error('Could not stop background location updates:', error);
    await recordDiagnostic(
      'error',
      `Could not stop background location updates: ${describeError(error)}`
    );
  }

  if (firstError) throw firstError;
}

async function startLocationUpdates(): Promise<void> {
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
    try {
      await startBackgroundTask();
      await stopForegroundUpdates();
      return;
    } catch (backgroundError) {
      console.error(
        'Background recording unavailable; trying foreground updates:',
        backgroundError
      );
      await recordDiagnostic(
        'warning',
        `Background location unavailable; using foreground updates: ${describeError(backgroundError)}`
      );
    }
  }

  try {
    await stopBackgroundUpdates();
  } catch (error) {
    console.error('Could not stop background updates before foreground fallback:', error);
    await recordDiagnostic(
      'error',
      `Could not stop background updates before foreground fallback: ${describeError(error)}`
    );
    throw error;
  }

  await recordDiagnostic(
    'warning',
    'Background location permission not granted; using foreground location updates'
  );
  await startForegroundUpdates();
}

export async function startLocationTask(): Promise<void> {
  return serializeLifecycle(startLocationUpdates);
}

export async function stopLocationTask(): Promise<void> {
  return serializeLifecycle(stopLocationUpdates);
}

export async function getLocationRecordingMode(): Promise<LocationRecordingMode | null> {
  return serializeLifecycle(async () => {
    if (await Location.hasStartedLocationUpdatesAsync(locationTaskName)) return 'background';
    return foregroundSubscription ? 'foreground' : null;
  });
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
    await startLocationUpdates();
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
  return serializeLifecycle(async () => {
    if (!(await SQLiteDB.isAutomaticRecordingEnabled())) return false;
    try {
      await startRecordingIfNeeded();
    } catch (error) {
      console.error('startRecordingIfNeeded failed during ensure:', error);
      await recordDiagnostic(
        'warning',
        `startRecordingIfNeeded failed during ensure: ${describeError(error)}`
      );
      return false;
    }
    return true;
  });
}

export async function enableAutomaticRecording(): Promise<void> {
  return serializeLifecycle(async () => {
    try {
      await startRecordingIfNeeded();
      await SQLiteDB.setAutomaticRecordingEnabled(true);
      await recordDiagnostic('info', 'Automatic route recording started');
    } catch (error) {
      console.error('Could not enable automatic route recording:', error);
      await recordDiagnostic(
        'error',
        `Could not enable automatic route recording: ${describeError(error)}`
      );
      throw error;
    }
  });
}

export async function disableAutomaticRecording(): Promise<void> {
  return serializeLifecycle(async () => {
    try {
      await stopLocationUpdates();
      await SQLiteDB.finishRoute();
      await SQLiteDB.setAutomaticRecordingEnabled(false);
      await recordDiagnostic('info', 'Automatic route recording stopped');
    } catch (error) {
      console.error('Could not disable automatic route recording:', error);
      await recordDiagnostic(
        'error',
        `Could not disable automatic route recording: ${describeError(error)}`
      );
      throw error;
    }
  });
}
