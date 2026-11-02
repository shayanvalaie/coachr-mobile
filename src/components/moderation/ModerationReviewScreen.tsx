import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AppText, Button, Card, Input, PageHeader, ScreenContainer, useToast } from "../ui";
import { ContentReport, ModerationApi, ReviewRevision } from "../../lib/moderation/contracts";
import { invalidatePublicContent } from "../../lib/moderation/events";
import { toError } from "../../lib/backend/utils";
import { space } from "../../theme/tokens";
export function ModerationReviewScreen({ api, accountId, onBack }: { api: ModerationApi; accountId: string; onBack: () => void }) {
  const [revisions, setRevisions] = useState<ReviewRevision[]>([]);
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [selected, setSelected] = useState<ReviewRevision | null>(null);
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const toast = useToast();
  const refresh = useCallback(async () => {
    const ticket = ++generation.current; setBusy(true); setError(null); setSelected(null);
    try {
      const [pending, open] = await Promise.all([api.getModerationReviewQueue(), api.getModerationReports()]);
      if (ticket !== generation.current) return;
      setRevisions(pending); setReports(open);
    } catch (err) { if (ticket === generation.current) { setRevisions([]); setReports([]); setError(toError(err).message); } }
    finally { if (ticket === generation.current) setBusy(false); }
  }, [api]);
  useEffect(() => { void refresh(); return () => { generation.current += 1; }; }, [accountId, refresh]);
  const inspect = async (revisionId: string) => {
    const ticket = ++generation.current; setBusy(true); setSelected(null); setRationale(""); setError(null);
    try { const revision = await api.getModerationRevision(revisionId); if (ticket === generation.current) setSelected(revision); }
    catch (err) { if (ticket === generation.current) setError(toError(err).message); }
    finally { if (ticket === generation.current) setBusy(false); }
  };
  const act = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    const ticket = ++generation.current; setBusy(true); setError(null);
    try {
      await operation(); if (ticket !== generation.current) return;
      invalidatePublicContent(); toast.show({ message: "Moderation decision saved.", type: "success" }); await refresh();
    } catch (err) { if (ticket === generation.current) setError(toError(err).message); }
    finally { if (ticket === generation.current) setBusy(false); }
  };
  return <ScreenContainer scroll contentStyle={{ gap: space.md }}>
    <PageHeader title="Publication review" back={{ label: "Profile", onPress: onBack }} />
    <AppText color="secondary">Review the entire revision for abuse, identifying information, unlawful material, and age-inappropriate content. Approval applies only to this exact revision. Algorithm approval is separate.</AppText>
    <Button label="Refresh review queue" variant="secondary" loading={busy} onPress={() => { void refresh(); }} />
    {error ? <AppText color="danger" accessibilityRole="alert">{error}</AppText> : null}
    <AppText family="heading">Pending publications</AppText>
    {!busy && revisions.length === 0 ? <AppText color="secondary">No pending publications in this page.</AppText> : null}
    {revisions.map(revision => <Button key={revision.id} label={`Inspect ${revision.name}, revision ${revision.revisionNumber}`} variant="secondary" disabled={busy} onPress={() => { void inspect(revision.id); }} />)}
    <AppText family="heading">Open reports</AppText>
    {reports.map(report => <Card key={report.id}><View style={{ gap: space.sm }}>
      <AppText>{report.reason}: {report.message || "No additional details."}</AppText>
      {report.revisionId ? <Button label="Inspect reported revision" variant="secondary" disabled={busy} onPress={() => { if (report.revisionId) void inspect(report.revisionId); }} /> : <AppText color="secondary">The reported revision is no longer available.</AppText>}
      <Button label="Resolve report after review" variant="secondary" disabled={busy || !rationale.trim()} onPress={() => { void act(() => api.resolveContentReport(report.id, { expectedVersion: report.version, rationale: rationale.trim() })); }} />
    </View></Card>)}
    <Input label="Decision rationale" value={rationale} onChangeText={setRationale} maxLength={1000} multiline editable={!busy} hint="Required to reject, hide, suspend or resolve a report. Keep reporter details out of creator feedback." />
    {selected ? <Card><View style={{ gap: space.md }}>
      <AppText family="heading">{selected.name} · Revision {selected.revisionNumber}</AppText>
      <AppText>{selected.city}, {selected.state} {selected.zip}</AppText>
      <AppText>{selected.description}</AppText>
      <AppText>{selected.rulesText}</AppText>
      {selected.summaryRules.map((item, index) => <AppText key={index}>{item}</AppText>)}
      <AppText>{JSON.stringify(selected.spec, null, 2)}</AppText>
      <AppText color="secondary">Publication: {selected.status}</AppText>
      {selected.status === "pending_review" ? <>
        <Button label="Approve exact revision" disabled={busy} onPress={() => { void act(() => api.reviewPublication(selected.id, { expectedVersion: selected.version, decision: "approved", rationale: rationale.trim() })); }} />
        <Button label="Reject with rationale" variant="danger" disabled={busy || !rationale.trim()} onPress={() => { void act(() => api.reviewPublication(selected.id, { expectedVersion: selected.version, decision: "rejected", rationale: rationale.trim() })); }} />
      </> : null}
      {selected.status !== "hidden" ? <Button label="Hide exact revision" variant="danger" disabled={busy || !rationale.trim()} onPress={() => { void act(() => api.reviewPublication(selected.id, { expectedVersion: selected.version, decision: "hidden", rationale: rationale.trim() })); }} /> : null}
      {selected.canSuspendPublisher ? <Button label="Suspend publisher's public content" variant="danger" disabled={busy || !rationale.trim()} onPress={() => { void act(() => api.suspendLeaguePublisher(selected.leagueId, { expectedVersion: selected.publisherSuspensionVersion, rationale: rationale.trim() })); }} /> : <AppText color="secondary">Publisher account is unavailable. Revision reporting and hiding remain available.</AppText>}
    </View></Card> : null}
  </ScreenContainer>;
}
