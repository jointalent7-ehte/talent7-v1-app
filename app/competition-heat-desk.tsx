"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type HeatBoardRow = {
  heat_id: string;
  cohort_number: number;
  round_name: string;
  heat_number: number;
  stage_number: number;
  max_lanes: number;
  duration_seconds: number;
  scheduled_start: string;
  heat_status: string;
  entry_id: string;
  lane_number: number;
  public_display_name: string;
  check_in_status: string;
  final_score: number | null;
  result_status: string;
  placement: number | null;
  is_mine: boolean;
};

type OrganizerHeat = {
  id: string;
  campaign_id: string;
  cohort_number: number;
  round_name: string;
  heat_number: number;
  stage_number: number;
  max_lanes: number;
  duration_seconds: number;
  scheduled_start: string;
  status: string;
};

type OrganizerHeatEntry = {
  id: string;
  heat_id: string;
  registration_id: string;
  display_name: string;
  public_anonymous: boolean;
  registration_code: string;
  lane_number: number;
  check_in_status: string;
  raw_score: number | null;
  penalty_score: number;
  final_score: number | null;
  result_status: string;
  placement: number | null;
  review_note: string | null;
};

type HeatDeskState = {
  heats: OrganizerHeat[];
  entries: OrganizerHeatEntry[];
};

type ParticipantHeatControl = {
  entry_id: string;
  heat_id: string;
  cohort_number: number;
  round_name: string;
  heat_number: number;
  stage_number: number;
  lane_number: number;
  scheduled_start: string;
  duration_seconds: number;
  heat_status: string;
  check_in_status: string;
  proof_id: string | null;
  proof_type: string | null;
  proof_url: string | null;
  proof_notes: string | null;
  proof_review_status: string | null;
  proof_review_note: string | null;
  proof_retention_expires_at: string | null;
};

type OrganizerHeatProof = {
  id: string;
  entry_id: string;
  heat_id: string;
  cohort_number: number;
  heat_number: number;
  lane_number: number;
  display_name: string;
  proof_type: string;
  proof_url: string;
  notes: string | null;
  review_status: string;
  review_note: string | null;
  retention_expires_at: string;
  created_at: string;
};

type HeatReviewDesk = {
  proofs: OrganizerHeatProof[];
  reminders: { pending: number; due: number; sent: number };
};

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function futureLocalTime() {
  const date = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function nextHeatStatus(status: string) {
  if (status === "Draft") return "Check-in";
  if (status === "Check-in") return "Ready";
  if (status === "Ready") return "Live";
  if (status === "Live") return "Review";
  return "";
}

function selectedFile(form: FormData, fieldName: string) {
  const file = form.get(fieldName);
  return file instanceof File && file.size > 0 ? file : null;
}

function cleanFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "heat-proof";
}

function validateProofFile(file: File) {
  const imageTypes = ["image/jpeg", "image/png", "image/webp"];
  const videoTypes = ["video/mp4", "video/quicktime"];
  if (!imageTypes.includes(file.type) && !videoTypes.includes(file.type)) return "Upload JPG, PNG, WebP, MP4, or MOV only.";
  if (imageTypes.includes(file.type) && file.size > 10 * 1024 * 1024) return "Images must be 10 MB or smaller.";
  if (videoTypes.includes(file.type) && file.size > 50 * 1024 * 1024) return "Videos must be 50 MB or smaller.";
  return "";
}

