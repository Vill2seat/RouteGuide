import { useState } from 'react';
import { Alert, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [requesting, setRequesting] = useState(false);

  const steps = [
    {
      title: 'Маршруты с заботой о здоровье',
      text: 'Route Guide записывает ваши перемещения и предлагает более чистые и тихие альтернативные маршруты.',
    },
    {
      title: 'Фоновая запись',
      text: 'С вашего разрешения приложение может записывать маршрут в фоне. Запись включается и выключается вами.',
    },
    {
      title: 'Конфиденциальность',
      text: 'Все данные хранятся локально на вашем устройстве. Вы можете удалить историю в любое время.',
    },
  ];

  const requestPermissions = async () => {
    setRequesting(true);
    try {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (foreground.status !== 'granted') {
        Alert.alert(
          'Геолокация не разрешена',
          'Без доступа к геолокации приложение не сможет записывать маршруты.'
        );
        return;
      }

      const background = await Location.requestBackgroundPermissionsAsync();
      if (background.status !== 'granted') {
        Alert.alert(
          'Фоновая запись недоступна',
          'Можно продолжить без фоновой записи. Чтобы записывать маршрут при заблокированном экране, включите фоновую геолокацию в настройках устройства.'
        );
      }
      router.replace('/');
    } catch (error) {
      console.error('Could not request location permissions:', error);
      Alert.alert('Ошибка', 'Не удалось запросить разрешения геолокации.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.step}>{step + 1} / {steps.length}</Text>
        <Text style={styles.title}>{steps[step].title}</Text>
        <Text style={styles.text}>{steps[step].text}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 36,
  },
  text: {
    fontSize: 16,
    color: '#4A4A4A',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
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