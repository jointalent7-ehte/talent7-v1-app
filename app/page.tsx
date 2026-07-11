"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "../lib/supabase";

type ChallengeLane = "Talent battle" | "Sports challenge" | "Mobile gaming challenge";
type ChallengeStatusFilter = "All" | "Open" | "Completed";

const teamMemberRoles = ["Player", "Captain", "Dancer", "Coach", "Substitute", "Proof uploader", "Organizer"];
const proofManagerRoles = ["Captain", "Organizer", "Proof uploader"];
const resultManagerRoles = ["Captain", "Organizer"];

type Challenge = {
  id: string;
  title: string;
  lane: ChallengeLane;
  status: string;
  rules: string;
  team_a: string;
  team_b: string;
  team_a_id?: string | null;
  team_b_id?: string | null;
  proof_url: string | null;
  winner: string | null;
  final_score: string | null;
  completed_at: string | null;
  created_by?: string | null;
  completed_by?: string | null;
  venue_name?: string | null;
  booking_url?: string | null;
  sport_type?: string | null;
  booking_region?: string | null;
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

type ShowcasePost = {
  id: string;
  user_id: string;
  media_type: "Photo" | "Video" | "Link";
  media_url: string;
  caption: string;
  category: string;
  created_at: string;
};

type ShowcaseRating = {
  id: string;
  post_id: string;
  user_id?: string | null;
  rating: number;
  created_at: string;
};

type ShowcaseComment = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type ProfileFollow = {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
};

type ReportReason = "Spam" | "Fake proof" | "Abuse" | "Wrong category" | "Other";

type ChallengeReport = {
  id: string;
  challenge_id: string;
  proof_id?: string | null;
  reporter_id: string;
  target_type: "Challenge" | "Proof";
  reason: ReportReason;
  notes: string | null;
  status: "Open" | "Reviewed" | "Dismissed";
  created_at: string;
};

type ShowcaseReport = {
  id: string;
  post_id: string;
  comment_id?: string | null;
  reporter_id: string;
  target_type: "Post" | "Comment";
  reason: ReportReason;
  notes: string | null;
  status: "Open" | "Reviewed" | "Dismissed";
  created_at: string;
};

type CoachOffer = {
  id: string;
  user_id: string;
  title: string;
  category: string;
  session_type: "Live video" | "Uploaded lessons" | "Both";
  price_range: string;
  availability: string;
  description: string;
  created_at: string;
};

type CoachingInterest = {
  id: string;
  offer_id: string;
  student_user_id: string;
  student_name: string;
  message: string | null;
  status: "Interested" | "Contacted" | "Closed";
  created_at: string;
};

type TalentTeam = {
  id: string;
  owner_user_id: string;
  name: string;
  team_type: "Sports team" | "Dance crew" | "Gaming clan" | "Fitness group";
  main_activity: string;
  region: string;
  description: string;
  created_at: string;
};

type TeamRequest = {
  id: string;
  team_id: string;
  requester_user_id: string;
  requester_name: string;
  member_role?: string | null;
  message: string | null;
  status: "Pending" | "Accepted" | "Declined";
  created_at: string;
  updated_at?: string | null;
};

type SafetyReportItem = {
  id: string;
  source: "Challenge" | "Showcase";
  reportId: string;
  area: "Challenge" | "Proof" | "Post" | "Comment";
  title: string;
  reason: ReportReason;
  notes: string | null;
  status: "Open" | "Reviewed" | "Dismissed";
  createdAt: string;
};

type AppNotification = {
  id: string;
  label: string;
  category: "Invites" | "Teams" | "Proof" | "Results" | "Reports" | "Showcase";
  title: string;
  detail: string;
  createdAt: string;
  href: string;
  challengeTitle?: string;
};

type NotificationFilter = "All" | "Unread" | AppNotification["category"];

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
  team_a_id: string;
  team_b_id: string;
  rules: string;
  venue_name: string;
  booking_url: string;
  sport_type: string;
  booking_region: string;
  invitedProfile: string;
  invitedUserId: string;
  version: number;
};

const defaultChallengeDraft: ChallengeDraft = {
  title: "Badminton doubles",
  lane: "Sports challenge",
  team_a: "Rohan + Dev",
  team_b: "Open invite",
  team_a_id: "",
  team_b_id: "",
  rules: "Best of 3 games, 21 points each. Upload victory proof after the match.",
  venue_name: "Local badminton court or sports venue",
  booking_url: "",
  sport_type: "Badminton",
  booking_region: "India",
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
    team_a_id: null,
    team_b_id: null,
    proof_url: null,
    winner: null,
    final_score: null,
    completed_at: null,
    venue_name: "Badminton court",
    booking_url: "",
    sport_type: "Badminton",
    booking_region: "India",
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
    team_a_id: null,
    team_b_id: null,
    proof_url: null,
    winner: null,
    final_score: null,
    completed_at: null,
    venue_name: "Dance studio or open stage",
    booking_url: "",
    sport_type: "Dance studio",
    booking_region: "Global",
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
    team_a_id: null,
    team_b_id: null,
    proof_url: null,
    winner: null,
    final_score: null,
    completed_at: null,
    venue_name: "Mobile lobby / room code",
    booking_url: "",
    sport_type: "Mobile gaming",
    booking_region: "Online",
    created_at: new Date().toISOString()
  }
];

function suggestedBookingLinks(challenge: Challenge) {
  const sport = challenge.sport_type || challenge.title || "sports venue";
  const region = challenge.booking_region || "near me";
  const query = encodeURIComponent(`${sport} booking ${region}`);
  const mapQuery = encodeURIComponent(`${sport} venue ${region}`);

  if (challenge.lane === "Mobile gaming challenge" || sport.toLowerCase().includes("gaming")) {
    return [
      { label: "Find match rooms", url: `https://www.google.com/search?q=${query}` },
      { label: "Search tournament apps", url: `https://www.google.com/search?q=${encodeURIComponent(`${sport} tournament app ${region}`)}` }
    ];
  }

  return [
    { label: "Search booking apps", url: `https://www.google.com/search?q=${query}` },
    { label: "Find nearby venues", url: `https://www.google.com/maps/search/${mapQuery}` }
  ];
}

function selectedFile(form: FormData, fieldName: string) {
  const file = form.get(fieldName);
  return file instanceof File && file.size > 0 ? file : null;
}

function cleanFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "upload";
}

function mediaPreviewKind(url: string, mediaType?: string | null) {
  const cleanUrl = url.split("?")[0].toLowerCase();
  const isLocalPreview = url.startsWith("blob:");
  const imageTypes = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
  const videoTypes = [".mp4", ".webm", ".mov", ".m4v", ".quicktime"];

  if (imageTypes.some((extension) => cleanUrl.endsWith(extension))) return "image";
  if (videoTypes.some((extension) => cleanUrl.endsWith(extension))) return "video";
  if (isLocalPreview && ["Photo", "Screenshot"].includes(mediaType || "")) return "image";
  if (isLocalPreview && mediaType === "Video") return "video";

  return "link";
}

function MediaPreview({
  url,
  mediaType,
  label = "Open media"
}: {
  url: string;
  mediaType?: string | null;
  label?: string;
}) {
  const kind = mediaPreviewKind(url, mediaType);

  if (kind === "image") {
    return (
      <a className="mediaPreview imagePreview" href={url} rel="noreferrer" target="_blank">
        <img alt={label} src={url} />
      </a>
    );
  }

  if (kind === "video") {
    return (
      <div className="mediaPreview videoPreview">
        <video controls preload="metadata" src={url} />
        <a href={url} rel="noreferrer" target="_blank">
          Open video
        </a>
      </div>
    );
  }

  return (
    <a className="mediaLink" href={url} rel="noreferrer" target="_blank">
      {label}
    </a>
  );
}

