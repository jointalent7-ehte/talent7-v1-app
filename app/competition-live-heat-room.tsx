"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ControlBar,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useParticipants,
  useTracks
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { supabase } from "../lib/supabase";

type LiveHeatEntry = {
  lane_number: number;
  display_name: string;
  check_in_status: string;
  is_mine: boolean;
};

type LiveHeatState = {
  heat_id: string;
  cohort_number: number;
  round_name: string;
  heat_number: number;
  stage_number: number;
  max_lanes: number;
  duration_seconds: number;
  scheduled_start: string;
  status: string;
  clock_starts_at: string | null;
  clock_ends_at: string | null;
  live_ended_at: string | null;
  viewer_role: "Organizer" | "Competitor" | "Audience";
  entries: LiveHeatEntry[];
};

type JoinCredentials = {
  server_url: string;
  participant_token: string;
  role: "organizer" | "competitor" | "audience";
  lane_number: number | null;
  can_publish: boolean;
  max_lanes: number;
};

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function participantMetadata(value?: string) {
  try {
    return JSON.parse(value || "{}") as { role?: string; laneNumber?: number | null };
  } catch {
    return {};
  }
}

function formatClock(milliseconds: number) {
  const totalTenths = Math.max(0, Math.ceil(milliseconds / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function CompetitionVideoStage({ credentials, heat }: { credentials: JoinCredentials; heat: LiveHeatState }) {
  const [now, setNow] = useState(0);
  const participants = useParticipants();
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  const laneTracks = useMemo(() => {
    const map = new Map<number, (typeof cameraTracks)[number]>();
    for (const track of cameraTracks) {
      const metadata = participantMetadata(track.participant.metadata);
      if (metadata.role === "competitor" && metadata.laneNumber) map.set(metadata.laneNumber, track);
    }
    return map;
  }, [cameraTracks]);

  const startTime = heat.clock_starts_at ? new Date(heat.clock_starts_at).getTime() : null;
  const endTime = heat.clock_ends_at ? new Date(heat.clock_ends_at).getTime() : null;
  const countdown = now > 0 && startTime && now < startTime ? Math.max(1, Math.ceil((startTime - now) / 1000)) : null;
  const clockLabel = now === 0
    ? formatClock(heat.duration_seconds * 1000)
    : countdown
      ? String(countdown)
      : endTime
        ? formatClock(endTime - now)
        : formatClock(heat.duration_seconds * 1000);
  const clockPhase = countdown ? "Get ready" : endTime && now >= endTime ? "Time" : heat.status === "Live" ? "Go" : "Ready";

  return (
    <section className="competitionLiveStage" aria-label={`Heat ${heat.heat_number} live stage`}>
      <header className="competitionLiveStageHeader">
        <div>
          <span><i aria-hidden="true" /> {heat.status === "Live" ? "Live heat" : "Camera check"}</span>
          <strong>Cohort {heat.cohort_number} / {heat.round_name} / Heat {heat.heat_number}</strong>
          <small>Stage {heat.stage_number} · {participants.length} connected · host audio remains outside competitor lanes</small>
        </div>
        <div className={`competitionHeatClock ${countdown ? "countdown" : ""}`} aria-live="polite">
          <small>{clockPhase}</small>
          <strong>{clockLabel}</strong>
        </div>
      </header>

      <div className={`competitionLiveGrid lanes-${heat.max_lanes}`}>
        {Array.from({ length: heat.max_lanes }, (_, index) => index + 1).map((laneNumber) => {
          const track = laneTracks.get(laneNumber);
          const entry = heat.entries.find((item) => item.lane_number === laneNumber);
          return (
            <article className={entry?.is_mine ? "mine" : ""} key={laneNumber}>
              <div className="competitionLaneLabel"><span>Lane {laneNumber}</span><strong>{entry?.display_name || "Open lane"}</strong></div>
              {track ? <ParticipantTile trackRef={track} /> : (
                <div className="competitionLaneWaiting">
                  <b>{entry?.check_in_status === "Checked in" ? "Camera not started" : entry?.check_in_status || "Waiting"}</b>
                  <small>{entry ? "This lane is assigned." : "No competitor assigned."}</small>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <RoomAudioRenderer />
      <div className="competitionLiveControls">
        {credentials.role === "competitor" && (
          <ControlBar controls={{ camera: true, microphone: true, screenShare: false, chat: false, leave: true }} variation="minimal" />
        )}
        {credentials.role === "organizer" && (
          <ControlBar controls={{ camera: false, microphone: true, screenShare: false, chat: false, leave: true }} variation="minimal" />
        )}
        {credentials.role === "audience" && <span>Watching as audience · camera and microphone are off</span>}
      </div>
    </section>
  );
}

export default function CompetitionLiveHeatRoom({ heatId }: { heatId: string }) {
  const [heat, setHeat] = useState<LiveHeatState | null>(null);
  const [credentials, setCredentials] = useState<JoinCredentials | null>(null);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;
    const load = async () => {
      const { data, error: stateError } = await client.rpc("get_talent7_competition_live_heat_state", {
        target_heat_id: heatId
      });
      if (!cancelled && !stateError && data) setHeat(data as LiveHeatState);
    };
    void load();
    const timer = window.setInterval(() => void load(), joined ? 5000 : 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [heatId, joined]);

  useEffect(() => {
    if (heat && !["Ready", "Live"].includes(heat.status)) {
      setJoined(false);
      setCredentials(null);
    }
  }, [heat]);

  async function enterStage() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      let { data } = await supabase.auth.getSession();
      if (!data.session) ({ data } = await supabase.auth.refreshSession());
      if (!data.session?.access_token) throw new Error("Log in before entering the live stage.");
      const response = await fetch("/api/competition-heat-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ heatId })
      });
      const result = (await response.json()) as JoinCredentials & { error?: string };
      if (!response.ok) throw new Error(result.error || "The live stage could not be opened.");
      setCredentials(result);
      setJoined(true);
    } catch (requestError) {
      setError(readableError(requestError, "The live stage could not be opened."));
    } finally {
      setBusy(false);
    }
  }

  if (!heat || !["Ready", "Live"].includes(heat.status)) return null;
  const canEnter = heat.status === "Live" || heat.viewer_role === "Organizer" || heat.viewer_role === "Competitor";

  if (!joined || !credentials) {
    return (
      <div className="competitionLiveEntry">
        <div>
          <span>{heat.status === "Live" ? "Live now" : "Stage prepared"}</span>
          <strong>{heat.viewer_role === "Competitor" ? "Your competitor lane is ready." : heat.viewer_role === "Organizer" ? "Enter as host without using a video lane." : "Audience entry opens when the heat starts."}</strong>
          {error && <small role="alert">{error}</small>}
        </div>
        {canEnter && <button disabled={busy} onClick={enterStage} type="button">{busy ? "Opening..." : heat.viewer_role === "Audience" ? "Watch live heat" : "Enter live stage"}</button>}
      </div>
    );
  }

  return (
    <LiveKitRoom
      audio={false}
      connect
      data-lk-theme="default"
      onDisconnected={() => {
        setJoined(false);
        setCredentials(null);
      }}
      onError={(roomError: Error) => setError(roomError.message)}
      serverUrl={credentials.server_url}
      token={credentials.participant_token}
      video={false}
    >
      <CompetitionVideoStage credentials={credentials} heat={heat} />
    </LiveKitRoom>
  );
}
