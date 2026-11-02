import {
  AGE_POLICY_VERSION, AI_CONSENT_SCOPE, AI_CONSENT_VERSION, DeclaredAgeBand,
  PrivacyAccount, PrivacyApi, PrivacyState, hasAiConsent, canProcessRules, parsePrivacyState,
} from "./contracts";

type Snapshot = { account: PrivacyAccount | null; state: PrivacyState | null; busy: boolean; disclosure: boolean; error: string | null };
type Pending = { account: PrivacyAccount; promise: Promise<boolean>; resolve: (allowed: boolean) => void };
export class PrivacyController {
  private snapshot: Snapshot = { account: null, state: null, busy: false, disclosure: false, error: null };
  private listeners = new Set<() => void>();
  private request = 0;
  private pending: Pending | null = null;
  constructor(private api: PrivacyApi) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(next: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach(listener => listener());
  }
  isCurrentAccount = (account: PrivacyAccount) => this.current(account);
  private current(account: PrivacyAccount) {
    return this.snapshot.account?.accountId === account.accountId && this.snapshot.account.sessionEpoch === account.sessionEpoch;
  }
  setAccount(account: PrivacyAccount | null) {
    if (account && this.current(account)) return;
    this.request += 1;
    this.cancelPending();
    this.update({ account, state: null, busy: false, error: null });
    if (account) void this.refresh();
  }
  refresh = async (): Promise<boolean> => {
    const account = this.snapshot.account;
    if (!account) return false;
    const request = ++this.request;
    this.update({ busy: true, error: null });
    try {
      const state = parsePrivacyState(await this.api.getPrivacyState());
      if (!this.current(account) || request !== this.request) return false;
      this.update({ state, busy: false });
      return true;
    } catch {
      if (this.current(account) && request === this.request) {
        this.update({ state: null, busy: false, error: "Couldn't load privacy choices. Please try again." });
      }
      return false;
    }
  };
  requireAiConsent = (account: PrivacyAccount): Promise<boolean> => {
    if (!this.current(account)) return Promise.resolve(false);
    if (this.pending) return this.pending.promise;
    let resolve!: (allowed: boolean) => void;
    const promise = new Promise<boolean>(done => { resolve = done; });
    const pending = { account, promise, resolve };
    this.pending = pending;
    this.update({ disclosure: false, error: null });
    void this.refresh().then(loaded => {
      if (this.pending !== pending || !this.current(account)) return;
      if (!loaded) { this.finishPending(false); return; }
      if (canProcessRules(this.snapshot.state)) { this.finishPending(true); return; }
      this.update({ disclosure: true });
    });
    return promise;
  };
  private finishPending(allowed: boolean) {
    const pending = this.pending;
    this.pending = null;
    this.update({ disclosure: false });
    pending?.resolve(allowed);
  }
  cancelPending = () => { this.finishPending(false); };
  private async mutate(operation: () => Promise<PrivacyState>): Promise<boolean> {
    const account = this.snapshot.account;
    if (!account) return false;
    const request = ++this.request;
    this.update({ busy: true, state: null, error: null });
    try {
      const state = parsePrivacyState(await operation());
      if (!this.current(account) || request !== this.request) return false;
      this.update({ state, busy: false });
      return true;
    } catch {
      if (this.current(account) && request === this.request) {
        this.update({ busy: false, error: "Couldn't save your privacy choice. Please try again." });
      }
      return false;
    }
  }
  grantPending = async (): Promise<void> => {
    const pending = this.pending;
    if (!pending || this.snapshot.busy || !this.current(pending.account)) return;
    const saved = await this.mutate(() => this.api.setAiConsent({ scope: AI_CONSENT_SCOPE, version: AI_CONSENT_VERSION, granted: true }));
    if (this.pending === pending && saved && this.current(pending.account)) this.finishPending(hasAiConsent(this.snapshot.state));
  };
  revokeAiConsent = async (): Promise<boolean> => {
    this.cancelPending();
    return this.mutate(() => this.api.setAiConsent({ scope: AI_CONSENT_SCOPE, version: AI_CONSENT_VERSION, granted: false }));
  };
  setAgeEligibility = async (ageBand: DeclaredAgeBand): Promise<boolean> => {
    this.cancelPending();
    return this.mutate(() => this.api.setAgeEligibility({ ageBand, policyVersion: AGE_POLICY_VERSION }));
  };
}
