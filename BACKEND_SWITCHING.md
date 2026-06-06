# Backend Switching

The mobile app now supports two backend providers behind one interface:

- `supabase`
- `fastapi`

## Switch provider

Set in `mobile/.env`:

```bash
EXPO_PUBLIC_BACKEND_PROVIDER=supabase
# or
EXPO_PUBLIC_BACKEND_PROVIDER=fastapi
```

If using `fastapi`, also set:

```bash
EXPO_PUBLIC_FASTAPI_BASE_URL=http://localhost:8000
```

Then restart Expo so env vars reload.

## App code contract

Screens and auth hooks now use `mobile/src/lib/backend/client.ts`.

- `mobile/src/lib/backend/supabaseProvider.ts` keeps current behavior.
- `mobile/src/lib/backend/fastApiProvider.ts` maps the same operations to FastAPI endpoints.

This keeps rollback simple: change env var back to `supabase`.
