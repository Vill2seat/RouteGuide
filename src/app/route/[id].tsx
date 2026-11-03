import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import RouteMap from '@components/RouteMap';
import { SQLiteDB } from '@services/database';
import type { Route } from '@services/database';
import { recordDiagnostic } from '@services/diagnostics';
import BottomNav from '@components/BottomNav';
import {
  getRouteCandidateById,
  getRouteCandidateComparison,
  getRouteProfileLabel,
  parseRouteCandidate,
  type Coordinate,
  type RouteCandidate,
} from '@services/routeService';
import * as Location from 'expo-location';

export default function RouteDetailScreen() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [route, setRoute] = useState<Route | null>(null);
  const [plannedRoute, setPlannedRoute] = useState<RouteCandidate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setRoute(null);
    setPlannedRoute(null);
    setLoading(true);
    if (!routeId) {
      setLoading(false);
      return;
    }

    const planned = getRouteCandidateById(routeId);
    if (planned) {
      setPlannedRoute(planned);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const loadRoute = async () => {
      try {
        const bookmarks = await SQLiteDB.getRouteBookmarks();
        const bookmark = bookmarks.find(item => item.id === routeId);
        if (bookmark) {
          const savedCandidate = parseRouteCandidate(bookmark.routeData, routeId);
          if (active) setPlannedRoute(savedCandidate);
          return;
        }
        const result = await SQLiteDB.getRouteById(routeId, 1_500);
        if (active) setRoute(result);
      } catch (error) {
        console.error('Could not load route details:', error);
        void recordDiagnostic('error', 'Could not load saved route details');
        Alert.alert('Ошибка', 'Не удалось загрузить маршрут.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadRoute();

    return () => {
      active = false;
    };
  }, [routeId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top', 'bottom']}>
        <ActivityIndicator />
        <Text style={styles.message}>Загрузка маршрута…</Text>
      </SafeAreaView>
    );
  }

  if (plannedRoute) {
    return (
      <PlannedRouteDetail
        route={plannedRoute}
        onBack={() => router.back()}
        onCompare={() => router.back()}
      />
    );
  }

  if (!route) {
    return (
      <SafeAreaView style={styles.centered} edges={['top', 'bottom']}>
        <Text style={styles.message}>Маршрут не найден.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backText}>Назад</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const coordinates = route.points.map(point => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
  const firstPoint = coordinates[0];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.back()}>
            <Text style={styles.backText}>← Назад</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {route.startTime.toLocaleDateString('ru-RU')}
          </Text>
        </View>

        {firstPoint ? (
          <RouteMap
            style={[styles.map, { height: Math.max(240, Math.min(480, windowHeight * 0.52)) }]}
            coordinates={coordinates}
          />
        ) : (
          <View style={styles.noPoints}>
            <Text style={styles.message}>Для этого маршрута нет сохраненных точек GPS.</Text>
          </View>
        )}

        <View style={styles.stats}>
          <Text style={styles.statLabel}>Расстояние</Text>
          <Text style={styles.statValue}>{route.distance.toFixed(2)} км</Text>
          <Text style={styles.statLabel}>Время</Text>
          <Text style={styles.statValue}>{Math.round(route.duration / 60)} мин</Text>
          <Text style={styles.statLabel}>Транспорт</Text>
          <Text style={styles.statValue}>{route.transportMode}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlannedRouteDetail({
  route,
  onBack,
  onCompare,
}: {
  route: RouteCandidate;
  onBack: () => void;
  onCompare: () => void;
}) {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const comparison = getRouteCandidateComparison(route);
  const start = route.coordinates[0];
  const destination = route.coordinates[route.coordinates.length - 1];
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);

  useEffect(() => {
    let active = true;
    SQLiteDB.getRouteBookmarks()
      .then(bookmarks => {
        if (active) setBookmarked(bookmarks.some(item => item.id === route.id));
      })
      .catch(error => {
        console.error('Could not read saved routes:', error);
        void recordDiagnostic('warning', 'Could not load locally saved routes');
      });
    return () => {
      active = false;
    };
  }, [route.id]);

  async function toggleBookmark() {
    if (bookmarkBusy) return;
    setBookmarkBusy(true);
    try {
      if (bookmarked) {
        await SQLiteDB.deleteRouteBookmark(route.id);
        setBookmarked(false);
        Alert.alert('Маршрут удалён из сохранённых');
      } else {
        await SQLiteDB.saveRouteBookmark(route.id, JSON.stringify(route));
        setBookmarked(true);
        Alert.alert('Маршрут сохранён на устройстве');
      }
    } catch (error) {
      console.error('Could not update saved route:', error);
      void recordDiagnostic('error', 'Could not update saved route bookmark');
      Alert.alert(
        'Не удалось сохранить маршрут',
        'Данные маршрута не изменены. Попробуйте ещё раз.'
      );
    } finally {
      setBookmarkBusy(false);
    }
  }

  async function openNavigation() {
    if (!start || !destination) {
      Alert.alert('Маршрут недоступен', 'У этого варианта нет корректных начальной и конечной точек.');
      return;
    }

    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== 'granted') {
        Alert.alert(
          'Нужно местоположение',
          'Чтобы проверить, находитесь ли вы в начале маршрута, разрешите доступ к геолокации.'
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (metersBetween(position.coords, start) > 150) {
        Alert.alert(
          'Вы не в начале маршрута',
          'Предлагается новый путь от текущего места к тому же пункту назначения. Время и геометрия будут рассчитаны заново.',
          [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Построить от меня',
              onPress: () =>
                router.push({
                  pathname: '/route-planner',
                  params: {
                    originLat: String(position.coords.latitude),
                    originLon: String(position.coords.longitude),
                    destinationLat: String(destination.latitude),
                    destinationLon: String(destination.longitude),
                    context: 'recalculated',
                    profile: route.profile,
                  },
                }),
            },
          ]
        );
        return;
      }

      const url =
        Platform.OS === 'ios'
          ? `http://maps.apple.com/?saddr=${start.latitude},${start.longitude}&daddr=${destination.latitude},${destination.longitude}&dirflg=w`
          : `google.navigation:q=${destination.latitude},${destination.longitude}&mode=w`;
      await Linking.openURL(url);
    } catch (error) {
      console.error('Could not hand off planned route to navigation:', error);
      void recordDiagnostic('warning', 'Could not open planned route in external navigation');
      Alert.alert(
        'Не удалось открыть Карты',
        'Проверьте, что на устройстве установлено совместимое приложение карт.'
      );
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.plannedHeader}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Назад к сравнению"
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.plannedBackText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.plannedHeading}>
          <Text style={styles.plannedTitle}>
            {comparison.status === 'fastest'
              ? 'По самому быстрому пути'
              : comparison.status === 'alternative'
                ? 'Альтернативный маршрут'
                : 'Маршрутный вариант'}
          </Text>
          <Text style={styles.plannedSubtitle}>
            {getRouteProfileLabel(route.profile)} · маршрут из дорожной сети
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={bookmarked ? 'Удалить сохранённый маршрут' : 'Сохранить маршрут'}
          accessibilityState={{ checked: bookmarked, disabled: bookmarkBusy }}
          disabled={bookmarkBusy}
          onPress={() => void toggleBookmark()}
          style={styles.bookmarkButton}
        >
          <Text style={styles.bookmarkIcon}>{bookmarked ? '♥' : '♡'}</Text>
        </TouchableOpacity>
      </View>
      <RouteMap
        key={route.id}
        style={[styles.plannedMap, { height: Math.max(260, windowHeight * 0.43) }]}
        coordinates={route.coordinates}
        routeColor="#23644F"
      />
      <ScrollView
        style={styles.plannedSheet}
        contentContainerStyle={styles.plannedContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.sheetHandle} />
        <View style={styles.plannedMetrics}>
          <Text style={styles.plannedDuration}>
            {Math.round(route.durationMinutes)} мин
          </Text>
          <Text style={styles.plannedDistance}>{route.distanceKm.toFixed(1)} км</Text>
        </View>
        <Text style={styles.comparisonHint}>
          {comparison.status === 'fastest'
            ? 'Самый быстрый из найденных вариантов по расчётному времени.'
            : comparison.status === 'alternative'
              ? `${comparison.minutesSlower} мин дольше самого быстрого варианта.`
              : 'Сравнение с другими вариантами недоступно.'}
        </Text>

        <Text style={styles.conditionsHeading}>Условия на маршруте</Text>
        <View style={styles.environmentGrid}>
          <View style={styles.environmentCard}>
            <Text style={styles.environmentLabel}>Шум · дБ</Text>
            <Text style={styles.environmentValue}>Нет данных</Text>
          </View>
          <View style={styles.environmentCard}>
            <Text style={styles.environmentLabel}>PM₂.₅</Text>
            <Text style={styles.environmentValue}>Нет данных</Text>
          </View>
        </View>
        <Text style={styles.conditionsExplanation}>
          Для сравнения улиц нет подтверждённых данных о шуме и загрязнении. Общая
          модель воздуха для района не описывает условия вдоль этого пути.
        </Text>
        <Text style={styles.conditionsSource}>
          Внешние Карты пересчитают маршрут; выбранная линия Route Guide не передаётся
          как готовый навигационный трек.
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={onCompare}
          style={styles.compareButton}
        >
          <Text style={styles.compareText}>Сравнить варианты</Text>
          <Text style={styles.compareArrow}>↔</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => void openNavigation()}
          style={styles.startButton}
        >
          <Text style={styles.startButtonText}>Открыть в Картах</Text>
          <Text style={styles.startArrow}>➤</Text>
        </TouchableOpacity>
      </ScrollView>
      <BottomNav active="routes" />
    </SafeAreaView>
  );
}

