export type PublicationStatus = "unreviewed" | "pending_review" | "approved" | "rejected" | "hidden";
export type ReportReason = "abusive" | "identifying" | "unlawful" | "inappropriate" | "other";
export type PublicationState = {
  publicationStatus: PublicationStatus;
  publicationRevisionId: string | null;
  publicationVersion: number;
  publicationRationale: string | null;
  isPublisher: boolean;
  canBlockPublisher: boolean;
};
export type ReviewRevision = {
  id: string; leagueId: string; revisionNumber: number; version: number;
  publisherSuspensionVersion: number; canSuspendPublisher: boolean;
  status: Exclude<PublicationStatus, "unreviewed">; name: string;
  description: string | null; city: string; state: string; zip: string;
  sport: string; rulesText: string; summaryRules: string[]; spec: Record<string, unknown>;
  createdAt: string; reviewedAt: string | null; rationale: string;
};
export type ContentReport = {
  id: string; leagueId: string | null; revisionId: string | null; reason: ReportReason;
  message: string; version: number; createdAt: string; expiresAt: string;
};
export type PublisherBlock = { targetId: string; createdAt: string };
export type ModerationApi = {
  reportLeague: (leagueId: string, input: { revisionId: string; reason: ReportReason; message: string }) => Promise<{ id: string; accepted: true }>;
  blockLeaguePublisher: (leagueId: string, revisionId: string) => Promise<void>;
  getPublisherBlocks: () => Promise<PublisherBlock[]>;
  unblockPublisher: (targetId: string) => Promise<void>;
  getModerationReviewQueue: () => Promise<ReviewRevision[]>;
  getModerationReports: () => Promise<ContentReport[]>;
  getModerationRevision: (revisionId: string) => Promise<ReviewRevision>;
  reviewPublication: (revisionId: string, input: { expectedVersion: number; decision: "approved" | "rejected" | "hidden"; rationale: string }) => Promise<ReviewRevision>;
  suspendLeaguePublisher: (leagueId: string, input: { expectedVersion: number; rationale: string }) => Promise<{ version: number; suspended: true }>;
  resolveContentReport: (reportId: string, input: { expectedVersion: number; rationale: string }) => Promise<void>;
};
export const PUBLICATION_CONFIRMATION = "Submit this league name, location, description and rules for public review. Approved information will be visible to other users. You can use your private setup while review is pending. AI permission is a separate choice.";
