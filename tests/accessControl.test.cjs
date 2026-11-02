const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, stubs = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, Object, Error, Set, require(name) {
    if (!(name in stubs)) throw new Error(`Unexpected import ${name}`);
    return stubs[name];
  } });
  return exports;
}

const policy = () => load('src/lib/access/paidAccess.ts');

test('unknown access denies paid requests without inventing an entitlement', () => {
  const access = policy();
  assert.equal(access.capturePaidAccess().isPro, false);
  assert.throws(access.requirePaidAccess, error => error.context.status === 403 && error.code === 'PRO_REQUIRED');
  access.setPaidAccess({ accountId: 'a', isPro: true });
  assert.equal(access.requirePaidAccess().isPro, true);
});

for (const transition of ['expiry', 'revoke', 'switch', 'logout', 'delete', 'renew']) {
  test(`late protected or mixed-history result is rejected after ${transition}`, async () => {
    const access = policy();
    access.setPaidAccess({ accountId: 'a', isPro: transition !== 'renew' });
    const snapshot = access.capturePaidAccess();
    let finish;
    const operation = new Promise(resolve => { finish = resolve; }).then(value => {
      access.assertPaidAccess(snapshot);
      return value;
    });
    if (transition === 'switch') access.setPaidAccess({ accountId: 'b', isPro: false });
    else if (transition === 'logout' || transition === 'delete') access.setPaidAccess({ accountId: null, isPro: false });
    else access.setPaidAccess({ accountId: 'a', isPro: transition === 'renew' });
    finish({ privateGames: ['A'] });
    await assert.rejects(operation, error => error.code === 'PAID_ACCESS_CHANGED');
  });
}

test('cache invalidation precedes subscribers and renewal requires refetch', () => {
  const access = policy();
  const events = [];
  let cached = ['paid-game'];
  access.registerPaidAccessInvalidation(() => { cached = []; events.push('clear'); });
  access.subscribePaidAccess(() => { assert.equal(cached.length, 0); events.push('notify'); });
  access.setPaidAccess({ accountId: 'a', isPro: true });
  const first = access.capturePaidAccess();
  access.setPaidAccess({ accountId: 'a', isPro: false });
  access.setPaidAccess({ accountId: 'a', isPro: true });
  assert.deepEqual(events, ['clear', 'notify', 'clear', 'notify', 'clear', 'notify']);
  assert.throws(() => access.assertPaidAccess(first), error => error.code === 'PAID_ACCESS_CHANGED');
});

test('token refresh retaining the same authoritative state does not clear data', () => {
  const access = policy();
  access.setPaidAccess({ accountId: 'a', isPro: true });
  const before = access.capturePaidAccess();
  let notifications = 0;
  const stop = access.subscribePaidAccess(() => notifications++);
  access.setPaidAccess({ accountId: 'a', isPro: true });
  access.assertPaidAccess(before);
  assert.equal(notifications, 0);
  stop();
  access.setPaidAccess({ accountId: 'a', isPro: false });
  assert.equal(notifications, 0);
});

function gateHarness() {
  let isPro = false;
  const navigated = [];
  const jsx = (type, props) => ({ type, props });
  const Gate = load('src/components/ProScreenGate.tsx', {
    react: {},
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    '../lib/proGate': { useProGate: () => ({ isPro }) },
    '../navigation/navigationRef': { navigateFromRef: (...args) => navigated.push(args) },
    '../theme/colors': { theme: { bg: { base: '#000' } } },
    '../theme/tokens': { space: { lg: 24, sm: 12 } },
    './ui/AppText': { default: 'AppText' },
    './ui/Button': { default: 'Button' },
  }).default;
  return { render: () => Gate({ featureLabel: 'Calendar', children: 'PROTECTED_CONTENT' }), setPro: value => { isPro = value; }, navigated };
}

function buttons(node, found = []) {
  if (node?.type === 'Button') found.push(node.props);
  const children = node?.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child && typeof child === 'object') buttons(child, found);
  }
  return found;
}

test('screen gate removes protected children on expiry and keeps renewal/Profile/Home reachable', () => {
  const gate = gateHarness();
  gate.setPro(true);
  assert.equal(gate.render().props.children, 'PROTECTED_CONTENT');
  gate.setPro(false);
  const blocked = gate.render();
  assert.equal(JSON.stringify(blocked).includes('PROTECTED_CONTENT'), false);
  const actions = buttons(blocked);
  assert.deepEqual(actions.map(button => button.label), ['Renew or restore', 'Go to Profile', 'Back to Home']);
  actions.forEach(button => button.onPress());
  assert.deepEqual(JSON.parse(JSON.stringify(gate.navigated)), [['Subscribe'], ['Main', { screen: 'ProfileTab' }], ['Main', { screen: 'HomeTab' }]]);
  gate.setPro(true);
  assert.equal(gate.render().props.children, 'PROTECTED_CONTENT');
});
