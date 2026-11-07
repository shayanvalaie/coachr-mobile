const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function loader(mocks = {}) {
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {}; modules.set(file, exports);
    const source = fs.readFileSync(file, 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInNewContext(output, { exports, require: name => name.startsWith('.') ? load(path.resolve(path.dirname(file), `${name}.ts`)) : mocks[name], process: { env: { EXPO_PUBLIC_ENABLE_ADS: 'true' } }, __DEV__: true, setTimeout, clearTimeout, Date, Promise });
    return exports;
  }
  return name => load(path.resolve(__dirname, `../src/${name}.ts`));
}
const state = (extra = {}) => ({ ageBand: 'teen13to17', policyVersion: '2026-10-04', declaredAt: '2026-10-04T12:00:00Z', aiConsent: { scope: 'rules_processing', version: 'rules-processing-2026-10-04', granted: false, revision: 0, acceptedAt: null, revokedAt: null }, ...extra });
const granted = () => state({ aiConsent: { ...state().aiConsent, granted: true, revision: 1, acceptedAt: '2026-10-04T12:01:00Z' } });
const account = { accountId: 'a', sessionEpoch: 1 };
function privacy(api = {}) {
  const calls = [];
  const { PrivacyController } = loader()('lib/privacy/controller');
  const controller = new PrivacyController({ getPrivacyState: async () => state(), setAgeEligibility: async input => state({ ageBand: input.ageBand }), setAiConsent: async input => { calls.push(input); return input.granted ? granted() : state(); }, ...api });
  controller.setAccount(account);
  return { controller, calls };
}
test('requiring permission displays disclosure without granting; cancel retains authority and resolves false', async () => {
  const { controller, calls } = privacy(); await settle();
  const pending = controller.requireAiConsent(account); await settle();
  assert.equal(controller.getSnapshot().disclosure, true); assert.equal(calls.length, 0);
  controller.cancelPending(); assert.equal(await pending, false); assert.equal(calls.length, 0);
});
test('affirmative grant uses current scope/version and resolves only after saved server grant', async () => {
  const { controller, calls } = privacy(); await settle();
  const pending = controller.requireAiConsent(account); await settle(); await controller.grantPending();
  assert.equal(await pending, true); assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ scope: 'rules_processing', version: 'rules-processing-2026-10-04', granted: true }]);
});
test('existing current permission is freshly checked and needs no duplicate grant', async () => {
  const { controller, calls } = privacy({ getPrivacyState: async () => granted() }); await settle();
  assert.equal(await controller.requireAiConsent(account), true); assert.equal(calls.length, 0);
});
test('account switch cancels disclosure and rejects old identity even for same account login', async () => {
  const { controller } = privacy(); await settle(); const pending = controller.requireAiConsent(account);
  controller.setAccount({ ...account, sessionEpoch: 2 }); await settle();
  assert.equal(await pending, false); assert.equal(await controller.requireAiConsent(account), false);
});
test('late grant and late fetch cannot overwrite switched-account state', async () => {
  const response = deferred(); const { controller } = privacy({ setAiConsent: () => response.promise }); await settle();
  const pending = controller.requireAiConsent(account); await settle(); const saving = controller.grantPending();
  controller.setAccount({ accountId: 'b', sessionEpoch: 2 }); response.resolve(granted()); await saving; await settle();
  assert.equal(await pending, false); assert.equal(controller.getSnapshot().account.accountId, 'b'); assert.equal(controller.getSnapshot().state.aiConsent.granted, false);
});
test('offline privacy fetch withholds permission and leaves disclosure available for cancel', async () => {
  const { controller, calls } = privacy({ getPrivacyState: async () => { throw new Error('offline'); } }); await settle();
  const pending = controller.requireAiConsent(account); await settle(); assert.equal(controller.getSnapshot().state, null); assert.equal(calls.length, 0); assert.ok(controller.getSnapshot().error);
  controller.cancelPending(); assert.equal(await pending, false);
});
test('unknown, under-13, stale policy or revoked permission never authorizes AI', () => {
  const { hasAiConsent, parsePrivacyState } = loader()('lib/privacy/contracts');
  for (const value of [state({ ageBand: 'unknown' }), state({ ageBand: 'under13' }), granted(), state({ policyVersion: 'old' })]) {
    assert.equal(hasAiConsent(value), value.ageBand === 'teen13to17' && value.aiConsent.granted);
  }
  assert.equal(hasAiConsent(state({ aiConsent: { ...granted().aiConsent, revokedAt: '2026-10-04T13:00:00Z' } })), false);
  assert.throws(() => parsePrivacyState({ ...state(), aiConsent: { ...state().aiConsent, granted: 'true' } }), /Invalid privacy/);
});
function ads(options = {}) {
  const calls = []; const events = new Map(); let shown = 0;
  const info = () => ({ canRequestAds: options.allowed !== false, privacyOptionsRequirementStatus: 'REQUIRED' });
  const sdk = {
    AdsConsent: { requestInfoUpdate: async () => { calls.push('refresh'); if (options.refreshError) throw Error('offline'); return info(); }, loadAndShowConsentFormIfRequired: async () => info(), getConsentInfo: async () => { calls.push('previous'); return info(); }, showPrivacyOptionsForm: async () => { calls.push('options'); return info(); } },
    default: () => ({ setRequestConfiguration: async config => calls.push(config), initialize: async () => calls.push('initialize') }),
    MaxAdContentRating: { G: 'G' }, AgeRestrictedTreatment: { TEEN: 'teen', UNSPECIFIED: 'unspecified' }, TestIds: { INTERSTITIAL: 'test' }, AdEventType: { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error' },
    InterstitialAd: { createForAdRequest: (id, config) => { calls.push({ id, config }); return { addAdEventListener: (event, callback) => { events.set(event, callback); return () => events.delete(event); }, load: () => calls.push('load'), show: async () => { shown++; } }; } },
  };
  const load = loader({ 'react-native-google-mobile-ads': sdk, 'react-native': { Platform: { OS: 'ios' } } });
  return { policy: load('lib/ads/policy'), present: load('lib/ads/lineupInterstitial').presentLineupInterstitial, calls, events, shown: () => shown };
}
const context = { accountId: 'a', sessionEpoch: 1, ageBand: 'adult18plus', policyVersion: '2026-10-04', entitlement: 'free' };
test('unknown eligibility and unknown entitlement do not initialize or request ads', async () => {
  const h = ads(); h.policy.setAdPolicyContext({ ...context, ageBand: 'unknown' }); await settle(); await h.present();
  h.policy.setAdPolicyContext({ ...context, entitlement: 'unknown' }); await settle(); await h.present(); assert.equal(h.calls.length, 0);
});
test('SDK canRequestAds false withholds initialization and ad requests', async () => {
  const h = ads({ allowed: false }); h.policy.setAdPolicyContext(context); await settle(); await h.present(); assert.equal(h.calls.includes('initialize'), false); assert.equal(h.policy.getAdAuthorization(), null);
});
test('eligible adult initializes once with conservative settings and SDK-authorized fallback', async () => {
  const h = ads({ refreshError: true }); h.policy.setAdPolicyContext(context); await settle();
  assert.ok(h.calls.includes('previous')); assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(v => typeof v === 'object'))), { maxAdContentRating: 'G', ageRestrictedTreatment: 'unspecified' });
  await h.policy.refreshAdConsent(); assert.equal(h.calls.filter(v => v === 'initialize').length, 1);
});
test('Pro upgrade during load removes native listeners and late callback cannot show', async () => {
  const h = ads(); h.policy.setAdPolicyContext(context); await settle(); const pending = h.present(); const loaded = h.events.get('loaded'); assert.equal(typeof loaded, 'function');
  h.policy.setAdPolicyContext({ ...context, entitlement: 'pro' }); await pending; loaded(); assert.equal(h.shown(), 0); assert.equal(h.events.size, 0);
});
test('account switch invalidates loaded work; ad errors resolve the core flow', async () => {
  const h = ads(); h.policy.setAdPolicyContext(context); await settle(); const pending = h.present(); const loaded = h.events.get('loaded');
  h.policy.setAdPolicyContext({ ...context, accountId: 'b', sessionEpoch: 2 }); await pending; loaded(); assert.equal(h.shown(), 0);
  await settle(); const next = h.present(); h.events.get('error')(); await next; assert.equal(h.events.size, 0);
});
test('privacy options are exposed from SDK requirement and recheck authorization after form', async () => {
  const h = ads(); h.policy.setAdPolicyContext(context); await settle(); assert.equal(h.policy.getAdPrivacyStatus().privacyOptionsRequired, true);
  await h.policy.showAdPrivacyOptions(); assert.ok(h.calls.includes('options')); assert.ok(h.policy.getAdAuthorization());
});

