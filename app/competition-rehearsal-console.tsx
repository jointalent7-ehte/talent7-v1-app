"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Rehearsal = {
  id: string;
  campaign_id: string;
  label: string;
  lane_count: number;
  countdown_seconds: number;
  duration_seconds: number;
  status: string;
  clock_starts_at: string | null;
  clock_ends_at: string | null;
  completed_note: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type RehearsalCheck = {
  id: string;
  rehearsal_id: string;
  check_key: string;
  label: string;
  guidance: string;
  required: boolean;
  status: string;
  note: string | null;
};

type RehearsalState = { rehearsals: Rehearsal[]; checks: RehearsalCheck[] };

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function clockLabel(rehearsal: Rehearsal, now: number) {
  if (!rehearsal.clock_starts_at || !rehearsal.clock_ends_at || now === 0) return { label: "Not started", value: `${rehearsal.duration_seconds}.0` };
  const starts = new Date(rehearsal.clock_starts_at).getTime();
  const ends = new Date(rehearsal.clock_ends_at).getTime();
  if (now < starts) return { label: "Countdown", value: Math.max(0, (starts - now) / 1000).toFixed(1) };
  if (now < ends) return { label: "Live drill", value: Math.max(0, (ends - now) / 1000).toFixed(1) };
  return { label: "Clock complete", value: "0.0" };
}

