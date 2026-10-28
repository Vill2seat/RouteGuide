import { useCallback, useState } from 'react';
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
import { SQLiteDB } from '@services/database';
import type { Route } from '@services/database';

export default function HistoryScreen() {
  const router = useRouter();
  const [routes, setRoutes] = useState<Route[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      SQLiteDB.getRoutes()
        .then(data => {
          if (active) setRoutes(data);
        })
        .catch(error => {
          console.error('Could not load route history:', error);
          Alert.alert('Ошибка', 'Не удалось загрузить историю маршрутов.');
        });
      return () => {
        active = false;
      };
    }, [])
  );

  function viewRoute(id: string) {
    router.push(`/route/${id}`);
  }

  function confirmDeleteRoute(id: string) {
    Alert.alert('Удалить маршрут?', 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          SQLiteDB.deleteRoute(id)
            .then(() => SQLiteDB.getRoutes())
            .then(setRoutes)
            .catch(error => {
              console.error('Could not delete route:', error);
              Alert.alert('Ошибка', 'Не удалось удалить маршрут.');
            });
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>История маршрутов</Text>
      </View>

      {routes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Нет сохраненных маршрутов</Text>
        </View>
      ) : (
        <FlatList
          data={routes}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.routeCard}>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.routeContent}
                onPress={() => viewRoute(item.id)}
              >
                <View style={styles.routeInfo}>
                  <Text style={styles.routeDate}>{new Date(item.startTime).toLocaleDateString('ru-RU')}</Text>
                  <Text style={styles.routeTime}>{new Date(item.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</Text>
                  <Text style={styles.routeTransport}>{item.transportMode}</Text>
                </View>
                <View style={styles.routeStats}>
                  <Text style={styles.routeDistance}>{item.distance.toFixed(1)} км</Text>
                  <Text style={styles.routeDuration}>{Math.round(item.duration / 60)} мин</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Удалить маршрут"
                style={styles.deleteButton}
                onPress={() => confirmDeleteRoute(item.id)}
              >
                <Text style={styles.deleteText}>Удалить</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/')}>
        <Text style={styles.fabText}>←</Text>
      </TouchableOpacity>
    </View>
  );
}

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
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#666666',
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
  routeContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
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
  routeTransport: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 4,
  },
  routeStats: {
    alignItems: 'flex-end',
    marginRight: 12,
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
  },
  fabText: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  deleteButton: { padding: 8 },
  deleteText: { color: '#B42318', fontSize: 13 },
});