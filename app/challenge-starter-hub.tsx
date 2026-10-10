"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { openTalent7Share } from "./talent7-share-sheet";

type ChallengeSkillLevel = "Open" | "Beginner" | "Intermediate" | "Advanced" | "Pro";
type ChallengeMode = "Either" | "In person" | "Online";
type ChallengeFormat = "Any" | "Singles" | "Doubles" | "Team";

export type ChallengeStarterSeed = {
  activity: string;
  title: string;
  rules: string;
  competitionMode: "Casual" | "Ranked";
  opponentUserId?: string;
  opponentName?: string;
};

type Benchmark = {
  id: string;
  slug: string;
  title: string;
  activity: string;
  summary: string;
  rules: string;
  metric_label: string;
  unit: string;
  target_value: number | null;
  duration_seconds: number | null;
  score_direction: "Higher" | "Lower";
  sort_order: number;
};

type BenchmarkAttempt = {
  id: string;
  benchmark_id: string;
  score: number;
  created_at: string;
};

type MatchQueueItem = {
  request_id: string;
  display_name: string;
  activity: string;
  skill_level: ChallengeSkillLevel;
  play_mode: ChallengeMode;
  match_format: ChallengeFormat;
  region: string;
  note: string | null;
  request_status: "Waiting" | "Matched";
  created_at: string;
  expires_at: string;
  is_mine: boolean;
  matched_user_id: string | null;
  matched_display_name: string | null;
};

const fallbackBenchmarks: Benchmark[] = [
  {
    id: "preview-push-ups-60",
    slug: "push-ups-60",
    title: "60-second push-up benchmark",
    activity: "Push-up challenge",
    summary: "Set a personal best now, then leave the challenge open for a future rival.",
    rules: "Use a stable side view. Keep a straight body line, lower with control, and reach full arm extension. Count only strict repetitions completed inside 60 seconds.",
    metric_label: "Strict repetitions",
    unit: "reps",
    target_value: 20,
    duration_seconds: 60,
    score_direction: "Higher",
    sort_order: 10
  },
  {
    id: "preview-squats-60",
    slug: "bodyweight-squats-60",
    title: "60-second squat benchmark",
    activity: "Bodyweight squat challenge",
    summary: "Record a repeatable fitness baseline without waiting for another person.",
    rules: "Keep the full body visible. Reach a consistent legal depth, stand to full extension, and count only controlled repetitions completed inside 60 seconds.",
    metric_label: "Controlled repetitions",
    unit: "reps",
    target_value: 30,
    duration_seconds: 60,
    score_direction: "Higher",
    sort_order: 20
  },
  {
    id: "preview-plank-hold",
    slug: "plank-hold",
    title: "Strict plank hold",
    activity: "Plank hold",
    summary: "Build a personal record that another challenger can answer asynchronously.",
    rules: "Keep shoulders, hips, and heels aligned. Stop the timer when the legal position is lost. Enter the completed hold time in seconds.",
    metric_label: "Hold time",
    unit: "seconds",
    target_value: 60,
    duration_seconds: null,
    score_direction: "Higher",
    sort_order: 30
  },
  {
    id: "preview-burpees-60",
    slug: "burpees-60",
    title: "60-second burpee benchmark",
    activity: "Burpee challenge",
    summary: "Complete an official Talent7 starter test and invite someone to beat it later.",
    rules: "Keep the full body visible. Use the same agreed movement standard for every repetition and count only complete repetitions inside 60 seconds.",
    metric_label: "Complete repetitions",
    unit: "reps",
    target_value: 12,
    duration_seconds: 60,
    score_direction: "Higher",
    sort_order: 40
  }
];

