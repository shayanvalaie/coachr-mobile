import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import { secureStorage } from './secureStorage'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables')
}

const MAX_IN_FLIGHT_SUPABASE_REQUESTS = 4
const MAX_NETWORK_RETRIES = 3
const RETRY_BASE_DELAY_MS = 250

let inFlightRequests = 0
const requestQueue: Array<() => void> = []
let lastConnectivityProbeAt = 0

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const withRequestSlot = async <T>(run: () => Promise<T>): Promise<T> => {
  if (inFlightRequests >= MAX_IN_FLIGHT_SUPABASE_REQUESTS) {
    await new Promise<void>((resolve) => {
      requestQueue.push(resolve)
    })
  }

  inFlightRequests += 1
  try {
    return await run()
  } finally {
    inFlightRequests -= 1
    const next = requestQueue.shift()
    if (next) next()
  }
}

const isNetworkFailure = (err: unknown) => {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : ''
  return /network request failed|failed to fetch|networkerror|timed out/i.test(message)
}

const probeConnectivity = async () => {
  const now = Date.now()
  if (now - lastConnectivityProbeAt < 15000) return
  lastConnectivityProbeAt = now

  const check = async (label: string, url: string) => {
    try {
      const res = await fetch(url, { method: 'GET' })
      if (__DEV__) console.log('[network probe]', label, `${res.status} ${res.statusText}`)
    } catch (err) {
      if (__DEV__) console.log('[network probe]', label, 'failed', err)
    }
  }

  await Promise.all([
    check('external', 'https://jsonplaceholder.typicode.com/posts/1'),
    check('supabase-health', `${supabaseUrl}/auth/v1/health`),
  ])
}

const supabaseFetch: typeof fetch = async (input, init) => {
  return withRequestSlot(async () => {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= MAX_NETWORK_RETRIES; attempt += 1) {
      try {
        return await fetch(input, init)
      } catch (err) {
        lastError = err
        if (!isNetworkFailure(err) || attempt === MAX_NETWORK_RETRIES) {
          if (__DEV__) {
            const url = typeof input === 'string' ? input : input.toString()
            console.log('[supabase fetch error]', url, err)
          }
          await probeConnectivity()
          throw err
        }

        const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
        await sleep(delay)
      }
    }

    throw lastError
  })
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: supabaseFetch,
  },
  auth: {
    storage: secureStorage,
    // Keep refresh enabled in dev/prod so Edge Functions receive a valid JWT.
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // required for React Native / Expo
  },
})
