import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { SQLiteDB } from '@services/database';
import type { Route } from '@services/database';
import RouteIcon from '@assets/icons/route.svg';

export default function HomeScreen() {
  const router = useRouter();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => {
        if (active && status !== 'granted') router.replace('/onboarding');
      })
      .catch(error => {
        console.error('Could not check location permission:', error);
        Alert.alert('Ошибка', 'Не удалось проверить разрешение геолокации.');
      });

    return () => {
      active = false;
    };
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      SQLiteDB.getRoutes()
        .then(data => {
          if (active) setRoutes(data);
        })
        .catch(error => {
          console.error('Could not load route history:', error);
          Alert.alert('Ошибка', 'Не удалось загрузить историю маршрутов.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Route Guide</Text>
        <Text style={styles.subtitle}>{routes.length} маршрутов</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.primaryButton}
          onPress={() => router.push('/tracking')}
        >
          <Text style={styles.primaryButtonText}>Начать запись</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={() => router.push('/route-planner')}
        >
          <View style={styles.routeAction}>
            <RouteIcon width={20} height={20} color="#168A57" />
            <Text style={styles.secondaryButtonText}>Подобрать более чистый маршрут</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={() => router.push('/settings')}
        >
          <Text style={styles.secondaryButtonText}>Настройки и данные</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Последние маршруты</Text>
      {loading ? (
        <Text style={styles.emptyText}>Загрузка…</Text>
      ) : routes.length === 0 ? (
        <Text style={styles.emptyText}>История пока пуста.</Text>
      ) : (
        <FlatList
          data={routes.slice(0, 5)}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.routeCard}
              onPress={() => router.push(`/route/${item.id}`)}
            >
              <View style={styles.routeInfo}>
                <Text style={styles.routeDate}>
                  {item.startTime.toLocaleDateString('ru-RU')}
                </Text>
                <Text style={styles.routeTime}>
                  {item.startTime.toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <View style={styles.routeStats}>
                <Text style={styles.routeDistance}>{item.distance.toFixed(2)} км</Text>
                <Text style={styles.routeDuration}>{Math.round(item.duration / 60)} мин</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        accessibilityRole="button"
        style={styles.historyButton}
        onPress={() => router.push('/history')}
      >
        <Text style={styles.historyButtonText}>Вся история</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', paddingBottom: 24 },
  header: { paddingTop: 32, paddingHorizontal: 24, marginBottom: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1A1A1A' },
  subtitle: { fontSize: 16, color: '#666666', marginTop: 4 },
  actions: { paddingHorizontal: 16, gap: 10, marginBottom: 24 },
  primaryButton: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#168A57',
    alignItems: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F2F5F3',
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#1A1A1A', fontSize: 15, fontWeight: '600' },
  routeAction: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: {
    marginHorizontal: 16,
    marginBottom: 10,
    color: '#1A1A1A',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: { color: '#666666', textAlign: 'center', marginTop: 24 },
  routeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
  },
  routeInfo: { flex: 1 },
  routeDate: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  routeTime: { fontSize: 14, color: '#666666', marginTop: 2 },
  routeStats: { alignItems: 'flex-end' },
  routeDistance: { fontSize: 16, fontWeight: 'bold', color: '#168A57' },
  routeDuration: { fontSize: 14, color: '#666666', marginTop: 2 },
  historyButton: { alignItems: 'center', padding: 14 },
  historyButtonText: { color: '#168A57', fontWeight: '600' },
});
