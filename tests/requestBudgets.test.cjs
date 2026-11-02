const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/backend/fastApiProvider.ts'), 'utf8');
const parsed = ts.createSourceFile('provider.ts', source, ts.ScriptTarget.Latest, true);
const statement = parsed.statements.find(item => ts.isVariableStatement(item)
  && item.declarationList.declarations.some(declaration => declaration.name.getText(parsed) === 'requestTimeoutMs'));
assert.ok(statement, 'The actual provider timeout selector must exist');
const code = ts.transpileModule(statement.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const select = vm.runInNewContext(code + '\nrequestTimeoutMs;', { API_REQUEST_TIMEOUT_MS: 15000, SUBSCRIPTION_VERIFY_TIMEOUT_MS: 35000 });

test('isolated generation, manual save validation and roster preview have bounded cold-start time', () => {
  for (const endpoint of ['/lineups/generate', '/lineups/save', '/teams/team-a/roster-import/preview']) {
    assert.equal(select(endpoint, 'POST'), 90000);
    assert.equal(select(endpoint, 'GET'), 15000);
    assert.equal(select(endpoint, 'HEAD'), 15000);
  }
});

test('ordinary reads, writes, import commits and purchase checks keep their own deadlines', () => {
  for (const endpoint of ['/auth/signin', '/teams/team-a/players', '/teams/team-a/roster-import/commit']) {
    assert.equal(select(endpoint, 'POST'), 15000);
  }
  assert.equal(select('/subscriptions/verify', 'POST'), 35000);
  assert.equal(select('/teams/team-a/roster-import/preview/extra', 'POST'), 15000);
  assert.equal(select('/lineups/generate', 'PUT'), 15000);
});
