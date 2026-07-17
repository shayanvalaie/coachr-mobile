import { useEffect, useState } from "react";
import { backendClient } from "../lib/backend/client";
import { BackendSession } from "../lib/backend/types";

// Subscribes to auth changes and exposes the current session.
export const useBackendAuth = () => {
  const [session, setSession] = useState<BackendSession | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;

    backendClient.auth
      .getSession()
      .then(({ data }) => {
        if (isMounted) setSession(data.session ?? null);
      })
      .catch((err) => {
        if (__DEV__) console.log("[auth] getSession error", err);
      })
      .finally(() => {
        if (isMounted) setInitializing(false);
      });

    const { data } = backendClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, initializing };
};
