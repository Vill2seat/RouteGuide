import { View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { SQLiteDB } from '@/services/database';
import type { Route } from '@/services/database';

export default function HomeScreen() {
  const router = useRouter();
  const [routes, setRoutes] = useState<Route[]>([]);

  useEffect(() => {
    loadRoutes();
  }, []);

  async function loadRoutes() {
    const data = await SQLiteDB.getRoutes();
    setRoutes(data);
  }

  function goToTracking() {
    router.push('/tracking');
  }

  function viewRoute(id: string) {
    router.push(`/route/${id}`);
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Route Guide</Text>
        <Text style={styles.subtitle}>{routes.length} маршрутов</Text>
      </View>

      <TouchableOpacity style={styles.fab} onPress={goToTracking}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <FlatList
        data={routes}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.routeCard} onPress={() => viewRoute(item.id)}>
            <View style={styles.routeInfo}>
              <Text style={styles.routeDate}>{new Date(item.startTime).toLocaleDateString('ru-RU')}</Text>
              <Text style={styles.routeTime}>{new Date(item.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <View style={styles.routeStats}>
              <Text style={styles.routeDistance}>{item.distance.toFixed(1)} км</Text>
              <Text style={styles.routeDuration}>{Math.round(item.duration / 60)} мин</Text>
            </View>
          </TouchableOpacity>
        )}
      />
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
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
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
  routeInfo: {
    flex: 1,
  },
  routeDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  routeTime: {
    fontSize: 14,
    color: '#666666',
    marginTop: 2,
  },
  routeStats: {
    alignItems: 'flex-end',
  },
  routeDistance: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  routeDuration: {
    fontSize: 14,
    color: '#666666',
    marginTop: 2,
  },
});