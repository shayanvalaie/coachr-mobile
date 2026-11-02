import { ContentReport, PublicationState, PublicationStatus, PublisherBlock, ReportReason, ReviewRevision } from "./contracts";
const statuses: PublicationStatus[] = ["unreviewed", "pending_review", "approved", "rejected", "hidden"];
const reasons: ReportReason[] = ["abusive", "identifying", "unlawful", "inappropriate", "other"];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid moderation response.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 20000): value is string { return typeof value === "string" && value.length <= max; }
function nullableText(value: unknown, max = 20000) { return value === null || text(value, max); }
function version(value: unknown) { return Number.isSafeInteger(value) && (value as number) >= 0; }
function date(value: unknown) { return text(value, 64) && Number.isFinite(Date.parse(value)); }
export function parsePublicationState(value: unknown): PublicationState {
  const raw = object(value);
  if (!statuses.includes(raw.publicationStatus as PublicationStatus) || !nullableText(raw.publicationRevisionId, 36) || !version(raw.publicationVersion) ||
      !nullableText(raw.publicationRationale, 1000) || typeof raw.isPublisher !== "boolean" || typeof raw.canBlockPublisher !== "boolean") throw new Error("Invalid publication response.");
  return { publicationStatus: raw.publicationStatus as PublicationStatus, publicationRevisionId: raw.publicationRevisionId as string | null,
    publicationVersion: raw.publicationVersion as number, publicationRationale: raw.publicationRationale as string | null,
    isPublisher: raw.isPublisher, canBlockPublisher: raw.canBlockPublisher };
}
export function parseReviewRevision(value: unknown): ReviewRevision {
  const raw = object(value);
  if (!text(raw.id, 36) || !text(raw.leagueId, 36) || !version(raw.version) || !version(raw.revisionNumber) ||
      !version(raw.publisherSuspensionVersion) || typeof raw.canSuspendPublisher !== "boolean" ||
      !statuses.includes(raw.status as PublicationStatus) || raw.status === "unreviewed" || !text(raw.name, 180) ||
      !nullableText(raw.description, 4000) || !text(raw.city, 120) || !text(raw.state, 2) || !text(raw.zip, 10) ||
      !text(raw.sport, 64) || !text(raw.rulesText) || !Array.isArray(raw.summaryRules) || raw.summaryRules.length > 200 ||
      raw.summaryRules.some(item => !text(item, 2000)) || !raw.spec || typeof raw.spec !== "object" || Array.isArray(raw.spec) ||
      !date(raw.createdAt) || !(raw.reviewedAt === null || date(raw.reviewedAt)) || !text(raw.rationale, 1000)) throw new Error("Invalid review response.");
  return raw as unknown as ReviewRevision;
}
export function parseReviewQueue(value: unknown): ReviewRevision[] {
  const items = object(value).items;
  if (!Array.isArray(items) || items.length > 100) throw new Error("Invalid review queue.");
  return items.map(parseReviewRevision);
}
export function parseReports(value: unknown): ContentReport[] {
  const items = object(value).items;
  if (!Array.isArray(items) || items.length > 100) throw new Error("Invalid reports response.");
  return items.map(item => {
    const raw = object(item);
    if (!text(raw.id, 36) || !nullableText(raw.leagueId, 36) || !nullableText(raw.revisionId, 36) || !reasons.includes(raw.reason as ReportReason) ||
        !text(raw.message, 1000) || !version(raw.version) || !date(raw.createdAt) || !date(raw.expiresAt)) throw new Error("Invalid report response.");
    return raw as unknown as ContentReport;
  });
}
export function parseBlocks(value: unknown): PublisherBlock[] {
  const items = object(value).items;
  if (!Array.isArray(items) || items.length > 100) throw new Error("Invalid blocks response.");
  return items.map(item => {
    const raw = object(item);
    if (!text(raw.targetId, 36) || !date(raw.createdAt)) throw new Error("Invalid publisher block.");
    return { targetId: raw.targetId, createdAt: raw.createdAt as string };
  });
}
export function parseReportAcknowledgement(value: unknown): { id: string; accepted: true } {
  const raw = object(value);
  if (!text(raw.id, 36) || raw.accepted !== true) throw new Error("Invalid report acknowledgement.");
  return { id: raw.id, accepted: true };
}
