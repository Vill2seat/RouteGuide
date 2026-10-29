import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RouteCandidate } from '@services/routeService';

type RouteOptionCardProps = {
  candidate: RouteCandidate;
  fastestDuration: number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
};

export default function RouteOptionCard({
  candidate,
  fastestDuration,
  selected,
  onSelect,
  onOpen,
}: RouteOptionCardProps) {
  const isFastest = candidate.durationMinutes === fastestDuration;
  const extraMinutes = Math.max(0, Math.round(candidate.durationMinutes - fastestDuration));

  return (
    <View style={[styles.card, selected && styles.selectedCard]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${isFastest ? 'Самый быстрый маршрут' : 'Альтернативный маршрут'}, ${Math.round(candidate.durationMinutes)} минут, ${candidate.distanceKm.toFixed(1)} километра`}
        onPress={onSelect}
        style={styles.selection}
      >
        <View style={styles.header}>
          <Text style={styles.title}>
            {isFastest ? 'Самый быстрый' : 'Альтернативный путь'}
          </Text>
          <Text style={[styles.badge, isFastest && styles.fastestBadge]}>
            {isFastest ? 'По времени' : `+${extraMinutes} мин`}
          </Text>
        </View>
        <View style={styles.metrics}>
          <Text style={styles.duration}>{Math.round(candidate.durationMinutes)} мин</Text>
          <Text style={styles.distance}>{candidate.distanceKm.toFixed(1)} км</Text>
        </View>
        <View style={styles.conditionRow}>
          <Text style={styles.condition}>Шум: нет данных</Text>
          <Text style={styles.condition}>PM₂.₅: нет данных</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={onOpen}
        style={styles.detailsButton}
      >
        <Text style={styles.detailsText}>Подробнее о варианте</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#E2E9E4',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    overflow: 'hidden',
  },
  selectedCard: {
    borderColor: '#A8C6B3',
    backgroundColor: '#F0F6F1',
  },
  selection: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: { flex: 1, color: '#25342B', fontSize: 15, fontWeight: '600' },
  badge: { color: '#78857D', fontSize: 11, fontWeight: '600' },
  fastestBadge: { color: '#23644F' },
  metrics: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 8 },
  duration: {
    color: '#25342B',
    fontSize: 26,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  distance: { color: '#78857D', fontSize: 14 },
  conditionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  condition: { color: '#68766D', fontSize: 11 },
  detailsButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDE6DF',
    paddingHorizontal: 16,
  },
  detailsText: { color: '#23644F', fontSize: 12, fontWeight: '600' },
  chevron: { color: '#23644F', fontSize: 23, lineHeight: 24 },
});
