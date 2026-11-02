import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AppText, Button, Card } from "../ui";
import { ModerationApi, PublisherBlock } from "../../lib/moderation/contracts";
import { invalidatePublicContent } from "../../lib/moderation/events";
import { toError } from "../../lib/backend/utils";
import { space } from "../../theme/tokens";
export function BlockManagement({ api, accountId }: { api: ModerationApi; accountId: string }) {
  const [blocks, setBlocks] = useState<PublisherBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++generation.current; setBusy(true); setError(null); setBlocks([]);
    try { const items = await api.getPublisherBlocks(); if (ticket === generation.current) setBlocks(items); }
    catch (err) { if (ticket === generation.current) setError(toError(err).message); }
    finally { if (ticket === generation.current) setBusy(false); }
  }, [api]);
  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [accountId, load]);
  const unblock = async (targetId: string) => {
    const ticket = ++generation.current; setBusy(true); setError(null);
    try { await api.unblockPublisher(targetId); if (ticket !== generation.current) return; invalidatePublicContent(); await load(); }
    catch (err) { if (ticket === generation.current) setError(toError(err).message); }
    finally { if (ticket === generation.current) setBusy(false); }
  };
  return <Card><View style={{ gap: space.md }}>
    <AppText family="heading">Blocked publishers</AppText>
    <AppText color="secondary">Blocking hides a publisher's public leagues. It does not remove your saved team data.</AppText>
    {blocks.map((item, index) => <Button key={item.targetId} label={`Unblock publisher ${index + 1}`} variant="secondary" disabled={busy} onPress={() => { void unblock(item.targetId); }} />)}
    {!busy && blocks.length === 0 && !error ? <AppText color="secondary">No blocked publishers.</AppText> : null}
    {error ? <AppText color="danger" accessibilityRole="alert">{error}</AppText> : null}
    <Button label="Refresh blocked publishers" variant="ghost" loading={busy} onPress={() => { void load(); }} />
  </View></Card>;
}
