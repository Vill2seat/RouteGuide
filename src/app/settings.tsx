import { useState } from 'react';
import {
  Alert,
  Linking,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { SQLiteDB } from '@services/database';
import { stopLocationTask } from '@services/locationService';

export default function SettingsScreen() {
  const [busy, setBusy] = useState(false);

  async function requestBackgroundPermission() {
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      if (foreground.status !== 'granted') {
        const requestedForeground = await Location.requestForegroundPermissionsAsync();
        if (requestedForeground.status !== 'granted') {
          Alert.alert('Нет доступа', 'Для фоновой записи сначала разрешите геолокацию при использовании приложения.');
          return;
        }
      }

      const background = await Location.requestBackgroundPermissionsAsync();
      if (background.status !== 'granted') {
        Alert.alert(
          'Фоновая геолокация не разрешена',
          'Разрешение можно изменить в настройках устройства.',
          [
            { text: 'Позже', style: 'cancel' },
            { text: 'Открыть настройки', onPress: () => Linking.openSettings() },
          ]
        );
      } else {
        Alert.alert('Готово', 'Фоновая геолокация разрешена. Запись включается отдельно на экране записи.');
      }
    } catch (error) {
      console.error('Could not request background location:', error);
      Alert.alert('Ошибка', 'Не удалось запросить разрешение геолокации.');
    }
  }

  async function exportData() {
    setBusy(true);
    try {
      const routes = await SQLiteDB.getRoutes();
      await Share.share({
        title: 'История Route Guide',
        message: JSON.stringify(routes, null, 2),
      });
    } catch (error) {
      console.error('Could not export route history:', error);
      Alert.alert('Ошибка', 'Не удалось подготовить экспорт истории.');
    } finally {
      setBusy(false);
    }
  }

  function confirmClearData() {
    Alert.alert('Удалить всю историю?', 'Все сохраненные маршруты будут удалены без возможности восстановления.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          stopLocationTask()
            .then(() => SQLiteDB.clearAll())
            .then(() => Alert.alert('Готово', 'История маршрутов удалена.'))
            .catch(error => {
              console.error('Could not clear route history:', error);
              Alert.alert('Ошибка', 'Не удалось удалить историю маршрутов.');
            })
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Настройки</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Запись и геолокация</Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.row}
          onPress={requestBackgroundPermission}
        >
          <Text style={styles.rowTitle}>Разрешить фоновую геолокацию</Text>
          <Text style={styles.rowAction}>Открыть</Text>
        </TouchableOpacity>
        <Text style={styles.note}>
          Запись не включается автоматически. Ее можно начать и остановить на экране маршрута.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Данные</Text>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          style={styles.row}
          onPress={exportData}
        >
          <Text style={styles.rowTitle}>Экспорт истории (JSON)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          style={styles.row}
          onPress={confirmClearData}
        >
          <Text style={styles.deleteTitle}>Удалить всю историю</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingTop: 32, paddingHorizontal: 24, marginBottom: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1A1A1A' },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  rowTitle: { fontSize: 16, color: '#1A1A1A' },
  rowAction: { color: '#168A57', fontWeight: '600' },
  note: { color: '#666666', fontSize: 13, lineHeight: 19, marginTop: 10 },
  deleteTitle: { fontSize: 16, color: '#B42318' },
});
