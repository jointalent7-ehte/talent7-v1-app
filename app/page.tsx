"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "../lib/supabase";

type ChallengeLane = "Talent battle" | "Sports challenge" | "Mobile gaming challenge";
type ChallengeStatusFilter = "All" | "Open" | "Completed";

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
  created_by?: string | null;
  completed_by?: string | null;
  created_at: string;
};

type JoinRole = "Challenger" | "Audience";

type ChallengeJoin = {
  id: string;
  challenge_id: string;
  user_id?: string | null;
  participant_name: string;
  role: JoinRole;
  side: string;
  created_at: string;
};

type ChallengeRating = {
  id: string;
  challenge_id: string;
  user_id?: string | null;
  rating: number;
  created_at: string;
};

type ChallengeVote = {
  id: string;
  challenge_id: string;
  user_id?: string | null;
  winner: string;
  created_at: string;
};

type ChallengeProof = {
  id: string;
  challenge_id: string;
  user_id?: string | null;
  proof_type?: string | null;
  review_status?: string | null;
  proof_url: string;
  notes: string | null;
  created_at: string;
};

type ChallengeInvite = {
  id: string;
  challenge_id: string;
  from_user_id: string;
  invited_user_id: string;
  invited_name: string;
  status: "Pending" | "Accepted" | "Declined";
  created_at: string;
  updated_at?: string | null;
};

type ProfileFollow = {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
};

type ReportReason = "Spam" | "Fake proof" | "Abuse" | "Wrong category" | "Other";

type TalentProfile = {
  user_id: string;
  display_name: string;
  username: string;
  role: string;
  main_interest: string;
  region: string;
  updated_at: string;
};

type ChallengeDraft = {
  title: string;
  lane: ChallengeLane;
  team_a: string;
  team_b: string;
  rules: string;
  invitedProfile: string;
  invitedUserId: string;
  version: number;
};

const defaultChallengeDraft: ChallengeDraft = {
  title: "Badminton doubles",
  lane: "Sports challenge",
  team_a: "Rohan + Dev",
  team_b: "Open invite",
  rules: "Best of 3 games, 21 points each. Upload victory proof after the match.",
  invitedProfile: "",
  invitedUserId: "",
  version: 0
};

