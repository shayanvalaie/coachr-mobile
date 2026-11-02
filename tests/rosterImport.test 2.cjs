const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const preview = { worksheet: 'Roster', rows: [{ sourceRow: 2, player: { name: 'Alice', gender: 'female', desiredPositions: ['P'], fixedAllGame: false, lockInPosition: false, benched: false } }], issues: [], emptySourceRows: [] };
const pending = { accountId: 'owner', teamId: 'team', operationId: '11111111-1111-4111-8111-111111111111', rows: preview.rows, rulesContext: 'submission:original' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(done => setImmediate(done)); };

function utility(options = {}) {
  const store = new Map();
  const reads = [], removed = [];
  const asset = { uri: 'file:///cache/DocumentPicker/roster.csv', name: 'roster.csv', size: 10, ...options.asset };
  const content = options.content ?? Buffer.from('Name\nAlice').toString('base64');
  const file = {
    cacheDirectory: 'file:///cache/',
    getInfoAsync: async () => options.info ?? { exists: true, size: Buffer.from(content, 'base64').length },
    readAsStringAsync: async (uri, settings) => { reads.push(settings); return content; },
    deleteAsync: async uri => { removed.push(uri); },
  };
  const storage = {
    getItem: async key => store.get(key) ?? null,
    setItem: options.setItem ?? (async (key, value) => { store.set(key, value); }),
    removeItem: async key => { store.delete(key); },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/rosterImport.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  vm.runInNewContext(outputText, { exports, require(name) {
    if (name === 'expo-document-picker') return { getDocumentAsync: options.pick ?? (async () => ({ canceled: false, assets: [asset] })) };
    if (name === 'expo-file-system/legacy') return file;
    if (name === '@react-native-async-storage/async-storage') return { default: storage };
    throw new Error(name);
  }, Error, Map, Set, Promise, AbortController });
  return { api: exports, store, reads, removed };
}

test('valid preview uses a bounded native read and cleans the temporary copy', async () => {
  const h = utility();
  const value = await h.api.pickRosterImportPreview('team', async (team, input) => {
    assert.equal(team, 'team'); assert.equal(input.fileName, 'roster.csv'); return preview;
  });
  assert.equal(value.rows.length, 1);
  assert.equal(h.reads[0].length, 2 * 1024 * 1024 + 1);
  assert.equal(h.reads[0].position, 0);
  assert.equal(h.removed.length, 1);
});

test('picker cancellation performs no read, upload or write', async () => {
  const h = utility({ pick: async () => ({ canceled: true }) });
  assert.equal(await h.api.pickRosterImportPreview('team', () => assert.fail('upload')), null);
  assert.equal(h.reads.length, 0); assert.equal(h.store.size, 0);
});

for (const [label, options, code] of [
  ['picker metadata over limit', { asset: { size: 2 * 1024 * 1024 + 1 } }, 'IMPORT_LIMIT_EXCEEDED'],
  ['missing metadata and stat', { asset: { size: undefined }, info: { exists: true } }, 'IMPORT_INVALID_FILE'],
  ['stat over limit', { info: { exists: true, size: 2 * 1024 * 1024 + 1 } }, 'IMPORT_LIMIT_EXCEEDED'],
  ['wrong extension', { asset: { name: 'roster.exe' } }, 'IMPORT_INVALID_FILE'],
]) test(label + ' rejects before reading and cleans copied files', async () => {
  const h = utility(options);
  await assert.rejects(h.api.pickRosterImportPreview('team', () => assert.fail('upload')), error => error.code === code);
  assert.equal(h.reads.length, 0); assert.equal(h.removed.length, 1);
});

test('bounded read detects changed size and incomplete native reads', async () => {
  const h = utility({ info: { exists: true, size: 100 } });
  await assert.rejects(h.api.pickRosterImportPreview('team', () => assert.fail('upload')), error => error.code === 'IMPORT_INVALID_FILE');
  assert.equal(h.removed.length, 1);
});

test('base64 count handles an exact-limit file without decoding or regex stack overflow', () => {
  const h = utility();
  assert.equal(h.api.decodedBase64Size(Buffer.alloc(2 * 1024 * 1024).toString('base64')), 2 * 1024 * 1024);
  assert.throws(() => h.api.decodedBase64Size('===='), error => error.code === 'IMPORT_INVALID_FILE');
});

test('cancel during native read suppresses upload and removes the picker copy', async () => {
  const wait = deferred();
  const h = utility({ pick: async () => { await wait.promise; return { canceled: false, assets: [{ uri: 'file:///cache/roster.csv', name: 'roster.csv' }] }; } });
  const controller = new AbortController();
  const job = h.api.pickRosterImportPreview('team', () => assert.fail('upload'), controller.signal);
  controller.abort(); wait.resolve();
  await assert.rejects(job, error => error.code === 'CANCELLED');
  assert.equal(h.removed.length, 1);
});

test('unavailable parser has an actionable error and still cleans the file', async () => {
  const h = utility();
  await assert.rejects(h.api.pickRosterImportPreview('team', async () => { throw new Error('Secure parser unavailable.'); }), /Secure parser unavailable/);
  assert.equal(h.removed.length, 1);
});

test('pending operation persists its original ID and context for restart', async () => {
  const h = utility();
  await h.api.savePendingRosterImport(pending);
  const loaded = await h.api.loadPendingRosterImport('owner');
  assert.equal(loaded.operationId, pending.operationId);
  assert.equal(loaded.rulesContext, pending.rulesContext);
  assert.equal(await h.api.loadPendingRosterImport('other'), null);
  await h.api.clearPendingRosterImport('owner');
  assert.equal(await h.api.loadPendingRosterImport('owner'), null);
});

test('deletion racing a pending storage write cannot recreate account data', async () => {
  const wait = deferred(); let h;
  h = utility({ setItem: async (key, value) => { await wait.promise; h.store.set(key, value); } });
  const writing = h.api.savePendingRosterImport(pending);
  await settle();
  const deletion = h.api.clearPendingRosterImport('owner', { deleted: true });
  wait.resolve();
  await assert.rejects(writing, error => error.code === 'CANCELLED');
  await deletion;
  assert.equal(h.store.size, 0);
  await assert.rejects(h.api.savePendingRosterImport(pending), error => error.code === 'CANCELLED');
});

function screen({ failCommit = false, pendingCommit = null } = {}) {
  const h = utility();
  const slots = [], effects = []; let cursor = 0, epoch = 1, account = 'owner', tree;
  const commits = [], toasts = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const React = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], update => { slots[index] = typeof update === 'function' ? update(slots[index]) : update; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useMemo(fn, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = { value: fn(), deps }; return slots[index].value; },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) { const old = slots[index]; slots[index] = { deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = fn(); }); } },
  };
  const backend = {
    auth: { getSessionEpoch: () => epoch }, getOrCreateTeam: async () => 'team', getTeamRoster: async () => [], getTeamRules: async () => ({ context: 'submission:original' }),
    previewRosterImport: async () => preview,
    commitRosterImport: async (team, input) => { commits.push(input); if (pendingCommit) await pendingCommit.promise; if (failCommit && commits.length === 1) throw new Error('Response lost'); return { operationId: input.operationId, committed: true, replayed: commits.length > 1, createdCount: 1, createdPlayerIds: ['player'], skippedSourceRows: [] }; },
  };
  const toast = { show(value) { toasts.push(value); } };
  const ui = new Proxy({ useToast: () => toast }, { get(target, name) { return target[name] ?? name; } });
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/screens/RosterScreen.tsx'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } });
  let nextId = 0;
  vm.runInNewContext(outputText, { exports, require(name) {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === 'react-native') return { View: 'View', ScrollView: 'ScrollView', StyleSheet: { create: x => x }, Platform: { OS: 'ios' }, UIManager: {}, LayoutAnimation: { configureNext() {}, Presets: { easeInEaseOut: {} } }, Alert: {} };
    if (name === 'react-native-reanimated') return { default: { ScrollView: 'Animated.ScrollView' }, useAnimatedRef: () => React.useRef({}) };
    if (name === '../components/ui') return ui;
    if (name === '../components/DraggablePlayerList') return { default: 'Players' };
    if (name === '../lib/backend/client') return { backendClient: backend };
    if (name === '../theme/tokens') return { space: { md: 12, sm: 8 }, TAB_BAR_CLEARANCE: 70 };
    if (name === '../types/rules') return { defaultTeamRulesConfig: { lineupSlots: ['P'] }, rulesConfigFromTeamRules: () => ({ lineupSlots: ['P'], rulesContext: 'submission:original' }) };
    if (name === '../utils/lineupGenerator') return { createPlayer: values => ({ id: `11111111-1111-4111-8111-${String(++nextId).padStart(12, '0')}`, ...values }) };
    if (name === '../utils/playerNames') return { normalizePlayerName: value => value.trim().toLowerCase(), findDuplicatePlayerNames: () => [] };
    if (name === '../utils/rosterImport') return h.api;
    if (name === '../lib/access/paidAccess') return { capturePaidAccess: () => ({ accountId: account, epoch }), requirePaidAccess: () => ({}), assertPaidAccess: captured => { if (captured.epoch !== epoch) throw new Error('Access changed'); } };
    throw new Error(name);
  }, console, Set, Map, Promise, AbortController, Error, __DEV__: false });
  const render = () => { cursor = 0; tree = exports.default({ session: { user: { id: account } }, hasProSubscription: true, onRequirePro() {} }); while (effects.length) effects.shift()(); return tree; };
  function find(predicate, node) { if (arguments.length === 1) node = tree; if (!node || typeof node !== 'object') return null; if (Array.isArray(node)) { for (const child of node) { const hit = find(predicate, child); if (hit) return hit; } return null; } if (predicate(node)) return node; for (const value of Object.values(node.props ?? {})) { const hit = find(predicate, value); if (hit) return hit; } return null; }
  return { ...h, render, find, commits, toasts, switchAccount() { account = 'other'; epoch++; render(); } };
}

