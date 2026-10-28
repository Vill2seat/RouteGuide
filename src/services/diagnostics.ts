import { SQLiteDB } from './database';

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export async function recordDiagnostic(
  level: DiagnosticLevel,
  message: string
): Promise<void> {
  const safeMessage = message.trim().slice(0, 500);
  if (!safeMessage) return;

  try {
    await SQLiteDB.addDiagnosticLog(level, safeMessage);
  } catch (error) {
    console.error('Could not persist local diagnostic log:', error);
  }
}

export async function readDiagnostics(): Promise<
  Array<{ createdAt: Date; level: DiagnosticLevel; message: string }>
> {
  return SQLiteDB.getDiagnosticLogs();
}

export async function clearDiagnostics(): Promise<void> {
  await SQLiteDB.clearDiagnosticLogs();
}
