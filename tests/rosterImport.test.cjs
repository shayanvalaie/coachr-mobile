const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const preview = { worksheet: 'Roster', rows: [{ sourceRow: 2, player: { name: 'Alice', gender: 'female', desiredPositions: ['P'], fixedAllGame: false, lockInPosition: false, benched: false } }], issues: [], emptySourceRows: [] };
const pending = { accountId: 'owner', teamId: 'team', operationId: '11111111-1111-4111-8111-111111111111', rows: preview.rows, rulesContext: 'submission:original', attempted: false };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(done => setImmediate(done)); };

function parser() {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/rosterFileParser.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  vm.runInNewContext(outputText, { exports, require(name) { if (name === 'fflate') return require('fflate'); throw new Error(name); }, Error, Set, Uint8Array, String, Number, RegExp });
  return exports;
}

function utility(options = {}) {
  const store = new Map();
  const reads = [], removed = [], recovered = [];
  const asset = { uri: 'file:///cache/DocumentPicker/roster.csv', name: 'roster.csv', size: 10, ...options.asset };
  const content = options.content ?? Buffer.from('Name\nAlice').toString('base64');
  const file = {
    cacheDirectory: 'file:///cache/',
    getInfoAsync: async () => options.info ?? { exists: true, size: Buffer.from(content, 'base64').length },
    readAsStringAsync: async (uri, settings) => { reads.push(settings); return content; },
    deleteAsync: async uri => {
      if (uri === 'file:///cache/DocumentPicker/') {
        recovered.push(uri);
        if (options.recovery) await options.recovery();
      } else removed.push(uri);
    },
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
    if (name === './rosterFileParser') return parser();
    throw new Error(name);
  }, Error, Map, Set, Promise, AbortController });
  return { api: exports, store, reads, removed, recovered };
}

test('valid preview is parsed on device with a bounded native read and cleans the temporary copy', async () => {
  const h = utility();
  const value = await h.api.pickRosterImportPreview('team', () => assert.fail('upload'));
  assert.equal(value.rows.length, 1);
  assert.equal(value.rows[0].player.name, 'Alice');
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

test('preview accepts a bounded server rules context and rejects malformed contexts', () => {
  const h = utility();
  assert.equal(h.api.validateImportPreview({ ...preview, rulesContext: 'submission:current' }).rulesContext, 'submission:current');
  for (const rulesContext of [null, 12, '', 'x'.repeat(257)]) {
    assert.throws(() => h.api.validateImportPreview({ ...preview, rulesContext }), error => error.code === 'IMPORT_INVALID_ROWS');
  }
});

test('cancel during native read suppresses upload and removes the picker copy', async () => {
  const wait = deferred();
  const h = utility({ pick: async () => { await wait.promise; return { canceled: false, assets: [{ uri: 'file:///cache/DocumentPicker/roster.csv', name: 'roster.csv' }] }; } });
  const controller = new AbortController();
  const job = h.api.pickRosterImportPreview('team', () => assert.fail('upload'), controller.signal);
  await settle();
  controller.abort(); wait.resolve();
  await assert.rejects(job, error => error.code === 'CANCELLED');
  assert.equal(h.removed.length, 1);
});

test('legacy xls goes to the server parser, whose errors stay actionable and still clean the file', async () => {
  const h = utility({ asset: { uri: 'file:///cache/DocumentPicker/roster.xls', name: 'roster.xls' } });
  await assert.rejects(h.api.pickRosterImportPreview('team', async () => { throw new Error('Secure parser unavailable.'); }), /Secure parser unavailable/);
  assert.equal(h.removed.length, 1);
});

test('startup recovery deletes only the picker directory once without listing files', async () => {
  const h = utility();
  await Promise.all([h.api.recoverRosterImportFiles(), h.api.recoverRosterImportFiles()]);
  await h.api.pickRosterImportPreview('team', async () => preview);
  assert.deepEqual(h.recovered, ['file:///cache/DocumentPicker/']);
  assert.equal(h.reads.length, 1);
  assert.equal(h.removed.length, 1);
});

test('picker waits for startup recovery before creating a new temporary file', async () => {
  const wait = deferred(); let opened = false;
  const h = utility({ recovery: () => wait.promise, pick: async () => { opened = true; return { canceled: true }; } });
  const job = h.api.pickRosterImportPreview('team', () => assert.fail('upload'));
  await settle();
  assert.equal(opened, false);
  wait.resolve();
  assert.equal(await job, null);
  assert.equal(opened, true);
});

test('failed cache recovery prevents a new picker and can retry safely', async () => {
  let attempts = 0;
  const h = utility({ recovery: async () => { if (++attempts === 1) throw new Error('native path canary'); } });
  await assert.rejects(h.api.pickRosterImportPreview('team', () => assert.fail('upload')), error =>
    error.code === 'IMPORT_CLEANUP_FAILED' && !error.message.includes('canary'));
  assert.equal(h.reads.length, 0);
  assert.equal((await h.api.pickRosterImportPreview('team', async () => preview)).rows.length, 1);
});

test('picker cleanup does not delete a source outside its native temporary directory', async () => {
  const h = utility({ asset: { uri: 'file:///cache/other-feature/roster.csv' } });
  await h.api.pickRosterImportPreview('team', async () => preview);
  assert.equal(h.removed.length, 0);
});

test('csv parser maps columns like the server parser and reports bad rows as issues', () => {
  const { parseRosterFile } = parser();
  const csv = 'Player Name,Gender,Positions,Fixed,Lock\r\n"Smith, Jo",F,"ss, 2b",yes,no\r\nAl,m,P,,y\r\n,,,,\r\nal,f,,,\r\n=SUM(1),f,,,\r\n';
  const result = parseRosterFile('roster.csv', Buffer.from('\ufeff' + csv).toString('base64'));
  assert.equal(result.worksheet, 'CSV');
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [
    { sourceRow: 2, player: { name: 'Smith, Jo', gender: 'female', desiredPositions: ['SS', '2B'], fixedAllGame: true, lockInPosition: false, benched: false } },
    { sourceRow: 3, player: { name: 'Al', gender: 'male', desiredPositions: ['P'], fixedAllGame: false, lockInPosition: true, benched: false } },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.emptySourceRows)), [4]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.issues.map(issue => [issue.sourceRow, issue.code]))), [[5, 'DUPLICATE_NAME'], [6, 'INVALID_NAME']]);
});

