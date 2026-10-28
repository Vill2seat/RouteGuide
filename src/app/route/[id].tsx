import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SQLiteDB } from '@/services/database';
import type { Route } from '@/services/database';

export default function RouteDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const routeId = params.id as string;
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    loadRoute();
  }, []);

  async function loadRoute() {
    const r = await SQLiteDB.getRouteById(routeId);
    setRoute(r);
  }

  if (!route) return null;

  const coordinates = route.points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Назад</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{new Date(route.startTime).toLocaleDateString('ru-RU')}</Text>
      </View>

      <MapView style={styles.map} initialRegion={{
        latitude: coordinates[0].latitude,
        longitude: coordinates[0].longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}>
        <Polyline coordinates={coordinates} strokeColor="#007AFF" strokeWidth={4} />
        <Marker coordinate={coordinates[0]} title="Начало" />
        <Marker coordinate={coordinates[coordinates.length - 1]} title="Конец" />
      </MapView>

      <View style={styles.stats}>
        <Text style={styles.statLabel}>Расстояние</Text>
        <Text style={styles.statValue}>{route.distance.toFixed(1)} км</Text>
        <Text style={styles.statLabel}>Время</Text>
        <Text style={styles.statValue}>{Math.round(route.duration / 60)} мин</Text>
        <Text style={styles.statLabel}>Транспорт</Text>
        <Text style={styles.statValue}>{route.transportMode}</Text>
      </View>
    </View>
  );
}

import { useState, useEffect } from 'react';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backText: {
    fontSize: 16,
    color: '#007AFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  map: {
    flex: 1,
    height: 400,
    marginHorizontal: 16,
    borderRadius: 12,
  },
  stats: {
    padding: 16,
    backgroundColor: '#F9F9F9',
  },
  statLabel: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
});