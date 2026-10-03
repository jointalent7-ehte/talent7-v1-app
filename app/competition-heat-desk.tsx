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
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");

  const loadHeatData = useCallback(async () => {
    if (!supabase || campaignId.startsWith("preview-")) return;
    const boardResult = await supabase.rpc("get_talent7_competition_heat_board", {
      target_campaign_id: campaignId
    });
    if (!boardResult.error) setBoard((boardResult.data || []) as HeatBoardRow[]);

    if (isAdmin) {
      const deskResult = await supabase.rpc("get_talent7_competition_heat_desk", {
        target_campaign_id: campaignId
      });
      if (!deskResult.error && deskResult.data) setDesk(deskResult.data as HeatDeskState);
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

      {isAdmin && !campaignId.startsWith("preview-") && (
        <details className="competitionHeatDesk" open>
          <summary><span>Organizer heat desk</span><strong>{desk.heats.length} heats configured</strong></summary>
          <div className="competitionHeatDeskBody">
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
