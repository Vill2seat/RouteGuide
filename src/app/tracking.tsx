import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import { useState, useEffect } from 'react';
import { SQLiteDB } from '@/services/database';
import type { Route, RoutePoint } from '@/services/database';

export default function TrackingScreen() {
  const [isTracking, setIsTracking] = useState(false);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [transport, setTransport] = useState('Не определено');

  let watchId: any = null;
  let startTime: number = 0;

  useEffect(() => {
    return () => {
      if (watchId) Location.stopLocationUpdatesAsync(watchId);
    };
  }, []);

  const startTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    startTime = Date.now();
    setIsTracking(true);
    setPoints([]);

    watchId = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 5, timeInterval: 5000 },
      (loc) => {
        const p: RoutePoint = {
          id: `${loc.timestamp}-${loc.coords.latitude}-${loc.coords.longitude}`,
          timestamp: new Date(loc.timestamp),
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude ?? 0,
          accuracy: loc.coords.accuracy,
          speed: loc.coords.speed ?? 0,
          heading: loc.coords.heading ?? 0,
        };
        setPoints(prev => [...prev, p]);
        updateStats();
      }
    );
  };

  const stopTracking = async () => {
    if (watchId) {
      await Location.stopLocationUpdatesAsync(watchId);
      watchId = null;
    }
    setIsTracking(false);
    await saveRoute();
  };

  const updateStats = () => {
    let dist = 0;
    for (let i = 1; i < points.length; i++) {
      dist += haversine(
        points[i-1].latitude, points[i-1].longitude,
        points[i].latitude, points[i].longitude
      );
    }
    setDistance(dist);
    setDuration(Date.now() - startTime);
  };

  const saveRoute = async () => {
    if (points.length < 2) return;
    const routeId = `route_${Date.now()}`;
    await SQLiteDB.saveRoute({
      id: routeId,
      startTime: new Date(startTime),
      endTime: new Date(),
      distance,
      duration: Math.round(duration / 1000),
      transportMode: transport,
      points,
    });
  };

  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>{isTracking ? 'Запись активна' : 'Готов к записи'}</Text>
        <Text style={styles.subtitle}>
          Транспорт: {transport} | {distance.toFixed(1)} км | {Math.round(duration / 60)} мин
        </Text>
      </View>

      <TouchableOpacity style={styles.actionButton} onPress={isTracking ? stopTracking : startTracking}>
        <Text style={styles.actionText}>{isTracking ? 'Завершить запись' : 'Начать запись'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.transportButton} onPress={() => setTransport('Пешком')}>
        <Text style={styles.transportText}>🚶 Пешком</Text>
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
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    marginTop: 8,
  },
  actionButton: {
    width: '100%',
    padding: 20,
    borderRadius: 16,
    backgroundColor: isTracking ? '#FF3B30' : '#007AFF',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  transportButton: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
  },
  transportText: {
    fontSize: 16,
    color: '#1A1A1A',
  },
});