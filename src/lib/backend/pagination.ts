export type Page<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };

export const calendarMonthWindow = (year: number, monthIndex: number) => {
  const first = new Date(year, monthIndex, 1);
  const start = new Date(year, monthIndex, 1 - first.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 42);
  return { from: start.toISOString(), to: end.toISOString() };
};

export const upcomingWindow = (now = new Date()) => ({
  from: now.toISOString(),
  to: new Date(now.getTime() + 93 * 86400000).toISOString(),
});

export async function readAllPages<T>(
  fetchPage: (cursor?: string) => Promise<Page<T>>,
  assertCurrent: () => void,
  maximumPages = 20,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let index = 0; index < maximumPages; index++) {
    assertCurrent();
    const page = await fetchPage(cursor);
    assertCurrent();
    if (page.hasMore !== (page.nextCursor !== null)) throw new Error("Invalid page response");
    items.push(...page.items);
    if (!page.hasMore) return items;
    if (seen.has(page.nextCursor!)) throw new Error("Pagination did not advance");
    seen.add(page.nextCursor!);
    cursor = page.nextCursor!;
  }
  throw new Error("There are too many results to load at once. Choose a smaller date range.");
}
