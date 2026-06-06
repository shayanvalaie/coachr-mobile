import AsyncStorage from "@react-native-async-storage/async-storage";
import type { IapSku, PersistedSubscription } from "./types";

const STORAGE_KEY = "@coachr/subscription";

const EMPTY: PersistedSubscription = {
  isPro: false,
  activeSku: null,
  transactionId: null,
  updatedAt: new Date(0).toISOString(),
};

export const readPersistedSubscription =
  async (): Promise<PersistedSubscription> => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return EMPTY;
      return JSON.parse(raw) as PersistedSubscription;
    } catch {
      return EMPTY;
    }
  };

export const persistSubscription = async (
  isPro: boolean,
  activeSku: IapSku | null,
  transactionId: string | null,
): Promise<PersistedSubscription> => {
  const state: PersistedSubscription = {
    isPro,
    activeSku,
    transactionId,
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
};

export const clearPersistedSubscription = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEY);
};
