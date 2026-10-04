"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type ProgressRow = {
  cohort_number: number;
  round_name: string;
  heat_id: string;
  heat_number: number;
  stage_number: number;
  scheduled_start: string;
  heat_status: string;
  entry_id: string;
  lane_number: number;
  public_display_name: string;
  placement: number | null;
  final_score: number | null;
  result_status: string;
  advancement_status: string;
  is_mine: boolean;
  is_champion: boolean;
};

type AdvancementEntry = {
  entry_id: string;
  heat_id: string;
  cohort_number: number;
  round_name: string;
  heat_number: number;
  display_name: string;
  placement: number | null;
  result_status: string;
  advancement_status: string;
  advancement_note: string | null;
  advancement_manual: boolean;
  proof_status: string;
};

type AdvancementRule = {
  id: string;
  cohort_number: number;
  source_round_name: string;
  next_round_name: string;
  qualifiers_per_heat: number;
  qualified_count: number;
  next_heat_count: number;
  status: string;
};

type Champion = { cohort_number: number; display_name: string; verified_at: string };
type AdvancementState = { rules: AdvancementRule[]; entries: AdvancementEntry[]; champions: Champion[] };

const roundOrder = ["Qualifier", "Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function futureLocalTime() {
  const date = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function nextRoundFor(source: string) {
  const index = roundOrder.indexOf(source);
  return roundOrder[Math.min(index + 1, roundOrder.length - 1)] || "Round of 32";
}

function statusClass(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

export default function CompetitionProgressBoard({
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
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [adminState, setAdminState] = useState<AdvancementState>({ rules: [], entries: [], champions: [] });
  const [sourceRound, setSourceRound] = useState("Qualifier");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const loadProgress = useCallback(async () => {
    if (!supabase || campaignId.startsWith("preview-")) return;
    const progressResult = await supabase.rpc("get_talent7_competition_progress_board", {
      target_campaign_id: campaignId
    });
    if (!progressResult.error) setRows((progressResult.data || []) as ProgressRow[]);
    if (isAdmin) {
      const stateResult = await supabase.rpc("get_talent7_competition_advancement_state", {
        target_campaign_id: campaignId
      });
      if (!stateResult.error && stateResult.data) setAdminState(stateResult.data as AdvancementState);
    }
  }, [campaignId, isAdmin]);

  useEffect(() => {
    void loadProgress();
  }, [campaignPhase, loadProgress]);

  const rounds = useMemo(() => {
    const grouped = new Map<string, ProgressRow[]>();
    for (const row of rows) {
      const key = `${row.cohort_number}-${row.round_name}`;
      const current = grouped.get(key);
      if (current) current.push(row);
      else grouped.set(key, [row]);
    }
    return [...grouped.entries()].sort(([, first], [, second]) => {
      if (first[0].cohort_number !== second[0].cohort_number) return first[0].cohort_number - second[0].cohort_number;
      return roundOrder.indexOf(first[0].round_name) - roundOrder.indexOf(second[0].round_name);
    });
  }, [rows]);

  const finalizedGroups = useMemo(() => {
    const grouped = new Map<string, AdvancementEntry[]>();
    for (const entry of adminState.entries) {
      const key = `${entry.cohort_number}-${entry.round_name}-${entry.heat_number}`;
      const current = grouped.get(key);
      if (current) current.push(entry);
      else grouped.set(key, [entry]);
    }
    return [...grouped.entries()];
  }, [adminState.entries]);

  async function saveDecision(event: FormEvent<HTMLFormElement>, entry: AdvancementEntry) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    setBusy(`decision-${entry.entry_id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("set_talent7_competition_advancement_decision", {
        target_entry_id: entry.entry_id,
        target_status: String(data.get("status") || "Awaiting review"),
        target_note: String(data.get("note") || "").trim() || null
      });
      if (error) throw error;
      await loadProgress();
      setMessage(`${entry.display_name}'s advancement decision is saved.`);
    } catch (error) {
      setMessage(readableError(error, "The advancement decision could not be saved."));
    } finally {
      setBusy("");
    }
  }

  async function generateNextRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    const firstStart = String(data.get("firstStart") || "");
    setBusy("generate-next-round");
    setMessage("");
    try {
      const { data: result, error } = await supabase.rpc("generate_talent7_competition_next_round", {
        target_campaign_id: campaignId,
        target_cohort_number: Number(data.get("cohort")),
        target_source_round: String(data.get("sourceRound")),
        target_next_round: String(data.get("nextRound")),
        target_qualifiers_per_heat: Number(data.get("qualifiers")),
        target_max_lanes: Number(data.get("lanes")),
        target_parallel_stages: Number(data.get("stages")),
        target_first_start: new Date(firstStart).toISOString(),
        target_interval_minutes: Number(data.get("interval")),
        target_duration_seconds: Number(data.get("duration"))
      });
      if (error) throw error;
      await loadProgress();
      const generated = result as { qualified_count?: number; heat_count?: number; next_round?: string } | null;
      setMessage(`${generated?.qualified_count || 0} verified competitors placed into ${generated?.heat_count || 0} ${generated?.next_round || "next-round"} heats.`);
    } catch (error) {
      setMessage(readableError(error, "The next round could not be generated."));
    } finally {
      setBusy("");
    }
  }

  async function verifyChampion(cohort: number) {
    if (!supabase) return;
    setBusy(`champion-${cohort}`);
    setMessage("");
    try {
      const { data: result, error } = await supabase.rpc("verify_talent7_competition_champion", {
        target_campaign_id: campaignId,
        target_cohort_number: cohort
      });
      if (error) throw error;
      await loadProgress();
      const champion = result as { display_name?: string } | null;
      setMessage(`${champion?.display_name || "The winner"} is now the verified cohort ${cohort} champion.`);
    } catch (error) {
      setMessage(readableError(error, "The champion could not be verified."));
    } finally {
      setBusy("");
    }
  }

  if (rows.length === 0 && !isAdmin) return null;

  return (
    <section className="competitionProgressSection" aria-labelledby="competition-progress-title">
      <div className="competitionProgressHeader">
        <div><span>Verified tournament path</span><h3 id="competition-progress-title">From first heat to champion.</h3><p>Advancement appears only after results and footage are reviewed. Ties pause the bracket for an organizer decision or tiebreak.</p></div>
        <strong>{adminState.champions.length || rows.filter((row) => row.is_champion).length}<small>verified champions</small></strong>
      </div>

      {message && <p className="progressBoardMessage" role="status">{message}</p>}

      {rounds.length > 0 && (
        <div className="competitionRoundRail">
          {rounds.map(([key, roundRows]) => {
            const first = roundRows[0];
            const heatCount = new Set(roundRows.map((row) => row.heat_id)).size;
            return (
              <article key={key}>
                <div className="roundRailHeader"><span>Cohort {first.cohort_number}</span><h4>{first.round_name}</h4><small>{heatCount} {heatCount === 1 ? "heat" : "heats"}</small></div>
                <div className="roundRailEntrants">
                  {roundRows.map((row) => (
                    <div className={`${row.is_mine ? "mine" : ""} ${row.is_champion ? "champion" : ""}`} key={row.entry_id}>
                      <span>{row.is_champion ? "Champion" : `H${row.heat_number} / L${row.lane_number}`}</span>
                      <strong>{row.public_display_name}</strong>
                      <small>{row.placement ? `#${row.placement} / ` : ""}{row.advancement_status}</small>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {isAdmin && !campaignId.startsWith("preview-") && (
        <details className="advancementConsole" open>
          <summary><span>Organizer progression desk</span><strong>Proof-gated advancement</strong></summary>
          <div className="advancementConsoleBody">
            <form className="nextRoundGenerator" onSubmit={generateNextRound}>
              <div className="wide"><span>Generate the next round</span><h4>Verified qualifiers are separated from immediate rematches where capacity allows.</h4></div>
              <label>Cohort<select name="cohort">{Array.from({ length: Math.max(cohortCount, 1) }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label>
              <label>Completed round<select name="sourceRound" onChange={(event) => setSourceRound(event.target.value)} value={sourceRound}>{roundOrder.slice(0, -1).map((round) => <option key={round}>{round}</option>)}</select></label>
              <label>Next round<select defaultValue={nextRoundFor(sourceRound)} key={sourceRound} name="nextRound">{roundOrder.filter((round) => roundOrder.indexOf(round) > roundOrder.indexOf(sourceRound)).map((round) => <option key={round}>{round}</option>)}</select></label>
              <label>Qualifiers per heat<select defaultValue="1" name="qualifiers"><option>1</option><option>2</option><option>3</option></select></label>
              <label>Next-round lanes<select defaultValue="4" name="lanes"><option>2</option><option>3</option><option>4</option></select></label>
              <label>Parallel stages<select defaultValue="1" name="stages">{Array.from({ length: 8 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label>
              <label>First heat starts<input defaultValue={futureLocalTime()} name="firstStart" required type="datetime-local" /></label>
              <label>Minutes between heats<input defaultValue="3" max="120" min="1" name="interval" required type="number" /></label>
              <label>Heat clock (seconds)<input defaultValue="60" max="3600" min="10" name="duration" required type="number" /></label>
              <button disabled={busy === "generate-next-round"} type="submit">{busy === "generate-next-round" ? "Checking results..." : "Verify and generate next round"}</button>
              <p className="wide">If a cutoff is tied, or qualifying footage is missing or rejected, generation stops safely. Use the decisions below only after a tiebreak or documented organizer ruling.</p>
            </form>

            {adminState.rules.length > 0 && <div className="advancementHistory">{adminState.rules.map((rule) => <span key={rule.id}>C{rule.cohort_number}: {rule.source_round_name} → {rule.next_round_name} / {rule.qualified_count} qualified / {rule.status}</span>)}</div>}

            <div className="advancementDecisionGroups">
              {finalizedGroups.map(([key, entries]) => (
                <article key={key}>
                  <header><div><span>Cohort {entries[0].cohort_number} / {entries[0].round_name}</span><h4>Heat {entries[0].heat_number}</h4></div><small>Manual mode requires a decision for every lane.</small></header>
                  {entries.map((entry) => (
                    <form className={`advancementDecision status-${statusClass(entry.advancement_status)}`} key={entry.entry_id} onSubmit={(event) => saveDecision(event, entry)}>
                      <div><strong>{entry.display_name}</strong><small>{entry.placement ? `Place #${entry.placement}` : "No placement"} / footage {entry.proof_status}</small></div>
                      <label>Decision<select defaultValue={entry.advancement_status === "Tiebreak" ? "Awaiting review" : entry.advancement_status} name="status"><option>Awaiting review</option><option>Qualified</option><option>Eliminated</option><option>Disqualified</option></select></label>
                      <label className="wide">Reason<input defaultValue={entry.advancement_note || ""} maxLength={500} name="note" placeholder="Tiebreak result, rule reference, or disqualification reason" /></label>
                      <button disabled={busy === `decision-${entry.entry_id}`} type="submit">{busy === `decision-${entry.entry_id}` ? "Saving..." : "Save decision"}</button>
                    </form>
                  ))}
                </article>
              ))}
            </div>

            {Array.from(new Set(adminState.entries.filter((entry) => entry.round_name === "Final").map((entry) => entry.cohort_number))).map((cohort) => {
              const champion = adminState.champions.find((item) => item.cohort_number === cohort);
              return <div className="championVerification" key={cohort}><div><span>Cohort {cohort} final</span><strong>{champion ? `${champion.display_name} is verified champion` : "Ready for final champion verification"}</strong></div>{!champion && <button disabled={busy === `champion-${cohort}`} onClick={() => verifyChampion(cohort)} type="button">{busy === `champion-${cohort}` ? "Verifying..." : "Verify champion"}</button>}</div>;
            })}
          </div>
        </details>
      )}
    </section>
  );
}
