import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// SecureStore warns above ~2048 bytes per value on Android and may drop larger
// values on some devices. Supabase session JSON exceeds that, so values are
// split into chunks, each stored under its own SecureStore key.
const CHUNK_SIZE = 1800;

const chunkCountKey = (key: string) => `${key}.chunkCount`;
const chunkKey = (key: string, index: number) => `${key}.chunk.${index}`;

// SecureStore keys only allow [A-Za-z0-9._-]; Supabase keys can contain other
// characters (e.g. ":"), so sanitize deterministically.
const sanitizeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

const readChunks = async (key: string): Promise<string | null> => {
  const countRaw = await SecureStore.getItemAsync(chunkCountKey(key));
  if (!countRaw) return null;
  const count = Number.parseInt(countRaw, 10);
  if (!Number.isFinite(count) || count <= 0) return null;

  const chunks = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      SecureStore.getItemAsync(chunkKey(key, i)),
    ),
  );
  if (chunks.some((chunk) => chunk == null)) return null;
  return chunks.join("");
};

const writeChunks = async (key: string, value: string): Promise<void> => {
  const previousCountRaw = await SecureStore.getItemAsync(chunkCountKey(key));
  const previousCount = previousCountRaw
    ? Number.parseInt(previousCountRaw, 10)
    : 0;

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }

  await Promise.all(
    chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)),
  );
  await SecureStore.setItemAsync(chunkCountKey(key), String(chunks.length));

  if (Number.isFinite(previousCount) && previousCount > chunks.length) {
    await Promise.all(
      Array.from({ length: previousCount - chunks.length }, (_, i) =>
        SecureStore.deleteItemAsync(chunkKey(key, chunks.length + i)),
      ),
    );
  }
};

const deleteChunks = async (key: string): Promise<void> => {
  const countRaw = await SecureStore.getItemAsync(chunkCountKey(key));
  const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
  if (Number.isFinite(count) && count > 0) {
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.deleteItemAsync(chunkKey(key, i)),
      ),
    );
  }
  await SecureStore.deleteItemAsync(chunkCountKey(key));
};

// Sessions used to live in plain AsyncStorage; migrate them on first read so
// existing users stay signed in after the storage change.
const migrateFromAsyncStorage = async (
  originalKey: string,
  secureKey: string,
): Promise<string | null> => {
  const legacy = await AsyncStorage.getItem(originalKey);
  if (legacy == null) return null;
  await writeChunks(secureKey, legacy);
  await AsyncStorage.removeItem(originalKey);
  return legacy;
};

export const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const secureKey = sanitizeKey(key);
    try {
      const stored = await readChunks(secureKey);
      if (stored != null) return stored;
      return await migrateFromAsyncStorage(key, secureKey);
    } catch (err) {
      if (__DEV__) console.log("[secureStorage] getItem failed", key, err);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await writeChunks(sanitizeKey(key), value);
    } catch (err) {
      if (__DEV__) console.log("[secureStorage] setItem failed", key, err);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await deleteChunks(sanitizeKey(key));
    } catch (err) {
      if (__DEV__) console.log("[secureStorage] removeItem failed", key, err);
    }
  },
};
