const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const session = { accessToken: 'access', refreshToken: 'refresh', expiresAt: Math.floor(Date.now() / 1000) + 3600, user: { id: 'owner', email: 'owner@example.com' } };
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function response(status, body) { return { ok: status < 400, status, statusText: '', text: async () => JSON.stringify(body) }; }

function harness(fetcher, { failCleanup = false, failPendingCleanup = false } = {}) {
  const storage = new Map([
    ['coachr.fastapi.session', JSON.stringify(session)],
    ['coachr_setup_wizard_v2.owner', 'done'],
    ['coachr_ruleset_last_seen.team', 'seen'],
    ['coachr_setup_wizard_v2.other', 'done'],
    ['@coachr/subscription', 'active'],
    ['pending.owner', 'purchase'],
    ['pending.other', 'purchase'],
  ]);
  const events = [];
  const calls = [];
  const modules = new Map();
  const stubs = {
    'expo-constants': { default: {} },
    'react-native': { NativeModules: {} },
    '../secureStorage': { secureStorage: {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
      removeItem: async key => { if (failCleanup) throw new Error('Storage unavailable'); storage.delete(key); },
    } },
    '@react-native-async-storage/async-storage': { default: { multiRemove: async keys => { keys.forEach(key => storage.delete(key)); } } },
    '../iap/persistence': {
      clearPersistedSubscription: async () => { storage.delete('@coachr/subscription'); },
      clearPendingPurchasesForAccount: async accountId => {
        if (failPendingCleanup) throw new Error('Pending storage unavailable');
        storage.delete(`pending.${accountId}`);
      },
    },
    './trace': { TRACE_ENABLED: false, trace() {} },
    '../../utils/lineupGenerator': {},
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const source = fs.readFileSync(path.join(__dirname, '../src/lib/backend', file), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    vm.runInNewContext(outputText, {
      exports, require(name) { if (stubs[name]) return stubs[name]; return load(name + '.ts'); },
      __DEV__: false, process: { env: { EXPO_PUBLIC_FASTAPI_BASE_URL: 'https://test.invalid' } },
      URL, console, atob, Error, TypeError, Date, setTimeout, clearTimeout, AbortController, performance,
      fetch: async (url, init) => {
        const call = { path: new URL(url).pathname, ...init, body: JSON.parse(init.body || '{}') };
        calls.push(call);
        return fetcher(call);
      },
    });
    return exports;
  }
  const client = load('fastApiProvider.ts').fastApiBackendClient;
  client.auth.onAuthStateChange((event, value) => events.push([event, value]));
  return { client, storage, events, calls };
}

test('verification and resend send the signup password', async () => {
  const { client, calls } = harness(async ({ path }) => response(200, path.endsWith('verify-email') ? { session } : { ok: true }));
  await client.auth.verifyEmail({ email: 'owner@example.com', code: '123456', password: 'owner-password' });
  await client.auth.resendVerification({ email: 'owner@example.com', password: 'owner-password' });
  assert.equal(calls[0].body.password, 'owner-password');
  assert.equal(calls[1].body.password, 'owner-password');
});

test('incorrect deletion password preserves the session and local data', async () => {
  const { client, storage, calls } = harness(async () => response(400, { detail: 'Incorrect password' }));
  const result = await client.auth.deleteAccount('incorrect');
  assert.match(result.error.message, /Incorrect password/);
  assert.equal((await client.auth.getSession()).data.session.user.id, 'owner');
  assert.ok(storage.has('coachr_setup_wizard_v2.owner'));
  assert.ok(storage.has('@coachr/subscription'));
  assert.ok(storage.has('pending.owner'));
  assert.ok(storage.has('pending.other'));
  assert.equal(calls.length, 1);
});

test('successful deletion clears only owned storage and emits signed out', async () => {
  const { client, storage, events, calls } = harness(async () => response(200, { ok: true, deletedTeamIds: ['team'] }));
  assert.equal((await client.auth.deleteAccount('owner-password')).error, null);
  assert.equal(calls[0].method, 'DELETE');
  assert.equal(calls[0].body.password, 'owner-password');
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.deepEqual([...storage.keys()], ['coachr_setup_wizard_v2.other', 'pending.other']);
  assert.ok(events.some(([event, value]) => event === 'SIGNED_OUT' && value === null));
});

test('local cleanup failure is reported separately after committed deletion', async () => {
  const { client, storage } = harness(async () => response(200, { ok: true, deletedTeamIds: ['team'] }), { failCleanup: true });
  const result = await client.auth.deleteAccount('owner-password');
  assert.equal(result.error, null);
  assert.match(result.cleanupError.message, /Storage unavailable/);
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.ok(!storage.has('@coachr/subscription'));
});

test('late refresh cannot restore a signed-out session', async () => {
  const gate = deferred();
  const { client, storage } = harness(async () => gate.promise);
  await client.auth.getSession();
  const refreshing = client.auth.refreshSession();
  await new Promise(setImmediate);
  await client.auth.signOut({ scope: 'local' });
  gate.resolve(response(200, { session: { ...session, accessToken: 'late-access' } }));
  await refreshing;
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.ok(!storage.has('coachr.fastapi.session'));
});

test('deletion waits for an existing refresh then removes its credentials', async () => {
  const gate = deferred();
  const { client, storage, calls } = harness(async ({ path }) => path === '/auth/refresh' ? gate.promise : response(200, { ok: true, deletedTeamIds: ['team'] }));
  await client.auth.getSession();
  const refreshing = client.auth.refreshSession();
  await new Promise(setImmediate);
  const deleting = client.auth.deleteAccount('owner-password');
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  gate.resolve(response(200, { session: { ...session, accessToken: 'new-access' } }));
  await refreshing;
  assert.equal((await deleting).error, null);
  assert.equal(calls[1].headers.Authorization, 'Bearer new-access');
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.ok(!storage.has('coachr.fastapi.session'));
});

test('deletion blocks duplicate submissions and other account requests', async () => {
  const gate = deferred();
  const { client, calls } = harness(async () => gate.promise);
  const deleting = client.auth.deleteAccount('owner-password');
  await new Promise(setImmediate);
  const second = await client.auth.deleteAccount('owner-password');
  assert.match(second.error.message, /in progress/);
  await assert.rejects(client.getMyTeam(), /in progress/);
  assert.equal(calls.length, 1);
  gate.resolve(response(200, { ok: true, deletedTeamIds: ['team'] }));
  assert.equal((await deleting).error, null);
});

test('refresh started during deletion cannot restore the deleted session', async () => {
  const deleteGate = deferred();
  const refreshGate = deferred();
  const { client, storage } = harness(async ({ path }) => path === '/auth/refresh' ? refreshGate.promise : deleteGate.promise);
  const deleting = client.auth.deleteAccount('owner-password');
  await new Promise(setImmediate);
  const refreshing = client.auth.refreshSession();
  await new Promise(setImmediate);
  deleteGate.resolve(response(200, { ok: true, deletedTeamIds: ['team'] }));
  assert.equal((await deleting).error, null);
  refreshGate.resolve(response(200, { session: { ...session, accessToken: 'late' } }));
  await refreshing;
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.ok(!storage.has('coachr.fastapi.session'));
});

test('network failure leaves account state available for retry', async () => {
  const { client, storage } = harness(async () => { throw new TypeError('Network request failed'); });
  const result = await client.auth.deleteAccount('owner-password');
  assert.equal(result.error.code, 'NETWORK_ERROR');
  assert.equal((await client.auth.getSession()).data.session.user.id, 'owner');
  assert.ok(storage.has('@coachr/subscription'));
});

test('an old request cannot retry with a different signed-in account', async () => {
  const gate = deferred();
  const { client, calls } = harness(async ({ path }) => {
    if (path === '/auth/refresh') return gate.promise;
    if (path === '/auth/signin') return response(200, { session: { ...session, user: { id: 'other', email: 'other@example.com' } } });
    return response(401, { detail: 'Expired token' });
  });
  const reading = client.getMyTeam();
  const rejected = assert.rejects(reading, /Account changed/);
  await new Promise(setImmediate);
  await client.auth.signOut({ scope: 'local' });
  await client.auth.signInWithPassword({ email: 'other@example.com', password: 'other-password' });
  gate.resolve(response(200, { session }));
  await rejected;
  assert.equal(calls.filter(call => call.path === '/teams/me').length, 1);
  assert.equal((await client.auth.getSession()).data.session.user.id, 'other');
});


test('pending-purchase cleanup failure is reported after acknowledged account deletion', async () => {
  const { client, storage } = harness(async () => response(200, { ok: true, deletedTeamIds: ['team'] }), { failPendingCleanup: true });
  const result = await client.auth.deleteAccount('owner-password');
  assert.equal(result.error, null);
  assert.match(result.cleanupError.message, /Pending storage unavailable/);
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.ok(!storage.has('@coachr/subscription'));
  assert.ok(!storage.has('coachr_setup_wizard_v2.owner'));
  assert.ok(storage.has('pending.owner'));
  assert.ok(storage.has('pending.other'));
});
