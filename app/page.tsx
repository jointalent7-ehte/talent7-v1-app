"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "../lib/supabase";

type ChallengeLane = "Talent battle" | "Sports challenge" | "Mobile gaming challenge";

type Challenge = {
  id: string;
  title: string;
  lane: ChallengeLane;
  status: string;
  rules: string;
  team_a: string;
  team_b: string;
  proof_url: string | null;
  winner: string | null;
  final_score: string | null;
  completed_at: string | null;
  created_at: string;
};

type JoinRole = "Challenger" | "Audience";

type ChallengeJoin = {
  id: string;
  challenge_id: string;
  participant_name: string;
  role: JoinRole;
  side: string;
  created_at: string;
};

type ChallengeRating = {
  id: string;
  challenge_id: string;
  rating: number;
  created_at: string;
};

type ChallengeVote = {
  id: string;
  challenge_id: string;
  winner: string;
  created_at: string;
};

type ChallengeProof = {
  id: string;
  challenge_id: string;
  proof_url: string;
  notes: string | null;
  created_at: string;
};

const sampleChallenges: Challenge[] = [
  {
    id: "sample-1",
    title: "Badminton doubles",
    lane: "Sports challenge",
    status: "Open",
    rules: "Best of 3 games, 21 points each. Upload victory proof after the match.",
    team_a: "Rohan + Dev",
    team_b: "Aryan + Kabir",
    proof_url: null,
    winner: null,
    final_score: null,
    completed_at: null,
    created_at: new Date().toISOString()
  },
  {
    id: "sample-2",
    title: "Breakdance battle",
    lane: "Talent battle",
    status: "Open",
    rules: "60-second round. Audience rates flow, originality, and energy.",
    team_a: "Arya",
    team_b: "Mateo",
    proof_url: null,
    winner: null,
    final_score: null,
    completed_at: null,
    created_at: new Date().toISOString()
  },
  {
    id: "sample-3",
    title: "PUBG squad battle",
    lane: "Mobile gaming challenge",
    status: "Open",
    rules: "Share room code, play match, upload proof clip or screenshot.",
    team_a: "Nova Squad",
    team_b: "Open invite",
    proof_url: null,
    winner: null,
    final_score: null,
    completed_at: null,
    created_at: new Date().toISOString()
  }
];

