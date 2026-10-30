import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SQLiteDB, type Route } from '@services/database';
import {
  disableAutomaticRecording,
  enableAutomaticRecording,
  ensureAutomaticRecording,
  getLocationRecordingMode,
  type LocationRecordingMode,
} from '@services/locationService';
import { recordDiagnostic } from '@services/diagnostics';

const transportModes = [
  'Пешком',
  'Велосипед',
  'Автомобиль',
  'Автобус/трамвай',
  'Поезд/метро',
  'Мотоцикл',
];

export default function TrackingScreen() {
  const router = useRouter();
  const busyRef = useRef(false);
  const screenFocused = useRef(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recordingMode, setRecordingMode] = useState<LocationRecordingMode | null>(null);
  const [recordingUnavailable, setRecordingUnavailable] = useState(false);

  const refreshRoute = useCallback(async () => {
    const activeId = await SQLiteDB.getActiveRouteId();
    const activeRoute = activeId
      ? await SQLiteDB.getRouteById(activeId, 1_500)
      : null;
    if (screenFocused.current) setRoute(activeRoute);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      screenFocused.current = true;
      const refresh = async () => {
        try {
          const enabled = await SQLiteDB.isAutomaticRecordingEnabled();
          const started = enabled ? await ensureAutomaticRecording() : false;
          const mode = started ? await getLocationRecordingMode() : null;
          const activeId = await SQLiteDB.getActiveRouteId();
          const currentRoute = activeId
            ? await SQLiteDB.getRouteById(activeId, 1_500)
            : null;
          if (active) {
            setRoute(currentRoute);
            setRecordingMode(mode);
            setRecordingUnavailable(enabled && mode === null);
          }
        } catch (error) {
          console.error('Could not restore active recording:', error);
          void recordDiagnostic('error', 'Could not restore active route recording');
          if (active) {
            Alert.alert('Ошибка записи', 'Не удалось восстановить состояние записи.');
          }
        } finally {
          if (active) setLoading(false);
        }
      };
      void refresh();
      const interval = setInterval(() => {
        if (active) {
          Promise.all([
            refreshRoute(),
            getLocationRecordingMode().then(mode => {
              if (active) setRecordingMode(mode);
            }),
          ]).catch(error => {
            console.error('Could not refresh active route:', error);
            void recordDiagnostic('error', 'Could not refresh active route recording');
          });
        }
      }, 15_000);
      return () => {
        active = false;
        screenFocused.current = false;
        clearInterval(interval);
      };
    }, [refreshRoute])
  );

  async function beginRecording() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await enableAutomaticRecording();
      const mode = await getLocationRecordingMode();
      if (!mode) throw new Error('Служба геолокации не запустилась. Попробуйте ещё раз.');
      setRecordingMode(mode);
      setRecordingUnavailable(false);
      await recordDiagnostic('info', 'Route recording started from tracking screen');
      await refreshRoute();
    } catch (error) {
      console.error('Could not start route recording:', error);
      void recordDiagnostic('error', 'Route recording could not be started');
      Alert.alert(
        'Не удалось начать запись',
        error instanceof Error ? error.message : 'Проверьте разрешения геолокации.'
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function stopRecording() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await disableAutomaticRecording();
      setRecordingMode(null);
      setRecordingUnavailable(false);
      await recordDiagnostic('info', 'Route recording stopped from tracking screen');
      await refreshRoute();
      router.replace('/');
    } catch (error) {
      console.error('Could not stop route recording:', error);
      void recordDiagnostic('error', 'Route recording could not be stopped');
      Alert.alert('Ошибка', 'Не удалось корректно завершить запись.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function cycleTransportMode() {
    if (!route) return;
    const currentIndex = transportModes.indexOf(route.transportMode);
    const nextMode =
      transportModes[(currentIndex + 1 + transportModes.length) % transportModes.length];
    try {
      await SQLiteDB.setManualTransportMode(route.id, nextMode);
      await refreshRoute();
    } catch (error) {
      console.error('Could not correct transport mode:', error);
      void recordDiagnostic('error', 'Could not save manual transport mode');
      Alert.alert('Ошибка', 'Не удалось сохранить выбранный тип транспорта.');
    }
  }

  const isTracking = recordingMode !== null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <Text style={styles.title}>
          {loading
            ? 'Проверяем запись…'
            : recordingMode === 'background'
              ? 'Фоновая запись активна'
              : recordingMode === 'foreground'
                ? 'Запись активна, пока приложение открыто'
                : recordingUnavailable
                  ? 'Не удалось запустить запись'
                : 'Запись остановлена'}
        </Text>
        {loading ? (
          <ActivityIndicator color="#168A57" style={styles.loading} />
        ) : (
          <>
            <Text style={styles.transport}>
              {route
                ? `Транспорт: ${route.transportMode}`
                : recordingMode
                  ? 'Ожидаем первую GPS-точку…'
                  : recordingUnavailable
                    ? 'Проверьте доступ к геолокации и повторите запуск.'
                  : 'Последний маршрут сохранён'}
            </Text>
            {route && (
              <>
                <Text style={styles.stats}>
                  {route.distance.toFixed(2)} км · {Math.round(route.duration / 60)} мин ·{' '}
                  {route.points.length} точек
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void cycleTransportMode()}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryText}>Изменить вид транспорта</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void (isTracking ? stopRecording() : beginRecording())}
              style={[styles.actionButton, isTracking && styles.stopButton, busy && styles.disabled]}
            >
              <Text style={styles.actionText}>
                {busy
                  ? 'Подождите…'
                  : isTracking
                    ? 'Остановить запись'
                    : recordingUnavailable
                      ? 'Повторить запуск'
                      : 'Начать или возобновить запись'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { color: '#202D26', fontSize: 26, fontWeight: '600', textAlign: 'center' },
  transport: { color: '#526158', fontSize: 16, marginTop: 16, textAlign: 'center' },
  stats: { color: '#7A877F', fontSize: 14, marginTop: 8, textAlign: 'center' },
  loading: { marginTop: 24 },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#F1F5F2',
    borderRadius: 12,
    marginTop: 24,
    padding: 15,
  },
  secondaryText: { color: '#23644F', fontSize: 15, fontWeight: '600' },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#168A57',
    borderRadius: 14,
    marginTop: 16,
    padding: 18,
  },
  stopButton: { backgroundColor: '#B42318' },
  disabled: { opacity: 0.6 },
  actionText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});
