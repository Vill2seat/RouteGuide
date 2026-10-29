import { Text, View } from 'react-native';
import WalkIcon from '@assets/icons/walk.svg';
import BicycleIcon from '@assets/icons/bicycle.svg';
import CarIcon from '@assets/icons/car.svg';
import TransitIcon from '@assets/icons/transit.svg';

export default function TransportGlyph({
  mode,
  size = 20,
  color = '#23644F',
}: {
  mode: string;
  size?: number;
  color?: string;
}) {
  const iconProps = { width: size, height: size, color };
  if (mode === 'Пешком') return <WalkIcon {...iconProps} />;
  if (mode === 'Велосипед') return <BicycleIcon {...iconProps} />;
  if (mode.includes('Автобус') || mode.includes('Поезд') || mode.includes('метро')) {
    return <TransitIcon {...iconProps} />;
  }
  if (mode.includes('Автомобиль')) return <CarIcon {...iconProps} />;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color, fontSize: size * 0.75, fontWeight: '600' }}>·</Text>
    </View>
  );
}
