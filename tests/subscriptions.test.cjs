const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const purchase = {
  productId: 'subscription.monthly', transactionId: 'apple-tx',
  originalTransactionIdentifierIOS: 'client-original', purchaseToken: 'signed-token',
  purchaseState: 'purchased', platform: 'ios', store: 'apple', id: 'apple-tx',
  quantity: 1, transactionDate: Date.now(), isAutoRenewing: true,
};
const free = { isPro: false, productId: null, status: null, expiresAt: null, accessUntil: null, proAccess: null, isAdmin: false };
const pro = { ...free, isPro: true, productId: purchase.productId, status: 'active', expiresAt: new Date(Date.now() + 86400000).toISOString(), accessUntil: new Date(Date.now() + 86400000).toISOString(), acknowledgement: { transactionId: purchase.transactionId, state: "committed" } };
const pendingKey = account => '@coachr/pending-purchases/' + account;
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(setImmediate); };
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness({ storage = new Map(), verify = async () => pro, finish = async () => {}, available = [], status = free, failStorage = false } = {}) {
  const events = [], alerts = [], warnings = [], timers = [], accessChanges = [], modules = new Map();
  let now = Date.now();
  class Clock extends Date {
    static now() { return now; }
  }
  let current = true, availablePurchases = available, listener, authListener, foreground, interval;
  const hooks = [];
  let cursor = 0, effects = [];
  const memo = (fn, deps) => {
    const slot = cursor++;
    if (!hooks[slot] || deps.some((value, i) => value !== hooks[slot].deps[i])) hooks[slot] = { value: fn(), deps };
    return hooks[slot].value;
  };
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    createElement: (type, props) => ({ type, props }),
    useState: initial => {
      const slot = cursor++;
      if (!hooks[slot]) hooks[slot] = { value: initial };
      return [hooks[slot].value, value => { hooks[slot].value = value; }];
    },
    useRef: initial => { const slot = cursor++; if (!hooks[slot]) hooks[slot] = { current: initial }; return hooks[slot]; },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => {
      const slot = cursor++;
      if (hooks[slot] && !deps.some((value, i) => value !== hooks[slot].deps[i])) return;
      effects.push(() => { if (hooks[slot]?.cleanup) hooks[slot].cleanup(); hooks[slot] = { deps, cleanup: fn() }; });
    },
  };
  react.default = react;
  const stubs = {
    react,
    'react-native': { Platform: { OS: 'ios' }, Alert: { alert: (...args) => alerts.push(args) }, AppState: {
      currentState: 'active', addEventListener: (_event, fn) => { foreground = fn; return { remove() {} }; },
    } },
    'react-native-iap': {
      initConnection: async () => { events.push(["connect"]); return true; }, syncIOS: async () => { events.push(["sync"]); return true; }, endConnection: async () => {}, fetchProducts: async () => [],
      requestPurchase: async request => events.push(['request', request]),
      getAvailablePurchases: async () => { events.push(["enumerate"]); return availablePurchases; },
      finishTransaction: async ({ purchase }) => { events.push(['finish', purchase.transactionId]); await finish(); },
      purchaseUpdatedListener: fn => { listener = fn; return { remove() {} }; },
      purchaseErrorListener: () => ({ remove() {} }), ErrorCode: {},
    },
    '@react-native-async-storage/async-storage': { default: {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { if (failStorage) throw new Error('Storage unavailable'); events.push(['persist', key]); storage.set(key, value); },
      removeItem: async key => { events.push(['remove', key]); storage.delete(key); },
    } },
    '../backend/client': { backendClient: {
      verifySubscription: async body => { events.push(['verify', body.transactionId]); return verify(body); },
      getSubscriptionStatus: async () => typeof status === "function" ? status() : status,
      getSubscriptionAccountToken: async () => ({ appAccountToken: accountId }),
      auth: { onAuthStateChange: fn => { authListener = fn; return { data: { subscription: { unsubscribe() {} } } }; } },
    } },
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/iap', file), 'utf8'), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
    });
    vm.runInNewContext(outputText, {
      exports, require: name => stubs[name] || load(name + '.ts'),
      __DEV__: false, process: { env: {} }, Date: Clock, Map, Error, AbortController, performance,
      console: { warn: (...args) => warnings.push(args) },
      setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, clearTimeout(timer) { timer.canceled = true; },
      setInterval: fn => { interval = fn; return 1; }, clearInterval() {},
    });
    return exports;
  }
  const verifier = (account = 'owner') => load('purchaseVerification.ts').createPurchaseVerifier(account, () => current, value => events.push(['entitlement', value.isPro]));
  let provider, accountId;
  const onAccessChange = value => accessChanges.push(value);
  function render() {
    cursor = 0;
    const value = provider({ children: null, accountId, onAccessChange }).props.value;
    const queued = effects; effects = [];
    queued.forEach(fn => fn());
    return value;
  }
  return {
    storage, events, alerts, warnings, timers, accessChanges, verifier, advance: ms => { now += ms; },
    persistence: () => load('persistence.ts'),
    store: () => load('storeService.ts'),
    setCurrent: value => { current = value; },
    mount: account => { accountId = account; provider = load('SubscriptionProvider.tsx').SubscriptionProvider; return render(); },
    render, purchaseEvent: value => listener(value), foreground: () => foreground('active'), interval: () => interval(),
    changeAccount: () => authListener('SIGNED_IN', { user: { id: 'other' } }),
    setAvailable: value => { availablePurchases = value; },
  };
}

