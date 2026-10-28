import { Stack } from 'expo-router';
import '@services/locationService';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: 'center' }}>
      <Stack.Screen name="index" options={{ title: 'Route Guide' }} />
      <Stack.Screen name="onboarding" options={{ title: 'Добро пожаловать' }} />
      <Stack.Screen name="tracking" options={{ title: 'Запись' }} />
      <Stack.Screen name="history" options={{ title: 'История' }} />
      <Stack.Screen name="route/[id]" options={{ title: 'Маршрут' }} />
      <Stack.Screen name="route-planner" options={{ title: 'Подбор маршрута' }} />
      <Stack.Screen name="settings" options={{ title: 'Настройки' }} />
    </Stack>
  );
}