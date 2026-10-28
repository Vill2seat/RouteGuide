import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SQLiteDB } from '@services/database';
import type { Route } from '@services/database';

export default function RouteDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!routeId) {
      setLoading(false);
      return;
    }

    SQLiteDB.getRouteById(routeId)
      .then(result => {
        if (active) setRoute(result);
      })
      .catch(error => {
        console.error('Could not load route details:', error);
        Alert.alert('Ошибка', 'Не удалось загрузить маршрут.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [routeId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.message}>Загрузка маршрута…</Text>
      </View>
    );
  }

  if (!route) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Маршрут не найден.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backText}>Назад</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const coordinates = route.points.map(point => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
  const firstPoint = coordinates[0];
  const lastPoint = coordinates[coordinates.length - 1];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backText}>← Назад</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {route.startTime.toLocaleDateString('ru-RU')}
        </Text>
      </View>

      {firstPoint ? (
        <MapView
          style={styles.map}
          initialRegion={{
            ...firstPoint,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          {coordinates.length > 1 && (
            <Polyline coordinates={coordinates} strokeColor="#168A57" strokeWidth={4} />
          )}
          <Marker coordinate={firstPoint} title="Начало" pinColor="#168A57" />
          {lastPoint && coordinates.length > 1 && (
            <Marker coordinate={lastPoint} title="Конец" pinColor="#B42318" />
          )}
        </MapView>
      ) : (
        <View style={styles.noPoints}>
          <Text style={styles.message}>Для этого маршрута нет сохраненных точек GPS.</Text>
        </View>
      )}

      <View style={styles.stats}>
        <Text style={styles.statLabel}>Расстояние</Text>
        <Text style={styles.statValue}>{route.distance.toFixed(2)} км</Text>
        <Text style={styles.statLabel}>Время</Text>
        <Text style={styles.statValue}>{Math.round(route.duration / 60)} мин</Text>
        <Text style={styles.statLabel}>Транспорт</Text>
        <Text style={styles.statValue}>{route.transportMode}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  message: { color: '#666666', marginTop: 12, textAlign: 'center' },
  header: {
    paddingTop: 24,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backText: { fontSize: 16, color: '#168A57' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' },
  map: { flex: 1, minHeight: 280, marginHorizontal: 16, borderRadius: 12 },
  noPoints: {
    flex: 1,
    marginHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    padding: 24,
  },
  stats: { padding: 16, backgroundColor: '#F9F9F9' },
  statLabel: { fontSize: 14, color: '#666666', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 },
});
