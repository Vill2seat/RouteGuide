import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import * as Location from 'expo-location';
import { SQLiteDB } from '@/services/database';
import { locationTaskName, startLocationTask } from '@/services/locationService';

export default function RootLayout() {
  const [hasPermissions, setHasPermissions] = React.useState<boolean | null>(null);

  useEffect(() => {
    checkPermissions();
    startLocationTask();
  }, []);

  async function checkPermissions() {
    const { status } = await Location.getForegroundPermissionsAsync();
    const backgroundStatus = await Location.getBackgroundPermissionsAsync();
    setHasPermissions(
      status === 'granted' && backgroundStatus.status === 'granted'
    );
  }

  return (
    <Stack>
      {hasPermissions === null ? (
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      ) : hasPermissions ? (
        <>
          <Stack.Screen name="index" options={{ title: 'Route Guide' }} />
          <Stack.Screen name="tracking" options={{ title: 'Запись' }} />
          <Stack.Screen name="history" options={{ title: 'История' }} />
          <Stack.Screen name="route/[id]" options={{ title: 'Маршрут' }} />
          <Stack.Screen name="settings" options={{ title: 'Настройки' }} />
        </>
      ) : (
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      )}
    </Stack>
  );
}

import React from 'react';