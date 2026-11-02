import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SQLiteDB } from '@services/database';
import { recordDiagnostic } from '@services/diagnostics';

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    SQLiteDB.getLocalProfile()
      .then(profile => {
        if (profile) setProfileName(profile.displayName);
      })
      .catch(error => {
        console.error('Could not load local profile:', error);
        void recordDiagnostic('error', 'Could not load local profile');
      });
  }, []);

  const steps = [
    {
      title: 'Локальный профиль',
      text: 'Создайте профиль на этом устройстве. Он не использует email, пароль, облачный аккаунт или синхронизацию.',
    },
    {
      title: 'Маршруты с заботой о здоровье',
      text: 'Route Guide сохраняет ваши перемещения на устройстве и помогает сравнить пешие маршруты. Данные о воздухе и погоде — общая модельная оценка для района, а не измерения у дороги.',
    },
    {
      title: 'Фоновая запись',
      text: 'После разрешения геолокации автоматическая запись включается по умолчанию. Разрешение «Всегда» можно включить позже в настройках приложения, чтобы запись продолжалась при заблокированном экране.',
    },
    {
      title: 'Конфиденциальность',
      text: 'Профиль, история и логи хранятся в зашифрованной локальной базе приложения на этом устройстве. Route Guide не загружает и не продаёт вашу историю. Для карты, построения маршрута и Open-Meteo необходимые запросы получают сторонние поставщики и применяют свои правила обработки; для воздуха и погоды отправляются округлённые координаты района.',
    },
  ];

  const requestPermissions = async () => {
    if (profileName.trim().length < 2) {
      Alert.alert('Укажите имя', 'Имя профиля должно содержать не менее двух символов.');
      return;
    }
    setRequesting(true);
    try {
      await SQLiteDB.saveLocalProfile(profileName);
      await recordDiagnostic('info', 'Local profile created or updated');
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (foreground.status !== 'granted') {
        await recordDiagnostic('warning', 'Foreground location permission was denied');
        Alert.alert(
          'Геолокация не разрешена',
          'Без доступа к геолокации приложение не сможет записывать маршруты.'
        );
        return;
      }

      router.replace('/');
    } catch (error) {
      console.error('Could not request location permissions:', error);
      await recordDiagnostic('error', 'Onboarding or location permission setup failed');
      Alert.alert('Ошибка', 'Не удалось запросить разрешения геолокации.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.content}>
        <Text style={styles.step}>{step + 1} / {steps.length}</Text>
        <Text style={styles.title}>{steps[step].title}</Text>
        <Text style={styles.text}>{steps[step].text}</Text>
        {step === 0 && (
          <TextInput
            accessibilityLabel="Имя локального профиля"
            autoCapitalize="words"
            maxLength={50}
            onChangeText={setProfileName}
            placeholder="Как к вам обращаться?"
            style={styles.input}
            value={profileName}
          />
        )}
        </View>

        <View style={styles.buttons}>
        {step < steps.length - 1 ? (
          <TouchableOpacity style={styles.nextButton} onPress={() => setStep(s => s + 1)}>
            <Text style={styles.buttonText}>Далее</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            disabled={requesting}
            style={styles.startButton}
            onPress={requestPermissions}
          >
            <Text style={styles.buttonText}>
              {requesting ? 'Запрос разрешений…' : 'Продолжить'}
            </Text>
          </TouchableOpacity>
        )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboard: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  step: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 36,
  },
  text: {
    flexShrink: 1,
    fontSize: 16,
    color: '#4A4A4A',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  input: {
    width: '100%',
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#CCD8D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 24,
    color: '#1A1A1A',
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  nextButton: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  startButton: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#168A57',
    alignItems: 'center',
  },
});