function xlsx(sheetXml, sharedXml) {
  const { zipSync, strToU8 } = require('fflate');
  const files = {
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheets><sheet name="Team &amp; Co" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  };
  if (sharedXml) files['xl/sharedStrings.xml'] = strToU8(sharedXml);
  return Buffer.from(zipSync(files)).toString('base64');
}

test('xlsx parser reads the first sheet with shared, inline and numeric cells', () => {
  const { parseRosterFile } = parser();
  const sheet = '<worksheet><sheetData>'
    + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" t="inlineStr"><is><t>c</t></is></c></row>'
    + '<row r="4"><c r="A4" t="inlineStr"><is><t>Ann &amp; Bo</t></is></c><c r="B4"><v>1</v></c></row>'
    + '</sheetData></worksheet>';
  const shared = '<sst><si><t>Name</t></si><si><r><t>Pos</t></r><r><t>ition</t></r></si><si><t xml:space="preserve"> Zed </t></si></sst>';
  const result = parseRosterFile('team.xlsx', xlsx(sheet, shared));
  assert.equal(result.worksheet, 'Team & Co');
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows.map(row => [row.sourceRow, row.player.name, row.player.desiredPositions]))), [[2, 'Zed', ['C']], [4, 'Ann & Bo', []]]);
  assert.deepEqual([...result.emptySourceRows], [3]);
});

test('xlsx parser rejects formulas and oversized sheets; xls defers to the server', () => {
  const { parseRosterFile } = parser();
  const formula = '<worksheet><sheetData><row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>';
  assert.throws(() => parseRosterFile('a.xlsx', xlsx(formula)), error => error.code === 'IMPORT_INVALID_FILE');
  const tall = '<worksheet><sheetData><row r="300"><c r="A300" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>';
  assert.throws(() => parseRosterFile('a.xlsx', xlsx(tall)), error => error.code === 'IMPORT_LIMIT_EXCEEDED');
  assert.throws(() => parseRosterFile('a.xlsx', Buffer.from('Name').toString('base64')), error => error.code === 'IMPORT_INVALID_FILE');
  assert.equal(parseRosterFile('a.xls', Buffer.from('x').toString('base64')), null);
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

function screen({ failCommit = false, pendingCommit = null, previewResult = preview, utilityOptions = {} } = {}) {
  const h = utility(utilityOptions);
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
    previewRosterImport: async () => previewResult,
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

const pressImport = h => h.find(node => node.props?.accessibilityLabel === 'Import roster from a spreadsheet').props.onPress();

test('picker cancel performs no player writes', async () => {
  const h = screen({ utilityOptions: { pick: async () => ({ canceled: true }) } }); h.render(); await settle(); h.render();
  pressImport(h); await settle(); h.render();
  assert.equal(h.commits.length, 0); assert.equal(h.store.size, 0); assert.equal(h.toasts.length, 0);
});

test('choosing a file commits immediately without a review step', async () => {
  const h = screen(); h.render(); await settle(); h.render();
  pressImport(h); await settle(); h.render();
  assert.equal(h.commits.length, 1);
  assert.equal(h.commits[0].rows[0].player.name, 'Alice');
  assert.equal(h.commits[0].rulesContext, 'submission:original');
  assert.equal(h.store.size, 0);
  assert.equal(h.toasts[0].type, 'success');
  assert.equal(h.find(node => node.type === 'Sheet'), null);
});

test('response loss retries the durable same operation on the next Import press', async () => {
  const h = screen({ failCommit: true }); h.render(); await settle(); h.render();
  pressImport(h); await settle(); h.render();
  assert.equal(h.commits.length, 1); assert.equal(h.store.size, 1);
  pressImport(h); await settle(); h.render();
  assert.equal(h.commits.length, 2); assert.equal(h.commits[0].operationId, h.commits[1].operationId);
  assert.equal(h.commits[1].rulesContext, 'submission:original'); assert.equal(h.store.size, 0);
});

test('server-parsed xls commits with the rules snapshot returned by preview', async () => {
  const h = screen({ previewResult: { ...preview, rulesContext: 'submission:current' }, utilityOptions: { asset: { uri: 'file:///cache/DocumentPicker/roster.xls', name: 'roster.xls' } } });
  h.render(); await settle(); h.render();
  pressImport(h); await settle(); h.render();
  assert.equal(h.commits.length, 1);
  assert.equal(h.commits[0].rulesContext, 'submission:current');
});

test('account switch ignores an old committed response and cannot show its roster/toast', async () => {
  const wait = deferred(); const h = screen({ pendingCommit: wait }); h.render(); await settle(); h.render();
  pressImport(h); await settle();
  h.switchAccount(); wait.resolve(); await settle(); h.render();
  assert.equal(h.toasts.length, 0);
});