export default function Home() {
  const [challenges, setChallenges] = useState<Challenge[]>(sampleChallenges);
  const [selectedLane, setSelectedLane] = useState<ChallengeLane | "All">("All");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [authMode, setAuthMode] = useState<"Sign up" | "Log in">("Sign up");
  const [authLoading, setAuthLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [joiningChallengeId, setJoiningChallengeId] = useState<string | null>(null);
  const [createdChallengeId, setCreatedChallengeId] = useState<string | null>(null);
  const [completingChallengeId, setCompletingChallengeId] = useState<string | null>(null);
  const [savingProofChallengeId, setSavingProofChallengeId] = useState<string | null>(null);
  const [joins, setJoins] = useState<ChallengeJoin[]>([]);
  const [ratings, setRatings] = useState<ChallengeRating[]>([]);
  const [votes, setVotes] = useState<ChallengeVote[]>([]);
  const [proofs, setProofs] = useState<ChallengeProof[]>([]);

  const joinCounts = useMemo(() => {
    return joins.reduce<Record<string, { challengers: number; audience: number }>>((counts, join) => {
      const current = counts[join.challenge_id] || { challengers: 0, audience: 0 };

      if (join.role === "Challenger") current.challengers += 1;
      if (join.role === "Audience") current.audience += 1;

      counts[join.challenge_id] = current;
      return counts;
    }, {});
  }, [joins]);

  const roomResults = useMemo(() => {
    return challenges.reduce<
      Record<string, { teamAVotes: number; teamBVotes: number; ratingAverage: string; ratingCount: number }>
    >((results, challenge) => {
      const roomVotes = votes.filter((vote) => vote.challenge_id === challenge.id);
      const roomRatings = ratings.filter((rating) => rating.challenge_id === challenge.id);
      const ratingTotal = roomRatings.reduce((total, rating) => total + rating.rating, 0);

      results[challenge.id] = {
        teamAVotes: roomVotes.filter((vote) => vote.winner === challenge.team_a).length,
        teamBVotes: roomVotes.filter((vote) => vote.winner === challenge.team_b).length,
        ratingAverage: roomRatings.length ? (ratingTotal / roomRatings.length).toFixed(1) : "0.0",
        ratingCount: roomRatings.length
      };

      return results;
    }, {});
  }, [challenges, ratings, votes]);

  const roomProofs = useMemo(() => {
    return proofs.reduce<Record<string, ChallengeProof[]>>((groups, proof) => {
      groups[proof.challenge_id] = groups[proof.challenge_id] || [];
      groups[proof.challenge_id].push(proof);
      return groups;
    }, {});
  }, [proofs]);

  const activityScores = useMemo(() => {
    return challenges.reduce<Record<string, number>>((scores, challenge) => {
      const joinsTotal =
        (joinCounts[challenge.id]?.challengers || 0) + (joinCounts[challenge.id]?.audience || 0);
      const results = roomResults[challenge.id] || {
        teamAVotes: 0,
        teamBVotes: 0,
        ratingAverage: "0.0",
        ratingCount: 0
      };
      const votesTotal = results.teamAVotes + results.teamBVotes;
      const proofsTotal = roomProofs[challenge.id]?.length || 0;

      scores[challenge.id] = joinsTotal * 3 + votesTotal * 2 + results.ratingCount + proofsTotal * 4;
      return scores;
    }, {});
  }, [challenges, joinCounts, roomProofs, roomResults]);

  const visibleChallenges = useMemo(() => {
    const filteredChallenges =
      selectedLane === "All" ? challenges : challenges.filter((challenge) => challenge.lane === selectedLane);

    return [...filteredChallenges].sort((first, second) => {
      const scoreDifference = (activityScores[second.id] || 0) - (activityScores[first.id] || 0);
      if (scoreDifference !== 0) return scoreDifference;
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
    });
  }, [activityScores, challenges, selectedLane]);

  const leaderboard = useMemo(() => {
    return challenges
      .map((challenge) => {
        const joinsTotal =
          (joinCounts[challenge.id]?.challengers || 0) + (joinCounts[challenge.id]?.audience || 0);
        const results = roomResults[challenge.id] || {
          teamAVotes: 0,
          teamBVotes: 0,
          ratingAverage: "0.0",
          ratingCount: 0
        };
        const votesTotal = results.teamAVotes + results.teamBVotes;
        const proofsTotal = roomProofs[challenge.id]?.length || 0;
        const score = joinsTotal * 3 + votesTotal * 2 + results.ratingCount + proofsTotal * 4;

        return {
          challenge,
          joinsTotal,
          votesTotal,
          proofsTotal,
          ratingAverage: results.ratingAverage,
          score: activityScores[challenge.id] || score
        };
      })
      .sort((first, second) => second.score - first.score || first.challenge.title.localeCompare(second.challenge.title))
      .slice(0, 3);
  }, [activityScores, challenges, joinCounts, roomProofs, roomResults]);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function loadChallenges() {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("challenges")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(`Could not load challenges: ${error.message}`);
        return;
      }

      if (data) setChallenges(data as Challenge[]);
    }

    loadChallenges();
  }, []);

  useEffect(() => {
    async function loadJoins() {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("challenge_joins")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return;
      if (data) setJoins(data as ChallengeJoin[]);
    }

    loadJoins();
  }, []);

  useEffect(() => {
    async function loadResults() {
      if (!supabase) return;

      const [{ data: ratingData }, { data: voteData }] = await Promise.all([
        supabase.from("ratings").select("*").order("created_at", { ascending: false }),
        supabase.from("votes").select("*").order("created_at", { ascending: false })
      ]);

      if (ratingData) setRatings(ratingData as ChallengeRating[]);
      if (voteData) setVotes(voteData as ChallengeVote[]);
    }

    loadResults();
  }, []);

  useEffect(() => {
    async function loadProofs() {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("proofs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return;
      if (data) setProofs(data as ChallengeProof[]);
    }

    loadProofs();
  }, []);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage("Connect Supabase before using accounts.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    if (!email || password.length < 6) {
      setMessage("Enter an email and a password with at least 6 characters.");
      return;
    }

    setAuthLoading(true);
    setMessage("");

    const result =
      authMode === "Sign up"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage(result.error.message);
    } else if (authMode === "Sign up" && !result.data.session) {
      setMessage("Account created. Check your email to confirm it, then log in.");
    } else {
      setMessage(authMode === "Sign up" ? "Account created and logged in." : "Logged in.");
    }

    setAuthLoading(false);
  }

  async function logOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMessage("Logged out.");
  }

  async function createChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setIsSaving(true);
    setMessage("");

    const form = new FormData(formElement);
    const challenge = {
      title: String(form.get("title") || "Untitled challenge"),
      lane: String(form.get("lane") || "Sports challenge") as ChallengeLane,
      team_a: String(form.get("team_a") || "Open challenger"),
      team_b: String(form.get("team_b") || "Open invite"),
      rules: String(form.get("rules") || "Upload proof after the challenge."),
      status: "Open"
    };

    if (!supabase) {
      const localChallenge: Challenge = {
        id: crypto.randomUUID(),
        proof_url: null,
        winner: null,
        final_score: null,
        completed_at: null,
        created_at: new Date().toISOString(),
        ...challenge
      };
      setChallenges((items) => [localChallenge, ...items]);
      setCreatedChallengeId(localChallenge.id);
      setSelectedLane(challenge.lane);
      setMessage("Demo mode: challenge added below. Connect Supabase to save it for everyone.");
      setIsSaving(false);
      formElement.reset();
      setTimeout(() => document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" }), 80);
      return;
    }

    const { data, error } = await supabase
      .from("challenges")
      .insert(challenge)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not create challenge: ${error.message}`);
    } else if (data) {
      const savedChallenge = data as Challenge;
      setChallenges((items) => [savedChallenge, ...items]);
      setCreatedChallengeId(savedChallenge.id);
      setSelectedLane(savedChallenge.lane);
      setMessage("Challenge created. It is now shown at the top of Challenge rooms.");
      formElement.reset();
      setTimeout(() => document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" }), 80);
    }

    setIsSaving(false);
  }

  async function joinChallenge(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const participantName = String(form.get("participant_name") || "").trim();

    if (!participantName) {
      setMessage("Please enter a name before joining.");
      return;
    }

    const join = {
      challenge_id: challenge.id,
      participant_name: participantName,
      role: String(form.get("role") || "Challenger") as JoinRole,
      side: String(form.get("side") || "Open invite")
    };

    setJoiningChallengeId(challenge.id);
    setMessage("");

    if (!supabase || challenge.id.startsWith("sample-")) {
      const localJoin: ChallengeJoin = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...join
      };

      setJoins((items) => [localJoin, ...items]);
      setMessage(`${participantName} joined ${challenge.title} as ${join.role.toLowerCase()}.`);
      formElement.reset();
      setJoiningChallengeId(null);
      return;
    }

    const { data, error } = await supabase
      .from("challenge_joins")
      .insert(join)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not join yet: ${error.message}`);
    } else if (data) {
      setJoins((items) => [data as ChallengeJoin, ...items]);
      setMessage(`${participantName} joined ${challenge.title} as ${join.role.toLowerCase()}.`);
      formElement.reset();
    }

    setJoiningChallengeId(null);
  }

  async function rateChallenge(challengeId: string, rating: number) {
    if (!supabase || challengeId.startsWith("sample-")) {
      setRatings((items) => [
        {
          id: crypto.randomUUID(),
          challenge_id: challengeId,
          rating,
          created_at: new Date().toISOString()
        },
        ...items
      ]);
      setMessage(`Saved a ${rating}/7 rating for this preview.`);
      return;
    }

    const { data, error } = await supabase
      .from("ratings")
      .insert({
        challenge_id: challengeId,
        rating
      })
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not save rating: ${error.message}`);
    } else if (data) {
      setRatings((items) => [data as ChallengeRating, ...items]);
      setMessage(`Saved ${rating}/7 rating.`);
    }
  }

  async function voteForWinner(challengeId: string, winner: string) {
    if (!supabase || challengeId.startsWith("sample-")) {
      setVotes((items) => [
        {
          id: crypto.randomUUID(),
          challenge_id: challengeId,
          winner,
          created_at: new Date().toISOString()
        },
        ...items
      ]);
      setMessage(`Vote recorded for ${winner}.`);
      return;
    }

    const { data, error } = await supabase
      .from("votes")
      .insert({
        challenge_id: challengeId,
        winner
      })
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not save vote: ${error.message}`);
    } else if (data) {
      setVotes((items) => [data as ChallengeVote, ...items]);
      setMessage(`Vote saved for ${winner}.`);
    }
  }

  async function submitProof(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const proofUrl = String(form.get("proof_url") || "").trim();
    const notes = String(form.get("notes") || "").trim();

    if (!proofUrl) {
      setMessage("Please paste a proof link first.");
      return;
    }

    const proof = {
      challenge_id: challenge.id,
      proof_url: proofUrl,
      notes: notes || null
    };

    setSavingProofChallengeId(challenge.id);
    setMessage("");

    if (!supabase || challenge.id.startsWith("sample-")) {
      const localProof: ChallengeProof = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...proof
      };

      setProofs((items) => [localProof, ...items]);
      setMessage(`Proof added for ${challenge.title}.`);
      formElement.reset();
      setSavingProofChallengeId(null);
      return;
    }

    const { data, error } = await supabase
      .from("proofs")
      .insert(proof)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not save proof: ${error.message}`);
    } else if (data) {
      setProofs((items) => [data as ChallengeProof, ...items]);
      setMessage(`Proof added for ${challenge.title}.`);
      formElement.reset();
    }

    setSavingProofChallengeId(null);
  }

  async function completeChallenge(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const winner = String(form.get("winner") || "").trim();
    const finalScore = String(form.get("final_score") || "").trim();

    if (!winner) {
      setMessage("Please choose a winner first.");
      return;
    }

    const challengeResult = {
      status: "Completed",
      winner,
      final_score: finalScore || null,
      completed_at: new Date().toISOString()
    };

    setCompletingChallengeId(challenge.id);
    setMessage("");

    if (!supabase || challenge.id.startsWith("sample-")) {
      setChallenges((items) =>
        items.map((item) => (item.id === challenge.id ? { ...item, ...challengeResult } : item))
      );
      setMessage(`${challenge.title} completed. Winner: ${winner}.`);
      formElement.reset();
      setCompletingChallengeId(null);
      return;
    }

    const { data, error } = await supabase
      .from("challenges")
      .update(challengeResult)
      .eq("id", challenge.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not complete challenge: ${error.message}`);
    } else if (data) {
      setChallenges((items) => items.map((item) => (item.id === challenge.id ? (data as Challenge) : item)));
      setMessage(`${challenge.title} completed. Winner: ${winner}.`);
      formElement.reset();
    }

    setCompletingChallengeId(null);
  }

  return (
    <main>
      <header className="hero">
        <nav>
          <strong>Talent7</strong>
          <div className="navActions">
            <span>{session ? session.user.email : "Guest mode"}</span>
            <a href="https://www.jointalent7.com">Public site</a>
          </div>
        </nav>
        <section>
          <p className="eyebrow">Challenge MVP</p>
          <h1>Real challenge rooms for Talent, Sports, and Gaming</h1>
          <p>
            This is the first real app direction: create proof-based challenges, invite opponents,
            collect ratings, vote winners, and build leaderboards before live video.
          </p>
          <div className="heroActions">
            <a href="#account" className="secondary">Account</a>
            <a href="#create" className="primary">Create challenge</a>
            <a href="#rooms" className="secondary">View rooms</a>
          </div>
        </section>
      </header>

      {!hasSupabaseConfig && (
        <aside className="setupNotice">
          <strong>Demo mode:</strong> Supabase is not connected yet. You can preview the app, but
          saved data only lives on this page until Supabase keys are added.
        </aside>
      )}

      {message && <aside className="message">{message}</aside>}

      <section className="section authSection" id="account">
        <div className="sectionHeader">
          <p className="eyebrow">Account</p>
          <h2>Sign up or log in</h2>
          <p>Use this first account layer before we lock joins, votes, proof, and results to real users.</p>
        </div>
        {session ? (
          <div className="accountCard">
            <div>
              <span>Logged in as</span>
              <strong>{session.user.email}</strong>
            </div>
            <button type="button" onClick={logOut}>Log out</button>
          </div>
        ) : (
          <form className="authForm" onSubmit={handleAuth}>
            <div className="authTabs">
              {(["Sign up", "Log in"] as const).map((mode) => (
                <button
                  className={authMode === mode ? "active" : ""}
                  key={mode}
                  onClick={() => setAuthMode(mode)}
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </div>
            <label>
              Email
              <input name="email" placeholder="you@example.com" type="email" />
            </label>
            <label>
              Password
              <input name="password" placeholder="At least 6 characters" type="password" />
            </label>
            <button disabled={authLoading} type="submit">
              {authLoading ? "Please wait..." : authMode}
            </button>
          </form>
        )}
      </section>

      <section className="section" id="create">
        <div className="sectionHeader">
          <p className="eyebrow">Create</p>
          <h2>Start a challenge</h2>
          <p>Use this for badminton doubles, breakdance battles, mobile gaming matches, and more.</p>
        </div>
        <form className="createForm" onSubmit={createChallenge}>
          <label>
            Challenge title
            <input name="title" defaultValue="Badminton doubles" />
          </label>
          <label>
            Lane
            <select name="lane" defaultValue="Sports challenge">
              <option>Talent battle</option>
              <option>Sports challenge</option>
              <option>Mobile gaming challenge</option>
            </select>
          </label>
          <label>
            Team or challenger A
            <input name="team_a" defaultValue="Rohan + Dev" />
          </label>
          <label>
            Team or challenger B
            <input name="team_b" defaultValue="Open invite" />
          </label>
          <label className="wide">
            Rules
            <textarea
              name="rules"
              rows={4}
              defaultValue="Best of 3 games, 21 points each. Upload victory proof after the match."
            />
          </label>
          <button disabled={isSaving}>{isSaving ? "Saving..." : "Create challenge"}</button>
        </form>
      </section>

      <section className="section" id="rooms">
        <div className="sectionHeader">
          <p className="eyebrow">Rooms</p>
          <h2>Challenge rooms</h2>
          <p>Filter by challenge lane, rate rooms out of 7, and vote for winners.</p>
        </div>
        <div className="filters">
          {(["All", "Talent battle", "Sports challenge", "Mobile gaming challenge"] as const).map((lane) => (
            <button
              className={selectedLane === lane ? "active" : ""}
              key={lane}
              onClick={() => setSelectedLane(lane)}
              type="button"
            >
              {lane}
            </button>
          ))}
        </div>
        <div className="roomsGrid">
          {visibleChallenges.map((challenge) => (
            <article
              className={`roomCard ${challenge.id === createdChallengeId ? "newRoom" : ""}`}
              key={challenge.id}
            >
              <span>{challenge.lane}</span>
              {challenge.id === createdChallengeId && <em>New challenge</em>}
              <h3>{challenge.title}</h3>
              {challenge.status === "Completed" && (
                <div className="winnerBanner">
                  <span>Winner</span>
                  <strong>{challenge.winner || "Winner declared"}</strong>
                  {challenge.final_score && <small>Final score: {challenge.final_score}</small>}
                </div>
              )}
              <div className="versus">
                <strong>{challenge.team_a}</strong>
                <b>vs</b>
                <strong>{challenge.team_b}</strong>
              </div>
              <div className="roomStats">
                <strong>Challengers: {joinCounts[challenge.id]?.challengers || 0}</strong>
                <strong>Audience: {joinCounts[challenge.id]?.audience || 0}</strong>
              </div>
              <div className="scoreBoard">
                <div>
                  <span>Votes</span>
                  <strong>
                    A {roomResults[challenge.id]?.teamAVotes || 0} / B{" "}
                    {roomResults[challenge.id]?.teamBVotes || 0}
                  </strong>
                </div>
                <div>
                  <span>Rating</span>
                  <strong>
                    {roomResults[challenge.id]?.ratingAverage || "0.0"} / 7
                    <small> ({roomResults[challenge.id]?.ratingCount || 0})</small>
                  </strong>
                </div>
              </div>
              <p>{challenge.rules}</p>
              <form className="joinForm" onSubmit={(event) => joinChallenge(event, challenge)}>
                <input name="participant_name" placeholder="Your name" />
                <select name="role" defaultValue="Challenger">
                  <option>Challenger</option>
                  <option>Audience</option>
                </select>
                <select name="side" defaultValue="Open invite">
                  <option>Open invite</option>
                  <option>Team A</option>
                  <option>Team B</option>
                </select>
                <button disabled={joiningChallengeId === challenge.id} type="submit">
                  {joiningChallengeId === challenge.id ? "Joining..." : "Join"}
                </button>
              </form>
              <form className="proofForm" onSubmit={(event) => submitProof(event, challenge)}>
                <strong>Victory proof</strong>
                <input name="proof_url" placeholder="Paste photo, video, screenshot, or match link" />
                <textarea name="notes" rows={2} placeholder="Short note, winner name, score, or context" />
                <button disabled={savingProofChallengeId === challenge.id} type="submit">
                  {savingProofChallengeId === challenge.id ? "Saving proof..." : "Submit proof"}
                </button>
              </form>
              <form className="resultForm" onSubmit={(event) => completeChallenge(event, challenge)}>
                <strong>Finish challenge</strong>
                <select name="winner" defaultValue="">
                  <option value="">Choose winner</option>
                  <option value={challenge.team_a}>{challenge.team_a}</option>
                  <option value={challenge.team_b}>{challenge.team_b}</option>
                </select>
                <input name="final_score" placeholder="Final score, like 21-18 or 2-1" />
                <button disabled={completingChallengeId === challenge.id} type="submit">
                  {completingChallengeId === challenge.id ? "Saving result..." : "Mark completed"}
                </button>
              </form>
              {(roomProofs[challenge.id] || []).length > 0 && (
                <div className="proofList">
                  <strong>Proofs submitted</strong>
                  {(roomProofs[challenge.id] || []).slice(0, 3).map((proof) => (
                    <a href={proof.proof_url} key={proof.id} rel="noreferrer" target="_blank">
                      <span>{proof.notes || "Open proof"}</span>
                      <small>View proof</small>
                    </a>
                  ))}
                </div>
              )}
              <div className="roomButtons">
                <button type="button" onClick={() => voteForWinner(challenge.id, challenge.team_a)}>
                  Vote A
                </button>
                <button type="button" onClick={() => voteForWinner(challenge.id, challenge.team_b)}>
                  Vote B
                </button>
                <button type="button" onClick={() => rateChallenge(challenge.id, 7)}>
                  Rate 7/7
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section leaderboard">
        <div className="sectionHeader">
          <p className="eyebrow">Leaderboard</p>
          <h2>Top challenge rooms</h2>
          <p>Ranked by joins, votes, ratings, and proof activity.</p>
        </div>
        <div className="leaderGrid">
          {leaderboard.map((item, index) => (
            <article key={item.challenge.id}>
              <b>#{index + 1}</b>
              <strong>{item.challenge.title}</strong>
              <span>{item.challenge.lane}</span>
              <div className="leaderStats">
                <small>{item.joinsTotal} joins</small>
                <small>{item.votesTotal} votes</small>
                <small>{item.ratingAverage}/7</small>
                <small>{item.proofsTotal} proofs</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
