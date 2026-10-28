import { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'Маршруты с заботой о здоровье',
      text: 'Route Guide записывает ваши перемещения и предлагает более чистые и тихие альтернативные маршруты.',
    },
    {
      title: 'Фоновая запись',
      text: 'Приложение работает в фоне и фиксирует где вы были, на каком транспорте перемещались.',
    },
    {
      title: 'Конфиденциальность',
      text: 'Все данные хранятся локально на вашем устройстве. Вы можете удалить историю в любое время.',
    },
  ];

  const requestPermissions = async () => {
    const foreground = await Location.requestForegroundPermissionsAsync();
    const background = await Location.requestBackgroundPermissionsAsync();

    if (
      foreground.status === 'granted' &&
      background.status === 'granted'
    ) {
      router.replace('/');
    } else {
      alert('Необходимо разрешить геолокацию для работы приложения');
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
          <TouchableOpacity style={styles.startButton} onPress={requestPermissions}>
            <Text style={styles.buttonText}>Начать запись</Text>
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
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
});