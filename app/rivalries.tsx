"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type RivalryStatus = "Pending" | "Active" | "Declined" | "Ended";

type Rivalry = {
  id: string;
  requester_user_id: string;
  opponent_user_id: string;
  requester_name: string;
  opponent_name: string;
  activity: string;
  status: RivalryStatus;
  share_token: string;
  accepted_at: string | null;
  ended_at: string | null;
  created_at: string;
};

type RivalryMatch = {
  id: string;
  rivalry_id: string;
  challenge_id: string;
  winner_user_id: string;
  score_label: string | null;
  completed_at: string;
};

type RivalProfile = {
  user_id: string;
  display_name: string;
  username: string;
  main_interest: string;
  region: string;
};

type EligibleChallenge = {
  eligible_challenge_id: string;
  challenge_title: string;
  final_score: string | null;
  challenge_completed_at: string;
};

function rivalryRecord(rivalry: Rivalry, matches: RivalryMatch[]) {
  const chronological = [...matches].sort(
    (first, second) => new Date(first.completed_at).getTime() - new Date(second.completed_at).getTime()
  );
  const requesterWins = chronological.filter((match) => match.winner_user_id === rivalry.requester_user_id).length;
  const opponentWins = chronological.filter((match) => match.winner_user_id === rivalry.opponent_user_id).length;
  const latestWinner = chronological.at(-1)?.winner_user_id || "";
  let streak = 0;
  for (let index = chronological.length - 1; index >= 0; index -= 1) {
    if (chronological[index].winner_user_id !== latestWinner) break;
    streak += 1;
  }
  return { chronological, requesterWins, opponentWins, latestWinner, streak };
}