function formatResult(score: number, unit: string) {
  return `${Number.isInteger(score) ? score : score.toFixed(2)} ${unit}`;
}

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export default function ChallengeStarterHub({
  activities,
  userId,
  displayName,
  mainInterest,
  region,
  skillLevel,
  playMode,
  matchFormat,
  onStartChallenge
}: {
  activities: string[];
  userId: string;
  displayName: string;
  mainInterest: string;
  region: string;
  skillLevel: ChallengeSkillLevel;
  playMode: ChallengeMode;
  matchFormat: ChallengeFormat;
  onStartChallenge: (seed: ChallengeStarterSeed) => void;
}) {
  const initialActivity = activities.includes(mainInterest) ? mainInterest : activities[0] || "Push-up challenge";
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>(fallbackBenchmarks);
  const [attempts, setAttempts] = useState<BenchmarkAttempt[]>([]);
  const [queue, setQueue] = useState<MatchQueueItem[]>([]);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState("");
  const [sharedBenchmarkId, setSharedBenchmarkId] = useState("");
  const [selectedActivity, setSelectedActivity] = useState(initialActivity);
  const [selectedSkill, setSelectedSkill] = useState<ChallengeSkillLevel>(skillLevel);
  const [selectedMode, setSelectedMode] = useState<ChallengeMode>(playMode);
  const [selectedFormat, setSelectedFormat] = useState<ChallengeFormat>(matchFormat);
  const [queueRegion, setQueueRegion] = useState(region || "Global");
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [loadWarning, setLoadWarning] = useState("");

  useEffect(() => {
    const sharedActivity = new URLSearchParams(window.location.search).get("activity");
    if (sharedActivity && activities.includes(sharedActivity)) {
      setSelectedActivity(sharedActivity);
    } else if (activities.includes(mainInterest)) {
      setSelectedActivity(mainInterest);
    }
  }, [activities, mainInterest]);

  useEffect(() => {
    const sharedBenchmarkSlug = new URLSearchParams(window.location.search).get("benchmark");
    if (!sharedBenchmarkSlug) return;
    const sharedBenchmark = benchmarks.find((benchmark) => benchmark.slug === sharedBenchmarkSlug);
    if (!sharedBenchmark) return;
    setSharedBenchmarkId(sharedBenchmark.id);
    setSelectedActivity(sharedBenchmark.activity);
    window.setTimeout(() => {
      document.getElementById(`benchmark-${sharedBenchmark.slug}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }, [benchmarks]);

  useEffect(() => setSelectedSkill(skillLevel), [skillLevel]);
  useEffect(() => setSelectedMode(playMode), [playMode]);
  useEffect(() => setSelectedFormat(matchFormat), [matchFormat]);
  useEffect(() => setQueueRegion(region || "Global"), [region]);

  const loadStarterData = useCallback(async () => {
    if (!supabase) {
      setBenchmarks(fallbackBenchmarks);
      return;
    }

    const benchmarkResult = await supabase
      .from("talent7_benchmarks")
      .select("id,slug,title,activity,summary,rules,metric_label,unit,target_value,duration_seconds,score_direction,sort_order")
      .eq("status", "Active")
      .order("sort_order", { ascending: true });

    if (benchmarkResult.error) {
      setBenchmarks(fallbackBenchmarks);
      setLoadWarning("Challenge Now is waiting for the latest Supabase migration. The preview benchmarks are shown below.");
    } else {
      setBenchmarks((benchmarkResult.data || []) as Benchmark[]);
      setLoadWarning("");
    }

    const queueResult = await supabase.rpc("get_talent7_match_queue");
    if (!queueResult.error) setQueue((queueResult.data || []) as MatchQueueItem[]);

    if (!userId) {
      setAttempts([]);
      return;
    }

    const attemptResult = await supabase
      .from("talent7_benchmark_attempts")
      .select("id,benchmark_id,score,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!attemptResult.error) setAttempts((attemptResult.data || []) as BenchmarkAttempt[]);
  }, [userId]);

  useEffect(() => {
    void loadStarterData();
  }, [loadStarterData]);

  const personalBests = useMemo(() => {
    const best = new Map<string, number>();
    for (const attempt of attempts) {
      const benchmark = benchmarks.find((item) => item.id === attempt.benchmark_id);
      const current = best.get(attempt.benchmark_id);
      if (current === undefined) best.set(attempt.benchmark_id, Number(attempt.score));
      else if (benchmark?.score_direction === "Lower") best.set(attempt.benchmark_id, Math.min(current, Number(attempt.score)));
      else best.set(attempt.benchmark_id, Math.max(current, Number(attempt.score)));
    }
    return best;
  }, [attempts, benchmarks]);

  const myRequest = queue.find((item) => item.is_mine && ["Waiting", "Matched"].includes(item.request_status));
  const waitingRequests = queue.filter((item) => item.request_status === "Waiting" && !item.is_mine).slice(0, 8);

  async function recordAttempt(event: FormEvent<HTMLFormElement>, benchmark: Benchmark) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!userId) {
      setMessage("Log in to save a personal best. You can still read the benchmark and practise now.");
      return;
    }

    const form = new FormData(formElement);
    const score = Number(form.get("score"));
    const note = String(form.get("note") || "").trim();
    if (!Number.isFinite(score) || score <= 0) {
      setMessage("Enter a positive result before saving this attempt.");
      return;
    }

    setBusyAction(`attempt-${benchmark.id}`);
    setMessage("");
    try {
      if (!supabase || benchmark.id.startsWith("preview-")) {
        const localAttempt: BenchmarkAttempt = {
          id: crypto.randomUUID(),
          benchmark_id: benchmark.id,
          score,
          created_at: new Date().toISOString()
        };
        setAttempts((items) => [localAttempt, ...items]);
        setMessage("Preview attempt saved in this browser session. Run the Supabase migration to save it to your account.");
      } else {
        const { data, error } = await supabase.rpc("record_talent7_benchmark_attempt", {
          target_benchmark_id: benchmark.id,
          target_score: score,
          target_note: note || null
        });
        if (error) throw error;
        if (data) setAttempts((items) => [data as BenchmarkAttempt, ...items]);
        setMessage(`Personal best attempt saved: ${formatResult(score, benchmark.unit)}. It is self-reported and does not change Rise Points.`);
      }
      setSelectedBenchmarkId("");
      formElement.reset();
    } catch (error) {
      setMessage(readableError(error, "The benchmark attempt could not be saved."));
    } finally {
      setBusyAction("");
    }
  }

  async function joinQueue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) {
      setMessage("Log in and complete your profile to enter matchmaking.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const note = String(form.get("note") || "").trim();
    setBusyAction("queue");
    setMessage("");
    try {
      if (!supabase) {
        setMessage("Preview mode cannot match real people. Connect Supabase to publish this request.");
        return;
      }
      const { data, error } = await supabase.rpc("join_talent7_match_queue", {
        target_activity: selectedActivity,
        target_skill_level: selectedSkill,
        target_play_mode: selectedMode,
        target_match_format: selectedFormat,
        target_region: queueRegion || "Global",
        target_note: note || null
      });
      if (error) throw error;
      await loadStarterData();
      const saved = data as { status?: string } | null;
      setMessage(saved?.status === "Matched" ? "Opponent found. Your matchup is ready below." : "You are in the queue for seven days. Talent7 will keep looking even while you are offline.");
    } catch (error) {
      setMessage(readableError(error, "Could not join matchmaking."));
    } finally {
      setBusyAction("");
    }
  }

  async function withdrawRequest(requestId: string) {
    if (!supabase) return;
    setBusyAction(`withdraw-${requestId}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("withdraw_talent7_match_request", { target_request_id: requestId });
      if (error) throw error;
      await loadStarterData();
      setMessage("Matchmaking request withdrawn.");
    } catch (error) {
      setMessage(readableError(error, "Could not withdraw the request."));
    } finally {
      setBusyAction("");
    }
  }

  function shareActivity() {
    const url = `${window.location.origin}/?activity=${encodeURIComponent(selectedActivity)}#challenge-now`;
    const text = `Challenge me in ${selectedActivity} on Talent7.`;
    openTalent7Share({
      title: "Talent7 challenge",
      text,
      url,
      onShare: () => setMessage("Challenge link shared.")
    });
  }

  function shareBenchmark(benchmark: Benchmark, personalBest?: number) {
    const result = personalBest === undefined ? "" : formatResult(personalBest, benchmark.unit);
    openTalent7Share({
      title: personalBest === undefined ? benchmark.title : `${displayName || "Talent7 challenger"}'s benchmark`,
      text: personalBest === undefined
        ? `Try the ${benchmark.title} with me on Talent7. Read the rules, record your result, and challenge someone to beat it.`
        : `${displayName || "A Talent7 challenger"} recorded a self-reported personal best of ${result} on the ${benchmark.title}. Can you beat it?`,
      url: `${window.location.origin}/?benchmark=${encodeURIComponent(benchmark.slug)}#challenge-now`,
      onShare: () => setMessage(personalBest === undefined ? "Benchmark shared." : "Personal best shared.")
    });
  }

  return (
    <section className="section challengeStarterSection" id="challenge-now">
      <div className="sectionHeader challengeStarterHeader">
        <div>
          <p className="eyebrow">Challenge now</p>
          <h2>Never wait for the community to wake up</h2>
          <p>Set a personal best, publish an open challenge, enter matchmaking, or invite someone directly. No fake opponents and no paid entry.</p>
        </div>
        <div className="challengeStarterPromise">
          <strong>Always available</strong>
          <span>Solo now · rival later</span>
        </div>
      </div>

      {loadWarning && <aside className="challengeStarterWarning">{loadWarning}</aside>}
      {message && <p className="challengeStarterMessage" role="status">{message}</p>}

      <div className="challengeStarterPathGrid" aria-label="Ways to start immediately">
        <article><span>1</span><strong>Set a benchmark</strong><small>Do something immediately and build a personal best.</small></article>
        <article><span>2</span><strong>Open the challenge</strong><small>Let an asynchronous rival answer when they are ready.</small></article>
        <article><span>3</span><strong>Enter matchmaking</strong><small>Talent7 keeps searching while you are offline.</small></article>
        <article><span>4</span><strong>Invite a rival</strong><small>Bring one person directly into your chosen activity.</small></article>
      </div>

      <div className="challengeStarterLayout">
        <div className="challengeBenchmarkColumn">
          <div className="challengeStarterSubhead">
            <div>
              <span>Official starters</span>
              <h3>Talent7 benchmarks</h3>
            </div>
            <small>Self-reported attempts build your private history but award no Rise Points or prizes.</small>
          </div>
          <div className="challengeBenchmarkGrid">
            {benchmarks.map((benchmark) => {
              const personalBest = personalBests.get(benchmark.id);
              const recording = selectedBenchmarkId === benchmark.id;
              return (
                <article
                  className={`challengeBenchmarkCard${sharedBenchmarkId === benchmark.id ? " sharedBenchmarkCard" : ""}`}
                  id={`benchmark-${benchmark.slug}`}
                  key={benchmark.id}
                >
                  <div className="challengeBenchmarkTopline">
                    <span>{benchmark.duration_seconds ? `${benchmark.duration_seconds}s` : "Open timer"}</span>
                    {personalBest !== undefined && <strong>Best: {formatResult(personalBest, benchmark.unit)}</strong>}
                  </div>
                  <h4>{benchmark.title}</h4>
                  <p>{benchmark.summary}</p>
                  <details>
                    <summary>Read strict rules</summary>
                    <p>{benchmark.rules}</p>
                  </details>
                  {recording ? (
                    <form className="benchmarkAttemptForm" onSubmit={(event) => recordAttempt(event, benchmark)}>
                      <label>
                        {benchmark.metric_label}
                        <div className="benchmarkScoreField">
                          <input min="0.01" name="score" required step="0.01" type="number" />
                          <span>{benchmark.unit}</span>
                        </div>
                      </label>
                      <label>
                        Private attempt note (optional)
                        <input maxLength={240} name="note" placeholder="Camera angle, surface, or what to improve" />
                      </label>
                      <div>
                        <button disabled={busyAction === `attempt-${benchmark.id}`} type="submit">
                          {busyAction === `attempt-${benchmark.id}` ? "Saving…" : "Save personal best"}
                        </button>
                        <button className="secondary" onClick={() => setSelectedBenchmarkId("")} type="button">Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <div className="challengeBenchmarkActions">
                      <button onClick={() => setSelectedBenchmarkId(benchmark.id)} type="button">Try now</button>
                      <button
                        className="secondary"
                        onClick={() => onStartChallenge({
                          activity: benchmark.activity,
                          title: benchmark.title,
                          rules: benchmark.rules,
                          competitionMode: "Casual"
                        })}
                        type="button"
                      >
                        Open to a rival
                      </button>
                      <button className="benchmarkShareButton" onClick={() => shareBenchmark(benchmark, personalBest)} type="button">
                        {personalBest === undefined ? "Share benchmark" : "Share my best"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <aside className="challengeMatchmaker">
          <div className="challengeStarterSubhead">
            <div>
              <span>Opponent queue</span>
              <h3>Find me a match</h3>
            </div>
            <small>{userId ? `Searching as ${displayName || "your profile"}` : "Log in to enter the queue"}</small>
          </div>

          {myRequest ? (
            <div className={`myMatchRequest ${myRequest.request_status === "Matched" ? "matched" : ""}`}>
              <span>{myRequest.request_status === "Matched" ? "Match found" : "Searching"}</span>
              <h4>{myRequest.activity}</h4>
              {myRequest.request_status === "Matched" && myRequest.matched_display_name ? (
                <>
                  <p>You matched with <strong>{myRequest.matched_display_name}</strong>.</p>
                  <button
                    onClick={() => onStartChallenge({
                      activity: myRequest.activity,
                      title: `${myRequest.activity} matchup`,
                      rules: `Agree the exact ${myRequest.activity} rules before starting. Complete the challenge fairly and upload proof after the result.`,
                      competitionMode: "Ranked",
                      opponentUserId: myRequest.matched_user_id || undefined,
                      opponentName: myRequest.matched_display_name || undefined
                    })}
                    type="button"
                  >
                    Create matched challenge
                  </button>
                </>
              ) : (
                <p>{myRequest.region} · {myRequest.skill_level} · {myRequest.play_mode}</p>
              )}
              <button
                className="textButton"
                disabled={busyAction === `withdraw-${myRequest.request_id}`}
                onClick={() => withdrawRequest(myRequest.request_id)}
                type="button"
              >
                {busyAction === `withdraw-${myRequest.request_id}` ? "Withdrawing…" : "Withdraw request"}
              </button>
            </div>
          ) : (
            <form className="challengeMatchForm" onSubmit={joinQueue}>
              <label>
                Activity
                <select onChange={(event) => setSelectedActivity(event.target.value)} value={selectedActivity}>
                  {activities.map((activity) => <option key={activity}>{activity}</option>)}
                </select>
              </label>
              <div className="challengeMatchFormRow">
                <label>
                  Skill
                  <select onChange={(event) => setSelectedSkill(event.target.value as ChallengeSkillLevel)} value={selectedSkill}>
                    {(["Open", "Beginner", "Intermediate", "Advanced", "Pro"] as const).map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Mode
                  <select onChange={(event) => setSelectedMode(event.target.value as ChallengeMode)} value={selectedMode}>
                    {(["Either", "In person", "Online"] as const).map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
              </div>
              <div className="challengeMatchFormRow">
                <label>
                  Format
                  <select onChange={(event) => setSelectedFormat(event.target.value as ChallengeFormat)} value={selectedFormat}>
                    {(["Any", "Singles", "Doubles", "Team"] as const).map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Region
                  <input maxLength={100} onChange={(event) => setQueueRegion(event.target.value)} value={queueRegion} />
                </label>
              </div>
              <label>
                Match note (optional)
                <textarea maxLength={180} name="note" placeholder="For example: evenings, beginner-friendly, online only" rows={3} />
              </label>
              <button disabled={busyAction === "queue" || !userId} type="submit">
                {busyAction === "queue" ? "Finding a match…" : userId ? "Find me an opponent" : "Log in to match"}
              </button>
            </form>
          )}

          <div className="challengeInviteRival">
            <strong>Already know someone?</strong>
            <p>Share a direct activity link. They can inspect Talent7 before signing up.</p>
            <div>
              <button className="secondary" onClick={shareActivity} type="button">Share challenge link</button>
              <button
                className="secondary"
                onClick={() => onStartChallenge({
                  activity: selectedActivity,
                  title: selectedActivity,
                  rules: `Agree the exact ${selectedActivity} rules before starting. Complete the challenge fairly and upload proof after the result.`,
                  competitionMode: "Casual"
                })}
                type="button"
              >
                Publish open challenge
              </button>
            </div>
          </div>
        </aside>
      </div>

      <div className="openMatchBoard">
        <div className="challengeStarterSubhead">
          <div>
            <span>Live demand</span>
            <h3>People waiting for a challenger</h3>
          </div>
          <small>Only challenge preferences are shown. Account and contact details remain private.</small>
        </div>
        {waitingRequests.length > 0 ? (
          <div className="openMatchBoardGrid">
            {waitingRequests.map((request) => (
              <article key={request.request_id}>
                <span>{request.activity}</span>
                <h4>{request.display_name}</h4>
                <p>{request.region} · {request.skill_level} · {request.play_mode} · {request.match_format}</p>
                {request.note && <small>{request.note}</small>}
              </article>
            ))}
          </div>
        ) : (
          <div className="challengeStarterEmpty">
            <strong>No public requests are waiting yet.</strong>
            <p>That does not block you: complete a benchmark, publish the first open challenge, or invite a rival directly.</p>
          </div>
        )}
      </div>
    </section>
  );
}
