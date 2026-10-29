import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '@services/locationService';
import useReducedMotion from '@hooks/useReducedMotion';

export default function RootLayout() {
  const reduceMotion = useReducedMotion();
  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: reduceMotion ? 'none' : 'default',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Route Guide' }} />
        <Stack.Screen name="onboarding" options={{ title: 'Добро пожаловать' }} />
        <Stack.Screen name="tracking" options={{ title: 'Запись' }} />
        <Stack.Screen name="history" options={{ title: 'История' }} />
        <Stack.Screen name="route/[id]" options={{ title: 'Маршрут' }} />
        <Stack.Screen name="route-planner" options={{ title: 'Подбор маршрута' }} />
        <Stack.Screen name="settings" options={{ title: 'Настройки' }} />
      </Stack>
    </SafeAreaProvider>
  );
}