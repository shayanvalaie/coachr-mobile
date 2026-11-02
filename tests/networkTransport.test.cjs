const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getEventListeners } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function harness() {
  let now = 0, nextTimer = 0;
  const timers = new Map();
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/backend/requestTransport.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  vm.runInNewContext(outputText, {
    exports, AbortController, Error, RangeError, performance: { now: () => now },
    setTimeout: (callback, ms) => {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + ms });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  });
  return {
    ...exports, timers,
    async advance(ms) {
      const end = now + ms;
      await settle();
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
        await settle();
      }
      now = end;
      await settle();
    },
    elapseWithoutTimers(ms) { now += ms; },
  };
}

test('a noncooperative hanging fetch releases its caller and aborts its signal', async () => {
  const h = harness();
  let signal;
  const result = h.runWithRequestDeadline(15_000, async requestSignal => {
    signal = requestSignal;
    return new Promise(() => {});
  });
  const rejected = assert.rejects(result, error => error.code === 'REQUEST_TIMEOUT' && error.context === undefined);
  await h.advance(14_999);
  assert.equal(signal.aborted, false);
  await h.advance(1);
  await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(h.timers.size, 0);
});

for (const status of [200, 503]) {
  test(`deadline includes a hanging ${status} response body`, async () => {
    const h = harness();
    const headers = deferred();
    const body = deferred();
    let bodyReads = 0;
    const result = h.runWithRequestDeadline(100, async signal => {
      const response = await headers.promise;
      h.throwIfRequestAborted(signal);
      const value = await response.text();
      h.throwIfRequestAborted(signal);
      return JSON.parse(value);
    });
    const rejected = assert.rejects(result, error => error.code === 'REQUEST_TIMEOUT');
    await h.advance(80);
    headers.resolve({ status, text: () => { bodyReads++; return body.promise; } });
    await settle();
    assert.equal(bodyReads, 1);
    await h.advance(20);
    await rejected;
    body.resolve('{"ok":true}');
    await settle();
    assert.equal(h.timers.size, 0);
  });
}

test('caller cancellation prevents late noncancelable work from committing', async () => {
  const h = harness();
  const caller = new AbortController();
  const response = deferred();
  let commits = 0, childSignal;
  const result = h.runWithRequestDeadline(100, async signal => {
    childSignal = signal;
    await response.promise;
    h.throwIfRequestAborted(signal);
    commits++;
  }, caller.signal);
  const rejected = assert.rejects(result, error => error.code === 'REQUEST_CANCELLED');
  await settle();
  assert.equal(getEventListeners(caller.signal, 'abort').length, 1);
  caller.abort('private caller reason');
  await rejected;
  assert.equal(childSignal.aborted, true);
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
  assert.equal(h.timers.size, 0);
  response.resolve();
  await settle();
  assert.equal(commits, 0);
});

test('an already cancelled caller never starts work or installs a timer', async () => {
  const h = harness();
  const caller = new AbortController();
  caller.abort();
  let calls = 0;
  await assert.rejects(h.runWithRequestDeadline(100, async () => { calls++; }, caller.signal), error => error.code === 'REQUEST_CANCELLED');
  assert.equal(calls, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
});

test('host attempts, refresh waiting and replay consume one operation budget', async () => {
  const h = harness();
  const firstHost = deferred(), secondHost = deferred(), refresh = deferred(), replay = deferred();
  const calls = [];
  const result = h.runWithRequestDeadline(100, async signal => {
    calls.push('host-1');
    await firstHost.promise;
    h.throwIfRequestAborted(signal);
    calls.push('host-2');
    await secondHost.promise;
    h.throwIfRequestAborted(signal);
    calls.push('refresh');
    await refresh.promise;
    h.throwIfRequestAborted(signal);
    calls.push('replay');
    return replay.promise;
  });
  const rejected = assert.rejects(result, error => error.code === 'REQUEST_TIMEOUT');
  await h.advance(30);
  firstHost.resolve();
  await h.advance(30);
  secondHost.resolve();
  await h.advance(30);
  refresh.resolve();
  await h.advance(10);
  await rejected;
  assert.deepEqual(calls, ['host-1', 'host-2', 'refresh', 'replay']);
  assert.equal(h.timers.size, 0);
});

test('one timed-out waiter does not abort shared refresh for another waiter', async () => {
  const h = harness();
  const response = deferred();
  let refreshSignal, refreshCalls = 0;
  const refresh = h.runWithRequestDeadline(150, async signal => {
    refreshCalls++;
    refreshSignal = signal;
    return response.promise;
  });
  const first = h.runWithRequestDeadline(50, async signal => {
    const value = await refresh;
    h.throwIfRequestAborted(signal);
    return value;
  });
  const second = h.runWithRequestDeadline(100, async signal => {
    const value = await refresh;
    h.throwIfRequestAborted(signal);
    return value;
  });
  const rejected = assert.rejects(first, error => error.code === 'REQUEST_TIMEOUT');
  await h.advance(50);
  await rejected;
  assert.equal(refreshSignal.aborted, false);
  response.resolve('refreshed-session');
  assert.equal(await second, 'refreshed-session');
  assert.equal(refreshCalls, 1);
  assert.equal(h.timers.size, 0);
});

test('a nested operation preserves the parent timeout code', async () => {
  const h = harness();
  let childResult;
  const parent = h.runWithRequestDeadline(50, async signal => {
    childResult = h.runWithRequestDeadline(100, async () => new Promise(() => {}), signal);
    return childResult;
  });
  const parentRejected = assert.rejects(parent, error => error.code === 'REQUEST_TIMEOUT');
  await settle();
  const childRejected = assert.rejects(childResult, error => error.code === 'REQUEST_TIMEOUT');
  await h.advance(50);
  await Promise.all([parentRejected, childRejected]);
  assert.equal(h.timers.size, 0);
});

test('delayed timer dispatch cannot deliver a response after its monotonic deadline', async () => {
  const h = harness();
  const result = h.runWithRequestDeadline(50, async () => {
    h.elapseWithoutTimers(51);
    return 'late';
  });
  await assert.rejects(result, error => error.code === 'REQUEST_TIMEOUT');
  assert.equal(h.timers.size, 0);
});

test('success, HTTP errors and programmer errors release timers and caller listeners', async () => {
  for (const outcome of ['ok', new Error('403 consent needed'), new TypeError('invalid parser input')]) {
    const h = harness();
    const caller = new AbortController();
    const result = h.runWithRequestDeadline(100, async () => {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    }, caller.signal);
    if (outcome instanceof Error) await assert.rejects(result, error => error === outcome);
    else assert.equal(await result, outcome);
    assert.equal(h.timers.size, 0);
    assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
  }
});

test('transport errors use stable codes without HTTP or private caller details', () => {
  const h = harness();
  const error = new h.RequestTransportError('NETWORK_ERROR');
  assert.equal(error.code, 'NETWORK_ERROR');
  assert.equal(error.name, 'RequestTransportError');
  assert.equal(error.context, undefined);
  assert.equal(error.message, 'Unable to reach the server. Check your connection and try again.');
});

test('invalid budgets reject before executing any operation', async () => {
  const h = harness();
  for (const timeout of [0, -1, NaN, Infinity, 2_147_483_648]) {
    await assert.rejects(h.runWithRequestDeadline(timeout, async () => assert.fail('started invalid operation')), RangeError);
  }
  assert.equal(h.timers.size, 0);
});