test('persists before verification and finishes only after server entitlement', async () => {
  const gate = deferred();
  const h = harness({ verify: async body => { assert.equal(body.originalTransactionId, undefined); return gate.promise; } });
  const work = h.verifier().verify(purchase);
  await settle();
  assert.deepEqual(h.events.map(event => event[0]), ['persist', 'verify']);
  assert.ok(h.storage.has(pendingKey('owner')));
  gate.resolve(pro);
  await work;
  assert.deepEqual(h.events.map(event => event[0]), ['persist', 'verify', 'persist', 'entitlement', 'finish', 'remove']);
  assert.ok(!h.storage.has(pendingKey('owner')));
});

test('failed verification survives restart and never finishes or grants Pro', async () => {
  const h = harness({ verify: async () => { throw new Error('offline'); } });
  await assert.rejects(h.verifier().verify(purchase), /offline/);
  assert.deepEqual(h.events.map(event => event[0]), ['persist', 'verify', 'persist']);
  const restarted = harness({ storage: h.storage });
  restarted.advance(600_000);
  await restarted.verifier().retryPending();
  assert.deepEqual(restarted.events.map(event => event[0]), ['verify', 'persist', 'entitlement', 'finish', 'remove']);
  assert.ok(!h.storage.has(pendingKey('owner')));
});

test('finish failure retains the purchase for retry after server confirmation', async () => {
  const h = harness({ finish: async () => { throw new Error('StoreKit unavailable'); } });
  await assert.rejects(h.verifier().verify(purchase), /StoreKit unavailable/);
  assert.ok(h.storage.has(pendingKey('owner')));
  assert.ok(h.events.some(event => event[0] === 'entitlement' && event[1] === true));
  const restarted = harness({ storage: h.storage });
  restarted.advance(600_000);
  await restarted.verifier().retryPending();
  assert.ok(!h.storage.has(pendingKey('owner')));
});

test('duplicate events share verification and transaction finishing', async () => {
  const gate = deferred();
  const h = harness({ verify: () => gate.promise });
  const verifier = h.verifier();
  const first = verifier.verify(purchase), second = verifier.verify(purchase);
  assert.equal(first, second);
  gate.resolve(pro);
  await Promise.all([first, second]);
  assert.equal(h.events.filter(event => event[0] === 'verify').length, 1);
  assert.equal(h.events.filter(event => event[0] === 'finish').length, 1);
});

test('storage failure prevents verification, Pro delivery, and finishing', async () => {
  const h = harness({ failStorage: true });
  await assert.rejects(h.verifier().verify(purchase), /Storage unavailable/);
  assert.deepEqual(h.events, []);
});

