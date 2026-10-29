import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useRouter } from 'expo-router';

export type AppTab = 'map' | 'history' | 'routes';

type BottomNavProps = { active: AppTab };

function TabIcon({ tab, color }: { tab: AppTab; color: string }) {
  if (tab === 'map') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d="M9 3v15m6-12v15" stroke={color} strokeWidth={1.6} />
      </Svg>
    );
  }
  if (tab === 'history') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        <Path d="M3 3v5h5m4-1v5l3 2" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h6m4 0h6M4 17h3m4 0h9" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={12} cy={7} r={2.5} stroke={color} strokeWidth={1.6} />
      <Circle cx={9} cy={17} r={2.5} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

export default function BottomNav({ active }: BottomNavProps) {
  const router = useRouter();
  const tabs: { id: AppTab; label: string; path: '/' | '/history' | '/route-planner' }[] = [
    { id: 'map', label: 'Карта', path: '/' },
    { id: 'history', label: 'История', path: '/history' },
    { id: 'routes', label: 'Маршруты', path: '/route-planner' },
  ];

  return (
    <View style={styles.container}>
      {tabs.map(tab => {
        const selected = tab.id === active;
        const color = selected ? '#23644F' : '#718078';
        return (
          <TouchableOpacity
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            onPress={() => {
              if (!selected) router.replace(tab.path);
            }}
            style={styles.tab}
          >
            <View style={[styles.icon, selected && styles.selectedIcon]}>
              <TabIcon tab={tab.id} color={color} />
            </View>
            <Text style={[styles.label, selected && styles.selectedLabel]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8E3',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 5,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 64 },
  icon: {
    width: 74,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  selectedIcon: { backgroundColor: '#EAF2ED' },
  label: { color: '#718078', fontSize: 12, marginTop: 3 },
  selectedLabel: { color: '#23644F', fontWeight: '600' },
});