export default function Rivalries({
  activities,
  currentUserId
}: {
  activities: string[];
  currentUserId: string;
}) {
  const [rivalries, setRivalries] = useState<Rivalry[]>([]);
  const [matches, setMatches] = useState<RivalryMatch[]>([]);
  const [profiles, setProfiles] = useState<RivalProfile[]>([]);
  const [eligibleChallenges, setEligibleChallenges] = useState<EligibleChallenge[]>([]);
  const [selectedRivalryId, setSelectedRivalryId] = useState("");
  const [view, setView] = useState<"Mine" | "Discover">("Mine");
  const [opponentSearch, setOpponentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const loadRivalries = useCallback(async () => {
    if (!supabase) return;
    const [rivalryResult, matchResult, profileResult] = await Promise.all([
      supabase.from("rivalries").select("*").order("created_at", { ascending: false }).limit(80),
      supabase.from("rivalry_matches").select("*").order("completed_at", { ascending: false }).limit(500),
      supabase.from("profiles").select("user_id,display_name,username,main_interest,region").order("display_name")
    ]);
    const error = rivalryResult.error || matchResult.error;
    if (error) {
      setLoadError(error.message.includes("rivalries") ? "Rivalries are waiting for the latest Supabase migration." : error.message);
    } else {
      setRivalries((rivalryResult.data || []) as Rivalry[]);
      setMatches((matchResult.data || []) as RivalryMatch[]);
      setProfiles((profileResult.data || []) as RivalProfile[]);
      setLoadError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRivalries();
  }, [loadRivalries]);

  useEffect(() => {
    if (!supabase) return;
    const refresh = () => void loadRivalries();
    const channel = supabase
      .channel("talent7-rivalries")
      .on("postgres_changes", { event: "*", schema: "public", table: "rivalries" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "rivalry_matches" }, refresh)
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [loadRivalries]);

  const mine = useMemo(
    () => rivalries.filter((rivalry) => currentUserId && [rivalry.requester_user_id, rivalry.opponent_user_id].includes(currentUserId)),
    [currentUserId, rivalries]
  );
  const discover = useMemo(() => rivalries.filter((rivalry) => rivalry.status === "Active" || rivalry.status === "Ended"), [rivalries]);
  const visibleRivalries = view === "Mine" ? mine : discover;
  const selectedRivalry = rivalries.find((rivalry) => rivalry.id === selectedRivalryId) || visibleRivalries[0] || null;
  const selectedMatches = matches.filter((match) => match.rivalry_id === selectedRivalry?.id);
  const selectedRecord = selectedRivalry ? rivalryRecord(selectedRivalry, selectedMatches) : null;
  const isParticipant = Boolean(
    selectedRivalry && currentUserId && [selectedRivalry.requester_user_id, selectedRivalry.opponent_user_id].includes(currentUserId)
  );
  const receivedPending = selectedRivalry?.status === "Pending" && selectedRivalry.opponent_user_id === currentUserId;
  const filteredProfiles = profiles.filter((profile) => {
    if (!currentUserId || profile.user_id === currentUserId) return false;
    const search = opponentSearch.trim().toLowerCase();
    return !search || [profile.display_name, profile.username, profile.main_interest, profile.region].join(" ").toLowerCase().includes(search);
  });

  useEffect(() => {
    if (selectedRivalryId || rivalries.length === 0) return;
    const sharedId = new URLSearchParams(window.location.search).get("rivalry");
    const preferred = rivalries.find((item) => item.id === sharedId)
      || mine.find((item) => item.status === "Pending" && item.opponent_user_id === currentUserId)
      || mine.find((item) => item.status === "Active")
      || rivalries.find((item) => item.status === "Active")
      || rivalries[0];
    setSelectedRivalryId(preferred.id);
    if (![preferred.requester_user_id, preferred.opponent_user_id].includes(currentUserId)) setView("Discover");
  }, [currentUserId, mine, rivalries, selectedRivalryId]);

  useEffect(() => {
    async function loadEligibleChallenges() {
      if (!supabase || !selectedRivalry || !isParticipant || selectedRivalry.status !== "Active") {
        setEligibleChallenges([]);
        return;
      }
      const { data, error } = await supabase.rpc("get_talent7_rivalry_eligible_challenges", {
        target_rivalry_id: selectedRivalry.id
      });
      setEligibleChallenges(error ? [] : (data || []) as EligibleChallenge[]);
    }
    void loadEligibleChallenges();
  }, [isParticipant, selectedRivalry]);

  async function runAction(
    key: string,
    action: (client: NonNullable<typeof supabase>) => PromiseLike<{ error: { message: string } | null }>,
    success: string
  ) {
    if (!supabase) return;
    setBusyAction(key);
    setMessage("");
    const { error } = await action(supabase);
    if (error) setMessage(error.message);
    else {
      setMessage(success);
      await loadRivalries();
    }
    setBusyAction("");
  }

  async function createRivalry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await runAction(
      "create",
      (client) => client.rpc("create_talent7_rivalry", {
        target_opponent_id: String(form.get("opponent_id") || ""),
        target_activity: String(form.get("activity") || "")
      }),
      "Rivalry invitation sent. It becomes active only after the opponent accepts."
    );
    formElement.reset();
    setOpponentSearch("");
  }

  async function respond(accept: boolean) {
    if (!selectedRivalry) return;
    await runAction(
      `respond-${selectedRivalry.id}`,
      (client) => client.rpc("respond_talent7_rivalry", {
        target_rivalry_id: selectedRivalry.id,
        accept_invitation: accept
      }),
      accept ? "Rivalry accepted. Your next proof-backed result can enter the record." : "Rivalry invitation declined."
    );
  }

  async function endRivalry() {
    if (!selectedRivalry) return;
    await runAction(
      `end-${selectedRivalry.id}`,
      (client) => client.rpc("end_talent7_rivalry", { target_rivalry_id: selectedRivalry.id }),
      "Rivalry ended. Its verified record remains visible."
    );
  }

  async function attachChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRivalry) return;
    const form = new FormData(event.currentTarget);
    await runAction(
      `attach-${selectedRivalry.id}`,
      (client) => client.rpc("attach_talent7_rivalry_challenge", {
        target_rivalry_id: selectedRivalry.id,
        target_challenge_id: String(form.get("challenge_id") || "")
      }),
      "Verified challenge added to the rivalry record."
    );
  }

  async function shareRivalry(rivalry: Rivalry) {
    const url = `${window.location.origin}${window.location.pathname}?rivalry=${rivalry.id}#rivalries`;
    if (navigator.share) {
      await navigator.share({ title: `${rivalry.requester_name} vs ${rivalry.opponent_name}`, text: `Follow this ${rivalry.activity} rivalry on Talent7.`, url }).catch(() => null);
    } else {
      await navigator.clipboard.writeText(url);
      setMessage("Rivalry link copied.");
    }
  }

  function rivalName(rivalry: Rivalry, userId: string) {
    return userId === rivalry.requester_user_id ? rivalry.requester_name : rivalry.opponent_name;
  }

  return (
    <>
      <div className="sectionHeader rivalrySectionHeader">
        <p className="eyebrow">Rivalries</p>
        <h2>Turn repeat matchups into a story people follow.</h2>
        <p>Both challengers must agree. Completed challenges with saved proof update the head-to-head record automatically.</p>
      </div>

      {loadError ? <div className="rivalryUnavailable"><strong>Rivalries unavailable</strong><span>{loadError}</span></div> : (
        <div className="rivalryWorkspace">
          <aside className="rivalryRail">
            <div className="rivalryViewTabs">
              <button className={view === "Mine" ? "active" : ""} onClick={() => setView("Mine")} type="button">My rivalries</button>
              <button className={view === "Discover" ? "active" : ""} onClick={() => setView("Discover")} type="button">Discover</button>
            </div>
            {loading ? <p>Loading rivalries…</p> : visibleRivalries.length > 0 ? visibleRivalries.map((rivalry) => {
              const record = rivalryRecord(rivalry, matches.filter((match) => match.rivalry_id === rivalry.id));
              return (
                <button className={selectedRivalry?.id === rivalry.id ? "selected" : ""} key={rivalry.id} onClick={() => setSelectedRivalryId(rivalry.id)} type="button">
                  <span>{rivalry.status} · {rivalry.activity}</span>
                  <strong>{rivalry.requester_name} vs {rivalry.opponent_name}</strong>
                  <small>{record.requesterWins}–{record.opponentWins} · {record.chronological.length} verified match{record.chronological.length === 1 ? "" : "es"}</small>
                </button>
              );
            }) : <p>{view === "Mine" ? "No rivalry invitations yet." : "No active public rivalries yet."}</p>}
          </aside>

          <div className="rivalryMain">
            {message && <p className="rivalryMessage" role="status">{message}</p>}
            {selectedRivalry && selectedRecord ? (
              <>
                <header className="rivalryHero">
                  <span>{selectedRivalry.status} · {selectedRivalry.activity}</span>
                  <div className="rivalryVersus">
                    <div><small>Challenger</small><strong>{selectedRivalry.requester_name}</strong><b>{selectedRecord.requesterWins}</b></div>
                    <i>VS</i>
                    <div><small>Challenger</small><strong>{selectedRivalry.opponent_name}</strong><b>{selectedRecord.opponentWins}</b></div>
                  </div>
                  <div className="rivalryHeroActions">
                    <button onClick={() => void shareRivalry(selectedRivalry)} type="button">Share rivalry</button>
                    {selectedRivalry.status === "Active" && isParticipant && <a href="#create">Create rematch</a>}
                  </div>
                </header>

                {selectedRivalry.status === "Pending" && isParticipant && (
                  <div className="rivalryConsentCard">
                    <div>
                      <strong>{receivedPending ? `${selectedRivalry.requester_name} invited you` : `Waiting for ${selectedRivalry.opponent_name}`}</strong>
                      <small>A rivalry never activates without the invited challenger’s agreement.</small>
                    </div>
                    {receivedPending && <span><button disabled={Boolean(busyAction)} onClick={() => void respond(true)} type="button">Accept rivalry</button><button className="secondary" disabled={Boolean(busyAction)} onClick={() => void respond(false)} type="button">Decline</button></span>}
                  </div>
                )}

                {(selectedRivalry.status === "Active" || selectedRivalry.status === "Ended") && (
                  <>
                    <div className="rivalryPulseGrid">
                      <article><span>Head-to-head</span><strong>{selectedRecord.requesterWins}–{selectedRecord.opponentWins}</strong><small>{selectedRecord.chronological.length} verified results</small></article>
                      <article><span>Current streak</span><strong>{selectedRecord.latestWinner ? `${rivalName(selectedRivalry, selectedRecord.latestWinner)} ×${selectedRecord.streak}` : "No streak yet"}</strong><small>Consecutive verified victories</small></article>
                      <article><span>Leader</span><strong>{selectedRecord.requesterWins === selectedRecord.opponentWins ? "Even rivalry" : selectedRecord.requesterWins > selectedRecord.opponentWins ? selectedRivalry.requester_name : selectedRivalry.opponent_name}</strong><small>{selectedRivalry.activity}</small></article>
                    </div>

                    {selectedRivalry.status === "Active" && isParticipant && (
                      <div className="rivalryRecordActions">
                        {eligibleChallenges.length > 0 ? (
                          <form onSubmit={attachChallenge}>
                            <label>Recover an older eligible result<select name="challenge_id" required defaultValue=""><option value="" disabled>Choose an eligible challenge</option>{eligibleChallenges.map((challenge) => <option key={challenge.eligible_challenge_id} value={challenge.eligible_challenge_id}>{challenge.challenge_title}{challenge.final_score ? ` · ${challenge.final_score}` : ""}</option>)}</select></label>
                            <button disabled={Boolean(busyAction)} type="submit">Sync result</button>
                          </form>
                        ) : <p>Future {selectedRivalry.activity} results are added automatically after the challenge is completed and proof is saved.</p>}
                        <button className="rivalryEndButton" disabled={Boolean(busyAction)} onClick={() => void endRivalry()} type="button">End rivalry</button>
                      </div>
                    )}

                    <div className="rivalryTimeline">
                      <div><span>Verified timeline</span><strong>Every chapter of the rivalry</strong></div>
                      {selectedRecord.chronological.length > 0 ? [...selectedRecord.chronological].reverse().map((match, index) => (
                        <article key={match.id}>
                          <b>{selectedRecord.chronological.length - index}</b>
                          <div><strong>{rivalName(selectedRivalry, match.winner_user_id)} won</strong><small>{new Date(match.completed_at).toLocaleString()}</small></div>
                          <span>{match.score_label || "Verified result"}</span>
                          <a href={`#room-${match.challenge_id}`}>Open proof room</a>
                        </article>
                      )) : <p>No recorded matches yet. The first verified result begins the rivalry history.</p>}
                    </div>
                  </>
                )}
              </>
            ) : <div className="rivalryEmpty"><strong>No rivalry selected</strong><span>Invite a challenger below or discover an active public rivalry.</span></div>}
          </div>
        </div>
      )}

      {currentUserId && (
        <details className="rivalryCreatePanel">
          <summary>Invite a new rival</summary>
          <form onSubmit={createRivalry}>
            <label className="rivalryOpponentSearch">Find a challenger<input onChange={(event) => setOpponentSearch(event.target.value)} placeholder="Search name, username, activity, or region" value={opponentSearch} /></label>
            <label>Opponent<select name="opponent_id" required defaultValue=""><option value="" disabled>Choose a Talent7 member</option>{filteredProfiles.slice(0, 40).map((profile) => <option key={profile.user_id} value={profile.user_id}>{profile.display_name} · @{profile.username} · {profile.main_interest}</option>)}</select></label>
            <label>Rivalry activity<select name="activity" defaultValue={activities[0]}>{activities.map((activity) => <option key={activity}>{activity}</option>)}</select></label>
            <button disabled={Boolean(busyAction)} type="submit">{busyAction === "create" ? "Sending…" : "Send rivalry invitation"}</button>
          </form>
        </details>
      )}
    </>
  );
}