test('unknown and deferred purchases cannot enter the verification queue', async () => {
  const h = harness();
  for (const value of [{ ...purchase, purchaseState: 'pending' }, { ...purchase, productId: 'foreign.sku' }, { ...purchase, transactionId: '' }]) {
    await assert.rejects(h.verifier().verify(value), /not a completed Pro/);
  }
  assert.deepEqual(h.events, []);
});

test('account changes during verification cannot deliver or finish the old purchase', async () => {
  const gate = deferred();
  const h = harness({ verify: () => gate.promise });
  const work = h.verifier().verify(purchase);
  await settle();
  h.setCurrent(false);
  gate.resolve(pro);
  await assert.rejects(work, /Account changed/);
  assert.ok(h.storage.has(pendingKey('owner')));
  assert.deepEqual(h.events.map(event => event[0]), ['persist', 'verify']);
  const other = harness({ storage: h.storage });
  await other.verifier('other').retryPending();
  assert.deepEqual(other.events, []);
});

test('concurrent queued writes and legacy cache cleanup preserve pending transactions', async () => {
  const h = harness({ storage: new Map([['@coachr/subscription', 'legacy']]) });
  const persistence = h.persistence();
  await Promise.all([
    persistence.enqueuePendingPurchase('owner', purchase),
    persistence.enqueuePendingPurchase('owner', { ...purchase, transactionId: 'renewal' }),
    persistence.clearPersistedSubscription(),
  ]);
  assert.equal((await persistence.readPendingPurchases('owner')).length, 2);
  assert.ok(!h.storage.has('@coachr/subscription'));
  await persistence.removePendingPurchase('owner', 'apple-tx');
  assert.equal((await persistence.readPendingPurchases('owner'))[0].transactionId, 'renewal');
});

test('startup never trusts the legacy entitlement cache or an unverified store purchase', async () => {
  const h = harness({
    storage: new Map([['@coachr/subscription', JSON.stringify({ isPro: true, activeSku: purchase.productId })]]),
    available: [purchase], verify: async () => { throw new Error('offline'); },
  });
  assert.equal(h.mount('owner').isPro, false);
  await settle();
  assert.equal(h.render().isPro, false);
  assert.ok(h.storage.has(pendingKey('owner')));
  assert.ok(!h.events.some(event => event[0] === 'finish'));
});

test('restore rejection never reports restored or grants Pro', async () => {
  const h = harness({ verify: async () => { throw new Error('Already linked to another account'); } });
  h.mount('other');
  await settle();
  h.setAvailable([purchase]);
  await h.render().restore();
  assert.equal(h.render().isPro, false);
  assert.equal(h.alerts.at(-1)[0], 'Restore failed');
  assert.ok(!h.alerts.some(alert => alert[0] === 'Restored'));
  assert.ok(!h.events.some(event => event[0] === 'finish'));
});

test('foreground and periodic recovery retry failed purchases and unlock after confirmation', async () => {
  let offline = true;
  const h = harness({ verify: async () => { if (offline) throw new Error('offline'); return pro; } });
  h.mount('owner');
  await settle();
  await h.purchaseEvent(purchase);
  assert.equal(h.render().isPro, false);
  h.foreground();
  await settle();
  assert.equal(h.events.filter(event => event[0] === 'verify').length, 1);
  h.advance(600_000);
  offline = false;
  h.interval();
  await settle();
  assert.equal(h.render().isPro, true);
  assert.ok(!h.storage.has(pendingKey('owner')));
});

test('startup retries account-scoped pending work after a process restart', async () => {
  const h = harness({ storage: new Map([[pendingKey('owner'), JSON.stringify([purchase])]]) });
  h.mount('owner');
  await settle();
  assert.equal(h.render().isPro, true);
  assert.ok(!h.storage.has(pendingKey('owner')));
});