function metersBetween(first: Coordinate, second: Coordinate): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude = radians(second.latitude - first.latitude);
  const longitude = radians(second.longitude - first.longitude);
  const value =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flexGrow: 1, paddingBottom: 12 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  message: { color: '#666666', marginTop: 12, textAlign: 'center' },
  header: {
    paddingTop: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  backText: { fontSize: 16, color: '#168A57' },
  title: { flexShrink: 1, fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' },
  map: { marginHorizontal: 16 },
  noPoints: {
    minHeight: 240,
    marginHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    padding: 24,
  },
  stats: { padding: 16, backgroundColor: '#F9F9F9' },
  statLabel: { fontSize: 14, color: '#666666', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 },
  plannedHeader: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backButton: {
    width: 42,
    height: 48,
    justifyContent: 'center',
  },
  plannedBackText: { color: '#26362C', fontSize: 32, lineHeight: 36 },
  plannedHeading: { flex: 1, paddingLeft: 8 },
  plannedTitle: { color: '#202D26', fontSize: 20, fontWeight: '500' },
  plannedSubtitle: { color: '#7A877F', fontSize: 12, marginTop: 3 },
  bookmarkButton: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderColor: '#E4EAE5',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  bookmarkIcon: { color: '#23644F', fontSize: 23 },
  plannedMap: { borderRadius: 0 },
  plannedSheet: {
    flex: 1,
    marginTop: -18,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    backgroundColor: '#FFFFFF',
  },
  plannedContent: { paddingHorizontal: 22, paddingBottom: 20 },
  sheetHandle: {
    width: 38,
    height: 5,
    alignSelf: 'center',
    borderRadius: 3,
    backgroundColor: '#E1E7E2',
    marginTop: 8,
    marginBottom: 15,
  },
  plannedMetrics: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  plannedDuration: {
    color: '#25342B',
    fontSize: 31,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  plannedDistance: { color: '#7A877F', fontSize: 15 },
  comparisonHint: { color: '#738078', fontSize: 13, marginTop: 4, marginBottom: 20 },
  conditionsHeading: { color: '#26362C', fontSize: 17, fontWeight: '500', marginBottom: 10 },
  environmentGrid: { flexDirection: 'row', gap: 10 },
  environmentCard: {
    flex: 1,
    minHeight: 82,
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#F3F5F3',
    paddingHorizontal: 14,
  },
  environmentLabel: { color: '#68766D', fontSize: 12 },
  environmentValue: { color: '#26362C', fontSize: 16, fontWeight: '600', marginTop: 6 },
  conditionsExplanation: { color: '#68766D', fontSize: 13, lineHeight: 19, marginTop: 16 },
  conditionsSource: { color: '#879189', fontSize: 11, lineHeight: 16, marginTop: 9 },
  compareButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 15,
    backgroundColor: '#ECF3EE',
    paddingHorizontal: 16,
    marginTop: 20,
  },
  compareText: { color: '#23644F', fontSize: 14, fontWeight: '600' },
  compareArrow: { color: '#23644F', fontSize: 22 },
  startButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 15,
    backgroundColor: '#23644F',
    paddingHorizontal: 18,
    marginTop: 10,
  },
  startButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  startArrow: { color: '#FFFFFF', fontSize: 18 },
});
