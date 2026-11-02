import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import RouteMap from '@components/RouteMap';
import BottomNav from '@components/BottomNav';
import RouteOptionCard from '@components/RouteOptionCard';
import { SQLiteDB } from '@services/database';
import WalkIcon from '@assets/icons/walk.svg';
import {
  assertCoordinate,
  getCurrentRouteCandidates,
  getRouteRecommendations,
  parseRouteCandidate,
  type Coordinate,
  type RouteCandidate,
} from '@services/routeService';
import { recommendRouteIndex } from '@services/routeRecommendation';
import { getCityConditions, type CityConditions } from '@services/cityConditions';
import { recordDiagnostic } from '@services/diagnostics';
import { getSelectedRouteId, setSelectedRouteId } from '@services/screenState';

const OWN_LOCATION = 'Мое местоположение';

export default function RoutePlannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    originLat?: string | string[];
    originLon?: string | string[];
    destinationLat?: string | string[];
    destinationLon?: string | string[];
    context?: string | string[];
  }>();
  const requestId = useRef(0);
  const firstParam = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const originLat = firstParam(params.originLat);
  const originLon = firstParam(params.originLon);
  const destinationLat = firstParam(params.destinationLat);
  const destinationLon = firstParam(params.destinationLon);
  const context = firstParam(params.context);
  const historyStart =
    originLat !== undefined &&
    originLon !== undefined &&
    destinationLat !== undefined &&
    destinationLon !== undefined &&
    context !== 'recalculated';
  const [useHistoryEndpoints, setUseHistoryEndpoints] = useState(historyStart);
  const [origin, setOrigin] = useState(
    historyStart ? 'Начало прогулки' : ''
  );
  const [destination, setDestination] = useState(
    historyStart ? 'Конец прогулки' : ''
  );
  const [useCoordinateEndpoints, setUseCoordinateEndpoints] = useState(historyStart);
  const [locationDisclosureAccepted, setLocationDisclosureAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conditionsLoading, setConditionsLoading] = useState(false);
  const [candidates, setCandidates] = useState<RouteCandidate[]>(getCurrentRouteCandidates);
  const [savedRoutes, setSavedRoutes] = useState<RouteCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(getSelectedRouteId);
  const [recommendedId, setRecommendedId] = useState<string | null>(() => {
    const currentCandidates = getCurrentRouteCandidates();
    return currentCandidates[recommendRouteIndex(currentCandidates)]?.id ?? null;
  });
  const [cityConditions, setCityConditions] = useState<CityConditions | null>(null);

  useEffect(
    () => () => {
      requestId.current += 1;
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      SQLiteDB.getRouteBookmarks()
        .then(bookmarks => {
          const routes: RouteCandidate[] = [];
          let invalidCount = 0;
          for (const bookmark of bookmarks) {
            try {
              routes.push(parseRouteCandidate(bookmark.routeData, bookmark.id));
            } catch (error) {
              invalidCount += 1;
              console.error('Could not read a saved route:', error);
              void recordDiagnostic('warning', 'A saved route could not be read');
            }
          }
          if (active) {
            setSavedRoutes(routes);
            if (invalidCount > 0) {
              Alert.alert(
                'Некоторые маршруты недоступны',
                'Повреждённые сохранённые маршруты не показаны.'
              );
            }
          }
        })
        .catch(error => {
          console.error('Could not load locally saved routes:', error);
          void recordDiagnostic('error', 'Could not load saved routes in planner');
          if (active) {
            Alert.alert('Ошибка', 'Не удалось загрузить сохранённые маршруты.');
          }
        });
      return () => {
        active = false;
      };
    }, [])
  );

  const selected = useMemo(
    () => candidates.find(candidate => candidate.id === selectedId) ?? null,
    [candidates, selectedId]
  );
  const fastestDuration = candidates.length
    ? Math.min(...candidates.map(candidate => candidate.durationMinutes))
    : 0;

  function selectRoute(id: string | null) {
    setSelectedId(id);
    setSelectedRouteId(id);
  }

  async function resolveAddress(value: string, useCurrentLocation: boolean): Promise<Coordinate> {
    if (useCurrentLocation) {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Для определения текущего местоположения разрешите геолокацию.');
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    }

    const results = await Location.geocodeAsync(value.trim());
    if (!results.length) {
      throw new Error(`Не удалось найти адрес «${value.trim()}».`);
    }
    return {
      latitude: results[0].latitude,
      longitude: results[0].longitude,
    };
  }

  async function findRoutes() {
    if (
      !destination.trim() &&
      !(context === 'recalculated' && destinationLat !== undefined && destinationLon !== undefined)
    ) {
      Alert.alert('Укажите пункт назначения', 'Введите адрес или название места.');
      return;
    }
    if (!locationDisclosureAccepted) {
      Alert.alert(
        'Подтвердите передачу координат',
        'Точные координаты начала и конца передаются Valhalla для построения маршрута. Open-Meteo получает только округлённые координаты района для общей оценки воздуха и погоды. История перемещений не передаётся.'
      );
      return;
    }

    const currentRequestId = ++requestId.current;
    setLoading(true);
    setConditionsLoading(false);
    setCityConditions(null);
    setCandidates([]);
    selectRoute(null);
    setRecommendedId(null);
    try {
      const startAndEnd = useCoordinateEndpoints
        ? [
            {
              latitude: Number(originLat),
              longitude: Number(originLon),
            },
            {
              latitude: Number(destinationLat),
              longitude: Number(destinationLon),
            },
          ] as const
        : await Promise.all([
            resolveAddress(
              origin,
              !origin.trim() ||
                origin.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е') ===
                  OWN_LOCATION.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е')
            ),
            destination.trim()
              ? resolveAddress(destination, false)
              : Promise.resolve({
                  latitude: Number(destinationLat),
                  longitude: Number(destinationLon),
                }),
          ]);
      const [start, end] = startAndEnd;
      // Валидируем координаты перед запросом к сервису маршрутов — невалидные координаты вызывают вылет
      assertCoordinate(start);
      assertCoordinate(end);
      const results = await getRouteRecommendations(start, end);
      if (currentRequestId !== requestId.current) return;
      setCandidates(results);
      const recommended = results[recommendRouteIndex(results)] ?? null;
      setRecommendedId(recommended?.id ?? null);
      selectRoute(recommended?.id ?? null);
      if (recommended) {
        setConditionsLoading(true);
        getCityConditions(start)
          .then(value => {
            if (currentRequestId === requestId.current) setCityConditions(value);
          })
          .catch(error => {
            console.warn('City-level conditions unavailable for route search:', error);
            void recordDiagnostic('warning', 'City-level conditions unavailable for route search');
          })
          .finally(() => {
            if (currentRequestId === requestId.current) setConditionsLoading(false);
          });
      }
    } catch (error) {
      if (currentRequestId !== requestId.current) return;
      console.error('Could not generate route recommendations:', error);
      await recordDiagnostic('error', 'Route recommendation request failed');
      Alert.alert(
        'Не удалось построить маршруты',
        error instanceof Error ? error.message : 'Проверьте адреса и подключение к интернету.'
      );
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Назад"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <View style={styles.heading}>
            <Text style={styles.title}>Как приятнее дойти</Text>
            <Text style={styles.headingSubtitle}>
              {useHistoryEndpoints
                ? 'Участок из вашей истории'
                : context === 'recalculated'
                  ? 'Новый маршрут от вашего места'
                  : 'Пешком · выберите точки'}
            </Text>
          </View>
          <WalkIcon width={22} height={22} color="#23644F" />
        </View>
        <Text style={styles.subtitle}>
          Реальные варианты пешеходных маршрутов. Данные о шуме и качестве воздуха вдоль улиц пока недоступны.
        </Text>

        <Text style={styles.label}>Откуда</Text>
        <TextInput
          accessibilityLabel="Начальная точка"
          value={origin}
          editable={!useHistoryEndpoints}
          onChangeText={value => {
            setOrigin(value);
            setUseCoordinateEndpoints(false);
          }}
          placeholder="Моё местоположение или адрес"
          style={styles.input}
        />
        <Text style={styles.label}>Куда</Text>
        <TextInput
          accessibilityLabel="Пункт назначения"
          value={destination}
          editable={!useHistoryEndpoints}
          onChangeText={value => {
            setDestination(value);
            setUseCoordinateEndpoints(false);
          }}
          placeholder="Адрес или название места"
          style={styles.input}
        />
        {context === 'recalculated' && !destination.trim() && (
          <Text style={styles.savedDestinationHint}>
            Пустое поле оставит точку назначения исходного маршрута.
          </Text>
        )}
        {useHistoryEndpoints && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setUseHistoryEndpoints(false);
              setUseCoordinateEndpoints(false);
              setOrigin('');
              setDestination('');
              setCandidates([]);
              selectRoute(null);
            }}
            style={styles.changeEndpoints}
          >
            <Text style={styles.changeEndpointsText}>Изменить точки вручную</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{ checked: locationDisclosureAccepted }}
          style={styles.consent}
          onPress={() => setLocationDisclosureAccepted(value => !value)}
        >
          <View style={[styles.checkbox, locationDisclosureAccepted && styles.checkboxChecked]}>
            {locationDisclosureAccepted && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.consentText}>
            Разрешаю передать адрес системному геокодеру, координаты Valhalla для построения и округлённые координаты Open-Meteo для данных о городе. OpenFreeMap получает запросы тайлов видимой карты. Персональная история остаётся на устройстве.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={loading}
          style={[styles.primaryButton, loading && styles.disabled]}
          onPress={() => void findRoutes()}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Найти варианты</Text>
          )}
        </TouchableOpacity>

        {cityConditions && (
          <View style={styles.conditionsCard}>
            <Text style={styles.conditionsTitle}>Общие условия в районе начала маршрута</Text>
            <Text style={styles.conditionsValue}>
              PM₂.₅: {cityConditions.pm25.value === null ? 'нет данных' : `${cityConditions.pm25.value.toFixed(1)} мкг/м³`}
              {'  ·  '}
              Погода: {cityConditions.temperature.value === null ? 'нет данных' : `${Math.round(cityConditions.temperature.value)} °C`}
            </Text>
            <Text style={styles.conditionsSource}>
              {cityConditions.pm25.source}
              {cityConditions.pm25.updatedAt
                ? ` · обновлено ${cityConditions.pm25.updatedAt.toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
              {cityConditions.pm25.stale ? ' · устаревшие данные' : ''}
            </Text>
            <Text style={styles.conditionsSource}>
              Пробки: {cityConditions.traffic.source}. Общие условия не ранжируют улицы.
            </Text>
          </View>
        )}
        {conditionsLoading && !cityConditions && (
          <View style={styles.conditionsLoading}>
            <ActivityIndicator size="small" color="#23644F" />
            <Text style={styles.conditionsSource}>Загружаем общие данные по району…</Text>
          </View>
        )}

        {candidates.length > 0 && (
          <RouteMap
            key={candidates.map(candidate => candidate.id).join('-')}
            style={styles.map}
            coordinates={selected?.coordinates ?? candidates[0].coordinates}
            alternativeRoutes={candidates.map(candidate => ({
              id: candidate.id,
              coordinates: candidate.coordinates,
              color: candidate.id === selectedId ? '#23644F' : '#87938B',
            }))}
          />
        )}

        {candidates.length > 0 && (
          <View style={styles.resultsHeading}>
            <Text style={styles.resultsTitle}>Варианты пути</Text>
            <Text style={styles.resultsCount}>
              {candidates.length} {candidates.length === 1 ? 'вариант' : 'варианта'}
            </Text>
          </View>
        )}
        {candidates.map(candidate => (
          <RouteOptionCard
            key={candidate.id}
            candidate={candidate}
            fastestDuration={fastestDuration}
            selected={selectedId === candidate.id}
            onSelect={() => selectRoute(candidate.id)}
            onOpen={() => router.push(`/route/${candidate.id}`)}
          />
        ))}
        {savedRoutes.length > 0 && (
          <View style={styles.savedRoutes}>
            <Text style={styles.resultsTitle}>Сохранённые маршруты</Text>
            {savedRoutes.map(candidate => (
              <RouteOptionCard
                key={`saved-${candidate.id}`}
                candidate={candidate}
                fastestDuration={candidate.durationMinutes}
                selected={false}
                onSelect={() => router.push(`/route/${candidate.id}`)}
                onOpen={() => router.push(`/route/${candidate.id}`)}
              />
            ))}
          </View>
        )}

        {selected && (
          <Text style={styles.disclaimer}>
            Маршрут построен Valhalla по текущей дорожной сети. Доступность пути и условия на улице могут измениться.
          </Text>
        )}
        <Text style={styles.disclaimer}>
          Маршруты предоставляются публичным Valhalla без гарантии доступности. Погодные и воздушные показатели Open-Meteo — городская модельная оценка, а не измерения на маршруте или медицинская рекомендация.
        </Text>
      </ScrollView>
      <BottomNav active="routes" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 22 },
  back: { color: '#26362C', fontSize: 31, lineHeight: 34 },
  backButton: {
    width: 38,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { flex: 1 },
  title: { flexShrink: 1, color: '#202D26', fontSize: 21, fontWeight: '500' },
  headingSubtitle: { color: '#7A877F', fontSize: 12, marginTop: 2 },
  subtitle: { color: '#68766D', fontSize: 13, lineHeight: 19, marginTop: 9, marginBottom: 15 },
  label: { color: '#34433A', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#D5DED7',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    color: '#25342B',
  },
  savedDestinationHint: {
    color: '#66736B',
    fontSize: 12,
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 8,
  },
  changeEndpoints: { alignSelf: 'flex-start', paddingVertical: 4, marginTop: -7 },
  changeEndpointsText: { color: '#23644F', fontSize: 12, fontWeight: '600' },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginVertical: 5 },
  checkbox: {
    width: 21,
    height: 21,
    borderWidth: 1,
    borderColor: '#87968B',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#23644F', borderColor: '#23644F' },
  checkmark: { color: '#FFFFFF', fontWeight: '700' },
  consentText: { flex: 1, color: '#69766E', fontSize: 11, lineHeight: 16 },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#23644F',
    marginTop: 13,
    marginBottom: 14,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  conditionsCard: {
    borderRadius: 13,
    backgroundColor: '#F1F5F2',
    padding: 13,
    marginBottom: 13,
  },
  conditionsTitle: { color: '#34473B', fontSize: 12, fontWeight: '600' },
  conditionsValue: { color: '#314138', fontSize: 12, lineHeight: 18, marginTop: 6 },
  conditionsSource: { color: '#7A877F', fontSize: 10, lineHeight: 15, marginTop: 5 },
  conditionsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
  },
  map: { height: 300, borderRadius: 18, marginTop: 4, marginBottom: 16 },
  resultsHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  resultsTitle: { color: '#26362C', fontSize: 19, fontWeight: '600' },
  resultsCount: { color: '#728077', fontSize: 12 },
  savedRoutes: { marginTop: 16 },
  disclaimer: { color: '#7A877F', fontSize: 10, lineHeight: 15, marginTop: 12 },
});
