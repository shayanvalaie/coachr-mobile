# quick-worker

Deploy this function with gateway JWT verification disabled, because the function performs explicit JWT/user checks via `auth.getUser()` and team ownership validation.

```bash
supabase functions deploy quick-worker --no-verify-jwt
```

Required secrets:

```bash
supabase secrets set OPENAI_API_KEY=...
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```

The runtime also requires the standard Supabase secrets available in Edge Functions:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY`