test('roster preview cancel performs no player writes', async () => {
  const h = screen(); h.render(); await settle(); h.render();
  h.find(node => node.props?.accessibilityLabel === 'Import roster from a spreadsheet').props.onPress();
  await settle(); h.render();
  const sheet = h.find(node => node.type === 'Sheet'); assert.equal(sheet.props.visible, true);
  h.find(node => node.props?.label === 'Cancel').props.onPress(); await settle(); h.render();
  assert.equal(h.commits.length, 0); assert.equal(h.store.size, 0);
});

test('response loss retries the durable same operation instead of individual player writes', async () => {
  const h = screen({ failCommit: true }); h.render(); await settle(); h.render();
  h.find(node => node.props?.accessibilityLabel === 'Import roster from a spreadsheet').props.onPress(); await settle(); h.render();
  h.find(node => node.props?.label === 'Import players').props.onPress(); await settle(); h.render();
  assert.equal(h.commits.length, 1); assert.equal(h.store.size, 1);
  h.find(node => node.props?.label === 'Confirm saved import').props.onPress(); await settle(); h.render();
  assert.equal(h.commits.length, 2); assert.equal(h.commits[0].operationId, h.commits[1].operationId);
  assert.equal(h.commits[1].rulesContext, 'submission:original'); assert.equal(h.store.size, 0);
});

test('account switch ignores an old committed response and cannot show its roster/toast', async () => {
  const wait = deferred(); const h = screen({ pendingCommit: wait }); h.render(); await settle(); h.render();
  h.find(node => node.props?.accessibilityLabel === 'Import roster from a spreadsheet').props.onPress(); await settle(); h.render();
  h.find(node => node.props?.label === 'Import players').props.onPress(); await settle();
  h.switchAccount(); wait.resolve(); await settle(); h.render();
  assert.equal(h.toasts.length, 0); assert.equal(h.find(node => node.type === 'Sheet').props.visible, false);
});
