// Serialize each player's writes so a slow name-blur save cannot overwrite a
// later gender/position selection. Reads wait for all edits on that team.
const pending = new Map<string, Promise<unknown>>();
const failures = new Map<string, unknown>();

export function writeRoster<T>(teamId: string, playerId: string, write: () => Promise<T>): Promise<T> {
  const key = `${teamId}:${playerId}`;
  const previous = pending.get(key) ?? Promise.resolve();
  const request = previous.catch(() => {}).then(write);
  pending.set(key, request);
  void request.then(
    () => {
      failures.delete(key);
      if (pending.get(key) === request) pending.delete(key);
    },
    (error) => {
      failures.set(key, error);
      if (pending.get(key) === request) pending.delete(key);
    },
  );
  return request;
}

export async function waitForRosterWrites(teamId: string, rejectFailures = true): Promise<void> {
  const prefix = `${teamId}:`;
  while (true) {
    const writes = [...pending].filter(([key]) => key.startsWith(prefix)).map(([, request]) => request);
    if (writes.length === 0) break;
    await Promise.allSettled(writes);
  }
  if (!rejectFailures) return;
  for (const [key, error] of failures) {
    if (key.startsWith(prefix)) throw error;
  }
}
