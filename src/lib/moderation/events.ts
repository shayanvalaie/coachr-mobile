import { clearReads } from "../backend/cache";
// Consumers revalidate immediately after a block, review, or publication change.
let revision = 0;
const listeners = new Set<() => void>();
export const getPublicContentRevision = () => revision;
export const subscribePublicContent = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function invalidatePublicContent() {
  clearReads();
  revision += 1;
  listeners.forEach(listener => listener());
}
