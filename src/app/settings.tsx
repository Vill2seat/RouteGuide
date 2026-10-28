import { View, Text, StyleSheet, StatusBar, TouchableOpacity, Switch } from 'react-native';
import * as Location from 'expo-location';

export default function SettingsScreen() {
  const [backgroundTracking, setBackgroundTracking] = useState(false);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    const bg = await Location.getBackgroundPermissionsAsync();
    setBackgroundTracking(bg.status === 'granted');
  }

  async function toggleBackground() {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    setBackgroundTracking(status === 'granted');
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Настройки</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Запись и геолокация</Text>
        
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Фоновая запись</Text>
          <Switch
            value={backgroundTracking}
            onValueChange={toggleBackground}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Уведомления</Text>
        
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Уведомления о маршрутах</Text>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Данные</Text>
        
        <TouchableOpacity style={styles.row} onPress={exportData}>
          <Text style={styles.rowTitle}>Экспорт истории</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.row} onPress={clearData}>
          <Text style={styles.rowTitle} style={{ color: '#FF3B30' }}>Удалить всю историю</Text>
        </TouchableOpacity>
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
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  rowTitle: {
    fontSize: 16,
    color: '#1A1A1A',
  },
});