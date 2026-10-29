import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DayVisit } from '@services/dayTimeline';
import useReducedMotion from '@hooks/useReducedMotion';

type VisitSheetProps = {
  visit: DayVisit | null;
  onClose: () => void;
  onSaveName: (visit: DayVisit, title: string) => Promise<boolean>;
  onDelete: (visit: DayVisit) => Promise<boolean>;
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function VisitSheet({
  visit,
  onClose,
  onSaveName,
  onDelete,
}: VisitSheetProps) {
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditing(false);
    setTitle(visit?.title ?? '');
  }, [visit?.id, visit?.title]);

  async function saveName() {
    if (!visit || saving) return;
    const name = title.trim();
    if (!name) {
      Alert.alert('Укажите название', 'Введите название места.');
      return;
    }
    setSaving(true);
    try {
      if (await onSaveName(visit, name)) {
        setEditing(false);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  function closeWithoutSaving() {
    if (editing && title.trim() !== (visit?.title ?? '')) {
      Alert.alert(
        'Отменить изменения?',
        'Новое название места не будет сохранено.',
        [
          { text: 'Продолжить редактирование', style: 'cancel' },
          {
            text: 'Отменить',
            style: 'destructive',
            onPress: () => {
              setTitle(visit?.title ?? '');
              setEditing(false);
            },
          },
        ]
      );
      return;
    }
    setTitle(visit?.title ?? '');
    setEditing(false);
  }

  function requestClose() {
    if (editing && title.trim() !== (visit?.title ?? '')) {
      Alert.alert(
        'Отменить изменения?',
        'Новое название места не будет сохранено.',
        [
          { text: 'Продолжить редактирование', style: 'cancel' },
          { text: 'Закрыть', style: 'destructive', onPress: onClose },
        ]
      );
      return;
    }
    onClose();
  }

  function confirmDelete() {
    if (!visit) return;
    Alert.alert(
      'Удалить посещение?',
      `Удалить «${visit.title}» из этого дня?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            setSaving(true);
            onDelete(visit)
              .then(deleted => {
                if (deleted) onClose();
              })
              .finally(() => setSaving(false));
          },
        },
      ]
    );
  }

  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'slide'}
      transparent
      visible={visit !== null}
      onRequestClose={requestClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Закрыть сведения о месте"
          onPress={requestClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(24, insets.bottom + 12) }]}>
          <View style={styles.handle} />
          <Text style={styles.eyebrow}>ПОСЕЩЕНИЕ</Text>
          <Text style={styles.title}>{visit?.title ?? ''}</Text>
          <Text style={styles.details}>
            {visit
              ? `${formatTime(visit.startTime)}–${formatTime(visit.endTime)} · ${Math.max(
                  0,
                  Math.round((visit.endTime.getTime() - visit.startTime.getTime()) / 60_000)
                )} мин`
              : ''}
          </Text>

          {editing ? (
            <>
              <TextInput
                accessibilityLabel="Название места"
                autoFocus
                maxLength={80}
                onChangeText={setTitle}
                placeholder="Название места"
                returnKeyType="done"
                style={styles.input}
                value={title}
              />
              <View style={styles.actions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={closeWithoutSaving}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => void saveName()}
                  style={[styles.primaryButton, saving && styles.disabled]}
                >
                  <Text style={styles.primaryText}>{saving ? 'Сохраняем…' : 'Сохранить'}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.source}>
                {visit?.manual
                  ? 'Название сохранено в локальной истории.'
                  : 'Остановка определена по GPS. Название можно добавить вручную.'}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setEditing(true)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryText}>
                  {visit?.manual ? 'Изменить название' : 'Добавить название'}
                </Text>
              </TouchableOpacity>
              {visit?.manual && (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={confirmDelete}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteText}>Удалить посещение</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,32,25,0.24)',
  },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  handle: {
    width: 38,
    height: 5,
    alignSelf: 'center',
    borderRadius: 3,
    backgroundColor: '#E1E7E2',
    marginBottom: 16,
  },
  eyebrow: { color: '#78857D', fontSize: 11, letterSpacing: 0.6 },
  title: { color: '#26362C', fontSize: 22, fontWeight: '600', marginTop: 4 },
  details: { color: '#68766D', fontSize: 13, marginTop: 6 },
  source: { color: '#68766D', fontSize: 13, lineHeight: 19, marginTop: 16, marginBottom: 12 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#D8E1DB',
    borderRadius: 12,
    paddingHorizontal: 13,
    color: '#26362C',
    marginTop: 16,
  },
  actions: { flexDirection: 'row', gap: 10 },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#EEF4EF',
    paddingHorizontal: 15,
    marginTop: 8,
  },
  secondaryText: { color: '#23644F', fontSize: 14, fontWeight: '600' },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#23644F',
    marginTop: 8,
  },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  deleteButton: { minHeight: 46, justifyContent: 'center', marginTop: 6 },
  deleteText: { color: '#B95746', fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