export default function CompetitionRehearsalConsole({ campaignId }: { campaignId: string }) {
  const [state, setState] = useState<RehearsalState>({ rehearsals: [], checks: [] });
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  const [mediaMessage, setMediaMessage] = useState("Camera and microphone have not been tested on this device.");
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const loadState = useCallback(async () => {
    if (!supabase || campaignId.startsWith("preview-")) return;
    const { data, error } = await supabase.rpc("get_talent7_competition_rehearsal_state", {
      target_campaign_id: campaignId
    });
    if (!error && data) {
      const nextState = data as RehearsalState;
      setState(nextState);
      setSelectedId((current) => current || nextState.rehearsals.find((item) => ["Draft", "Running"].includes(item.status))?.id || nextState.rehearsals[0]?.id || "");
    }
  }, [campaignId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const selected = useMemo(() => state.rehearsals.find((item) => item.id === selectedId) || null, [selectedId, state.rehearsals]);
  const selectedChecks = useMemo(() => state.checks.filter((item) => item.rehearsal_id === selectedId), [selectedId, state.checks]);
  const passedRequired = selectedChecks.filter((item) => item.required && item.status === "Passed").length;
  const requiredCount = selectedChecks.filter((item) => item.required).length;
  const clock = selected ? clockLabel(selected, now) : null;

  async function createRehearsal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("create-rehearsal");
    setMessage("");
    try {
      const { data: id, error } = await supabase.rpc("create_talent7_competition_rehearsal", {
        target_campaign_id: campaignId,
        target_label: String(data.get("label") || ""),
        target_lane_count: Number(data.get("lanes")),
        target_countdown_seconds: Number(data.get("countdown")),
        target_duration_seconds: Number(data.get("duration"))
      });
      if (error) throw error;
      form.reset();
      setSelectedId(String(id || ""));
      await loadState();
      setMessage("Isolated rehearsal created. It cannot award ranks, prizes, or notifications.");
    } catch (error) {
      setMessage(readableError(error, "The rehearsal could not be created."));
    } finally {
      setBusy("");
    }
  }

  async function startRehearsal(rehearsal: Rehearsal) {
    if (!supabase) return;
    setBusy(`start-${rehearsal.id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("start_talent7_competition_rehearsal", { target_rehearsal_id: rehearsal.id });
      if (error) throw error;
      await loadState();
      setMessage("The server-timed rehearsal countdown is running. Compare this clock across every test device.");
    } catch (error) {
      setMessage(readableError(error, "The rehearsal clock could not start."));
    } finally {
      setBusy("");
    }
  }

  async function saveCheck(event: FormEvent<HTMLFormElement>, check: RehearsalCheck) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    setBusy(`check-${check.id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("update_talent7_competition_rehearsal_check", {
        target_check_id: check.id,
        target_status: String(data.get("status") || "Pending"),
        target_note: String(data.get("note") || "").trim() || null
      });
      if (error) throw error;
      await loadState();
    } catch (error) {
      setMessage(readableError(error, "The readiness check could not be saved."));
    } finally {
      setBusy("");
    }
  }

  async function completeRehearsal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selected) return;
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const result: "Passed" | "Failed" = submitter instanceof HTMLButtonElement && submitter.value === "Failed" ? "Failed" : "Passed";
    setBusy(`complete-${result}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("complete_talent7_competition_rehearsal", {
        target_rehearsal_id: selected.id,
        target_result: result,
        target_note: String(data.get("completionNote") || "").trim() || null
      });
      if (error) throw error;
      await loadState();
      setMessage(result === "Passed" ? "Rehearsal passed. The readiness result is preserved in the organizer audit history." : "Rehearsal marked failed. Resolve the failed checks before creating a fresh run.");
    } catch (error) {
      setMessage(readableError(error, "The rehearsal could not be completed."));
    } finally {
      setBusy("");
    }
  }

  async function testMedia() {
    setMediaMessage("Requesting camera and microphone access...");
    try {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const cameraCount = stream.getVideoTracks().filter((track) => track.readyState === "live").length;
      const microphoneCount = stream.getAudioTracks().filter((track) => track.readyState === "live").length;
      setMediaMessage(`${cameraCount} camera and ${microphoneCount} microphone stream active. Observe framing and audio, then mark the checks manually.`);
    } catch (error) {
      setMediaMessage(readableError(error, "Camera or microphone access failed on this device."));
    }
  }

  function stopMedia() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setMediaMessage("Device preview stopped.");
  }

  return (
    <details className="competitionRehearsalConsole">
      <summary><span>Launch rehearsal</span><strong>{state.rehearsals.some((item) => item.status === "Passed") ? "Readiness run passed" : "Test before going live"}</strong></summary>
      <div className="competitionRehearsalBody">
        {message && <p className="rehearsalMessage" role="status">{message}</p>}
        <form className="rehearsalCreateForm" onSubmit={createRehearsal}>
          <div className="wide"><span>Isolated dry run</span><h4>Create a drill without real entrants or rewards.</h4></div>
          <label>Name<input defaultValue="Full launch rehearsal" maxLength={100} name="label" required /></label>
          <label>Mock lanes<select defaultValue="4" name="lanes"><option>2</option><option>3</option><option>4</option></select></label>
          <label>Countdown<select defaultValue="5" name="countdown"><option>3</option><option>5</option><option>10</option><option>15</option></select></label>
          <label>Clock seconds<input defaultValue="60" max="600" min="10" name="duration" required type="number" /></label>
          <button disabled={busy === "create-rehearsal"} type="submit">{busy === "create-rehearsal" ? "Creating..." : "Create rehearsal"}</button>
        </form>

        {state.rehearsals.length > 0 && <div className="rehearsalHistory">{state.rehearsals.map((item) => <button className={item.id === selectedId ? "selected" : ""} key={item.id} onClick={() => setSelectedId(item.id)} type="button"><span>{item.status}</span><strong>{item.label}</strong><small>{new Date(item.created_at).toLocaleDateString()}</small></button>)}</div>}

        {selected && <div className="activeRehearsal">
          <div className="rehearsalRunHeader"><div><span>{selected.status} / {selected.lane_count} mock lanes</span><h4>{selected.label}</h4><small>This drill is isolated from production competition records.</small></div><div className={`rehearsalClock ${clock?.label === "Countdown" ? "countdown" : ""}`}><span>{clock?.label}</span><strong>{clock?.value}</strong></div>{["Draft", "Running"].includes(selected.status) && <button disabled={busy === `start-${selected.id}`} onClick={() => startRehearsal(selected)} type="button">{busy === `start-${selected.id}` ? "Starting..." : selected.status === "Running" ? "Restart clock" : "Start synchronized clock"}</button>}</div>

          {["Draft", "Running"].includes(selected.status) && <section className="rehearsalMediaTest"><div><span>Local device preview</span><strong>Verify the host setup before inviting test devices.</strong><p>{mediaMessage}</p><div><button onClick={testMedia} type="button">Test camera and microphone</button><button onClick={stopMedia} type="button">Stop preview</button></div></div><video aria-label="Local rehearsal camera preview" muted playsInline ref={videoRef} /></section>}

          <div className="rehearsalReadinessTopline"><span>Required checks passed</span><strong>{passedRequired}/{requiredCount}</strong><div><i style={{ width: `${requiredCount ? (passedRequired / requiredCount) * 100 : 0}%` }} /></div></div>
          <div className="rehearsalChecks">{selectedChecks.map((check) => <form className={`status-${check.status.toLowerCase().replace(/\s+/g, "-")}`} key={check.id} onSubmit={(event) => saveCheck(event, check)}><div><span>{check.required ? "Required" : "Optional"}</span><strong>{check.label}</strong><small>{check.guidance}</small></div><label>Result<select defaultValue={check.status} disabled={!['Draft', 'Running'].includes(selected.status)} name="status"><option>Pending</option><option>Passed</option><option>Failed</option>{!check.required && <option>Not applicable</option>}</select></label><label className="wide">Evidence or issue<input defaultValue={check.note || ""} disabled={!['Draft', 'Running'].includes(selected.status)} maxLength={500} name="note" placeholder="Device tested, screenshot saved, owner assigned, or blocker found" /></label>{['Draft', 'Running'].includes(selected.status) && <button disabled={busy === `check-${check.id}`} type="submit">{busy === `check-${check.id}` ? "Saving..." : "Save check"}</button>}</form>)}</div>

          {['Draft', 'Running'].includes(selected.status) && <form className="rehearsalCompletion" onSubmit={completeRehearsal}><label>Completion note<textarea maxLength={500} name="completionNote" placeholder="Record the final go/no-go decision and any follow-up owner." /></label><div><button disabled={busy.startsWith("complete-")} name="result" type="submit" value="Passed">Pass readiness gate</button><button disabled={busy.startsWith("complete-")} name="result" type="submit" value="Failed">Mark rehearsal failed</button></div></form>}
          {selected.completed_note && <p className="rehearsalCompletedNote"><strong>{selected.status}</strong>{selected.completed_note}</p>}
        </div>}
      </div>
    </details>
  );
}
