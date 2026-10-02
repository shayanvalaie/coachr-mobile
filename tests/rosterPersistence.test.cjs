const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/backend', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports });
  return exports;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('slow name save cannot overwrite a later gender selection; reads wait', async () => {
  const { writeRoster, waitForRosterWrites } = load('rosterWrites.ts');
  const gate = deferred();
  let gender;
  const calls = [];
  const first = writeRoster('team', 'player', async () => {
    calls.push('name');
    await gate.promise;
    gender = 'male';
  });
  const second = writeRoster('team', 'player', async () => {
    calls.push('gender');
    gender = 'female';
  });
  let readComplete = false;
  const read = waitForRosterWrites('team').then(() => { readComplete = true; });
  await new Promise(setImmediate);
  assert.deepEqual(calls, ['name']);
  assert.equal(readComplete, false);
  gate.resolve();
  await Promise.all([first, second, read]);
  assert.deepEqual(calls, ['name', 'gender']);
  assert.equal(gender, 'female');
});

test('failed autosave blocks stale reads until retry succeeds', async () => {
  const { writeRoster, waitForRosterWrites } = load('rosterWrites.ts');
  await assert.rejects(writeRoster('team', 'player', async () => { throw new Error('Offline'); }), /Offline/);
  await assert.rejects(waitForRosterWrites('team'), /Offline/);
  await waitForRosterWrites('another-team');
  // Reloading the roster for recovery remains possible after a failed write.
  await waitForRosterWrites('team', false);
  await writeRoster('team', 'player', async () => {});
  await waitForRosterWrites('team');
});

test('delete runs after pending save so the player is not recreated', async () => {
  const { writeRoster, waitForRosterWrites } = load('rosterWrites.ts');
  const gate = deferred();
  let exists = false;
  const save = writeRoster('team', 'player', async () => { await gate.promise; exists = true; });
  const remove = writeRoster('team', 'player', async () => { exists = false; });
  gate.resolve();
  await Promise.all([save, remove, waitForRosterWrites('team')]);
  assert.equal(exists, false);
});

test('invalidated in-flight roster read cannot restore stale cached genders', async () => {
  const { cachedRead, invalidateReads } = load('cache.ts');
  const old = deferred();
  const next = deferred();
  const staleRead = cachedRead('roster:team', () => old.promise);
  invalidateReads('roster:team');
  const freshRead = cachedRead('roster:team', () => next.promise);
  old.resolve('male');
  await staleRead;
  const joinedRead = cachedRead('roster:team', () => { throw new Error('Should deduplicate new read'); });
  next.resolve('female');
  assert.equal(await freshRead, 'female');
  assert.equal(await joinedRead, 'female');
  assert.equal(await cachedRead('roster:team', () => { throw new Error('Should use cache'); }), 'female');
});

test('sign-out cache clear prevents an old read from repopulating cache', async () => {
  const { cachedRead, clearReads } = load('cache.ts');
  const gate = deferred();
  const oldRead = cachedRead('roster:team', () => gate.promise);
  clearReads();
  gate.resolve('old');
  await oldRead;
  assert.equal(await cachedRead('roster:team', async () => 'fresh'), 'fresh');
});
