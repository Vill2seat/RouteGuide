export type TransportMode = 'Пешком' | 'Велосипед' | 'Моторизованный транспорт';

export type SpeedObservation = {
  speedMetersPerSecond: number;
  accuracyMeters: number | null;
};

export type TransportClassification = {
  mode: TransportMode;
  confidence: number;
};

const classifySpeed = (speed: number): TransportMode | null => {
  if (speed < 0.7) return null;
  if (speed < 2.8) return 'Пешком';
  if (speed < 8.3) return 'Велосипед';
  return 'Моторизованный транспорт';
};

export function classifyTransport(
  observations: SpeedObservation[]
): TransportClassification | null {
  const reliable = observations
    .filter(
      point =>
        Number.isFinite(point.speedMetersPerSecond) &&
        point.speedMetersPerSecond >= 0 &&
        (point.accuracyMeters === null ||
          (Number.isFinite(point.accuracyMeters) && point.accuracyMeters <= 35))
    )
    .slice(-7);

  if (reliable.length < 3) return null;

  const modes = reliable
    .map(point => classifySpeed(point.speedMetersPerSecond))
    .filter((mode): mode is TransportMode => mode !== null);
  if (modes.length < 3) return null;

  const counts = new Map<TransportMode, number>();
  for (const mode of modes) counts.set(mode, (counts.get(mode) ?? 0) + 1);
  const [mode, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const confidence = count / modes.length;

  if (count < 3 || confidence < 0.6) return null;
  return { mode, confidence };
}
