"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type CompetitionRequirements = {
  version: number;
  rules_summary: string;
  safety_notice: string;
  recording_notice: string;
  conduct_notice: string;
  eligibility_notice: string;
  updated_at: string;
};

type ParticipantPassState = {
  registered: boolean;
  registration_status: string | null;
  requirement_version: number | null;
  accepted: boolean;
  accepted_at: string | null;
};

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function CompetitionParticipantPass({ campaignId, isAdmin }: { campaignId: string; isAdmin: boolean }) {
  const [requirements, setRequirements] = useState<CompetitionRequirements | null>(null);
  const [pass, setPass] = useState<ParticipantPassState>({
    registered: false,
    registration_status: null,
    requirement_version: null,
    accepted: false,
    accepted_at: null
  });
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const loadPass = useCallback(async () => {
    if (!supabase || campaignId.startsWith("preview-")) return;
    const requirementResult = await supabase.rpc("get_public_talent7_competition_participant_requirements", {
      target_campaign_id: campaignId
    });
    if (!requirementResult.error) {
      const rows = (requirementResult.data || []) as CompetitionRequirements[];
      setRequirements(rows[0] || null);
    }
    const sessionResult = await supabase.auth.getSession();
    const hasSession = Boolean(sessionResult.data.session);
    setSignedIn(hasSession);
    if (hasSession) {
      const passResult = await supabase.rpc("get_my_talent7_competition_participant_pass", {
        target_campaign_id: campaignId
      });
      if (!passResult.error && passResult.data) setPass(passResult.data as ParticipantPassState);
    }
  }, [campaignId]);

  useEffect(() => {
    void loadPass();
  }, [loadPass]);

  async function acceptPass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !requirements) return;
    const data = new FormData(event.currentTarget);
    setBusy("accept");
    setMessage("");
    try {
      const { error } = await supabase.rpc("accept_talent7_competition_participant_pass", {
        target_campaign_id: campaignId,
        target_requirement_version: requirements.version,
        target_rules_acknowledged: data.get("rules") === "on",
        target_safety_acknowledged: data.get("safety") === "on",
        target_recording_acknowledged: data.get("recording") === "on",
        target_conduct_acknowledged: data.get("conduct") === "on",
        target_eligibility_acknowledged: data.get("eligibility") === "on"
      });
      if (error) throw error;
      await loadPass();
      setMessage("Your participant entry pass is complete. Check-in will unlock when your heat opens.");
    } catch (error) {
      setMessage(readableError(error, "The participant entry pass could not be completed."));
    } finally {
      setBusy("");
    }
  }

  async function publishRequirements(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    setBusy("publish");
    setMessage("");
    try {
      const { data: version, error } = await supabase.rpc("publish_talent7_competition_participant_requirements", {
        target_campaign_id: campaignId,
        target_rules_summary: String(data.get("rulesSummary") || ""),
        target_safety_notice: String(data.get("safetyNotice") || ""),
        target_recording_notice: String(data.get("recordingNotice") || ""),
        target_conduct_notice: String(data.get("conductNotice") || ""),
        target_eligibility_notice: String(data.get("eligibilityNotice") || "")
      });
      if (error) throw error;
      await loadPass();
      setMessage(`Participant requirements version ${version} is published. Existing acceptances must be renewed before check-in.`);
    } catch (error) {
      setMessage(readableError(error, "The participant requirements could not be published."));
    } finally {
      setBusy("");
    }
  }

  if (!requirements) return null;

  const items = [
    { key: "rules", title: "Competition rules", body: requirements.rules_summary },
    { key: "safety", title: "Physical readiness", body: requirements.safety_notice },
    { key: "recording", title: "Camera and review footage", body: requirements.recording_notice },
    { key: "conduct", title: "Fair play and conduct", body: requirements.conduct_notice },
    { key: "eligibility", title: "Eligibility confirmation", body: requirements.eligibility_notice }
  ];

  return (
    <section className="competitionParticipantPass" aria-labelledby="participant-pass-title">
      <div className="participantPassHeader">
        <div><span>Participant entry pass / Version {requirements.version}</span><h3 id="participant-pass-title">Know the event before you enter the live lane.</h3><p>These requirements are public. Talent7 does not ask for medical history; you decide whether participation is appropriate for you.</p></div>
        <strong className={pass.accepted ? "complete" : ""}>{pass.accepted ? "Pass complete" : "Required before check-in"}</strong>
      </div>

      {message && <p className="participantPassMessage" role="status">{message}</p>}

      <details className="participantPassRules" open={!pass.accepted}>
        <summary>Read the five entry-pass requirements</summary>
        <div>{items.map((item, index) => <article key={item.key}><b>{index + 1}</b><div><strong>{item.title}</strong><p>{item.body}</p></div></article>)}</div>
      </details>

      {signedIn && pass.registered && !pass.accepted && (
        <form className="participantPassForm" onSubmit={acceptPass}>
          <div><span>Complete your pass</span><strong>Each acknowledgement is required for event check-in.</strong></div>
          {items.map((item) => <label key={item.key}><input name={item.key} required type="checkbox" /><span>I have read and accept: {item.title}</span></label>)}
          <button disabled={busy === "accept"} type="submit">{busy === "accept" ? "Saving entry pass..." : "Accept current requirements"}</button>
          <small>You may still withdraw before competing. Acceptance does not waive rights provided by applicable law.</small>
        </form>
      )}

      {pass.accepted && pass.accepted_at && <p className="participantPassReceipt">Accepted version {pass.requirement_version} on {formatDate(pass.accepted_at)}. This receipt is linked to your private registration.</p>}

      {isAdmin && signedIn && (
        <details className="participantRequirementsEditor">
          <summary>Organizer: revise participant requirements</summary>
          <form onSubmit={publishRequirements}>
            <p>Publishing creates a new version and requires every participant to accept it again. Changes are blocked after check-in opens.</p>
            <label>Competition rules<textarea defaultValue={requirements.rules_summary} maxLength={2000} minLength={40} name="rulesSummary" required /></label>
            <label>Physical-safety notice<textarea defaultValue={requirements.safety_notice} maxLength={1200} minLength={40} name="safetyNotice" required /></label>
            <label>Recording and review notice<textarea defaultValue={requirements.recording_notice} maxLength={1200} minLength={40} name="recordingNotice" required /></label>
            <label>Conduct standard<textarea defaultValue={requirements.conduct_notice} maxLength={1200} minLength={40} name="conductNotice" required /></label>
            <label>Eligibility notice<textarea defaultValue={requirements.eligibility_notice} maxLength={1200} minLength={40} name="eligibilityNotice" required /></label>
            <button disabled={busy === "publish"} type="submit">{busy === "publish" ? "Publishing..." : `Publish version ${requirements.version + 1}`}</button>
          </form>
        </details>
      )}
    </section>
  );
}
