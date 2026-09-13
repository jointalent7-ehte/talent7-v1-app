"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import SponsoredPrizes from "./sponsored-prizes";

type TournamentStatus = "Registration" | "Live" | "Completed" | "Cancelled";
type ParticipantMode = "Individuals" | "Teams";

type Tournament = {
  id: string;
  organizer_id: string;
  organizer_name: string;
  title: string;
  activity: string;
  participant_mode: ParticipantMode;
  bracket_size: 4 | 8 | 16;
  status: TournamentStatus;
  registration_closes_at: string | null;
  starts_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type TournamentEntry = {
  id: string;
  tournament_id: string;
  participant_user_id: string | null;
  team_id: string | null;
  display_name: string;
  seed: number | null;
  status: "Registered" | "Withdrawn" | "Eliminated" | "Champion";
  created_at: string;
};

type TournamentMatch = {
  id: string;
  tournament_id: string;
  round_number: number;
  match_number: number;
  entry_a_id: string | null;
  entry_b_id: string | null;
  winner_entry_id: string | null;
  challenge_id: string | null;
  status: "Waiting" | "Ready" | "Completed";
  score_label: string | null;
};

type TalentTeam = {
  id: string;
  owner_user_id: string;
  name: string;
  main_activity: string;
};

type TeamMembership = {
  team_id: string;
  requester_user_id: string;
  member_role: string | null;
  status: string;
};

type ChallengeRoom = {
  id: string;
  title: string;
  status: string;
  created_by: string | null;
};

function roundTitle(roundNumber: number, totalRounds: number) {
  if (roundNumber === totalRounds) return "Final";
  if (roundNumber === totalRounds - 1) return "Semifinals";
  if (roundNumber === totalRounds - 2) return "Quarterfinals";
  return `Round ${roundNumber}`;
}

export default function TournamentBrackets({
  activities,
  displayName,
  userId
}: {
  activities: string[];
  displayName: string;
  userId: string;
}) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [entries, setEntries] = useState<TournamentEntry[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [teams, setTeams] = useState<TalentTeam[]>([]);
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([]);
  const [challengeRooms, setChallengeRooms] = useState<ChallengeRoom[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Open" | "Completed">("Open");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const loadTournaments = useCallback(async () => {
    if (!supabase) return;
    const [tournamentResult, entryResult, matchResult, teamResult, membershipResult, challengeResult] = await Promise.all([
      supabase.from("tournaments").select("*").neq("status", "Cancelled").order("created_at", { ascending: false }).limit(40),
      supabase.from("tournament_entries").select("*").order("created_at", { ascending: true }),
      supabase.from("tournament_matches").select("*").order("round_number", { ascending: true }).order("match_number", { ascending: true }),
      supabase.from("talent_teams").select("id,owner_user_id,name,main_activity").order("created_at", { ascending: false }),
      userId
        ? supabase.from("team_join_requests").select("team_id,requester_user_id,member_role,status").eq("requester_user_id", userId).eq("status", "Accepted")
        : Promise.resolve({ data: [], error: null }),
      userId
        ? supabase.from("challenges").select("id,title,status,created_by").eq("created_by", userId).order("created_at", { ascending: false }).limit(60)
        : Promise.resolve({ data: [], error: null })
    ]);

    const error = tournamentResult.error || entryResult.error || matchResult.error;
    if (error) {
      setLoadError(
        error.message.includes("tournaments")
          ? "Tournament brackets are waiting for the latest Supabase migration."
          : error.message
      );
      setLoading(false);
      return;
    }

    setTournaments((tournamentResult.data || []) as Tournament[]);
    setEntries((entryResult.data || []) as TournamentEntry[]);
    setMatches((matchResult.data || []) as TournamentMatch[]);
    setTeams((teamResult.data || []) as TalentTeam[]);
    setTeamMemberships((membershipResult.data || []) as TeamMembership[]);
    setChallengeRooms((challengeResult.data || []) as ChallengeRoom[]);
    setLoadError("");
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadTournaments();
  }, [loadTournaments]);

  useEffect(() => {
    if (!supabase) return;
    const refresh = () => void loadTournaments();
    const channel = supabase
      .channel("talent7-tournament-brackets")
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_entries" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_matches" }, refresh)
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [loadTournaments]);

  useEffect(() => {
    if (selectedTournamentId || tournaments.length === 0) return;
    const sharedId = new URLSearchParams(window.location.search).get("tournament");
    const preferred = tournaments.find((item) => item.id === sharedId) || tournaments.find((item) => item.status === "Live") || tournaments[0];
    setSelectedTournamentId(preferred.id);
  }, [selectedTournamentId, tournaments]);

  const visibleTournaments = useMemo(
    () => tournaments.filter((item) => statusFilter === "Completed" ? item.status === "Completed" : item.status !== "Completed"),
    [statusFilter, tournaments]
  );
  const selectedTournament = tournaments.find((item) => item.id === selectedTournamentId) || visibleTournaments[0] || null;
  const selectedEntries = entries.filter((entry) => entry.tournament_id === selectedTournament?.id && entry.status !== "Withdrawn");
  const selectedMatches = matches.filter((match) => match.tournament_id === selectedTournament?.id);
  const entryById = useMemo(() => Object.fromEntries(entries.map((entry) => [entry.id, entry])), [entries]);
  const challengeById = useMemo(() => Object.fromEntries(challengeRooms.map((room) => [room.id, room])), [challengeRooms]);
  const linkedChallengeIds = new Set(matches.map((match) => match.challenge_id).filter(Boolean));
  const availableChallengeRooms = challengeRooms.filter((room) => !linkedChallengeIds.has(room.id));
  const myTeams = teams.filter((team) =>
    team.owner_user_id === userId || teamMemberships.some((membership) =>
      membership.team_id === team.id && ["Captain", "Organizer"].includes(membership.member_role || "")
    )
  );
  const myEntry = selectedEntries.find((entry) =>
    entry.participant_user_id === userId || (entry.team_id && myTeams.some((team) => team.id === entry.team_id))
  );
  const isOrganizer = selectedTournament?.organizer_id === userId;
  const totalRounds = selectedTournament ? Math.log2(selectedTournament.bracket_size) : 0;
  const rounds = Array.from({ length: totalRounds }, (_, index) => index + 1);
  const champion = selectedEntries.find((entry) => entry.status === "Champion") || null;
  const canCurrentUserClaimPrize = Boolean(
    champion && userId && (
      champion.participant_user_id === userId
      || (champion.team_id && myTeams.some((team) => team.id === champion.team_id))
    )
  );

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
      await loadTournaments();
    }
    setBusyAction("");
  }

  async function createTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const closesAt = String(form.get("registration_closes_at") || "");
    await runAction(
      "create",
      (client) => client.rpc("create_talent7_tournament", {
        target_title: String(form.get("title") || "").trim(),
        target_activity: String(form.get("activity") || "").trim(),
        target_participant_mode: String(form.get("participant_mode") || "Individuals"),
        target_bracket_size: Number(form.get("bracket_size") || 4),
        target_registration_closes_at: closesAt ? new Date(closesAt).toISOString() : null
      }),
      "Tournament created and registration opened."
    );
    formElement.reset();
  }

  async function joinTournament(teamId?: string) {
    if (!supabase || !selectedTournament) return;
    await runAction(
      `join-${selectedTournament.id}`,
      (client) => client.rpc("join_talent7_tournament", {
        target_tournament_id: selectedTournament.id,
        target_team_id: teamId || null
      }),
      selectedTournament.participant_mode === "Teams" ? "Team registered for the tournament." : "You joined the tournament."
    );
  }

  async function withdrawEntry(entryId: string) {
    if (!supabase) return;
    await runAction(
      `withdraw-${entryId}`,
      (client) => client.rpc("withdraw_talent7_tournament_entry", { target_entry_id: entryId }),
      "Tournament registration withdrawn."
    );
  }

  async function startTournament() {
    if (!supabase || !selectedTournament) return;
    await runAction(
      `start-${selectedTournament.id}`,
      (client) => client.rpc("start_talent7_tournament", { target_tournament_id: selectedTournament.id }),
      "Bracket started. First-round matches are ready."
    );
  }

  async function linkMatch(event: FormEvent<HTMLFormElement>, matchId: string) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    await runAction(
      `link-${matchId}`,
      (client) => client.rpc("link_talent7_tournament_match", {
        target_match_id: matchId,
        target_challenge_id: String(form.get("challenge_id") || "")
      }),
      "Challenge room linked to this bracket match."
    );
  }

  async function recordMatch(event: FormEvent<HTMLFormElement>, matchId: string) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const winnerId = String(form.get("winner_entry_id") || "");
    if (!winnerId) {
      setMessage("Choose the match winner.");
      return;
    }
    await runAction(
      `result-${matchId}`,
      (client) => client.rpc("record_talent7_tournament_match", {
        target_match_id: matchId,
        target_winner_entry_id: winnerId,
        target_score_label: String(form.get("score_label") || "").trim() || null
      }),
      "Winner advanced to the next round."
    );
  }

  async function shareTournament(tournament: Tournament) {
    const url = `${window.location.origin}${window.location.pathname}?tournament=${tournament.id}#tournaments`;
    if (navigator.share) {
      await navigator.share({ title: tournament.title, text: `Follow the ${tournament.title} bracket on Talent7.`, url }).catch(() => null);
    } else {
      await navigator.clipboard.writeText(url);
      setMessage("Tournament link copied.");
    }
  }

  return (
    <>
      <div className="sectionHeader tournamentSectionHeader">
        <p className="eyebrow">Tournament brackets</p>
        <h2>One bracket. Every round. A visible champion.</h2>
        <p>Create public 4, 8, or 16-slot tournaments. Match winners move forward automatically, and bracket updates appear live.</p>
      </div>

      {loadError ? (
        <div className="tournamentUnavailable"><strong>Tournaments unavailable</strong><span>{loadError}</span></div>
      ) : (
        <div className="tournamentWorkspace">
          <aside className="tournamentRail">
            <div className="tournamentRailFilters">
              <button className={statusFilter === "Open" ? "active" : ""} onClick={() => setStatusFilter("Open")} type="button">Open</button>
              <button className={statusFilter === "Completed" ? "active" : ""} onClick={() => setStatusFilter("Completed")} type="button">Completed</button>
            </div>
            {loading ? <p>Loading brackets…</p> : visibleTournaments.length > 0 ? visibleTournaments.map((tournament) => {
              const count = entries.filter((entry) => entry.tournament_id === tournament.id && entry.status !== "Withdrawn").length;
              return (
                <button className={selectedTournament?.id === tournament.id ? "selected" : ""} key={tournament.id} onClick={() => setSelectedTournamentId(tournament.id)} type="button">
                  <span>{tournament.status}</span>
                  <strong>{tournament.title}</strong>
                  <small>{tournament.activity} · {count}/{tournament.bracket_size} {tournament.participant_mode.toLowerCase()}</small>
                </button>
              );
            }) : <p>No {statusFilter.toLowerCase()} tournaments yet.</p>}
          </aside>

          <div className="tournamentMain">
            {message && <p className="tournamentMessage" role="status">{message}</p>}
            {selectedTournament ? (
              <>
                <header className="tournamentHero">
                  <div>
                    <span>{selectedTournament.status} · {selectedTournament.bracket_size}-slot {selectedTournament.participant_mode.toLowerCase()}</span>
                    <h3>{selectedTournament.title}</h3>
                    <p>{selectedTournament.activity} · Organized by {selectedTournament.organizer_name}</p>
                  </div>
                  <button onClick={() => void shareTournament(selectedTournament)} type="button">Share bracket</button>
                </header>

                {selectedTournament.status === "Registration" ? (
                  <section className="tournamentRegistration">
                    <div className="tournamentRegistrationSummary">
                      <div><strong>{selectedEntries.length}</strong><span>Registered</span></div>
                      <div><strong>{selectedTournament.bracket_size - selectedEntries.length}</strong><span>Open slots</span></div>
                      <div><strong>{selectedTournament.registration_closes_at ? new Date(selectedTournament.registration_closes_at).toLocaleString() : "Organizer start"}</strong><span>Registration closes</span></div>
                    </div>
                    <div className="tournamentEntryList">
                      {Array.from({ length: selectedTournament.bracket_size }, (_, index) => selectedEntries[index] || null).map((entry, index) => (
                        <div className={entry ? "filled" : ""} key={entry?.id || `open-${index}`}>
                          <b>Seed {index + 1}</b>
                          <strong>{entry?.display_name || "Open slot"}</strong>
                          {entry && isOrganizer && <button disabled={Boolean(busyAction)} onClick={() => void withdrawEntry(entry.id)} type="button">Remove</button>}
                        </div>
                      ))}
                    </div>
                    <div className="tournamentRegistrationActions">
                      {!userId ? <p>Sign in to register for this tournament.</p> : myEntry ? (
                        <button disabled={Boolean(busyAction)} onClick={() => void withdrawEntry(myEntry.id)} type="button">Withdraw my entry</button>
                      ) : selectedEntries.length >= selectedTournament.bracket_size ? <p>This bracket is full.</p> : selectedTournament.participant_mode === "Individuals" ? (
                        <button disabled={Boolean(busyAction)} onClick={() => void joinTournament()} type="button">Join as {displayName || "challenger"}</button>
                      ) : myTeams.length > 0 ? (
                        <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void joinTournament(String(form.get("team_id") || "")); }}>
                          <select name="team_id" required>{myTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
                          <button disabled={Boolean(busyAction)} type="submit">Register team</button>
                        </form>
                      ) : <p>Create a team, or become its captain or organizer, before registering it.</p>}
                      {isOrganizer && (
                        <button disabled={Boolean(busyAction) || selectedEntries.length !== selectedTournament.bracket_size} onClick={() => void startTournament()} type="button">
                          Start seeded bracket
                        </button>
                      )}
                    </div>
                    <small className="tournamentSeedNote">Initial registration order sets seeds. Seed 1 faces the final seed, seed 2 faces the next-to-final seed, and so on.</small>
                  </section>
                ) : (
                  <section className="tournamentBracketViewport" aria-label={`${selectedTournament.title} bracket`}>
                    <div className="tournamentBracket" style={{ gridTemplateColumns: `repeat(${totalRounds}, minmax(250px, 1fr))` }}>
                      {rounds.map((roundNumber) => (
                        <div className="tournamentRound" key={roundNumber}>
                          <h4>{roundTitle(roundNumber, totalRounds)}</h4>
                          <div>
                            {selectedMatches.filter((match) => match.round_number === roundNumber).map((match) => {
                              const entryA = match.entry_a_id ? entryById[match.entry_a_id] : null;
                              const entryB = match.entry_b_id ? entryById[match.entry_b_id] : null;
                              const linkedRoom = match.challenge_id ? challengeById[match.challenge_id] : null;
                              return (
                                <article className={`${match.status.toLowerCase()} ${match.winner_entry_id ? "decided" : ""}`} key={match.id}>
                                  <span>Match {match.match_number} · {match.status}</span>
                                  <div className={match.winner_entry_id === entryA?.id ? "winner" : ""}><b>{entryA?.seed ? `#${entryA.seed}` : "—"}</b><strong>{entryA?.display_name || "Awaiting winner"}</strong></div>
                                  <div className={match.winner_entry_id === entryB?.id ? "winner" : ""}><b>{entryB?.seed ? `#${entryB.seed}` : "—"}</b><strong>{entryB?.display_name || "Awaiting winner"}</strong></div>
                                  {match.score_label && <small>Final score · {match.score_label}</small>}
                                  {linkedRoom && <a href={`#room-${linkedRoom.id}`}>Open linked room · {linkedRoom.title}</a>}
                                  {isOrganizer && match.status !== "Completed" && entryA && entryB && !linkedRoom && (
                                    <form className="tournamentLinkForm" onSubmit={(event) => void linkMatch(event, match.id)}>
                                      <select name="challenge_id" required defaultValue=""><option value="" disabled>Link one of my challenge rooms</option>{availableChallengeRooms.map((room) => <option key={room.id} value={room.id}>{room.title} · {room.status}</option>)}</select>
                                      <button disabled={Boolean(busyAction) || availableChallengeRooms.length === 0} type="submit">Link</button>
                                    </form>
                                  )}
                                  {isOrganizer && match.status === "Ready" && entryA && entryB && (
                                    <form className="tournamentResultForm" onSubmit={(event) => void recordMatch(event, match.id)}>
                                      <input maxLength={80} name="score_label" placeholder="Score, e.g. 2–1" />
                                      <span>Advance winner</span>
                                      <button disabled={Boolean(busyAction)} name="winner_entry_id" value={entryA.id} type="submit">{entryA.display_name}</button>
                                      <button disabled={Boolean(busyAction)} name="winner_entry_id" value={entryB.id} type="submit">{entryB.display_name}</button>
                                    </form>
                                  )}
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {champion && <div className="tournamentChampion"><span>🏆 Tournament champion</span><strong>{champion.display_name}</strong><small>{selectedTournament.title} · {selectedTournament.activity}</small></div>}
                <SponsoredPrizes
                  canCurrentUserClaim={canCurrentUserClaimPrize}
                  championName={champion?.display_name || ""}
                  organizerId={selectedTournament.organizer_id}
                  tournamentId={selectedTournament.id}
                  tournamentStatus={selectedTournament.status}
                  tournamentTitle={selectedTournament.title}
                  userId={userId}
                />
              </>
            ) : <div className="tournamentEmpty"><strong>No tournament selected</strong><span>Create the first bracket below or open a tournament from the list.</span></div>}
          </div>
        </div>
      )}

      {userId && (
        <details className="tournamentCreatePanel">
          <summary>Create a tournament</summary>
          <form onSubmit={createTournament}>
            <label>Tournament name<input maxLength={100} minLength={3} name="title" placeholder="Nerul Open Badminton Cup" required /></label>
            <label>Activity<select name="activity" defaultValue={activities[0]}>{activities.map((activity) => <option key={activity}>{activity}</option>)}</select></label>
            <label>Participants<select name="participant_mode"><option>Individuals</option><option>Teams</option></select></label>
            <label>Bracket size<select name="bracket_size"><option value="4">4 slots</option><option value="8">8 slots</option><option value="16">16 slots</option></select></label>
            <label>Registration closes (optional)<input name="registration_closes_at" type="datetime-local" /></label>
            <button disabled={Boolean(busyAction)} type="submit">{busyAction === "create" ? "Creating…" : "Open registration"}</button>
          </form>
        </details>
      )}
    </>
  );
}
