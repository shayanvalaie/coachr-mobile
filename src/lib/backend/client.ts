import { BackendClient, BackendProvider } from "./types";

const configuredProvider =
  (process.env.EXPO_PUBLIC_BACKEND_PROVIDER ?? "supabase").toLowerCase() as BackendProvider;

const provider: BackendProvider =
  configuredProvider === "fastapi" ? "fastapi" : "supabase";

if (
  configuredProvider !== "supabase" &&
  configuredProvider !== "fastapi" &&
  __DEV__
) {
  console.log(
    `[backend] Unknown EXPO_PUBLIC_BACKEND_PROVIDER="${configuredProvider}"; defaulting to supabase.`,
  );
}

export const activeBackendProvider = provider;
export const backendClient: BackendClient =
  provider === "fastapi"
    ? (
        require("./fastApiProvider") as {
          fastApiBackendClient: BackendClient;
        }
      ).fastApiBackendClient
    : (
        require("./supabaseProvider") as {
          supabaseBackendClient: BackendClient;
        }
      ).supabaseBackendClient;