export default function Home() {
  const [challenges, setChallenges] = useState<Challenge[]>(sampleChallenges);
  const [selectedLane, setSelectedLane] = useState<ChallengeLane | "All">("All");
  const [selectedStatus, setSelectedStatus] = useState<ChallengeStatusFilter>("All");
  const [roomSearch, setRoomSearch] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [challengeDraft, setChallengeDraft] = useState<ChallengeDraft>(defaultChallengeDraft);
  const [selectedActivityProfile, setSelectedActivityProfile] = useState<TalentProfile | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<TalentProfile | null>(null);
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
  const [challengeReports, setChallengeReports] = useState<ChallengeReport[]>([]);
  const [showcaseReports, setShowcaseReports] = useState<ShowcaseReport[]>([]);
  const [coachOffers, setCoachOffers] = useState<CoachOffer[]>([]);
  const [coachingInterests, setCoachingInterests] = useState<CoachingInterest[]>([]);
  const [teams, setTeams] = useState<TalentTeam[]>([]);
  const [teamRequests, setTeamRequests] = useState<TeamRequest[]>([]);
  const [isOwnerReviewer, setIsOwnerReviewer] = useState(false);
  const [safetyReportActionId, setSafetyReportActionId] = useState<string | null>(null);
  const [savingCoachOffer, setSavingCoachOffer] = useState(false);
  const [coachingInterestId, setCoachingInterestId] = useState<string | null>(null);
  const [coachingInterestActionId, setCoachingInterestActionId] = useState<string | null>(null);
  const [savingTeam, setSavingTeam] = useState(false);
  const [teamRequestId, setTeamRequestId] = useState<string | null>(null);
  const [teamRequestActionId, setTeamRequestActionId] = useState<string | null>(null);
  const [teamRoleDrafts, setTeamRoleDrafts] = useState<Record<string, string>>({});
  const [followActionId, setFollowActionId] = useState<string | null>(null);
  const [showcasePosts, setShowcasePosts] = useState<ShowcasePost[]>([]);
  const [showcaseRatings, setShowcaseRatings] = useState<ShowcaseRating[]>([]);
  const [showcaseComments, setShowcaseComments] = useState<ShowcaseComment[]>([]);
  const [savingShowcasePost, setSavingShowcasePost] = useState(false);
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [reportingShowcaseTarget, setReportingShowcaseTarget] = useState<string | null>(null);
  const [readNotificationKeys, setReadNotificationKeys] = useState<string[]>([]);
  const [selectedNotificationFilter, setSelectedNotificationFilter] = useState<NotificationFilter>("All");
  const [notificationSearch, setNotificationSearch] = useState("");

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

  const showcaseResults = useMemo(() => {
    return showcaseRatings.reduce<Record<string, { ratingAverage: string; ratingCount: number }>>((results, rating) => {
      const postRatings = showcaseRatings.filter((item) => item.post_id === rating.post_id);
      const ratingTotal = postRatings.reduce((total, item) => total + item.rating, 0);

      results[rating.post_id] = {
        ratingAverage: postRatings.length ? (ratingTotal / postRatings.length).toFixed(1) : "0.0",
        ratingCount: postRatings.length
      };

      return results;
    }, {});
  }, [showcaseRatings]);

  const showcaseCommentsByPost = useMemo(() => {
    return showcaseComments.reduce<Record<string, ShowcaseComment[]>>((groups, comment) => {
      groups[comment.post_id] = groups[comment.post_id] || [];
      groups[comment.post_id].push(comment);
      return groups;
    }, {});
  }, [showcaseComments]);

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

  const coachProfiles = useMemo(() => {
    return publicProfiles.filter((item) => item.role.toLowerCase().includes("coach"));
  }, [publicProfiles]);

  const visibleCoachOffers = useMemo(() => {
    const search = profileSearch.trim().toLowerCase();

    return coachOffers.filter((offer) => {
      const coach = publicProfiles.find((item) => item.user_id === offer.user_id);
      if (!search) return true;

      return [offer.title, offer.category, offer.session_type, offer.price_range, offer.description, coach?.display_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [coachOffers, profileSearch, publicProfiles]);

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

    const showcaseItems = showcasePosts
      .filter((post) => followedSet.has(post.user_id))
      .map((post) => {
        const actor = profileById[post.user_id];

        return {
          id: `showcase-${post.id}`,
          actor: actor?.display_name || "Followed profile",
          action: `posted ${post.media_type.toLowerCase()}`,
          title: post.caption || post.category,
          detail: post.category,
          createdAt: post.created_at,
          challengeId: ""
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

    return [...createdItems, ...joinedItems, ...proofItems, ...showcaseItems, ...completedItems]
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
      .slice(0, 12);
  }, [challenges, follows, joins, proofs, publicProfiles, session, showcasePosts]);

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

  const mySafetyReports = useMemo<SafetyReportItem[]>(() => {
    const challengeItems = challengeReports.map((report) => {
      const challenge = challenges.find((item) => item.id === report.challenge_id);

      return {
        id: `challenge-report-${report.id}`,
        source: "Challenge" as const,
        reportId: report.id,
        area: report.target_type,
        title: challenge?.title || "Challenge room",
        reason: report.reason,
        notes: report.notes,
        status: report.status,
        createdAt: report.created_at
      };
    });

    const showcaseItems = showcaseReports.map((report) => {
      const post = showcasePosts.find((item) => item.id === report.post_id);
      const comment = report.comment_id
        ? showcaseComments.find((item) => item.id === report.comment_id)
        : null;

      return {
        id: `showcase-report-${report.id}`,
        source: "Showcase" as const,
        reportId: report.id,
        area: report.target_type,
        title: report.target_type === "Comment" ? comment?.body || "Showcase comment" : post?.caption || "Showcase post",
        reason: report.reason,
        notes: report.notes,
        status: report.status,
        createdAt: report.created_at
      };
    });

    return [...challengeItems, ...showcaseItems].sort(
      (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
    );
  }, [challengeReports, challenges, showcaseComments, showcasePosts, showcaseReports]);

  const coachingInterestCounts = useMemo(() => {
    return coachingInterests.reduce<Record<string, number>>((counts, interest) => {
      counts[interest.offer_id] = (counts[interest.offer_id] || 0) + 1;
      return counts;
    }, {});
  }, [coachingInterests]);

  const coachInbox = useMemo(() => {
    if (!session?.user.id) return [];

    const myOfferIds = new Set(
      coachOffers.filter((offer) => offer.user_id === session.user.id).map((offer) => offer.id)
    );

    return coachingInterests
      .filter((interest) => myOfferIds.has(interest.offer_id))
      .map((interest) => ({
        ...interest,
        offerTitle: coachOffers.find((offer) => offer.id === interest.offer_id)?.title || "Coaching offer"
      }))
      .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime());
  }, [coachOffers, coachingInterests, session]);

  const teamRequestCounts = useMemo(() => {
    return teamRequests.reduce<Record<string, { pending: number; accepted: number }>>((counts, request) => {
      const current = counts[request.team_id] || { pending: 0, accepted: 0 };
      if (request.status === "Pending") current.pending += 1;
      if (request.status === "Accepted") current.accepted += 1;
      counts[request.team_id] = current;
      return counts;
    }, {});
  }, [teamRequests]);

  const teamInbox = useMemo(() => {
    if (!session?.user.id) return [];

    const ownedTeams = teams.filter((team) => team.owner_user_id === session.user.id);
    const ownedTeamIds = new Set(ownedTeams.map((team) => team.id));

    return teamRequests
      .filter((request) => ownedTeamIds.has(request.team_id))
      .map((request) => ({
        ...request,
        teamName: teams.find((team) => team.id === request.team_id)?.name || "Team"
      }))
      .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime());
  }, [session, teamRequests, teams]);

  const myTeamDashboard = useMemo(() => {
    if (!session?.user.id) {
      return {
        owned: [] as TalentTeam[],
        accepted: [] as Array<TeamRequest & { team?: TalentTeam }>,
        pending: [] as Array<TeamRequest & { team?: TalentTeam }>,
        challenges: [] as Challenge[]
      };
    }

    const owned = teams.filter((team) => team.owner_user_id === session.user.id);
    const joinedRequests = teamRequests
      .filter((request) => request.requester_user_id === session.user.id)
      .map((request) => ({
        ...request,
        team: teams.find((team) => team.id === request.team_id)
      }));
    const accepted = joinedRequests.filter((request) => request.status === "Accepted");
    const pending = joinedRequests.filter((request) => request.status === "Pending");
    const connectedTeamIds = new Set([
      ...owned.map((team) => team.id),
      ...accepted.map((request) => request.team_id)
    ]);

    const teamChallenges = challenges
      .filter((challenge) => {
        const teamAId = challenge.team_a_id || "";
        const teamBId = challenge.team_b_id || "";
        return connectedTeamIds.has(teamAId) || connectedTeamIds.has(teamBId);
      })
      .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime());

    return { owned, accepted, pending, challenges: teamChallenges };
  }, [challenges, session, teamRequests, teams]);

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

  const notifications = useMemo<AppNotification[]>(() => {
    if (!session?.user.id) return [];

    const userId = session.user.id;
    const createdChallengeIds = new Set(
      challenges.filter((challenge) => challenge.created_by === userId).map((challenge) => challenge.id)
    );
    const joinedChallengeIds = new Set(
      joins.filter((join) => join.user_id === userId).map((join) => join.challenge_id)
    );
    const myPostIds = new Set(showcasePosts.filter((post) => post.user_id === userId).map((post) => post.id));

    const receivedInviteAlerts = inviteInbox.received.map((invite) => ({
      id: `notification-invite-${invite.id}`,
      label: invite.status === "Pending" ? "New invite" : "Invite updated",
      category: "Invites" as const,
      title: challengeTitle(invite.challenge_id),
      detail: invite.status === "Pending" ? "Someone invited you to a challenge." : `Invite ${invite.status.toLowerCase()}.`,
      createdAt: invite.updated_at || invite.created_at,
      href: "#invites"
    }));

    const sentInviteAlerts = inviteInbox.sent
      .filter((invite) => invite.status !== "Pending")
      .map((invite) => ({
        id: `notification-sent-invite-${invite.id}`,
        label: "Invite response",
        category: "Invites" as const,
        title: challengeTitle(invite.challenge_id),
        detail: `${invite.invited_name} ${invite.status.toLowerCase()} your invite.`,
        createdAt: invite.updated_at || invite.created_at,
        href: "#invites"
      }));

    const teamOwnerAlerts = teamInbox.map((request) => ({
      id: `notification-team-owner-${request.id}`,
      label: request.status === "Pending" ? "Team request" : "Team request updated",
      category: "Teams" as const,
      title: request.teamName,
      detail:
        request.status === "Pending"
          ? `${request.requester_name} wants to join as ${request.member_role || "Player"}.`
          : `${request.requester_name} is ${request.status.toLowerCase()} as ${request.member_role || "Player"}.`,
      createdAt: request.updated_at || request.created_at,
      href: "#teams"
    }));

    const teamMemberAlerts = teamRequests
      .filter((request) => request.requester_user_id === userId && request.status !== "Pending")
      .map((request) => ({
        id: `notification-team-member-${request.id}`,
        label: "Team request response",
        category: "Teams" as const,
        title: teams.find((team) => team.id === request.team_id)?.name || "Team",
        detail: `Your request was ${request.status.toLowerCase()} as ${request.member_role || "Player"}.`,
        createdAt: request.updated_at || request.created_at,
        href: "#teams"
      }));

    const proofAlerts = proofs
      .filter((proof) => createdChallengeIds.has(proof.challenge_id) && proof.user_id !== userId)
      .map((proof) => ({
        id: `notification-proof-${proof.id}`,
        label: "Proof submitted",
        category: "Proof" as const,
        title: challengeTitle(proof.challenge_id),
        detail: `${proof.proof_type || "Proof"} is waiting for review.`,
        createdAt: proof.created_at,
        href: "#rooms",
        challengeTitle: challengeTitle(proof.challenge_id)
      }));

    const completedAlerts = challenges
      .filter(
        (challenge) =>
          challenge.status === "Completed" &&
          challenge.completed_by !== userId &&
          (challenge.created_by === userId || joinedChallengeIds.has(challenge.id))
      )
      .map((challenge) => ({
        id: `notification-completed-${challenge.id}`,
        label: "Challenge completed",
        category: "Results" as const,
        title: challenge.title,
        detail: challenge.winner ? `Winner: ${challenge.winner}` : "Winner declared.",
        createdAt: challenge.completed_at || challenge.created_at,
        href: "#rooms",
        challengeTitle: challenge.title
      }));

    const reportAlerts = mySafetyReports.map((report) => ({
      id: `notification-report-${report.id}`,
      label: "Report status",
      category: "Reports" as const,
      title: report.title,
      detail: `${report.reason} report is ${report.status.toLowerCase()}.`,
      createdAt: report.createdAt,
      href: "#safety"
    }));

    const commentAlerts = showcaseComments
      .filter((comment) => myPostIds.has(comment.post_id) && comment.user_id !== userId)
      .map((comment) => ({
        id: `notification-comment-${comment.id}`,
        label: "Showcase comment",
        category: "Showcase" as const,
        title: showcasePosts.find((post) => post.id === comment.post_id)?.caption || "Showcase post",
        detail: comment.body,
        createdAt: comment.created_at,
        href: "#showcase"
      }));

    return [
      ...receivedInviteAlerts,
      ...sentInviteAlerts,
      ...teamOwnerAlerts,
      ...teamMemberAlerts,
      ...proofAlerts,
      ...completedAlerts,
      ...reportAlerts,
      ...commentAlerts
    ]
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
      .slice(0, 12);
  }, [
    challenges,
    inviteInbox,
    joins,
    mySafetyReports,
    proofs,
    session,
    showcaseComments,
    showcasePosts,
    teamInbox,
      teamRequests,
      teams
  ]);

  const notificationReadStorageKey = session?.user.id ? `talent7-read-notifications-${session.user.id}` : "";

  const unreadNotifications = useMemo(() => {
    const readSet = new Set(readNotificationKeys);
    return notifications.filter((notification) => !readSet.has(notificationKey(notification)));
  }, [notifications, readNotificationKeys]);

  const visibleNotifications = useMemo(() => {
    const readSet = new Set(readNotificationKeys);
    const search = notificationSearch.trim().toLowerCase();

    return notifications.filter((notification) => {
      const isUnread = !readSet.has(notificationKey(notification));
      const filterMatches =
        selectedNotificationFilter === "All" ||
        (selectedNotificationFilter === "Unread" && isUnread) ||
        notification.category === selectedNotificationFilter;
      const searchMatches =
        !search ||
        [notification.label, notification.category, notification.title, notification.detail]
          .join(" ")
          .toLowerCase()
          .includes(search);

      return filterMatches && searchMatches;
    });
  }, [notificationSearch, notifications, readNotificationKeys, selectedNotificationFilter]);

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

  const selectedProfileSummary = useMemo(() => {
    if (!selectedProfile) return null;

    const userId = selectedProfile.user_id;
    const joinedChallengeIds = new Set(joins.filter((join) => join.user_id === userId).map((join) => join.challenge_id));
    const ownedTeamIds = teams.filter((team) => team.owner_user_id === userId).map((team) => team.id);
    const joinedTeamRequests = teamRequests
      .filter((request) => request.requester_user_id === userId && request.status === "Accepted")
      .map((request) => ({
        ...request,
        team: teams.find((team) => team.id === request.team_id)
      }));
    const relatedChallenges = challenges
      .filter(
        (challenge) =>
          challenge.created_by === userId ||
          challenge.completed_by === userId ||
          joinedChallengeIds.has(challenge.id) ||
          ownedTeamIds.includes(challenge.team_a_id || "") ||
          ownedTeamIds.includes(challenge.team_b_id || "")
      )
      .slice(0, 6);

    return {
      showcasePosts: showcasePosts.filter((post) => post.user_id === userId).slice(0, 4),
      challenges: relatedChallenges,
      wins: challenges
        .filter((challenge) => challenge.status === "Completed" && challenge.winner && challengeMatchesProfileActivity(challenge, selectedProfile))
        .slice(0, 4),
      ownedTeams: teams.filter((team) => team.owner_user_id === userId),
      joinedTeams: joinedTeamRequests,
      proofs: proofs.filter((proof) => proof.user_id === userId),
      ratings: ratings.filter((rating) => rating.user_id === userId)
    };
  }, [challenges, joins, proofs, ratings, selectedProfile, showcasePosts, teamRequests, teams]);

  function challengeTitle(challengeId: string) {
    return challenges.find((challenge) => challenge.id === challengeId)?.title || "Challenge room";
  }

  function profileDisplayName(userId: string) {
    return publicProfiles.find((item) => item.user_id === userId)?.display_name || "Talent7 creator";
  }

  function profileTrustBadges(item: TalentProfile) {
    const userId = item.user_id;
    const badges: string[] = [];
    const ownsTeam = teams.some((team) => team.owner_user_id === userId);
    const hasCoachOffer = coachOffers.some((offer) => offer.user_id === userId);
    const hasProof = proofs.some((proof) => proof.user_id === userId);
    const createdCount = challenges.filter((challenge) => challenge.created_by === userId).length;
    const hasWin = challenges.some(
      (challenge) => challenge.status === "Completed" && challenge.winner && challengeMatchesProfileActivity(challenge, item)
    );
    const hasShowcase = showcasePosts.some((post) => post.user_id === userId);
    const hasVotes = votes.some((vote) => vote.user_id === userId);

    if (ownsTeam) badges.push("Team captain");
    if (item.role.toLowerCase().includes("coach") || hasCoachOffer) badges.push("Coach");
    if (hasProof) badges.push("Proof creator");
    if (createdCount > 0) badges.push("Challenge maker");
    if (hasWin) badges.push("Winner");
    if (hasShowcase) badges.push("Rising talent");
    if (hasVotes) badges.push("Trusted voter");

    return badges.slice(0, 6);
  }

  function notificationKey(notification: AppNotification) {
    return `${notification.id}-${notification.createdAt}`;
  }

  function markNotificationRead(notification: AppNotification) {
    const key = notificationKey(notification);
    setReadNotificationKeys((items) => (items.includes(key) ? items : [...items, key]));
  }

  function markAllNotificationsRead() {
    setReadNotificationKeys((items) => {
      const merged = new Set(items);
      notifications.forEach((notification) => merged.add(notificationKey(notification)));
      return Array.from(merged);
    });
  }

  async function uploadMediaFile(bucket: "challenge-proofs" | "showcase-media", file: File, folder: string) {
    if (!supabase || !session?.user.id) {
      throw new Error("Supabase Storage is not connected yet.");
    }

    const path = `${session.user.id}/${folder}/${crypto.randomUUID()}-${cleanFileName(file.name)}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false
    });

    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
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

  function challengeTeamIds(challenge: Challenge) {
    return [challenge.team_a_id, challenge.team_b_id].filter(Boolean) as string[];
  }

  function userTeamRoles(challenge: Challenge) {
    if (!session?.user.id) return [];

    const ids = new Set(challengeTeamIds(challenge));
    if (ids.size === 0) return [];

    const ownerRoles = teams
      .filter((team) => ids.has(team.id) && team.owner_user_id === session.user.id)
      .map((team) => ({ teamName: team.name, role: "Captain" }));
    const memberRoles = teamRequests
      .filter(
        (request) =>
          ids.has(request.team_id) &&
          request.requester_user_id === session.user.id &&
          request.status === "Accepted"
      )
      .map((request) => ({
        teamName: teams.find((team) => team.id === request.team_id)?.name || "Team",
        role: request.member_role || "Player"
      }));

    return [...ownerRoles, ...memberRoles];
  }

  function canManageTeamProof(challenge: Challenge) {
    const ids = challengeTeamIds(challenge);
    if (ids.length === 0) return true;
    if (challenge.created_by === session?.user.id) return true;

    return userTeamRoles(challenge).some((item) => proofManagerRoles.includes(item.role));
  }

  function canManageTeamResult(challenge: Challenge) {
    const ids = challengeTeamIds(challenge);
    if (ids.length === 0) return true;
    if (challenge.created_by === session?.user.id) return true;

    return userTeamRoles(challenge).some((item) => resultManagerRoles.includes(item.role));
  }

  function teamPermissionLabel(challenge: Challenge) {
    const ids = challengeTeamIds(challenge);
    if (ids.length === 0) return "";

    const roles = userTeamRoles(challenge);
    if (roles.length === 0) {
      return "Team role required: captains, organizers, and proof uploaders can manage team challenge proof.";
    }

    return `Your team role: ${roles.map((item) => `${item.teamName} ${item.role}`).join(", ")}.`;
  }

  useEffect(() => {
    if (!notificationReadStorageKey) {
      setReadNotificationKeys([]);
      return;
    }

    try {
      const saved = window.localStorage.getItem(notificationReadStorageKey);
      setReadNotificationKeys(saved ? (JSON.parse(saved) as string[]) : []);
    } catch {
      setReadNotificationKeys([]);
    }
  }, [notificationReadStorageKey]);

  useEffect(() => {
    if (!notificationReadStorageKey) return;
    window.localStorage.setItem(notificationReadStorageKey, JSON.stringify(readNotificationKeys));
  }, [notificationReadStorageKey, readNotificationKeys]);

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
    async function loadShowcasePosts() {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("showcase_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(24);

      if (error) return;
      if (data) setShowcasePosts(data as ShowcasePost[]);
    }

    loadShowcasePosts();
  }, []);

  useEffect(() => {
    async function loadShowcaseRatings() {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("showcase_ratings")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return;
      if (data) setShowcaseRatings(data as ShowcaseRating[]);
    }

    loadShowcaseRatings();
  }, []);

  useEffect(() => {
    async function loadShowcaseComments() {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("showcase_comments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(120);

      if (error) return;
      if (data) setShowcaseComments(data as ShowcaseComment[]);
    }

    loadShowcaseComments();
  }, []);

  useEffect(() => {
    async function loadCoachOffers() {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("coach_offers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(24);

      if (error) return;
      if (data) setCoachOffers(data as CoachOffer[]);
    }

    loadCoachOffers();
  }, []);

  useEffect(() => {
    async function loadTeams() {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("talent_teams")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) return;
      if (data) setTeams(data as TalentTeam[]);
    }

    loadTeams();
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

  useEffect(() => {
    async function loadCoachingInterests() {
      if (!supabase || !session?.user.id) {
        setCoachingInterests([]);
        return;
      }

      const { data, error } = await supabase
        .from("coaching_interests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return;
      if (data) setCoachingInterests(data as CoachingInterest[]);
    }

    loadCoachingInterests();
  }, [session]);

  useEffect(() => {
    async function loadTeamRequests() {
      if (!supabase || !session?.user.id) {
        setTeamRequests([]);
        return;
      }

      const { data, error } = await supabase
        .from("team_join_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return;
      if (data) setTeamRequests(data as TeamRequest[]);
    }

    loadTeamRequests();
  }, [session]);

  useEffect(() => {
    async function loadMyReports() {
      if (!supabase || !session?.user.id) {
        setChallengeReports([]);
        setShowcaseReports([]);
        setIsOwnerReviewer(false);
        return;
      }

      const { data: ownerData } = await supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      const ownerMode = Boolean(ownerData);
      setIsOwnerReviewer(ownerMode);

      const challengeQuery = supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });
      const showcaseQuery = supabase
        .from("showcase_reports")
        .select("*")
        .order("created_at", { ascending: false });

      const [challengeResult, showcaseResult] = await Promise.all([
        ownerMode ? challengeQuery : challengeQuery.eq("reporter_id", session.user.id),
        ownerMode ? showcaseQuery : showcaseQuery.eq("reporter_id", session.user.id)
      ]);

      if (challengeResult.data) setChallengeReports(challengeResult.data as ChallengeReport[]);
      if (showcaseResult.data) setShowcaseReports(showcaseResult.data as ShowcaseReport[]);
    }

    loadMyReports();
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

  function hasUserRatedShowcase(postId: string) {
    return Boolean(
      session?.user.id &&
        showcaseRatings.some((rating) => rating.post_id === postId && rating.user_id === session.user.id)
    );
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

  function linkedTeam(teamId?: string | null) {
    if (!teamId) return null;
    return teams.find((team) => team.id === teamId) || null;
  }

  function linkedTeamLabel(teamId?: string | null, fallback = "Open invite") {
    return linkedTeam(teamId)?.name || fallback;
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
    const bookingUrl = String(form.get("booking_url") || "").trim();
    const teamAId = String(form.get("team_a_id") || "");
    const teamBId = String(form.get("team_b_id") || "");
    const teamA = linkedTeam(teamAId);
    const teamB = linkedTeam(teamBId);
    const challenge = {
      title: String(form.get("title") || "Untitled challenge"),
      lane: String(form.get("lane") || "Sports challenge") as ChallengeLane,
      team_a: String(form.get("team_a") || teamA?.name || "Open challenger"),
      team_b: String(form.get("team_b") || teamB?.name || "Open invite"),
      team_a_id: teamAId || null,
      team_b_id: teamBId || null,
      rules: String(form.get("rules") || "Upload proof after the challenge."),
      venue_name: String(form.get("venue_name") || "").trim() || null,
      booking_url: bookingUrl || null,
      sport_type: String(form.get("sport_type") || "").trim() || null,
      booking_region: String(form.get("booking_region") || "").trim() || null,
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
      team_a_id: currentDraft.team_a_id || "",
      team_b_id: currentDraft.team_b_id || "",
      rules: `${interest} challenge with ${invitedName}. Upload proof after the match.`,
      venue_name: currentDraft.venue_name || "Venue or online lobby to be decided",
      booking_url: currentDraft.booking_url || "",
      sport_type: currentDraft.sport_type || interest,
      booking_region: currentDraft.booking_region || profile?.region || "Global",
      invitedProfile: invitedName,
      invitedUserId: item.user_id,
      version: currentDraft.version + 1
    }));

    setMessage(`Invite draft ready for ${invitedName}. Review it, then create the challenge.`);
    setTimeout(() => document.getElementById("create")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  function viewTeamChallenge(challenge: Challenge) {
    setSelectedLane(challenge.lane);
    setRoomSearch(challenge.title);
    setMessage(`${challenge.title} is now shown in Challenge rooms.`);
    setTimeout(() => document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  function challengeTeam(team: TalentTeam) {
    if (!requireLogin("challenge teams")) return;
    if (!requireProfile("challenge teams")) return;

    const isOwnTeam = team.owner_user_id === session?.user.id;
    const ownedTeam = isOwnTeam ? team : teams.find((item) => item.owner_user_id === session?.user.id);
    const activity = team.main_activity || "Team challenge";
    const region = team.region || profile?.region || "Global";
    const opponentName = isOwnTeam ? "Open invite" : team.name;

    setChallengeDraft((currentDraft) => ({
      title: `${activity} challenge`,
      lane: laneForInterest(activity),
      team_a: ownedTeam?.name || profileName(),
      team_b: opponentName,
      team_a_id: ownedTeam?.id || "",
      team_b_id: isOwnTeam ? "" : team.id,
      rules: `${activity} team challenge. Upload proof after the match.`,
      venue_name: currentDraft.venue_name || `${activity} venue or online lobby`,
      booking_url: currentDraft.booking_url || "",
      sport_type: activity,
      booking_region: region,
      invitedProfile: "",
      invitedUserId: "",
      version: currentDraft.version + 1
    }));

    setMessage(
      isOwnTeam
        ? `Team challenge draft ready for ${team.name}. Review it, then create the challenge.`
        : `Challenge draft ready against ${team.name}. Review it, then create the challenge.`
    );
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

  function openProfileDetail(item: TalentProfile) {
    setSelectedProfile(item);
    setMessage(`Opened ${item.display_name}'s Talent7 profile.`);
    setTimeout(() => document.getElementById("profile-detail")?.scrollIntoView({ behavior: "smooth" }), 80);
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

  async function createShowcasePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireLogin("post talent")) return;
    if (!requireProfile("post talent")) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    let mediaUrl = String(form.get("media_url") || "").trim();
    const mediaFile = selectedFile(form, "media_file");
    const caption = String(form.get("caption") || "").trim();
    const category = String(form.get("category") || "Talent");
    const mediaType = String(form.get("media_type") || "Video") as ShowcasePost["media_type"];

    if ((!mediaUrl && !mediaFile) || !caption) {
      setMessage("Add a media link or upload a file, plus a caption before posting.");
      return;
    }

    setSavingShowcasePost(true);
    setMessage("");

    if (mediaFile && supabase) {
      try {
        mediaUrl = await uploadMediaFile("showcase-media", mediaFile, "showcase");
      } catch (error) {
        setMessage(error instanceof Error ? `Could not upload showcase file: ${error.message}` : "Could not upload showcase file.");
        setSavingShowcasePost(false);
        return;
      }
    } else if (mediaFile && !supabase) {
      mediaUrl = URL.createObjectURL(mediaFile);
    }

    const post = {
      user_id: session?.user.id || "",
      media_type: mediaType,
      media_url: mediaUrl,
      caption,
      category
    };

    if (!supabase) {
      const localPost: ShowcasePost = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...post
      };

      setShowcasePosts((items) => [localPost, ...items]);
      setMessage("Demo mode: showcase post added on this page.");
      formElement.reset();
      setSavingShowcasePost(false);
      return;
    }

    const { data, error } = await supabase
      .from("showcase_posts")
      .insert(post)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not create showcase post: ${error.message}`);
    } else if (data) {
      setShowcasePosts((items) => [data as ShowcasePost, ...items]);
      setMessage("Showcase post published.");
      formElement.reset();
      setTimeout(() => document.getElementById("showcase")?.scrollIntoView({ behavior: "smooth" }), 80);
    }

    setSavingShowcasePost(false);
  }

  async function createCoachOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireLogin("create a coaching offer")) return;
    if (!requireProfile("create a coaching offer")) return;

    if (!profile?.role.toLowerCase().includes("coach")) {
      setMessage("Set your profile role to Coach / instructor before creating a coaching offer.");
      setTimeout(() => document.getElementById("account")?.scrollIntoView({ behavior: "smooth" }), 80);
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();

    if (!title || !description) {
      setMessage("Add a coaching title and description first.");
      return;
    }

    const offer = {
      user_id: session?.user.id || "",
      title,
      category: String(form.get("category") || profile.main_interest || "Coaching"),
      session_type: String(form.get("session_type") || "Live video") as CoachOffer["session_type"],
      price_range: String(form.get("price_range") || "$20-50"),
      availability: String(form.get("availability") || "Flexible").trim(),
      description
    };

    setSavingCoachOffer(true);
    setMessage("");

    if (!supabase) {
      setCoachOffers((items) => [
        {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...offer
        },
        ...items
      ]);
      setMessage("Demo mode: coaching offer added on this page.");
      formElement.reset();
      setSavingCoachOffer(false);
      return;
    }

    const { data, error } = await supabase
      .from("coach_offers")
      .insert(offer)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not create coaching offer: ${error.message}`);
    } else if (data) {
      setCoachOffers((items) => [data as CoachOffer, ...items]);
      setMessage("Coaching offer published.");
      formElement.reset();
      setTimeout(() => document.getElementById("coaching")?.scrollIntoView({ behavior: "smooth" }), 80);
    }

    setSavingCoachOffer(false);
  }

  async function requestCoachingInterest(event: FormEvent<HTMLFormElement>, offer: CoachOffer) {
    event.preventDefault();
    if (!requireLogin("request coaching")) return;
    if (!requireProfile("request coaching")) return;

    if (offer.user_id === session?.user.id) {
      setMessage("This is your own coaching offer.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const messageText = String(form.get("message") || "").trim();

    const interest = {
      offer_id: offer.id,
      student_user_id: session?.user.id || "",
      student_name: profileName(),
      message: messageText || null,
      status: "Interested" as const
    };

    setCoachingInterestId(offer.id);
    setMessage("");

    if (!supabase) {
      setCoachingInterests((items) => [
        {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...interest
        },
        ...items
      ]);
      setMessage("Demo mode: coaching interest sent on this page.");
      formElement.reset();
      setCoachingInterestId(null);
      return;
    }

    const { data, error } = await supabase
      .from("coaching_interests")
      .insert(interest)
      .select("*")
      .single();

    if (error) {
      setMessage(error.code === "23505" ? "You already requested this coaching offer." : `Could not request coaching: ${error.message}`);
    } else if (data) {
      setCoachingInterests((items) => [data as CoachingInterest, ...items]);
      setMessage("Coaching interest sent. Payment and scheduling will be added later.");
      formElement.reset();
    }

    setCoachingInterestId(null);
  }

  async function updateCoachingInterestStatus(
    interest: CoachingInterest,
    status: CoachingInterest["status"]
  ) {
    if (!requireLogin("manage coaching requests")) return;

    const offer = coachOffers.find((item) => item.id === interest.offer_id);
    if (!offer || offer.user_id !== session?.user.id) {
      setMessage("Only the coach who owns this offer can update the request.");
      return;
    }

    if (!supabase) return;

    setCoachingInterestActionId(interest.id);
    setMessage("");

    const { data, error } = await supabase
      .from("coaching_interests")
      .update({ status })
      .eq("id", interest.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update coaching request: ${error.message}`);
    } else if (data) {
      setCoachingInterests((items) =>
        items.map((item) => (item.id === interest.id ? (data as CoachingInterest) : item))
      );
      setMessage(`Coaching request marked ${status.toLowerCase()}.`);
    }

    setCoachingInterestActionId(null);
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireLogin("create a team")) return;
    if (!requireProfile("create a team")) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();

    if (!name || !description) {
      setMessage("Add a team name and short description first.");
      return;
    }

    const team = {
      owner_user_id: session?.user.id || "",
      name,
      team_type: String(form.get("team_type") || "Sports team") as TalentTeam["team_type"],
      main_activity: String(form.get("main_activity") || profile?.main_interest || "Badminton").trim(),
      region: String(form.get("region") || profile?.region || "Global").trim(),
      description
    };

    setSavingTeam(true);
    setMessage("");

    if (!supabase) {
      setTeams((items) => [
        {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...team
        },
        ...items
      ]);
      setMessage("Demo mode: team created on this page.");
      formElement.reset();
      setSavingTeam(false);
      return;
    }

    const { data, error } = await supabase
      .from("talent_teams")
      .insert(team)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not create team: ${error.message}`);
    } else if (data) {
      setTeams((items) => [data as TalentTeam, ...items]);
      setMessage("Team created.");
      formElement.reset();
      setTimeout(() => document.getElementById("teams")?.scrollIntoView({ behavior: "smooth" }), 80);
    }

    setSavingTeam(false);
  }

  async function requestTeamJoin(event: FormEvent<HTMLFormElement>, team: TalentTeam) {
    event.preventDefault();
    if (!requireLogin("request to join a team")) return;
    if (!requireProfile("request to join a team")) return;

    if (team.owner_user_id === session?.user.id) {
      setMessage("This is your own team.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const messageText = String(form.get("message") || "").trim();
    const memberRole = String(form.get("member_role") || "Player");

    const request = {
      team_id: team.id,
      requester_user_id: session?.user.id || "",
      requester_name: profileName(),
      member_role: memberRole,
      message: messageText || null,
      status: "Pending" as const
    };

    setTeamRequestId(team.id);
    setMessage("");

    if (!supabase) {
      setTeamRequests((items) => [
        {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...request
        },
        ...items
      ]);
      setMessage("Demo mode: team join request sent on this page.");
      formElement.reset();
      setTeamRequestId(null);
      return;
    }

    const { data, error } = await supabase
      .from("team_join_requests")
      .insert(request)
      .select("*")
      .single();

    if (error) {
      setMessage(error.code === "23505" ? "You already requested to join this team." : `Could not request team join: ${error.message}`);
    } else if (data) {
      setTeamRequests((items) => [data as TeamRequest, ...items]);
      setMessage("Team join request sent.");
      formElement.reset();
    }

    setTeamRequestId(null);
  }

  async function updateTeamRequestStatus(request: TeamRequest, status: TeamRequest["status"]) {
    if (!requireLogin("manage team requests")) return;

    const team = teams.find((item) => item.id === request.team_id);
    if (!team || team.owner_user_id !== session?.user.id) {
      setMessage("Only the team owner can update this request.");
      return;
    }

    if (!supabase) return;

    setTeamRequestActionId(request.id);
    setMessage("");
    const nextRole = teamRoleDrafts[request.id] || request.member_role || "Player";

    const { data, error } = await supabase
      .from("team_join_requests")
      .update({ status, member_role: status === "Accepted" ? nextRole : request.member_role || nextRole, updated_at: new Date().toISOString() })
      .eq("id", request.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update team request: ${error.message}`);
    } else if (data) {
      setTeamRequests((items) => items.map((item) => (item.id === request.id ? (data as TeamRequest) : item)));
      setMessage(`Team request ${status.toLowerCase()}.`);
    }

    setTeamRequestActionId(null);
  }

  async function rateShowcasePost(post: ShowcasePost, rating: number) {
    if (!requireLogin("rate a showcase post")) return;

    if (hasUserRatedShowcase(post.id)) {
      setMessage("You already rated this showcase post.");
      return;
    }

    const showcaseRating = {
      post_id: post.id,
      user_id: session?.user.id,
      rating
    };

    if (!supabase) {
      setShowcaseRatings((items) => [
        {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...showcaseRating
        },
        ...items
      ]);
      setMessage(`Saved a ${rating}/7 showcase rating for this preview.`);
      return;
    }

    const { data, error } = await supabase
      .from("showcase_ratings")
      .insert(showcaseRating)
      .select("*")
      .single();

    if (error) {
      setMessage(error.code === "23505" ? "You already rated this showcase post." : `Could not save showcase rating: ${error.message}`);
    } else if (data) {
      setShowcaseRatings((items) => [data as ShowcaseRating, ...items]);
      setMessage(`Saved ${rating}/7 showcase rating.`);
    }
  }

  async function submitShowcaseComment(event: FormEvent<HTMLFormElement>, post: ShowcasePost) {
    event.preventDefault();
    if (!requireLogin("comment on a showcase post")) return;
    if (!requireProfile("comment on a showcase post")) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get("body") || "").trim();

    if (!body) {
      setMessage("Write a short comment first.");
      return;
    }

    const comment = {
      post_id: post.id,
      user_id: session?.user.id || "",
      body
    };

    setCommentingPostId(post.id);
    setMessage("");

    if (!supabase) {
      setShowcaseComments((items) => [
        {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...comment
        },
        ...items
      ]);
      setMessage("Demo mode: comment added on this page.");
      formElement.reset();
      setCommentingPostId(null);
      return;
    }

    const { data, error } = await supabase
      .from("showcase_comments")
      .insert(comment)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not add comment: ${error.message}`);
    } else if (data) {
      setShowcaseComments((items) => [data as ShowcaseComment, ...items]);
      setMessage("Comment added.");
      formElement.reset();
    }

    setCommentingPostId(null);
  }

  async function submitShowcaseReport(
    event: FormEvent<HTMLFormElement>,
    post: ShowcasePost,
    comment?: ShowcaseComment
  ) {
    event.preventDefault();
    if (!requireLogin("report showcase content")) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const reason = String(form.get("reason") || "Other") as ReportReason;
    const notes = String(form.get("notes") || "").trim();
    const targetType = comment ? "Comment" : "Post";
    const targetId = comment?.id || post.id;

    const report = {
      post_id: post.id,
      comment_id: comment?.id || null,
      reporter_id: session?.user.id,
      target_type: targetType,
      reason,
      notes: notes || null,
      status: "Open"
    };

    setReportingShowcaseTarget(`${targetType}-${targetId}`);
    setMessage("");

    if (!supabase) {
      setMessage("Demo mode: showcase report saved on this page.");
      formElement.reset();
      setReportingShowcaseTarget(null);
      return;
    }

    const { data, error } = await supabase
      .from("showcase_reports")
      .insert(report)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not submit showcase report: ${error.message}`);
    } else if (data) {
      setShowcaseReports((items) => [data as ShowcaseReport, ...items]);
      setMessage("Showcase report submitted. Thank you for helping keep Talent7 safe.");
      formElement.reset();
    }

    setReportingShowcaseTarget(null);
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

    if (!canManageTeamProof(challenge)) {
      setMessage("Only a team captain, organizer, proof uploader, or challenge creator can submit proof for this team challenge.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    let proofUrl = String(form.get("proof_url") || "").trim();
    const proofFile = selectedFile(form, "proof_file");
    const proofType = String(form.get("proof_type") || "Video");
    const notes = String(form.get("notes") || "").trim();

    if (!proofUrl && !proofFile) {
      setMessage("Please paste a proof link or upload a proof file first.");
      return;
    }

    setSavingProofChallengeId(challenge.id);
    setMessage("");

    if (proofFile && supabase && !challenge.id.startsWith("sample-")) {
      try {
        proofUrl = await uploadMediaFile("challenge-proofs", proofFile, `challenge-${challenge.id}`);
      } catch (error) {
        setMessage(error instanceof Error ? `Could not upload proof file: ${error.message}` : "Could not upload proof file.");
        setSavingProofChallengeId(null);
        return;
      }
    } else if (proofFile) {
      proofUrl = URL.createObjectURL(proofFile);
    }

    const proof = {
      challenge_id: challenge.id,
      user_id: session?.user.id,
      proof_type: proofType,
      review_status: "Pending review",
      proof_url: proofUrl,
      notes: notes || null
    };

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

    const { data, error } = await supabase
      .from("reports")
      .insert(report)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not submit report: ${error.message}`);
    } else if (data) {
      setChallengeReports((items) => [data as ChallengeReport, ...items]);
      setMessage("Report submitted. Thank you for helping keep Talent7 safe.");
      formElement.reset();
    }

    setReportingChallengeId(null);
  }

  async function updateSafetyReportStatus(
    report: SafetyReportItem,
    status: "Reviewed" | "Dismissed"
  ) {
    if (!requireLogin("review safety reports")) return;

    if (!isOwnerReviewer) {
      setMessage("Only the Talent7 owner account can review reports.");
      return;
    }

    if (!supabase) return;

    setSafetyReportActionId(report.id);
    setMessage("");

    const tableName = report.source === "Challenge" ? "reports" : "showcase_reports";
    const { data, error } = await supabase
      .from(tableName)
      .update({ status })
      .eq("id", report.reportId)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update report: ${error.message}`);
    } else if (data) {
      if (report.source === "Challenge") {
        setChallengeReports((items) =>
          items.map((item) => (item.id === report.reportId ? (data as ChallengeReport) : item))
        );
      } else {
        setShowcaseReports((items) =>
          items.map((item) => (item.id === report.reportId ? (data as ShowcaseReport) : item))
        );
      }
      setMessage(`Report marked ${status.toLowerCase()}.`);
    }

    setSafetyReportActionId(null);
  }

  async function completeChallenge(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    if (!requireLogin("complete a challenge")) return;

    if (isChallengeCompleted(challenge)) {
      setMessage("This challenge is already completed.");
      return;
    }

    if (!canManageTeamResult(challenge)) {
      setMessage("Only a team captain, organizer, or challenge creator can mark this team challenge completed.");
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
            <a href="#showcase" className="secondary">Showcase</a>
            <a href="#coaching" className="secondary">Coaching</a>
            <a href="#teams" className="secondary">Teams</a>
            <a href="#profiles" className="secondary">Profiles</a>
            <a href="#my-talent7" className="secondary">My Talent7</a>
            <a href="#notifications" className="secondary">
              Notifications{unreadNotifications.length > 0 ? ` (${unreadNotifications.length})` : ""}
            </a>
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

      <section className="section notificationsSection" id="notifications">
        <div className="sectionHeader">
          <p className="eyebrow">Notifications</p>
          <h2>What needs your attention</h2>
          <p>See invites, team requests, proof uploads, completed challenges, report updates, and showcase comments in one place.</p>
        </div>
        {session ? (
          notifications.length > 0 ? (
            <>
              <div className="notificationToolbar">
                <strong>
                  {unreadNotifications.length} unread / {visibleNotifications.length} shown
                </strong>
                <button disabled={unreadNotifications.length === 0} onClick={markAllNotificationsRead} type="button">
                  Mark all read
                </button>
              </div>
              <label className="notificationSearch">
                Search notifications
                <input
                  onChange={(event) => setNotificationSearch(event.target.value)}
                  placeholder="Search invites, proof, teams, reports..."
                  type="search"
                  value={notificationSearch}
                />
              </label>
              <div className="notificationFilters">
                {(["All", "Unread", "Invites", "Teams", "Proof", "Results", "Reports", "Showcase"] as NotificationFilter[]).map(
                  (filter) => (
                    <button
                      className={selectedNotificationFilter === filter ? "active" : ""}
                      key={filter}
                      onClick={() => setSelectedNotificationFilter(filter)}
                      type="button"
                    >
                      {filter}
                    </button>
                  )
                )}
              </div>
              <div className="notificationList">
                {visibleNotifications.length === 0 && (
                  <div className="emptyState">
                    <strong>No matching notifications.</strong>
                    <small>Try another filter or clear the search box.</small>
                  </div>
                )}
                {visibleNotifications.map((notification) => {
                  const isRead = readNotificationKeys.includes(notificationKey(notification));

                  return (
                    <article className={`notificationItem ${isRead ? "read" : "unread"}`} key={notification.id}>
                      <a
                        href={notification.href}
                        onClick={() => {
                          markNotificationRead(notification);
                          if (notification.challengeTitle) {
                            setRoomSearch(notification.challengeTitle);
                            setSelectedLane("All");
                          }
                        }}
                      >
                        <span>{notification.label}</span>
                        <strong>{notification.title}</strong>
                        <small>{notification.detail}</small>
                      </a>
                      <button disabled={isRead} onClick={() => markNotificationRead(notification)} type="button">
                        {isRead ? "Read" : "Mark read"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="emptyState">
              <strong>No notifications yet.</strong>
              <small>Invites, team updates, proof uploads, reports, and comments will appear here.</small>
            </div>
          )
        ) : (
          <div className="emptyState">
            <strong>Log in to see notifications.</strong>
            <a href="#account">Go to account</a>
          </div>
        )}
      </section>

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

      <section className="section showcaseSection" id="showcase">
        <div className="sectionHeader">
          <p className="eyebrow">Showcase</p>
          <h2>Post talent photos, videos, and links</h2>
          <p>Share talent outside a challenge room, collect public 7-star ratings, and keep feedback respectful.</p>
        </div>
        {session ? (
          <form className="showcaseForm" onSubmit={createShowcasePost}>
            <label>
              Media type
              <select name="media_type" defaultValue="Video">
                <option>Video</option>
                <option>Photo</option>
                <option>Link</option>
              </select>
            </label>
            <label>
              Category
              <select name="category" defaultValue={profile?.main_interest || "Talent"}>
                <option>Talent</option>
                <option>Dance</option>
                <option>Sports</option>
                <option>Gaming</option>
                <option>Coaching</option>
                <option>Fitness</option>
              </select>
            </label>
            <label className="wide">
              Photo, video, or post link
              <input name="media_url" placeholder="Paste YouTube, Instagram, Drive, image, or video link" />
            </label>
            <label className="wide fileUpload">
              Upload photo or video
              <input accept="image/*,video/*" name="media_file" type="file" />
              <small>Optional: choose a local file instead of pasting a link.</small>
            </label>
            <label className="wide">
              Caption
              <textarea name="caption" placeholder="What are you showcasing?" rows={3} />
            </label>
            <button disabled={savingShowcasePost} type="submit">
              {savingShowcasePost ? "Posting..." : "Post to showcase"}
            </button>
          </form>
        ) : (
          <div className="emptyState">
            <strong>Log in to post your talent.</strong>
            <a href="#account">Go to account</a>
          </div>
        )}
        <div className="showcaseGrid">
          {showcasePosts.length > 0 ? (
            showcasePosts.map((post) => (
              <article key={post.id}>
                <span>{post.category}</span>
                <strong>{profileDisplayName(post.user_id)}</strong>
                <p>{post.caption}</p>
                <MediaPreview label="Open post" mediaType={post.media_type} url={post.media_url} />
                <div className="showcaseRatingSummary">
                  <strong>{showcaseResults[post.id]?.ratingAverage || "0.0"} / 7</strong>
                  <small>{showcaseResults[post.id]?.ratingCount || 0} ratings</small>
                </div>
                <div className="showcaseMeta">
                  <small>{post.media_type}</small>
                  <a href={post.media_url} rel="noreferrer" target="_blank">Open post</a>
                </div>
                <div className="showcaseRatingButtons">
                  {([1, 2, 3, 4, 5, 6, 7] as const).map((rating) => (
                    <button
                      disabled={hasUserRatedShowcase(post.id)}
                      key={rating}
                      onClick={() => rateShowcasePost(post, rating)}
                      type="button"
                    >
                      {rating}
                    </button>
                  ))}
                </div>
                <form className="showcaseCommentForm" onSubmit={(event) => submitShowcaseComment(event, post)}>
                  <input name="body" placeholder="Add a supportive comment" />
                  <button disabled={commentingPostId === post.id} type="submit">
                    {commentingPostId === post.id ? "Adding..." : "Comment"}
                  </button>
                </form>
                <div className="showcaseComments">
                  <strong>Comments</strong>
                  {(showcaseCommentsByPost[post.id] || []).length > 0 ? (
                    (showcaseCommentsByPost[post.id] || []).slice(0, 3).map((comment) => (
                      <div className="showcaseComment" key={comment.id}>
                        <span>{profileDisplayName(comment.user_id)}</span>
                        <p>{comment.body}</p>
                        <details className="showcaseCommentReport">
                          <summary>Report comment</summary>
                          <form onSubmit={(event) => submitShowcaseReport(event, post, comment)}>
                            <select name="reason" defaultValue="Abuse">
                              {(["Spam", "Fake proof", "Abuse", "Wrong category", "Other"] as ReportReason[]).map((reason) => (
                                <option key={reason}>{reason}</option>
                              ))}
                            </select>
                            <input name="notes" placeholder="Short report note" />
                            <button disabled={reportingShowcaseTarget === `Comment-${comment.id}`} type="submit">
                              Submit report
                            </button>
                          </form>
                        </details>
                      </div>
                    ))
                  ) : (
                    <small>No comments yet.</small>
                  )}
                </div>
                <details className="showcaseReportBox">
                  <summary>Report post</summary>
                  <form className="showcaseReportForm" onSubmit={(event) => submitShowcaseReport(event, post)}>
                    <select name="reason" defaultValue="Spam">
                      {(["Spam", "Fake proof", "Abuse", "Wrong category", "Other"] as ReportReason[]).map((reason) => (
                        <option key={reason}>{reason}</option>
                      ))}
                    </select>
                    <input name="notes" placeholder="Short report note" />
                    <button disabled={reportingShowcaseTarget === `Post-${post.id}`} type="submit">
                      Submit report
                    </button>
                  </form>
                </details>
              </article>
            ))
          ) : (
            <div className="emptyShowcase">
              <strong>No showcase posts yet.</strong>
              <small>Post a first video, photo, or link to start the global talent showcase.</small>
            </div>
          )}
        </div>
      </section>

      <section className="section coachingSection" id="coaching">
        <div className="sectionHeader">
          <p className="eyebrow">Coaching</p>
          <h2>Find coaches or offer training</h2>
          <p>Start with coaching interest and public offers. Real payment, calendar booking, and live sessions can come after this first marketplace layer.</p>
        </div>
        {session && profile?.role.toLowerCase().includes("coach") ? (
          <form className="coachOfferForm" onSubmit={createCoachOffer}>
            <label>
              Coaching title
              <input name="title" placeholder="Badminton doubles footwork session" />
            </label>
            <label>
              Category
              <select name="category" defaultValue={profile?.main_interest || "Badminton"}>
                <option>Badminton</option>
                <option>Breakdance</option>
                <option>Calisthenics</option>
                <option>Swimming</option>
                <option>Mobile gaming</option>
                <option>Fitness</option>
              </select>
            </label>
            <label>
              Session type
              <select name="session_type" defaultValue="Live video">
                <option>Live video</option>
                <option>Uploaded lessons</option>
                <option>Both</option>
              </select>
            </label>
            <label>
              Future price range
              <select name="price_range" defaultValue="$20-50">
                <option>Free trial</option>
                <option>$0-20</option>
                <option>$20-50</option>
                <option>$50-100</option>
                <option>$100+</option>
              </select>
            </label>
            <label className="wide">
              Availability
              <input name="availability" placeholder="Weekends, evenings, India time, global..." />
            </label>
            <label className="wide">
              What learners get
              <textarea name="description" placeholder="Explain the lesson, skill level, and how you help." rows={3} />
            </label>
            <button disabled={savingCoachOffer} type="submit">
              {savingCoachOffer ? "Publishing..." : "Publish coaching offer"}
            </button>
          </form>
        ) : (
          <div className="coachingNotice">
            <strong>{session ? "Want to teach?" : "Log in to request coaching."}</strong>
            <p>
              {session
                ? "Set your profile role to Coach / instructor, then publish your first coaching offer."
                : "Create an account first, then send interest to a coach from this section."}
            </p>
            <a href="#account">Go to account</a>
          </div>
        )}
        <div className="coachStats">
          <article>
            <span>Coach profiles</span>
            <strong>{coachProfiles.length}</strong>
          </article>
          <article>
            <span>Coaching offers</span>
            <strong>{coachOffers.length}</strong>
          </article>
          <article>
            <span>Payment status</span>
            <strong>Placeholder</strong>
          </article>
        </div>
        <div className="coachOfferGrid">
          {visibleCoachOffers.length > 0 ? (
            visibleCoachOffers.map((offer) => (
              <article key={offer.id}>
                <span>{offer.category}</span>
                <strong>{offer.title}</strong>
                <small>Coach: {profileDisplayName(offer.user_id)}</small>
                <p>{offer.description}</p>
                <div className="coachOfferMeta">
                  <small>{offer.session_type}</small>
                  <small>{offer.price_range}</small>
                  <small>{offer.availability || "Flexible"}</small>
                  <small>{coachingInterestCounts[offer.id] || 0} interests</small>
                </div>
                {offer.user_id === session?.user.id ? (
                  <div className="ownCoachOffer">
                    <strong>Your offer</strong>
                    <small>People who request this will appear in your coaching interest count.</small>
                  </div>
                ) : (
                  <form className="coachingInterestForm" onSubmit={(event) => requestCoachingInterest(event, offer)}>
                    <input name="message" placeholder="Short note: goal, level, location, or timing" />
                    <button disabled={coachingInterestId === offer.id} type="submit">
                      {coachingInterestId === offer.id ? "Sending..." : "Request coaching"}
                    </button>
                  </form>
                )}
              </article>
            ))
          ) : (
            <div className="emptyCoachOffers">
              <strong>No coaching offers yet.</strong>
              <small>Coach profiles can publish the first training offer here.</small>
            </div>
          )}
        </div>
        {session && profile?.role.toLowerCase().includes("coach") && (
          <div className="coachInbox">
            <div className="coachInboxHeader">
              <div>
                <p className="eyebrow">Coach inbox</p>
                <h3>Training requests</h3>
              </div>
              <small>{coachInbox.length} requests</small>
            </div>
            {coachInbox.length > 0 ? (
              <div className="coachRequestList">
                {coachInbox.slice(0, 10).map((interest) => (
                  <article key={interest.id}>
                    <span>{interest.status}</span>
                    <strong>{interest.student_name}</strong>
                    <small>{interest.offerTitle}</small>
                    <p>{interest.message || "No note added yet."}</p>
                    <div className="coachRequestActions">
                      <button
                        disabled={coachingInterestActionId === interest.id || interest.status === "Contacted"}
                        onClick={() => updateCoachingInterestStatus(interest, "Contacted")}
                        type="button"
                      >
                        Mark contacted
                      </button>
                      <button
                        disabled={coachingInterestActionId === interest.id || interest.status === "Closed"}
                        onClick={() => updateCoachingInterestStatus(interest, "Closed")}
                        type="button"
                      >
                        Close
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="emptyCoachInbox">
                <strong>No coaching requests yet.</strong>
                <small>When learners request one of your offers, they will appear here.</small>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="section teamsSection" id="teams">
        <div className="sectionHeader">
          <p className="eyebrow">Teams & squads</p>
          <h2>Form sports teams, crews, and gaming clans</h2>
          <p>Create reusable team identities for doubles partners, dance crews, calisthenics groups, and mobile gaming squads.</p>
        </div>
        {session ? (
          <form className="teamForm" onSubmit={createTeam}>
            <label>
              Team name
              <input name="name" placeholder="Nova Smashers, Street Flow Crew, Mech Arena Squad..." />
            </label>
            <label>
              Team type
              <select name="team_type" defaultValue="Sports team">
                <option>Sports team</option>
                <option>Dance crew</option>
                <option>Gaming clan</option>
                <option>Fitness group</option>
              </select>
            </label>
            <label>
              Main activity
              <input name="main_activity" defaultValue={profile?.main_interest || ""} placeholder="Badminton doubles, PUBG, breakdance..." />
            </label>
            <label>
              Region
              <input name="region" defaultValue={profile?.region || ""} placeholder="India, Dubai, Online, Global..." />
            </label>
            <label className="wide">
              Team description
              <textarea name="description" placeholder="Who should join, what level, and what challenges you want." rows={3} />
            </label>
            <button disabled={savingTeam} type="submit">
              {savingTeam ? "Creating..." : "Create team"}
            </button>
          </form>
        ) : (
          <div className="teamNotice">
            <strong>Log in to create or join teams.</strong>
            <p>Teams help Talent7 users build stable groups for sports, talent battles, and gaming challenges.</p>
            <a href="#account">Go to account</a>
          </div>
        )}
        {session && (
          <div className="myTeamsPanel">
            <div className="teamInboxHeader">
              <div>
                <p className="eyebrow">My teams</p>
                <h3>Team activity</h3>
              </div>
              <small>
                {myTeamDashboard.owned.length} owned / {myTeamDashboard.accepted.length} joined
              </small>
            </div>
            <div className="myTeamsGrid">
              <article>
                <span>Owned teams</span>
                {myTeamDashboard.owned.length > 0 ? (
                  <div className="miniList">
                    {myTeamDashboard.owned.map((team) => {
                      const acceptedMembers = teamRequests.filter(
                        (request) => request.team_id === team.id && request.status === "Accepted"
                      );

                      return (
                        <div key={team.id}>
                          <strong>{team.name}</strong>
                          <small>
                            {team.main_activity} / {team.region}
                          </small>
                          <small>{acceptedMembers.length} accepted members</small>
                          {acceptedMembers.length > 0 && (
                            <p>
                              {acceptedMembers
                                .map((request) => `${request.requester_name} (${request.member_role || "Player"})`)
                                .join(", ")}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p>Create a team above to manage requests and start team challenges.</p>
                )}
              </article>
              <article>
                <span>Joined teams</span>
                {myTeamDashboard.accepted.length > 0 ? (
                  <div className="miniList">
                    {myTeamDashboard.accepted.map((request) => (
                      <div key={request.id}>
                        <strong>{request.team?.name || "Team"}</strong>
                        <small>{request.team?.main_activity || "Team activity"}</small>
                        <small>{request.member_role || "Player"}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Accepted team memberships will appear here.</p>
                )}
              </article>
              <article>
                <span>Pending requests</span>
                {myTeamDashboard.pending.length > 0 ? (
                  <div className="miniList">
                    {myTeamDashboard.pending.map((request) => (
                      <div key={request.id}>
                        <strong>{request.team?.name || "Team"}</strong>
                        <small>{request.message || "No note added."}</small>
                        <small>Requested role: {request.member_role || "Player"}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No pending join requests right now.</p>
                )}
              </article>
              <article>
                <span>Team challenges</span>
                {myTeamDashboard.challenges.length > 0 ? (
                  <div className="miniList">
                    {myTeamDashboard.challenges.slice(0, 5).map((challenge) => (
                      <div key={challenge.id}>
                        <strong>{challenge.title}</strong>
                        <small>
                          {challenge.status}
                          {challenge.winner ? ` / Winner: ${challenge.winner}` : ""}
                        </small>
                        <button type="button" onClick={() => viewTeamChallenge(challenge)}>
                          View room
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Team-linked challenges will appear after you create or join one.</p>
                )}
              </article>
            </div>
          </div>
        )}
        <div className="teamGrid">
          {teams.length > 0 ? (
            teams.map((team) => (
              <article key={team.id}>
                <span>{team.team_type}</span>
                <strong>{team.name}</strong>
                <small>Owner: {profileDisplayName(team.owner_user_id)}</small>
                <p>{team.description}</p>
                <div className="teamMeta">
                  <small>{team.main_activity}</small>
                  <small>{team.region}</small>
                  <small>{teamRequestCounts[team.id]?.accepted || 0} accepted</small>
                  <small>{teamRequestCounts[team.id]?.pending || 0} pending</small>
                </div>
                {team.owner_user_id === session?.user.id ? (
                  <div className="ownTeamNotice">
                    <strong>Your team</strong>
                    <small>Join requests will appear in your team inbox.</small>
                    <button type="button" onClick={() => challengeTeam(team)}>
                      Start team challenge
                    </button>
                  </div>
                ) : (
                  <>
                    <button className="teamChallengeButton" type="button" onClick={() => challengeTeam(team)}>
                      Challenge this team
                    </button>
                    <form className="teamRequestForm" onSubmit={(event) => requestTeamJoin(event, team)}>
                      <select name="member_role" defaultValue="Player">
                        {teamMemberRoles.map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                      <input name="message" placeholder="Short note: role, skill level, city, timing..." />
                      <button disabled={teamRequestId === team.id} type="submit">
                        {teamRequestId === team.id ? "Sending..." : "Request to join"}
                      </button>
                    </form>
                  </>
                )}
              </article>
            ))
          ) : (
            <div className="emptyTeams">
              <strong>No teams yet.</strong>
              <small>Create the first Talent7 team, crew, clan, or fitness group.</small>
            </div>
          )}
        </div>
        {session && (
          <div className="teamInbox">
            <div className="teamInboxHeader">
              <div>
                <p className="eyebrow">Team inbox</p>
                <h3>Join requests</h3>
              </div>
              <small>{teamInbox.length} requests</small>
            </div>
            {teamInbox.length > 0 ? (
              <div className="teamRequestList">
                {teamInbox.slice(0, 10).map((request) => (
                  <article key={request.id}>
                    <span>{request.status}</span>
                    <strong>{request.requester_name}</strong>
                    <small>{request.teamName}</small>
                    <label className="teamRolePicker">
                      Member role
                      <select
                        value={teamRoleDrafts[request.id] || request.member_role || "Player"}
                        onChange={(event) =>
                          setTeamRoleDrafts((items) => ({
                            ...items,
                            [request.id]: event.target.value
                          }))
                        }
                      >
                        {teamMemberRoles.map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                    </label>
                    <p>{request.message || "No note added yet."}</p>
                    <div className="teamRequestActions">
                      <button
                        disabled={teamRequestActionId === request.id || request.status === "Accepted"}
                        onClick={() => updateTeamRequestStatus(request, "Accepted")}
                        type="button"
                      >
                        Accept
                      </button>
                      <button
                        disabled={teamRequestActionId === request.id || request.status === "Declined"}
                        onClick={() => updateTeamRequestStatus(request, "Declined")}
                        type="button"
                      >
                        Decline
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="emptyTeamInbox">
                <strong>No join requests yet.</strong>
                <small>If you own a team, requests from other users will appear here.</small>
              </div>
            )}
          </div>
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
        <div className="safetyInbox">
          <div className="safetyInboxHeader">
            <div>
              <p className="eyebrow">Safety inbox</p>
              <h3>{isOwnerReviewer ? "All safety reports" : "My submitted reports"}</h3>
            </div>
            <small>
              {session
                ? `${mySafetyReports.length} ${isOwnerReviewer ? "total" : "submitted"} reports`
                : "Login required"}
            </small>
          </div>
          {isOwnerReviewer && (
            <div className="ownerReviewNotice">
              <strong>Owner review mode</strong>
              <small>You can see all reports and mark each one reviewed or dismissed.</small>
            </div>
          )}
          {session ? (
            mySafetyReports.length > 0 ? (
              <div className="safetyReportList">
                {mySafetyReports.slice(0, 8).map((report) => (
                  <article key={report.id}>
                    <span>{report.area}</span>
                    <strong>{report.title}</strong>
                    <p>{report.notes || report.reason}</p>
                    <div>
                      <small>{report.reason}</small>
                      <small>{report.status}</small>
                    </div>
                    {isOwnerReviewer && (
                      <div className="ownerReportActions">
                        <button
                          disabled={safetyReportActionId === report.id || report.status === "Reviewed"}
                          onClick={() => updateSafetyReportStatus(report, "Reviewed")}
                          type="button"
                        >
                          Mark reviewed
                        </button>
                        <button
                          disabled={safetyReportActionId === report.id || report.status === "Dismissed"}
                          onClick={() => updateSafetyReportStatus(report, "Dismissed")}
                          type="button"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="emptySafetyInbox">
                <strong>No reports submitted yet.</strong>
                <small>When you report a challenge, proof, showcase post, or comment, it will appear here.</small>
              </div>
            )
          ) : (
            <div className="emptySafetyInbox">
              <strong>Log in to view your safety reports.</strong>
              <a href="#account">Go to account</a>
            </div>
          )}
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
        {selectedProfile && selectedProfileSummary && (
          <div className="profileDetailPanel" id="profile-detail">
            <div className="profileDetailHeader">
              <div>
                <p className="eyebrow">Profile detail</p>
                <h3>{selectedProfile.display_name}</h3>
                <span>@{selectedProfile.username}</span>
              </div>
              <button onClick={() => setSelectedProfile(null)} type="button">
                Close profile
              </button>
            </div>
            <div className="profileDetailStats">
              <small>{selectedProfile.role}</small>
              <small>{selectedProfile.main_interest || "No main interest yet"}</small>
              <small>{selectedProfile.region || "Global"}</small>
              <small>{followCounts[selectedProfile.user_id]?.followers || 0} followers</small>
              <small>{selectedProfileSummary.showcasePosts.length} showcase posts</small>
              <small>{selectedProfileSummary.challenges.length} rooms</small>
              <small>{selectedProfileSummary.wins.length} wins</small>
              <small>{selectedProfileSummary.proofs.length} proofs</small>
            </div>
            <div className="trustBadgeRow">
              {profileTrustBadges(selectedProfile).length > 0 ? (
                profileTrustBadges(selectedProfile).map((badge) => <span key={badge}>{badge}</span>)
              ) : (
                <span>New Talent7 profile</span>
              )}
            </div>
            <div className="profileDetailActions">
              <button
                disabled={followActionId === selectedProfile.user_id || selectedProfile.user_id === session?.user.id}
                onClick={() => toggleFollow(selectedProfile)}
                type="button"
              >
                {follows.some((follow) => follow.follower_id === session?.user.id && follow.following_id === selectedProfile.user_id)
                  ? "Following"
                  : selectedProfile.user_id === session?.user.id
                    ? "Your profile"
                    : "Follow"}
              </button>
              <button onClick={() => inviteProfileToChallenge(selectedProfile)} type="button">
                Challenge profile
              </button>
              <button onClick={() => viewProfileActivity(selectedProfile)} type="button">
                View activity
              </button>
            </div>
            <div className="profileDetailGrid">
              <article>
                <span>Showcase</span>
                {selectedProfileSummary.showcasePosts.length > 0 ? (
                  selectedProfileSummary.showcasePosts.map((post) => (
                    <div key={post.id}>
                      <strong>{post.caption}</strong>
                      <small>{post.category} / {post.media_type}</small>
                      <MediaPreview label="Open post" mediaType={post.media_type} url={post.media_url} />
                    </div>
                  ))
                ) : (
                  <small>No showcase posts yet.</small>
                )}
              </article>
              <article>
                <span>Challenge rooms</span>
                {selectedProfileSummary.challenges.length > 0 ? (
                  selectedProfileSummary.challenges.map((challenge) => (
                    <button key={challenge.id} onClick={() => viewTeamChallenge(challenge)} type="button">
                      <strong>{challenge.title}</strong>
                      <small>{challenge.status}{challenge.winner ? ` / Winner: ${challenge.winner}` : ""}</small>
                    </button>
                  ))
                ) : (
                  <small>No related challenge rooms yet.</small>
                )}
              </article>
              <article>
                <span>Wins</span>
                {selectedProfileSummary.wins.length > 0 ? (
                  selectedProfileSummary.wins.map((challenge) => (
                    <button key={challenge.id} onClick={() => viewTeamChallenge(challenge)} type="button">
                      <strong>{challenge.winner}</strong>
                      <small>{challenge.title}{challenge.final_score ? ` / ${challenge.final_score}` : ""}</small>
                    </button>
                  ))
                ) : (
                  <small>No completed wins found yet.</small>
                )}
              </article>
              <article>
                <span>Teams</span>
                {selectedProfileSummary.ownedTeams.length > 0 || selectedProfileSummary.joinedTeams.length > 0 ? (
                  <>
                    {selectedProfileSummary.ownedTeams.map((team) => (
                      <div key={team.id}>
                        <strong>{team.name}</strong>
                        <small>Owner / {team.main_activity} / {team.region}</small>
                      </div>
                    ))}
                    {selectedProfileSummary.joinedTeams.map((request) => (
                      <div key={request.id}>
                        <strong>{request.team?.name || "Team"}</strong>
                        <small>{request.member_role || "Player"} / {request.team?.main_activity || "Team activity"}</small>
                      </div>
                    ))}
                  </>
                ) : (
                  <small>No teams yet.</small>
                )}
              </article>
            </div>
          </div>
        )}
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
                <div className="trustBadgeRow compact">
                  {profileTrustBadges(item).length > 0 ? (
                    profileTrustBadges(item).slice(0, 3).map((badge) => <span key={badge}>{badge}</span>)
                  ) : (
                    <span>New profile</span>
                  )}
                </div>
                {item.role.toLowerCase().includes("coach") && (
                  <div className="coachProfileBadge">
                    <strong>Coach profile</strong>
                    <small>{coachOffers.filter((offer) => offer.user_id === item.user_id).length} offers</small>
                  </div>
                )}
                <div className="profileActions">
                  <button onClick={() => openProfileDetail(item)} type="button">
                    Open profile
                  </button>
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
                  {item.role.toLowerCase().includes("coach") && (
                    <a href="#coaching">View coaching</a>
                  )}
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
                  <a
                    href={item.challengeId ? "#rooms" : "#showcase"}
                    onClick={() => {
                      if (item.challengeId) setRoomSearch(item.title);
                    }}
                  >
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
          <label>
            Link Team A
            <select name="team_a_id" defaultValue={challengeDraft.team_a_id}>
              <option value="">No linked team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} / {team.main_activity}
                </option>
              ))}
            </select>
          </label>
          <label>
            Link Team B
            <select name="team_b_id" defaultValue={challengeDraft.team_b_id}>
              <option value="">No linked team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} / {team.main_activity}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Rules
            <textarea
              name="rules"
              rows={4}
              defaultValue={challengeDraft.rules}
            />
          </label>
          <label>
            Venue or booking note
            <input name="venue_name" defaultValue={challengeDraft.venue_name} placeholder="Badminton court, pool, gym, online lobby..." />
          </label>
          <label>
            Booking link
            <input name="booking_url" defaultValue={challengeDraft.booking_url} placeholder="Paste court, pool, venue, or event booking link" />
          </label>
          <label>
            Sport / venue type
            <select name="sport_type" defaultValue={challengeDraft.sport_type}>
              <option>Badminton</option>
              <option>Swimming</option>
              <option>Gym / fitness</option>
              <option>Dance studio</option>
              <option>Calisthenics park</option>
              <option>Mobile gaming</option>
              <option>General sports venue</option>
            </select>
          </label>
          <label>
            Booking region
            <input name="booking_region" defaultValue={challengeDraft.booking_region} placeholder="India, Dubai, London, Online..." />
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
          {visibleChallenges.map((challenge) => {
            const proofAllowed = canManageTeamProof(challenge);
            const resultAllowed = canManageTeamResult(challenge);
            const roleNotice = teamPermissionLabel(challenge);

            return (
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
              {(challenge.team_a_id || challenge.team_b_id) && (
                <div className="linkedTeams">
                  {(["A", "B"] as const).map((side) => {
                    const team = linkedTeam(side === "A" ? challenge.team_a_id : challenge.team_b_id);
                    const fallbackName = side === "A" ? challenge.team_a : challenge.team_b;

                    return (
                      <div key={side}>
                        <span>Team {side}</span>
                        <strong>{team?.name || fallbackName}</strong>
                        <small>{team ? `${team.team_type} / ${team.main_activity} / ${team.region}` : "No linked team"}</small>
                      </div>
                    );
                  })}
                </div>
              )}
              {roleNotice && (
                <div className={`teamPermissionNotice ${proofAllowed || resultAllowed ? "allowed" : ""}`}>
                  <strong>Team role access</strong>
                  <small>{roleNotice}</small>
                  <small>Captains and organizers can finish results. Proof uploaders can submit victory proof.</small>
                </div>
              )}
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
              {(challenge.venue_name || challenge.booking_url || challenge.sport_type || challenge.booking_region) && (
                <div className="bookingPanel">
                  <div>
                    <span>Venue / booking</span>
                    <strong>{challenge.venue_name || "Booking link available"}</strong>
                    <small>
                      {[challenge.sport_type, challenge.booking_region].filter(Boolean).join(" / ") ||
                        "Add sport and region for better suggestions"}
                    </small>
                  </div>
                  <div className="bookingActions">
                    {challenge.booking_url && (
                      <a href={challenge.booking_url} rel="noreferrer" target="_blank">
                        Book venue
                      </a>
                    )}
                    {suggestedBookingLinks(challenge).map((link) => (
                      <a href={link.url} key={link.label} rel="noreferrer" target="_blank">
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
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
                    <label className="fileUpload compact">
                      Upload proof file
                      <input accept="image/*,video/*" name="proof_file" type="file" />
                      <small>Optional: upload a photo, video, or screenshot instead of pasting a link.</small>
                    </label>
                    <textarea name="notes" rows={2} placeholder="Short note, winner name, score, or context" />
                    <button disabled={savingProofChallengeId === challenge.id || !proofAllowed} type="submit">
                      {!proofAllowed
                        ? "Team role required"
                        : savingProofChallengeId === challenge.id
                          ? "Saving proof..."
                          : "Submit proof"}
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
                  <button disabled={completingChallengeId === challenge.id || !resultAllowed} type="submit">
                    {!resultAllowed
                      ? "Captain/organizer required"
                      : completingChallengeId === challenge.id
                        ? "Saving result..."
                        : "Mark completed"}
                  </button>
                </form>
              )}
              {(roomProofs[challenge.id] || []).length > 0 && (
                <div className="proofList">
                  <strong>Proofs submitted</strong>
                  {(roomProofs[challenge.id] || []).slice(0, 3).map((proof) => (
                    <div className="proofItem" key={proof.id}>
                      <MediaPreview label="View proof" mediaType={proof.proof_type} url={proof.proof_url} />
                      <div>
                        <span>{proof.proof_type ? `${proof.proof_type}: ${proof.notes || "Open proof"}` : proof.notes || "Open proof"}</span>
                        <small>
                          {proof.review_status || "Pending review"} | <a href={proof.proof_url} rel="noreferrer" target="_blank">Open proof</a>
                        </small>
                      </div>
                    </div>
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
            );
          })}
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