async function authenticatedMediaRequest(body: Record<string, unknown>) {
  if (!supabase) throw new Error("Media upload is not connected yet.");
  const send = (token: string) => fetch("/api/media", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  let { data } = await supabase.auth.getSession();
  let token = data.session?.access_token || "";
  if (!token) {
    ({ data } = await supabase.auth.refreshSession());
    token = data.session?.access_token || "";
  }
  if (!token) throw new Error("Your upload session expired. Sign in again.");
  let response = await send(token);
  if (response.status === 401) {
    ({ data } = await supabase.auth.refreshSession());
    token = data.session?.access_token || "";
    if (token) response = await send(token);
  }
  return { response, userId: data.session?.user.id || "" };
}

async function uploadHeatProof(file: File, folder: string) {
  if (!supabase) throw new Error("Media upload is not connected yet.");
  const { response, userId } = await authenticatedMediaRequest({
    kind: "challenge-proofs",
    folder,
    fileName: file.name,
    contentType: file.type,
    size: file.size
  });
  if (response.ok) {
    const result = (await response.json()) as { uploadUrl?: string; publicUrl?: string };
    if (!result.uploadUrl || !result.publicUrl) throw new Error("The upload service returned an incomplete address.");
    const uploaded = await fetch(result.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type.toLowerCase() },
      body: file
    });
    if (!uploaded.ok) throw new Error(`The footage upload failed with status ${uploaded.status}.`);
    return result.publicUrl;
  }
  if (response.status !== 503) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(result?.error || "The footage upload could not be prepared.");
  }
  if (!userId) throw new Error("Sign in again before uploading footage.");
  const path = `${userId}/${folder}/${crypto.randomUUID()}-${cleanFileName(file.name)}`;
  const { error } = await supabase.storage.from("challenge-proofs").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || undefined,
    upsert: false
  });
  if (error) throw error;
  return supabase.storage.from("challenge-proofs").getPublicUrl(path).data.publicUrl;
}

