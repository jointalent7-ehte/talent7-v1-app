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

export default function GrowthHub({
  userId,
  displayName,
  mainInterest,
  readyNowUntil,
  onReadyNowChange
}: {
  userId: string;
  displayName: string;
  mainInterest: string;
  readyNowUntil?: string | null;
  onReadyNowChange: (value: string | null) => void;
}) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
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
      supabase.rpc("refresh_my_weekly_league_scores")
    ]);
    const [{ data: achievementRows }, { data: leagueRows }] = await Promise.all([
      supabase
        .from("user_achievements")
        .select("id,achievement_key,title,detail,achieved_at")
        .eq("user_id", userId)
        .order("achieved_at", { ascending: false }),
      supabase
        .from("weekly_leagues")
        .select("id,week_start,activity,title,status,weekly_league_entries(id,user_id,completed_count,proof_count,vote_count,score)")
        .gte("week_start", new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10))
        .order("week_start", { ascending: false })
    ]);
    setAchievements((achievementRows || []) as Achievement[]);
    setLeagues(((leagueRows || []) as League[]).map((league) => ({
      ...league,
      weekly_league_entries: [...(league.weekly_league_entries || [])].sort((a, b) => b.score - a.score)
    })));
  }, [userId]);

  useEffect(() => {
    void loadGrowth();
  }, [loadGrowth]);

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
    await loadGrowth();
    setMessage("Achievements and league scores refreshed.");
    setBusyAction(null);
  }

  const joinedLeague = useMemo(
    () => leagues.find((league) => league.weekly_league_entries?.some((entry) => entry.user_id === userId)),
    [leagues, userId]
  );
  const standings = joinedLeague?.weekly_league_entries || [];

  return (
    <section className="growthHub" aria-labelledby="growth-hub-title">
      <div className="growthHubHeader">
        <div>
          <p className="eyebrow">Momentum</p>
          <h3 id="growth-hub-title">Ready Now, achievements, and weekly league</h3>
          <small>Turn activity into visible progress without exposing private account details.</small>
        </div>
        <button disabled={busyAction !== null} onClick={refreshProgress} type="button">
          {busyAction === "refresh" ? "Refreshing…" : "Refresh progress"}
        </button>
      </div>

      {message && <p className="growthHubMessage" role="status">{message}</p>}

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
      </div>
    </section>
  );
}