function laneForInterest(interest: string): ChallengeLane {
  const normalized = interest.toLowerCase();

  if (normalized.includes("pubg") || normalized.includes("gaming") || normalized.includes("game")) {
    return "Mobile gaming challenge";
  }

  if (normalized.includes("dance") || normalized.includes("break") || normalized.includes("calisthenics")) {
    return "Talent battle";
  }

  return "Sports challenge";
}

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
  const [selectedStatus, setSelectedStatus] = useState<ChallengeStatusFilter>("All");
  const [roomSearch, setRoomSearch] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [challengeDraft, setChallengeDraft] = useState<ChallengeDraft>(defaultChallengeDraft);
  const [selectedActivityProfile, setSelectedActivityProfile] = useState<TalentProfile | null>(null);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [authMode, setAuthMode] = useState<"Sign up" | "Log in">("Sign up");
  const [authLoading, setAuthLoading] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<TalentProfile | null>(null);
  const [publicProfiles, setPublicProfiles] = useState<TalentProfile[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [joiningChallengeId, setJoiningChallengeId] = useState<string | null>(null);
  const [createdChallengeId, setCreatedChallengeId] = useState<string | null>(null);
  const [completingChallengeId, setCompletingChallengeId] = useState<string | null>(null);
  const [savingProofChallengeId, setSavingProofChallengeId] = useState<string | null>(null);
  const [reportingChallengeId, setReportingChallengeId] = useState<string | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [joinChoices, setJoinChoices] = useState<Record<string, { role: JoinRole; side: string }>>({});
  const [proofTypes, setProofTypes] = useState<Record<string, string>>({});
  const [joins, setJoins] = useState<ChallengeJoin[]>([]);
  const [ratings, setRatings] = useState<ChallengeRating[]>([]);
  const [votes, setVotes] = useState<ChallengeVote[]>([]);
  const [proofs, setProofs] = useState<ChallengeProof[]>([]);
  const [invites, setInvites] = useState<ChallengeInvite[]>([]);
  const [follows, setFollows] = useState<ProfileFollow[]>([]);
  const [followActionId, setFollowActionId] = useState<string | null>(null);

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
    const search = roomSearch.trim().toLowerCase();

    const filteredChallenges = challenges.filter((challenge) => {
      const laneMatches = selectedLane === "All" || challenge.lane === selectedLane;
      const statusMatches = selectedStatus === "All" || challenge.status === selectedStatus;
      const profileActivityMatches =
        !selectedActivityProfile || challengeMatchesProfileActivity(challenge, selectedActivityProfile);
      const searchableText = [
        challenge.title,
        challenge.lane,
        challenge.status,
        challenge.team_a,
        challenge.team_b,
        challenge.rules,
        challenge.winner || ""
      ]
        .join(" ")
        .toLowerCase();
      const searchMatches = !search || searchableText.includes(search);

      return laneMatches && statusMatches && profileActivityMatches && searchMatches;
    });

    return [...filteredChallenges].sort((first, second) => {
      const scoreDifference = (activityScores[second.id] || 0) - (activityScores[first.id] || 0);
      if (scoreDifference !== 0) return scoreDifference;
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
    });
  }, [
    activityScores,
    challenges,
    joins,
    proofs,
    ratings,
    roomSearch,
    selectedActivityProfile,
    selectedLane,
    selectedStatus,
    votes
  ]);

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

  const visibleProfiles = useMemo(() => {
    const search = profileSearch.trim().toLowerCase();

    if (!search) return publicProfiles;

    return publicProfiles.filter((item) =>
      [item.display_name, item.username, item.role, item.main_interest, item.region]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }, [profileSearch, publicProfiles]);

  const followCounts = useMemo(() => {
    return follows.reduce<Record<string, { followers: number; following: number }>>((counts, follow) => {
      const followedCounts = counts[follow.following_id] || { followers: 0, following: 0 };
      const followerCounts = counts[follow.follower_id] || { followers: 0, following: 0 };

      followedCounts.followers += 1;
      followerCounts.following += 1;
      counts[follow.following_id] = followedCounts;
      counts[follow.follower_id] = followerCounts;
      return counts;
    }, {});
  }, [follows]);

  const myFollowingProfiles = useMemo(() => {
    if (!session?.user.id) return [];

    const followedIds = follows
      .filter((follow) => follow.follower_id === session.user.id)
      .map((follow) => follow.following_id);

    return publicProfiles.filter((item) => followedIds.includes(item.user_id));
  }, [follows, publicProfiles, session]);

  const followingFeed = useMemo(() => {
    if (!session?.user.id) return [];

    const followedIds = follows
      .filter((follow) => follow.follower_id === session.user.id)
      .map((follow) => follow.following_id);
    const followedSet = new Set(followedIds);
    const profileById = publicProfiles.reduce<Record<string, TalentProfile>>((profiles, item) => {
      profiles[item.user_id] = item;
      return profiles;
    }, {});
    const roomById = challenges.reduce<Record<string, Challenge>>((rooms, challenge) => {
      rooms[challenge.id] = challenge;
      return rooms;
    }, {});

    const createdItems = challenges
      .filter((challenge) => challenge.created_by && followedSet.has(challenge.created_by))
      .map((challenge) => {
        const actor = challenge.created_by ? profileById[challenge.created_by] : null;

        return {
          id: `created-${challenge.id}`,
          actor: actor?.display_name || "Followed profile",
          action: "created a challenge",
          title: challenge.title,
          detail: challenge.lane,
          createdAt: challenge.created_at,
          challengeId: challenge.id
        };
      });

    const joinedItems = joins
      .filter((join) => join.user_id && followedSet.has(join.user_id))
      .map((join) => {
        const actor = join.user_id ? profileById[join.user_id] : null;

        return {
          id: `joined-${join.id}`,
          actor: actor?.display_name || join.participant_name,
          action: `joined as ${join.role.toLowerCase()}`,
          title: roomById[join.challenge_id]?.title || "Challenge room",
          detail: join.side,
          createdAt: join.created_at,
          challengeId: join.challenge_id
        };
      });

    const proofItems = proofs
      .filter((proof) => proof.user_id && followedSet.has(proof.user_id))
      .map((proof) => {
        const actor = proof.user_id ? profileById[proof.user_id] : null;

        return {
          id: `proof-${proof.id}`,
          actor: actor?.display_name || "Followed profile",
          action: `submitted ${proof.proof_type || "proof"}`,
          title: roomById[proof.challenge_id]?.title || "Challenge room",
          detail: proof.review_status || "Pending review",
          createdAt: proof.created_at,
          challengeId: proof.challenge_id
        };
      });

    const completedItems = challenges
      .filter((challenge) => challenge.completed_by && followedSet.has(challenge.completed_by))
      .map((challenge) => {
        const actor = challenge.completed_by ? profileById[challenge.completed_by] : null;

        return {
          id: `completed-${challenge.id}`,
          actor: actor?.display_name || "Followed profile",
          action: "completed a challenge",
          title: challenge.title,
          detail: challenge.winner ? `Winner: ${challenge.winner}` : "Winner declared",
          createdAt: challenge.completed_at || challenge.created_at,
          challengeId: challenge.id
        };
      });

    return [...createdItems, ...joinedItems, ...proofItems, ...completedItems]
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
      .slice(0, 12);
  }, [challenges, follows, joins, proofs, publicProfiles, session]);

  const myActivity = useMemo(() => {
    if (!session?.user.id) {
      return {
        joined: [] as ChallengeJoin[],
        votes: [] as ChallengeVote[],
        ratings: [] as ChallengeRating[],
        proofs: [] as ChallengeProof[],
        created: [] as Challenge[],
        completed: [] as Challenge[]
      };
    }

    const userId = session.user.id;

    return {
      joined: joins.filter((join) => join.user_id === userId),
      votes: votes.filter((vote) => vote.user_id === userId),
      ratings: ratings.filter((rating) => rating.user_id === userId),
      proofs: proofs.filter((proof) => proof.user_id === userId),
      created: challenges.filter((challenge) => challenge.created_by === userId),
      completed: challenges.filter((challenge) => challenge.completed_by === userId)
    };
  }, [challenges, joins, proofs, ratings, session, votes]);

  const inviteInbox = useMemo(() => {
    if (!session?.user.id) {
      return {
        received: [] as ChallengeInvite[],
        sent: [] as ChallengeInvite[]
      };
    }

    return {
      received: invites.filter((invite) => invite.invited_user_id === session.user.id),
      sent: invites.filter((invite) => invite.from_user_id === session.user.id)
    };
  }, [invites, session]);

  const selectedProfileActivity = useMemo(() => {
    if (!selectedActivityProfile) return null;

    const userId = selectedActivityProfile.user_id;
    const relatedChallenges = challenges.filter((challenge) =>
      challengeMatchesProfileActivity(challenge, selectedActivityProfile)
    );

    return {
      joined: joins.filter((join) => join.user_id === userId),
      votes: votes.filter((vote) => vote.user_id === userId),
      ratings: ratings.filter((rating) => rating.user_id === userId),
      proofs: proofs.filter((proof) => proof.user_id === userId),
      created: challenges.filter((challenge) => challenge.created_by === userId),
      completed: challenges.filter((challenge) => challenge.completed_by === userId),
      relatedChallenges
    };
  }, [challenges, joins, proofs, ratings, selectedActivityProfile, votes]);

  function challengeTitle(challengeId: string) {
    return challenges.find((challenge) => challenge.id === challengeId)?.title || "Challenge room";
  }

  function challengeMatchesProfileActivity(challenge: Challenge, item: TalentProfile) {
    const terms = [item.display_name, item.username, item.main_interest]
      .filter(Boolean)
      .map((term) => term.toLowerCase());
    const directRoomText = [
      challenge.title,
      challenge.lane,
      challenge.team_a,
      challenge.team_b,
      challenge.rules,
      challenge.winner || ""
    ]
      .join(" ")
      .toLowerCase();

    const textMatches = terms.some((term) => directRoomText.includes(term));
    const userIdMatches = challenge.created_by === item.user_id || challenge.completed_by === item.user_id;
    const joinMatches = joins.some(
      (join) =>
        join.challenge_id === challenge.id &&
        (join.user_id === item.user_id ||
          terms.some((term) => join.participant_name.toLowerCase().includes(term)))
    );
    const voteMatches = votes.some((vote) => vote.challenge_id === challenge.id && vote.user_id === item.user_id);
    const ratingMatches = ratings.some(
      (rating) => rating.challenge_id === challenge.id && rating.user_id === item.user_id
    );
    const proofMatches = proofs.some(
      (proof) =>
        proof.challenge_id === challenge.id &&
        (proof.user_id === item.user_id ||
          terms.some((term) => `${proof.notes || ""} ${proof.proof_url}`.toLowerCase().includes(term)))
    );

    return textMatches || userIdMatches || joinMatches || voteMatches || ratingMatches || proofMatches;
  }

  function roomJoins(challengeId: string) {
    return joins.filter((join) => join.challenge_id === challengeId);
  }

  function participantGroup(challengeId: string, side: string, role?: JoinRole) {
    return roomJoins(challengeId).filter((join) => {
      const sideMatches = join.side === side;
      const roleMatches = !role || join.role === role;

      return sideMatches && roleMatches;
    });
  }

  function joinChoice(challengeId: string) {
    return joinChoices[challengeId] || { role: "Challenger" as JoinRole, side: "Open invite" };
  }

  function updateJoinChoice(challengeId: string, choice: Partial<{ role: JoinRole; side: string }>) {
    setJoinChoices((current) => ({
      ...current,
      [challengeId]: {
        ...(current[challengeId] || { role: "Challenger" as JoinRole, side: "Open invite" }),
        ...choice
      }
    }));
  }

  function selectedProofType(challengeId: string) {
    return proofTypes[challengeId] || "Video";
  }

  function updateProofType(challengeId: string, proofType: string) {
    setProofTypes((current) => ({
      ...current,
      [challengeId]: proofType
    }));
  }

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

  useEffect(() => {
    async function loadInvites() {
      if (!supabase || !session?.user.id) {
        setInvites([]);
        return;
      }

      const { data, error } = await supabase
        .from("challenge_invites")
        .select("*")
        .or(`from_user_id.eq.${session.user.id},invited_user_id.eq.${session.user.id}`)
        .order("created_at", { ascending: false });

      if (error) return;
      if (data) setInvites(data as ChallengeInvite[]);
    }

    loadInvites();
  }, [session]);

  useEffect(() => {
    async function loadFollows() {
      if (!supabase || !session?.user.id) {
        setFollows([]);
        return;
      }

      const { data, error } = await supabase
        .from("profile_follows")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return;
      if (data) setFollows(data as ProfileFollow[]);
    }

    loadFollows();
  }, [session]);

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
      setConfirmationEmail(email);
      setMessage("Account created. Check your email to confirm it, then log in.");
    } else {
      setConfirmationEmail("");
      setMessage(authMode === "Sign up" ? "Account created and logged in." : "Logged in.");
    }

    setAuthLoading(false);
  }

  async function logOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMessage("Logged out.");
  }

  function requireLogin(action: string) {
    if (session) return true;

    setMessage(`Please log in before you ${action}.`);
    setTimeout(() => document.getElementById("account")?.scrollIntoView({ behavior: "smooth" }), 80);
    return false;
  }

  function hasUserRated(challengeId: string) {
    return Boolean(session?.user.id && ratings.some((rating) => rating.challenge_id === challengeId && rating.user_id === session.user.id));
  }

  function hasUserVoted(challengeId: string) {
    return Boolean(session?.user.id && votes.some((vote) => vote.challenge_id === challengeId && vote.user_id === session.user.id));
  }

  function profileName() {
    return profile?.display_name || (profile?.username ? `@${profile.username}` : "Save profile first");
  }

  function requireProfile(action: string) {
    if (profile?.display_name && profile?.username) return true;

    setMessage(`Please save your profile before you ${action}.`);
    setTimeout(() => document.getElementById("account")?.scrollIntoView({ behavior: "smooth" }), 80);
    return false;
  }

  function isChallengeCompleted(challenge: Challenge) {
    return challenge.status === "Completed";
  }

  useEffect(() => {
    async function loadPublicProfiles() {
      if (!supabase) return;

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(12);

      if (data) setPublicProfiles(data as TalentProfile[]);
    }

    loadPublicProfiles();
  }, []);

  useEffect(() => {
    async function loadProfile() {
      if (!supabase || !session?.user.id) {
        setProfile(null);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      setProfile((data as TalentProfile | null) || null);
    }

    loadProfile();
  }, [session]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!requireLogin("save your profile")) return;
    if (!supabase || !session?.user.id) return;

    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("display_name") || "").trim();
    const username = String(form.get("username") || "").trim().replace(/^@/, "").toLowerCase();

    if (!displayName || !username) {
      setMessage("Add both display name and username.");
      return;
    }

    setProfileLoading(true);
    setMessage("");

    const profileData = {
      user_id: session.user.id,
      display_name: displayName,
      username,
      role: String(form.get("role") || "Challenger"),
      main_interest: String(form.get("main_interest") || "Badminton doubles"),
      region: String(form.get("region") || "").trim() || "Global",
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("profiles")
      .upsert(profileData, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) {
      setMessage(error.code === "23505" ? "That username is already taken." : `Could not save profile: ${error.message}`);
    } else if (data) {
      setProfile(data as TalentProfile);
      setPublicProfiles((items) => {
        const savedProfile = data as TalentProfile;
        const others = items.filter((item) => item.user_id !== savedProfile.user_id);

        return [savedProfile, ...others].slice(0, 12);
      });
      setMessage("Profile saved.");
    }

    setProfileLoading(false);
  }

  async function createChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireLogin("create a challenge")) return;

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
      status: "Open",
      created_by: session?.user.id
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
      const inviteMessage = await sendInviteForChallenge(savedChallenge);

      setChallenges((items) => [savedChallenge, ...items]);
      setCreatedChallengeId(savedChallenge.id);
      setSelectedLane(savedChallenge.lane);
      setMessage(
        inviteMessage
          ? `Challenge created. ${inviteMessage}`
          : "Challenge created. No invite was sent because no profile invite target was selected."
      );
      formElement.reset();
      setTimeout(() => document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" }), 80);
    }

    setIsSaving(false);
  }

  async function sendInviteForChallenge(challenge: Challenge) {
    if (!supabase || !session?.user.id || !challengeDraft.invitedUserId) return "";

    if (challengeDraft.invitedUserId === session.user.id) {
      return "Invite skipped because this profile is yours.";
    }

    const invite = {
      challenge_id: challenge.id,
      from_user_id: session.user.id,
      invited_user_id: challengeDraft.invitedUserId,
      invited_name: challengeDraft.invitedProfile || challenge.team_b,
      status: "Pending"
    };

    const { data, error } = await supabase
      .from("challenge_invites")
      .insert(invite)
      .select("*")
      .single();

    if (error) {
      return `Challenge invite could not be saved yet: ${error.message}`;
    }

    if (data) setInvites((items) => [data as ChallengeInvite, ...items]);
    return `Invite sent to ${invite.invited_name}.`;
  }

  function inviteProfileToChallenge(item: TalentProfile) {
    const invitedName = item.display_name || `@${item.username}`;
    const interest = item.main_interest || "New challenge";
    const creatorName = profile?.display_name || (profile?.username ? `@${profile.username}` : "Open challenger");

    setChallengeDraft((currentDraft) => ({
      title: interest,
      lane: laneForInterest(interest),
      team_a: creatorName,
      team_b: invitedName,
      rules: `${interest} challenge with ${invitedName}. Upload proof after the match.`,
      invitedProfile: invitedName,
      invitedUserId: item.user_id,
      version: currentDraft.version + 1
    }));

    setMessage(`Invite draft ready for ${invitedName}. Review it, then create the challenge.`);
    setTimeout(() => document.getElementById("create")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  function viewProfileActivity(item: TalentProfile) {
    setSelectedActivityProfile(item);
    setRoomSearch("");
    setSelectedLane("All");
    setSelectedStatus("All");
    setMessage(`${item.display_name}'s public activity is now shown in Challenge rooms.`);
    setTimeout(() => document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  async function toggleFollow(item: TalentProfile) {
    if (!requireLogin("follow profiles")) return;
    if (!requireProfile("follow profiles")) return;
    if (!supabase || !session?.user.id) return;

    if (item.user_id === session.user.id) {
      setMessage("You cannot follow your own profile.");
      return;
    }

    const existingFollow = follows.find(
      (follow) => follow.follower_id === session.user.id && follow.following_id === item.user_id
    );

    setFollowActionId(item.user_id);
    setMessage("");

    if (existingFollow) {
      const { error } = await supabase.from("profile_follows").delete().eq("id", existingFollow.id);

      if (error) {
        setMessage(`Could not unfollow yet: ${error.message}`);
      } else {
        setFollows((items) => items.filter((follow) => follow.id !== existingFollow.id));
        setMessage(`Unfollowed ${item.display_name}.`);
      }

      setFollowActionId(null);
      return;
    }

    const { data, error } = await supabase
      .from("profile_follows")
      .insert({
        follower_id: session.user.id,
        following_id: item.user_id
      })
      .select("*")
      .single();

    if (error) {
      setMessage(error.code === "23505" ? `You already follow ${item.display_name}.` : `Could not follow yet: ${error.message}`);
    } else if (data) {
      setFollows((items) => [data as ProfileFollow, ...items]);
      setMessage(`Following ${item.display_name}.`);
    }

    setFollowActionId(null);
  }

  async function respondToInvite(invite: ChallengeInvite, status: "Accepted" | "Declined") {
    if (!requireLogin("respond to an invite")) return;
    if (status === "Accepted" && !requireProfile("accept an invite")) return;
    if (!supabase || !session?.user.id) return;

    setInviteActionId(invite.id);
    setMessage("");

    let joinedRoom: ChallengeJoin | null = null;

    if (status === "Accepted") {
      const alreadyJoined = joins.some(
        (join) => join.challenge_id === invite.challenge_id && join.user_id === session.user.id
      );

      if (!alreadyJoined) {
        const { data: joinData, error: joinError } = await supabase
          .from("challenge_joins")
          .insert({
            challenge_id: invite.challenge_id,
            user_id: session.user.id,
            participant_name: profileName(),
            role: "Challenger",
            side: "Team B"
          })
          .select("*")
          .single();

        if (joinError) {
          setMessage(`Could not accept invite yet: ${joinError.message}`);
          setInviteActionId(null);
          return;
        }

        joinedRoom = joinData as ChallengeJoin;
      }
    }

    const { data, error } = await supabase
      .from("challenge_invites")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", invite.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update invite: ${error.message}`);
    } else if (data) {
      setInvites((items) => items.map((item) => (item.id === invite.id ? (data as ChallengeInvite) : item)));
      if (joinedRoom) setJoins((items) => [joinedRoom as ChallengeJoin, ...items]);
      setMessage(status === "Accepted" ? "Invite accepted. You joined the challenge." : "Invite declined.");
      if (status === "Accepted") {
        setSelectedLane("All");
        setSelectedStatus("All");
        setRoomSearch("");
        setTimeout(() => document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" }), 80);
      }
    }

    setInviteActionId(null);
  }

  async function joinChallenge(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    if (!requireLogin("join a challenge")) return;
    if (!requireProfile("join a challenge")) return;

    if (isChallengeCompleted(challenge)) {
      setMessage("This challenge is completed, so new joins are closed.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const participantName = profileName();

    const join = {
      challenge_id: challenge.id,
      user_id: session?.user.id,
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

  async function rateChallenge(challenge: Challenge, rating: number) {
    if (!requireLogin("rate a challenge")) return;

    if (isChallengeCompleted(challenge)) {
      setMessage("This challenge is completed, so ratings are closed.");
      return;
    }

    const challengeId = challenge.id;

    if (hasUserRated(challengeId)) {
      setMessage("You already rated this challenge.");
      return;
    }

    if (!supabase || challengeId.startsWith("sample-")) {
      setRatings((items) => [
        {
          id: crypto.randomUUID(),
          challenge_id: challengeId,
          user_id: session?.user.id,
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
        user_id: session?.user.id,
        rating
      })
      .select("*")
      .single();

    if (error) {
      setMessage(error.code === "23505" ? "You already rated this challenge." : `Could not save rating: ${error.message}`);
    } else if (data) {
      setRatings((items) => [data as ChallengeRating, ...items]);
      setMessage(`Saved ${rating}/7 rating.`);
    }
  }

  async function voteForWinner(challenge: Challenge, winner: string) {
    if (!requireLogin("vote")) return;

    if (isChallengeCompleted(challenge)) {
      setMessage("This challenge is completed, so voting is closed.");
      return;
    }

    const challengeId = challenge.id;

    if (hasUserVoted(challengeId)) {
      setMessage("You already voted on this challenge.");
      return;
    }

    if (!supabase || challengeId.startsWith("sample-")) {
      setVotes((items) => [
        {
          id: crypto.randomUUID(),
          challenge_id: challengeId,
          user_id: session?.user.id,
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
        user_id: session?.user.id,
        winner
      })
      .select("*")
      .single();

    if (error) {
      setMessage(error.code === "23505" ? "You already voted on this challenge." : `Could not save vote: ${error.message}`);
    } else if (data) {
      setVotes((items) => [data as ChallengeVote, ...items]);
      setMessage(`Vote saved for ${winner}.`);
    }
  }

  async function submitProof(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    if (!requireLogin("submit proof")) return;

    if (isChallengeCompleted(challenge)) {
      setMessage("This challenge is completed, so proof uploads are closed.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const proofUrl = String(form.get("proof_url") || "").trim();
    const proofType = String(form.get("proof_type") || "Video");
    const notes = String(form.get("notes") || "").trim();

    if (!proofUrl) {
      setMessage("Please paste a proof link first.");
      return;
    }

    const proof = {
      challenge_id: challenge.id,
      user_id: session?.user.id,
      proof_type: proofType,
      review_status: "Pending review",
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

  async function submitReport(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    if (!requireLogin("submit a report")) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const target = String(form.get("target") || "challenge");
    const reason = String(form.get("reason") || "Other") as ReportReason;
    const notes = String(form.get("notes") || "").trim();
    const proofId = target.startsWith("proof:") ? target.replace("proof:", "") : null;

    const report = {
      challenge_id: challenge.id,
      proof_id: proofId,
      reporter_id: session?.user.id,
      target_type: proofId ? "Proof" : "Challenge",
      reason,
      notes: notes || null,
      status: "Open"
    };

    setReportingChallengeId(challenge.id);
    setMessage("");

    if (!supabase || challenge.id.startsWith("sample-")) {
      setMessage("Report saved for this preview.");
      formElement.reset();
      setReportingChallengeId(null);
      return;
    }

    const { error } = await supabase.from("reports").insert(report);

    if (error) {
      setMessage(`Could not submit report: ${error.message}`);
    } else {
      setMessage("Report submitted. Thank you for helping keep Talent7 safe.");
      formElement.reset();
    }

    setReportingChallengeId(null);
  }

  async function completeChallenge(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    if (!requireLogin("complete a challenge")) return;

    if (isChallengeCompleted(challenge)) {
      setMessage("This challenge is already completed.");
      return;
    }

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
      completed_at: new Date().toISOString(),
      completed_by: session?.user.id
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
            <span>{session ? profileName() : "Guest mode"}</span>
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
            <a href="#profiles" className="secondary">Profiles</a>
            <a href="#my-talent7" className="secondary">My Talent7</a>
            <a href="#following-feed" className="secondary">Feed</a>
            <a href="#invites" className="secondary">Invites</a>
            <a href="#safety" className="secondary">Safety</a>
            <a href="#plans" className="secondary">Plans</a>
            <a href="#roadmap" className="secondary">Roadmap</a>
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
          <div className="profileStack">
            <div className="accountCard">
              <div>
                <span>Logged in as</span>
                <strong>{profileName()}</strong>
                <small>{session.user.email}</small>
              </div>
              <button type="button" onClick={logOut}>Log out</button>
            </div>
            <form className="profileForm" key={profile?.updated_at || session.user.id} onSubmit={saveProfile}>
              <label>
                Display name
                <input name="display_name" defaultValue={profile?.display_name || ""} placeholder="Rahul Sharma" />
              </label>
              <label>
                Username
                <input name="username" defaultValue={profile?.username || ""} placeholder="rahulbadminton" />
              </label>
              <label>
                Role
                <select name="role" defaultValue={profile?.role || "Challenger"}>
                  <option>Challenger</option>
                  <option>Audience / voter</option>
                  <option>Coach / instructor</option>
                  <option>Sports organizer</option>
                  <option>Gaming squad / clan</option>
                </select>
              </label>
              <label>
                Main interest
                <select name="main_interest" defaultValue={profile?.main_interest || "Badminton doubles"}>
                  <option>Badminton doubles</option>
                  <option>Breakdance battle</option>
                  <option>PUBG squad battle</option>
                  <option>Swimming</option>
                  <option>Calisthenics</option>
                  <option>Mobile gaming</option>
                </select>
              </label>
              <label className="wide">
                Region
                <input name="region" defaultValue={profile?.region || ""} placeholder="India, UAE, USA, Global..." />
              </label>
              <button disabled={profileLoading} type="submit">
                {profileLoading ? "Saving profile..." : "Save profile"}
              </button>
            </form>
          </div>
        ) : (
          <form className="authForm" onSubmit={handleAuth}>
            <div className="authTabs">
              {(["Sign up", "Log in"] as const).map((mode) => (
                <button
                  className={authMode === mode ? "active" : ""}
                  key={mode}
                  onClick={() => {
                    setAuthMode(mode);
                    if (mode === "Log in") setConfirmationEmail("");
                  }}
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </div>
            {confirmationEmail && (
              <div className="confirmEmailNotice">
                <strong>Check your email to finish signup</strong>
                <span>We sent a confirmation link to {confirmationEmail}.</span>
                <small>Open that email, confirm your account, then come back and log in.</small>
              </div>
            )}
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

      <section className="section safetySection" id="safety">
        <div className="sectionHeader">
          <p className="eyebrow">Community safety</p>
          <h2>Play fair, prove honestly, stay safe</h2>
          <p>Talent7 works only if challenges, proof, and community help are handled with trust.</p>
        </div>
        <div className="safetyGrid">
          <article>
            <strong>No fake proof</strong>
            <p>Upload real proof from the actual challenge. Edited, misleading, or unrelated proof can be reported.</p>
          </article>
          <article>
            <strong>No harassment</strong>
            <p>Challenge people respectfully. Do not use abuse, threats, hate, or pressure to force participation.</p>
          </article>
          <article>
            <strong>Use your own content</strong>
            <p>Only upload photos, videos, screenshots, or links you own or have permission to share.</p>
          </article>
          <article>
            <strong>Respect venues</strong>
            <p>For sports meetups, follow local court, pool, gym, and event rules before recording or playing.</p>
          </article>
          <article>
            <strong>Report problems</strong>
            <p>Use Report issue in Room details if a challenge, vote, or proof looks abusive, spammy, or fake.</p>
          </article>
          <article>
            <strong>Emergency help caution</strong>
            <p>Future live help is guidance only. For medical or urgent danger, call local emergency services first.</p>
          </article>
        </div>
      </section>

      <section className="section plansSection" id="plans">
        <div className="sectionHeader">
          <p className="eyebrow">Plans & contributions</p>
          <h2>Keep watching free, grow Talent7 together</h2>
          <p>These are early placeholders for how Talent7 can stay free for audiences while supporting challenge tools, coaching, and the founder.</p>
        </div>
        <div className="plansGrid">
          <article>
            <span>Audience</span>
            <strong>Free</strong>
            <p>Watch rooms, vote, rate, follow results, and discover talent without a platform fee.</p>
          </article>
          <article>
            <span>Challenger</span>
            <strong>Subscription later</strong>
            <p>For people creating frequent challenges, joining competitive rooms, and building challenge history.</p>
          </article>
          <article>
            <span>Coach / instructor</span>
            <strong>Platform fee later</strong>
            <p>For coaches who upload training, run live sessions, and grow paid coaching inside Talent7.</p>
          </article>
        </div>
        <div className="contributionBox">
          <div>
            <p className="eyebrow">Founder support</p>
            <h3>Contribute as a kind gesture</h3>
            <p>Talent7 is being built by a standalone founder. If you like the idea and want to help it grow, these future contribution ranges will be in US dollars.</p>
          </div>
          <div className="contributionButtons">
            {["$0-50", "$50-200", "$200-1000", "$1000+"].map((amount) => (
              <button key={amount} type="button">{amount}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="section roadmapSection" id="roadmap">
        <div className="sectionHeader">
          <p className="eyebrow">Founder roadmap</p>
          <h2>What Talent7 is building toward</h2>
          <p>This is an early version. The first goal is to prove that people want fair, proof-based challenge rooms before adding heavier live features.</p>
        </div>
        <div className="roadmapGrid">
          <article>
            <span>Now</span>
            <strong>Proof-based challenge rooms</strong>
            <p>Create challenges, join as challenger or audience, vote, rate, upload proof, report issues, and lock winners.</p>
          </article>
          <article>
            <span>Next</span>
            <strong>Profiles, coaching, and sports links</strong>
            <p>Improve public profiles, add coaching flows, and connect sports challenges to booking links by city or region.</p>
          </article>
          <article>
            <span>Later</span>
            <strong>Live battles and expert help</strong>
            <p>Add two-screen live challenge battles, real payments, instructor tools, and carefully designed emergency/expert video help.</p>
          </article>
        </div>
      </section>

      <section className="section profilesSection" id="profiles">
        <div className="sectionHeader">
          <p className="eyebrow">Profiles</p>
          <h2>Talent7 people</h2>
          <p>Discover challengers, audience voters, coaches, organizers, and gaming squads building early Talent7 history.</p>
        </div>
        <label className="profileSearch">
          Search profiles
          <input
            onChange={(event) => setProfileSearch(event.target.value)}
            placeholder="Search coach, badminton, India, gaming..."
            type="search"
            value={profileSearch}
          />
        </label>
        {publicProfiles.length > 0 ? (
          <div className="profileGrid">
            {visibleProfiles.length === 0 && (
              <div className="emptyProfiles">
                <strong>No profiles found</strong>
                <small>Try a different name, role, interest, or region.</small>
              </div>
            )}
            {visibleProfiles.map((item) => (
              <article key={item.user_id}>
                <strong>{item.display_name}</strong>
                <span>@{item.username}</span>
                <div className="followStats">
                  <small>{followCounts[item.user_id]?.followers || 0} followers</small>
                  <small>{followCounts[item.user_id]?.following || 0} following</small>
                </div>
                <div>
                  <small>{item.role}</small>
                  <small>{item.main_interest}</small>
                  <small>{item.region}</small>
                </div>
                <div className="profileActions">
                  <button
                    disabled={followActionId === item.user_id || item.user_id === session?.user.id}
                    onClick={() => toggleFollow(item)}
                    type="button"
                  >
                    {follows.some((follow) => follow.follower_id === session?.user.id && follow.following_id === item.user_id)
                      ? "Following"
                      : item.user_id === session?.user.id
                        ? "Your profile"
                        : "Follow"}
                  </button>
                  <button onClick={() => inviteProfileToChallenge(item)} type="button">
                    Invite to challenge
                  </button>
                  <button onClick={() => viewProfileActivity(item)} type="button">
                    View rooms activity
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="emptyState">
            <strong>No public profiles yet.</strong>
            <a href="#account">Create your profile</a>
          </div>
        )}
      </section>

      <section className="section myTalent" id="my-talent7">
        <div className="sectionHeader">
          <p className="eyebrow">My Talent7</p>
          <h2>Your challenge activity</h2>
          <p>Track the rooms you joined, voted on, rated, proved, created, and completed.</p>
        </div>
        {session ? (
          <div className="myTalentGrid">
            <article>
              <span>Joined</span>
              <strong>{myActivity.joined.length}</strong>
              <small>
                {myActivity.joined[0]
                  ? `${challengeTitle(myActivity.joined[0].challenge_id)} as ${myActivity.joined[0].role}`
                  : "No joined rooms yet"}
              </small>
            </article>
            <article>
              <span>Votes</span>
              <strong>{myActivity.votes.length}</strong>
              <small>
                {myActivity.votes[0]
                  ? `${myActivity.votes[0].winner} in ${challengeTitle(myActivity.votes[0].challenge_id)}`
                  : "No votes yet"}
              </small>
            </article>
            <article>
              <span>Ratings</span>
              <strong>{myActivity.ratings.length}</strong>
              <small>
                {myActivity.ratings[0]
                  ? `${myActivity.ratings[0].rating}/7 for ${challengeTitle(myActivity.ratings[0].challenge_id)}`
                  : "No ratings yet"}
              </small>
            </article>
            <article>
              <span>Proofs</span>
              <strong>{myActivity.proofs.length}</strong>
              <small>
                {myActivity.proofs[0]
                  ? challengeTitle(myActivity.proofs[0].challenge_id)
                  : "No proof uploads yet"}
              </small>
            </article>
            <article>
              <span>Created</span>
              <strong>{myActivity.created.length}</strong>
              <small>{myActivity.created[0]?.title || "No created challenges yet"}</small>
            </article>
            <article>
              <span>Completed</span>
              <strong>{myActivity.completed.length}</strong>
              <small>
                {myActivity.completed[0]
                  ? `${myActivity.completed[0].winner || "Winner"} won ${myActivity.completed[0].title}`
                  : "No completed challenges yet"}
              </small>
            </article>
            <article className="followingCard">
              <span>Following</span>
              <strong>{myFollowingProfiles.length}</strong>
              <small>
                {myFollowingProfiles[0]
                  ? myFollowingProfiles.map((item) => item.display_name).slice(0, 3).join(", ")
                  : "No followed profiles yet"}
              </small>
              <a href="#profiles">Find profiles</a>
            </article>
          </div>
        ) : (
          <div className="emptyState">
            <strong>Log in to see your Talent7 activity.</strong>
            <a href="#account">Go to account</a>
          </div>
        )}
      </section>

      <section className="section followingFeedSection" id="following-feed">
        <div className="sectionHeader">
          <p className="eyebrow">Following feed</p>
          <h2>Activity from people you follow</h2>
          <p>See new challenge rooms, joins, proof uploads, and completed results from followed profiles.</p>
        </div>
        {session ? (
          followingFeed.length > 0 ? (
            <div className="feedList">
              {followingFeed.map((item) => (
                <article key={item.id}>
                  <span>{item.action}</span>
                  <strong>{item.actor}</strong>
                  <a href="#rooms" onClick={() => setRoomSearch(item.title)}>
                    {item.title}
                  </a>
                  <small>{item.detail}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className="emptyState">
              <strong>No following activity yet.</strong>
              <small>Follow profiles first, then their challenge activity will appear here.</small>
              <a href="#profiles">Find profiles</a>
            </div>
          )
        ) : (
          <div className="emptyState">
            <strong>Log in to see your following feed.</strong>
            <a href="#account">Go to account</a>
          </div>
        )}
      </section>

      <section className="section invitesSection" id="invites">
        <div className="sectionHeader">
          <p className="eyebrow">Invites</p>
          <h2>Challenge invite inbox</h2>
          <p>Accept or decline challenge invitations sent by other Talent7 users.</p>
        </div>
        {session ? (
          <div className="inviteGrid">
            <article>
              <div className="inviteListHeader">
                <strong>Received invites</strong>
                <small>{inviteInbox.received.filter((invite) => invite.status === "Pending").length} pending</small>
              </div>
              {inviteInbox.received.length > 0 ? (
                inviteInbox.received.map((invite) => (
                  <div className="inviteItem" key={invite.id}>
                    <span>{invite.status}</span>
                    <strong>{challengeTitle(invite.challenge_id)}</strong>
                    <small>Sent to {invite.invited_name}</small>
                    {invite.status === "Pending" ? (
                      <div className="inviteActions">
                        <button
                          disabled={inviteActionId === invite.id}
                          onClick={() => respondToInvite(invite, "Accepted")}
                          type="button"
                        >
                          Accept
                        </button>
                        <button
                          disabled={inviteActionId === invite.id}
                          onClick={() => respondToInvite(invite, "Declined")}
                          type="button"
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <small>Invite {invite.status.toLowerCase()}.</small>
                    )}
                  </div>
                ))
              ) : (
                <div className="emptyInvite">
                  <strong>No received invites yet.</strong>
                  <small>When someone challenges you, it will appear here.</small>
                </div>
              )}
            </article>
            <article>
              <div className="inviteListHeader">
                <strong>Sent invites</strong>
                <small>{inviteInbox.sent.length} total</small>
              </div>
              {inviteInbox.sent.length > 0 ? (
                inviteInbox.sent.map((invite) => (
                  <div className="inviteItem" key={invite.id}>
                    <span>{invite.status}</span>
                    <strong>{challengeTitle(invite.challenge_id)}</strong>
                    <small>To {invite.invited_name}</small>
                  </div>
                ))
              ) : (
                <div className="emptyInvite">
                  <strong>No sent invites yet.</strong>
                  <small>Use Invite to challenge from a public profile, then create the challenge.</small>
                </div>
              )}
            </article>
          </div>
        ) : (
          <div className="emptyState">
            <strong>Log in to see challenge invites.</strong>
            <a href="#account">Go to account</a>
          </div>
        )}
      </section>

      <section className="section" id="create">
        <div className="sectionHeader">
          <p className="eyebrow">Create</p>
          <h2>Start a challenge</h2>
          <p>Use this for badminton doubles, breakdance battles, mobile gaming matches, and more.</p>
        </div>
        {challengeDraft.invitedProfile && (
          <div className="inviteNotice">
            <span>Invite will be sent to {challengeDraft.invitedProfile} when you create this challenge.</span>
            <button
              onClick={() =>
                setChallengeDraft((currentDraft) => ({
                  ...currentDraft,
                  invitedProfile: "",
                  invitedUserId: "",
                  version: currentDraft.version + 1
                }))
              }
              type="button"
            >
              Remove invite target
            </button>
          </div>
        )}
        {!challengeDraft.invitedProfile && (
          <div className="inviteNotice mutedInviteNotice">
            No invite selected. To send an invite, go to Profiles, click Invite to challenge, then create the challenge.
          </div>
        )}
        <form className="createForm" key={challengeDraft.version} onSubmit={createChallenge}>
          <label>
            Challenge title
            <input name="title" defaultValue={challengeDraft.title} />
          </label>
          <label>
            Lane
            <select name="lane" defaultValue={challengeDraft.lane}>
              <option>Talent battle</option>
              <option>Sports challenge</option>
              <option>Mobile gaming challenge</option>
            </select>
          </label>
          <label>
            Team or challenger A
            <input name="team_a" defaultValue={challengeDraft.team_a} />
          </label>
          <label>
            Team or challenger B
            <input name="team_b" defaultValue={challengeDraft.team_b} />
          </label>
          <label className="wide">
            Rules
            <textarea
              name="rules"
              rows={4}
              defaultValue={challengeDraft.rules}
            />
          </label>
          <button disabled={isSaving}>{isSaving ? "Saving..." : "Create challenge"}</button>
        </form>
      </section>

      <section className="section" id="rooms">
        <div className="sectionHeader">
          <p className="eyebrow">Rooms</p>
          <h2>Challenge rooms</h2>
          <p>Filter by lane and status, then open rooms to view proof, votes, and results.</p>
        </div>
        {selectedActivityProfile && selectedProfileActivity && (
          <div className="profileActivityPanel">
            <div>
              <span>Viewing public activity for</span>
              <strong>{selectedActivityProfile.display_name}</strong>
              <small>
                @{selectedActivityProfile.username} · {selectedActivityProfile.main_interest || "No interest yet"}
              </small>
            </div>
            <div className="profileActivityStats">
              <small>{selectedProfileActivity.joined.length} joins</small>
              <small>{selectedProfileActivity.votes.length} votes</small>
              <small>{selectedProfileActivity.ratings.length} ratings</small>
              <small>{selectedProfileActivity.proofs.length} proofs</small>
              <small>{selectedProfileActivity.relatedChallenges.length} rooms</small>
            </div>
            <div className="profileActivityActions">
              <button onClick={() => setSelectedActivityProfile(null)} type="button">
                Clear profile view
              </button>
              <a href="#profiles">Back to profiles</a>
            </div>
          </div>
        )}
        <label className="roomSearch">
          Search rooms
          <input
            onChange={(event) => setRoomSearch(event.target.value)}
            placeholder="Search badminton, PUBG, Rahul, breakdance..."
            type="search"
            value={roomSearch}
          />
        </label>
        <strong className="filterLabel">Lane</strong>
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
        <strong className="filterLabel">Status</strong>
        <div className="filters statusFilters">
          {(["All", "Open", "Completed"] as const).map((status) => (
            <button
              className={selectedStatus === status ? "active" : ""}
              key={status}
              onClick={() => setSelectedStatus(status)}
              type="button"
            >
              {status}
            </button>
          ))}
        </div>
        <div className="roomsGrid">
          {visibleChallenges.length === 0 && (
            <div className="emptyRooms">
              <strong>No rooms found</strong>
              <small>Try changing the search, lane, or status filters.</small>
            </div>
          )}
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
              {isChallengeCompleted(challenge) ? (
                <div className="closedRoom">
                  <strong>Challenge closed</strong>
                  <small>Joins, votes, ratings, and proof uploads are locked after completion.</small>
                </div>
              ) : (
                <>
                  <form className="joinForm" onSubmit={(event) => joinChallenge(event, challenge)}>
                    <input
                      name="participant_name"
                      readOnly
                      value={session ? profileName() : "Log in to join"}
                    />
                    <input name="role" type="hidden" value={joinChoice(challenge.id).role} />
                    <input name="side" type="hidden" value={joinChoice(challenge.id).side} />
                    <div className="joinPicker">
                      <span>Join as</span>
                      {(["Challenger", "Audience"] as JoinRole[]).map((role) => (
                        <button
                          className={joinChoice(challenge.id).role === role ? "active" : ""}
                          key={role}
                          onClick={() => updateJoinChoice(challenge.id, { role })}
                          type="button"
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                    <div className="joinPicker">
                      <span>Side</span>
                      {["Open invite", "Team A", "Team B"].map((side) => (
                        <button
                          className={joinChoice(challenge.id).side === side ? "active" : ""}
                          key={side}
                          onClick={() => updateJoinChoice(challenge.id, { side })}
                          type="button"
                        >
                          {side}
                        </button>
                      ))}
                    </div>
                    <button disabled={joiningChallengeId === challenge.id} type="submit">
                      {joiningChallengeId === challenge.id ? "Joining..." : "Join"}
                    </button>
                  </form>
                  <form className="proofForm" onSubmit={(event) => submitProof(event, challenge)}>
                    <strong>Victory proof</strong>
                    <input name="proof_type" type="hidden" value={selectedProofType(challenge.id)} />
                    <div className="proofTypePicker">
                      {["Photo", "Video", "Screenshot", "Match link"].map((proofType) => (
                        <button
                          className={selectedProofType(challenge.id) === proofType ? "active" : ""}
                          key={proofType}
                          onClick={() => updateProofType(challenge.id, proofType)}
                          type="button"
                        >
                          {proofType}
                        </button>
                      ))}
                    </div>
                    <input name="proof_url" placeholder="Paste photo, video, screenshot, or match link" />
                    <textarea name="notes" rows={2} placeholder="Short note, winner name, score, or context" />
                    <button disabled={savingProofChallengeId === challenge.id} type="submit">
                      {savingProofChallengeId === challenge.id ? "Saving proof..." : "Submit proof"}
                    </button>
                  </form>
                </>
              )}
              {!isChallengeCompleted(challenge) && (
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
              )}
              {(roomProofs[challenge.id] || []).length > 0 && (
                <div className="proofList">
                  <strong>Proofs submitted</strong>
                  {(roomProofs[challenge.id] || []).slice(0, 3).map((proof) => (
                    <a href={proof.proof_url} key={proof.id} rel="noreferrer" target="_blank">
                      <span>{proof.proof_type ? `${proof.proof_type}: ${proof.notes || "Open proof"}` : proof.notes || "Open proof"}</span>
                      <small>
                        {proof.review_status || "Pending review"} | View proof
                      </small>
                    </a>
                  ))}
                </div>
              )}
              <details className="roomDetails">
                <summary>Room details</summary>
                <div className="detailGrid">
                  <div>
                    <span>Status</span>
                    <strong>{challenge.status}</strong>
                  </div>
                  <div>
                    <span>Winner</span>
                    <strong>{challenge.winner || "Not decided"}</strong>
                  </div>
                  <div>
                    <span>Proofs</span>
                    <strong>{(roomProofs[challenge.id] || []).length}</strong>
                  </div>
                  <div>
                    <span>Activity score</span>
                    <strong>{activityScores[challenge.id] || 0}</strong>
                  </div>
                </div>
                <div className="participantGrid">
                  {[
                    { title: "Team A", people: participantGroup(challenge.id, "Team A", "Challenger") },
                    { title: "Team B", people: participantGroup(challenge.id, "Team B", "Challenger") },
                    { title: "Open invite", people: participantGroup(challenge.id, "Open invite", "Challenger") },
                    {
                      title: "Audience",
                      people: roomJoins(challenge.id).filter((join) => join.role === "Audience")
                    }
                  ].map((group) => (
                    <div className="participantList" key={group.title}>
                      <strong>{group.title}</strong>
                      {group.people.length > 0 ? (
                        group.people.slice(0, 5).map((join) => (
                          <small key={join.id}>{join.participant_name}</small>
                        ))
                      ) : (
                        <small>No one yet.</small>
                      )}
                    </div>
                  ))}
                </div>
                <div className="detailList">
                  <strong>Recent votes</strong>
                  {votes.filter((vote) => vote.challenge_id === challenge.id).slice(0, 4).length > 0 ? (
                    votes
                      .filter((vote) => vote.challenge_id === challenge.id)
                      .slice(0, 4)
                      .map((vote) => <small key={vote.id}>Vote for {vote.winner}</small>)
                  ) : (
                    <small>No votes yet.</small>
                  )}
                </div>
                <form className="reportForm" onSubmit={(event) => submitReport(event, challenge)}>
                  <strong>Report issue</strong>
                  <select name="target" defaultValue="challenge">
                    <option value="challenge">Report this challenge</option>
                    {(roomProofs[challenge.id] || []).slice(0, 5).map((proof) => (
                      <option key={proof.id} value={`proof:${proof.id}`}>
                        Report proof: {proof.proof_type || "Proof"}
                      </option>
                    ))}
                  </select>
                  <select name="reason" defaultValue="Fake proof">
                    {(["Spam", "Fake proof", "Abuse", "Wrong category", "Other"] as ReportReason[]).map((reason) => (
                      <option key={reason}>{reason}</option>
                    ))}
                  </select>
                  <input name="notes" placeholder="Optional short note" />
                  <button disabled={reportingChallengeId === challenge.id} type="submit">
                    {reportingChallengeId === challenge.id ? "Submitting..." : "Submit report"}
                  </button>
                </form>
              </details>
              {!isChallengeCompleted(challenge) && (
                <div className="roomButtons">
                  <button disabled={hasUserVoted(challenge.id)} type="button" onClick={() => voteForWinner(challenge, challenge.team_a)}>
                    {hasUserVoted(challenge.id) ? "Voted" : "Vote A"}
                  </button>
                  <button disabled={hasUserVoted(challenge.id)} type="button" onClick={() => voteForWinner(challenge, challenge.team_b)}>
                    {hasUserVoted(challenge.id) ? "Voted" : "Vote B"}
                  </button>
                  <button disabled={hasUserRated(challenge.id)} type="button" onClick={() => rateChallenge(challenge, 7)}>
                    {hasUserRated(challenge.id) ? "Rated" : "Rate 7/7"}
                  </button>
                </div>
              )}
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