test('provider ignores late verification after a session changes', async () => {
  const gate = deferred();
  const h = harness({ verify: () => gate.promise });
  h.mount('owner');
  await settle();
  const work = h.purchaseEvent(purchase);
  await settle();
  h.changeAccount();
  gate.resolve(pro);
  await work;
  assert.equal(h.render().isPro, false);
  assert.ok(h.storage.has(pendingKey('owner')));
  assert.ok(!h.events.some(event => event[0] === 'finish'));
});

test('an expired cached backend response cannot reopen Pro', async () => {
  const h = harness({ status: { ...pro, expiresAt: new Date(Date.now() - 1000).toISOString(), accessUntil: new Date(Date.now() - 1000).toISOString() } });
  h.mount('owner');
  await settle();
  assert.equal(h.render().isPro, false);
  h.interval();
  await settle();
  assert.equal(h.render().isPro, false);
});

test('a backend override disabling Pro is respected even after purchase verification', async () => {
  const h = harness({ verify: async () => ({ ...pro, isPro: false, proAccess: false }) });
  h.mount('owner');
  await settle();
  await h.purchaseEvent(purchase);
  assert.equal(h.render().isPro, false);
  assert.ok(h.events.some(event => event[0] === 'finish'));
  assert.ok(!h.storage.has(pendingKey('owner')));
});

test('the native purchase request explicitly disables automatic finishing', async () => {
  const h = harness();
  await h.store().requestSubscriptionPurchase(purchase.productId, "account-token");
  assert.equal(h.events[0][1].request.apple.andDangerouslyFinishTransactionAutomatically, false);
});


test('explicit Restore synchronizes before enumeration; automatic recovery never syncs', async () => {
  const h = harness();
  h.mount('owner');
  await settle();
  assert.equal(h.events.filter(event => event[0] === 'sync').length, 0);
  h.events.length = 0;
  await h.render().restore();
  assert.deepEqual(h.events.filter(event => ['sync', 'enumerate'].includes(event[0])).map(event => event[0]), ['sync', 'enumerate']);
});

test('acknowledged finish survives expiry and never needs another access grant', async () => {
  const h = harness({ finish: async () => { throw new Error('native offline'); } });
  await assert.rejects(h.verifier().verify(purchase));
  assert.equal(JSON.parse(h.storage.get(pendingKey('owner')))[0].acknowledged, true);
  const restarted = harness({ storage: h.storage, verify: async () => { throw new Error('must not reverify'); } });
  restarted.advance(600_000);
  await restarted.verifier().retryPending();
  assert.deepEqual(restarted.events.map(event => event[0]), ['finish', 'remove']);
});

test('terminal ownership conflict stops callback and timer retries until explicit Restore', async () => {
  const error = Object.assign(new Error('Account conflict'), { context: { status: 409, body: { detail: { code: 'PURCHASE_OWNERSHIP_CONFLICT', retryable: false } } } });
  const h = harness({ verify: async () => { throw error; } });
  const verifier = h.verifier();
  await assert.rejects(verifier.verify(purchase));
  h.advance(600_000);
  await verifier.retryPending();
  await verifier.verify(purchase, 'recovery', true);
  assert.equal(h.events.filter(event => event[0] === 'verify').length, 1);
  await assert.rejects(verifier.verify(purchase, 'restore'));
  assert.equal(h.events.filter(event => event[0] === 'verify').length, 2);
});

test('Retry-After prevents early retry after process restart', async () => {
  const error = Object.assign(new Error('Slow down'), { context: { status: 429, retryAfterSeconds: 900 } });
  const h = harness({ verify: async () => { throw error; } });
  await assert.rejects(h.verifier().verify(purchase));
  const restarted = harness({ storage: h.storage });
  restarted.advance(600_000);
  await restarted.verifier().retryPending();
  assert.equal(restarted.events.filter(event => event[0] === 'verify').length, 0);
  restarted.advance(400_000);
  await restarted.verifier().retryPending();
  assert.equal(restarted.events.filter(event => event[0] === 'verify').length, 1);
});

