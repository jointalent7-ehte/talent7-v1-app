"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { trackGrowthEvent } from "../lib/growth-analytics";

type Achievement = {
  id: string;
  achievement_key: string;
  title: string;
  detail: string;
  achieved_at: string;
};

type LeagueEntry = {
  id: string;
  user_id: string;
  completed_count: number;
  proof_count: number;
  vote_count: number;
  score: number;
  profiles?: { display_name?: string | null } | null;
};

type League = {
  id: string;
  week_start: string;
  activity: string;
  title: string;
  status: "Open" | "Closed";
  weekly_league_entries?: LeagueEntry[];
};

type Talent7Season = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
};

type Talent7Rank = {
  xp: number;
  rank_points: number;
  tier: string;
  completed_count: number;
  wins: number;
  losses: number;
};

type ActivityRank = Talent7Rank & {
  activity_key: string;
  activity: string;
  current_streak: number;
  best_streak: number;
};

type Trophy = {
  id: string;
  title: string;
  detail: string;
  rarity: "Common" | "Rare" | "Epic" | "Legendary";
  icon_key: string;
  earned_at: string;
};

type RewardEvent = {
  id: string;
  activity: string;
  competition_mode: "Casual" | "Ranked";
  won: boolean;
  proof_bonus: boolean;
  xp_delta: number;
  rank_points_delta: number;
  tier_before: string;
  tier_after: string;
  created_at: string;
};

type LocalLeaderboardScope = "Area" | "City" | "Country" | "Global";

type LocalLeaderboardEntry = {
  rank_position: number;
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  main_interest: string;
  location_label: string;
  rank_points: number;
  xp: number;
  tier: string;
  wins: number;
  completed_count: number;
};

const talent7TierSteps = [
  { name: "Rookie", points: 0 },
  { name: "Rising Star", points: 100 },
  { name: "Contender", points: 250 },
  { name: "Elite", points: 500 },
  { name: "Champion", points: 850 },
  { name: "Legend", points: 1300 },
  { name: "Talent7 Icon", points: 2000 }
];

function tierProgress(points: number) {
  const currentIndex = Math.max(0, talent7TierSteps.findLastIndex((step) => points >= step.points));
  const current = talent7TierSteps[currentIndex];
  const next = talent7TierSteps[currentIndex + 1] || null;
  const percent = next
    ? Math.min(100, Math.max(0, ((points - current.points) / (next.points - current.points)) * 100))
    : 100;
  return { current, next, percent };
}

function LocalLeaderboardAvatar({ entry }: { entry: LocalLeaderboardEntry }) {
  if (!entry.avatar_url) return <>{entry.display_name.trim().charAt(0).toUpperCase() || "7"}</>;

  // Member-selected HTTPS media has dynamic hosts, so this cannot use a fixed Next Image host allowlist.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" src={entry.avatar_url} />;
}

