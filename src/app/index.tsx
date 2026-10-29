import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SQLiteDB, type LocalDaySnapshot } from '@services/database';
import { recordDiagnostic } from '@services/diagnostics';
import {
  disableAutomaticRecording,
  enableAutomaticRecording,
  ensureAutomaticRecording,
} from '@services/locationService';
import {
  buildDayMetrics,
  buildDayTimeline,
  getLocalDateKey,
  type DayEvent,
  type DayVisit,
  type DayTrip,
} from '@services/dayTimeline';
import { getCityConditions, type CityConditions } from '@services/cityConditions';
import RouteMap from '@components/RouteMap';
import DayTimeline from '@components/DayTimeline';
import BottomNav from '@components/BottomNav';
import RouteIcon from '@assets/icons/route.svg';
import WalkIcon from '@assets/icons/walk.svg';
import useReducedMotion from '@hooks/useReducedMotion';
import VisitSheet from '@components/VisitSheet';

export default function HomeScreen() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [snapshot, setSnapshot] = useState<LocalDaySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [cityConditions, setCityConditions] = useState<CityConditions | null>(null);
  const [conditionsLoading, setConditionsLoading] = useState(false);
  const [placeModalVisible, setPlaceModalVisible] = useState(false);
  const [placeName, setPlaceName] = useState('');
  const [savingPlace, setSavingPlace] = useState(false);
  const [mapFocus, setMapFocus] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<DayVisit | null>(null);

  const refreshDay = useCallback(async () => {
    const [enabled, data] = await Promise.all([
      SQLiteDB.isAutomaticRecordingEnabled(),
      SQLiteDB.getLocalDaySnapshot(new Date()),
    ]);
    setRecordingEnabled(enabled);
    setSnapshot(data);
    return data;
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const loadHome = async () => {
        setLoading(true);
        setCityConditions(null);
        setConditionsLoading(false);
        try {
          const [profile, permission] = await Promise.all([
            SQLiteDB.getLocalProfile(),
            Location.getForegroundPermissionsAsync(),
          ]);
          if (!active) return;
          if (!profile || permission.status !== 'granted') {
            router.replace('/onboarding');
            return;
          }

          if (await SQLiteDB.isAutomaticRecordingEnabled()) {
            await ensureAutomaticRecording();
          }
          const data = await refreshDay();
          if (!active) return;

          const latest = data.points[data.points.length - 1];
          if (latest) {
            setCityConditions(null);
            setConditionsLoading(true);
            getCityConditions({
              latitude: latest.latitude,
              longitude: latest.longitude,
            })
              .then(value => {
                if (active) setCityConditions(value);
              })
              .catch(error => {
                console.warn('City-level environmental data unavailable:', error);
                void recordDiagnostic('warning', 'City-level conditions unavailable');
              })
              .finally(() => {
                if (active) setConditionsLoading(false);
              });
          }
        } catch (error) {
          if (!active) return;
          console.error('Could not load today or resume automatic recording:', error);
          void recordDiagnostic('error', 'Could not load today or resume automatic recording');
          Alert.alert(
            'Ошибка',
            error instanceof Error ? error.message : 'Не удалось загрузить данные приложения.'
          );
        } finally {
          if (active) setLoading(false);
        }
      };
      void loadHome();

      const interval = setInterval(() => {
        if (active && AppState.currentState === 'active') {
          refreshDay().catch(error => {
            console.error('Could not refresh today timeline:', error);
            void recordDiagnostic('error', 'Could not refresh local day timeline');
          });
        }
      }, 120_000);

      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [refreshDay, router])
  );

  const points = snapshot?.points ?? [];
  const places = snapshot?.places ?? [];
  const metrics = useMemo(() => buildDayMetrics(points), [points]);
  const events = useMemo(() => buildDayTimeline(points, places), [places, points]);
  const mapCoordinates = useMemo(
    () => points.map(point => ({ latitude: point.latitude, longitude: point.longitude })),
    [points]
  );
  const visitMarkers = useMemo(
    () => {
      let number = 0;
      return events.flatMap(event =>
        event.kind === 'visit'
          ? [
              {
                id: event.visit.id,
                label: String(++number),
                latitude: event.visit.latitude,
                longitude: event.visit.longitude,
              },
            ]
          : []
      );
    },
    [events]
  );
  const mapHeight = Math.min(380, Math.max(230, windowHeight * 0.38));
  const visitCount = events.filter(event => event.kind === 'visit').length;
  const lastWalkingTrip = [...events]
    .reverse()
    .find(
      (event): event is Extract<DayEvent, { kind: 'trip' }> =>
        event.kind === 'trip' && event.trip.transportMode === 'Пешком'
    );

  async function locateMe() {
    setLocating(true);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== 'granted') {
        Alert.alert(
          'Геолокация недоступна',
          'Разрешите доступ к местоположению в настройках устройства, чтобы центрировать карту.'
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setMapFocus({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch (error) {
      console.error('Could not locate current position:', error);
      void recordDiagnostic('warning', 'Could not locate current position from today map');
      Alert.alert('Не удалось определить место', 'Проверьте геолокацию и попробуйте ещё раз.');
    } finally {
      setLocating(false);
    }
  }

  async function toggleRecording() {
    setLoading(true);
    try {
      if (recordingEnabled) {
        await disableAutomaticRecording();
        setRecordingEnabled(false);
      } else {
        await enableAutomaticRecording();
        setRecordingEnabled(true);
      }
      await refreshDay();
    } catch (error) {
      console.error('Could not update automatic recording:', error);
      void recordDiagnostic('error', 'Could not update automatic recording from today screen');
      Alert.alert(
        'Не удалось изменить запись',
        error instanceof Error ? error.message : 'Проверьте разрешение на геолокацию.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function savePlace() {
    const name = placeName.trim();
    if (!name) {
      Alert.alert('Укажите название', 'Введите название места, чтобы сохранить его в истории дня.');
      return;
    }
    setSavingPlace(true);
    try {
      const latest = points[points.length - 1];
      let location: { latitude: number; longitude: number };
      if (latest && Date.now() - latest.timestamp.getTime() < 15 * 60 * 1000) {
        location = { latitude: latest.latitude, longitude: latest.longitude };
      } else {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          throw new Error('Для добавления места разрешите доступ к геолокации.');
        }
        const fix = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        location = {
          latitude: fix.coords.latitude,
          longitude: fix.coords.longitude,
        };
      }
      await SQLiteDB.addDayPlace(new Date(), name, location);
      setPlaceName('');
      setPlaceModalVisible(false);
      await refreshDay();
    } catch (error) {
      console.error('Could not add a place to today:', error);
      void recordDiagnostic('error', 'Could not add a place to local day timeline');
      Alert.alert(
        'Не удалось добавить место',
        error instanceof Error ? error.message : 'Не удалось сохранить место.'
      );
    } finally {
      setSavingPlace(false);
    }
  }

  async function changeTransport(trip: DayTrip, mode: string): Promise<boolean> {
    try {
      await SQLiteDB.setTransportModeForTimeRange(trip.startTime, trip.endTime, mode);
      await refreshDay();
      return true;
    } catch (error) {
      console.error('Could not correct transport mode:', error);
      void recordDiagnostic('error', 'Could not save transport correction from day timeline');
      Alert.alert('Ошибка', 'Не удалось сохранить выбранный тип транспорта.');
      return false;
    }
  }

  async function deletePlace(id: string) {
    try {
      await SQLiteDB.deleteDayPlace(id);
      await refreshDay();
    } catch (error) {
      console.error('Could not delete a place from today:', error);
      void recordDiagnostic('error', 'Could not delete a place from local day timeline');
      Alert.alert('Ошибка', 'Не удалось удалить место.');
    }
  }

  async function saveVisitName(visit: DayVisit, title: string): Promise<boolean> {
    try {
      if (visit.manual) {
        await SQLiteDB.updateDayPlaceTitle(visit.id, title);
      } else {
        await SQLiteDB.addDayPlace(visit.startTime, title, {
          latitude: visit.latitude,
          longitude: visit.longitude,
        });
      }
      await refreshDay();
      return true;
    } catch (error) {
      console.error('Could not save a visit name:', error);
      void recordDiagnostic('error', 'Could not save a visit name from today map');
      Alert.alert(
        'Не удалось сохранить место',
        error instanceof Error ? error.message : 'Попробуйте ещё раз.'
      );
      return false;
    }
  }

  async function deleteVisit(visit: DayVisit): Promise<boolean> {
    if (!visit.manual) return false;
    try {
      await SQLiteDB.deleteDayPlace(visit.id);
      await refreshDay();
      return true;
    } catch (error) {
      console.error('Could not delete a visit:', error);
      void recordDiagnostic('error', 'Could not delete a visit from today map');
      Alert.alert('Ошибка', 'Не удалось удалить посещение.');
      return false;
    }
  }

  const dayLabel = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const lastRecorded = points[points.length - 1]?.timestamp;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
          <View>
            <Text style={styles.title}>Route guide</Text>
            <Text style={styles.subtitle}>Ваш день · {dayLabel}</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Настройки и приватность"
            style={styles.profileButton}
            onPress={() => router.push('/settings')}
          >
            <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
              <Circle cx={12} cy={8} r={3.5} stroke="#23644F" strokeWidth={1.5} />
              <Path d="M5.5 20c.7-3.5 3-5.3 6.5-5.3s5.8 1.8 6.5 5.3" stroke="#23644F" strokeWidth={1.5} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
      </View>

      {mapCoordinates.length > 0 || visitMarkers.length > 0 || mapFocus ? (
        <RouteMap
          key={`${snapshot?.dateKey ?? 'today'}-${mapFocus?.latitude ?? ''}-${mapFocus?.longitude ?? ''}`}
          style={[styles.map, { height: mapHeight }]}
          coordinates={mapCoordinates}
          cameraTarget={mapFocus}
          currentLocation={mapFocus}
          visitMarkers={visitMarkers}
          onVisitPress={id => {
            const visit = events.find(
              event => event.kind === 'visit' && event.visit.id === id
            );
            if (visit?.kind === 'visit') setSelectedVisit(visit.visit);
          }}
        />
      ) : (
        <View style={[styles.mapEmpty, { height: mapHeight }]}>
          <Text style={styles.mapEmptyTitle}>
            {loading ? 'Загружаем ваш день…' : 'Маршрут дня появится здесь'}
          </Text>
          <Text style={styles.mapEmptyText}>
            {recordingEnabled
              ? 'Точки сохраняются на устройстве по мере получения GPS-сигнала.'
              : 'Запись приостановлена. Можно включить её в любой момент.'}
          </Text>
          {loading && <ActivityIndicator color="#23644F" style={styles.mapSpinner} />}
        </View>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Показать мое местоположение на карте"
        disabled={locating}
        onPress={() => void locateMe()}
        style={[styles.locateButton, { top: 78 + mapHeight - 62 }]}
      >
        {locating ? (
          <ActivityIndicator color="#23644F" />
        ) : (
          <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={8} stroke="#23644F" strokeWidth={1.6} />
            <Circle cx={12} cy={12} r={3} stroke="#23644F" strokeWidth={1.6} />
            <Path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="#23644F" strokeWidth={1.6} strokeLinecap="round" />
          </Svg>
        )}
      </TouchableOpacity>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.sheetHandle} />
        <View style={styles.dayCard}>
          <View style={styles.sectionEyebrowRow}>
            <Text style={styles.eyebrow}>ВАШ ДЕНЬ</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/history',
                  params: { date: snapshot?.dateKey ?? getLocalDateKey(new Date()) },
                })
              }
            >
              <Text style={styles.placesCount}>{visitCount} мест</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.dayTitle}>
            {lastRecorded ? 'Перемещения за сегодня' : 'Ваш день начинается'}
          </Text>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{metrics.distanceKm.toFixed(1)}</Text>
              <Text style={styles.metricLabel}>км за день</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{Math.round(metrics.movingSeconds / 60)}</Text>
              <Text style={styles.metricLabel}>мин в движении</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{metrics.transportModes.length}</Text>
              <Text style={styles.metricLabel}>вида транспорта</Text>
            </View>
          </View>

          <View style={styles.recordingCard}>
            <View style={styles.recordingStatus}>
              <View style={[styles.statusDot, recordingEnabled && styles.statusDotActive]} />
              <View style={styles.recordingCopy}>
                <Text style={styles.recordingTitle}>
                  {recordingEnabled ? 'Автоматическая запись включена' : 'Запись приостановлена'}
                </Text>
                <Text style={styles.recordingNote}>
                  {lastRecorded
                    ? `Точка обновлена в ${lastRecorded.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} · хранится на этом устройстве`
                    : 'GPS может обновляться реже для экономии батареи'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={loading}
              style={styles.pauseButton}
              onPress={() => void toggleRecording()}
            >
              <Text style={styles.pauseText}>
                {loading ? '…' : recordingEnabled ? 'Ⅱ  Пауза' : '▶  Включить'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.recommendation}
            onPress={() =>
              router.push(
                lastWalkingTrip && lastWalkingTrip.trip.points.length >= 2
                  ? {
                      pathname: '/route-planner',
                      params: {
                        originLat: String(lastWalkingTrip.trip.points[0].latitude),
                        originLon: String(lastWalkingTrip.trip.points[0].longitude),
                        destinationLat: String(
                          lastWalkingTrip.trip.points[
                            lastWalkingTrip.trip.points.length - 1
                          ].latitude
                        ),
                        destinationLon: String(
                          lastWalkingTrip.trip.points[
                            lastWalkingTrip.trip.points.length - 1
                          ].longitude
                        ),
                      },
                    }
                  : '/route-planner'
              )
            }
          >
            <WalkIcon width={24} height={24} color="#23644F" />
            <View style={styles.recommendationCopy}>
              <Text style={styles.recommendationTitle}>
                {lastWalkingTrip ? 'Сравнить пройденный путь' : 'Найти пеший маршрут'}
              </Text>
              <Text style={styles.recommendationText}>
                {lastWalkingTrip
                  ? 'Проверить варианты между началом и концом прогулки'
                  : 'Сравнить реальные варианты по времени и расстоянию'}
              </Text>
            </View>
            <RouteIcon width={18} height={18} color="#23644F" />
          </TouchableOpacity>

          <View style={styles.conditionsCard}>
            <View style={styles.conditionsHeader}>
              <Text style={styles.conditionsTitle}>Условия в районе</Text>
              {conditionsLoading && <ActivityIndicator size="small" color="#23644F" />}
            </View>
            {cityConditions ? (
              <>
                <View style={styles.conditionValues}>
                  <ConditionValue
                    label="PM₂.₅"
                    value={cityConditions.pm25.value}
                    unit={cityConditions.pm25.unit}
                  />
                  <ConditionValue
                    label="Погода"
                    value={cityConditions.temperature.value}
                    unit={cityConditions.temperature.unit}
                  />
                  <ConditionValue
                    label="Ветер"
                    value={cityConditions.windSpeed.value}
                    unit={cityConditions.windSpeed.unit}
                  />
                  <ConditionValue
                    label="Осадки"
                    value={cityConditions.precipitation.value}
                    unit={cityConditions.precipitation.unit}
                  />
                </View>
                <Text style={styles.conditionSource}>
                  {cityConditions.pm25.source}
                  {cityConditions.pm25.stale ? ' · сохранённые данные' : ''}
                </Text>
                {cityConditions.pm25.updatedAt && (
                  <Text style={styles.conditionSource}>
                    Воздух · {cityConditions.pm25.updatedAt.toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {cityConditions.temperature.updatedAt
                      ? ` · погода ${cityConditions.temperature.updatedAt.toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : ''}
                    {cityConditions.temperature.stale ? ' · часть данных устарела' : ''}
                  </Text>
                )}
                <Text style={styles.trafficUnavailable}>
                  Пробки: {cityConditions.traffic.source}
                </Text>
              </>
            ) : (
              <Text style={styles.conditionSource}>
                {conditionsLoading
                  ? 'Получаем данные Open-Meteo для района…'
                  : 'Данные о воздухе и погоде пока недоступны'}
              </Text>
            )}
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Информация об оценках условий"
            onPress={() =>
              Alert.alert(
                'Общие условия района',
                'PM₂.₅ предоставляется моделью Open-Meteo для округлённых координат района, а не датчиком на улице. Эти данные не сравнивают конкретные маршруты. Шум и пробки не измеряются.'
              )
            }
            style={styles.conditionsDisclaimer}
          >
            <Text style={styles.infoIcon}>ⓘ</Text>
            <Text style={styles.disclaimerText}>
              Показатели воздуха — модельная оценка для района, а не измерение у дороги. Они не оценивают конкретный маршрут.
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.timelineHeader}>
          <View>
            <Text style={styles.timelineTitle}>Сегодня в деталях</Text>
            <Text style={styles.timelineSubtitle}>
              {metrics.distanceKm.toFixed(1)} км · {visitCount} мест за день
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setPlaceModalVisible(true)}
            style={styles.addPlaceButton}
          >
            <Text style={styles.addPlaceText}>＋ Место</Text>
          </TouchableOpacity>
        </View>
        {loading && !snapshot ? (
          <ActivityIndicator color="#23644F" style={styles.loading} />
        ) : (
          <DayTimeline
            events={events}
            onChangeTransport={changeTransport}
            onOpenVisit={setSelectedVisit}
            onDeletePlace={id => void deletePlace(id)}
          />
        )}
      </ScrollView>

      <BottomNav active="map" />

      <Modal
        animationType={reduceMotion ? 'none' : 'slide'}
        transparent
        visible={placeModalVisible}
        onRequestClose={() => setPlaceModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, { paddingBottom: Math.max(32, insets.bottom + 16) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Добавить место</Text>
            <Text style={styles.modalText}>
              Сохраните название рядом с вашей последней GPS-точкой. Оно останется только в локальной истории.
            </Text>
            <TextInput
              accessibilityLabel="Название места"
              autoFocus
              maxLength={80}
              onChangeText={setPlaceName}
              placeholder="Например, кофейня"
              returnKeyType="done"
              style={styles.placeInput}
              value={placeName}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  setPlaceModalVisible(false);
                  setPlaceName('');
                }}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={savingPlace}
                onPress={() => void savePlace()}
                style={[styles.saveButton, savingPlace && styles.disabled]}
              >
                <Text style={styles.saveText}>{savingPlace ? 'Сохраняем…' : 'Сохранить'}</Text>
              </TouchableOpacity>
            </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
      <VisitSheet
        visit={selectedVisit}
        onClose={() => setSelectedVisit(null)}
        onSaveName={saveVisitName}
        onDelete={deleteVisit}
      />
    </SafeAreaView>
  );
}

function ConditionValue({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <View style={styles.conditionValue}>
      <Text style={styles.conditionLabel}>{label}</Text>
      <Text style={styles.conditionMetric}>
        {value === null ? '—' : `${Math.round(value)} ${unit}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { paddingBottom: 18 },
  header: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  title: { color: '#202D26', fontSize: 26, fontWeight: '500', letterSpacing: -0.5 },
  subtitle: { color: '#7A877F', fontSize: 13, marginTop: 3, textTransform: 'capitalize' },
  profileButton: {
    width: 42,
    height: 42,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E4EAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: { marginHorizontal: 0, borderRadius: 0 },
  locateButton: {
    position: 'absolute',
    right: 18,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#26362C',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  mapEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#E9EEEA',
  },
  mapEmptyTitle: { color: '#27362D', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  mapEmptyText: {
    color: '#6E7C73',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'center',
  },
  mapSpinner: { marginTop: 14 },
  sheet: {
    flex: 1,
    marginTop: -18,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    backgroundColor: '#FFFFFF',
  },
  sheetHandle: {
    width: 38,
    height: 5,
    alignSelf: 'center',
    borderRadius: 3,
    backgroundColor: '#E1E7E2',
    marginTop: 8,
    marginBottom: 6,
  },
  dayCard: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
  },
  sectionEyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#7A877F', fontSize: 10, letterSpacing: 0.5 },
  placesCount: { color: '#23644F', fontSize: 12, fontWeight: '600' },
  dayTitle: { color: '#24332A', fontSize: 23, fontWeight: '500', marginTop: 5 },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 17, marginBottom: 15 },
  metric: { flex: 1 },
  metricValue: { color: '#25342B', fontSize: 29, fontWeight: '600', fontVariant: ['tabular-nums'] },
  metricLabel: { color: '#7A877F', fontSize: 11, marginTop: 2 },
  recordingCard: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#F3F6F3',
    padding: 9,
    marginBottom: 14,
  },
  recordingStatus: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  statusDot: { width: 8, height: 8, marginTop: 4, borderRadius: 4, backgroundColor: '#9BA69E' },
  statusDotActive: { backgroundColor: '#23644F' },
  recordingCopy: { flex: 1 },
  recordingTitle: { color: '#23644F', fontSize: 12, fontWeight: '600' },
  recordingNote: { color: '#738078', fontSize: 10, lineHeight: 15, marginTop: 3 },
  pauseButton: {
    minHeight: 42,
    minWidth: 94,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
  },
  pauseText: { color: '#23644F', fontSize: 12, fontWeight: '600' },
  recommendation: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    backgroundColor: '#ECF3EE',
    paddingHorizontal: 17,
    paddingVertical: 12,
    marginBottom: 12,
  },
  recommendationCopy: { flex: 1 },
  recommendationTitle: { color: '#23644F', fontSize: 15, fontWeight: '600' },
  recommendationText: { color: '#537361', fontSize: 12, lineHeight: 17, marginTop: 3 },
  conditionsCard: {
    borderWidth: 1,
    borderColor: '#EDF0ED',
    borderRadius: 14,
    padding: 13,
  },
  conditionsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  conditionsTitle: { color: '#38483E', fontSize: 13, fontWeight: '600' },
  conditionValues: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 12 },
  conditionValue: { flex: 1 },
  conditionLabel: { color: '#849087', fontSize: 10 },
  conditionMetric: { color: '#314138', fontSize: 12, fontWeight: '600', marginTop: 4 },
  conditionSource: { color: '#849087', fontSize: 10, lineHeight: 15, marginTop: 10 },
  trafficUnavailable: { color: '#849087', fontSize: 10, lineHeight: 15, marginTop: 3 },
  conditionsDisclaimer: { flexDirection: 'row', gap: 6, marginTop: 10 },
  infoIcon: { color: '#718078', fontSize: 12 },
  disclaimerText: { flex: 1, color: '#7E8982', fontSize: 10, lineHeight: 15 },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 5,
    paddingBottom: 4,
  },
  timelineTitle: { color: '#25342B', fontSize: 19, fontWeight: '600' },
  timelineSubtitle: { color: '#7A877F', fontSize: 11, marginTop: 3 },
  addPlaceButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#EEF4EF',
    paddingHorizontal: 13,
  },
  addPlaceText: { color: '#23644F', fontSize: 12, fontWeight: '600' },
  loading: { padding: 30 },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,32,25,0.28)',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 32,
  },
  modalHandle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    borderRadius: 2,
    backgroundColor: '#D8E0DA',
    marginBottom: 18,
  },
  modalTitle: { color: '#25342B', fontSize: 20, fontWeight: '600' },
  modalText: { color: '#748078', fontSize: 13, lineHeight: 19, marginTop: 7 },
  placeInput: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#D8E1DB',
    borderRadius: 12,
    paddingHorizontal: 13,
    color: '#25342B',
    marginTop: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F3F6F3',
  },
  cancelText: { color: '#526158', fontWeight: '600' },
  saveButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#23644F',
  },
  saveText: { color: '#FFFFFF', fontWeight: '600' },
  disabled: { opacity: 0.55 },
});