test('account deletion clears only its queue and prevents stale callbacks re-enqueueing', async () => {
  const h = harness();
  const storage = h.persistence();
  await storage.enqueuePendingPurchase('owner', purchase);
  await storage.enqueuePendingPurchase('other', purchase);
  await storage.clearPendingPurchasesForAccount('owner');
  assert.ok(!h.storage.has(pendingKey('owner')));
  assert.ok(h.storage.has(pendingKey('other')));
  await assert.rejects(storage.enqueuePendingPurchase('owner', purchase), /deleted/);
});

test('verified grace remains Pro after paid expiry and locks at accessUntil', async () => {
  const accessUntil = new Date(Date.now() + 600_000).toISOString();
  const h = harness({ status: { ...pro, status: 'grace', expiresAt: new Date(Date.now() - 1000).toISOString(), accessUntil } });
  h.mount('owner');
  await settle();
  assert.equal(h.render().isPro, true);
  const expiry = h.timers.find(timer => timer.ms > 590_000);
  h.advance(700_000);
  expiry.fn();
  assert.equal(h.render().isPro, false);
});

test('hanging status refresh does not block StoreKit setup or product work', async () => {
  const h = harness({ status: () => new Promise(() => {}) });
  h.mount('owner');
  await settle();
  assert.ok(h.events.some(event => event[0] === 'connect'));
  assert.ok(h.events.some(event => event[0] === 'enumerate'));
});

test('late native callback carrying account A token never enters account B queue', async () => {
  const h = harness();
  h.mount('other');
  await settle();
  await h.purchaseEvent({ ...purchase, appAccountToken: 'owner' });
  assert.ok(!h.storage.has(pendingKey('other')));
  assert.ok(!h.events.some(event => event[0] === 'verify'));
});

test('StoreKit uppercase appAccountToken still matches the lowercase account id', async () => {
  const id = '3f2a9c1e-0b4d-4e8f-9a1b-2c3d4e5f6a7b';
  const h = harness();
  h.mount(id);
  await settle();
  await h.purchaseEvent({ ...purchase, appAccountToken: id.toUpperCase() });
  assert.ok(h.events.some(event => event[0] === 'verify'));
  assert.equal(h.render().isPro, true);
  assert.equal(h.render().loading, false);
});

test('a mismatched-token callback releases the purchase lock', async () => {
  const h = harness();
  h.mount('other');
  await settle();
  await h.render().purchase('subscription.monthly');
  await h.purchaseEvent({ ...purchase, appAccountToken: 'owner' });
  assert.equal(h.render().loading, false);
});


test('authoritative entitlement and expiry notify access consumers before account reset', async () => {
  const ending = { ...pro, accessUntil: new Date(Date.now() + 10000).toISOString() };
  const h = harness({ status: ending });
  h.mount('owner');
  await settle();
  h.render();
  assert.equal(h.accessChanges[0].accountId, 'owner');
  assert.equal(h.accessChanges[0].isPro, false);
  assert.equal(h.accessChanges.at(-1).isPro, true);
  h.advance(20000);
  h.timers.filter(timer => !timer.canceled && timer.ms <= 10000).forEach(timer => timer.fn());
  assert.equal(h.accessChanges.at(-1).isPro, false);
  h.changeAccount();
  assert.equal(h.accessChanges.at(-1).accountId, 'other');
  assert.equal(h.accessChanges.at(-1).isPro, false);
  assert.equal(h.render().isPro, false);
});


test('status refresh failure remains unknown for privacy rather than verified Free', async () => {
  const h = harness({ status: async () => { throw new Error('offline'); } });
  assert.equal(h.mount('owner').entitlement, 'unknown');
  await settle();
  const result = h.render();
  assert.equal(result.initializing, false);
  assert.equal(result.entitlement, 'unknown');
  assert.equal(result.isPro, false);
});

test('only authoritative status establishes Free or Pro and account reset becomes unknown', async () => {
  const h = harness({ status: pro });
  h.mount('owner');
  await settle();
  assert.equal(h.render().entitlement, 'pro');
  h.changeAccount();
  assert.equal(h.render().entitlement, 'unknown');
  const freeUser = harness({ status: free });
  freeUser.mount('free');
  await settle();
  assert.equal(freeUser.render().entitlement, 'free');
});