export default function GrowthHub({
  area,
  city,
  country,
  userId,
  displayName,
  localLeaderboardVisible,
  mainInterest,
  readyNowUntil,
  onReadyNowChange
}: {
  area: string;
  city: string;
  country: string;
  userId: string;
  displayName: string;
  localLeaderboardVisible: boolean;
  mainInterest: string;
  readyNowUntil?: string | null;
  onReadyNowChange: (value: string | null) => void;
}) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [talent7Season, setTalent7Season] = useState<Talent7Season | null>(null);
  const [talent7Rank, setTalent7Rank] = useState<Talent7Rank | null>(null);
  const [activityRanks, setActivityRanks] = useState<ActivityRank[]>([]);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [rewardEvents, setRewardEvents] = useState<RewardEvent[]>([]);
  const [localLeaderboard, setLocalLeaderboard] = useState<LocalLeaderboardEntry[]>([]);
  const [localLeaderboardScope, setLocalLeaderboardScope] = useState<LocalLeaderboardScope>(
    area ? "Area" : city ? "City" : country ? "Country" : "Global"
  );
  const [localLeaderboardActivity, setLocalLeaderboardActivity] = useState<"Overall" | "My activity">("Overall");
  const [localLeaderboardLoading, setLocalLeaderboardLoading] = useState(false);
  const [localLeaderboardError, setLocalLeaderboardError] = useState("");
  const [busyAction, setBusyAction] = useState<"ready" | "league" | "refresh" | null>(null);
  const [message, setMessage] = useState("");
  const [readyClock, setReadyClock] = useState(0);
  const readyNow = Boolean(readyNowUntil && new Date(readyNowUntil).getTime() > readyClock);

  useEffect(() => {
    const updateClock = () => setReadyClock(new Date().getTime());
    updateClock();
    const interval = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const loadGrowth = useCallback(async () => {
    if (!supabase) return;
    await Promise.all([
      supabase.rpc("refresh_my_achievements"),
      supabase.rpc("refresh_my_weekly_league_scores"),
      supabase.rpc("refresh_my_talent7_league")
    ]);
    const { data: seasonRow } = await supabase
      .from("talent7_seasons")
      .select("id,name,starts_at,ends_at")
      .eq("status", "Active")
      .maybeSingle();
    const currentSeason = (seasonRow || null) as Talent7Season | null;
    const [
      { data: achievementRows },
      { data: leagueRows },
      { data: rankRow },
      { data: activityRows },
      { data: trophyRows },
      { data: rewardRows }
    ] = await Promise.all([
      supabase
        .from("user_achievements")
        .select("id,achievement_key,title,detail,achieved_at")
        .eq("user_id", userId)
        .order("achieved_at", { ascending: false }),
      supabase
        .from("weekly_leagues")
        .select("id,week_start,activity,title,status,weekly_league_entries(id,user_id,completed_count,proof_count,vote_count,score)")
        .gte("week_start", new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10))
        .order("week_start", { ascending: false }),
      currentSeason
        ? supabase
            .from("talent7_rank_profiles")
            .select("xp,rank_points,tier,completed_count,wins,losses")
            .eq("season_id", currentSeason.id)
            .eq("user_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      currentSeason
        ? supabase
            .from("talent7_activity_ranks")
            .select("activity_key,activity,xp,rank_points,tier,completed_count,wins,losses,current_streak,best_streak")
            .eq("season_id", currentSeason.id)
            .eq("user_id", userId)
            .order("rank_points", { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase
        .from("talent7_trophies")
        .select("id,title,detail,rarity,icon_key,earned_at")
        .eq("user_id", userId)
        .order("earned_at", { ascending: false })
        .limit(12),
      supabase
        .from("talent7_reward_events")
        .select("id,activity,competition_mode,won,proof_bonus,xp_delta,rank_points_delta,tier_before,tier_after,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5)
    ]);
    setTalent7Season(currentSeason);
    setTalent7Rank((rankRow || null) as Talent7Rank | null);
    setActivityRanks((activityRows || []) as ActivityRank[]);
    setTrophies((trophyRows || []) as Trophy[]);
    setRewardEvents((rewardRows || []) as RewardEvent[]);
    setAchievements((achievementRows || []) as Achievement[]);
    setLeagues(((leagueRows || []) as League[]).map((league) => ({
      ...league,
      weekly_league_entries: [...(league.weekly_league_entries || [])].sort((a, b) => b.score - a.score)
    })));
  }, [userId]);

  useEffect(() => {
    void loadGrowth();
  }, [loadGrowth]);

  const loadLocalLeaderboard = useCallback(async () => {
    if (!supabase) return;
    const locationByScope: Record<LocalLeaderboardScope, string> = { Area: area, City: city, Country: country, Global: "" };
    const targetLocation = locationByScope[localLeaderboardScope];

    if (localLeaderboardScope !== "Global" && !targetLocation) {
      setLocalLeaderboard([]);
      setLocalLeaderboardError(`Add your ${localLeaderboardScope.toLowerCase()} in Account settings to open this board.`);
      return;
    }

    setLocalLeaderboardLoading(true);
    setLocalLeaderboardError("");
    const { data, error } = await supabase.rpc("get_talent7_local_leaderboard", {
      target_scope: localLeaderboardScope,
      target_location: targetLocation || null,
      target_activity: localLeaderboardActivity === "My activity" ? mainInterest : null,
      result_limit: 20
    });

    if (error) {
      setLocalLeaderboard([]);
      setLocalLeaderboardError(
        error.message.includes("get_talent7_local_leaderboard")
          ? "Local leaderboards are waiting for the latest Supabase migration."
          : error.message
      );
    } else {
      setLocalLeaderboard((data || []) as LocalLeaderboardEntry[]);
    }
    setLocalLeaderboardLoading(false);
  }, [area, city, country, localLeaderboardActivity, localLeaderboardScope, mainInterest]);

  useEffect(() => {
    void loadLocalLeaderboard();
  }, [loadLocalLeaderboard]);

  async function setReady(minutes: number) {
    if (!supabase) return;
    setBusyAction("ready");
    const { data, error } = await supabase.rpc("set_my_ready_now", { target_minutes: minutes });
    if (error) {
      setMessage(error.message);
    } else {
      const value = typeof data === "string" ? data : null;
      onReadyNowChange(value);
      setMessage(value ? "You are visible as Ready Now for the next hour." : "Ready Now ended.");
    }
    setBusyAction(null);
  }

  async function joinLeague() {
    if (!supabase || !mainInterest) return;
    setBusyAction("league");
    const { data, error } = await supabase.rpc("join_weekly_league", { target_activity: mainInterest });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage(`Joined this week's ${mainInterest} league.`);
      void trackGrowthEvent("league_joined", { resourceType: "weekly_league", resourceToken: String(data || "") });
      await loadGrowth();
    }
    setBusyAction(null);
  }

  async function refreshProgress() {
    setBusyAction("refresh");
    await Promise.all([loadGrowth(), loadLocalLeaderboard()]);
    setMessage("Talent7 rank, trophies, achievements, and weekly scores refreshed.");
    setBusyAction(null);
  }

  const joinedLeague = useMemo(
    () => leagues.find((league) => league.weekly_league_entries?.some((entry) => entry.user_id === userId)),
    [leagues, userId]
  );
  const standings = joinedLeague?.weekly_league_entries || [];
  const rankProgress = tierProgress(talent7Rank?.rank_points || 0);
  const latestReward = rewardEvents[0] || null;
  const winRate = talent7Rank?.completed_count
    ? Math.round((talent7Rank.wins / talent7Rank.completed_count) * 100)
    : 0;

  return (
    <section className="growthHub" aria-labelledby="growth-hub-title">
      <div className="growthHubHeader">
        <div>
          <p className="eyebrow">Talent7 League</p>
          <h3 id="growth-hub-title">Compete, rank up, and build your trophy cabinet</h3>
          <small>Proof-backed results become visible progress. Casual rooms earn XP; Ranked rooms also earn Rank Points.</small>
        </div>
        <button disabled={busyAction !== null} onClick={refreshProgress} type="button">
          {busyAction === "refresh" ? "Refreshing…" : "Refresh progress"}
        </button>
      </div>

      {message && <p className="growthHubMessage" role="status">{message}</p>}

      <section className="talent7LeagueHero" aria-label="Talent7 League rank">
        <div className="talent7RankCrest" aria-hidden="true"><span>7</span></div>
        <div className="talent7RankProgress">
          <span>{talent7Season?.name || "Talent7 season"}</span>
          <h4>{talent7Rank?.tier || "Rookie"}</h4>
          <div
            aria-label={`${Math.round(rankProgress.percent)} percent progress to ${rankProgress.next?.name || "maximum tier"}`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(rankProgress.percent)}
            className="talent7RankBar"
            role="progressbar"
          >
            <i style={{ width: `${rankProgress.percent}%` }} />
          </div>
          <small>
            {rankProgress.next
              ? `${talent7Rank?.rank_points || 0} RP · ${rankProgress.next.points - (talent7Rank?.rank_points || 0)} to ${rankProgress.next.name}`
              : `${talent7Rank?.rank_points || 0} RP · Highest tier reached`}
          </small>
          {talent7Season && <small>Season ends {new Date(talent7Season.ends_at).toLocaleDateString()}</small>}
        </div>
        <div className="talent7RankStats">
          <div><strong>{talent7Rank?.xp || 0}</strong><small>XP</small></div>
          <div><strong>{talent7Rank?.wins || 0}</strong><small>Wins</small></div>
          <div><strong>{winRate}%</strong><small>Win rate</small></div>
          <div><strong>{trophies.length}</strong><small>Trophies</small></div>
        </div>
        <div className="talent7TierLadder" aria-label="Talent7 League tiers">
          {talent7TierSteps.map((step) => (
            <span
              className={`${(talent7Rank?.rank_points || 0) >= step.points ? "reached" : ""} ${
                rankProgress.current.name === step.name ? "current" : ""
              }`}
              key={step.name}
            >
              <i aria-hidden="true" />
              <strong>{step.name}</strong>
              <small>{step.points} RP</small>
            </span>
          ))}
        </div>
        {!talent7Rank?.completed_count && (
          <div className="talent7StarterGuide">
            <div>
              <span>Your first mission</span>
              <strong>Complete one challenge with proof</strong>
              <small>A Ranked victory earns 35 RP. Three victories are enough to pass 100 RP and reach Rising Star.</small>
            </div>
            <div>
              <span>First prize</span>
              <strong>First verified victory trophy</strong>
              <small>It stays in your trophy cabinet permanently, even after the season changes.</small>
            </div>
            <a href="#create">Create a Ranked challenge</a>
          </div>
        )}
        {activityRanks.length > 0 && (
          <div className="talent7ActivityRanks">
            {activityRanks.slice(0, 4).map((rank) => (
              <div key={rank.activity_key}>
                <strong>{rank.activity}</strong>
                <span>{rank.tier} · {rank.rank_points} RP</span>
                <small>{rank.wins} wins · best streak {rank.best_streak}</small>
              </div>
            ))}
          </div>
        )}
        {latestReward && (
          <div className="talent7LatestReward">
            <span>Latest reward</span>
            <strong>{latestReward.won ? "Verified victory" : "Challenge completed"} · {latestReward.activity}</strong>
            <small>
              +{latestReward.xp_delta} XP
              {latestReward.rank_points_delta > 0 ? ` · +${latestReward.rank_points_delta} RP` : ""}
              {latestReward.proof_bonus ? " · Proof bonus" : ""}
              {latestReward.tier_after !== latestReward.tier_before ? ` · ${latestReward.tier_after} unlocked` : ""}
            </small>
          </div>
        )}
      </section>

      <section className="localLeagueBoard" aria-labelledby="local-league-board-title">
        <div className="localLeagueBoardHeader">
          <div>
            <span>Local rankings</span>
            <h4 id="local-league-board-title">Represent your area. Rise through your city.</h4>
            <small>Proof-backed Talent7 League results only. Rank Points decide position; wins break ties.</small>
          </div>
          <div className="localLeagueBoardIdentity">
            <strong>{area || city || country || "Choose your location"}</strong>
            <small>{localLeaderboardVisible ? "You are eligible to appear" : "Browsing privately · opt in from Account settings"}</small>
          </div>
        </div>

        <div className="localLeagueBoardControls">
          <div aria-label="Leaderboard location" role="group">
            {(["Area", "City", "Country", "Global"] as LocalLeaderboardScope[]).map((scope) => {
              const unavailable = scope === "Area" ? !area : scope === "City" ? !city : scope === "Country" ? !country : false;
              return (
                <button
                  aria-pressed={localLeaderboardScope === scope}
                  className={localLeaderboardScope === scope ? "active" : ""}
                  disabled={unavailable}
                  key={scope}
                  onClick={() => setLocalLeaderboardScope(scope)}
                  type="button"
                >
                  {scope}
                </button>
              );
            })}
          </div>
          <div aria-label="Leaderboard activity" role="group">
            {(["Overall", "My activity"] as const).map((filter) => (
              <button
                aria-pressed={localLeaderboardActivity === filter}
                className={localLeaderboardActivity === filter ? "active" : ""}
                disabled={filter === "My activity" && !mainInterest}
                key={filter}
                onClick={() => setLocalLeaderboardActivity(filter)}
                type="button"
              >
                {filter === "My activity" ? mainInterest || "My activity" : filter}
              </button>
            ))}
          </div>
        </div>

        {localLeaderboardError ? (
          <p className="localLeagueBoardNotice">{localLeaderboardError}</p>
        ) : localLeaderboardLoading ? (
          <p className="localLeagueBoardNotice">Loading local standings…</p>
        ) : localLeaderboard.length > 0 ? (
          <div className="localLeagueStandings">
            {localLeaderboard.map((entry) => (
              <article className={entry.user_id === userId ? "mine" : ""} key={entry.user_id}>
                <b>#{entry.rank_position}</b>
                <span className="localLeagueAvatar" aria-hidden="true">
                  <LocalLeaderboardAvatar entry={entry} />
                </span>
                <div>
                  <strong>{entry.display_name}{entry.user_id === userId ? " · You" : ""}</strong>
                  <small>@{entry.username} · {entry.main_interest || "Open competition"}</small>
                  <small>{entry.location_label}</small>
                </div>
                <span><strong>{entry.tier}</strong><small>{entry.wins} wins · {entry.completed_count} completed</small></span>
                <b>{entry.rank_points} RP</b>
              </article>
            ))}
          </div>
        ) : (
          <div className="localLeagueBoardEmpty">
            <strong>Be the first ranked challenger here</strong>
            <small>Complete a Ranked challenge with saved proof to earn Rank Points and enter this board.</small>
            <a href="#create">Create a Ranked challenge</a>
          </div>
        )}
      </section>

      <div className="growthHubGrid">
        <article>
          <span className={`growthStatus ${readyNow ? "live" : ""}`}>{readyNow ? "Ready Now" : "Not active"}</span>
          <h4>Play soon</h4>
          <p>Appear first for matching challengers for one hour. You can end it at any time.</p>
          <button disabled={busyAction !== null} onClick={() => setReady(readyNow ? 0 : 60)} type="button">
            {busyAction === "ready" ? "Updating…" : readyNow ? "End Ready Now" : "Ready for 60 minutes"}
          </button>
        </article>

        <article>
          <span>{achievements.length} unlocked</span>
          <h4>Achievements</h4>
          {achievements.length ? (
            <div className="achievementList">
              {achievements.slice(0, 4).map((achievement) => (
                <div key={achievement.id} title={achievement.detail}>
                  <strong>★ {achievement.title}</strong>
                  <small>{achievement.detail}</small>
                </div>
              ))}
            </div>
          ) : (
            <p>Create or join a challenge to unlock your first achievement.</p>
          )}
        </article>

        <article>
          <span>{joinedLeague ? "Joined" : "Open this week"}</span>
          <h4>{joinedLeague?.title || `${mainInterest || "Your activity"} weekly league`}</h4>
          {joinedLeague ? (
            <div className="leagueStandings">
              {standings.slice(0, 5).map((entry, index) => (
                <div className={entry.user_id === userId ? "mine" : ""} key={entry.id}>
                  <span>#{index + 1}</span>
                  <strong>{entry.user_id === userId ? displayName : "Talent7 challenger"}</strong>
                  <small>{entry.score} pts</small>
                </div>
              ))}
            </div>
          ) : (
            <>
              <p>Complete rooms, add proof, and vote this week to earn points.</p>
              <button disabled={busyAction !== null || !mainInterest} onClick={joinLeague} type="button">
                {busyAction === "league" ? "Joining…" : "Join weekly league"}
              </button>
            </>
          )}
        </article>

        <article className="trophyCabinetCard">
          <span>{trophies.length} collected</span>
          <h4>Trophy cabinet</h4>
          {trophies.length > 0 ? (
            <div className="trophyCabinet">
              {trophies.slice(0, 4).map((trophy) => (
                <div className={trophy.rarity.toLowerCase()} key={trophy.id} title={trophy.detail}>
                  <i aria-hidden="true">7</i>
                  <span>
                    <strong>{trophy.title}</strong>
                    <small>{trophy.rarity} · {trophy.detail}</small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p>Complete a challenge with proof to begin your permanent trophy collection.</p>
          )}
        </article>
      </div>
    </section>
  );
}
