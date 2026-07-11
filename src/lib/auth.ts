import { backendClient } from "./backend/client";

const isNetworkFailure = (err: unknown): boolean => {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";

  return /network request failed|failed to fetch|networkerror|timed out/i.test(message);
};

export const safeSignOut = async (): Promise<void> => {
  try {
    const { error } = await backendClient.auth.signOut({ scope: "global" });
    if (error) throw error;
  } catch (err) {
    if (!isNetworkFailure(err)) {
      throw err;
    }

    const { error: localError } = await backendClient.auth.signOut({
      scope: "local",
    });

    if (localError && !isNetworkFailure(localError)) {
      throw localError;
    }

    if (__DEV__) console.log("[sign out fallback] global logout unreachable due to network");
  }
};
