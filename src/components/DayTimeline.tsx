import { useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { DayEvent, DayTrip, DayVisit } from '@services/dayTimeline';
import useReducedMotion from '@hooks/useReducedMotion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TransportGlyph from '@components/TransportGlyph';

type DayTimelineProps = {
  events: DayEvent[];
  onChangeTransport: (trip: DayTrip, mode: string) => Promise<boolean>;
  onOpenVisit: (visit: DayVisit) => void;
  onDeletePlace: (id: string) => void;
};

const transportModes = [
  'Пешком',
  'Велосипед',
  'Автомобиль',
  'Автобус',
  'Поезд/метро',
  'Мотоцикл',
  'Другое',
  'Неизвестно',
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DayTimeline({
  events,
  onChangeTransport,
  onOpenVisit,
  onDeletePlace,
}: DayTimelineProps) {
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [transportTrip, setTransportTrip] = useState<DayTrip | null>(null);
  const [selectedMode, setSelectedMode] = useState('');
  const [savingTransport, setSavingTransport] = useState(false);

  async function saveTransportMode() {
    if (!transportTrip || !selectedMode || savingTransport) return;
    setSavingTransport(true);
    try {
      if (await onChangeTransport(transportTrip, selectedMode)) {
        setTransportTrip(null);
      }
    } finally {
      setSavingTransport(false);
    }
  }

  function closeTransportEditor() {
    if (
      transportTrip &&
      selectedMode !== transportTrip.transportMode
    ) {
      Alert.alert(
        'Отменить изменения?',
        'Выбранный вид транспорта не будет сохранён.',
        [
          { text: 'Продолжить редактирование', style: 'cancel' },
          {
            text: 'Отменить',
            style: 'destructive',
            onPress: () => setTransportTrip(null),
          },
        ]
      );
      return;
    }
    setTransportTrip(null);
  }

  if (!events.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Перемещения за день появятся здесь</Text>
        <Text style={styles.emptyText}>
          Запись зависит от разрешений геолокации и ограничений энергосбережения устройства.
        </Text>
      </View>
    );
  }

  let visitNumber = 0;
  return (
    <View style={styles.list}>
      {events.map((event, index) => {
        if (event.kind === 'visit') {
          visitNumber += 1;
          return (
            <View key={event.visit.id} style={styles.event}>
              <Text style={styles.time}>{formatTime(event.visit.startTime)}</Text>
              <View style={styles.markerColumn}>
                <View style={styles.visitMarker}>
                  <Text style={styles.visitMarkerText}>{visitNumber}</Text>
                </View>
                {index < events.length - 1 && <View style={styles.connector} />}
              </View>
              <View style={styles.content}>
                <View style={styles.visitHeader}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Подробности: ${event.visit.title}`}
                    onPress={() => onOpenVisit(event.visit)}
                    style={styles.visitDetails}
                  >
                    <Text style={styles.title}>{event.visit.title}</Text>
                    <Text style={styles.subtitle}>
                      {event.visit.manual
                        ? 'Добавлено вами'
                        : `Остановка · до ${formatTime(event.visit.endTime)}`}
                    </Text>
                  </TouchableOpacity>
                  {event.visit.manual && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Действия для места ${event.visit.title}`}
                      onPress={() =>
                        Alert.alert(
                          event.visit.title,
                          'Выберите действие с этим местом.',
                          [
                            { text: 'Отмена', style: 'cancel' },
                            {
                              text: 'Удалить посещение',
                              style: 'destructive',
                              onPress: () => onDeletePlace(event.visit.id),
                            },
                          ]
                        )
                      }
                      style={styles.menuButton}
                    >
                      <Text style={styles.menuText}>•••</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        }

        const trip = event.trip;
        const duration = Math.max(1, Math.round(trip.durationSeconds / 60));
        const uncertain =
          trip.transportMode === 'Неизвестно' ||
          (trip.transportConfidence !== null && trip.transportConfidence < 0.6);
        return (
          <View key={trip.id} style={styles.event}>
            <Text style={styles.time}>{formatTime(trip.startTime)}</Text>
            <View style={styles.markerColumn}>
              <View style={styles.tripGlyph}>
                <TransportGlyph mode={trip.transportMode} />
              </View>
              {index < events.length - 1 && <View style={styles.connector} />}
            </View>
            <View style={styles.content}>
              <View style={styles.tripHeader}>
                <Text style={styles.title}>
                  {uncertain ? 'Транспорт не определён' : trip.transportMode}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Уточнить вид транспорта"
                  onPress={() => {
                    setSelectedMode(trip.transportMode);
                    setTransportTrip(trip);
                  }}
                  style={styles.editButton}
                >
                  <Text style={styles.editText}>{uncertain ? 'Уточнить' : 'Изменить'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitle}>
                {formatTime(trip.startTime)}–{formatTime(trip.endTime)}
              </Text>
              <Text style={styles.tripStats}>
                {duration} мин · {trip.distanceKm.toFixed(1)} км
              </Text>
            </View>
          </View>
        );
      })}
      <Modal
        animationType={reduceMotion ? 'none' : 'slide'}
        transparent
        visible={transportTrip !== null}
        onRequestClose={closeTransportEditor}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: Math.max(26, insets.bottom + 12) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Уточнить транспорт</Text>
            <Text style={styles.modalSubtitle}>
              Изменение сохранится на устройстве для выбранного отрезка.
            </Text>
            <ScrollView style={styles.modeList}>
              {transportModes.map(mode => (
                <TouchableOpacity
                  key={mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedMode === mode }}
                  onPress={() => setSelectedMode(mode)}
                  style={[styles.modeOption, selectedMode === mode && styles.selectedModeOption]}
                >
                  <Text style={[styles.modeText, selectedMode === mode && styles.selectedModeText]}>
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={closeTransportEditor}
                style={styles.dismissButton}
              >
                <Text style={styles.dismissText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={
                  savingTransport ||
                  !transportTrip ||
                  selectedMode === transportTrip.transportMode
                }
                onPress={() => void saveTransportMode()}
                style={[
                  styles.saveButton,
                  (savingTransport ||
                    !transportTrip ||
                    selectedMode === transportTrip.transportMode) &&
                    styles.disabledButton,
                ]}
              >
                <Text style={styles.saveButtonText}>
                  {savingTransport ? 'Сохраняем…' : 'Сохранить'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  event: { minHeight: 78, flexDirection: 'row', alignItems: 'stretch' },
  time: {
    width: 54,
    paddingTop: 4,
    color: '#59685F',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  markerColumn: { width: 34, alignItems: 'center' },
  marker: {
    width: 12,
    height: 12,
    marginTop: 6,
    borderRadius: 6,
    backgroundColor: '#23644F',
  },
  visitMarker: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#23644F',
    elevation: 1,
  },
  visitMarkerText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  tripGlyph: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  connector: {
    position: 'absolute',
    top: 30,
    bottom: -1,
    width: 2,
    backgroundColor: '#E1E9E3',
  },
  content: { flex: 1, paddingLeft: 7, paddingBottom: 17 },
  visitHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  visitDetails: { flex: 1 },
  menuButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { color: '#78857D', fontSize: 15, letterSpacing: 1 },
  tripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: { flexShrink: 1, color: '#202D26', fontSize: 16, fontWeight: '600' },
  subtitle: { color: '#77837B', fontSize: 12, marginTop: 3 },
  tripStats: { color: '#66746B', fontSize: 12, marginTop: 5 },
  editButton: { paddingHorizontal: 8, paddingVertical: 5 },
  editText: { color: '#23644F', fontSize: 12, fontWeight: '600' },
  empty: { paddingHorizontal: 24, paddingVertical: 32, alignItems: 'center' },
  emptyTitle: { color: '#25342B', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptyText: {
    color: '#77837B',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,32,25,0.28)',
  },
  modalCard: {
    maxHeight: '75%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 26,
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
  modalSubtitle: { color: '#748078', fontSize: 12, marginTop: 6 },
  modeList: { marginTop: 10 },
  modeOption: {
    minHeight: 48,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECE9',
  },
  selectedModeOption: { backgroundColor: '#F0F6F1', paddingHorizontal: 10 },
  modeText: { color: '#33443A', fontSize: 14 },
  selectedModeText: { color: '#23644F', fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10 },
  dismissButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F1F5F2',
    marginTop: 12,
  },
  dismissText: { color: '#526158', fontWeight: '600' },
  saveButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#23644F',
    marginTop: 12,
  },
  saveButtonText: { color: '#FFFFFF', fontWeight: '600' },
  disabledButton: { opacity: 0.45 },
});
