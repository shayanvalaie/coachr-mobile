const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(name, cache = new Map(), mocks = {}) {
  const file = path.resolve(__dirname, `../src/lib/moderation/${name}.ts`);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, Date, Number, Error, require: name => name === '../backend/cache' ? mocks.cache : load(name.slice(2), cache, mocks),
  });
  return exports;
}
const publication = { publicationStatus: 'pending_review', publicationRevisionId: 'revision-a', publicationVersion: 1, publicationRationale: null, isPublisher: true, canBlockPublisher: false };
const revision = { id: 'revision-a', leagueId: 'league-a', revisionNumber: 1, version: 0, publisherSuspensionVersion: 0, canSuspendPublisher: true, status: 'pending_review', name: 'League', description: null, city: 'City', state: 'CA', zip: '90001', sport: 'softball', rulesText: 'Rules', summaryRules: ['Summary'], spec: { sport: 'softball' }, createdAt: '2026-10-04T12:00:00Z', reviewedAt: null, rationale: '' };
test('publication status stays separate from active algorithm status and private creator draft remains explicit', () => {
  const h = load('parsers'); const result = h.parsePublicationState({ ...publication, status: 'active', rulesText: 'draft' });
  assert.equal(result.publicationStatus, 'pending_review'); assert.equal(result.isPublisher, true); assert.equal('rulesText' in result, false);
});
test('malformed publication policy never becomes approved or permits blocking by coercion', () => {
  const h = load('parsers');
  for (const input of [{ ...publication, publicationStatus: 'active' }, { ...publication, canBlockPublisher: 'true' }, { ...publication, publicationVersion: -1 }, { ...publication, publicationRevisionId: undefined }]) assert.throws(() => h.parsePublicationState(input));
});
test('admin review validates exact revision version and publisher suspension state', () => {
  const h = load('parsers'); assert.equal(h.parseReviewRevision(revision).id, 'revision-a');
  for (const patch of [{ version: '0' }, { publisherSuspensionVersion: -1 }, { canSuspendPublisher: 'true' }, { rulesText: 'x'.repeat(20001) }, { summaryRules: [false] }, { spec: [] }, { createdAt: 'not a date' }]) assert.throws(() => h.parseReviewRevision({ ...revision, ...patch }));
});
test('review and report queues reject unbounded replies or malformed report reasons', () => {
  const h = load('parsers'); assert.equal(h.parseReviewQueue({ items: [revision] }).length, 1);
  assert.throws(() => h.parseReviewQueue({ items: Array(101).fill(revision) }));
  const report = { id: 'report-a', leagueId: 'league-a', revisionId: 'revision-a', reason: 'identifying', message: 'Review', version: 0, createdAt: revision.createdAt, expiresAt: '2026-11-03T12:00:00Z' };
  assert.equal(h.parseReports({ items: [report] })[0].reason, 'identifying');
  assert.throws(() => h.parseReports({ items: [{ ...report, message: 'x'.repeat(1001) }] }));
  assert.throws(() => h.parseReports({ items: [{ ...report, reason: 'invented' }] }));
});
test('report acknowledgement must be committed authority and block management never accepts private account fields', () => {
  const h = load('parsers'); assert.throws(() => h.parseReportAcknowledgement({ id: 'a', accepted: 'true' }));
  const blocks = h.parseBlocks({ items: [{ targetId: 'publisher-a', createdAt: revision.createdAt, email: 'private@example.com' }] });
  assert.equal(blocks[0].targetId, 'publisher-a'); assert.equal('email' in blocks[0], false);
});
test('public content invalidation clears cached harmful text before notifying live consumers', () => {
  const sequence = []; const h = load('events', new Map(), { cache: { clearReads: () => sequence.push('clear') } });
  const unsubscribe = h.subscribePublicContent(() => sequence.push(`notify:${h.getPublicContentRevision()}`));
  h.invalidatePublicContent(); assert.deepEqual(sequence, ['clear', 'notify:1']); unsubscribe(); h.invalidatePublicContent(); assert.deepEqual(sequence, ['clear', 'notify:1', 'clear']);
});
