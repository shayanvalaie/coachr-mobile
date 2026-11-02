const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness({ development = true, optIn = 'true' } = {}) {
  const exports = {};
  const unexpected = () => { assert.fail('Tracing attempted external output'); };
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/backend/trace.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  vm.runInNewContext(outputText, {
    exports, __DEV__: development, process: { env: { EXPO_PUBLIC_TRACE: optIn } },
    Date, fetch: unexpected, console: { log: unexpected, warn: unexpected, error: unexpected },
    localStorage: { setItem: unexpected },
  });
  return exports;
}

test('tracing is disabled unless both development and explicit opt-in apply', () => {
  for (const options of [
    { development: false, optIn: 'true' }, { development: false },
    { optIn: '' }, { optIn: 'false' }, { optIn: '1' },
  ]) {
    const h = harness(options);
    let evaluated = 0;
    h.trace('response', () => { evaluated++; return { status: 200 }; });
    assert.equal(h.TRACE_ENABLED, false);
    assert.equal(evaluated, 0);
    assert.equal(h.readTraceRecords().length, 0);
  }
});

test('the trace stores only metadata and never uploads, logs or persists payloads', () => {
  const h = harness();
  const privateValue = { toJSON: () => assert.fail('Private value serialized') };
  h.trace('request POST', {
    method: 'POST', status: 200, count: 4,
    authorization: 'Bearer secret-canary', accessToken: 'secret-canary', refreshToken: 'secret-canary',
    password: 'secret-canary', code: '123456-secret-canary', receipt: 'secret-canary',
    rulesText: 'private-rules-canary', roster: [{ name: 'private-roster-canary' }],
    body: privateValue, error: 'secret-canary', email: 'private@example.com', name: 'private-canary',
  });
  const records = h.readTraceRecords();
  assert.equal(records.length, 1);
  assert.equal(JSON.stringify(records[0].fields), JSON.stringify({ count: 4, method: 'POST', status: 200 }));
  assert.doesNotMatch(JSON.stringify(records), /canary|123456|private|Bearer/);
});

test('metadata extraction never invokes fields getters', () => {
  const h = harness();
  const fields = { status: 200 };
  Object.defineProperty(fields, 'body', { enumerable: true, get: () => assert.fail('Body read') });
  Object.defineProperty(fields, 'count', { enumerable: true, get: () => assert.fail('Metadata getter read') });
  h.trace('response', fields);
  assert.equal(JSON.stringify(h.readTraceRecords()[0].fields), '{"status":200}');
});

test('unknown stages are rejected before evaluating their fields', () => {
  const h = harness();
  let evaluated = 0;
  h.trace('private-user-controlled-stage', () => { evaluated++; return {}; });
  assert.equal(evaluated, 0);
  assert.equal(h.readTraceRecords().length, 0);
});

test('metadata shapes and lengths are bounded without traversing large inputs', () => {
  const h = harness();
  h.trace('response', {
    count: Infinity, retryCount: -1, elapsedMs: NaN, status: 'private-canary',
    method: 'private-canary', requestId: 'x'.repeat(100_000), leagueId: 'private-canary',
    errorCode: 'private message', other: new Array(100_000).fill('private-canary'),
  });
  assert.equal(JSON.stringify(h.readTraceRecords()[0].fields), '{}');
});

test('known identifiers, states and error codes remain useful', () => {
  const h = harness();
  const leagueId = 'a403e206-a4df-4d7c-965c-ab4c8660ce7e';
  h.trace('wizard create league ok', { leagueId, status: 'active', errorCode: 'PRO_REQUIRED', signedIn: true });
  const fields = h.readTraceRecords()[0].fields;
  assert.equal(fields.leagueId, leagueId);
  assert.equal(fields.status, 'active');
  assert.equal(fields.errorCode, 'PRO_REQUIRED');
  assert.equal(fields.signedIn, true);
});

test('memory retention evicts oldest records at its fixed bound', () => {
  const h = harness();
  for (let count = 0; count < 1000; count++) h.trace('response', { count });
  const records = h.readTraceRecords();
  assert.equal(records.length, h.MAX_TRACE_RECORDS);
  assert.equal(records[0].fields.count, 900);
  assert.equal(records.at(-1).fields.count, 999);
  h.clearTraceRecords();
  assert.equal(h.readTraceRecords().length, 0);
});

test('diagnostic readers cannot mutate retained records', () => {
  const h = harness();
  h.trace('response', { status: 200 });
  const records = h.readTraceRecords();
  records[0].fields.status = 'secret-canary';
  records[0].stage = 'secret-canary';
  records.push({ timestamp: 0, stage: 'secret-canary', fields: {} });
  assert.equal(h.readTraceRecords().length, 1);
  assert.doesNotMatch(JSON.stringify(h.readTraceRecords()), /secret-canary/);
});

test('a failed optional fields producer cannot break the observed operation', () => {
  const h = harness();
  h.trace('response', () => { throw new Error('diagnostic failed'); });
  assert.equal(h.readTraceRecords().length, 0);
});
