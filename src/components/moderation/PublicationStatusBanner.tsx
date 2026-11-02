import { AppText, Card } from "../ui";
import { PublicationStatus } from "../../lib/moderation/contracts";
export function PublicationStatusBanner({ status, rationale }: { status: PublicationStatus; rationale?: string | null }) {
  if (status === "approved") return null;
  const copy: Record<Exclude<PublicationStatus, "approved">, string> = {
    unreviewed: "This league has not been reviewed for public publication. Your saved team and sporting configuration remain available.",
    pending_review: "Submitted for publication review. Other users cannot discover this draft. You can continue your private team setup.",
    rejected: "This publication needs changes before it can appear in the directory.",
    hidden: "Public content is unavailable. Your saved team data is retained.",
  };
  return <Card><AppText color="secondary" accessibilityRole="alert">{copy[status]}{rationale ? ` ${rationale}` : ""}</AppText></Card>;
}
