import { useMemo, useState } from 'react';
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
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import WalkIcon from '@assets/icons/walk.svg';
import AirIcon from '@assets/icons/air.svg';
import NoiseIcon from '@assets/icons/noise.svg';
import {
  getRouteRecommendations,
  type Coordinate,
  type RouteCandidate,
} from '@services/routeQuality';
import { recommendRouteIndex } from '@services/routeRecommendation';

const OWN_LOCATION = 'Мое местоположение';

export default function RoutePlannerScreen() {
  const router = useRouter();
  const [origin, setOrigin] = useState(OWN_LOCATION);
  const [destination, setDestination] = useState('');
  const [locationDisclosureAccepted, setLocationDisclosureAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<RouteCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recommendedId, setRecommendedId] = useState<string | null>(null);

  const selected = useMemo(
    () => candidates.find(candidate => candidate.id === selectedId) ?? null,
    [candidates, selectedId]
  );
  const fastestDuration = candidates.length
    ? Math.min(...candidates.map(candidate => candidate.durationMinutes))
    : 0;

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
    if (!destination.trim()) {
      Alert.alert('Укажите пункт назначения', 'Введите адрес или название места.');
      return;
    }
    if (!locationDisclosureAccepted) {
      Alert.alert(
        'Подтвердите передачу координат',
        'Для поиска и оценки маршрута точка начала и пункт назначения будут переданы сервисам маршрутизации и экологических данных.'
      );
      return;
    }

    setLoading(true);
    setCandidates([]);
    setSelectedId(null);
    setRecommendedId(null);
    try {
      const [start, end] = await Promise.all([
        resolveAddress(origin, origin.trim().toLocaleLowerCase('ru-RU') === OWN_LOCATION.toLocaleLowerCase('ru-RU')),
        resolveAddress(destination, false),
      ]);
      const results = await getRouteRecommendations(start, end);
      setCandidates(results);
      const recommendedIndex = recommendRouteIndex(results);
      const recommended = results[recommendedIndex] ?? null;
      setRecommendedId(recommended?.id ?? null);
      setSelectedId(recommended?.id ?? null);
    } catch (error) {
      console.error('Could not generate route recommendations:', error);
      Alert.alert(
        'Не удалось построить маршруты',
        error instanceof Error ? error.message : 'Проверьте адреса и подключение к интернету.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.back}>← Назад</Text>
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <WalkIcon width={28} height={28} color="#168A57" />
          <Text style={styles.title}>Чистый маршрут</Text>
        </View>
        <Text style={styles.subtitle}>
          Сравним варианты пешего маршрута по времени, расчетному качеству воздуха и приблизительной близости к крупным дорогам.
        </Text>
        {Platform.OS === 'android' &&
          !Constants.expoConfig?.extra?.googleMapsConfigured && (
            <Text style={styles.keyWarning}>
              Карта Android требует GOOGLE_MAPS_ANDROID_API_KEY. Маршрут и оценка могут быть доступны, но подложка Google Maps не загрузится до настройки ключа.
            </Text>
          )}

        <Text style={styles.label}>Откуда</Text>
        <TextInput
          accessibilityLabel="Начальная точка"
          value={origin}
          onChangeText={setOrigin}
          placeholder="Адрес или «Мое местоположение»"
          style={styles.input}
        />
        <Text style={styles.label}>Куда</Text>
        <TextInput
          accessibilityLabel="Пункт назначения"
          value={destination}
          onChangeText={setDestination}
          placeholder="Адрес или название места"
          style={styles.input}
        />

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
          Разрешаю передать адреса геокодеру устройства (Apple/Google), а координаты — OpenStreetMap/Valhalla, Open-Meteo и Overpass для расчета маршрута и оценки среды.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={loading}
          style={[styles.primaryButton, loading && styles.disabled]}
          onPress={findRoutes}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Найти варианты</Text>
          )}
        </TouchableOpacity>

        {selected && selected.coordinates.length > 1 && (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: selected.coordinates[0].latitude,
              longitude: selected.coordinates[0].longitude,
              latitudeDelta: 0.06,
              longitudeDelta: 0.06,
            }}
          >
            <Polyline
              coordinates={selected.coordinates}
              strokeColor="#168A57"
              strokeWidth={5}
            />
          </MapView>
        )}

        {candidates.map((candidate, index) => (
          <TouchableOpacity
            key={candidate.id}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedId === candidate.id }}
            style={[
              styles.card,
              selectedId === candidate.id && styles.selectedCard,
            ]}
            onPress={() => setSelectedId(candidate.id)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {candidate.id === recommendedId
                  ? 'Рекомендуем'
                  : `Вариант ${index + 1}`}
              </Text>
              <Text style={styles.score}>
                {candidate.qualityScore === null
                  ? 'Нет оценки'
                  : `${Math.round(candidate.qualityScore)}/100`}
              </Text>
            </View>
            <Text style={styles.routeStats}>
              {candidate.distanceKm.toFixed(1)} км · {Math.round(candidate.durationMinutes)} мин
              {candidate.durationMinutes > fastestDuration
                ? ` · +${Math.round(candidate.durationMinutes - fastestDuration)} мин к быстрому`
                : ''}
            </Text>
            <View style={styles.environmentRow}>
              <AirIcon width={18} height={18} color="#537A68" />
              <Text style={styles.environmentText}>
                PM2.5: {candidate.pm25 === null ? 'нет данных' : `${candidate.pm25.toFixed(1)} мкг/м³ (модель)`}
              </Text>
            </View>
            <View style={styles.environmentRow}>
              <NoiseIcon width={18} height={18} color="#537A68" />
              <Text style={styles.environmentText}>
                Шум: прокси по близости к крупным дорогам, не dB
                {candidate.majorRoadExposure === null
                  ? ' · нет данных'
                  : ` · экспозиция ${Math.round(candidate.majorRoadExposure * 100)}%`}
              </Text>
            </View>
            {candidate.greenSpaceScore !== null && (
              <Text style={styles.greenText}>
                Парки поблизости (OSM): {Math.round(candidate.greenSpaceScore * 100)}% выборки
              </Text>
            )}
            <Text style={styles.source}>{candidate.scoreSource}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.disclaimer}>
          Данные и рейтинги приблизительные, могут быть устаревшими или отсутствовать. Это не измерение загрязнения на улице, уровня шума в dB или медицинская рекомендация. Публичные сервисы предназначены для прототипа и могут ограничивать запросы.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 18, paddingBottom: 36 },
  back: { color: '#168A57', fontSize: 16, marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 27, fontWeight: '700', color: '#1A1A1A' },
  subtitle: { color: '#5D665F', lineHeight: 21, marginTop: 10, marginBottom: 20 },
  keyWarning: {
    color: '#7A4B00',
    backgroundColor: '#FFF6E5',
    borderRadius: 8,
    padding: 10,
    lineHeight: 18,
    marginBottom: 14,
  },
  label: { color: '#34433A', fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#CCD8D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
    color: '#1A1A1A',
  },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginVertical: 8 },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: '#87968B',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#168A57', borderColor: '#168A57' },
  checkmark: { color: '#FFFFFF', fontWeight: '700' },
  consentText: { flex: 1, color: '#46534A', fontSize: 13, lineHeight: 19 },
  primaryButton: {
    backgroundColor: '#168A57',
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  map: { height: 270, borderRadius: 12, marginBottom: 14 },
  card: {
    borderWidth: 1,
    borderColor: '#E1E7E3',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  selectedCard: { borderColor: '#168A57', backgroundColor: '#F6FBF7' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#1D2922' },
  score: { color: '#168A57', fontWeight: '700' },
  routeStats: { marginTop: 6, marginBottom: 10, color: '#424D46' },
  environmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
  environmentText: { flex: 1, color: '#46534A', fontSize: 13, lineHeight: 18 },
  greenText: { color: '#537A68', marginTop: 7, fontSize: 13 },
  source: { color: '#747E77', fontSize: 11, lineHeight: 16, marginTop: 10 },
  disclaimer: { color: '#747E77', fontSize: 12, lineHeight: 18, marginTop: 14 },
});
