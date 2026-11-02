const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const accountSession = (id) => ({
  accessToken: `access-${id}`, refreshToken: `refresh-${id}`,
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  user: { id, email: `${id}@example.com` },
});
const response = (status, body) => ({
  ok: status < 400, status, statusText: '', text: async () => JSON.stringify(body),
});
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness(fetcher, options = {}) {
  const storage = new Map([
    ['coachr.fastapi.session', JSON.stringify(accountSession('a'))],
    ['coachr_setup_wizard_v2.a', 'done'], ['coachr_ruleset_last_seen.team-a', 'seen'],
    ['coachr_setup_wizard_v2.b', 'done'], ['iap.pending.a', 'purchase-a'], ['iap.pending.b', 'purchase-b'],
  ]);
  const calls = [];
  const modules = new Map();
  const stubs = {
    'expo-constants': { default: options.constants ?? {} },
    'react-native': { NativeModules: {} },
    '../secureStorage': { secureStorage: {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
      removeItem: async key => { storage.delete(key); },
    } },
    '@react-native-async-storage/async-storage': { default: { multiRemove: async keys => keys.forEach(key => storage.delete(key)) } },
    '../iap/persistence': { clearPersistedSubscription: async () => {}, clearPendingPurchasesForAccount: async accountId => { storage.delete(`iap.pending.${accountId}`); } },
    './trace': { trace() {}, setTraceBaseUrl() {} },
    '../../utils/lineupGenerator': {},
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const source = fs.readFileSync(path.join(__dirname, '../src/lib/backend', file), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    vm.runInNewContext(outputText, {
      exports, require(name) { return stubs[name] ?? load(name + '.ts'); },
      __DEV__: options.dev ?? false, process: { env: { EXPO_PUBLIC_FASTAPI_BASE_URL: options.baseUrl ?? 'https://test.invalid' } },
      URL, URLSearchParams, console, atob, Error, TypeError, Date, setTimeout, clearTimeout, performance, AbortController, ...options.globals,
      fetch: async (url, init) => {
        const call = { path: new URL(url).pathname, host: new URL(url).host, ...init };
        calls.push(call);
        return fetcher(call);
      },
    });
    return exports;
  }
  return { client: load('fastApiProvider.ts').fastApiBackendClient, calls, storage };
}

for (const transition of ['signout', 'switch', 'delete']) {
  test(`late successful read is discarded after ${transition}`, async () => {
    const gate = deferred();
    const { client } = harness(async ({ path, headers }) => {
      if (path === '/auth/signin') return response(200, { session: accountSession('b') });
      if (path === '/auth/account') return response(200, { ok: true, deletedTeamIds: ['team-a'] });
      if (headers.Authorization === 'Bearer access-b') return response(200, { id: 'team-b', name: 'B' });
      return gate.promise;
    });
    const reading = client.getMyTeam().then(data => ({ data }), error => ({ error }));
    await new Promise(setImmediate);
    if (transition === 'delete') {
      assert.equal((await client.auth.deleteAccount('password-a')).error, null);
    } else {
      await client.auth.signOut({ scope: 'local' });
    }
    if (transition === 'switch') {
      await client.auth.signInWithPassword({ email: 'b@example.com', password: 'password-b' });
    }
    gate.resolve(response(200, { id: 'team-a', name: 'Private A' }));
    const result = await reading;
    assert.equal(result.data, undefined);
    assert.match(result.error.message, /Account changed/);
    if (transition === 'switch') assert.equal((await client.getMyTeam()).id, 'team-b');
  });
}

test('successful replay after refresh still checks the originating account', async () => {
  const gate = deferred();
  const replayStarted = deferred();
  let teamRequests = 0;
  const { client } = harness(async ({ path }) => {
    if (path === '/auth/refresh') return response(200, { session: accountSession('a') });
    if (++teamRequests === 1) return response(401, { detail: 'Expired token' });
    replayStarted.resolve();
    return gate.promise;
  });
  const reading = client.getMyTeam().then(data => ({ data }), error => ({ error }));
  await replayStarted.promise;
  await client.auth.signOut({ scope: 'local' });
  gate.resolve(response(200, { id: 'team-a', name: 'Private A' }));
  const result = await reading;
  assert.equal(result.data, undefined);
  assert.match(result.error.message, /Account changed/);
});

test('late sign-in cannot revive a signed-out session', async () => {
  const gate = deferred();
  const { client } = harness(async () => gate.promise);
  const signingIn = client.auth.signInWithPassword({ email: 'a@example.com', password: 'password-a' });
  await new Promise(setImmediate);
  await client.auth.signOut({ scope: 'local' });
  gate.resolve(response(200, { session: accountSession('a') }));
  const result = await signingIn;
  assert.match(result.error.message, /Account changed/);
  assert.equal((await client.auth.getSession()).data.session, null);
});

test('acknowledged deletion after local signout still cleans the original account', async () => {
  const gate = deferred();
  const { client, storage, calls } = harness(async () => gate.promise);
  const deleting = client.auth.deleteAccount('password-a');
  await new Promise(setImmediate);
  await client.auth.signOut({ scope: 'local' });
  const signingIn = await client.auth.signInWithPassword({ email: 'b@example.com', password: 'password-b' });
  assert.match(signingIn.error.message, /deletion is in progress/);
  assert.equal(calls.length, 1);
  gate.resolve(response(200, { ok: true, deletedTeamIds: ['team-a'] }));
  assert.equal((await deleting).error, null);
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.equal(storage.has('coachr_setup_wizard_v2.a'), false);
  assert.equal(storage.has('coachr_ruleset_last_seen.team-a'), false);
  assert.equal(storage.has('coachr_setup_wizard_v2.b'), true);
  assert.equal(storage.has('iap.pending.a'), false);
  assert.equal(storage.has('iap.pending.b'), true);
});

test('sign-in started before deletion cannot replace its originating session', async () => {
  const signInGate = deferred();
  const deleteGate = deferred();
  const { client } = harness(async ({ path }) => path === '/auth/signin' ? signInGate.promise : deleteGate.promise);
  const signingIn = client.auth.signInWithPassword({ email: 'b@example.com', password: 'password-b' });
  await new Promise(setImmediate);
  const deleting = client.auth.deleteAccount('password-a');
  await new Promise(setImmediate);
  signInGate.resolve(response(200, { session: accountSession('b') }));
  assert.match((await signingIn).error.message, /deletion is in progress/);
  assert.equal((await client.auth.getSession()).data.session.user.id, 'a');
  deleteGate.resolve(response(200, { ok: true, deletedTeamIds: ['team-a'] }));
  assert.equal((await deleting).error, null);
});

const freeStatus = {
  isPro: false, productId: null, status: null, expiresAt: null, accessUntil: null,
  proAccess: null, isAdmin: false, canManageAdmins: false,
};

for (const [field, value] of [
  ['isPro', 'false'], ['isAdmin', 'false'], ['canManageAdmins', 1],
  ['status', 'unverified'], ['expiresAt', 'not-a-date'], ['proAccess', 'true'],
  ['productId', 123],
]) {
  test(`subscription response rejects invalid ${field}`, async () => {
    const { client } = harness(async () => response(200, { ...freeStatus, [field]: value }));
    const result = await client.getSubscriptionStatus().then(data => ({ data }), error => ({ error }));
    assert.equal(result.data, undefined);
    assert.match(result.error.message, /Invalid subscription status/);
  });
}

test('valid Free and explicit server Pro override snapshots retain their semantics', async () => {
  for (const status of [freeStatus, { ...freeStatus, isPro: true, proAccess: true, isAdmin: true }]) {
    const { client } = harness(async () => response(200, status));
    assert.equal(JSON.stringify(await client.getSubscriptionStatus()), JSON.stringify(status));
  }
});

for (const code of ['PRO_REQUIRED', 'AI_CONSENT_REQUIRED']) {
  test(`${code} preserves the machine code without refreshing authentication`, async () => {
    const { client, calls } = harness(async () => response(403, { detail: { code, message: 'Action required' } }));
    await assert.rejects(client.getMyTeam(), error => {
      assert.equal(error.context.status, 403);
      assert.equal(error.context.body.detail.code, code);
      return true;
    });
    assert.equal(calls.length, 1);
  });
}

function manualClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    globals: {
      performance: { now: () => now },
      setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, deadline: now + delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) {
        if (timer.deadline <= now) { timers.delete(id); timer.callback(); }
      }
    },
    size: () => timers.size,
  };
}

