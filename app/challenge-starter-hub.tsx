"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import BrandedBenchmarkVideo from "./branded-benchmark-video";
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

export type BenchmarkStarterRequest = {
  requestId: number;
  slug: string;
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
  verification_status: "Self reported" | "Proof submitted" | "Verified" | "Rejected";
  leaderboard_visible: boolean;
  proof_type: "Video" | "Image" | "Link" | null;
  proof_url: string | null;
  feed_visible: boolean;
  feed_caption: string | null;
  feed_published_at: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type BenchmarkFeedEntry = {
  attempt_id: string;
  benchmark_id: string;
  benchmark_title: string;
  activity: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  region: string | null;
  score: number;
  unit: string;
  proof_url: string;
  feed_caption: string | null;
  published_at: string;
  reaction_closes_at: string;
  reactions_open: boolean;
  respect_count: number;
  strong_form_count: number;
  motivating_count: number;
  viewer_reaction: "Respect" | "Strong form" | "Motivating" | null;
};

type BenchmarkLeaderboardEntry = {
  rank_position: number;
  attempt_id: string;
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  region: string | null;
  score: number;
  verification_status: "Self reported" | "Proof submitted" | "Verified";
  attempted_at: string;
};

type BenchmarkProofQueueItem = {
  attempt_id: string;
  benchmark_id: string;
  benchmark_title: string;
  display_name: string;
  username: string;
  score: number;
  unit: string;
  proof_type: "Video" | "Image" | "Link";
  proof_url: string;
  submitted_at: string;
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
  location_scope?: MatchDiscoveryScope;
  location_label?: string;
  proximity_level?: MatchDiscoveryScope;
};

type MatchDiscoveryScope = "Area" | "City" | "Country" | "Global";

type CityDiscoveryReadiness = {
  city_label: string | null;
  activity: string | null;
  readiness_status: "Add city" | "Building" | "Growing" | "Pilot ready";
  active_member_band: string;
  readiness_threshold: number;
  pilot_ready: boolean;
};

const matchScopeRank: Record<MatchDiscoveryScope, number> = {
  Global: 0,
  Country: 1,
  City: 2,
  Area: 3
};

const fallbackBenchmarks: Benchmark[] = [
  {
    id: "preview-push-ups-60",
    slug: "push-ups-60",
    title: "60-second push-up benchmark",
    activity: "Push-up challenge",
    summary: "Record a solo personal best with video proof. No room or opponent is created.",
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
    summary: "Record a solo timed hold with video proof and build your personal history.",
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
    summary: "Complete an official solo Talent7 starter test with video proof.",
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

function formatReactionWindow(closesAt: string) {
  const remaining = new Date(closesAt).getTime() - Date.now();
  if (remaining <= 0) return "Reaction window closed";
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.max(1, Math.ceil((remaining % (60 * 60 * 1000)) / (60 * 1000)));
  return hours > 0 ? `${hours}h ${minutes}m left to react` : `${minutes}m left to react`;
}

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function cleanUploadFileName(name: string) {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "benchmark-video.mp4";
}

function isTalent7UploadedVideo(url: string | null) {
  return Boolean(url && (url.includes("/challenge-proofs/") || url.includes("/storage/v1/object/public/challenge-proofs/")));
}

export default function ChallengeStarterHub({
  activities,
  userId,
  displayName,
  mainInterest,
  region,
  area,
  city,
  country,
  skillLevel,
  playMode,
  matchFormat,
  isAdmin,
  benchmarkStartRequest,
  onStartChallenge
}: {
  activities: string[];
  userId: string;
  displayName: string;
  mainInterest: string;
  region: string;
  area: string;
  city: string;
  country: string;
  skillLevel: ChallengeSkillLevel;
  playMode: ChallengeMode;
  matchFormat: ChallengeFormat;
  isAdmin: boolean;
  benchmarkStartRequest?: BenchmarkStarterRequest | null;
  onStartChallenge: (seed: ChallengeStarterSeed) => void;
}) {
  const initialActivity = activities.includes(mainInterest) ? mainInterest : activities[0] || "Push-up challenge";
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>(fallbackBenchmarks);
  const [attempts, setAttempts] = useState<BenchmarkAttempt[]>([]);
  const [queue, setQueue] = useState<MatchQueueItem[]>([]);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState("");
  const [sharedBenchmarkId, setSharedBenchmarkId] = useState("");
  const [leaderboardBenchmarkId, setLeaderboardBenchmarkId] = useState("");
  const [leaderboardBoard, setLeaderboardBoard] = useState<"Community" | "Verified">("Community");
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<"Daily" | "Weekly" | "Season" | "All time">("All time");
  const [leaderboardEntries, setLeaderboardEntries] = useState<BenchmarkLeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [proofQueue, setProofQueue] = useState<BenchmarkProofQueueItem[]>([]);
  const [feedBenchmarkId, setFeedBenchmarkId] = useState("all");
  const [feedEntries, setFeedEntries] = useState<BenchmarkFeedEntry[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [activeStarterPath, setActiveStarterPath] = useState<"benchmark" | "match" | null>(null);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(initialActivity);
  const [selectedSkill, setSelectedSkill] = useState<ChallengeSkillLevel>(skillLevel);
  const [selectedMode, setSelectedMode] = useState<ChallengeMode>(playMode);
  const [selectedFormat, setSelectedFormat] = useState<ChallengeFormat>(matchFormat);
  const [queueScope, setQueueScope] = useState<MatchDiscoveryScope>(area ? "Area" : city ? "City" : country ? "Country" : "Global");
  const [cityDiscoveryReadiness, setCityDiscoveryReadiness] = useState<CityDiscoveryReadiness | null>(null);
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
    setActiveStarterPath("benchmark");
    setSelectedActivity(sharedBenchmark.activity);
    window.setTimeout(() => {
      document.getElementById(`benchmark-${sharedBenchmark.slug}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }, [benchmarks]);

  useEffect(() => {
    if (!benchmarkStartRequest) return;
    const requestedBenchmark = benchmarks.find((benchmark) => benchmark.slug === benchmarkStartRequest.slug);
    if (!requestedBenchmark) return;
    setSharedBenchmarkId(requestedBenchmark.id);
    setActiveStarterPath("benchmark");
    setSelectedBenchmarkId(requestedBenchmark.id);
    setSelectedActivity(requestedBenchmark.activity);
    window.setTimeout(() => {
      document.getElementById(`benchmark-${requestedBenchmark.slug}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }, [benchmarkStartRequest, benchmarks]);

  useEffect(() => setSelectedSkill(skillLevel), [skillLevel]);
  useEffect(() => setSelectedMode(playMode), [playMode]);
  useEffect(() => setSelectedFormat(matchFormat), [matchFormat]);
  useEffect(() => {
    if (queueScope === "Area" && !area) setQueueScope(city ? "City" : country ? "Country" : "Global");
    else if (queueScope === "City" && !city) setQueueScope(country ? "Country" : "Global");
    else if (queueScope === "Country" && !country) setQueueScope("Global");
  }, [area, city, country, queueScope]);

  useEffect(() => {
    if (benchmarks.length === 0) return;
    if (!benchmarks.some((benchmark) => benchmark.id === leaderboardBenchmarkId)) {
      setLeaderboardBenchmarkId(benchmarks[0].id);
    }
  }, [benchmarks, leaderboardBenchmarkId]);

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
      .select("id,benchmark_id,score,verification_status,leaderboard_visible,proof_type,proof_url,feed_visible,feed_caption,feed_published_at,review_note,reviewed_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!attemptResult.error) {
      setAttempts((attemptResult.data || []) as BenchmarkAttempt[]);
    } else if (attemptResult.error.message.includes("feed_visible")) {
      setLoadWarning("Run add-benchmark-spectator-feed.sql in Supabase to enable the verified video feed.");
    } else if (attemptResult.error.message.includes("leaderboard_visible")) {
      setLoadWarning("Run add-benchmark-leaderboards.sql in Supabase to enable public benchmark standings and proof review.");
    }
  }, [userId]);

  useEffect(() => {
    void loadStarterData();
  }, [loadStarterData]);

  useEffect(() => {
    let active = true;

    async function loadCityDiscoveryReadiness() {
      if (!supabase || !userId) {
        if (active) setCityDiscoveryReadiness(null);
        return;
      }

      const { data, error } = await supabase.rpc("get_my_talent7_city_discovery_readiness", {
        target_activity: selectedActivity || null
      });

      if (!active) return;
      if (error) {
        setCityDiscoveryReadiness(null);
        return;
      }

      setCityDiscoveryReadiness(((data || [])[0] || null) as CityDiscoveryReadiness | null);
    }

    void loadCityDiscoveryReadiness();
    return () => { active = false; };
  }, [city, country, selectedActivity, userId]);

  const loadBenchmarkLeaderboard = useCallback(async () => {
    if (!supabase || !leaderboardBenchmarkId || leaderboardBenchmarkId.startsWith("preview-")) {
      setLeaderboardEntries([]);
      return;
    }

    setLeaderboardLoading(true);
    setLeaderboardError("");
    const { data, error } = await supabase.rpc("get_talent7_benchmark_leaderboard", {
      target_benchmark_id: leaderboardBenchmarkId,
      target_board: leaderboardBoard,
      target_period: leaderboardPeriod,
      result_limit: 50
    });
    if (error) {
      setLeaderboardEntries([]);
      setLeaderboardError(
        error.message.includes("get_talent7_benchmark_leaderboard")
          ? "Run add-benchmark-leaderboards.sql in Supabase to activate these standings."
          : error.message
      );
    } else {
      setLeaderboardEntries((data || []) as BenchmarkLeaderboardEntry[]);
    }
    setLeaderboardLoading(false);
  }, [leaderboardBenchmarkId, leaderboardBoard, leaderboardPeriod]);

  useEffect(() => {
    void loadBenchmarkLeaderboard();
  }, [loadBenchmarkLeaderboard]);

  const loadBenchmarkProofQueue = useCallback(async () => {
    if (!supabase || !isAdmin) {
      setProofQueue([]);
      return;
    }
    const { data, error } = await supabase.rpc("get_talent7_benchmark_proof_queue", { result_limit: 30 });
    if (!error) setProofQueue((data || []) as BenchmarkProofQueueItem[]);
  }, [isAdmin]);

  useEffect(() => {
    void loadBenchmarkProofQueue();
  }, [loadBenchmarkProofQueue]);

  const loadBenchmarkFeed = useCallback(async () => {
    if (!supabase) {
      setFeedEntries([]);
      return;
    }
    setFeedLoading(true);
    setFeedError("");
    const { data, error } = await supabase.rpc("get_talent7_benchmark_spectator_feed", {
      target_benchmark_id: feedBenchmarkId === "all" ? null : feedBenchmarkId,
      result_limit: 24,
      result_offset: 0
    });
    if (error) {
      setFeedEntries([]);
      setFeedError(
        error.message.includes("get_talent7_benchmark_spectator_feed")
          ? "Run add-benchmark-spectator-feed.sql in Supabase to activate the verified video feed."
          : error.message
      );
    } else {
      setFeedEntries((data || []) as BenchmarkFeedEntry[]);
    }
    setFeedLoading(false);
  }, [feedBenchmarkId]);

  useEffect(() => {
    void loadBenchmarkFeed();
  }, [loadBenchmarkFeed]);

  const personalBestAttempts = useMemo(() => {
    const best = new Map<string, BenchmarkAttempt>();
    for (const attempt of attempts) {
      const benchmark = benchmarks.find((item) => item.id === attempt.benchmark_id);
      const current = best.get(attempt.benchmark_id);
      if (!current) best.set(attempt.benchmark_id, attempt);
      else if (benchmark?.score_direction === "Lower" && Number(attempt.score) < Number(current.score)) best.set(attempt.benchmark_id, attempt);
      else if (benchmark?.score_direction !== "Lower" && Number(attempt.score) > Number(current.score)) best.set(attempt.benchmark_id, attempt);
    }
    return best;
  }, [attempts, benchmarks]);

  const personalBests = useMemo(() => {
    return new Map(Array.from(personalBestAttempts, ([benchmarkId, attempt]) => [benchmarkId, Number(attempt.score)]));
  }, [personalBestAttempts]);

  const myRequest = queue.find((item) => item.is_mine && ["Waiting", "Matched"].includes(item.request_status));
  const queueLocation = queueScope === "Area" ? area : queueScope === "City" ? city : queueScope === "Country" ? country : "Global";
  const waitingRequests = queue
    .filter((item) => item.request_status === "Waiting" && !item.is_mine)
    .filter((item) => matchScopeRank[item.proximity_level || "Global"] >= matchScopeRank[queueScope])
    .slice(0, 8);
  const selectedLeaderboardBenchmark = benchmarks.find((benchmark) => benchmark.id === leaderboardBenchmarkId) || benchmarks[0];

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
    const proofFile = form.get("proof_file");
    if (!Number.isFinite(score) || score <= 0) {
      setMessage("Enter a positive result before saving this attempt.");
      return;
    }
    if (!(proofFile instanceof File) || proofFile.size <= 0) {
      setMessage("Record or upload your benchmark video before submitting the result.");
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
          verification_status: "Self reported",
          leaderboard_visible: false,
          proof_type: null,
          proof_url: null,
          feed_visible: false,
          feed_caption: null,
          feed_published_at: null,
          review_note: null,
          reviewed_at: null,
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
        if (!data) throw new Error("The benchmark attempt was saved without a usable response.");
        const savedAttempt = data as BenchmarkAttempt;
        setAttempts((items) => [savedAttempt, ...items]);
        setMessage("Personal best saved. Uploading your benchmark video…");

        const proofUrl = await uploadBenchmarkProofVideo(proofFile, savedAttempt.id);
        const proofResult = await supabase.rpc("submit_talent7_benchmark_proof", {
          target_attempt_id: savedAttempt.id,
          target_proof_type: "Video",
          target_proof_url: proofUrl
        });
        if (proofResult.error) throw proofResult.error;
        if (!proofResult.data) throw new Error("The video uploaded, but Talent7 could not attach it to the benchmark.");
        const submittedAttempt = proofResult.data as BenchmarkAttempt;
        setAttempts((items) => items.map((item) => (
          item.benchmark_id === savedAttempt.benchmark_id
            ? item.id === submittedAttempt.id
              ? submittedAttempt
              : { ...item, leaderboard_visible: false }
            : item
        )));
        setMessage(`Benchmark recorded: ${formatResult(score, benchmark.unit)}. Your video is awaiting private verification, and the Talent7 share-video tool is ready below.`);
        void loadBenchmarkLeaderboard();
        void loadBenchmarkProofQueue();
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
        target_region: queueLocation || region || "Global",
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

  async function setBenchmarkLeaderboardVisibility(attempt: BenchmarkAttempt, visible: boolean) {
    if (!supabase || !userId) {
      setMessage("Log in before joining a benchmark leaderboard.");
      return;
    }
    if (attempt.benchmark_id.startsWith("preview-")) {
      setMessage("Connect Supabase before publishing preview benchmark attempts.");
      return;
    }

    setBusyAction(`leaderboard-${attempt.id}`);
    setMessage("");
    const { data, error } = await supabase.rpc("set_talent7_benchmark_leaderboard_visibility", {
      target_attempt_id: attempt.id,
      target_visible: visible
    });
    if (error) {
      setMessage(readableError(error, "The benchmark leaderboard setting could not be changed."));
    } else if (data) {
      const updatedAttempt = data as BenchmarkAttempt;
      setAttempts((items) => items.map((item) => (
        item.benchmark_id === attempt.benchmark_id
          ? item.id === updatedAttempt.id
            ? updatedAttempt
            : { ...item, leaderboard_visible: false }
          : item
      )));
      setMessage(visible ? "Your personal best is now on the Community leaderboard." : "Your benchmark attempts are now private.");
      void loadBenchmarkLeaderboard();
    }
    setBusyAction("");
  }

  async function publishBenchmarkToFeed(event: FormEvent<HTMLFormElement>, attempt: BenchmarkAttempt) {
    event.preventDefault();
    if (!supabase || !userId) {
      setMessage("Log in before publishing a benchmark video.");
      return;
    }
    const caption = String(new FormData(event.currentTarget).get("feed_caption") || "").trim();
    setBusyAction(`feed-${attempt.id}`);
    setMessage("");
    const { data, error } = await supabase.rpc("set_talent7_benchmark_feed_visibility", {
      target_attempt_id: attempt.id,
      target_visible: true,
      target_caption: caption || null
    });
    if (error) {
      setMessage(readableError(error, "The benchmark video could not be published."));
    } else if (data) {
      const updatedAttempt = data as BenchmarkAttempt;
      setAttempts((items) => items.map((item) => item.id === updatedAttempt.id ? updatedAttempt : item));
      setMessage("Your verified video is now in the spectator feed. Reactions stay open for 24 hours and never affect your score.");
      void loadBenchmarkFeed();
    }
    setBusyAction("");
  }

  async function hideBenchmarkFromFeed(attempt: BenchmarkAttempt) {
    if (!supabase || !userId) return;
    setBusyAction(`feed-${attempt.id}`);
    setMessage("");
    const { data, error } = await supabase.rpc("set_talent7_benchmark_feed_visibility", {
      target_attempt_id: attempt.id,
      target_visible: false,
      target_caption: null
    });
    if (error) {
      setMessage(readableError(error, "The benchmark video could not be removed from the feed."));
    } else if (data) {
      const updatedAttempt = data as BenchmarkAttempt;
      setAttempts((items) => items.map((item) => item.id === updatedAttempt.id ? updatedAttempt : item));
      setMessage("Your benchmark video is no longer public in the spectator feed.");
      void loadBenchmarkFeed();
    }
    setBusyAction("");
  }

  async function reactToBenchmarkFeed(entry: BenchmarkFeedEntry, reaction: "Respect" | "Strong form" | "Motivating") {
    if (!supabase || !userId) {
      setMessage("Log in before reacting to a benchmark video.");
      return;
    }
    setBusyAction(`reaction-${entry.attempt_id}`);
    setMessage("");
    const { error } = await supabase.rpc("react_to_talent7_benchmark_feed", {
      target_attempt_id: entry.attempt_id,
      target_reaction: entry.viewer_reaction === reaction ? "Remove" : reaction
    });
    if (error) {
      setMessage(readableError(error, "Your reaction could not be saved."));
    } else {
      await loadBenchmarkFeed();
    }
    setBusyAction("");
  }

  function shareFeedEntry(entry: BenchmarkFeedEntry) {
    const benchmark = benchmarks.find((item) => item.id === entry.benchmark_id);
    openTalent7Share({
      title: `${entry.display_name}'s verified benchmark`,
      text: `${entry.display_name} recorded ${formatResult(Number(entry.score), entry.unit)} in ${entry.benchmark_title}. Watch the verified Talent7 benchmark and try to beat it.`,
      url: `${window.location.origin}/?benchmark=${encodeURIComponent(benchmark?.slug || "") }#challenge-now`,
      onShare: () => setMessage("Verified benchmark shared.")
    });
  }

  async function uploadBenchmarkProofVideo(file: File, attemptId: string) {
    if (!supabase || !userId) throw new Error("Log in again before uploading benchmark footage.");
    const contentType = file.type.toLowerCase() || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
    if (!["video/mp4", "video/quicktime"].includes(contentType)) {
      throw new Error("Use an MP4 or MOV video for benchmark proof.");
    }
    if (file.size <= 0 || file.size > 50 * 1024 * 1024) {
      throw new Error("Benchmark videos must be 50 MB or smaller.");
    }

    let { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) {
      const refreshed = await supabase.auth.refreshSession();
      sessionData = refreshed.data;
    }
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Your upload session expired. Sign in again before uploading footage.");

    const prepareResponse = await fetch("/api/media", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        kind: "challenge-proofs",
        folder: `benchmark-${attemptId}`,
        fileName: cleanUploadFileName(file.name),
        contentType,
        size: file.size
      })
    });

    if (prepareResponse.ok) {
      const prepared = (await prepareResponse.json()) as { uploadUrl?: string; publicUrl?: string };
      if (!prepared.uploadUrl || !prepared.publicUrl) throw new Error("The media service returned an incomplete upload address.");
      const uploadResponse = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file
      });
      if (!uploadResponse.ok) throw new Error(`Video upload failed with status ${uploadResponse.status}.`);
      return prepared.publicUrl;
    }

    if (prepareResponse.status !== 503) {
      const result = (await prepareResponse.json().catch(() => null)) as { error?: string } | null;
      throw new Error(result?.error || "Talent7 could not prepare the video upload.");
    }

    const storagePath = `${userId}/benchmark-proofs/${attemptId}/${crypto.randomUUID()}-${cleanUploadFileName(file.name)}`;
    const { error } = await supabase.storage.from("challenge-proofs").upload(storagePath, file, {
      cacheControl: "3600",
      contentType,
      upsert: false
    });
    if (error) throw error;
    return supabase.storage.from("challenge-proofs").getPublicUrl(storagePath).data.publicUrl;
  }

  async function submitBenchmarkProof(event: FormEvent<HTMLFormElement>, attempt: BenchmarkAttempt) {
    event.preventDefault();
    if (!supabase || !userId) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const proofFile = form.get("proof_file");
    let proofType = String(form.get("proof_type") || "Video");
    let proofUrl = String(form.get("proof_url") || "").trim();
    setBusyAction(`proof-${attempt.id}`);
    setMessage("");
    try {
      if (proofFile instanceof File && proofFile.size > 0) {
        proofType = "Video";
        setMessage("Uploading your original benchmark video…");
        proofUrl = await uploadBenchmarkProofVideo(proofFile, attempt.id);
      }
      if (!proofUrl) throw new Error("Upload a video or enter an HTTPS proof link.");

      const { data, error } = await supabase.rpc("submit_talent7_benchmark_proof", {
        target_attempt_id: attempt.id,
        target_proof_type: proofType,
        target_proof_url: proofUrl
      });
      if (error) throw error;
      if (data) {
        const updatedAttempt = data as BenchmarkAttempt;
        setAttempts((items) => items.map((item) => (
          item.benchmark_id === attempt.benchmark_id
            ? item.id === updatedAttempt.id
              ? updatedAttempt
              : { ...item, leaderboard_visible: false }
            : item
        )));
        setMessage(proofFile instanceof File && proofFile.size > 0
          ? "Video uploaded for review. You can now create a Talent7-branded share copy below."
          : "Proof submitted privately for review. Your link is not shown on the public leaderboard.");
        formElement.reset();
        void loadBenchmarkLeaderboard();
        void loadBenchmarkProofQueue();
      }
    } catch (error) {
      setMessage(readableError(error, "The proof could not be submitted."));
    } finally {
      setBusyAction("");
    }
  }

  async function reviewBenchmarkProof(attemptId: string, decision: "Verified" | "Rejected") {
    if (!supabase || !isAdmin) return;
    setBusyAction(`review-${attemptId}`);
    setMessage("");
    const { error } = await supabase.rpc("review_talent7_benchmark_attempt", {
      target_attempt_id: attemptId,
      target_decision: decision,
      target_review_note: decision === "Rejected" ? "The submitted evidence did not verify the recorded benchmark score." : null
    });
    if (error) {
      setMessage(readableError(error, "The benchmark proof decision could not be saved."));
    } else {
      setMessage(decision === "Verified" ? "Benchmark proof verified." : "Benchmark proof rejected and removed from public standings.");
      await Promise.all([loadBenchmarkProofQueue(), loadStarterData(), loadBenchmarkLeaderboard()]);
    }
    setBusyAction("");
  }

  return (
    <section className="section challengeStarterSection" id="challenge-now">
      <div className="sectionHeader challengeStarterHeader">
        <div>
          <p className="eyebrow">Challenge now</p>
          <h2>Choose how you want to start</h2>
          <p>Pick one clear next step. Rankings, verified videos, and other discovery tools stay available under Explore.</p>
        </div>
        <div className="challengeStarterPromise">
          <strong>Always available</strong>
          <span>Solo now · rival later</span>
        </div>
      </div>

      {loadWarning && <aside className="challengeStarterWarning">{loadWarning}</aside>}
      {message && <p className="challengeStarterMessage" role="status">{message}</p>}

      <div className="challengeStarterPathGrid" aria-label="Choose how to start">
        <button
          aria-pressed={activeStarterPath === "benchmark"}
          className={activeStarterPath === "benchmark" ? "active" : ""}
          onClick={() => setActiveStarterPath(activeStarterPath === "benchmark" ? null : "benchmark")}
          type="button"
        >
          <span>1</span><strong>Set a benchmark</strong><small>Record a personal best now. No opponent needed.</small>
        </button>
        <button
          aria-pressed={activeStarterPath === "match"}
          className={activeStarterPath === "match" ? "active" : ""}
          onClick={() => setActiveStarterPath(activeStarterPath === "match" ? null : "match")}
          type="button"
        >
          <span>2</span><strong>Find a rival</strong><small>Match automatically, publish openly, or invite someone.</small>
        </button>
        <button
          onClick={() => onStartChallenge({
            activity: selectedActivity,
            title: selectedActivity,
            rules: `Agree the exact ${selectedActivity} rules before starting. Complete the challenge fairly and upload proof after the result.`,
            competitionMode: "Casual"
          })}
          type="button"
        >
          <span>3</span><strong>Quick create</strong><small>Open a ready-to-publish room with safe defaults already selected.</small>
        </button>
      </div>

      <div className="challengeStarterExploreToggle">
        <a className="secondary" href="#rooms">Browse available rooms</a>
        <button aria-expanded={exploreOpen} className="secondary" onClick={() => setExploreOpen(!exploreOpen)} type="button">
          {exploreOpen ? "Hide rankings and videos" : "Explore rankings and verified videos"}
        </button>
      </div>

      <div className="challengeStarterLayout" hidden={!activeStarterPath}>
        <div className="challengeBenchmarkColumn" hidden={activeStarterPath !== "benchmark"}>
          <div className="challengeStarterSubhead">
            <div>
              <span>Official starters</span>
              <h3>Talent7 benchmarks</h3>
            </div>
            <small>Attempts stay private unless you join a leaderboard. They award no Rise Points or prizes.</small>
          </div>
          <div className="challengeBenchmarkGrid">
            {benchmarks.map((benchmark) => {
              const personalBest = personalBests.get(benchmark.id);
              const personalBestAttempt = personalBestAttempts.get(benchmark.id);
              const publishedAttempt = attempts.find((attempt) => attempt.benchmark_id === benchmark.id && attempt.leaderboard_visible);
              const visibilityAttempt = publishedAttempt || personalBestAttempt;
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
                      <div className="benchmarkVideoRequirement">
                        <strong>1. Record or upload your performance</strong>
                        <small>Keep your full movement visible. This creates a solo benchmark—not a challenge room.</small>
                      </div>
                      <label className="benchmarkVideoField">
                        Benchmark video
                        <input accept="video/mp4,video/quicktime" name="proof_file" required type="file" />
                        <small>On a phone, choose the camera to record now or select an existing MP4/MOV. Maximum 50 MB.</small>
                      </label>
                      <label>
                        2. {benchmark.metric_label}
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
                          {busyAction === `attempt-${benchmark.id}` ? "Saving and uploading…" : "Submit video benchmark"}
                        </button>
                        <button className="secondary" onClick={() => setSelectedBenchmarkId("")} type="button">Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <div className="challengeBenchmarkActions">
                      <button onClick={() => setSelectedBenchmarkId(benchmark.id)} type="button">Record benchmark</button>
                      <button className="benchmarkShareButton" onClick={() => shareBenchmark(benchmark, personalBest)} type="button">
                        {personalBest === undefined ? "Share benchmark" : "Share my best"}
                      </button>
                      {visibilityAttempt && (
                        <button
                          className="secondary"
                          disabled={busyAction === `leaderboard-${visibilityAttempt.id}`}
                          onClick={() => void setBenchmarkLeaderboardVisibility(visibilityAttempt, !publishedAttempt)}
                          type="button"
                        >
                          {busyAction === `leaderboard-${visibilityAttempt.id}`
                            ? "Updating…"
                            : publishedAttempt
                              ? "Leave leaderboard"
                              : "Join leaderboard"}
                        </button>
                      )}
                    </div>
                  )}
                  {personalBestAttempt && (
                    <div className="benchmarkAttemptPublication">
                      <span className={`benchmarkVerificationStatus ${personalBestAttempt.verification_status.toLowerCase().replace(" ", "-")}`}>
                        {personalBestAttempt.verification_status}
                      </span>
                      {publishedAttempt && (
                        <small>
                          {publishedAttempt.id === personalBestAttempt.id
                            ? "Visible on the Community board"
                            : `Older best visible: ${formatResult(Number(publishedAttempt.score), benchmark.unit)}`}
                        </small>
                      )}
                      {personalBestAttempt.verification_status === "Verified" ? (
                        <>
                          <strong>Approved for the Verified board</strong>
                          {personalBestAttempt.proof_type === "Video" && isTalent7UploadedVideo(personalBestAttempt.proof_url) && (
                            personalBestAttempt.feed_visible ? (
                              <div className="benchmarkFeedOwnerStatus">
                                <span>Public in the spectator feed</span>
                                <button
                                  className="secondary"
                                  disabled={busyAction === `feed-${personalBestAttempt.id}`}
                                  onClick={() => void hideBenchmarkFromFeed(personalBestAttempt)}
                                  type="button"
                                >
                                  {busyAction === `feed-${personalBestAttempt.id}` ? "Updating…" : "Remove from feed"}
                                </button>
                              </div>
                            ) : (
                              <form className="benchmarkFeedPublishForm" onSubmit={(event) => void publishBenchmarkToFeed(event, personalBestAttempt)}>
                                <label>
                                  Optional spectator caption
                                  <input maxLength={180} name="feed_caption" placeholder="What did this attempt mean to you?" />
                                </label>
                                <small>Your verified video becomes public by choice. Positive reactions remain open for 24 hours and never change your score.</small>
                                <button disabled={busyAction === `feed-${personalBestAttempt.id}`} type="submit">
                                  {busyAction === `feed-${personalBestAttempt.id}` ? "Publishing…" : "Publish verified video"}
                                </button>
                              </form>
                            )
                          )}
                        </>
                      ) : personalBestAttempt.verification_status === "Proof submitted" ? (
                        <strong>Proof is waiting for private review</strong>
                      ) : (
                        <details className="benchmarkProofSubmission">
                          <summary>{personalBestAttempt.verification_status === "Rejected" ? "Submit replacement proof" : "Submit proof for verification"}</summary>
                          {personalBestAttempt.review_note && <p>{personalBestAttempt.review_note}</p>}
                          <form onSubmit={(event) => void submitBenchmarkProof(event, personalBestAttempt)}>
                            <label>
                              Upload repetition video (recommended)
                              <input accept="video/mp4,video/quicktime" name="proof_file" type="file" />
                            </label>
                            <small>MP4 or MOV, up to 50 MB. Use a stable angle with your full movement visible.</small>
                            <span className="benchmarkProofOr">or use an existing link</span>
                            <label>
                              Proof type
                              <select defaultValue="Video" name="proof_type">
                                <option>Video</option>
                                <option>Image</option>
                                <option>Link</option>
                              </select>
                            </label>
                            <label>
                              Public or unlisted HTTPS link
                              <input name="proof_url" placeholder="https://…" type="url" />
                            </label>
                            <small>The link stays private during review. A verified Talent7-uploaded video becomes public only if you later choose Publish verified video.</small>
                            <button disabled={busyAction === `proof-${personalBestAttempt.id}`} type="submit">
                              {busyAction === `proof-${personalBestAttempt.id}` ? "Uploading and submitting…" : "Upload and submit proof"}
                            </button>
                          </form>
                        </details>
                      )}
                      {personalBestAttempt.proof_type === "Video" && isTalent7UploadedVideo(personalBestAttempt.proof_url) && (
                        <BrandedBenchmarkVideo
                          benchmarkTitle={benchmark.title}
                          challengerName={displayName || "Anonymous challenger"}
                          scoreLabel={formatResult(Number(personalBestAttempt.score), benchmark.unit)}
                          verificationStatus={personalBestAttempt.verification_status}
                          videoUrl={personalBestAttempt.proof_url || ""}
                        />
                      )}
                      <div className="benchmarkChallengeConversion">
                        <span>This benchmark remains a solo performance.</span>
                        <button
                          className="secondary"
                          onClick={() => onStartChallenge({
                            activity: benchmark.activity,
                            title: `${benchmark.title}: beat ${formatResult(Number(personalBestAttempt.score), benchmark.unit)}`,
                            rules: benchmark.rules,
                            competitionMode: "Casual"
                          })}
                          type="button"
                        >
                          Create challenge room from this result
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <aside className="challengeMatchmaker" hidden={activeStarterPath !== "match"}>
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
                <p>{myRequest.location_label || myRequest.region} · {myRequest.skill_level} · {myRequest.play_mode}</p>
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
                  Discovery range
                  <select onChange={(event) => setQueueScope(event.target.value as MatchDiscoveryScope)} value={queueScope}>
                    <option disabled={!area} value="Area">{area ? `Area · ${area}` : "Area · add in Account"}</option>
                    <option disabled={!city} value="City">{city ? `City · ${city}` : "City · add in Account"}</option>
                    <option disabled={!country} value="Country">{country ? `Country · ${country}` : "Country · add in Account"}</option>
                    <option value="Global">Global</option>
                  </select>
                </label>
              </div>
              {cityDiscoveryReadiness && (
                <div className={`cityDiscoveryReadiness${cityDiscoveryReadiness.pilot_ready ? " ready" : ""}`}>
                  <span aria-hidden="true">{cityDiscoveryReadiness.pilot_ready ? "✓" : "◎"}</span>
                  <div>
                    <strong>
                      {cityDiscoveryReadiness.pilot_ready
                        ? `${cityDiscoveryReadiness.city_label} is ready for a nearby pilot`
                        : cityDiscoveryReadiness.readiness_status === "Add city"
                          ? "Add your city to measure local readiness"
                          : `${cityDiscoveryReadiness.city_label} is still ${cityDiscoveryReadiness.readiness_status.toLowerCase()}`}
                    </strong>
                    <small>
                      {cityDiscoveryReadiness.readiness_status === "Add city"
                        ? "Talent7 will not request precise GPS while your city is missing."
                        : `${cityDiscoveryReadiness.active_member_band} active ${selectedActivity} match seekers · nearby distance discovery stays off until the privacy threshold of ${cityDiscoveryReadiness.readiness_threshold} is reached.`}
                    </small>
                  </div>
                </div>
              )}
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

      <section className="benchmarkLeaderboard" aria-labelledby="benchmark-leaderboard-title" hidden={!exploreOpen}>
        <header>
          <div>
            <span>Benchmark rankings</span>
            <h3 id="benchmark-leaderboard-title">Set the score everyone wants to beat</h3>
            <p>Each person appears once with their best opted-in result. Verified proof links stay private.</p>
          </div>
          <button disabled={leaderboardLoading} onClick={() => void loadBenchmarkLeaderboard()} type="button">
            {leaderboardLoading ? "Refreshing…" : "Refresh"}
          </button>
        </header>

        <div className="benchmarkLeaderboardControls">
          <label>
            Benchmark
            <select onChange={(event) => setLeaderboardBenchmarkId(event.target.value)} value={leaderboardBenchmarkId}>
              {benchmarks.map((benchmark) => <option key={benchmark.id} value={benchmark.id}>{benchmark.title}</option>)}
            </select>
          </label>
          <div aria-label="Leaderboard verification" className="benchmarkBoardTabs" role="group">
            <button className={leaderboardBoard === "Community" ? "active" : ""} onClick={() => setLeaderboardBoard("Community")} type="button">Community</button>
            <button className={leaderboardBoard === "Verified" ? "active" : ""} onClick={() => setLeaderboardBoard("Verified")} type="button">Verified</button>
          </div>
          <label>
            Period
            <select onChange={(event) => setLeaderboardPeriod(event.target.value as typeof leaderboardPeriod)} value={leaderboardPeriod}>
              <option>Daily</option>
              <option>Weekly</option>
              <option>Season</option>
              <option>All time</option>
            </select>
          </label>
        </div>

        <div className="benchmarkBoardMeaning">
          <strong>{leaderboardBoard === "Verified" ? "Verified board" : "Community board"}</strong>
          <span>{leaderboardBoard === "Verified" ? "Only scores approved from privately submitted proof." : "Opt-in self-reported and verified scores, clearly labelled."}</span>
        </div>

        {leaderboardError ? (
          <p className="benchmarkLeaderboardNotice">{leaderboardError}</p>
        ) : leaderboardLoading ? (
          <p className="benchmarkLeaderboardNotice">Loading benchmark standings…</p>
        ) : leaderboardEntries.length > 0 && selectedLeaderboardBenchmark ? (
          <div className="benchmarkLeaderboardRows">
            {leaderboardEntries.map((entry) => (
              <article className={entry.user_id === userId ? "mine" : ""} key={entry.attempt_id}>
                <b>#{entry.rank_position}</b>
                <span
                  className={`benchmarkLeaderboardAvatar${entry.avatar_url ? " hasImage" : ""}`}
                  style={entry.avatar_url ? { backgroundImage: `url(${entry.avatar_url})` } : undefined}
                  aria-hidden="true"
                >
                  {!entry.avatar_url && entry.display_name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{entry.display_name}{entry.user_id === userId ? " · You" : ""}</strong>
                  <small>@{entry.username}{entry.region ? ` · ${entry.region}` : ""}</small>
                </div>
                <span className={`benchmarkVerificationStatus ${entry.verification_status.toLowerCase().replace(" ", "-")}`}>
                  {entry.verification_status === "Verified" ? "✓ Verified" : entry.verification_status}
                </span>
                <b>{formatResult(Number(entry.score), selectedLeaderboardBenchmark.unit)}</b>
              </article>
            ))}
          </div>
        ) : (
          <div className="challengeStarterEmpty">
            <strong>No scores are on this board yet.</strong>
            <p>Record a benchmark, choose Join leaderboard, and become the first score people try to beat.</p>
          </div>
        )}
      </section>

      <section className="benchmarkSpectatorFeed" aria-labelledby="benchmark-feed-title" hidden={!exploreOpen}>
        <header>
          <div>
            <span>Watch and encourage</span>
            <h3 id="benchmark-feed-title">Verified benchmark feed</h3>
            <p>Real, owner-published benchmark videos. Reactions are encouragement only and never decide a score.</p>
          </div>
          <div>
            <label>
              Show
              <select onChange={(event) => setFeedBenchmarkId(event.target.value)} value={feedBenchmarkId}>
                <option value="all">All benchmarks</option>
                {benchmarks.filter((benchmark) => !benchmark.id.startsWith("preview-")).map((benchmark) => (
                  <option key={benchmark.id} value={benchmark.id}>{benchmark.title}</option>
                ))}
              </select>
            </label>
            <button disabled={feedLoading} onClick={() => void loadBenchmarkFeed()} type="button">
              {feedLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        {feedError ? (
          <p className="benchmarkLeaderboardNotice">{feedError}</p>
        ) : feedLoading ? (
          <p className="benchmarkLeaderboardNotice">Loading verified benchmark videos…</p>
        ) : feedEntries.length > 0 ? (
          <div className="benchmarkSpectatorGrid">
            {feedEntries.map((entry) => {
              const reactionOptions = [
                { label: "Respect" as const, icon: "⚡", count: Number(entry.respect_count) },
                { label: "Strong form" as const, icon: "✓", count: Number(entry.strong_form_count) },
                { label: "Motivating" as const, icon: "🔥", count: Number(entry.motivating_count) }
              ];
              return (
                <article key={entry.attempt_id}>
                  <div className="benchmarkSpectatorVideo">
                    <video controls playsInline preload="metadata" src={entry.proof_url} />
                    <span>✓ Verified</span>
                  </div>
                  <div className="benchmarkSpectatorIdentity">
                    <span
                      aria-hidden="true"
                      className={entry.avatar_url ? "hasImage" : ""}
                      style={entry.avatar_url ? { backgroundImage: `url(${entry.avatar_url})` } : undefined}
                    >
                      {!entry.avatar_url && entry.display_name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <strong>{entry.display_name}</strong>
                      <small>@{entry.username}{entry.region ? ` · ${entry.region}` : ""}</small>
                    </div>
                    <b>{formatResult(Number(entry.score), entry.unit)}</b>
                  </div>
                  <div className="benchmarkSpectatorCopy">
                    <strong>{entry.benchmark_title}</strong>
                    {entry.feed_caption && <p>{entry.feed_caption}</p>}
                    <small>{formatReactionWindow(entry.reaction_closes_at)}</small>
                  </div>
                  <div className="benchmarkSpectatorReactions" aria-label="Encourage this benchmark">
                    {reactionOptions.map((reaction) => (
                      <button
                        aria-pressed={entry.viewer_reaction === reaction.label}
                        className={entry.viewer_reaction === reaction.label ? "active" : ""}
                        disabled={!entry.reactions_open || busyAction === `reaction-${entry.attempt_id}`}
                        key={reaction.label}
                        onClick={() => void reactToBenchmarkFeed(entry, reaction.label)}
                        type="button"
                      >
                        <span aria-hidden="true">{reaction.icon}</span>
                        <small>{reaction.label}</small>
                        <b>{reaction.count}</b>
                      </button>
                    ))}
                  </div>
                  <button className="benchmarkSpectatorShare" onClick={() => shareFeedEntry(entry)} type="button">Share benchmark</button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="challengeStarterEmpty">
            <strong>No verified videos are public yet.</strong>
            <p>After Talent7 verifies an uploaded benchmark video, its owner can choose to publish it here.</p>
          </div>
        )}
      </section>

      {isAdmin && proofQueue.length > 0 && (
        <section className="benchmarkProofReview" aria-label="Benchmark proof review">
          <header><div><span>Admin review</span><h3>Benchmark proof queue</h3></div><strong>{proofQueue.length} pending</strong></header>
          <div>
            {proofQueue.map((item) => (
              <article key={item.attempt_id}>
                <div><strong>{item.display_name} · {formatResult(Number(item.score), item.unit)}</strong><span>{item.benchmark_title} · @{item.username}</span></div>
                <a href={item.proof_url} rel="noreferrer" target="_blank">Open {item.proof_type.toLowerCase()} proof ↗</a>
                <div>
                  <button disabled={busyAction === `review-${item.attempt_id}`} onClick={() => void reviewBenchmarkProof(item.attempt_id, "Verified")} type="button">Verify</button>
                  <button className="secondary" disabled={busyAction === `review-${item.attempt_id}`} onClick={() => void reviewBenchmarkProof(item.attempt_id, "Rejected")} type="button">Reject</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="openMatchBoard" hidden={activeStarterPath !== "match"}>
        <div className="challengeStarterSubhead">
          <div>
            <span>Live demand</span>
            <h3>People waiting for a challenger</h3>
          </div>
          <small>Only challenge preferences are shown. Account and contact details remain private.</small>
        </div>
        <div aria-label="Match discovery range" className="openMatchScopeTabs" role="group">
          {(["Area", "City", "Country", "Global"] as const).map((scope) => {
            const unavailable = scope === "Area" ? !area : scope === "City" ? !city : scope === "Country" ? !country : false;
            return (
              <button
                aria-pressed={queueScope === scope}
                className={queueScope === scope ? "active" : ""}
                disabled={unavailable}
                key={scope}
                onClick={() => setQueueScope(scope)}
                type="button"
              >
                {scope}
              </button>
            );
          })}
          <small>No GPS · locations come from Account settings</small>
        </div>
        {waitingRequests.length > 0 ? (
          <div className="openMatchBoardGrid">
            {waitingRequests.map((request) => (
              <article key={request.request_id}>
                <span>{request.activity}</span>
                <h4>{request.display_name}</h4>
                <p>{request.location_label || request.region} · {request.skill_level} · {request.play_mode} · {request.match_format}</p>
                {request.note && <small>{request.note}</small>}
              </article>
            ))}
          </div>
        ) : (
          <div className="challengeStarterEmpty">
            <strong>No requests are waiting in this {queueScope.toLowerCase()} range.</strong>
            <p>Try a wider range, complete a benchmark, publish the first open challenge, or invite a rival directly.</p>
          </div>
        )}
      </div>
    </section>
  );
}
