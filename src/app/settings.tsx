import { useEffect, useState } from 'react';
import {
  AppState,
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SQLiteDB, type DiagnosticLog } from '@services/database';
import {
  disableAutomaticRecording,
  enableAutomaticRecording,
  ensureAutomaticRecording,
  getLocationRecordingMode,
  type LocationRecordingMode,
} from '@services/locationService';
import {
  clearDiagnostics,
  readDiagnostics,
  recordDiagnostic,
} from '@services/diagnostics';

export default function SettingsScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [recordingMode, setRecordingMode] = useState<LocationRecordingMode | null>(null);
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState<
    boolean | null
  >(null);
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLog[]>([]);

  useEffect(() => {
    SQLiteDB.getLocalProfile()
      .then(profile => setProfileName(profile?.displayName ?? ''))
      .catch(error => {
        console.error('Could not load local profile:', error);
        void recordDiagnostic('error', 'Could not load local profile in settings');
      });
    SQLiteDB.isAutomaticRecordingEnabled()
      .then(setRecordingEnabled)
      .catch(error => {
        console.error('Could not load automatic recording preference:', error);
        void recordDiagnostic('error', 'Could not load automatic recording preference');
      });
    readDiagnostics()
      .then(setDiagnosticLogs)
      .catch(error => {
        console.error('Could not load local diagnostics:', error);
        void recordDiagnostic('error', 'Could not load local diagnostics');
      });

    let active = true;
    let previousState = AppState.currentState;
    const refreshSystemState = async () => {
      try {
        const [enabled, foreground] = await Promise.all([
          SQLiteDB.isAutomaticRecordingEnabled(),
          Location.getForegroundPermissionsAsync(),
        ]);
        let notificationsGranted: boolean | null = null;
        if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
          notificationsGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
        }
        let mode: LocationRecordingMode | null = null;
        if (enabled && foreground.status === 'granted') {
          const started = await ensureAutomaticRecording();
          if (started) mode = await getLocationRecordingMode();
        }
        if (!active) return;
        setRecordingEnabled(enabled);
        setRecordingMode(mode);
        setNotificationPermissionGranted(notificationsGranted);
      } catch (error) {
        console.error('Could not refresh recording state after returning to Route Guide:', error);
        void recordDiagnostic('error', 'Could not refresh recording state after system settings');
      }
    };
    void refreshSystemState();
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active' && previousState !== 'active') {
        void refreshSystemState();
      }
      previousState = state;
    });
    return () => {
      active = false;
      appStateSubscription.remove();
    };
  }, []);

  async function saveProfile() {
    try {
      await SQLiteDB.saveLocalProfile(profileName);
      await recordDiagnostic('info', 'Local profile updated');
      Alert.alert('Готово', 'Локальный профиль сохранен на этом устройстве.');
    } catch (error) {
      console.error('Could not save local profile:', error);
      await recordDiagnostic('error', 'Could not save local profile');
      Alert.alert(
        'Ошибка',
        error instanceof Error ? error.message : 'Не удалось сохранить профиль.'
      );
    }
  }

  async function toggleAutomaticRecording() {
    setBusy(true);
    try {
      if (recordingEnabled) {
        await disableAutomaticRecording();
        setRecordingEnabled(false);
        setRecordingMode(null);
      } else {
        await enableAutomaticRecording();
        setRecordingEnabled(true);
        setRecordingMode(await getLocationRecordingMode());
      }
    } catch (error) {
      console.error('Could not update automatic recording:', error);
      await recordDiagnostic('error', 'Could not update automatic recording');
      Alert.alert(
        'Ошибка записи',
        error instanceof Error ? error.message : 'Не удалось изменить настройку записи.'
      );
      setRecordingMode(null);
    } finally {
      setBusy(false);
    }
  }

  async function requestNotificationPermission() {
    if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
    setBusy(true);
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      const granted = result === PermissionsAndroid.RESULTS.GRANTED;
      setNotificationPermissionGranted(granted);
      if (!granted) {
        Alert.alert(
          'Уведомления выключены',
          'Запись маршрута продолжит работать, но системное уведомление о фоновой записи может быть скрыто.',
          [
            { text: 'Позже', style: 'cancel' },
            { text: 'Настройки приложения', onPress: () => void openAppSettings() },
          ]
        );
      }
    } catch (error) {
      console.error('Could not request notification permission:', error);
      void recordDiagnostic('error', 'Could not request Android notification permission');
      Alert.alert('Ошибка', 'Не удалось запросить разрешение на уведомления.');
    } finally {
      setBusy(false);
    }
  }

  async function openAppSettings() {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error('Could not open application settings:', error);
      void recordDiagnostic('error', 'Could not open Android application settings');
      Alert.alert('Ошибка', 'Не удалось открыть настройки приложения.');
    }
  }

  async function requestBackgroundPermission() {
    setBusy(true);
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
            { text: 'Открыть настройки', onPress: () => void openAppSettings() },
          ]
        );
      } else {
        const enabled = await SQLiteDB.isAutomaticRecordingEnabled();
        if (enabled) {
          await enableAutomaticRecording();
          setRecordingMode(await getLocationRecordingMode());
        }
        Alert.alert(
          'Готово',
          'Фоновая геолокация разрешена. Автоматическая запись будет продолжаться при заблокированном экране.'
        );
      }
    } catch (error) {
      console.error('Could not request background location:', error);
      await recordDiagnostic('error', 'Could not request background location permission');
      Alert.alert('Ошибка', 'Не удалось запросить разрешение геолокации.');
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    setBusy(true);
    try {
      const routes = await SQLiteDB.getRoutes();
      const fullRoutes = await Promise.all(
        routes.map(route => SQLiteDB.getRouteById(route.id))
      );
      const places = await SQLiteDB.getAllDayPlaces();
      await Share.share({
        title: 'История Route Guide',
        message: JSON.stringify(
          { routes: fullRoutes.filter(Boolean), places },
          null,
          2
        ),
      });
    } catch (error) {
      console.error('Could not export route history:', error);
      await recordDiagnostic('error', 'Could not export route history');
      Alert.alert('Ошибка', 'Не удалось подготовить экспорт истории.');
    } finally {
      setBusy(false);
    }
  }

  async function exportDiagnostics() {
    setBusy(true);
    try {
      const logs = await readDiagnostics();
      await Share.share({
        title: 'Диагностика Route Guide',
        message: JSON.stringify(logs.slice(0, 100), null, 2),
      });
    } catch (error) {
      console.error('Could not export local diagnostics:', error);
      await recordDiagnostic('error', 'Could not export local diagnostics');
      Alert.alert('Ошибка', 'Не удалось подготовить диагностические логи.');
    } finally {
      setBusy(false);
    }
  }

  function confirmClearDiagnostics() {
    Alert.alert(
      'Удалить диагностические логи?',
      'Логи хранятся только на устройстве. После удаления восстановить их нельзя.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            clearDiagnostics()
              .then(() => {
                setDiagnosticLogs([]);
                Alert.alert('Готово', 'Локальные логи удалены.');
              })
              .catch(error => {
                console.error('Could not clear local diagnostics:', error);
                void recordDiagnostic('error', 'Could not clear local diagnostics');
                Alert.alert('Ошибка', 'Не удалось удалить диагностические логи.');
              })
              .finally(() => setBusy(false));
          },
        },
      ]
    );
  }

  function confirmClearData() {
    Alert.alert('Удалить всю историю?', 'Все сохраненные маршруты будут удалены без возможности восстановления.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          disableAutomaticRecording()
            .then(() => SQLiteDB.clearAll())
            .then(() => Alert.alert('Готово', 'История маршрутов удалена.'))
            .catch(error => {
              console.error('Could not clear route history:', error);
              void recordDiagnostic('error', 'Could not clear route history');
              Alert.alert('Ошибка', 'Не удалось удалить историю маршрутов.');
            })
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  function confirmDeleteAllLocalData() {
    Alert.alert(
      'Удалить профиль и все данные?',
      'Будут удалены профиль, маршруты и диагностические логи с этого устройства. Это нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить всё',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            disableAutomaticRecording()
              .then(() => SQLiteDB.clearAllLocalData())
              .then(() => router.replace('/onboarding'))
              .catch(error => {
                console.error('Could not delete all local data:', error);
                Alert.alert('Ошибка', 'Не удалось удалить локальные данные.');
              })
              .finally(() => setBusy(false));
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Настройки</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Локальный профиль</Text>
        <Text style={styles.note}>
          Профиль и история хранятся в зашифрованной локальной базе приложения на этом устройстве. Route Guide не загружает и не продаёт вашу историю. Запросы карты, маршрутизации и погоды/воздуха передают необходимую информацию соответствующим поставщикам, которые применяют собственные правила обработки.
        </Text>
        <TextInput
          accessibilityLabel="Имя локального профиля"
          autoCapitalize="words"
          maxLength={50}
          onChangeText={setProfileName}
          placeholder="Имя"
          style={styles.input}
          value={profileName}
        />
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          style={styles.actionButton}
          onPress={saveProfile}
        >
          <Text style={styles.actionText}>Сохранить профиль</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Запись и геолокация</Text>
        <TouchableOpacity
          accessibilityRole="switch"
          accessibilityState={{ checked: recordingEnabled }}
          disabled={busy}
          style={styles.row}
          onPress={toggleAutomaticRecording}
        >
          <Text style={styles.rowTitle}>
            {recordingEnabled ? 'Автоматическая запись включена' : 'Автоматическая запись выключена'}
          </Text>
          <Text style={styles.rowAction}>
            {recordingEnabled ? 'Выключить' : 'Включить'}
          </Text>
        </TouchableOpacity>
        {Platform.OS === 'android' && Number(Platform.Version) >= 33 && (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy}
            style={styles.row}
            onPress={requestNotificationPermission}
          >
            <Text style={styles.rowTitle}>Разрешить уведомления записи</Text>
            <Text style={styles.rowAction}>
              {notificationPermissionGranted === null
                ? 'Проверка…'
                : notificationPermissionGranted
                  ? 'Разрешены'
                  : 'Включить'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          style={styles.row}
          onPress={requestBackgroundPermission}
        >
          <Text style={styles.rowTitle}>Разрешить фоновую геолокацию</Text>
          <Text style={styles.rowAction}>Открыть</Text>
        </TouchableOpacity>
        <Text style={styles.note}>
            По умолчанию запись запускается после разрешения геолокации. Периодические сбалансированные GPS-фиксации позволяют отмечать остановки и без перемещения; ОС всё равно может ограничивать обновления. Если разрешена геолокация только при использовании приложения, запись продолжается только пока приложение открыто.
        </Text>
        <Text style={styles.note}>
          Режим записи: {recordingMode === 'background'
            ? 'в фоне'
            : recordingMode === 'foreground'
              ? 'только при открытом приложении'
              : recordingEnabled
                ? 'не запущен — откройте приложение и проверьте разрешение'
                : 'выключен'}
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Диагностика на устройстве</Text>
        <Text style={styles.note}>
          Сохраняются технические события без GPS-координат. Хранится не более 500 записей; логи никуда не отправляются.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          style={styles.row}
          onPress={exportDiagnostics}
        >
          <Text style={styles.rowTitle}>Экспортировать последние 100 логов</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          style={styles.row}
          onPress={confirmClearDiagnostics}
        >
          <Text style={styles.deleteTitle}>Удалить диагностические логи</Text>
        </TouchableOpacity>
        {diagnosticLogs.length === 0 ? (
          <Text style={styles.logEntry}>Пока нет записанных событий.</Text>
        ) : (
          diagnosticLogs.slice(0, 5).map((log, index) => (
            <Text key={`${log.createdAt.toISOString()}-${index}`} style={styles.logEntry}>
              {log.createdAt.toLocaleString('ru-RU')} · {log.level.toUpperCase()} · {log.message}
            </Text>
          ))
        )}
      </View>
      <View style={styles.section}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          style={styles.row}
          onPress={confirmDeleteAllLocalData}
        >
          <Text style={styles.deleteTitle}>Удалить профиль и все локальные данные</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { paddingBottom: 36 },
  header: { paddingTop: 16, paddingHorizontal: 24, marginBottom: 16 },
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
  rowTitle: { flex: 1, flexShrink: 1, fontSize: 16, color: '#1A1A1A' },
  rowAction: { flexShrink: 1, marginLeft: 12, color: '#168A57', fontWeight: '600' },
  note: { color: '#666666', fontSize: 13, lineHeight: 19, marginTop: 10 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#CCD8D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginTop: 12,
    color: '#1A1A1A',
  },
  actionButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#F2F5F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#168A57', fontSize: 15, fontWeight: '600' },
  logEntry: { color: '#5D665F', fontSize: 12, lineHeight: 18, marginTop: 8 },
  deleteTitle: { fontSize: 16, color: '#B42318' },
});