export default function CompetitionHeatDesk({
  campaignId,
  campaignPhase,
  cohortCount,
  isAdmin
}: {
  campaignId: string;
  campaignPhase: string;
  cohortCount: number;
  isAdmin: boolean;
}) {
  const [board, setBoard] = useState<HeatBoardRow[]>([]);
  const [desk, setDesk] = useState<HeatDeskState>({ heats: [], entries: [] });
  const [myHeatControls, setMyHeatControls] = useState<ParticipantHeatControl[]>([]);
  const [reviewDesk, setReviewDesk] = useState<HeatReviewDesk>({
    proofs: [],
    reminders: { pending: 0, due: 0, sent: 0 }
  });
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");

  const loadHeatData = useCallback(async () => {
    if (!supabase || campaignId.startsWith("preview-")) return;
    const boardResult = await supabase.rpc("get_talent7_competition_heat_board", {
      target_campaign_id: campaignId
    });
    if (!boardResult.error) setBoard((boardResult.data || []) as HeatBoardRow[]);

    const sessionResult = await supabase.auth.getSession();
    if (sessionResult.data.session) {
      const controlResult = await supabase.rpc("get_my_talent7_competition_heat_controls", {
        target_campaign_id: campaignId
      });
      if (!controlResult.error) setMyHeatControls((controlResult.data || []) as ParticipantHeatControl[]);
    } else {
      setMyHeatControls([]);
    }

    if (isAdmin) {
      const [deskResult, reviewResult] = await Promise.all([
        supabase.rpc("get_talent7_competition_heat_desk", { target_campaign_id: campaignId }),
        supabase.rpc("get_talent7_competition_heat_review_desk", { target_campaign_id: campaignId })
      ]);
      if (!deskResult.error && deskResult.data) setDesk(deskResult.data as HeatDeskState);
      if (!reviewResult.error && reviewResult.data) setReviewDesk(reviewResult.data as HeatReviewDesk);
    }
  }, [campaignId, isAdmin]);

  useEffect(() => {
    void loadHeatData();
  }, [loadHeatData, campaignPhase]);

  const publicHeats = useMemo(() => {
    const grouped = new Map<string, { heat: HeatBoardRow; entries: HeatBoardRow[] }>();
    for (const row of board) {
      const current = grouped.get(row.heat_id);
      if (current) current.entries.push(row);
      else grouped.set(row.heat_id, { heat: row, entries: [row] });
    }
    return [...grouped.values()];
  }, [board]);

  async function generateHeats(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    const firstStart = String(data.get("firstStart") || "");
    setBusyAction("generate");
    setMessage("");
    try {
      const { data: count, error } = await supabase.rpc("generate_talent7_competition_heats", {
        target_campaign_id: campaignId,
        target_cohort_number: Number(data.get("cohort")),
        target_round_name: String(data.get("round")),
        target_max_lanes: Number(data.get("lanes")),
        target_parallel_stages: Number(data.get("stages")),
        target_first_start: new Date(firstStart).toISOString(),
        target_interval_minutes: Number(data.get("interval")),
        target_duration_seconds: Number(data.get("duration"))
      });
      if (error) throw error;
      await loadHeatData();
      setMessage(`${Number(count) || 0} heats generated. The host remains outside all competitor lanes.`);
    } catch (error) {
      setMessage(readableError(error, "Heats could not be generated."));
    } finally {
      setBusyAction("");
    }
  }

  async function updateHeatStatus(heat: OrganizerHeat, status: string) {
    if (!supabase) return;
    setBusyAction(`heat-${heat.id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("update_talent7_competition_heat_status", {
        target_heat_id: heat.id,
        target_status: status
      });
      if (error) throw error;
      await loadHeatData();
      setMessage(`Cohort ${heat.cohort_number}, heat ${heat.heat_number} moved to ${status}.`);
    } catch (error) {
      setMessage(readableError(error, "The heat status could not be changed."));
    } finally {
      setBusyAction("");
    }
  }

  async function updateCheckIn(entry: OrganizerHeatEntry, status: string) {
    if (!supabase) return;
    setBusyAction(`entry-${entry.id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("update_talent7_competition_heat_entry", {
        target_entry_id: entry.id,
        target_check_in_status: status,
        target_raw_score: entry.raw_score,
        target_penalty_score: entry.penalty_score || 0,
        target_review_note: entry.review_note
      });
      if (error) throw error;
      await loadHeatData();
    } catch (error) {
      setMessage(readableError(error, "Check-in could not be updated."));
    } finally {
      setBusyAction("");
    }
  }

  async function scoreEntry(event: FormEvent<HTMLFormElement>, entry: OrganizerHeatEntry) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    setBusyAction(`score-${entry.id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("update_talent7_competition_heat_entry", {
        target_entry_id: entry.id,
        target_check_in_status: entry.check_in_status,
        target_raw_score: Number(data.get("rawScore")),
        target_penalty_score: Number(data.get("penalty")),
        target_review_note: String(data.get("note") || "").trim() || null
      });
      if (error) throw error;
      await loadHeatData();
      setMessage(`${entry.display_name}'s provisional score is saved for review.`);
    } catch (error) {
      setMessage(readableError(error, "The provisional score could not be saved."));
    } finally {
      setBusyAction("");
    }
  }

  async function finalizeHeat(heat: OrganizerHeat) {
    if (!supabase) return;
    setBusyAction(`finalize-${heat.id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("finalize_talent7_competition_heat", {
        target_heat_id: heat.id
      });
      if (error) throw error;
      await loadHeatData();
      setMessage(`Heat ${heat.heat_number} is verified and placements are locked.`);
    } catch (error) {
      setMessage(readableError(error, "The heat could not be finalized."));
    } finally {
      setBusyAction("");
    }
  }

  async function checkIntoHeat(control: ParticipantHeatControl) {
    if (!supabase) return;
    setBusyAction(`self-check-in-${control.entry_id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("check_in_to_talent7_competition_heat", {
        target_heat_entry_id: control.entry_id
      });
      if (error) throw error;
      await loadHeatData();
      setMessage(`You are checked in for heat ${control.heat_number}, lane ${control.lane_number}.`);
    } catch (error) {
      setMessage(readableError(error, "Check-in could not be completed."));
    } finally {
      setBusyAction("");
    }
  }

  async function submitHeatProof(event: FormEvent<HTMLFormElement>, control: ParticipantHeatControl) {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = selectedFile(data, "proofFile");
    let proofUrl = String(data.get("proofUrl") || "").trim();
    let proofType = String(data.get("proofType") || "Link");
    if (!file && !proofUrl) {
      setMessage("Upload footage or paste a proof link first.");
      return;
    }
    if (file) {
      const validationError = validateProofFile(file);
      if (validationError) {
        setMessage(validationError);
        return;
      }
      proofType = file.type.startsWith("image/") ? "Image" : "Video";
    }

    setBusyAction(`proof-${control.entry_id}`);
    setMessage("");
    try {
      if (file) proofUrl = await uploadHeatProof(file, `competition-${campaignId}-entry-${control.entry_id}`);
      const { error } = await supabase.rpc("submit_my_talent7_competition_heat_proof", {
        target_heat_entry_id: control.entry_id,
        target_proof_type: proofType,
        target_proof_url: proofUrl,
        target_notes: String(data.get("proofNotes") || "").trim() || null
      });
      if (error) throw error;
      form.reset();
      await loadHeatData();
      setMessage("Your heat footage is saved in the organizer-only review desk.");
    } catch (error) {
      setMessage(readableError(error, "The heat footage could not be submitted."));
    } finally {
      setBusyAction("");
    }
  }

  async function reviewHeatProof(event: FormEvent<HTMLFormElement>, proof: OrganizerHeatProof) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    setBusyAction(`review-proof-${proof.id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("review_talent7_competition_heat_proof", {
        target_proof_id: proof.id,
        target_status: String(data.get("reviewStatus") || "Accepted"),
        target_review_note: String(data.get("reviewNote") || "").trim() || null
      });
      if (error) throw error;
      await loadHeatData();
      setMessage(`${proof.display_name}'s footage review is saved.`);
    } catch (error) {
      setMessage(readableError(error, "The footage review could not be saved."));
    } finally {
      setBusyAction("");
    }
  }

  async function runDueReminders() {
    if (!supabase) return;
    setBusyAction("reminders");
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("run_talent7_competition_heat_reminders");
      if (error) throw error;
      await loadHeatData();
      setMessage(`${Number(data) || 0} due competition reminders queued safely.`);
    } catch (error) {
      setMessage(readableError(error, "Due reminders could not be queued."));
    } finally {
      setBusyAction("");
    }
  }

  return (
    <section className="competitionHeatSection" aria-labelledby="competition-heat-title">
      <div className="competitionHeatHeader">
        <div>
          <span>Scalable event format</span>
          <h3 id="competition-heat-title">Four competitor lanes. The host stays in control.</h3>
          <p>Short heats prevent one giant room from becoming exhausting. Parallel stages let large cohorts compete at the same time, while every result remains provisional until review.</p>
        </div>
        <div><strong>2-4</strong><span>competitors per heat</span></div>
      </div>

      <div className="competitionHeatPrinciples">
        <article><strong>Host console</strong><small>The presenter and judge never consume a competitor screen.</small></article>
        <article><strong>Parallel stages</strong><small>Run multiple heats at once when registrations surge.</small></article>
        <article><strong>Review before ranking</strong><small>Raw scores, form penalties, and organizer notes remain provisional.</small></article>
      </div>

      {message && <p className="heatDeskMessage" role="status">{message}</p>}

      {publicHeats.length > 0 ? (
        <div className="publicHeatBoard">
          {publicHeats.map(({ heat, entries }) => (
            <article className={entries.some((entry) => entry.is_mine) ? "mine" : ""} key={heat.heat_id}>
              <div className="publicHeatTopline">
                <span>Cohort {heat.cohort_number} / {heat.round_name} / Heat {heat.heat_number}</span>
                <strong>{heat.heat_status}</strong>
              </div>
              <p>Stage {heat.stage_number} / {formatDate(heat.scheduled_start)} / {heat.duration_seconds}s clock</p>
              <div className="publicHeatLanes">
                {entries.map((entry) => (
                  <div className={entry.is_mine ? "mine" : ""} key={entry.entry_id}>
                    <span>Lane {entry.lane_number}</span>
                    <strong>{entry.public_display_name}</strong>
                    <small>
                      {entry.placement ? `#${entry.placement} / ` : ""}
                      {entry.final_score !== null ? `${entry.final_score} verified score` : entry.check_in_status}
                    </small>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="heatBoardEmpty">
          <strong>Heat assignments will appear after confirmation.</strong>
          <span>Your cohort, lane, start time, and stage will be shown here without exposing private registration details.</span>
        </div>
      )}

      {myHeatControls.length > 0 && (
        <div className="participantHeatControls">
          <div className="participantHeatControlsHeader">
            <span>Your private competition desk</span>
            <h4>Check in, then preserve your review footage.</h4>
            <p>Your upload link appears only in your desk and the authorized organizer desk. Keep the original file until the result is final.</p>
          </div>
          {myHeatControls.map((control) => {
            const canSubmitProof = ["Ready", "Live", "Review"].includes(control.heat_status)
              && !["Pending", "Accepted"].includes(control.proof_review_status || "");
            return (
              <article className="participantHeatCard" key={control.entry_id}>
                <div className="participantHeatTicket">
                  <span>Cohort {control.cohort_number} / {control.round_name}</span>
                  <strong>Heat {control.heat_number} / Stage {control.stage_number} / Lane {control.lane_number}</strong>
                  <small>{formatDate(control.scheduled_start)} / {control.duration_seconds}s clock</small>
                </div>
                <div className="participantCheckIn">
                  <span className={`heatStatusPill status-${control.check_in_status.toLowerCase().replace(/\s/g, "-")}`}>{control.check_in_status}</span>
                  {control.check_in_status !== "Checked in" && ["Check-in", "Ready", "Live"].includes(control.heat_status) && (
                    <button disabled={busyAction === `self-check-in-${control.entry_id}`} onClick={() => checkIntoHeat(control)} type="button">
                      {busyAction === `self-check-in-${control.entry_id}` ? "Checking in..." : "Check in now"}
                    </button>
                  )}
                </div>

                {control.proof_id ? (
                  <div className={`participantProofStatus status-${(control.proof_review_status || "pending").toLowerCase()}`}>
                    <div>
                      <span>Footage review</span>
                      <strong>{control.proof_review_status}</strong>
                      {control.proof_review_note && <small>{control.proof_review_note}</small>}
                    </div>
                    {control.proof_url && <a href={control.proof_url} rel="noreferrer" target="_blank">Open my submission</a>}
                    {control.proof_retention_expires_at && <small>Review retention through {formatDate(control.proof_retention_expires_at)}</small>}
                  </div>
                ) : (
                  <p className="participantProofWaiting">Footage submission opens when your heat reaches Ready.</p>
                )}

                {canSubmitProof && (
                  <form className="participantProofForm" onSubmit={(event) => submitHeatProof(event, control)}>
                    <label className="wide">Upload short footage<input accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" name="proofFile" type="file" /></label>
                    <span>or</span>
                    <label className="wide">Paste an HTTPS link<input maxLength={2000} name="proofUrl" placeholder="YouTube, Drive, or direct media link" type="url" /></label>
                    <label>Link type<select defaultValue="Link" name="proofType"><option>Link</option><option>Video</option><option>Image</option></select></label>
                    <label className="wide">Review note<input maxLength={500} name="proofNotes" placeholder="Timestamp, camera interruption, or context for the judge" /></label>
                    <button disabled={busyAction === `proof-${control.entry_id}`} type="submit">
                      {busyAction === `proof-${control.entry_id}` ? "Submitting..." : control.proof_review_status === "Rejected" ? "Resubmit footage" : "Submit for review"}
                    </button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}

      {isAdmin && !campaignId.startsWith("preview-") && (
        <details className="competitionHeatDesk" open>
          <summary><span>Organizer heat desk</span><strong>{desk.heats.length} heats configured</strong></summary>
          <div className="competitionHeatDeskBody">
            <section className="heatReminderConsole" aria-label="Competition reminder status">
              <div><span>Automatic participant reminders</span><strong>Assignment, 24-hour, 1-hour, and check-in alerts</strong><small>The scheduler is idempotent. Running it again cannot duplicate a reminder that was already queued.</small></div>
              <dl>
                <div><dt>Due</dt><dd>{reviewDesk.reminders.due}</dd></div>
                <div><dt>Scheduled</dt><dd>{reviewDesk.reminders.pending}</dd></div>
                <div><dt>Sent</dt><dd>{reviewDesk.reminders.sent}</dd></div>
              </dl>
              <button disabled={busyAction === "reminders"} onClick={runDueReminders} type="button">{busyAction === "reminders" ? "Queuing..." : "Queue due reminders now"}</button>
            </section>
            <form className="heatGeneratorForm" onSubmit={generateHeats}>
              <div className="heatDeskTitle"><span>Generate a round</span><h4>Turn confirmed entrants into timed heats</h4></div>
              <label>Cohort<select name="cohort">{Array.from({ length: cohortCount }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label>
              <label>Round<select name="round"><option>Qualifier</option><option>Round of 32</option><option>Round of 16</option><option>Quarterfinal</option><option>Semifinal</option><option>Final</option></select></label>
              <label>Competitor lanes<select defaultValue="4" name="lanes"><option>2</option><option>3</option><option>4</option></select></label>
              <label>Parallel stages<select defaultValue="1" name="stages"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option><option>7</option><option>8</option></select></label>
              <label>First heat starts<input defaultValue={futureLocalTime()} name="firstStart" required type="datetime-local" /></label>
              <label>Minutes between heats<input defaultValue="3" max="120" min="1" name="interval" required type="number" /></label>
              <label>Heat clock in seconds<input defaultValue="60" max="3600" min="10" name="duration" required type="number" /></label>
              <button disabled={busyAction === "generate"} type="submit">{busyAction === "generate" ? "Generating..." : "Generate heats"}</button>
            </form>

            <div className="organizerHeatList">
              {desk.heats.map((heat) => {
                const entries = desk.entries.filter((entry) => entry.heat_id === heat.id);
                const nextStatus = nextHeatStatus(heat.status);
                return (
                  <article className={`organizerHeatCard status-${heat.status.toLowerCase().replace(/\s/g, "-")}`} key={heat.id}>
                    <div className="organizerHeatHeader">
                      <div><span>C{heat.cohort_number} / {heat.round_name}</span><h4>Heat {heat.heat_number} / Stage {heat.stage_number}</h4><small>{formatDate(heat.scheduled_start)} / {heat.duration_seconds}s</small></div>
                      <strong>{heat.status}</strong>
                    </div>
                    <div className="organizerHeatEntries">
                      {entries.map((entry) => (
                        <div className="organizerHeatEntry" key={entry.id}>
                          <div className="heatEntryIdentity"><span>Lane {entry.lane_number}</span><strong>{entry.display_name}</strong><small>{entry.registration_code}{entry.public_anonymous ? " / public alias" : ""}</small></div>
                          <select aria-label={`Check-in for ${entry.display_name}`} disabled={busyAction === `entry-${entry.id}` || heat.status === "Final"} onChange={(event) => updateCheckIn(entry, event.target.value)} value={entry.check_in_status}>
                            <option>Pending</option><option>Checked in</option><option>No show</option>
                          </select>
                          <form onSubmit={(event) => scoreEntry(event, entry)}>
                            <label>Raw<input defaultValue={entry.raw_score ?? ""} min="0" name="rawScore" required step="0.01" type="number" /></label>
                            <label>Penalty<input defaultValue={entry.penalty_score || 0} min="0" name="penalty" required step="0.01" type="number" /></label>
                            <label className="wide">Review note<input defaultValue={entry.review_note || ""} maxLength={500} name="note" placeholder="Form fault, timestamp, or decision" /></label>
                            <button disabled={busyAction === `score-${entry.id}` || heat.status === "Final"} type="submit">{busyAction === `score-${entry.id}` ? "Saving..." : entry.final_score !== null ? `Save / ${entry.final_score}` : "Save provisional"}</button>
                          </form>
                          {(() => {
                            const proof = reviewDesk.proofs.find((item) => item.entry_id === entry.id);
                            return proof ? (
                              <form className={`organizerProofReview status-${proof.review_status.toLowerCase()}`} onSubmit={(event) => reviewHeatProof(event, proof)}>
                                <div>
                                  <span>{proof.proof_type} footage / {proof.review_status}</span>
                                  <a href={proof.proof_url} rel="noreferrer" target="_blank">Open submitted footage</a>
                                  {proof.notes && <small>{proof.notes}</small>}
                                </div>
                                <label>Decision<select defaultValue={proof.review_status === "Pending" ? "Accepted" : proof.review_status} name="reviewStatus"><option>Accepted</option><option>Rejected</option></select></label>
                                <label className="wide">Review note<input defaultValue={proof.review_note || ""} maxLength={500} name="reviewNote" placeholder="Form decision or resubmission instruction" /></label>
                                <button disabled={busyAction === `review-proof-${proof.id}`} type="submit">{busyAction === `review-proof-${proof.id}` ? "Saving..." : "Save footage review"}</button>
                              </form>
                            ) : <small className="organizerProofMissing">No participant footage submitted yet.</small>;
                          })()}
                          {entry.placement && <em>Verified place #{entry.placement}</em>}
                        </div>
                      ))}
                    </div>
                    <div className="organizerHeatActions">
                      {nextStatus && <button disabled={busyAction === `heat-${heat.id}`} onClick={() => updateHeatStatus(heat, nextStatus)} type="button">{busyAction === `heat-${heat.id}` ? "Updating..." : `Move to ${nextStatus}`}</button>}
                      {heat.status === "Review" && <button disabled={busyAction === `finalize-${heat.id}`} onClick={() => finalizeHeat(heat)} type="button">{busyAction === `finalize-${heat.id}` ? "Finalizing..." : "Verify and lock placements"}</button>}
                    </div>
                  </article>
                );
              })}
              {desk.heats.length === 0 && <div className="heatBoardEmpty"><strong>No heats generated yet.</strong><span>Confirm entrants in the organizer roster, then generate their cohort.</span></div>}
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
