"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
    created_at: new Date().toISOString()
  }
];

export default function Home() {
  const [challenges, setChallenges] = useState<Challenge[]>(sampleChallenges);
  const [selectedLane, setSelectedLane] = useState<ChallengeLane | "All">("All");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const visibleChallenges = useMemo(() => {
    if (selectedLane === "All") return challenges;
    return challenges.filter((challenge) => challenge.lane === selectedLane);
  }, [challenges, selectedLane]);

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
        created_at: new Date().toISOString(),
        ...challenge
      };
      setChallenges((items) => [localChallenge, ...items]);
      setMessage("Demo mode: challenge added on this device only. Connect Supabase to save it for everyone.");
      setIsSaving(false);
      formElement.reset();
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
      setChallenges((items) => [data as Challenge, ...items]);
      setMessage("Challenge created.");
      formElement.reset();
    }

    setIsSaving(false);
  }

  async function rateChallenge(challengeId: string, rating: number) {
    if (!supabase || challengeId.startsWith("sample-")) {
      setMessage(`Demo mode: saved a ${rating}/7 rating locally for this preview.`);
      return;
    }

    const { error } = await supabase.from("ratings").insert({
      challenge_id: challengeId,
      rating
    });

    setMessage(error ? `Could not save rating: ${error.message}` : `Saved ${rating}/7 rating.`);
  }

  async function voteForWinner(challengeId: string, winner: string) {
    if (!supabase || challengeId.startsWith("sample-")) {
      setMessage(`Demo mode: vote recorded locally for ${winner}.`);
      return;
    }

    const { error } = await supabase.from("votes").insert({
      challenge_id: challengeId,
      winner
    });

    setMessage(error ? `Could not save vote: ${error.message}` : `Vote saved for ${winner}.`);
  }

  return (
    <main>
      <header className="hero">
        <nav>
          <strong>Talent7</strong>
          <a href="https://www.jointalent7.com">Public site</a>
        </nav>
        <section>
          <p className="eyebrow">Challenge MVP</p>
          <h1>Real challenge rooms for Talent, Sports, and Gaming</h1>
          <p>
            This is the first real app direction: create proof-based challenges, invite opponents,
            collect ratings, vote winners, and build leaderboards before live video.
          </p>
          <div className="heroActions">
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
            <article className="roomCard" key={challenge.id}>
              <span>{challenge.lane}</span>
              <h3>{challenge.title}</h3>
              <div className="versus">
                <strong>{challenge.team_a}</strong>
                <b>vs</b>
                <strong>{challenge.team_b}</strong>
              </div>
              <p>{challenge.rules}</p>
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
          <h2>First leaderboard shape</h2>
          <p>These rankings become real once ratings and votes are connected to Supabase.</p>
        </div>
        <div className="leaderGrid">
          <article><strong>#1 Badminton doubles</strong><span>Most requested first challenge</span></article>
          <article><strong>#2 Breakdance battle</strong><span>Best talent battle candidate</span></article>
          <article><strong>#3 Mobile gaming match</strong><span>Best gaming lane candidate</span></article>
        </div>
      </section>
    </main>
  );
}