test('required privacy options remain reachable for Pro without initializing ads', async () => {
  const h = ads(); h.policy.setAdPolicyContext({ ...context, entitlement: 'pro' }); await settle();
  assert.equal(h.policy.getAdPrivacyStatus().privacyOptionsRequired, true); assert.equal(h.calls.includes('initialize'), false);
  await h.policy.showAdPrivacyOptions(); assert.ok(h.calls.includes('options')); assert.equal(h.policy.getAdAuthorization(), null);
});


test('teen on free tier gets ads with teen age treatment', async () => {
  const h = ads(); h.policy.setAdPolicyContext({ ...context, ageBand: 'teen13to17' }); await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(v => typeof v === 'object'))), { maxAdContentRating: 'G', ageRestrictedTreatment: 'teen' });
  assert.ok(h.policy.getAdAuthorization()); assert.equal(h.policy.getAdPrivacyStatus().error, null);
});
test('correcting adult eligibility to teen invalidates an already loaded adult ad before display', async () => {
  const h = ads(); h.policy.setAdPolicyContext(context); await settle(); const pending = h.present(); const loaded = h.events.get('loaded');
  h.policy.setAdPolicyContext({ ...context, ageBand: 'teen13to17' }); await pending; loaded(); await settle();
  assert.equal(h.events.size, 0); assert.equal(h.shown(), 0);
  assert.equal(h.calls.filter(v => typeof v === 'object' && 'ageRestrictedTreatment' in v).at(-1).ageRestrictedTreatment, 'teen');
});

test('deferred permission continues without a modal or an invented grant', async () => {
  const deferredPolicy = state({ aiConsent: { ...state().aiConsent, required: false } });
  const { controller, calls } = privacy({ getPrivacyState: async () => deferredPolicy }); await settle();
  const pending = controller.requireAiConsent(account);
  assert.equal(controller.getSnapshot().disclosure, false);
  assert.equal(await pending, true);
  assert.equal(controller.getSnapshot().disclosure, false);
  assert.equal(calls.length, 0);
  assert.equal(controller.getSnapshot().state.aiConsent.granted, false);
});
test('deferred permission cannot authorize unknown or under-13 eligibility', () => {
  const { canProcessRules, hasAiConsent, parsePrivacyState } = loader()('lib/privacy/contracts');
  const permitted = state({ aiConsent: { ...state().aiConsent, required: false } });
  assert.equal(canProcessRules(permitted), true);
  assert.equal(hasAiConsent(permitted), false);
  for (const ageBand of ['unknown', 'under13']) assert.equal(canProcessRules({ ...permitted, ageBand }), false);
  assert.throws(() => parsePrivacyState({ ...permitted, aiConsent: { ...permitted.aiConsent, required: 'false' } }), /Invalid privacy/);
});
