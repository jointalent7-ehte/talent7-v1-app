"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type MyCaseEntry = {
  entry_id: string;
  heat_id: string;
  cohort_number: number;
  round_name: string;
  heat_number: number;
  placement: number | null;
  final_score: number | null;
  heat_status: string;
  review_hold: boolean;
  appeal_closes_at: string;
};

type MyCompetitionCase = {
  id: string;
  case_number: string;
  heat_id: string | null;
  heat_entry_id: string | null;
  category: string;
  priority: string;
  summary: string;
  status: string;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

type AdminCompetitionCase = MyCompetitionCase & {
  reporter_name: string | null;
  private_details: string;
  evidence_url: string | null;
  round_name: string | null;
  heat_number: number | null;
  review_hold: boolean | null;
};

type ReviewHold = {
  heat_id: string;
  cohort_number: number;
  round_name: string;
  heat_number: number;
  public_status?: string;
  reason?: string | null;
  held_at?: string | null;
};

type MyCaseState = { entries: MyCaseEntry[]; cases: MyCompetitionCase[] };
type AdminCaseState = { cases: AdminCompetitionCase[]; holds: ReviewHold[] };

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function CompetitionDisputeCenter({ campaignId, isAdmin }: { campaignId: string; isAdmin: boolean }) {
  const [myState, setMyState] = useState<MyCaseState>({ entries: [], cases: [] });
  const [adminState, setAdminState] = useState<AdminCaseState>({ cases: [], holds: [] });
  const [publicHolds, setPublicHolds] = useState<ReviewHold[]>([]);
  const [category, setCategory] = useState("Result appeal");
  const [signedIn, setSignedIn] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const loadCases = useCallback(async () => {
    if (!supabase || campaignId.startsWith("preview-")) return;
    const holdResult = await supabase.rpc("get_public_talent7_competition_review_holds", {
      target_campaign_id: campaignId
    });
    if (!holdResult.error) setPublicHolds((holdResult.data || []) as ReviewHold[]);

    const sessionResult = await supabase.auth.getSession();
    const hasSession = Boolean(sessionResult.data.session);
    setSignedIn(hasSession);
    if (hasSession) {
      const myResult = await supabase.rpc("get_my_talent7_competition_case_state", {
        target_campaign_id: campaignId
      });
      if (!myResult.error && myResult.data) setMyState(myResult.data as MyCaseState);
    }
    if (isAdmin && hasSession) {
      const adminResult = await supabase.rpc("get_talent7_competition_case_admin_state", {
        target_campaign_id: campaignId
      });
      if (!adminResult.error && adminResult.data) setAdminState(adminResult.data as AdminCaseState);
    }
    setLoadedAt(Date.now());
  }, [campaignId, isAdmin]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  async function submitCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("submit-case");
    setMessage("");
    try {
      const entryId = String(data.get("entryId") || "");
      const { data: id, error } = await supabase.rpc("submit_talent7_competition_case", {
        target_campaign_id: campaignId,
        target_category: category,
        target_summary: String(data.get("summary") || ""),
        target_private_details: String(data.get("details") || ""),
        target_heat_entry_id: entryId || null,
        target_evidence_url: String(data.get("evidenceUrl") || "").trim() || null
      });
      if (error) throw error;
      form.reset();
      setCategory("Result appeal");
      await loadCases();
      setMessage(`Private case submitted${id ? ` with reference ${String(id).slice(0, 8)}` : ""}. Allegations and evidence are never shown publicly.`);
    } catch (error) {
      setMessage(readableError(error, "The private case could not be submitted."));
    } finally {
      setBusy("");
    }
  }

  async function withdrawCase(caseItem: MyCompetitionCase) {
    if (!supabase) return;
    setBusy(`withdraw-${caseItem.id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("withdraw_my_talent7_competition_case", { target_case_id: caseItem.id });
      if (error) throw error;
      await loadCases();
      setMessage(`${caseItem.case_number} was withdrawn.`);
    } catch (error) {
      setMessage(readableError(error, "The case could not be withdrawn."));
    } finally {
      setBusy("");
    }
  }

  async function reviewCase(event: FormEvent<HTMLFormElement>, caseItem: AdminCompetitionCase) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    setBusy(`review-${caseItem.id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("review_talent7_competition_case", {
        target_case_id: caseItem.id,
        target_status: String(data.get("status") || "Acknowledged"),
        target_resolution_note: String(data.get("resolution") || "").trim() || null,
        target_hold_action: String(data.get("holdAction") || "No change")
      });
      if (error) throw error;
      await loadCases();
      setMessage(`${caseItem.case_number} was updated with a preserved organizer audit record.`);
    } catch (error) {
      setMessage(readableError(error, "The case review could not be saved."));
    } finally {
      setBusy("");
    }
  }

  const appealEntries = myState.entries.filter((entry) => entry.heat_status === "Final" && new Date(entry.appeal_closes_at).getTime() >= loadedAt);

  return (
    <section className="competitionCaseSection" aria-label="Competition review and safety center">
      {publicHolds.length > 0 && <div className="publicReviewHoldBanner"><span>Fair-play review in progress</span><strong>{publicHolds.length} {publicHolds.length === 1 ? "result is" : "results are"} temporarily held.</strong><div>{publicHolds.map((hold) => <small key={hold.heat_id}>Cohort {hold.cohort_number} / {hold.round_name} / Heat {hold.heat_number}</small>)}</div><p>Advancement and awards are paused for affected results. Reporter identity and private case details are not public.</p></div>}
      {message && <p className="caseCenterMessage" role="status">{message}</p>}

      {signedIn && <details className="participantCaseCenter">
        <summary><span>Private review and safety center</span><strong>{myState.cases.filter((item) => !["Resolved", "Dismissed", "Withdrawn"].includes(item.status)).length} open cases</strong></summary>
        <div className="participantCaseBody">
          <div className="competitionCaseIntro"><span>Speak up safely</span><h3 id="competition-case-title">Appeal a result or report an event concern.</h3><p>Result appeals close 48 hours after finalization. Safety reports are marked urgent. Filing a report never changes a result automatically.</p></div>
          <form className="competitionCaseForm" onSubmit={submitCase}>
            <label>Case type<select name="category" onChange={(event) => setCategory(event.target.value)} value={category}><option>Result appeal</option><option>Technical issue</option><option>Conduct concern</option><option>Safety concern</option></select></label>
            <label className="wide">Related heat<select name="entryId" required={category === "Result appeal"}><option value="">{category === "Result appeal" ? "Choose your finalized result" : "Not tied to one heat"}</option>{myState.entries.map((entry) => <option disabled={category === "Result appeal" && !appealEntries.some((item) => item.entry_id === entry.entry_id)} key={entry.entry_id} value={entry.entry_id}>C{entry.cohort_number} / {entry.round_name} / Heat {entry.heat_number}{entry.placement ? ` / Place #${entry.placement}` : ""}</option>)}</select></label>
            <label className="wide">Short summary<input maxLength={200} minLength={10} name="summary" placeholder="What decision or incident needs review?" required /></label>
            <label className="wide">Private details<textarea maxLength={2000} minLength={20} name="details" placeholder="Describe what happened, when it happened, and what outcome you are requesting." required /></label>
            <label className="wide">Optional HTTPS evidence link<input maxLength={2000} name="evidenceUrl" placeholder="Private Drive link, unlisted video, or other HTTPS evidence" type="url" /></label>
            <button disabled={busy === "submit-case"} type="submit">{busy === "submit-case" ? "Submitting privately..." : category === "Safety concern" ? "Submit urgent safety case" : "Submit private case"}</button>
            <small className="wide">Do not include passwords, payment details, government ID numbers, or unrelated personal information.</small>
          </form>

          {myState.cases.length > 0 && <div className="myCompetitionCases">{myState.cases.map((caseItem) => <article className={`status-${caseItem.status.toLowerCase()}`} key={caseItem.id}><div><span>{caseItem.case_number} / {caseItem.category}</span><strong>{caseItem.summary}</strong><small>Submitted {dateTime(caseItem.created_at)}</small></div><b>{caseItem.status}</b>{caseItem.resolution_note && <p>{caseItem.resolution_note}</p>}{["Submitted", "Acknowledged"].includes(caseItem.status) && <button disabled={busy === `withdraw-${caseItem.id}`} onClick={() => withdrawCase(caseItem)} type="button">Withdraw case</button>}</article>)}</div>}
        </div>
      </details>}

      {isAdmin && signedIn && <details className="organizerCaseDesk" open>
        <summary><span>Organizer case desk</span><strong>{adminState.cases.filter((item) => !["Resolved", "Dismissed", "Withdrawn"].includes(item.status)).length} need review</strong></summary>
        <div className="organizerCaseBody">
          <p>Place a hold whenever a result might change or a safety investigation touches competitive fairness. Holds block progression and fulfilment at the database level.</p>
          {adminState.cases.map((caseItem) => <form className={`priority-${caseItem.priority.toLowerCase()}`} key={caseItem.id} onSubmit={(event) => reviewCase(event, caseItem)}><header><div><span>{caseItem.priority} / {caseItem.case_number}</span><strong>{caseItem.category}: {caseItem.summary}</strong><small>{caseItem.reporter_name || "Registered participant"}{caseItem.round_name ? ` / ${caseItem.round_name} heat ${caseItem.heat_number}` : ""}</small></div><b>{caseItem.status}</b></header><section><p>{caseItem.private_details}</p>{caseItem.evidence_url && <a href={caseItem.evidence_url} rel="noreferrer" target="_blank">Open private evidence link</a>}</section><label>Status<select defaultValue={caseItem.status === "Submitted" ? "Acknowledged" : caseItem.status} name="status"><option>Acknowledged</option><option>Investigating</option><option>Resolved</option><option>Dismissed</option></select></label><label>Result hold<select defaultValue="No change" name="holdAction"><option>No change</option>{caseItem.heat_id && <option>Place hold</option>}{caseItem.heat_id && <option>Release hold</option>}</select></label><label className="wide">Private resolution and decision note<textarea defaultValue={caseItem.resolution_note || ""} maxLength={1000} name="resolution" placeholder="Evidence reviewed, policy applied, corrective action, and reason for hold or release" /></label><button disabled={busy === `review-${caseItem.id}`} type="submit">{busy === `review-${caseItem.id}` ? "Saving..." : "Save reviewed decision"}</button></form>)}
          {adminState.cases.length === 0 && <p className="noCompetitionCases">No private competition cases have been submitted.</p>}
        </div>
      </details>}
    </section>
  );
}
