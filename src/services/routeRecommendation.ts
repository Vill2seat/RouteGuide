export type RouteOption = {
  durationMinutes: number;
};

export function recommendRouteIndex(routes: RouteOption[]): number {
  if (!routes.length) return -1;

  const validRoutes = routes
    .map((route, index) => ({ route, index }))
    .filter(
      ({ route }) =>
        Number.isFinite(route.durationMinutes) && route.durationMinutes >= 0
    );
  if (!validRoutes.length) return -1;

  return validRoutes.reduce(
    (best, candidate) =>
      candidate.route.durationMinutes < best.route.durationMinutes
        ? candidate
        : best
  ).index;
}