for (const phase of ['fetch', 'success body', 'error body']) {
  test(`integrated ordinary request times out during ${phase} and preserves auth`, async () => {
    const clock = manualClock();
    const gate = deferred();
    const { client, calls } = harness(async () => {
      if (phase === 'fetch') return gate.promise;
      return { ...response(phase === 'error body' ? 503 : 200, null), text: () => gate.promise };
    }, { globals: clock.globals });
    const request = client.getSubscriptionStatus().catch(error => error);
    await new Promise(setImmediate);
    clock.advance(15000);
    const error = await request;
    assert.equal(error.code, 'REQUEST_TIMEOUT');
    assert.equal(calls[0].signal.aborted, true);
    assert.equal((await client.auth.getSession()).data.session.user.id, 'a');
    assert.equal(clock.size(), 0);
  });
}

test('verification gets a 30 second budget and caller cancellation is distinct', async () => {
  const clock = manualClock();
  const { client } = harness(() => new Promise(() => {}), { globals: clock.globals });
  const controller = new AbortController();
  const request = client.verifySubscription({ transactionId: '123', productId: 'subscription.monthly', platform: 'ios' }, { signal: controller.signal }).catch(error => error);
  await new Promise(setImmediate);
  clock.advance(15000);
  assert.equal(clock.size(), 1);
  controller.abort();
  assert.equal((await request).code, 'REQUEST_CANCELLED');
  assert.equal(clock.size(), 0);
});

