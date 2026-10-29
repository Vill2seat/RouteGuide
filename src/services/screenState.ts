let historySelectedDate = new Date();
let historyScrollOffset = 0;
let selectedRouteId: string | null = null;

export function getHistorySelectedDate(): Date {
  return new Date(historySelectedDate);
}

export function setHistorySelectedDate(date: Date): void {
  historySelectedDate = new Date(date);
}

export function getHistoryScrollOffset(): number {
  return historyScrollOffset;
}

export function setHistoryScrollOffset(offset: number): void {
  historyScrollOffset = Math.max(0, offset);
}

export function getSelectedRouteId(): string | null {
  return selectedRouteId;
}

export function setSelectedRouteId(id: string | null): void {
  selectedRouteId = id;
}
