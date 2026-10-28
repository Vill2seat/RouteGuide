export type ScoredRoute = {
  durationMinutes: number;
  qualityScore: number | null;
};

export function recommendRouteIndex(
  routes: ScoredRoute[],
  maxExtraMinutes = 5
): number {
  if (!routes.length) return -1;

  const fastestIndex = routes.reduce(
    (bestIndex, route, index) =>
      route.durationMinutes < routes[bestIndex].durationMinutes ? index : bestIndex,
    0
  );
  const fastestDuration = routes[fastestIndex].durationMinutes;
  const eligible = routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => route.durationMinutes <= fastestDuration + maxExtraMinutes);
  const scored = eligible.filter(
    ({ route }) => route.qualityScore !== null && Number.isFinite(route.qualityScore)
  );
  if (!scored.length) return fastestIndex;

  return scored.reduce((best, candidate) => {
    const candidateScore = candidate.route.qualityScore ?? Number.NEGATIVE_INFINITY;
    const bestScore = best.route.qualityScore ?? Number.NEGATIVE_INFINITY;
    if (candidateScore > bestScore) return candidate;
    if (
      candidateScore === bestScore &&
      candidate.route.durationMinutes < best.route.durationMinutes
    ) {
      return candidate;
    }
    return best;
  }).index;
}
