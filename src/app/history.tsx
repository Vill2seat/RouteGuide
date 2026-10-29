import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import type { ComponentRef } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SQLiteDB, type LocalDaySnapshot } from '@services/database';
import { recordDiagnostic } from '@services/diagnostics';
import {
  buildDayMetrics,
  buildDayTimeline,
  getLocalDateKey,
  type DayTrip,
  type DayVisit,
} from '@services/dayTimeline';
import RouteMap from '@components/RouteMap';
import DayTimeline from '@components/DayTimeline';
import BottomNav from '@components/BottomNav';
import useReducedMotion from '@hooks/useReducedMotion';
import VisitSheet from '@components/VisitSheet';
import {
  getHistoryScrollOffset,
  getHistorySelectedDate,
  setHistoryScrollOffset,
  setHistorySelectedDate,
} from '@services/screenState';

function shiftCalendarDate(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function dateFromLocalKey(value: string | string[] | undefined): Date | null {
  const key = Array.isArray(value) ? value[0] : value;
  const match = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return getLocalDateKey(date) === key ? date : null;
}

export default function HistoryScreen() {
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const reduceMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const [selectedDate, setSelectedDate] = useState(() => {
    const requestedDate = dateFromLocalKey(params.date);
    if (requestedDate) setHistorySelectedDate(requestedDate);
    return requestedDate ?? getHistorySelectedDate();
  });
  const timelineRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollRestored = useRef(false);
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [snapshot, setSnapshot] = useState<LocalDaySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVisit, setSelectedVisit] = useState<DayVisit | null>(null);
  const [mapFocus, setMapFocus] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      SQLiteDB.getLocalDaySnapshot(selectedDate)
        .then(data => {
          if (active) setSnapshot(data);
        })
        .catch(error => {
          console.error('Could not load local day history:', error);
          void recordDiagnostic('error', 'Could not load local day history');
          Alert.alert('Ошибка', 'Не удалось загрузить историю за выбранный день.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [selectedDate])
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
  const mapHeight = Math.min(350, Math.max(220, windowHeight * 0.32));
  const isToday =
    selectedDate.getFullYear() === new Date().getFullYear() &&
    selectedDate.getMonth() === new Date().getMonth() &&
    selectedDate.getDate() === new Date().getDate();
  const calendarOffset = (calendarMonth.getDay() + 6) % 7;
  const calendarDayCount = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    0
  ).getDate();
  const today = new Date();
  const isCurrentCalendarMonth =
    calendarMonth.getFullYear() === today.getFullYear() &&
    calendarMonth.getMonth() === today.getMonth();

  function selectDate(date: Date) {
    setSnapshot(null);
    setLoading(true);
    setHistorySelectedDate(date);
    setHistoryScrollOffset(0);
    scrollRestored.current = false;
    setSelectedDate(date);
    setCalendarVisible(false);
  }

  async function changeTransport(trip: DayTrip, mode: string): Promise<boolean> {
    try {
      await SQLiteDB.setTransportModeForTimeRange(trip.startTime, trip.endTime, mode);
      setSnapshot(await SQLiteDB.getLocalDaySnapshot(selectedDate));
      return true;
    } catch (error) {
      console.error('Could not correct transport mode in history:', error);
      void recordDiagnostic('error', 'Could not correct transport mode in day history');
      Alert.alert('Ошибка', 'Не удалось сохранить выбранный тип транспорта.');
      return false;
    }
  }

  async function deletePlace(id: string) {
    try {
      await SQLiteDB.deleteDayPlace(id);
      setSnapshot(await SQLiteDB.getLocalDaySnapshot(selectedDate));
    } catch (error) {
      console.error('Could not delete a place in history:', error);
      void recordDiagnostic('error', 'Could not delete a place from day history');
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
      setSnapshot(await SQLiteDB.getLocalDaySnapshot(selectedDate));
      return true;
    } catch (error) {
      console.error('Could not save a visit name in history:', error);
      void recordDiagnostic('error', 'Could not save a visit name from history');
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
      setSnapshot(await SQLiteDB.getLocalDaySnapshot(selectedDate));
      return true;
    } catch (error) {
      console.error('Could not delete a visit in history:', error);
      void recordDiagnostic('error', 'Could not delete a visit from history');
      Alert.alert('Ошибка', 'Не удалось удалить посещение.');
      return false;
    }
  }

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
          'Разрешите доступ к местоположению в настройках устройства.',
          [
            { text: 'Позже', style: 'cancel' },
            { text: 'Настройки', onPress: () => void Linking.openSettings() },
          ]
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
      console.error('Could not locate current position from history:', error);
      void recordDiagnostic('warning', 'Could not locate current position from history map');
      Alert.alert('Не удалось определить место', 'Проверьте геолокацию и попробуйте ещё раз.');
    } finally {
      setLocating(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>История</Text>
          <Text style={styles.subtitle}>Ваши места и перемещения</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Выбрать дату"
          onPress={() => {
            setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
            setCalendarVisible(true);
          }}
          style={styles.calendarButton}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Rect x={3.5} y={5} width={17} height={16} rx={2.5} stroke="#23644F" strokeWidth={1.6} />
            <Path d="M7.5 3.5v3M16.5 3.5v3M4 9.5h16" stroke="#23644F" strokeWidth={1.6} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>

      <View style={styles.dateNavigator}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Предыдущий день"
          onPress={() => selectDate(shiftCalendarDate(selectedDate, -1))}
          style={styles.dateArrow}
        >
          <Text style={styles.arrowText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.dateCenter}>
          <Text style={styles.dateTitle}>
            {selectedDate.toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
            })}
          </Text>
          <Text style={styles.dateYear}>
            {selectedDate.toLocaleDateString('ru-RU', { year: 'numeric' })}
          </Text>
          {!isToday && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => selectDate(new Date())}
              style={styles.todayButton}
            >
              <Text style={styles.todayText}>Сегодня</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Следующий день"
          accessibilityState={{ disabled: isToday }}
          disabled={isToday}
          onPress={() => selectDate(shiftCalendarDate(selectedDate, 1))}
          style={[styles.dateArrow, isToday && styles.disabledArrow]}
        >
          <Text style={styles.arrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {mapCoordinates.length > 0 || visitMarkers.length > 0 || mapFocus ? (
        <RouteMap
          key={`${snapshot?.dateKey ?? 'history'}-${mapFocus?.latitude ?? ''}-${mapFocus?.longitude ?? ''}`}
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
            {loading ? 'Загружаем историю…' : 'Нет записанных GPS-точек'}
          </Text>
          <Text style={styles.mapEmptyText}>
            {isToday
              ? 'Если запись включена, маршрут появится после получения GPS-точек.'
              : 'На выбранную дату локальная история перемещений отсутствует.'}
          </Text>
          {loading && <ActivityIndicator color="#23644F" style={styles.spinner} />}
        </View>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Показать мое местоположение на карте"
        disabled={locating}
        onPress={() => void locateMe()}
        style={[styles.locateButton, { top: 120 + mapHeight - 62 }]}
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

      <View style={styles.summary}>
        <View>
          <Text style={styles.summaryTitle}>День в деталях</Text>
          <Text style={styles.summarySubtitle}>
            {events.filter(event => event.kind === 'visit').length} мест ·{' '}
            {metrics.transportModes.length} вида транспорта
          </Text>
        </View>
        <Text style={styles.distance}>{metrics.distanceKm.toFixed(1)} км</Text>
      </View>
      {loading && !snapshot ? (
        <ActivityIndicator color="#23644F" style={styles.loading} />
      ) : (
        <ScrollView
          ref={timelineRef}
          contentContainerStyle={styles.timelineContent}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={event => setHistoryScrollOffset(event.nativeEvent.contentOffset.y)}
          onContentSizeChange={() => {
            if (scrollRestored.current) return;
            scrollRestored.current = true;
            timelineRef.current?.scrollTo({
              y: getHistoryScrollOffset(),
              animated: false,
            });
          }}
        >
          <DayTimeline
            events={events}
            onChangeTransport={changeTransport}
            onOpenVisit={setSelectedVisit}
            onDeletePlace={id => void deletePlace(id)}
          />
          {metrics.movingSeconds > 0 && (
            <Text style={styles.movingSummary}>
              Время в движении: {Math.round(metrics.movingSeconds / 60)} мин. Остановки в него не включены.
            </Text>
          )}
        </ScrollView>
      )}

      <BottomNav active="history" />
      <Modal
        animationType={reduceMotion ? 'none' : 'slide'}
        transparent
        visible={calendarVisible}
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Закрыть календарь"
            onPress={() => setCalendarVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.calendarSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.monthHeader}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Предыдущий месяц"
                onPress={() =>
                  setCalendarMonth(month =>
                    new Date(month.getFullYear(), month.getMonth() - 1, 1)
                  )
                }
                style={styles.monthArrow}
              >
                <Text style={styles.arrowText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.monthTitle}>
                {calendarMonth.toLocaleDateString('ru-RU', {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Следующий месяц"
                accessibilityState={{ disabled: isCurrentCalendarMonth }}
                disabled={isCurrentCalendarMonth}
                onPress={() =>
                  setCalendarMonth(month =>
                    new Date(month.getFullYear(), month.getMonth() + 1, 1)
                  )
                }
                style={styles.monthArrow}
              >
                <Text style={[styles.arrowText, isCurrentCalendarMonth && styles.disabledText]}>
                  ›
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.calendarGrid}>
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                <Text key={day} style={styles.weekday}>
                  {day}
                </Text>
              ))}
              {Array.from({ length: calendarOffset }, (_, index) => (
                <View key={`empty-${index}`} style={styles.calendarDay} />
              ))}
              {Array.from({ length: calendarDayCount }, (_, index) => {
                const day = index + 1;
                const date = new Date(
                  calendarMonth.getFullYear(),
                  calendarMonth.getMonth(),
                  day
                );
                const selected =
                  date.getFullYear() === selectedDate.getFullYear() &&
                  date.getMonth() === selectedDate.getMonth() &&
                  date.getDate() === selectedDate.getDate();
                const future = date > today;
                return (
                  <TouchableOpacity
                    key={day}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: future }}
                    disabled={future}
                    onPress={() => selectDate(date)}
                    style={[styles.calendarDay, selected && styles.selectedDay]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        selected && styles.selectedDayNumber,
                        future && styles.disabledText,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => selectDate(new Date())}
              style={styles.todayCalendarButton}
            >
              <Text style={styles.todayCalendarText}>Перейти к сегодня</Text>
            </TouchableOpacity>
          </View>
        </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 7,
    paddingBottom: 6,
  },
  title: { color: '#202D26', fontSize: 25, fontWeight: '500' },
  subtitle: { color: '#7A877F', fontSize: 13, marginTop: 3 },
  calendarButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: '#E4EAE5',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNavigator: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  dateArrow: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: { color: '#526158', fontSize: 31, lineHeight: 34 },
  disabledArrow: { opacity: 0.3 },
  dateCenter: { alignItems: 'center', minWidth: 112 },
  dateTitle: { color: '#26362C', fontSize: 15, fontWeight: '600', textTransform: 'capitalize' },
  dateYear: { color: '#829087', fontSize: 10, marginTop: 1 },
  todayButton: { paddingTop: 2, paddingHorizontal: 6 },
  todayText: { color: '#23644F', fontSize: 11, fontWeight: '600' },
  map: { borderRadius: 0 },
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
    paddingHorizontal: 30,
    backgroundColor: '#E9EEEA',
  },
  mapEmptyTitle: { color: '#27362D', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  mapEmptyText: { color: '#6E7C73', fontSize: 12, lineHeight: 18, marginTop: 7, textAlign: 'center' },
  spinner: { marginTop: 12 },
  summary: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7ECE8',
  },
  summaryTitle: { color: '#26362C', fontSize: 18, fontWeight: '600' },
  summarySubtitle: { color: '#7A877F', fontSize: 11, marginTop: 3 },
  distance: { color: '#64736A', fontSize: 12 },
  timelineContent: { paddingTop: 4, paddingBottom: 18 },
  loading: { flex: 1 },
  movingSummary: {
    color: '#7A877F',
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,32,25,0.24)',
  },
  calendarSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 28,
  },
  sheetHandle: {
    width: 38,
    height: 5,
    alignSelf: 'center',
    borderRadius: 3,
    backgroundColor: '#E1E7E2',
    marginBottom: 12,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthArrow: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    color: '#26362C',
    fontSize: 17,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: '14.2857%',
    height: 36,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#7A877F',
    fontSize: 12,
  },
  calendarDay: {
    width: '14.2857%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: { color: '#26362C', fontSize: 14 },
  selectedDay: { borderRadius: 22, backgroundColor: '#23644F' },
  selectedDayNumber: { color: '#FFFFFF', fontWeight: '600' },
  disabledText: { color: '#B8C0BA' },
  todayCalendarButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#EEF4EF',
    marginTop: 14,
  },
  todayCalendarText: { color: '#23644F', fontSize: 14, fontWeight: '600' },
});