test('refresh timeout shares the request budget and a late payload cannot revive auth', async () => {
  const clock = manualClock();
  const refresh = deferred();
  const { client, calls } = harness(async ({ path }) => {
    if (path === '/auth/refresh') return refresh.promise;
    return response(401, { detail: 'Expired token' });
  }, { globals: clock.globals });
  const request = client.getSubscriptionStatus().catch(error => error);
  await new Promise(setImmediate);
  const waiter = client.auth.refreshSession();
  clock.advance(15000);
  assert.equal((await request).code, 'REQUEST_TIMEOUT');
  refresh.resolve(response(200, { session: accountSession('b') }));
  assert.equal((await waiter).error.code, 'REQUEST_TIMEOUT');
  assert.equal((await client.auth.getSession()).data.session.user.id, 'a');
  assert.equal(calls.filter(call => call.path === '/subscriptions/status').length, 1);
  assert.equal(clock.size(), 0);
});

test('a failed mutation is never replayed against another development host', async () => {
  const { client, calls } = harness(async () => { throw new TypeError('socket interrupted'); }, {
    dev: true, baseUrl: 'http://localhost:8000', constants: { expoConfig: { hostUri: '192.0.2.1:8081' } },
  });
  const result = await client.auth.forgotPassword('a@example.com');
  assert.equal(result.error.code, 'NETWORK_ERROR');
  assert.equal(calls.length, 1);
});

test('Retry-After is preserved with structured HTTP error details', async () => {
  const { client } = harness(async () => ({
    ...response(429, { detail: { code: 'RATE_LIMITED', message: 'Please wait', retryable: true } }),
    headers: { get: name => name === 'Retry-After' ? '42' : null },
  }));
  await assert.rejects(client.getSubscriptionStatus(), error => {
    assert.equal(error.context.status, 429);
    assert.equal(error.context.body.detail.code, 'RATE_LIMITED');
    assert.equal(error.context.retryAfterSeconds, 42);
    return true;
  });
});

test('a timed out sign-in response cannot write a late session', async () => {
  const clock = manualClock();
  const gate = deferred();
  const { client } = harness(async () => gate.promise, { globals: clock.globals });
  const request = client.auth.signInWithPassword({ email: 'b@example.com', password: 'password-b' });
  await new Promise(setImmediate);
  clock.advance(15000);
  assert.equal((await request).error.code, 'REQUEST_TIMEOUT');
  gate.resolve(response(200, { session: accountSession('b') }));
  await new Promise(setImmediate);
  assert.equal((await client.auth.getSession()).data.session.user.id, 'a');
});

test('an expired request does not cancel a later shared-refresh waiter', async () => {
  const clock = manualClock();
  const rejected = deferred();
  const refresh = deferred();
  const { client, calls } = harness(async ({ path }) => path === '/auth/refresh' ? refresh.promise : rejected.promise, { globals: clock.globals });
  const request = client.getSubscriptionStatus().catch(error => error);
  await new Promise(setImmediate);
  clock.advance(8000);
  rejected.resolve(response(401, { detail: 'Expired token' }));
  await new Promise(setImmediate);
  const waiter = client.auth.refreshSession();
  clock.advance(7000);
  assert.equal((await request).code, 'REQUEST_TIMEOUT');
  assert.equal(calls.find(call => call.path === '/auth/refresh').signal.aborted, false);
  refresh.resolve(response(200, { session: accountSession('a') }));
  assert.equal((await waiter).error, null);
  assert.equal(calls.filter(call => call.path === '/subscriptions/status').length, 1);
  assert.equal(clock.size(), 0);
});

for (const status of [200, 503]) {
  test(`interrupted ${status} body reports a stable network error`, async () => {
    const { client } = harness(async () => ({ ...response(status, null), text: async () => { throw new TypeError('private socket details'); } }));
    await assert.rejects(client.getSubscriptionStatus(), error => {
      assert.equal(error.code, 'NETWORK_ERROR');
      assert.equal(error.message.includes('private'), false);
      return true;
    });
  });
}
