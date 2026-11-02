const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  let now = 1000;
  let state = now;
  let effect;
  let tick;
  let clears = 0;
  let retryCalls = 0;
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/RateLimitNotice.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  vm.runInNewContext(outputText, { exports, Number, Math, Error, Date: { now: () => now },
    setInterval(callback) { tick = callback; return 1; }, clearInterval() { clears++; },
    require(name) {
      const imports = {
        react: { useState: () => [state, value => { state = value; }], useEffect: callback => { effect = callback; } },
        'react/jsx-runtime': { jsx, jsxs: jsx },
        'react-native': { View: 'View', StyleSheet: { create: value => value } },
        '../theme/tokens': { space: { sm: 12 } },
        './ui/AppText': { default: 'Text' }, './ui/Button': { default: 'Button' },
      };
      if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
      return imports[name];
    },
  });
  return { exports, render: () => exports.default({ retryAt: 3000, onRetry: () => retryCalls++ }),
    mount: () => effect(), advance(value) { now = value; tick(); },
    counts: () => ({ retryCalls, clears }) };
}

test('deadline rounds up and does not permit early retries', () => {
  const { exports } = harness();
  assert.equal(exports.retryWaitSeconds(3000, 2999), 1);
  assert.equal(exports.retryWaitSeconds(3000, 3000), 0);
  assert.equal(exports.retryWaitSeconds(3000, 4000), 0);
  assert.throws(() => exports.retryWaitSeconds(NaN, 0));
});

test('countdown enables explicit retry without automatically calling it', () => {
  const h = harness();
  const initial = h.render();
  assert.equal(initial.props.children[1].props.disabled, true);
  const unmount = h.mount();
  h.advance(3000);
  const ready = h.render();
  assert.equal(ready.props.children[1].props.disabled, false);
  assert.equal(h.counts().retryCalls, 0);
  ready.props.children[1].props.onPress();
  assert.equal(h.counts().retryCalls, 1);
  unmount();
  assert.equal(h.counts().clears, 2);
});
