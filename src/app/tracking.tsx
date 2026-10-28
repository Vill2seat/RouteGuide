import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SQLiteDB } from '@services/database';
import type { Route } from '@services/database';
import { startLocationTask, stopLocationTask } from '@services/locationService';
import WalkIcon from '@assets/icons/walk.svg';
import BicycleIcon from '@assets/icons/bicycle.svg';
import CarIcon from '@assets/icons/car.svg';
import TransitIcon from '@assets/icons/transit.svg';

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
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [transportIndex, setTransportIndex] = useState(0);
  const [autoDetect, setAutoDetect] = useState(true);
  const [busy, setBusy] = useState(false);

  const refreshActiveRoute = useCallback(async () => {
    const activeId = await SQLiteDB.getActiveRouteId();
    setActiveRoute(activeId ? await SQLiteDB.getRouteById(activeId) : null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      refreshActiveRoute().catch(error => {
        console.error('Could not restore active recording:', error);
        Alert.alert('Ошибка', 'Не удалось восстановить состояние записи.');
      });
      const interval = setInterval(() => {
        if (active) {
          refreshActiveRoute().catch(error =>
            console.error('Could not refresh active route:', error)
          );
        }
      }, 5000);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [refreshActiveRoute])
  );

  useEffect(() => {
    if (activeRoute) {
      const index = transportModes.indexOf(activeRoute.transportMode);
      if (index >= 0) setTransportIndex(index);
    }
  }, [activeRoute]);

  const startTracking = async () => {
    setBusy(true);
    try {
      await SQLiteDB.startRoute(
        autoDetect ? 'Определяется' : transportModes[transportIndex],
        !autoDetect
      );
      try {
        await startLocationTask();
      } catch (error) {
        await SQLiteDB.finishRoute();
        throw error;
      }
      await refreshActiveRoute();
    } catch (error) {
      console.error('Could not start route recording:', error);
      Alert.alert(
        'Не удалось начать запись',
        error instanceof Error ? error.message : 'Проверьте разрешения геолокации.'
      );
    } finally {
      setBusy(false);
    }
  };

  const changeTransportMode = () => {
    if (!activeRoute) return;
    const nextMode =
      transportModes[
        (transportModes.indexOf(activeRoute.transportMode) + 1 + transportModes.length) %
          transportModes.length
      ];
    SQLiteDB.setManualTransportMode(activeRoute.id, nextMode)
      .then(refreshActiveRoute)
      .catch(error => {
        console.error('Could not correct transport mode:', error);
        Alert.alert('Ошибка', 'Не удалось сохранить выбранный тип транспорта.');
      });
  };

  const stopTracking = async () => {
    setBusy(true);
    try {
      await stopLocationTask();
      await SQLiteDB.finishRoute();
      await refreshActiveRoute();
      router.replace('/');
    } catch (error) {
      console.error('Could not stop route recording:', error);
      Alert.alert('Ошибка', 'Не удалось корректно завершить запись.');
    } finally {
      setBusy(false);
    }
  };

  const isTracking = activeRoute !== null;
  const activeMode = isTracking
    ? activeRoute.transportMode
    : autoDetect
      ? 'Определяется'
      : transportModes[transportIndex];
  const ModeIcon =
    activeMode === 'Пешком'
      ? WalkIcon
      : activeMode === 'Велосипед'
        ? BicycleIcon
        : ['Автобус/трамвай', 'Поезд/метро'].includes(activeMode)
          ? TransitIcon
          : CarIcon;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>{isTracking ? 'Запись активна' : 'Готов к записи'}</Text>
        <View style={styles.modeRow}>
          <ModeIcon width={22} height={22} color="#168A57" />
          <Text style={styles.subtitle}>Транспорт: {activeMode}</Text>
        </View>
        {isTracking && activeRoute.transportConfidence !== null && (
          <Text style={styles.note}>
            Оценка уверенности: {Math.round(activeRoute.transportConfidence * 100)}%. Определение по скорости GPS.
          </Text>
        )}
        {isTracking && (
          <Text style={styles.stats}>
            {activeRoute.distance.toFixed(2)} км · {Math.round(activeRoute.duration / 60)} мин ·{' '}
            {activeRoute.points.length} точек
          </Text>
        )}
      </View>

      {!isTracking && (
        <>
          <TouchableOpacity
            accessibilityRole="switch"
            accessibilityState={{ checked: autoDetect }}
            style={styles.transportButton}
            onPress={() => setAutoDetect(value => !value)}
          >
            <Text style={styles.transportText}>
              {autoDetect ? 'Автоопределение включено' : 'Выбрать транспорт вручную'}
            </Text>
          </TouchableOpacity>
          {!autoDetect && (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.transportButton}
              onPress={() =>
                setTransportIndex(index => (index + 1) % transportModes.length)
              }
            >
              <Text style={styles.transportText}>
                Тип: {transportModes[transportIndex]} · изменить
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {isTracking && (
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.transportButton}
          onPress={changeTransportMode}
        >
          <Text style={styles.transportText}>Изменить тип транспорта</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        accessibilityRole="button"
        disabled={busy}
        style={[styles.actionButton, isTracking && styles.stopButton, busy && styles.disabled]}
        onPress={isTracking ? stopTracking : startTracking}
      >
        <Text style={styles.actionText}>
          {busy ? 'Подождите…' : isTracking ? 'Завершить запись' : 'Начать запись'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 24,
    justifyContent: 'center',
  },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1A1A1A' },
  subtitle: { fontSize: 16, color: '#666666', marginTop: 8 },
  stats: { fontSize: 14, color: '#666666', marginTop: 8 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { fontSize: 12, color: '#666666', marginTop: 6, textAlign: 'center' },
  actionButton: {
    width: '100%',
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#168A57',
    alignItems: 'center',
  },
  stopButton: { backgroundColor: '#B42318' },
  disabled: { opacity: 0.6 },
  actionText: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },
  transportButton: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
  },
  transportText: { fontSize: 16, color: '#1A1A1A' },
});
