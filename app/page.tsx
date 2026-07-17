"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "../lib/supabase";

type ChallengeLane = "Talent battle" | "Sports challenge" | "Mobile gaming challenge";
type ChallengeStatusFilter = "All" | "Open" | "Completed";
type ExpertHelpType =
  | "Medical guidance"
  | "Fitness injury"
  | "Plumbing"
  | "Electrical"
  | "Tech help"
  | "Auto / bike help"
  | "Home repair"
  | "Study help"
  | "Career help"
  | "Mental wellness support"
  | "Legal / document guidance"
  | "Travel/local guidance"
  | "Cooking / nutrition help"
  | "Parenting / childcare guidance"
  | "Pet care guidance"
  | "Other urgent help";

const teamMemberRoles = ["Player", "Captain", "Dancer", "Coach", "Substitute", "Proof uploader", "Organizer"];
const proofManagerRoles = ["Captain", "Organizer", "Proof uploader"];
const resultManagerRoles = ["Captain", "Organizer"];
const maxPhotoUploadBytes = 10 * 1024 * 1024;
const maxVideoUploadBytes = 50 * 1024 * 1024;
const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"];
const videoMimeTypes = ["video/mp4", "video/quicktime"];
const challengeActivityOptions = [
  "Badminton doubles",
  "Badminton singles",
  "Breakdance battle",
  "Swimming race",
  "Volleyball match",
  "Football match",
  "Cricket match",
  "Basketball match",
  "Running race",
  "Athletics challenge",
  "Skating challenge",
  "Arm wrestling",
  "Karate sparring",
  "Bouldering challenge",
  "Calisthenics",
  "Gym / fitness",
  "Dance battle",
  "PUBG squad battle",
  "Mech Arena challenge",
  "Mobile gaming",
  "Chess match",
  "Table tennis",
  "Tennis match",
  "Boxing challenge",
  "Kickboxing",
  "Martial arts challenge",
  "Cycling challenge",
  "Parkour challenge",
  "Yoga challenge",
  "Singing battle",
  "Rap battle",
  "Music performance",
  "Art challenge",
  "Team tournament",
  "Sports coaching",
  "Expert help",
  "Other talent showcase"
];
const expertHelpTypes: ExpertHelpType[] = [
  "Medical guidance",
  "Fitness injury",
  "Plumbing",
  "Electrical",
  "Tech help",
  "Auto / bike help",
  "Home repair",
  "Study help",
  "Career help",
  "Mental wellness support",
  "Legal / document guidance",
  "Travel/local guidance",
  "Cooking / nutrition help",
  "Parenting / childcare guidance",
  "Pet care guidance",
  "Other urgent help"
];

type MobileTabId = "challenges" | "showcase" | "listen" | "coaching" | "help" | "account";

const mobileTabs: {
  id: MobileTabId;
  label: string;
  firstSection: string;
  links: { label: string; href: string }[];
}[] = [
  {
    id: "challenges",
    label: "Challenges",
    firstSection: "rooms",
    links: [
      { label: "Rooms", href: "#rooms" },
      { label: "Create", href: "#create" },
      { label: "Teams", href: "#teams" },
      { label: "Invites", href: "#invites" }
    ]
  },
  {
    id: "showcase",
    label: "Showcase",
    firstSection: "showcase",
    links: [
      { label: "Posts", href: "#showcase" },
      { label: "Profiles", href: "#profiles" },
      { label: "Feed", href: "#following-feed" }
    ]
  },
  {
    id: "listen",
    label: "Listen",
    firstSection: "listen-rooms",
    links: [
      { label: "Listen rooms", href: "#listen-rooms" },
      { label: "Showcase", href: "#showcase" },
      { label: "Feed", href: "#following-feed" }
    ]
  },  {
    id: "coaching",
    label: "Coaching",
    firstSection: "coaching",
    links: [
      { label: "Coaching", href: "#coaching" },
      { label: "Live preview", href: "#live-preview" }
    ]
  },
  {
    id: "help",
    label: "Guidance",
    firstSection: "expert-help",
    links: [
      { label: "Expert guidance", href: "#expert-help" },
      { label: "Safety", href: "#safety" },
      { label: "Feedback", href: "#feedback" }
    ]
  },
  {
    id: "account",
    label: "Account",
    firstSection: "account",
    links: [
      { label: "Account", href: "#account" },
      { label: "Alerts", href: "#notifications" },
      { label: "Dashboard", href: "#my-talent7" },
      { label: "Plans", href: "#plans" }
    ]
  }
];

type ListenMood = "Chill" | "Workout" | "Focus" | "Romantic" | "Party" | "Road trip" | "Study" | "Open vibe";

type ListenRoom = {
  id: string;
  title: string;
  host_name: string;
  mood: ListenMood;
  room_note: string | null;
  current_track_title: string;
  current_track_url: string;
  listener_count: number;
  love_count: number;
  vibe_count: number;
  created_by: string | null;
  created_at: string;
};

type ListenTrack = {
  id: string;
  room_id: string;
  track_title: string;
  track_url: string;
  added_by: string;
  created_at: string;
};

type ListenRoomDraft = {
  title: string;
  host_name: string;
  mood: ListenMood;
  room_note: string;
  current_track_title: string;
  current_track_url: string;
};

type ListenTrackDraft = {
  track_title: string;
  track_url: string;
  added_by: string;
};

const listenMoodOptions: ListenMood[] = ["Chill", "Workout", "Focus", "Romantic", "Party", "Road trip", "Study", "Open vibe"];

const defaultListenDraft: ListenRoomDraft = {
  title: "",
  host_name: "",
  mood: "Chill",
  room_note: "",
  current_track_title: "",
  current_track_url: ""
};

const sampleListenRooms: ListenRoom[] = [
  {
    id: "listen-room-first-wave",
    title: "First wave favourites",
    host_name: "Talent7",
    mood: "Open vibe",
    room_note: "A room for friends, squads, couples, and challengers to share public song links while hanging out.",
    current_track_title: "Add the first public song link",
    current_track_url: "https://www.youtube.com",
    listener_count: 7,
    love_count: 12,
    vibe_count: 9,
    created_by: null,
    created_at: "2026-07-17T00:00:00.000Z"
  }
];

const sampleListenTracks: ListenTrack[] = [];
const listenRoomsStorageKey = "talent7-listen-rooms";
const listenTracksStorageKey = "talent7-listen-tracks";
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

type ChallengeMessage = {
  id: string;
  challenge_id: string;
  user_id?: string | null;
  author_name: string;
  body: string;
  created_at: string;
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

type PaymentInterest = {
  id: string;
  user_id: string;
  display_name: string;
  intent_type: "Plan" | "Contribution";
  label: string;
  amount_label: string;
  status: "Interested" | "Ready later" | "Contact requested";
  created_at: string;
};

type FounderFeedback = {
  id: string;
  user_id: string;
  display_name: string;
  feedback_type: "Bug" | "Confusing" | "Feature request" | "Payment interest" | "General";
  area: string | null;
  message: string;
  status: "New" | "Reviewed" | "Planned" | "Closed";
  created_at: string;
  updated_at?: string | null;
};

type FirstWaveInterest = {
  id: string;
  user_id: string;
  display_name: string;
  main_interest: string;
  region: string;
  role_goal: "Challenger" | "Audience" | "Coach" | "Organizer" | "Expert helper" | "Gaming squad";
  availability: "Ready now" | "This week" | "This month" | "Just exploring";
  notes: string | null;
  status: "New" | "Contact later" | "Invited" | "Active tester";
  created_at: string;
  updated_at?: string | null;
};

type ExpertHelpRequest = {
  id: string;
  requester_id: string;
  requester_name: string;
  help_type: ExpertHelpType;
  urgency: "Need guidance soon" | "Can wait" | "Urgent but not life-threatening";
  location: string | null;
  details: string;
  status: "Open" | "In review" | "Assigned" | "Responded" | "Closed";
  assigned_expert_id?: string | null;
  assigned_expert_name?: string | null;
  expert_response?: string | null;
  expert_response_at?: string | null;
  session_status?: "Not scheduled" | "Proposed" | "Confirmed" | null;
  proposed_session_at?: string | null;
  confirmed_session_at?: string | null;
  session_note?: string | null;
  session_updated_by?: string | null;
  session_link?: string | null;
  session_link_note?: string | null;
  session_link_added_by?: string | null;
  session_link_added_at?: string | null;
  session_completed_at?: string | null;
  session_completed_by?: string | null;
  expert_rating?: number | null;
  expert_feedback?: string | null;
  expert_feedback_at?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type ExpertProfile = {
  id: string;
  user_id: string;
  display_name: string;
  expertise_area: ExpertHelpType;
  region: string;
  availability: string;
  live_video_ready: boolean;
  service_mode?: "Free help" | "Paid consultation" | "Both" | null;
  price_range?: string | null;
  availability_status?: "Accepting requests" | "Busy" | "Unavailable" | null;
  bio: string;
  verification_status: "Pending review" | "Verified" | "Needs changes";
  created_at: string;
  updated_at?: string | null;
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
  category: "Invites" | "Teams" | "Proof" | "Results" | "Reports" | "Showcase" | "Expert help" | "Feedback";
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

  if (
    normalized.includes("pubg") ||
    normalized.includes("mech arena") ||
    normalized.includes("gaming") ||
    normalized.includes("game")
  ) {
    return "Mobile gaming challenge";
  }

  if (
    normalized.includes("dance") ||
    normalized.includes("break") ||
    normalized.includes("singing") ||
    normalized.includes("rap") ||
    normalized.includes("music") ||
    normalized.includes("art")
  ) {
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

function profileHash(username: string) {
  return `profile-${username.toLowerCase().replace(/[^a-z0-9_]+/g, "-")}`;
}

function roomHash(challengeId: string) {
  return `room-${challengeId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`;
}

function teamHash(teamId: string) {
  return `team-${teamId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`;
}

function showcaseHash(postId: string) {
  return `showcase-${postId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`;
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
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTabId>("challenges");
  const [listenRooms, setListenRooms] = useState<ListenRoom[]>(sampleListenRooms);
  const [listenTracks, setListenTracks] = useState<ListenTrack[]>(sampleListenTracks);
  const [listenRoomDraft, setListenRoomDraft] = useState<ListenRoomDraft>(defaultListenDraft);
  const [listenTrackDrafts, setListenTrackDrafts] = useState<Record<string, ListenTrackDraft>>({});

  const listenTracksByRoom = useMemo(() => {
    return listenTracks.reduce<Record<string, ListenTrack[]>>((grouped, track) => {
      if (!grouped[track.room_id]) grouped[track.room_id] = [];
      grouped[track.room_id].push(track);
      return grouped;
    }, {});
  }, [listenTracks]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedRooms = window.localStorage.getItem(listenRoomsStorageKey);
      if (savedRooms) setListenRooms(JSON.parse(savedRooms));
      const savedTracks = window.localStorage.getItem(listenTracksStorageKey);
      if (savedTracks) setListenTracks(JSON.parse(savedTracks));
    } catch {
      setListenRooms(sampleListenRooms);
      setListenTracks(sampleListenTracks);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(listenRoomsStorageKey, JSON.stringify(listenRooms));
  }, [listenRooms]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(listenTracksStorageKey, JSON.stringify(listenTracks));
  }, [listenTracks]);
  const [profileSearch, setProfileSearch] = useState("");
  const [challengeDraft, setChallengeDraft] = useState<ChallengeDraft>(defaultChallengeDraft);
  const [selectedActivityProfile, setSelectedActivityProfile] = useState<TalentProfile | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<TalentProfile | null>(null);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [authMode, setAuthMode] = useState<"Sign up" | "Log in">("Sign up");
  const [authLoading, setAuthLoading] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<TalentProfile | null>(null);
  const [publicProfiles, setPublicProfiles] = useState<TalentProfile[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [joiningChallengeId, setJoiningChallengeId] = useState<string | null>(null);
  const [createdChallengeId, setCreatedChallengeId] = useState<string | null>(null);
  const [highlightedChallengeId, setHighlightedChallengeId] = useState<string | null>(null);
  const [highlightedTeamId, setHighlightedTeamId] = useState<string | null>(null);
  const [highlightedShowcasePostId, setHighlightedShowcasePostId] = useState<string | null>(null);
  const [completingChallengeId, setCompletingChallengeId] = useState<string | null>(null);
  const [savingProofChallengeId, setSavingProofChallengeId] = useState<string | null>(null);
  const [reportingChallengeId, setReportingChallengeId] = useState<string | null>(null);
  const [sendingChatChallengeId, setSendingChatChallengeId] = useState<string | null>(null);
  const [reportingChatMessageId, setReportingChatMessageId] = useState<string | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [joinChoices, setJoinChoices] = useState<Record<string, { role: JoinRole; side: string }>>({});
  const [proofTypes, setProofTypes] = useState<Record<string, string>>({});
  const [joins, setJoins] = useState<ChallengeJoin[]>([]);
  const [ratings, setRatings] = useState<ChallengeRating[]>([]);
  const [votes, setVotes] = useState<ChallengeVote[]>([]);
  const [proofs, setProofs] = useState<ChallengeProof[]>([]);
  const [invites, setInvites] = useState<ChallengeInvite[]>([]);
  const [follows, setFollows] = useState<ProfileFollow[]>([]);
  const [challengeMessages, setChallengeMessages] = useState<ChallengeMessage[]>([]);
  const [challengeReports, setChallengeReports] = useState<ChallengeReport[]>([]);
  const [showcaseReports, setShowcaseReports] = useState<ShowcaseReport[]>([]);
  const [coachOffers, setCoachOffers] = useState<CoachOffer[]>([]);
  const [coachingInterests, setCoachingInterests] = useState<CoachingInterest[]>([]);
  const [paymentInterests, setPaymentInterests] = useState<PaymentInterest[]>([]);
  const [founderFeedback, setFounderFeedback] = useState<FounderFeedback[]>([]);
  const [firstWaveInterests, setFirstWaveInterests] = useState<FirstWaveInterest[]>([]);
  const [expertHelpRequests, setExpertHelpRequests] = useState<ExpertHelpRequest[]>([]);
  const [expertProfiles, setExpertProfiles] = useState<ExpertProfile[]>([]);
  const [teams, setTeams] = useState<TalentTeam[]>([]);
  const [teamRequests, setTeamRequests] = useState<TeamRequest[]>([]);
  const [isOwnerReviewer, setIsOwnerReviewer] = useState(false);
  const [safetyReportActionId, setSafetyReportActionId] = useState<string | null>(null);
  const [savingCoachOffer, setSavingCoachOffer] = useState(false);
  const [coachingInterestId, setCoachingInterestId] = useState<string | null>(null);
  const [coachingInterestActionId, setCoachingInterestActionId] = useState<string | null>(null);
  const [paymentActionKey, setPaymentActionKey] = useState<string | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackActionKey, setFeedbackActionKey] = useState<string | null>(null);
  const [feedbackDraftType, setFeedbackDraftType] = useState<FounderFeedback["feedback_type"]>("General");
  const [savingFirstWave, setSavingFirstWave] = useState(false);
  const [firstWaveActionKey, setFirstWaveActionKey] = useState<string | null>(null);
  const [savingExpertHelp, setSavingExpertHelp] = useState(false);
  const [expertHelpActionId, setExpertHelpActionId] = useState<string | null>(null);
  const [savingExpertProfile, setSavingExpertProfile] = useState(false);
  const [expertProfileActionId, setExpertProfileActionId] = useState<string | null>(null);
  const [requestingExpertId, setRequestingExpertId] = useState<string | null>(null);
  const [expertReplyActionId, setExpertReplyActionId] = useState<string | null>(null);
  const [expertScheduleActionId, setExpertScheduleActionId] = useState<string | null>(null);
  const [expertSessionLinkActionId, setExpertSessionLinkActionId] = useState<string | null>(null);
  const [expertCompletionActionId, setExpertCompletionActionId] = useState<string | null>(null);
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
  const [deletingShowcasePostId, setDeletingShowcasePostId] = useState<string | null>(null);
  const [deletingProofId, setDeletingProofId] = useState<string | null>(null);
  const [editingChallengeId, setEditingChallengeId] = useState<string | null>(null);
  const [editingShowcasePostId, setEditingShowcasePostId] = useState<string | null>(null);
  const [editingProofId, setEditingProofId] = useState<string | null>(null);
  const [readNotificationKeys, setReadNotificationKeys] = useState<string[]>([]);
  const [launchQaDoneKeys, setLaunchQaDoneKeys] = useState<string[]>([]);
  const [playStoreDoneKeys, setPlayStoreDoneKeys] = useState<string[]>([]);
  const [selectedNotificationFilter, setSelectedNotificationFilter] = useState<NotificationFilter>("All");
  const [notificationSearch, setNotificationSearch] = useState("");
  const [selectedHelpType, setSelectedHelpType] = useState<ExpertHelpType>("Medical guidance");
  const [expertProfileSearch, setExpertProfileSearch] = useState("");
  const [expertProfileAreaFilter, setExpertProfileAreaFilter] = useState<"All" | ExpertHelpType>("All");
  const [expertProfileServiceFilter, setExpertProfileServiceFilter] = useState("All");
  const [expertProfileAvailabilityFilter, setExpertProfileAvailabilityFilter] = useState("All");
  const [expertProfileMinRating, setExpertProfileMinRating] = useState("0");

  const visibleExpertProfiles = useMemo(() => {
    return expertProfiles.filter(
      (expert) =>
        isOwnerReviewer ||
        expert.verification_status === "Verified" ||
        (session?.user.id && expert.user_id === session.user.id)
    );
  }, [expertProfiles, isOwnerReviewer, session]);

  const expertReputation = useMemo(() => {
    return expertHelpRequests.reduce<
      Record<string, { completed: number; averageRating: string; latestFeedback: string; ratingCount: number }>
    >((stats, request) => {
      if (!request.assigned_expert_id || !request.session_completed_at) return stats;

      const current = stats[request.assigned_expert_id] || {
        completed: 0,
        averageRating: "0.0",
        latestFeedback: "",
        ratingCount: 0
      };

      const ratingTotal = Number(current.averageRating) * current.ratingCount + (request.expert_rating || 0);
      const nextRatingCount = request.expert_rating ? current.ratingCount + 1 : current.ratingCount;

      stats[request.assigned_expert_id] = {
        completed: current.completed + 1,
        averageRating: nextRatingCount ? (ratingTotal / nextRatingCount).toFixed(1) : "0.0",
        latestFeedback: request.expert_feedback || current.latestFeedback,
        ratingCount: nextRatingCount
      };

      return stats;
    }, {});
  }, [expertHelpRequests]);

  const filteredExpertProfiles = useMemo(() => {
    const search = expertProfileSearch.trim().toLowerCase();
    const minimumRating = Number(expertProfileMinRating);

    return visibleExpertProfiles.filter((expert) => {
      const reputation = expertReputation[expert.id];
      const averageRating = Number(reputation?.averageRating || 0);
      const searchText = [
        expert.display_name,
        expert.expertise_area,
        expert.region,
        expert.availability,
        expert.bio,
        expert.service_mode,
        expert.price_range,
        expert.availability_status
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!search || searchText.includes(search)) &&
        (expertProfileAreaFilter === "All" || expert.expertise_area === expertProfileAreaFilter) &&
        (expertProfileServiceFilter === "All" || (expert.service_mode || "Free help") === expertProfileServiceFilter) &&
        (expertProfileAvailabilityFilter === "All" ||
          (expert.availability_status || "Accepting requests") === expertProfileAvailabilityFilter) &&
        averageRating >= minimumRating
      );
    });
  }, [
    expertProfileAreaFilter,
    expertProfileAvailabilityFilter,
    expertProfileMinRating,
    expertProfileSearch,
    expertProfileServiceFilter,
    expertReputation,
    visibleExpertProfiles
  ]);

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

  const roomMessages = useMemo(() => {
    return challengeMessages.reduce<Record<string, ChallengeMessage[]>>((groups, chatMessage) => {
      groups[chatMessage.challenge_id] = groups[chatMessage.challenge_id] || [];
      groups[chatMessage.challenge_id].push(chatMessage);
      return groups;
    }, {});
  }, [challengeMessages]);

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

  const currentPaymentInterest = useMemo(() => {
    return paymentInterests.find((interest) => interest.intent_type === "Plan") || null;
  }, [paymentInterests]);

  const latestContributionInterest = useMemo(() => {
    return paymentInterests.find((interest) => interest.intent_type === "Contribution") || null;
  }, [paymentInterests]);

  const myFirstWaveInterest = useMemo(() => {
    return firstWaveInterests.find((interest) => interest.user_id === session?.user.id) || null;
  }, [firstWaveInterests, session]);

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

  const adminModeration = useMemo(() => {
    const reports = mySafetyReports;
    const openReports = reports.filter((report) => report.status === "Open");
    const reviewedReports = reports.filter((report) => report.status === "Reviewed");
    const dismissedReports = reports.filter((report) => report.status === "Dismissed");

    return {
      openReports,
      reviewedReports,
      dismissedReports,
      challenges: reports.filter((report) => report.area === "Challenge"),
      proofs: reports.filter((report) => report.area === "Proof"),
      posts: reports.filter((report) => report.area === "Post"),
      comments: reports.filter((report) => report.area === "Comment")
    };
  }, [mySafetyReports]);

  const launchControl = useMemo(() => {
    const openChallenges = challenges.filter((challenge) => challenge.status !== "Completed");
    const completedChallenges = challenges.filter((challenge) => challenge.status === "Completed");
    const newFeedback = founderFeedback.filter((feedback) => feedback.status === "New");
    const activeFirstWave = firstWaveInterests.filter((interest) => interest.status === "Active tester");
    const invitedFirstWave = firstWaveInterests.filter((interest) => interest.status === "Invited");
    const contributionInterest = paymentInterests.filter((interest) => interest.intent_type === "Contribution");
    const googlePlayClosedTestTarget = 12;
    const googlePlayClosedTestReady = activeFirstWave.length >= googlePlayClosedTestTarget;

    const checklist = [
      {
        title: "Public domain is live",
        done: true,
        detail: "jointalent7.com is connected and ready to share."
      },
      {
        title: "Launch interest is collecting",
        done: firstWaveInterests.length > 0,
        detail: `${firstWaveInterests.length} first-wave launch signup${firstWaveInterests.length === 1 ? "" : "s"} saved.`
      },
      {
        title: "Google Play closed-test gate",
        done: googlePlayClosedTestReady,
        detail: `${activeFirstWave.length} / ${googlePlayClosedTestTarget} active first-wave accounts marked for the required 14-day closed test.`
      },
      {
        title: "Challenge rooms have activity",
        done: joins.length + votes.length + ratings.length + proofs.length > 0,
        detail: `${joins.length} joins, ${votes.length} votes, ${ratings.length} ratings, ${proofs.length} proofs.`
      },
      {
        title: "Safety queue is under control",
        done: adminModeration.openReports.length === 0,
        detail:
          adminModeration.openReports.length === 0
            ? "No open reports waiting."
            : `${adminModeration.openReports.length} open report${adminModeration.openReports.length === 1 ? "" : "s"} to review.`
      },
      {
        title: "Feedback has been reviewed",
        done: newFeedback.length === 0,
        detail:
          newFeedback.length === 0
            ? "No new feedback waiting."
            : `${newFeedback.length} new feedback item${newFeedback.length === 1 ? "" : "s"} waiting.`
      },
      {
        title: "Launch interest is visible",
        done: paymentInterests.length > 0 || firstWaveInterests.length > 0,
        detail: `${paymentInterests.length} payment signal${paymentInterests.length === 1 ? "" : "s"} and ${firstWaveInterests.length} first-wave signal${firstWaveInterests.length === 1 ? "" : "s"}.`
      }
    ];

    return {
      openChallenges,
      completedChallenges,
      newFeedback,
      activeFirstWave,
      invitedFirstWave,
      contributionInterest,
      googlePlayClosedTestTarget,
      googlePlayClosedTestReady,
      checklist,
      readinessPercent: Math.round((checklist.filter((item) => item.done).length / checklist.length) * 100)
    };
  }, [
    adminModeration.openReports.length,
    challenges,
    firstWaveInterests,
    founderFeedback,
    joins.length,
    paymentInterests,
    proofs.length,
    ratings.length,
    votes.length
  ]);

  const launchQaChecklist = useMemo(
    () => [
      {
        key: "signup-confirmation",
        title: "Signup and email confirmation",
        detail: "Create a test account, confirm email, then return to log in."
      },
      {
        key: "login-logout",
        title: "Login and logout",
        detail: "Log in, log out, and confirm the Account form returns to Log in."
      },
      {
        key: "first-wave",
        title: "First-wave launch form",
        detail: "Submit interest, region, role, availability, and confirm it appears for owner."
      },
      {
        key: "challenge-flow",
        title: "Challenge create and join",
        detail: "Create a room, join as challenger/audience, then confirm counts update."
      },
      {
        key: "votes-ratings-proof",
        title: "Vote, rate, and proof",
        detail: "Vote A/B, rate out of 7, upload/paste proof, and lock a winner."
      },
      {
        key: "reports-feedback",
        title: "Reports and feedback",
        detail: "Use the launch issue shortcut and check reports/feedback owner queues."
      },
      {
        key: "share-buttons",
        title: "Share buttons",
        detail: "Copy invite link, Play Store wave invite, founder support text, and launch captions."
      },
      {
        key: "play-store-gate",
        title: "Play Store closed-test gate",
        detail: "Confirm 12 opted-in first-wave accounts stay in the Google Play closed test for 14 continuous days."
      },
      {
        key: "mobile-view",
        title: "Mobile view",
        detail: "Open on phone width and check buttons, forms, and cards do not overlap."
      }
    ],
    []
  );

  const launchQaProgress = useMemo(() => {
    return launchQaChecklist.filter((item) => launchQaDoneKeys.includes(item.key)).length;
  }, [launchQaChecklist, launchQaDoneKeys]);

  const playStoreChecklist = useMemo(
    () => [
      {
        key: "app-access",
        title: "App access",
        detail: "Tell Google that Talent7 has login for posting, voting, profiles, challenges, teams, and owner tools."
      },
      {
        key: "ads",
        title: "Ads declaration",
        detail: "Choose No unless ads are added later."
      },
      {
        key: "content-rating",
        title: "Content rating",
        detail: "Complete the questionnaire for user-generated content, social features, and challenge activity."
      },
      {
        key: "target-audience",
        title: "Target audience",
        detail: "Use a teen/adult audience, not children, because Talent7 includes user content and competition."
      },
      {
        key: "data-safety",
        title: "Data safety",
        detail: "Declare account info, email, profile content, uploaded proof, activity, ratings, votes, and region/location text."
      },
      {
        key: "store-listing",
        title: "Store listing",
        detail: "Add app description, icon, screenshots, feature graphic, support email, and privacy policy link."
      },
      {
        key: "closed-testing-release",
        title: "Closed testing release",
        detail: "Upload the first Android build and publish it to the closed testing track."
      },
      {
        key: "twelve-testers",
        title: "12 opted-in accounts",
        detail: "Confirm 12 people have joined the closed test from Google Play and stayed opted in."
      },
      {
        key: "fourteen-days",
        title: "14-day run",
        detail: "Let the closed test run for 14 continuous days before applying for production access."
      }
    ],
    []
  );

  const playStoreProgress = useMemo(() => {
    return playStoreChecklist.filter((item) => playStoreDoneKeys.includes(item.key)).length;
  }, [playStoreChecklist, playStoreDoneKeys]);

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

  const myDashboard = useMemo(() => {
    if (!session?.user.id) {
      return {
        rooms: [] as Array<{ challenge: Challenge; label: string; detail: string }>,
        posts: [] as ShowcasePost[],
        reports: [] as SafetyReportItem[],
        pendingInvites: [] as ChallengeInvite[],
        teamCount: 0,
        pendingTeamRequests: 0
      };
    }

    const roomMap = new Map<string, { challenge: Challenge; label: string; detail: string }>();

    myActivity.created.forEach((challenge) => {
      roomMap.set(challenge.id, {
        challenge,
        label: "Created",
        detail: challenge.status === "Completed" ? `Completed: ${challenge.winner || "Winner declared"}` : "Open room"
      });
    });

    myActivity.joined.forEach((join) => {
      const challenge = challenges.find((item) => item.id === join.challenge_id);
      if (!challenge || roomMap.has(challenge.id)) return;

      roomMap.set(challenge.id, {
        challenge,
        label: join.role,
        detail: `${join.side} / ${challenge.status}`
      });
    });

    myActivity.completed.forEach((challenge) => {
      roomMap.set(challenge.id, {
        challenge,
        label: "Completed",
        detail: `${challenge.winner || "Winner"} won${challenge.final_score ? ` ${challenge.final_score}` : ""}`
      });
    });

    const reports = mySafetyReports.filter((report) => {
      if (report.source === "Challenge") {
        const reportId = report.reportId;
        return challengeReports.some((item) => item.id === reportId && item.reporter_id === session.user.id);
      }

      return showcaseReports.some((item) => item.id === report.reportId && item.reporter_id === session.user.id);
    });

    return {
      rooms: Array.from(roomMap.values())
        .sort((first, second) => new Date(second.challenge.created_at).getTime() - new Date(first.challenge.created_at).getTime())
        .slice(0, 6),
      posts: showcasePosts.filter((post) => post.user_id === session.user.id).slice(0, 4),
      reports: reports.slice(0, 4),
      pendingInvites: inviteInbox.received.filter((invite) => invite.status === "Pending").slice(0, 4),
      teamCount: myTeamDashboard.owned.length + myTeamDashboard.accepted.length,
      pendingTeamRequests: myTeamDashboard.pending.length + teamInbox.filter((request) => request.status === "Pending").length
    };
  }, [
    challengeReports,
    challenges,
    inviteInbox.received,
    myActivity,
    mySafetyReports,
    myTeamDashboard.accepted.length,
    myTeamDashboard.owned.length,
    myTeamDashboard.pending.length,
    session,
    showcasePosts,
    showcaseReports,
    teamInbox
  ]);

  const onboardingSteps = useMemo(() => {
    const userId = session?.user.id;
    const hasProfile = Boolean(profile?.display_name && profile?.username);
    const hasRoomAction = Boolean(
      userId &&
        (challenges.some((challenge) => challenge.created_by === userId) ||
          joins.some((join) => join.user_id === userId))
    );
    const hasVotedOrRated = Boolean(
      userId &&
        (votes.some((vote) => vote.user_id === userId) ||
          ratings.some((rating) => rating.user_id === userId) ||
          showcaseRatings.some((rating) => rating.user_id === userId))
    );
    const hasProofOrShowcase = Boolean(
      userId &&
        (proofs.some((proof) => proof.user_id === userId) ||
          showcasePosts.some((post) => post.user_id === userId))
    );
    const hasFollow = Boolean(userId && follows.some((follow) => follow.follower_id === userId));
    const hasFeedback = Boolean(userId && founderFeedback.some((feedback) => feedback.user_id === userId));

    return [
      {
        title: "Save profile",
        detail: "Add your name, username, role, interest, and region.",
        done: hasProfile,
        href: "#account"
      },
      {
        title: "Join or create one challenge",
        detail: "Start with a badminton, breakdance, gaming, or open challenge room.",
        done: hasRoomAction,
        href: hasRoomAction ? "#my-talent7" : "#rooms"
      },
      {
        title: "Vote or rate once",
        detail: "Help another room by voting for a winner or rating out of 7.",
        done: hasVotedOrRated,
        href: "#rooms"
      },
      {
        title: "Upload proof or showcase",
        detail: "Add victory proof or post a talent photo, video, or link.",
        done: hasProofOrShowcase,
        href: hasProofOrShowcase ? "#my-talent7" : "#showcase"
      },
      {
        title: "Follow one profile",
        detail: "Build your Talent7 circle by following another creator.",
        done: hasFollow,
        href: "#profiles"
      },
      {
        title: "Send founder feedback",
        detail: "Tell us what felt confusing, broken, or worth building next.",
        done: hasFeedback,
        href: "#feedback"
      }
    ];
  }, [challenges, follows, founderFeedback, joins, profile, proofs, ratings, session, showcasePosts, showcaseRatings, votes]);

  const completedOnboardingSteps = onboardingSteps.filter((step) => step.done).length;

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
    const myExpertProfileIds = new Set(
      expertProfiles.filter((expert) => expert.user_id === userId).map((expert) => expert.id)
    );

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

    const feedbackAlerts = founderFeedback
      .filter((feedback) => isOwnerReviewer || feedback.user_id === userId)
      .map((feedback) => ({
        id: `notification-feedback-${feedback.id}`,
        label: isOwnerReviewer && feedback.status === "New" ? "New feedback" : "Feedback status",
        category: "Feedback" as const,
        title: feedback.feedback_type,
        detail: isOwnerReviewer
          ? `${feedback.display_name}: ${feedback.message}`
          : `Your feedback is ${feedback.status.toLowerCase()}.`,
        createdAt: feedback.updated_at || feedback.created_at,
        href: "#feedback"
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

    const requesterAssignedAlerts = expertHelpRequests
      .filter((request) => request.requester_id === userId && request.status === "Assigned" && request.assigned_expert_name)
      .map((request) => ({
        id: `notification-expert-assigned-requester-${request.id}`,
        label: "Expert assigned",
        category: "Expert help" as const,
        title: request.help_type,
        detail: `${request.assigned_expert_name} was assigned to your help request.`,
        createdAt: request.updated_at || request.created_at,
        href: "#expert-help"
      }));

    const assignedExpertAlerts = expertHelpRequests
      .filter(
        (request) =>
          request.status === "Assigned" &&
          request.assigned_expert_id &&
          myExpertProfileIds.has(request.assigned_expert_id)
      )
      .map((request) => ({
        id: `notification-expert-assigned-helper-${request.id}`,
        label: "Assigned to you",
        category: "Expert help" as const,
        title: request.help_type,
        detail: `${request.requester_name} needs guidance: ${request.details}`,
        createdAt: request.updated_at || request.created_at,
        href: "#expert-help"
      }));

    const expertResponseAlerts = expertHelpRequests
      .filter((request) => request.requester_id === userId && Boolean(request.expert_response))
      .map((request) => ({
        id: `notification-expert-response-${request.id}`,
        label: "Expert responded",
        category: "Expert help" as const,
        title: request.help_type,
        detail: request.expert_response || "Your assigned expert added a response.",
        createdAt: request.expert_response_at || request.updated_at || request.created_at,
        href: "#expert-help"
      }));

    const expertSessionProposalAlerts = expertHelpRequests
      .filter(
        (request) =>
          request.session_status === "Proposed" &&
          request.proposed_session_at &&
          request.session_updated_by !== userId &&
          (request.requester_id === userId ||
            Boolean(request.assigned_expert_id && myExpertProfileIds.has(request.assigned_expert_id)))
      )
      .map((request) => ({
        id: `notification-expert-session-proposed-${request.id}`,
        label: "Session proposed",
        category: "Expert help" as const,
        title: request.help_type,
        detail: `Proposed time: ${formatSessionTime(request.proposed_session_at)}.`,
        createdAt: request.updated_at || request.proposed_session_at || request.created_at,
        href: "#expert-help"
      }));

    const expertSessionConfirmedAlerts = expertHelpRequests
      .filter(
        (request) =>
          request.session_status === "Confirmed" &&
          request.confirmed_session_at &&
          (request.requester_id === userId ||
            Boolean(request.assigned_expert_id && myExpertProfileIds.has(request.assigned_expert_id)))
      )
      .map((request) => ({
        id: `notification-expert-session-confirmed-${request.id}`,
        label: "Session confirmed",
        category: "Expert help" as const,
        title: request.help_type,
        detail: `Confirmed for ${formatSessionTime(request.confirmed_session_at)}.`,
        createdAt: request.updated_at || request.confirmed_session_at || request.created_at,
        href: "#expert-help"
      }));

    const expertSessionLinkAlerts = expertHelpRequests
      .filter(
        (request) =>
          Boolean(request.session_link) &&
          request.session_link_added_by !== userId &&
          (request.requester_id === userId ||
            Boolean(request.assigned_expert_id && myExpertProfileIds.has(request.assigned_expert_id)))
      )
      .map((request) => ({
        id: `notification-expert-session-link-${request.id}`,
        label: "Session link added",
        category: "Expert help" as const,
        title: request.help_type,
        detail: "Your confirmed expert session has a meeting link.",
        createdAt: request.session_link_added_at || request.updated_at || request.created_at,
        href: "#expert-help"
      }));

    const expertSessionCompletedAlerts = expertHelpRequests
      .filter(
        (request) =>
          Boolean(request.session_completed_at) &&
          request.assigned_expert_id &&
          myExpertProfileIds.has(request.assigned_expert_id)
      )
      .map((request) => ({
        id: `notification-expert-session-completed-${request.id}`,
        label: "Session completed",
        category: "Expert help" as const,
        title: request.help_type,
        detail: request.expert_rating
          ? `Requester rated your help ${request.expert_rating}/7.`
          : "Requester marked the expert session completed.",
        createdAt: request.session_completed_at || request.updated_at || request.created_at,
        href: "#expert-help"
      }));

    return [
      ...receivedInviteAlerts,
      ...sentInviteAlerts,
      ...teamOwnerAlerts,
      ...teamMemberAlerts,
      ...proofAlerts,
      ...completedAlerts,
      ...reportAlerts,
      ...feedbackAlerts,
      ...commentAlerts,
      ...requesterAssignedAlerts,
      ...assignedExpertAlerts,
      ...expertResponseAlerts,
      ...expertSessionProposalAlerts,
      ...expertSessionConfirmedAlerts,
      ...expertSessionLinkAlerts,
      ...expertSessionCompletedAlerts
    ]
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
      .slice(0, 12);
  }, [
    challenges,
    expertHelpRequests,
    expertProfiles,
    founderFeedback,
    inviteInbox,
    isOwnerReviewer,
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
  const launchQaStorageKey = session?.user.id ? `talent7-launch-qa-${session.user.id}` : "";
  const playStoreStorageKey = session?.user.id ? `talent7-play-store-launch-${session.user.id}` : "";

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

  function canDeleteUserContent(userId?: string | null) {
    return Boolean(session?.user.id && (isOwnerReviewer || userId === session.user.id));
  }

  function canEditChallenge(challenge: Challenge) {
    return Boolean(session?.user.id && (isOwnerReviewer || challenge.created_by === session.user.id));
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

  function validateUploadFile(file: File) {
    const isImage = imageMimeTypes.includes(file.type);
    const isVideo = videoMimeTypes.includes(file.type);

    if (!isImage && !isVideo) {
      return "Please upload JPG, PNG, WebP, MP4, or MOV files only.";
    }

    if (isImage && file.size > maxPhotoUploadBytes) {
      return "Photos and screenshots must be 10 MB or smaller.";
    }

    if (isVideo && file.size > maxVideoUploadBytes) {
      return "Videos must be 50 MB or smaller. Short 30-60 second clips work best.";
    }

    return "";
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

  function canUseRoomChat(challenge: Challenge) {
    if (!session?.user.id) return false;
    if (challenge.created_by === session.user.id) return true;
    return joins.some((join) => join.challenge_id === challenge.id && join.user_id === session.user.id);
  }

  function roomChatHint(challenge: Challenge) {
    if (!session) return "Log in to read and send room messages.";
    if (!canUseRoomChat(challenge)) return "Join this challenge first to send room messages.";
    if (isChallengeCompleted(challenge)) return "This room is completed, so chat is read-only.";
    return "Use room chat for coordination. Avoid sharing phone numbers or sensitive personal details.";
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
    const updateBackToTop = () => setShowBackToTop(window.scrollY > 700);

    updateBackToTop();
    window.addEventListener("scroll", updateBackToTop);

    return () => window.removeEventListener("scroll", updateBackToTop);
  }, []);

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
    if (!launchQaStorageKey) {
      setLaunchQaDoneKeys([]);
      return;
    }

    try {
      const saved = window.localStorage.getItem(launchQaStorageKey);
      setLaunchQaDoneKeys(saved ? (JSON.parse(saved) as string[]) : []);
    } catch {
      setLaunchQaDoneKeys([]);
    }
  }, [launchQaStorageKey]);

  useEffect(() => {
    if (!launchQaStorageKey) return;
    window.localStorage.setItem(launchQaStorageKey, JSON.stringify(launchQaDoneKeys));
  }, [launchQaDoneKeys, launchQaStorageKey]);

  useEffect(() => {
    if (!playStoreStorageKey) {
      setPlayStoreDoneKeys([]);
      return;
    }

    try {
      const saved = window.localStorage.getItem(playStoreStorageKey);
      setPlayStoreDoneKeys(saved ? (JSON.parse(saved) as string[]) : []);
    } catch {
      setPlayStoreDoneKeys([]);
    }
  }, [playStoreStorageKey]);

  useEffect(() => {
    if (!playStoreStorageKey) return;
    window.localStorage.setItem(playStoreStorageKey, JSON.stringify(playStoreDoneKeys));
  }, [playStoreDoneKeys, playStoreStorageKey]);

  useEffect(() => {
    if (publicProfiles.length === 0) return;

    const openProfileFromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash.startsWith("profile-")) return;

      const match = publicProfiles.find((item) => profileHash(item.username) === hash);
      if (!match) return;

      setSelectedProfile(match);
      setTimeout(() => document.getElementById("profile-detail")?.scrollIntoView({ behavior: "smooth" }), 80);
    };

    openProfileFromHash();
    window.addEventListener("hashchange", openProfileFromHash);
    return () => window.removeEventListener("hashchange", openProfileFromHash);
  }, [publicProfiles]);

  useEffect(() => {
    if (challenges.length === 0) return;

    const openRoomFromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash.startsWith("room-")) return;

      const match = challenges.find((challenge) => roomHash(challenge.id) === hash);
      if (!match) return;

      setSelectedLane("All");
      setSelectedStatus("All");
      setRoomSearch("");
      setHighlightedChallengeId(match.id);
      setTimeout(() => document.getElementById(roomHash(match.id))?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      window.setTimeout(() => setHighlightedChallengeId(null), 2600);
    };

    openRoomFromHash();
    window.addEventListener("hashchange", openRoomFromHash);
    return () => window.removeEventListener("hashchange", openRoomFromHash);
  }, [challenges]);

  useEffect(() => {
    if (teams.length === 0) return;

    const openTeamFromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash.startsWith("team-")) return;

      const match = teams.find((team) => teamHash(team.id) === hash);
      if (!match) return;

      setHighlightedTeamId(match.id);
      setTimeout(() => document.getElementById(teamHash(match.id))?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      window.setTimeout(() => setHighlightedTeamId(null), 2600);
    };

    openTeamFromHash();
    window.addEventListener("hashchange", openTeamFromHash);
    return () => window.removeEventListener("hashchange", openTeamFromHash);
  }, [teams]);

  useEffect(() => {
    if (showcasePosts.length === 0) return;

    const openShowcaseFromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash.startsWith("showcase-")) return;

      const match = showcasePosts.find((post) => showcaseHash(post.id) === hash);
      if (!match) return;

      setHighlightedShowcasePostId(match.id);
      setTimeout(() => document.getElementById(showcaseHash(match.id))?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      window.setTimeout(() => setHighlightedShowcasePostId(null), 2600);
    };

    openShowcaseFromHash();
    window.addEventListener("hashchange", openShowcaseFromHash);
    return () => window.removeEventListener("hashchange", openShowcaseFromHash);
  }, [showcasePosts]);

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
    async function loadChallengeMessages() {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("challenge_messages")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return;
      if (data) setChallengeMessages(data as ChallengeMessage[]);
    }

    loadChallengeMessages();
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
    async function loadPaymentInterests() {
      if (!supabase || !session?.user.id) {
        setPaymentInterests([]);
        return;
      }

      let query = supabase
        .from("payment_interests")
        .select("*")
        .order("created_at", { ascending: false });

      if (!isOwnerReviewer) {
        query = query.eq("user_id", session.user.id);
      }

      const { data, error } = await query;

      if (error) return;
      if (data) setPaymentInterests(data as PaymentInterest[]);
    }

    loadPaymentInterests();
  }, [isOwnerReviewer, session]);

  useEffect(() => {
    async function loadFounderFeedback() {
      if (!supabase || !session?.user.id) {
        setFounderFeedback([]);
        return;
      }

      let query = supabase
        .from("founder_feedback")
        .select("*")
        .order("created_at", { ascending: false });

      if (!isOwnerReviewer) {
        query = query.eq("user_id", session.user.id);
      }

      const { data, error } = await query;

      if (error) return;
      if (data) setFounderFeedback(data as FounderFeedback[]);
    }

    loadFounderFeedback();
  }, [isOwnerReviewer, session]);

  useEffect(() => {
    async function loadFirstWaveInterests() {
      if (!supabase || !session?.user.id) {
        setFirstWaveInterests([]);
        return;
      }

      let query = supabase
        .from("first_wave_interests")
        .select("*")
        .order("created_at", { ascending: false });

      if (!isOwnerReviewer) {
        query = query.eq("user_id", session.user.id);
      }

      const { data, error } = await query;

      if (error) return;
      if (data) setFirstWaveInterests(data as FirstWaveInterest[]);
    }

    loadFirstWaveInterests();
  }, [isOwnerReviewer, session]);

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

  useEffect(() => {
    async function loadExpertHelpRequests() {
      if (!supabase || !session?.user.id) {
        setExpertHelpRequests([]);
        return;
      }

      const requestQuery = supabase
        .from("expert_help_requests")
        .select("*")
        .order("created_at", { ascending: false });

      const { data, error } = await requestQuery;

      if (error) return;
      if (data) setExpertHelpRequests(data as ExpertHelpRequest[]);
    }

    loadExpertHelpRequests();
  }, [isOwnerReviewer, session]);

  useEffect(() => {
    async function loadExpertProfiles() {
      if (!supabase) {
        setExpertProfiles([]);
        return;
      }

      const { data, error } = await supabase
        .from("expert_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return;
      if (data) setExpertProfiles(data as ExpertProfile[]);
    }

    loadExpertProfiles();
  }, [isOwnerReviewer, session]);

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
      setAuthMode("Log in");
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
    setAuthMode("Log in");
    setMessage("Logged out.");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session) {
      setMessage("Log in before changing your password.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("new_password") || "");

    if (newPassword.length < 6) {
      setMessage("Enter a new password with at least 6 characters.");
      return;
    }

    setUpdatingPassword(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setMessage(error.message);
    } else {
      event.currentTarget.reset();
      setShowNewPassword(false);
      setMessage("Password updated.");
    }

    setUpdatingPassword(false);
  }

  async function copyLaunchUpdate() {
    await copyShareText("Launch update", launchUpdateText());
  }

  function siteUrl(path = "") {
    const base =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://www.jointalent7.com";

    return `${base}${path}`;
  }

  function launchUpdateText() {
    return [
      "Talent7 is preparing for Play Store launch at jointalent7.com.",
      `Current build: ${challenges.length} challenge rooms, ${publicProfiles.length} talent profiles, ${proofs.length} proof uploads, and ${firstWaveInterests.length} first-wave launch signups.`,
      "You can join as a challenger, audience voter, coach, organizer, gaming squad, or expert helper.",
      "Try a challenge room, rate out of 7, upload proof, and help shape the launch version."
    ].join("\n\n");
  }

  async function copyShareText(label: string, text: string) {
    if (!navigator?.clipboard) {
      setMessage("Copy is not available in this browser. You can manually select the text.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label} copied.`);
    } catch {
      setMessage("Copy failed. You can manually select and copy the text.");
    }
  }

  function switchMobileTab(tabId: MobileTabId) {
    const tab = mobileTabs.find((item) => item.id === tabId);
    setActiveMobileTab(tabId);
    window.setTimeout(() => {
      document.getElementById(tab?.firstSection || "rooms")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  function startFounderFeedback(type: FounderFeedback["feedback_type"]) {
    setFeedbackDraftType(type);
    setMessage(`${type} selected. Add details in Founder Feedback.`);
    setTimeout(() => document.getElementById("feedback")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  function toggleLaunchQaItem(key: string) {
    setLaunchQaDoneKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  function togglePlayStoreItem(key: string) {
    setPlayStoreDoneKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
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

  function makeLocalListenId(prefix = "listen") {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isPublicSongLink(value: string) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }

  function updateListenRoomDraft<K extends keyof ListenRoomDraft>(key: K, value: ListenRoomDraft[K]) {
    setListenRoomDraft((current) => ({ ...current, [key]: value }));
  }

  function updateListenTrackDraft(roomId: string, key: keyof ListenTrackDraft, value: string) {
    setListenTrackDrafts((current) => ({
      ...current,
      [roomId]: {
        track_title: current[roomId]?.track_title || "",
        track_url: current[roomId]?.track_url || "",
        added_by: current[roomId]?.added_by || profileName(),
        [key]: value
      }
    }));
  }

  function handleCreateListenRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireProfile("create a listen room")) return;

    const trackUrl = listenRoomDraft.current_track_url.trim();
    if (trackUrl && !isPublicSongLink(trackUrl)) {
      setMessage("Please use a public song link that starts with http or https.");
      return;
    }

    const room: ListenRoom = {
      id: makeLocalListenId("listen-room"),
      title: listenRoomDraft.title.trim() || "Untitled listen room",
      host_name: listenRoomDraft.host_name.trim() || profileName(),
      mood: listenRoomDraft.mood,
      room_note: listenRoomDraft.room_note.trim() || null,
      current_track_title: listenRoomDraft.current_track_title.trim() || "Open the first shared song",
      current_track_url: trackUrl || "https://www.youtube.com",
      listener_count: 1,
      love_count: 0,
      vibe_count: 0,
      created_by: session?.user.id || null,
      created_at: new Date().toISOString()
    };

    setListenRooms((current) => [room, ...current]);
    setListenRoomDraft({ ...defaultListenDraft, host_name: profileName() });
    setMessage("Listen room created.");
    setTimeout(() => document.getElementById("listen-rooms")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  function handleJoinListenRoom(roomId: string) {
    if (!requireProfile("join a listen room")) return;
    setListenRooms((current) =>
      current.map((room) => (room.id === roomId ? { ...room, listener_count: room.listener_count + 1 } : room))
    );
    setMessage("Joined listen room.");
  }

  function handleReactListenRoom(roomId: string, reaction: "love" | "vibe") {
    setListenRooms((current) =>
      current.map((room) =>
        room.id === roomId
          ? {
              ...room,
              love_count: reaction === "love" ? room.love_count + 1 : room.love_count,
              vibe_count: reaction === "vibe" ? room.vibe_count + 1 : room.vibe_count
            }
          : room
      )
    );
  }

  function handleAddListenTrack(event: FormEvent<HTMLFormElement>, roomId: string) {
    event.preventDefault();
    if (!requireProfile("add a song")) return;

    const draft = listenTrackDrafts[roomId] || { track_title: "", track_url: "", added_by: profileName() };
    const trackUrl = draft.track_url.trim();
    if (!trackUrl || !isPublicSongLink(trackUrl)) {
      setMessage("Please paste a public YouTube, Spotify, or song link.");
      return;
    }

    const track: ListenTrack = {
      id: makeLocalListenId("listen-track"),
      room_id: roomId,
      track_title: draft.track_title.trim() || "Shared song",
      track_url: trackUrl,
      added_by: draft.added_by.trim() || profileName(),
      created_at: new Date().toISOString()
    };

    setListenTracks((current) => [track, ...current]);
    setListenRooms((current) =>
      current.map((room) =>
        room.id === roomId
          ? {
              ...room,
              current_track_title: track.track_title,
              current_track_url: track.track_url
            }
          : room
      )
    );
    setListenTrackDrafts((current) => ({
      ...current,
      [roomId]: { track_title: "", track_url: "", added_by: profileName() }
    }));
    setMessage("Song added to the listen room.");
  }
  async function recordPaymentInterest(
    intentType: PaymentInterest["intent_type"],
    label: string,
    amountLabel: string
  ) {
    if (!requireLogin("select a plan or contribution range")) return;
    if (!requireProfile("select a plan or contribution range")) return;

    const actionKey = `${intentType}-${label}-${amountLabel}`;
    const interest = {
      user_id: session?.user.id || "",
      display_name: profileName(),
      intent_type: intentType,
      label,
      amount_label: amountLabel,
      status: "Interested" as const
    };

    setPaymentActionKey(actionKey);
    setMessage("");

    if (!supabase) {
      setPaymentInterests((items) => [
        {
          ...interest,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString()
        },
        ...items
      ]);
      setMessage(`Demo mode: saved ${label} interest.`);
      setPaymentActionKey(null);
      return;
    }

    const { data, error } = await supabase
      .from("payment_interests")
      .insert(interest)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not save payment interest: ${error.message}`);
    } else if (data) {
      setPaymentInterests((items) => [data as PaymentInterest, ...items]);
      setMessage(`${label} saved. Real payment checkout will be added later.`);
    }

    setPaymentActionKey(null);
  }

  async function updatePaymentInterestStatus(interest: PaymentInterest, status: PaymentInterest["status"]) {
    if (!requireLogin("update payment interests")) return;

    if (!isOwnerReviewer) {
      setMessage("Only the Talent7 owner account can update payment interests.");
      return;
    }

    if (!supabase) return;

    const actionKey = `status-${interest.id}-${status}`;
    setPaymentActionKey(actionKey);
    setMessage("");

    const { data, error } = await supabase
      .from("payment_interests")
      .update({ status })
      .eq("id", interest.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update payment interest: ${error.message}`);
    } else if (data) {
      setPaymentInterests((items) =>
        items.map((item) => (item.id === interest.id ? (data as PaymentInterest) : item))
      );
      setMessage(`${interest.display_name}'s ${interest.label} interest marked ${status.toLowerCase()}.`);
    }

    setPaymentActionKey(null);
  }

  async function submitFirstWaveInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireLogin("join the first wave")) return;
    if (!requireProfile("join the first wave")) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const mainInterest = String(form.get("main_interest") || "").trim();
    const region = String(form.get("region") || "").trim();
    const roleGoal = String(form.get("role_goal") || "Challenger") as FirstWaveInterest["role_goal"];
    const availability = String(form.get("availability") || "Ready now") as FirstWaveInterest["availability"];
    const notes = String(form.get("notes") || "").trim();

    if (!mainInterest || !region) {
      setMessage("Add your main interest and region before joining the first wave.");
      return;
    }

    const interest = {
      user_id: session?.user.id || "",
      display_name: profileName(),
      main_interest: mainInterest,
      region,
      role_goal: roleGoal,
      availability,
      notes: notes || null,
      status: "New" as const
    };

    setSavingFirstWave(true);
    setMessage("");

    if (!supabase) {
      setFirstWaveInterests((items) => [
        {
          ...interest,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString()
        },
        ...items.filter((item) => item.user_id !== interest.user_id)
      ]);
      setMessage("Demo mode: first-wave interest saved on this page.");
      setSavingFirstWave(false);
      return;
    }

    const { data, error } = await supabase
      .from("first_wave_interests")
      .upsert(interest, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not save first-wave interest: ${error.message}`);
    } else if (data) {
      setFirstWaveInterests((items) => [
        data as FirstWaveInterest,
        ...items.filter((item) => item.id !== (data as FirstWaveInterest).id)
      ]);
      setMessage("You are on the Talent7 first-wave list.");
      formElement.reset();
    }

    setSavingFirstWave(false);
  }

  async function updateFirstWaveStatus(interest: FirstWaveInterest, status: FirstWaveInterest["status"]) {
    if (!requireLogin("update first-wave launch signups")) return;

    if (!isOwnerReviewer) {
      setMessage("Only the Talent7 owner account can update first-wave launch signups.");
      return;
    }

    if (!supabase) return;

    const actionKey = `${interest.id}-${status}`;
    setFirstWaveActionKey(actionKey);
    setMessage("");

    const { data, error } = await supabase
      .from("first_wave_interests")
      .update({ status })
      .eq("id", interest.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update first-wave signup: ${error.message}`);
    } else if (data) {
      setFirstWaveInterests((items) =>
        items.map((item) => (item.id === interest.id ? (data as FirstWaveInterest) : item))
      );
      setMessage(`${interest.display_name} marked ${status.toLowerCase()}.`);
    }

    setFirstWaveActionKey(null);
  }

  async function submitFounderFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireLogin("send founder feedback")) return;
    if (!requireProfile("send founder feedback")) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const feedbackType = String(form.get("feedback_type") || "General") as FounderFeedback["feedback_type"];
    const area = String(form.get("area") || "").trim();
    const messageText = String(form.get("message") || "").trim();

    if (!messageText) {
      setMessage("Add your feedback message before sending.");
      return;
    }

    const feedback = {
      user_id: session?.user.id || "",
      display_name: profileName(),
      feedback_type: feedbackType,
      area: area || null,
      message: messageText,
      status: "New" as const
    };

    setSavingFeedback(true);
    setMessage("");

    if (!supabase) {
      setFounderFeedback((items) => [
        {
          ...feedback,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString()
        },
        ...items
      ]);
      setMessage("Demo mode: feedback saved on this page.");
      formElement.reset();
      setFeedbackDraftType("General");
      setSavingFeedback(false);
      return;
    }

    const { data, error } = await supabase
      .from("founder_feedback")
      .insert(feedback)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not send feedback: ${error.message}`);
    } else if (data) {
      setFounderFeedback((items) => [data as FounderFeedback, ...items]);
      setMessage("Feedback sent. Thank you for helping improve Talent7.");
      formElement.reset();
      setFeedbackDraftType("General");
    }

    setSavingFeedback(false);
  }

  async function updateFounderFeedbackStatus(feedback: FounderFeedback, status: FounderFeedback["status"]) {
    if (!requireLogin("update founder feedback")) return;

    if (!isOwnerReviewer) {
      setMessage("Only the Talent7 owner account can update feedback.");
      return;
    }

    if (!supabase) return;

    const actionKey = `${feedback.id}-${status}`;
    setFeedbackActionKey(actionKey);
    setMessage("");

    const { data, error } = await supabase
      .from("founder_feedback")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", feedback.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update feedback: ${error.message}`);
    } else if (data) {
      setFounderFeedback((items) =>
        items.map((item) => (item.id === feedback.id ? (data as FounderFeedback) : item))
      );
      setMessage(`Feedback marked ${status.toLowerCase()}.`);
    }

    setFeedbackActionKey(null);
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

  function matchingExpertsFor(request: ExpertHelpRequest) {
    return visibleExpertProfiles.filter(
      (expert) =>
        expert.verification_status === "Verified" &&
        expert.expertise_area === request.help_type &&
        expert.user_id !== request.requester_id
    );
  }

  function canRespondToExpertRequest(request: ExpertHelpRequest) {
    return Boolean(
      session?.user.id &&
        request.assigned_expert_id &&
        expertProfiles.some(
          (expert) => expert.id === request.assigned_expert_id && expert.user_id === session.user.id
        )
    );
  }

  function canScheduleExpertRequest(request: ExpertHelpRequest) {
    return Boolean(
      session?.user.id &&
        request.status !== "Closed" &&
        request.assigned_expert_id &&
        (request.requester_id === session.user.id || canRespondToExpertRequest(request) || isOwnerReviewer)
    );
  }

  function formatSessionTime(value?: string | null) {
    if (!value) return "Not scheduled";
    return new Date(value).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function canManageSessionLink(request: ExpertHelpRequest) {
    return canScheduleExpertRequest(request) && request.session_status === "Confirmed";
  }

  function canCompleteExpertSession(request: ExpertHelpRequest) {
    return Boolean(
      session?.user.id &&
        request.requester_id === session.user.id &&
        request.session_status === "Confirmed" &&
        request.session_link &&
        !request.session_completed_at
    );
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

  async function updateChallengeDetails(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    if (!requireLogin("edit a challenge")) return;

    if (!canEditChallenge(challenge)) {
      setMessage("Only the challenge creator or Talent7 owner can edit this room.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const update = {
      title: String(form.get("title") || challenge.title).trim() || challenge.title,
      lane: String(form.get("lane") || challenge.lane) as ChallengeLane,
      team_a: String(form.get("team_a") || challenge.team_a).trim() || challenge.team_a,
      team_b: String(form.get("team_b") || challenge.team_b).trim() || challenge.team_b,
      rules: String(form.get("rules") || challenge.rules).trim() || challenge.rules,
      venue_name: String(form.get("venue_name") || "").trim() || null,
      booking_url: String(form.get("booking_url") || "").trim() || null,
      sport_type: String(form.get("sport_type") || "").trim() || null,
      booking_region: String(form.get("booking_region") || "").trim() || null
    };

    setEditingChallengeId(challenge.id);
    setMessage("");

    if (!supabase || challenge.id.startsWith("sample-")) {
      setChallenges((items) => items.map((item) => (item.id === challenge.id ? { ...item, ...update } : item)));
      setMessage("Challenge details updated in this preview.");
      setEditingChallengeId(null);
      return;
    }

    const { data, error } = await supabase
      .from("challenges")
      .update(update)
      .eq("id", challenge.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update challenge: ${error.message}`);
    } else if (data) {
      setChallenges((items) => items.map((item) => (item.id === challenge.id ? (data as Challenge) : item)));
      setMessage("Challenge details updated.");
    }

    setEditingChallengeId(null);
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
    window.history.replaceState(null, "", `#${profileHash(item.username)}`);
    setMessage(`Opened ${item.display_name}'s Talent7 profile.`);
    setTimeout(() => document.getElementById("profile-detail")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  async function copyProfileLink(item: TalentProfile) {
    const link = `${window.location.origin}${window.location.pathname}#${profileHash(item.username)}`;

    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setMessage(`Profile link copied for ${item.display_name}.`);
  }

  async function copyRoomLink(challenge: Challenge) {
    const link = `${window.location.origin}${window.location.pathname}#${roomHash(challenge.id)}`;

    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setHighlightedChallengeId(challenge.id);
    setMessage(`Room link copied for ${challenge.title}.`);
    window.setTimeout(() => setHighlightedChallengeId(null), 2600);
  }

  async function copyTeamLink(team: TalentTeam) {
    const link = `${window.location.origin}${window.location.pathname}#${teamHash(team.id)}`;

    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setHighlightedTeamId(team.id);
    setMessage(`Team link copied for ${team.name}.`);
    window.setTimeout(() => setHighlightedTeamId(null), 2600);
  }

  async function copyShowcaseLink(post: ShowcasePost) {
    const link = `${window.location.origin}${window.location.pathname}#${showcaseHash(post.id)}`;

    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setHighlightedShowcasePostId(post.id);
    setMessage("Showcase post link copied.");
    window.setTimeout(() => setHighlightedShowcasePostId(null), 2600);
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

    if (mediaFile) {
      const uploadError = validateUploadFile(mediaFile);
      if (uploadError) {
        setMessage(uploadError);
        return;
      }
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

  async function deleteShowcasePost(post: ShowcasePost) {
    if (!requireLogin("delete a showcase post")) return;

    if (!canDeleteUserContent(post.user_id)) {
      setMessage("Only the post owner or Talent7 owner can delete this showcase post.");
      return;
    }

    const confirmed = window.confirm("Delete this showcase post from Talent7?");
    if (!confirmed) return;

    setDeletingShowcasePostId(post.id);
    setMessage("");

    if (!supabase) {
      setShowcasePosts((items) => items.filter((item) => item.id !== post.id));
      setShowcaseRatings((items) => items.filter((item) => item.post_id !== post.id));
      setShowcaseComments((items) => items.filter((item) => item.post_id !== post.id));
      setShowcaseReports((items) => items.filter((item) => item.post_id !== post.id));
      setMessage("Showcase post deleted from this preview.");
      setDeletingShowcasePostId(null);
      return;
    }

    const { error } = await supabase.from("showcase_posts").delete().eq("id", post.id);

    if (error) {
      setMessage(`Could not delete showcase post: ${error.message}`);
    } else {
      setShowcasePosts((items) => items.filter((item) => item.id !== post.id));
      setShowcaseRatings((items) => items.filter((item) => item.post_id !== post.id));
      setShowcaseComments((items) => items.filter((item) => item.post_id !== post.id));
      setShowcaseReports((items) => items.filter((item) => item.post_id !== post.id));
      setMessage("Showcase post deleted.");
    }

    setDeletingShowcasePostId(null);
  }

  async function updateShowcasePost(event: FormEvent<HTMLFormElement>, post: ShowcasePost) {
    event.preventDefault();
    if (!requireLogin("edit a showcase post")) return;

    if (!canDeleteUserContent(post.user_id)) {
      setMessage("Only the post owner or Talent7 owner can edit this showcase post.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const update = {
      caption: String(form.get("caption") || post.caption).trim() || post.caption,
      category: String(form.get("category") || post.category).trim() || post.category,
      media_url: String(form.get("media_url") || post.media_url).trim() || post.media_url,
      media_type: String(form.get("media_type") || post.media_type) as ShowcasePost["media_type"]
    };

    setEditingShowcasePostId(post.id);
    setMessage("");

    if (!supabase) {
      setShowcasePosts((items) => items.map((item) => (item.id === post.id ? { ...item, ...update } : item)));
      setMessage("Showcase post updated in this preview.");
      setEditingShowcasePostId(null);
      return;
    }

    const { data, error } = await supabase
      .from("showcase_posts")
      .update(update)
      .eq("id", post.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update showcase post: ${error.message}`);
    } else if (data) {
      setShowcasePosts((items) => items.map((item) => (item.id === post.id ? (data as ShowcasePost) : item)));
      setMessage("Showcase post updated.");
    }

    setEditingShowcasePostId(null);
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

    if (proofFile) {
      const uploadError = validateUploadFile(proofFile);
      if (uploadError) {
        setMessage(uploadError);
        return;
      }
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

  async function deleteProof(proof: ChallengeProof) {
    if (!requireLogin("delete proof")) return;

    if (!canDeleteUserContent(proof.user_id)) {
      setMessage("Only the proof uploader or Talent7 owner can delete this proof.");
      return;
    }

    const confirmed = window.confirm("Delete this proof from the challenge room?");
    if (!confirmed) return;

    setDeletingProofId(proof.id);
    setMessage("");

    if (!supabase) {
      setProofs((items) => items.filter((item) => item.id !== proof.id));
      setChallengeReports((items) => items.filter((item) => item.proof_id !== proof.id));
      setMessage("Proof deleted from this preview.");
      setDeletingProofId(null);
      return;
    }

    const { error } = await supabase.from("proofs").delete().eq("id", proof.id);

    if (error) {
      setMessage(`Could not delete proof: ${error.message}`);
    } else {
      setProofs((items) => items.filter((item) => item.id !== proof.id));
      setChallengeReports((items) => items.filter((item) => item.proof_id !== proof.id));
      setMessage("Proof deleted.");
    }

    setDeletingProofId(null);
  }

  async function updateProofNote(event: FormEvent<HTMLFormElement>, proof: ChallengeProof) {
    event.preventDefault();
    if (!requireLogin("edit proof")) return;

    if (!canDeleteUserContent(proof.user_id)) {
      setMessage("Only the proof uploader or Talent7 owner can edit this proof.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const update = {
      proof_type: String(form.get("proof_type") || proof.proof_type || "Video"),
      proof_url: String(form.get("proof_url") || proof.proof_url).trim() || proof.proof_url,
      notes: String(form.get("notes") || "").trim() || null
    };

    setEditingProofId(proof.id);
    setMessage("");

    if (!supabase) {
      setProofs((items) => items.map((item) => (item.id === proof.id ? { ...item, ...update } : item)));
      setMessage("Proof updated in this preview.");
      setEditingProofId(null);
      return;
    }

    const { data, error } = await supabase
      .from("proofs")
      .update(update)
      .eq("id", proof.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update proof: ${error.message}`);
    } else if (data) {
      setProofs((items) => items.map((item) => (item.id === proof.id ? (data as ChallengeProof) : item)));
      setMessage("Proof updated.");
    }

    setEditingProofId(null);
  }

  async function sendChallengeMessage(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    if (!requireLogin("send a room message")) return;
    if (!requireProfile("send a room message")) return;

    if (!canUseRoomChat(challenge)) {
      setMessage("Join this challenge first before sending room messages.");
      return;
    }

    if (isChallengeCompleted(challenge)) {
      setMessage("This challenge is completed, so room chat is read-only.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get("body") || "").trim();

    if (body.length < 2) {
      setMessage("Write a short message first.");
      return;
    }

    const chatMessage = {
      challenge_id: challenge.id,
      user_id: session?.user.id,
      author_name: profileName(),
      body: body.slice(0, 280)
    };

    setSendingChatChallengeId(challenge.id);
    setMessage("");

    if (!supabase || challenge.id.startsWith("sample-")) {
      setChallengeMessages((items) => [
        {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...chatMessage
        },
        ...items
      ]);
      formElement.reset();
      setSendingChatChallengeId(null);
      return;
    }

    const { data, error } = await supabase
      .from("challenge_messages")
      .insert(chatMessage)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not send message: ${error.message}`);
    } else if (data) {
      setChallengeMessages((items) => [data as ChallengeMessage, ...items]);
      formElement.reset();
    }

    setSendingChatChallengeId(null);
  }

  async function reportChallengeMessage(chatMessage: ChallengeMessage, challenge: Challenge) {
    if (!requireLogin("report a message")) return;

    setReportingChatMessageId(chatMessage.id);
    setMessage("");

    const report = {
      challenge_id: challenge.id,
      proof_id: null,
      reporter_id: session?.user.id,
      target_type: "Challenge",
      reason: "Other" as ReportReason,
      notes: `Reported chat message from ${chatMessage.author_name}: ${chatMessage.body}`,
      status: "Open"
    };

    if (!supabase || challenge.id.startsWith("sample-")) {
      setMessage("Message report saved for this preview.");
      setReportingChatMessageId(null);
      return;
    }

    const { data, error } = await supabase
      .from("reports")
      .insert(report)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not report message: ${error.message}`);
    } else if (data) {
      setChallengeReports((items) => [data as ChallengeReport, ...items]);
      setMessage("Message reported. Thank you for helping keep Talent7 safe.");
    }

    setReportingChatMessageId(null);
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

  async function submitExpertHelpRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireLogin("request expert help")) return;
    if (!requireProfile("request expert help")) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const location = String(form.get("location") || "").trim();
    const details = String(form.get("details") || "").trim();
    const urgency = String(form.get("urgency") || "Need guidance soon").trim() as ExpertHelpRequest["urgency"];

    if (!details) {
      setMessage("Add a short description of what help is needed.");
      return;
    }

    const request = {
      requester_id: session?.user.id || "",
      requester_name: profileName(),
      help_type: selectedHelpType,
      urgency,
      location: location || null,
      details,
      status: "Open" as const
    };

    setSavingExpertHelp(true);
    setMessage("");

    if (!supabase) {
      setExpertHelpRequests((items) => [
        {
          ...request,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString()
        },
        ...items
      ]);
      setMessage("Demo mode: expert help request saved on this page.");
      formElement.reset();
      setSavingExpertHelp(false);
      return;
    }

    const { data, error } = await supabase
      .from("expert_help_requests")
      .insert(request)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not save expert help request: ${error.message}`);
    } else if (data) {
      setExpertHelpRequests((items) => [data as ExpertHelpRequest, ...items]);
      setMessage("Expert help request saved. Live expert matching will be added later.");
      formElement.reset();
    }

    setSavingExpertHelp(false);
  }

  async function updateExpertHelpStatus(request: ExpertHelpRequest, status: ExpertHelpRequest["status"]) {
    if (!requireLogin("review expert help requests")) return;

    if (!isOwnerReviewer) {
      setMessage("Only the Talent7 owner account can update expert help requests.");
      return;
    }

    if (!supabase) return;

    setExpertHelpActionId(request.id);
    setMessage("");

    const { data, error } = await supabase
      .from("expert_help_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", request.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update expert help request: ${error.message}`);
    } else if (data) {
      setExpertHelpRequests((items) =>
        items.map((item) => (item.id === request.id ? (data as ExpertHelpRequest) : item))
      );
      setMessage(`Expert help request marked ${status.toLowerCase()}.`);
    }

    setExpertHelpActionId(null);
  }

  async function assignExpertToRequest(request: ExpertHelpRequest, expert: ExpertProfile) {
    if (!requireLogin("assign expert help requests")) return;

    if (!isOwnerReviewer) {
      setMessage("Only the Talent7 owner account can assign experts.");
      return;
    }

    if (!supabase) return;

    setExpertHelpActionId(request.id);
    setMessage("");

    const { data, error } = await supabase
      .from("expert_help_requests")
      .update({
        status: "Assigned",
        assigned_expert_id: expert.id,
        assigned_expert_name: expert.display_name,
        updated_at: new Date().toISOString()
      })
      .eq("id", request.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not assign expert: ${error.message}`);
    } else if (data) {
      setExpertHelpRequests((items) =>
        items.map((item) => (item.id === request.id ? (data as ExpertHelpRequest) : item))
      );
      setMessage(`${expert.display_name} assigned to ${request.help_type.toLowerCase()} request.`);
    }

    setExpertHelpActionId(null);
  }

  async function requestSpecificExpert(event: FormEvent<HTMLFormElement>, expert: ExpertProfile) {
    event.preventDefault();
    if (!requireLogin("request this expert")) return;
    if (!requireProfile("request this expert")) return;

    if (expert.user_id === session?.user.id) {
      setMessage("You cannot request your own expert profile.");
      return;
    }

    if (expert.verification_status !== "Verified") {
      setMessage("Only verified experts can be requested.");
      return;
    }

    if ((expert.availability_status || "Accepting requests") === "Unavailable") {
      setMessage(`${expert.display_name} is unavailable right now.`);
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const details = String(form.get("request_details") || "").trim();
    const urgency = String(form.get("request_urgency") || "Need guidance soon").trim() as ExpertHelpRequest["urgency"];

    if (!details) {
      setMessage("Add what you need help with before requesting this expert.");
      return;
    }

    const request = {
      requester_id: session?.user.id || "",
      requester_name: profileName(),
      help_type: expert.expertise_area,
      urgency,
      location: profile?.region || expert.region || null,
      details,
      status: "Assigned" as const,
      assigned_expert_id: expert.id,
      assigned_expert_name: expert.display_name
    };

    setRequestingExpertId(expert.id);
    setMessage("");

    if (!supabase) {
      setExpertHelpRequests((items) => [
        {
          ...request,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString()
        },
        ...items
      ]);
      setMessage(`Demo mode: request sent to ${expert.display_name}.`);
      formElement.reset();
      setRequestingExpertId(null);
      return;
    }

    const { data, error } = await supabase
      .from("expert_help_requests")
      .insert(request)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not request expert: ${error.message}`);
    } else if (data) {
      setExpertHelpRequests((items) => [data as ExpertHelpRequest, ...items]);
      setMessage(`Request sent to ${expert.display_name}. They will see it in Expert help.`);
      formElement.reset();
    }

    setRequestingExpertId(null);
  }

  async function submitExpertResponse(event: FormEvent<HTMLFormElement>, request: ExpertHelpRequest) {
    event.preventDefault();
    if (!requireLogin("respond to expert help requests")) return;

    if (!canRespondToExpertRequest(request)) {
      setMessage("Only the assigned expert can respond to this help request.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const expertResponse = String(form.get("expert_response") || "").trim();

    if (!expertResponse) {
      setMessage("Add a short guidance note before sending.");
      return;
    }

    const responseTime = new Date().toISOString();
    setExpertReplyActionId(request.id);
    setMessage("");

    if (!supabase) {
      setExpertHelpRequests((items) =>
        items.map((item) =>
          item.id === request.id
            ? {
                ...item,
                status: "Responded",
                expert_response: expertResponse,
                expert_response_at: responseTime,
                updated_at: responseTime
              }
            : item
        )
      );
      setMessage("Demo mode: expert response saved on this page.");
      formElement.reset();
      setExpertReplyActionId(null);
      return;
    }

    const { data, error } = await supabase
      .from("expert_help_requests")
      .update({
        status: "Responded",
        expert_response: expertResponse,
        expert_response_at: responseTime,
        updated_at: responseTime
      })
      .eq("id", request.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not save expert response: ${error.message}`);
    } else if (data) {
      setExpertHelpRequests((items) =>
        items.map((item) => (item.id === request.id ? (data as ExpertHelpRequest) : item))
      );
      setMessage("Expert response saved. The requester can now see it.");
      formElement.reset();
    }

    setExpertReplyActionId(null);
  }

  async function proposeExpertSession(event: FormEvent<HTMLFormElement>, request: ExpertHelpRequest) {
    event.preventDefault();
    if (!requireLogin("schedule expert help sessions")) return;

    if (!canScheduleExpertRequest(request)) {
      setMessage("Only the requester, assigned expert, or owner can schedule this request.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const proposedValue = String(form.get("session_at") || "").trim();
    const sessionNote = String(form.get("session_note") || "").trim();

    if (!proposedValue) {
      setMessage("Choose a date and time before proposing the session.");
      return;
    }

    const proposedSessionAt = new Date(proposedValue).toISOString();
    const updateTime = new Date().toISOString();
    setExpertScheduleActionId(request.id);
    setMessage("");

    const scheduleUpdate = {
      session_status: "Proposed" as const,
      proposed_session_at: proposedSessionAt,
      confirmed_session_at: null,
      session_note: sessionNote || null,
      session_updated_by: session?.user.id || null,
      updated_at: updateTime
    };

    if (!supabase) {
      setExpertHelpRequests((items) =>
        items.map((item) => (item.id === request.id ? { ...item, ...scheduleUpdate } : item))
      );
      setMessage("Demo mode: session time proposed on this page.");
      formElement.reset();
      setExpertScheduleActionId(null);
      return;
    }

    const { data, error } = await supabase
      .from("expert_help_requests")
      .update(scheduleUpdate)
      .eq("id", request.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not propose session time: ${error.message}`);
    } else if (data) {
      setExpertHelpRequests((items) =>
        items.map((item) => (item.id === request.id ? (data as ExpertHelpRequest) : item))
      );
      setMessage("Expert session time proposed.");
      formElement.reset();
    }

    setExpertScheduleActionId(null);
  }

  async function confirmExpertSession(request: ExpertHelpRequest) {
    if (!requireLogin("confirm expert help sessions")) return;

    if (!canScheduleExpertRequest(request)) {
      setMessage("Only the requester, assigned expert, or owner can confirm this session.");
      return;
    }

    if (!request.proposed_session_at) {
      setMessage("A session time must be proposed before it can be confirmed.");
      return;
    }

    const updateTime = new Date().toISOString();
    setExpertScheduleActionId(request.id);
    setMessage("");

    const scheduleUpdate = {
      session_status: "Confirmed" as const,
      confirmed_session_at: request.proposed_session_at,
      session_updated_by: session?.user.id || null,
      updated_at: updateTime
    };

    if (!supabase) {
      setExpertHelpRequests((items) =>
        items.map((item) => (item.id === request.id ? { ...item, ...scheduleUpdate } : item))
      );
      setMessage("Demo mode: expert session confirmed on this page.");
      setExpertScheduleActionId(null);
      return;
    }

    const { data, error } = await supabase
      .from("expert_help_requests")
      .update(scheduleUpdate)
      .eq("id", request.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not confirm session: ${error.message}`);
    } else if (data) {
      setExpertHelpRequests((items) =>
        items.map((item) => (item.id === request.id ? (data as ExpertHelpRequest) : item))
      );
      setMessage("Expert session confirmed.");
    }

    setExpertScheduleActionId(null);
  }

  async function saveExpertSessionLink(event: FormEvent<HTMLFormElement>, request: ExpertHelpRequest) {
    event.preventDefault();
    if (!requireLogin("add expert session links")) return;

    if (!canManageSessionLink(request)) {
      setMessage("Confirm the session before adding a live session link.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const sessionLink = String(form.get("session_link") || "").trim();
    const sessionLinkNote = String(form.get("session_link_note") || "").trim();

    if (!sessionLink || !/^https?:\/\//i.test(sessionLink)) {
      setMessage("Paste a valid meeting link starting with http:// or https://.");
      return;
    }

    const updateTime = new Date().toISOString();
    setExpertSessionLinkActionId(request.id);
    setMessage("");

    const linkUpdate = {
      session_link: sessionLink,
      session_link_note: sessionLinkNote || null,
      session_link_added_by: session?.user.id || null,
      session_link_added_at: updateTime,
      updated_at: updateTime
    };

    if (!supabase) {
      setExpertHelpRequests((items) =>
        items.map((item) => (item.id === request.id ? { ...item, ...linkUpdate } : item))
      );
      setMessage("Demo mode: session link saved on this page.");
      formElement.reset();
      setExpertSessionLinkActionId(null);
      return;
    }

    const { data, error } = await supabase
      .from("expert_help_requests")
      .update(linkUpdate)
      .eq("id", request.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not save session link: ${error.message}`);
    } else if (data) {
      setExpertHelpRequests((items) =>
        items.map((item) => (item.id === request.id ? (data as ExpertHelpRequest) : item))
      );
      setMessage("Live session link saved.");
      formElement.reset();
    }

    setExpertSessionLinkActionId(null);
  }

  async function completeExpertSession(event: FormEvent<HTMLFormElement>, request: ExpertHelpRequest) {
    event.preventDefault();
    if (!requireLogin("complete expert sessions")) return;

    if (!canCompleteExpertSession(request)) {
      setMessage("Only the requester can rate and complete a confirmed session with a live link.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const rating = Number(form.get("expert_rating") || 0);
    const feedback = String(form.get("expert_feedback") || "").trim();

    if (!Number.isFinite(rating) || rating < 1 || rating > 7) {
      setMessage("Choose an expert rating from 1 to 7.");
      return;
    }

    const updateTime = new Date().toISOString();
    setExpertCompletionActionId(request.id);
    setMessage("");

    const completionUpdate = {
      status: "Closed" as const,
      session_completed_at: updateTime,
      session_completed_by: session?.user.id || null,
      expert_rating: rating,
      expert_feedback: feedback || null,
      expert_feedback_at: updateTime,
      updated_at: updateTime
    };

    if (!supabase) {
      setExpertHelpRequests((items) =>
        items.map((item) => (item.id === request.id ? { ...item, ...completionUpdate } : item))
      );
      setMessage("Demo mode: expert session completed on this page.");
      formElement.reset();
      setExpertCompletionActionId(null);
      return;
    }

    const { data, error } = await supabase
      .from("expert_help_requests")
      .update(completionUpdate)
      .eq("id", request.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not complete expert session: ${error.message}`);
    } else if (data) {
      setExpertHelpRequests((items) =>
        items.map((item) => (item.id === request.id ? (data as ExpertHelpRequest) : item))
      );
      setMessage("Expert session completed and feedback saved.");
      formElement.reset();
    }

    setExpertCompletionActionId(null);
  }

  async function submitExpertProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireLogin("create an expert profile")) return;
    if (!requireProfile("create an expert profile")) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const expertiseArea = String(form.get("expertise_area") || selectedHelpType) as ExpertHelpType;
    const region = String(form.get("region") || "").trim();
    const availability = String(form.get("availability") || "").trim();
    const bio = String(form.get("bio") || "").trim();
    const liveVideoReady = form.get("live_video_ready") === "on";
    const serviceMode = String(form.get("service_mode") || "Free help") as ExpertProfile["service_mode"];
    const priceRange = String(form.get("price_range") || "").trim();
    const availabilityStatus = String(
      form.get("availability_status") || "Accepting requests"
    ) as ExpertProfile["availability_status"];

    if (!region || !availability || !bio) {
      setMessage("Add your region, availability, and a short expert profile note.");
      return;
    }

    const profileData = {
      user_id: session?.user.id || "",
      display_name: profileName(),
      expertise_area: expertiseArea,
      region,
      availability,
      live_video_ready: liveVideoReady,
      service_mode: serviceMode,
      price_range: priceRange || (serviceMode === "Free help" ? "$0" : null),
      availability_status: availabilityStatus,
      bio,
      verification_status: "Pending review" as const
    };

    setSavingExpertProfile(true);
    setMessage("");

    if (!supabase) {
      const demoProfile: ExpertProfile = {
        ...profileData,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString()
      };
      setExpertProfiles((items) => [demoProfile, ...items]);
      setMessage("Demo mode: expert profile saved on this page.");
      formElement.reset();
      setSavingExpertProfile(false);
      return;
    }

    const { data, error } = await supabase
      .from("expert_profiles")
      .upsert(
        { ...profileData, updated_at: new Date().toISOString() },
        { onConflict: "user_id,expertise_area" }
      )
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not save expert profile: ${error.message}`);
    } else if (data) {
      setExpertProfiles((items) => {
        const saved = data as ExpertProfile;
        const exists = items.some((item) => item.id === saved.id);
        return exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...items];
      });
      setMessage("Expert profile saved for owner review.");
      formElement.reset();
    }

    setSavingExpertProfile(false);
  }

  async function updateExpertProfileStatus(
    expert: ExpertProfile,
    verificationStatus: ExpertProfile["verification_status"]
  ) {
    if (!requireLogin("review expert profiles")) return;

    if (!isOwnerReviewer) {
      setMessage("Only the Talent7 owner account can verify expert profiles.");
      return;
    }

    if (!supabase) return;

    setExpertProfileActionId(expert.id);
    setMessage("");

    const { data, error } = await supabase
      .from("expert_profiles")
      .update({ verification_status: verificationStatus, updated_at: new Date().toISOString() })
      .eq("id", expert.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update expert profile: ${error.message}`);
    } else if (data) {
      setExpertProfiles((items) =>
        items.map((item) => (item.id === expert.id ? (data as ExpertProfile) : item))
      );
      setMessage(`Expert profile marked ${verificationStatus.toLowerCase()}.`);
    }

    setExpertProfileActionId(null);
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

  const activeMobileConfig = mobileTabs.find((tab) => tab.id === activeMobileTab) || mobileTabs[0];

  return (
    <main className={`mobileTab-${activeMobileTab}`}>
      <header className="hero">
        <nav>
          <strong>Talent7</strong>
          <div className="navActions">
            <span>{session ? profileName() : "Guest mode"}</span>
            <a href="https://www.jointalent7.com">Public site</a>
          </div>
        </nav>
        <section>
          <p className="eyebrow">Early access MVP</p>
          <h1>Challenge anyone. Prove it. Rise on Talent7.</h1>
          <p>
            Talent7 starts with fair, proof-based challenge rooms for talent battles, sports matchups,
            mobile gaming, coaching, and verified expert guidance before full live video arrives.
          </p>
          <div className="heroMetrics">
            <article>
              <span>{challenges.length}</span>
              <small>Challenge rooms</small>
            </article>
            <article>
              <span>{publicProfiles.length}</span>
              <small>Talent profiles</small>
            </article>
            <article>
              <span>{proofs.length}</span>
              <small>Proof uploads</small>
            </article>
            <article>
              <span>{leaderboard.length}</span>
              <small>Top rooms</small>
            </article>
          </div>
          <div className="heroActions">
            <a href="#account" className="primary">Start with account</a>
            <a href="#rooms" className="primary">Browse challenge rooms</a>
            <a href="#create" className="secondary">Create a challenge</a>
            <a href="#my-talent7" className="secondary">My dashboard</a>
          </div>
          <div className="earlyAccessCallout">
            <a className="focusLink" href="#first-wave">First wave focus</a>
            <span>Badminton doubles, breakdance battles, PUBG squads, coaching offers, and safe expert-help requests.</span>
            <a href="#plans">Support the founder</a>
          </div>
          <div className="pathFinder">
            <div>
              <p className="eyebrow">Choose your path</p>
              <strong>What do you want to do first?</strong>
            </div>
            <a href="#rooms">
              <span>Compete</span>
              <small>Create or join proof-based challenges.</small>
            </a>
            <a href="#rooms">
              <span>Watch / rate</span>
              <small>Vote winners and rate rooms out of 7.</small>
            </a>
            <a href="#coaching">
              <span>Coaching</span>
              <small>Find lessons or offer training help.</small>
            </a>
            <a href="#expert-help">
              <span>Expert help</span>
              <small>Request safe guidance from verified helpers.</small>
            </a>
            <a href="#teams">
              <span>Teams</span>
              <small>Build sports teams, crews, or gaming clans.</small>
            </a>
            <a href="#plans">
              <span>Support</span>
              <small>Show payment or founder support interest.</small>
            </a>
          </div>
          <div className="shareStrip">
            <div>
              <p className="eyebrow">Share Talent7</p>
              <strong>Build the first Play Store launch wave</strong>
            </div>
            <button
              onClick={() => copyShareText("Talent7 link", siteUrl())}
              type="button"
            >
              Copy invite link
            </button>
            <button
              onClick={() =>
                copyShareText(
                  "Challenge invite",
                  `Join me on Talent7 for proof-based challenge rooms. You can compete, vote winners, rate out of 7, and upload victory proof.\n\nStart here: ${siteUrl("#rooms")}`
                )
              }
              type="button"
            >
              Copy challenge invite
            </button>
            <button
              onClick={() =>
                copyShareText(
                  "First-wave invite",
                  `Talent7 is preparing for Play Store launch with badminton doubles, breakdance battles, PUBG squads, coaching, teams, and expert help.\n\nJoin the first launch wave here: ${siteUrl("#first-wave")}`
                )
              }
              type="button"
            >
              Copy launch-wave invite
            </button>
            <button
              onClick={() =>
                copyShareText(
                  "Founder support text",
                  `Talent7 is being built by a standalone founder. If you like the idea, you can show support or select a future contribution range here:\n\n${siteUrl("#plans")}`
                )
              }
              type="button"
            >
              Copy founder support
            </button>
          </div>
          <div className="issueShortcut">
            <div>
              <p className="eyebrow">Found a launch issue?</p>
              <strong>Tell the founder quickly</strong>
            </div>
            {(["Bug", "Confusing", "Feature request", "Payment interest"] as FounderFeedback["feedback_type"][]).map((type) => (
              <button key={type} onClick={() => startFounderFeedback(type)} type="button">
                {type}
              </button>
            ))}
          </div>
          <div className="heroGuide desktopFeatureTiles">
            <a href="#rooms">
              <span>Compete</span>
              <strong>Find live challenge rooms</strong>
              <small>Badminton, breakdance, gaming, and more.</small>
            </a>
            <a href="#teams">
              <span>Teams</span>
              <strong>Form squads and crews</strong>
              <small>Create doubles partners, dance crews, or gaming clans.</small>
            </a>
            <a href="#profiles">
              <span>Discover</span>
              <strong>Browse talent profiles</strong>
              <small>Follow people, copy profile links, and view activity.</small>
            </a>
            <a href="#listen-rooms">
              <span>Listen</span>
              <strong>Listen with buddies</strong>
              <small>Shared music rooms for specials, friends, and groups.</small>
            </a>
            <a href="#coaching">
              <span>Learn</span>
              <strong>Find coaching</strong>
              <small>Offer lessons or ask coaches for help.</small>
            </a>
            <a href="#expert-help">
              <span>Guidance</span>
              <strong>Request expert guidance</strong>
              <small>Medical caution, plumbing, tech, fitness, and more.</small>
            </a>
            <a href="#live-preview">
              <span>Live</span>
              <strong>Preview live battles</strong>
              <small>Two-screen challenges, reactions, and 7-star ratings.</small>
            </a>
          </div>
          <div className="heroUtilityLinks">
            <a href="#account">Account</a>
            <a href="#notifications" className="secondary">
              Notifications{unreadNotifications.length > 0 ? ` (${unreadNotifications.length})` : ""}
            </a>
            <a href="#following-feed" className="secondary">Feed</a>
            <a href="#listen-rooms" className="secondary">Listen rooms</a>
            <a href="#invites" className="secondary">Invites</a>
            <a href="#safety" className="secondary">Safety</a>
            <a href="#expert-help" className="secondary">Expert guidance</a>
            <a href="#live-preview" className="secondary">Live preview</a>
            <a href="#plans" className="secondary">Plans</a>
            <a href="#feedback" className="secondary">Feedback</a>
            {isOwnerReviewer && <a href="#launch-control" className="secondary ownerOnlyNav">Launch control</a>}
            <a href="#trust-terms" className="secondary">Trust & terms</a>
            <a href="#roadmap" className="secondary">Roadmap</a>
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

      <nav className="mobileAppTabs" aria-label="Talent7 mobile sections">
        {mobileTabs.map((tab) => (
          <button
            className={activeMobileTab === tab.id ? "active" : ""}
            key={tab.id}
            onClick={() => switchMobileTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <nav className="mobileSubTabs" aria-label={`${activeMobileConfig.label} options`}>
        {activeMobileConfig.links.map((link) => (
          <a href={link.href} key={link.href}>
            {link.label}
          </a>
        ))}
      </nav>

      <section className="section firstWaveSection" id="first-wave">
        <div className="sectionHeader">
          <p className="eyebrow">Early access</p>
          <h2>Built for the first Play Store launch wave</h2>
          <p>New visitors can start as audience, challenger, coach, team owner, or expert helper while payments and full live video stay in preview.</p>
        </div>
        <div className="firstWaveGrid">
          <article>
            <span>1</span>
            <strong>Create your profile</strong>
            <p>Save your Talent7 name, role, region, and first challenge interest so rooms and invites feel personal.</p>
            <a href="#account">Go to account</a>
          </article>
          <article>
            <span>2</span>
            <strong>Join or create a challenge</strong>
            <p>Start with badminton, breakdance, or mobile gaming. Upload proof, collect votes, and lock a winner.</p>
            <a href="#rooms">View rooms</a>
          </article>
          <article>
            <span>3</span>
            <strong>Build your circle</strong>
            <p>Follow profiles, form teams, request coaching, and watch notifications for invites and updates.</p>
            <a href="#profiles">Browse people</a>
          </article>
        </div>
        <div className="firstWaveSignup">
          <form onSubmit={submitFirstWaveInterest}>
            <div>
              <p className="eyebrow">First wave list</p>
              <h3>Tell Talent7 what you want first</h3>
              <p>
                This helps the owner prepare the right challenge, coaching, team, game, and expert-help flows before Play Store launch.
              </p>
            </div>
            <label>
              Main interest
              <select name="main_interest" defaultValue={profile?.main_interest || "Badminton doubles"}>
                {challengeActivityOptions.map((interest) => (
                  <option key={interest}>{interest}</option>
                ))}
              </select>
            </label>
            <label>
              Region
              <input name="region" placeholder="Example: Mumbai, India" defaultValue={profile?.region || ""} />
            </label>
            <label>
              I want to join as
              <select name="role_goal" defaultValue="Challenger">
                {(["Challenger", "Audience", "Coach", "Organizer", "Expert helper", "Gaming squad"] as FirstWaveInterest["role_goal"][]).map(
                  (role) => (
                    <option key={role}>{role}</option>
                  )
                )}
              </select>
            </label>
            <label>
              Availability
              <select name="availability" defaultValue="Ready now">
                {(["Ready now", "This week", "This month", "Just exploring"] as FirstWaveInterest["availability"][]).map((availability) => (
                  <option key={availability}>{availability}</option>
                ))}
              </select>
            </label>
            <label className="full">
              Notes
              <textarea
                name="notes"
                placeholder="Example: I can test badminton audience voting, or I want to create a PUBG squad challenge."
              />
            </label>
            <button disabled={savingFirstWave} type="submit">
              {savingFirstWave ? "Saving first-wave interest..." : myFirstWaveInterest ? "Update first-wave interest" : "Join first wave"}
            </button>
          </form>
          <aside>
            <p className="eyebrow">{isOwnerReviewer ? "Owner view" : "My first-wave status"}</p>
            <h3>{isOwnerReviewer ? "Launch-wave dashboard" : myFirstWaveInterest ? "You are on the list" : "Join when ready"}</h3>
            {myFirstWaveInterest ? (
              <div className="firstWaveStatusCard">
                <span>{myFirstWaveInterest.status}</span>
                <strong>{myFirstWaveInterest.main_interest}</strong>
                <small>
                  {myFirstWaveInterest.role_goal} Â· {myFirstWaveInterest.region} Â· {myFirstWaveInterest.availability}
                </small>
              </div>
            ) : (
              <p>Save your profile, then join the first wave so Talent7 knows what to build around first.</p>
            )}
            <div className="firstWaveStats">
              <small>{firstWaveInterests.length} total</small>
              <small>{firstWaveInterests.filter((interest) => interest.role_goal === "Challenger").length} challengers</small>
              <small>{firstWaveInterests.filter((interest) => interest.role_goal === "Coach").length} coaches</small>
              <small>{firstWaveInterests.filter((interest) => interest.role_goal === "Expert helper").length} experts</small>
            </div>
          </aside>
        </div>
        {isOwnerReviewer && (
          <div className="firstWaveOwnerPanel">
            <div className="firstWaveOwnerHeader">
              <div>
                <p className="eyebrow">Owner first wave</p>
                <h3>People ready for Talent7 launch</h3>
                <small>Use this list to choose the first Play Store closed-test group and see which feature lane is getting traction.</small>
              </div>
              <strong>{firstWaveInterests.length} signups</strong>
            </div>
            {firstWaveInterests.length > 0 ? (
              <div className="firstWaveList">
                {firstWaveInterests.slice(0, 12).map((interest) => (
                  <article key={interest.id}>
                    <div>
                      <span>{interest.role_goal}</span>
                      <strong>{interest.display_name}</strong>
                      <small>
                        {interest.main_interest} Â· {interest.region} Â· {interest.availability}
                      </small>
                      {interest.notes && <p>{interest.notes}</p>}
                    </div>
                    <div className="firstWaveActions">
                      {(["New", "Contact later", "Invited", "Active tester"] as FirstWaveInterest["status"][]).map((status) => (
                        <button
                          className={interest.status === status ? "active" : ""}
                          disabled={firstWaveActionKey === `${interest.id}-${status}` || interest.status === status}
                          key={status}
                          onClick={() => updateFirstWaveStatus(interest, status)}
                          type="button"
                        >
                          {firstWaveActionKey === `${interest.id}-${status}` ? "Saving..." : status === "Active tester" ? "Active launch account" : status}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="emptyState">
                <strong>No first-wave signups yet.</strong>
                <small>Launch-wave interest will appear here after users submit the form.</small>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="section notificationsSection" id="notifications">
        <div className="sectionHeader">
          <p className="eyebrow">Notifications</p>
          <h2>What needs your attention</h2>
          <p>See invites, team requests, proof uploads, completed challenges, report updates, expert help, and showcase comments in one place.</p>
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
                  placeholder="Search invites, proof, teams, reports, expert help..."
                  type="search"
                  value={notificationSearch}
                />
              </label>
              <div className="notificationFilters">
                {(["All", "Unread", "Invites", "Teams", "Proof", "Results", "Reports", "Showcase", "Expert help"] as NotificationFilter[]).map(
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
              <small>Invites, team updates, proof uploads, expert help, reports, and comments will appear here.</small>
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
            <div className="accountPaymentCard">
              <div>
                <span>Talent7 plan</span>
                <strong>{currentPaymentInterest ? currentPaymentInterest.label : "Free audience"}</strong>
                <small>
                  {currentPaymentInterest
                    ? currentPaymentInterest.amount_label
                    : "Audience access stays free"}
                </small>
              </div>
              <div>
                <span>Founder support</span>
                <strong>{latestContributionInterest ? latestContributionInterest.amount_label : "$0"}</strong>
                <small>Real checkout is not connected yet.</small>
              </div>
              <a href="#plans">View plans</a>
            </div>
            <div className="accountLegalCard">
              <div>
                <span>Account safety</span>
                <strong>Privacy, support, and deletion</strong>
                <small>Manage support questions and account deletion requests from public Play Store-ready pages.</small>
              </div>
              <a href="/privacy">Privacy Policy</a>
              <a href="/delete-account">Delete account request</a>
              <a href="/support">Support</a>
              <a href="/child-safety">Child safety standards</a>
            </div>
            <form className="passwordForm" onSubmit={changePassword}>
              <div>
                <span>Password</span>
                <strong>Change your password</strong>
                <small>Use at least 6 characters. Your password is never shown to Talent7.</small>
              </div>
              <label className="passwordField">
                New password
                <span>
                  <input name="new_password" placeholder="New password" type={showNewPassword ? "text" : "password"} />
                  <button type="button" onClick={() => setShowNewPassword((current) => !current)}>
                    {showNewPassword ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
              <button disabled={updatingPassword} type="submit">
                {updatingPassword ? "Updating..." : "Update password"}
              </button>
            </form>
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
                  {challengeActivityOptions.map((interest) => (
                    <option key={interest}>{interest}</option>
                  ))}
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
              <span className="passwordField">
                <input name="password" placeholder="At least 6 characters" type={showAuthPassword ? "text" : "password"} />
                <button type="button" onClick={() => setShowAuthPassword((current) => !current)}>
                  {showAuthPassword ? "Hide" : "Show"}
                </button>
              </span>
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
              <small>Optional: JPG, PNG, or WebP up to 10 MB. MP4 or MOV up to 50 MB.</small>
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
              <article
                className={post.id === highlightedShowcasePostId ? "highlightShareTarget" : ""}
                id={showcaseHash(post.id)}
                key={post.id}
              >
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
                  <button onClick={() => copyShowcaseLink(post)} type="button">Copy post link</button>
                  {canDeleteUserContent(post.user_id) && (
                    <button
                      className="dangerAction"
                      disabled={deletingShowcasePostId === post.id}
                      onClick={() => deleteShowcasePost(post)}
                      type="button"
                    >
                      {deletingShowcasePostId === post.id ? "Deleting..." : "Delete post"}
                    </button>
                  )}
                </div>
                {canDeleteUserContent(post.user_id) && (
                  <details className="editPanel">
                    <summary>Edit post</summary>
                    <form onSubmit={(event) => updateShowcasePost(event, post)}>
                      <label>
                        Media type
                        <select name="media_type" defaultValue={post.media_type}>
                          <option>Video</option>
                          <option>Photo</option>
                          <option>Link</option>
                        </select>
                      </label>
                      <label>
                        Category
                        <select name="category" defaultValue={post.category}>
                          <option>Talent</option>
                          <option>Dance</option>
                          <option>Sports</option>
                          <option>Gaming</option>
                          <option>Coaching</option>
                          <option>Fitness</option>
                          {challengeActivityOptions.map((interest) => (
                            <option key={interest}>{interest}</option>
                          ))}
                        </select>
                      </label>
                      <label className="wide">
                        Media link
                        <input name="media_url" defaultValue={post.media_url} />
                      </label>
                      <label className="wide">
                        Caption
                        <textarea name="caption" defaultValue={post.caption} rows={2} />
                      </label>
                      <button disabled={editingShowcasePostId === post.id} type="submit">
                        {editingShowcasePostId === post.id ? "Saving..." : "Save post"}
                      </button>
                    </form>
                  </details>
                )}
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

      <section className="section listenSection" id="listen-rooms">
        <div className="sectionHeader">
          <span className="eyebrow">Listen together</span>
          <h2>Wanna listen to songs with your specials/buddies?</h2>
          <p>
            Create a shared listen room, drop public song links, react together, and keep the queue moving. Real synced playback
            can come later after the challenge flow is stable.
          </p>
        </div>

        <div className="listenLayout">
          <form className="card listenCreateCard" onSubmit={handleCreateListenRoom}>
            <div>
              <span className="statusBadge">Public links only</span>
              <h3>Create a listen room</h3>
              <p className="muted">Use YouTube, Spotify, or another public song link. Talent7 is not storing copyrighted songs.</p>
            </div>

            <div className="listenFormGrid">
              <label>
                Room title
                <input
                  value={listenRoomDraft.title}
                  onChange={(event) => updateListenRoomDraft("title", event.target.value)}
                  placeholder="Late night favourites"
                />
              </label>
              <label>
                Mood
                <select
                  value={listenRoomDraft.mood}
                  onChange={(event) => updateListenRoomDraft("mood", event.target.value as ListenMood)}
                >
                  {listenMoodOptions.map((mood) => (
                    <option key={mood} value={mood}>
                      {mood}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Host name
                <input
                  value={listenRoomDraft.host_name}
                  onChange={(event) => updateListenRoomDraft("host_name", event.target.value)}
                  placeholder={profileName()}
                />
              </label>
              <label>
                First song title
                <input
                  value={listenRoomDraft.current_track_title}
                  onChange={(event) => updateListenRoomDraft("current_track_title", event.target.value)}
                  placeholder="Song or playlist name"
                />
              </label>
            </div>

            <label>
              Song link
              <input
                value={listenRoomDraft.current_track_url}
                onChange={(event) => updateListenRoomDraft("current_track_url", event.target.value)}
                placeholder="https://youtube.com/... or https://open.spotify.com/..."
              />
            </label>

            <label>
              Room note
              <textarea
                value={listenRoomDraft.room_note}
                onChange={(event) => updateListenRoomDraft("room_note", event.target.value)}
                placeholder="Who is this room for? Friends, couples, team warmups, study buddies..."
              />
            </label>

            <button type="submit">Create listen room</button>
          </form>

          <div className="listenRoomList">
            {listenRooms.map((room) => {
              const draft = listenTrackDrafts[room.id] || { track_title: "", track_url: "", added_by: profileName() };
              const tracks = listenTracksByRoom[room.id] || [];

              return (
                <article className="card listenRoomCard" key={room.id}>
                  <div className="listenRoomTop">
                    <div>
                      <span className="pill">{room.mood}</span>
                      <h3>{room.title}</h3>
                      <p className="muted">Hosted by {room.host_name}</p>
                    </div>
                    <span className="statusBadge">Sync playback later</span>
                  </div>

                  {room.room_note ? <p>{room.room_note}</p> : null}

                  <div className="nowPlaying">
                    <span className="eyebrow">Now playing</span>
                    <a href={room.current_track_url} rel="noreferrer" target="_blank">
                      {room.current_track_title}
                    </a>
                  </div>

                  <div className="listenRoomActions">
                    <button type="button" onClick={() => handleJoinListenRoom(room.id)}>
                      Join room ({room.listener_count})
                    </button>
                    <button type="button" onClick={() => handleReactListenRoom(room.id, "love")}>
                      Love ({room.love_count})
                    </button>
                    <button type="button" onClick={() => handleReactListenRoom(room.id, "vibe")}>
                      Vibe ({room.vibe_count})
                    </button>
                  </div>

                  <form className="listenQueueForm" onSubmit={(event) => handleAddListenTrack(event, room.id)}>
                    <input
                      value={draft.track_title}
                      onChange={(event) => updateListenTrackDraft(room.id, "track_title", event.target.value)}
                      placeholder="Song title"
                    />
                    <input
                      value={draft.track_url}
                      onChange={(event) => updateListenTrackDraft(room.id, "track_url", event.target.value)}
                      placeholder="Paste public song link"
                    />
                    <input
                      value={draft.added_by}
                      onChange={(event) => updateListenTrackDraft(room.id, "added_by", event.target.value)}
                      placeholder="Your name"
                    />
                    <button type="submit">Add song</button>
                  </form>

                  <div className="listenQueue">
                    <h4>Room queue</h4>
                    {tracks.length ? (
                      tracks.slice(0, 5).map((track) => (
                        <a href={track.track_url} key={track.id} rel="noreferrer" target="_blank">
                          <span>{track.track_title}</span>
                          <small>Added by {track.added_by}</small>
                        </a>
                      ))
                    ) : (
                      <p className="muted">No songs added yet.</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
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
                {challengeActivityOptions.map((interest) => (
                  <option key={interest}>{interest}</option>
                ))}
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
              <article
                className={team.id === highlightedTeamId ? "highlightShareTarget" : ""}
                id={teamHash(team.id)}
                key={team.id}
              >
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
                <button className="teamShareButton" onClick={() => copyTeamLink(team)} type="button">
                  Copy team link
                </button>
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
        {isOwnerReviewer && (
          <div className="adminModerationPanel">
            <div className="adminModerationHeader">
              <div>
                <p className="eyebrow">Owner admin</p>
                <h3>Moderation panel</h3>
                <small>Review reports from challenge rooms, proofs, showcase posts, and comments.</small>
              </div>
              <a href="#notifications">View alerts</a>
            </div>
            <div className="adminStats">
              <article>
                <span>Open</span>
                <strong>{adminModeration.openReports.length}</strong>
              </article>
              <article>
                <span>Reviewed</span>
                <strong>{adminModeration.reviewedReports.length}</strong>
              </article>
              <article>
                <span>Dismissed</span>
                <strong>{adminModeration.dismissedReports.length}</strong>
              </article>
              <article>
                <span>Proof reports</span>
                <strong>{adminModeration.proofs.length}</strong>
              </article>
            </div>
            <div className="adminQueues">
              {[
                { title: "Challenge rooms", items: adminModeration.challenges },
                { title: "Proofs", items: adminModeration.proofs },
                { title: "Showcase posts", items: adminModeration.posts },
                { title: "Comments", items: adminModeration.comments }
              ].map((queue) => (
                <article key={queue.title}>
                  <div>
                    <span>{queue.title}</span>
                    <strong>{queue.items.filter((report) => report.status === "Open").length} open</strong>
                  </div>
                  {queue.items.length > 0 ? (
                    queue.items.slice(0, 3).map((report) => (
                      <div className="adminQueueItem" key={report.id}>
                        <strong>{report.title}</strong>
                        <small>{report.reason} / {report.status}</small>
                        <p>{report.notes || "No extra note."}</p>
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
                      </div>
                    ))
                  ) : (
                    <small>No reports in this queue.</small>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
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

      <section className="section expertHelpSection" id="expert-help">
        <div className="sectionHeader">
          <p className="eyebrow">Expert guidance</p>
          <h2>Get guidance from someone who knows the problem</h2>
          <p>This is the early request flow for future live video guidance across medical caution, home fixes, tech, fitness injuries, and urgent everyday problems.</p>
        </div>
        <div className="expertWarning">
          <strong>Important safety note</strong>
          <p>Talent7 guidance is informational only. For medical danger, fire, electric shock risk, violence, or any life-threatening emergency, call local emergency services first.</p>
        </div>
        <div className="expertHelpLayout">
          <div className="expertHelpTypes">
            {expertHelpTypes.map((helpType) => (
              <button
                className={selectedHelpType === helpType ? "active" : ""}
                key={helpType}
                onClick={() => setSelectedHelpType(helpType)}
                type="button"
              >
                {helpType}
              </button>
            ))}
          </div>
          <form className="expertHelpForm" onSubmit={submitExpertHelpRequest}>
            <div>
              <span>Selected area</span>
              <strong>{selectedHelpType}</strong>
            </div>
            <label>
              Urgency
              <select name="urgency" defaultValue="Need guidance soon">
                <option>Need guidance soon</option>
                <option>Can wait</option>
                <option>Urgent but not life-threatening</option>
              </select>
            </label>
            <label>
              Location / region
              <input name="location" placeholder="City, country, or time zone" />
            </label>
            <label>
              What help is needed?
              <textarea name="details" rows={4} placeholder="Describe the issue, what happened, and what kind of expert would help." />
            </label>
            <button disabled={savingExpertHelp} type="submit">
              {savingExpertHelp ? "Saving request..." : "Save help request"}
            </button>
            <small>Requests are saved now. Later this can match users with verified professionals through live video, chat, or uploaded guidance.</small>
          </form>
          <div className="expertRoadmap">
            <article>
              <span>Now</span>
              <strong>Request flow</strong>
              <p>Collect the help type, urgency, region, and problem description.</p>
            </article>
            <article>
              <span>Next</span>
              <strong>Expert profiles</strong>
              <p>Let professionals list their expertise, availability, and safety boundaries.</p>
            </article>
            <article>
              <span>Later</span>
              <strong>Live video matching</strong>
              <p>Connect users to available experts with careful disclaimers and reporting tools.</p>
            </article>
          </div>
        </div>
        <div className="expertProfilePanel">
          <div className="expertHelpInboxHeader">
            <div>
              <p className="eyebrow">Expert profiles</p>
              <h3>Professionals and helpers</h3>
            </div>
            <small>{filteredExpertProfiles.length} shown</small>
          </div>
          <form className="expertProfileForm" onSubmit={submitExpertProfile}>
            <label>
              Expertise area
              <select name="expertise_area" defaultValue={selectedHelpType}>
                {expertHelpTypes.map((helpType) => (
                  <option key={helpType}>{helpType}</option>
                ))}
              </select>
            </label>
            <label>
              Region
              <input name="region" placeholder="City, country, or time zone" />
            </label>
            <label>
              Availability
              <input name="availability" placeholder="Example: evenings, weekends, 10am-6pm" />
            </label>
            <label>
              Service type
              <select name="service_mode" defaultValue="Free help">
                <option>Free help</option>
                <option>Paid consultation</option>
                <option>Both</option>
              </select>
            </label>
            <label>
              Price range
              <select name="price_range" defaultValue="$0">
                <option>$0</option>
                <option>$5-$20</option>
                <option>$20-$50</option>
                <option>$50-$100</option>
                <option>Custom / discuss first</option>
              </select>
            </label>
            <label>
              Request status
              <select name="availability_status" defaultValue="Accepting requests">
                <option>Accepting requests</option>
                <option>Busy</option>
                <option>Unavailable</option>
              </select>
            </label>
            <label>
              Short profile note
              <textarea name="bio" rows={3} placeholder="Mention experience, what you can help with, and safety limits." />
            </label>
            <label className="expertProfileToggle">
              <input name="live_video_ready" type="checkbox" />
              Ready for future live video help
            </label>
            <button disabled={savingExpertProfile} type="submit">
              {savingExpertProfile ? "Saving expert profile..." : "Create expert profile"}
            </button>
            <small>New or updated expert profiles stay pending until the Talent7 owner reviews them.</small>
          </form>
          <div className="expertFilterPanel">
            <label>
              Search experts
              <input
                onChange={(event) => setExpertProfileSearch(event.target.value)}
                placeholder="Name, region, skill, bio..."
                type="search"
                value={expertProfileSearch}
              />
            </label>
            <label>
              Expertise
              <select
                onChange={(event) => setExpertProfileAreaFilter(event.target.value as "All" | ExpertHelpType)}
                value={expertProfileAreaFilter}
              >
                <option>All</option>
                {expertHelpTypes.map((helpType) => (
                  <option key={helpType}>{helpType}</option>
                ))}
              </select>
            </label>
            <label>
              Service
              <select
                onChange={(event) => setExpertProfileServiceFilter(event.target.value)}
                value={expertProfileServiceFilter}
              >
                <option>All</option>
                <option>Free help</option>
                <option>Paid consultation</option>
                <option>Both</option>
              </select>
            </label>
            <label>
              Availability
              <select
                onChange={(event) => setExpertProfileAvailabilityFilter(event.target.value)}
                value={expertProfileAvailabilityFilter}
              >
                <option>All</option>
                <option>Accepting requests</option>
                <option>Busy</option>
                <option>Unavailable</option>
              </select>
            </label>
            <label>
              Minimum rating
              <select
                onChange={(event) => setExpertProfileMinRating(event.target.value)}
                value={expertProfileMinRating}
              >
                <option value="0">Any rating</option>
                <option value="4">4+/7</option>
                <option value="5">5+/7</option>
                <option value="6">6+/7</option>
                <option value="7">7/7</option>
              </select>
            </label>
          </div>
          <div className="expertProfileGrid">
            {filteredExpertProfiles.length > 0 ? (
              filteredExpertProfiles.slice(0, 8).map((expert) => {
                const reputation = expertReputation[expert.id] || {
                  completed: 0,
                  averageRating: "0.0",
                  latestFeedback: "",
                  ratingCount: 0
                };

                return (
                  <article className="expertProfileCard" key={expert.id}>
                    <span>{expert.expertise_area}</span>
                    <strong>{expert.display_name}</strong>
                    <p>{expert.bio}</p>
                    <div className="expertProfileMeta">
                      <small>{expert.region}</small>
                      <small>{expert.availability}</small>
                      <small>{expert.live_video_ready ? "Live video ready" : "Guidance profile"}</small>
                      <small>{expert.verification_status}</small>
                    </div>
                    <div className="expertBusinessMeta">
                      <small>{expert.service_mode || "Free help"}</small>
                      <small>{expert.price_range || "$0"}</small>
                      <small>{expert.availability_status || "Accepting requests"}</small>
                    </div>
                    <div className="expertReputationGrid">
                      <small>
                        <b>{reputation.completed}</b>
                        completed
                      </small>
                      <small>
                        <b>{reputation.averageRating}/7</b>
                        rating
                      </small>
                      <small>
                        <b>{reputation.ratingCount}</b>
                        reviews
                      </small>
                    </div>
                    {reputation.latestFeedback && (
                      <div className="expertFeedbackSnippet">
                        <strong>Latest feedback</strong>
                        <p>{reputation.latestFeedback}</p>
                      </div>
                    )}
                    {expert.verification_status === "Verified" && (
                      <form
                        className="expertDirectRequestForm"
                        onSubmit={(event) => requestSpecificExpert(event, expert)}
                      >
                        <label>
                          Request this expert
                          <textarea
                            name="request_details"
                            placeholder="Tell them what you need help with."
                            rows={3}
                          />
                        </label>
                        <label>
                          Urgency
                          <select name="request_urgency" defaultValue="Need guidance soon">
                            <option value="Need guidance soon">Need guidance soon</option>
                            <option value="Urgent but not life-threatening">
                              Urgent but not life-threatening
                            </option>
                            <option value="Can wait">Can wait</option>
                          </select>
                        </label>
                        <button
                          disabled={
                            requestingExpertId === expert.id ||
                            expert.user_id === session?.user.id ||
                            (expert.availability_status || "Accepting requests") === "Unavailable"
                          }
                          type="submit"
                        >
                          {requestingExpertId === expert.id
                            ? "Sending request..."
                            : expert.user_id === session?.user.id
                              ? "Your expert profile"
                              : (expert.availability_status || "Accepting requests") === "Unavailable"
                                ? "Unavailable"
                                : "Request this expert"}
                        </button>
                      </form>
                    )}
                    {isOwnerReviewer && (
                      <div className="ownerReportActions">
                        <button
                          disabled={
                            expertProfileActionId === expert.id || expert.verification_status === "Verified"
                          }
                          onClick={() => updateExpertProfileStatus(expert, "Verified")}
                          type="button"
                        >
                          Verify
                        </button>
                        <button
                          disabled={
                            expertProfileActionId === expert.id || expert.verification_status === "Needs changes"
                          }
                          onClick={() => updateExpertProfileStatus(expert, "Needs changes")}
                          type="button"
                        >
                          Needs changes
                        </button>
                      </div>
                    )}
                  </article>
                );
              })
            ) : (
              <div className="emptySafetyInbox">
                <strong>No matching expert profiles.</strong>
                <small>Try changing the search or filters.</small>
              </div>
            )}
          </div>
        </div>
        <div className="expertHelpInbox">
          <div className="expertHelpInboxHeader">
            <div>
              <p className="eyebrow">{isOwnerReviewer ? "Owner queue" : "My requests"}</p>
              <h3>{isOwnerReviewer ? "Expert help requests" : "My expert help requests"}</h3>
            </div>
            <small>{session ? `${expertHelpRequests.length} shown` : "Login required"}</small>
          </div>
          {session ? (
            expertHelpRequests.length > 0 ? (
              <div className="expertRequestList">
                {expertHelpRequests.slice(0, 8).map((request) => {
                  const matchingExperts = matchingExpertsFor(request);

                  return (
                    <article key={request.id}>
                      <span>{request.help_type}</span>
                      <strong>{request.urgency}</strong>
                      <p>{request.details}</p>
                      <div>
                        <small>{request.location || "No location"}</small>
                        <small>{request.status}</small>
                        {request.assigned_expert_name && <small>Assigned: {request.assigned_expert_name}</small>}
                        {isOwnerReviewer && <small>{request.requester_name}</small>}
                      </div>
                      <div className="expertMatchBox">
                        <strong>Matching verified experts</strong>
                        {matchingExperts.length > 0 ? (
                          matchingExperts.slice(0, 4).map((expert) => (
                            <div className="expertMatchItem" key={expert.id}>
                              <div>
                                <b>{expert.display_name}</b>
                                <small>{expert.region} Â· {expert.availability}</small>
                              </div>
                              {isOwnerReviewer && (
                                <button
                                  disabled={
                                    expertHelpActionId === request.id ||
                                    request.assigned_expert_id === expert.id ||
                                    request.status === "Closed"
                                  }
                                  onClick={() => assignExpertToRequest(request, expert)}
                                  type="button"
                                >
                                  {request.assigned_expert_id === expert.id ? "Assigned" : "Assign"}
                                </button>
                              )}
                            </div>
                          ))
                        ) : (
                          <small>No verified match yet.</small>
                        )}
                      </div>
                      {request.expert_response && (
                        <div className="expertResponseBox">
                          <strong>Expert response</strong>
                          <p>{request.expert_response}</p>
                          <small>
                            {request.assigned_expert_name || "Assigned expert"}
                            {request.expert_response_at
                              ? ` replied ${new Date(request.expert_response_at).toLocaleDateString()}`
                              : ""}
                          </small>
                        </div>
                      )}
                      {canRespondToExpertRequest(request) && request.status !== "Closed" && (
                        <form className="expertResponseForm" onSubmit={(event) => submitExpertResponse(event, request)}>
                          <label>
                            Add guidance response
                            <textarea
                              name="expert_response"
                              rows={3}
                              placeholder="Share safe guidance, next steps, limits, and when to contact local emergency services."
                              defaultValue={request.expert_response || ""}
                            />
                          </label>
                          <button disabled={expertReplyActionId === request.id} type="submit">
                            {expertReplyActionId === request.id ? "Sending response..." : "Send response"}
                          </button>
                        </form>
                      )}
                      {request.assigned_expert_id && (
                        <div className="expertSessionBox">
                          <div>
                            <strong>Expert session</strong>
                            <small>{request.session_status || "Not scheduled"}</small>
                          </div>
                          <p>
                            {request.session_status === "Confirmed"
                              ? `Confirmed: ${formatSessionTime(request.confirmed_session_at)}`
                              : request.proposed_session_at
                                ? `Proposed: ${formatSessionTime(request.proposed_session_at)}`
                                : "No time proposed yet."}
                          </p>
                          {request.session_note && <small>{request.session_note}</small>}
                          {request.session_link && (
                            <div className="expertSessionLinkBox">
                              <a href={request.session_link} rel="noreferrer" target="_blank">
                                Join session
                              </a>
                              {request.session_link_note && <small>{request.session_link_note}</small>}
                            </div>
                          )}
                          {request.session_completed_at && (
                            <div className="expertCompletionBox">
                              <strong>Session completed</strong>
                              <p>
                                {request.expert_rating
                                  ? `Expert help rating: ${request.expert_rating}/7`
                                  : "This expert help session has been completed."}
                              </p>
                              {request.expert_feedback && <small>{request.expert_feedback}</small>}
                            </div>
                          )}
                          {canScheduleExpertRequest(request) && request.status !== "Closed" && (
                            <>
                              <form className="expertSessionForm" onSubmit={(event) => proposeExpertSession(event, request)}>
                                <label>
                                  Propose session time
                                  <input name="session_at" type="datetime-local" />
                                </label>
                                <label>
                                  Short note
                                  <input name="session_note" placeholder="Example: 20-minute video check, bring photos, etc." />
                                </label>
                                <button disabled={expertScheduleActionId === request.id} type="submit">
                                  {expertScheduleActionId === request.id ? "Saving..." : "Propose time"}
                                </button>
                              </form>
                              {request.proposed_session_at && request.session_status !== "Confirmed" && (
                                <button
                                  className="confirmSessionButton"
                                  disabled={expertScheduleActionId === request.id}
                                  onClick={() => confirmExpertSession(request)}
                                  type="button"
                                >
                                  Confirm proposed time
                                </button>
                              )}
                              {canManageSessionLink(request) && (
                                <form className="expertSessionForm" onSubmit={(event) => saveExpertSessionLink(event, request)}>
                                  <label>
                                    Live session link
                                    <input name="session_link" placeholder="https://meet.google.com/..." type="url" />
                                  </label>
                                  <label>
                                    Link note
                                    <input name="session_link_note" placeholder="Example: Join 5 minutes early, keep camera on." />
                                  </label>
                                  <button disabled={expertSessionLinkActionId === request.id} type="submit">
                                    {expertSessionLinkActionId === request.id ? "Saving link..." : "Save live link"}
                                  </button>
                                </form>
                              )}
                            </>
                          )}
                          {canCompleteExpertSession(request) && (
                            <form className="expertCompletionForm" onSubmit={(event) => completeExpertSession(event, request)}>
                              <label>
                                Rate expert help out of 7
                                <select name="expert_rating" defaultValue="7">
                                  {[7, 6, 5, 4, 3, 2, 1].map((rating) => (
                                    <option key={rating} value={rating}>
                                      {rating}/7
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Short feedback
                                <textarea
                                  name="expert_feedback"
                                  rows={3}
                                  placeholder="Was the expert helpful, clear, and respectful?"
                                />
                              </label>
                              <button disabled={expertCompletionActionId === request.id} type="submit">
                                {expertCompletionActionId === request.id ? "Completing..." : "Mark completed"}
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                      {isOwnerReviewer && (
                        <div className="ownerReportActions">
                          <button
                            disabled={expertHelpActionId === request.id || request.status === "In review"}
                            onClick={() => updateExpertHelpStatus(request, "In review")}
                            type="button"
                          >
                            Mark in review
                          </button>
                          <button
                            disabled={expertHelpActionId === request.id || request.status === "Closed"}
                            onClick={() => updateExpertHelpStatus(request, "Closed")}
                            type="button"
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="emptySafetyInbox">
                <strong>No expert help requests yet.</strong>
                <small>Saved help requests will appear here.</small>
              </div>
            )
          ) : (
            <div className="emptySafetyInbox">
              <strong>Log in to save and view expert help requests.</strong>
              <a href="#account">Go to account</a>
            </div>
          )}
        </div>
      </section>

      <section className="section livePreviewSection" id="live-preview">
        <div className="sectionHeader">
          <p className="eyebrow">Live video roadmap</p>
          <h2>Two-screen battles are the future Talent7 arena</h2>
          <p>This preview shows the planned live experience before real video rooms are added: challengers side by side, audience reactions, public 7-star ratings, coaching, and expert help.</p>
        </div>
        <div className="livePreviewGrid">
          <div className="liveBattleMock">
            <div className="liveStatus">
              <span>Coming later</span>
              <strong>Live battle preview</strong>
            </div>
            <div className="liveScreens">
              <article>
                <span>Breakdance</span>
                <strong>Arya</strong>
                <small>Round 2 / 60 seconds</small>
              </article>
              <article>
                <span>Calisthenics</span>
                <strong>Mateo</strong>
                <small>Round 2 / 60 seconds</small>
              </article>
            </div>
            <div className="liveReactionBar">
              <button type="button">Love reaction</button>
              <button type="button">Rate 7 stars</button>
              <button type="button">Vote winner</button>
            </div>
          </div>
          <div className="liveModules">
            <article>
              <span>Talent battles</span>
              <strong>Two challengers, one screen</strong>
              <p>Breakdance, calisthenics, singing, freestyle, or any talent format with both competitors visible side by side.</p>
            </article>
            <article>
              <span>Sports coaching</span>
              <strong>Coach watches live</strong>
              <p>Instructors can observe form, give feedback, and later combine live sessions with uploaded coaching videos.</p>
            </article>
            <article>
              <span>Expert help</span>
              <strong>Guided video support</strong>
              <p>Verified helpers can later respond to non-life-threatening problems with safety rules and reporting tools.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section plansSection" id="plans">
        <div className="sectionHeader">
          <p className="eyebrow">Plans & payments</p>
          <h2>Keep discovery free, charge for power tools later</h2>
          <p>This is the pricing direction before real payments are added. Audience access stays free while serious challengers, coaches, and organizers can support the platform later.</p>
        </div>
        <div className="paymentNotice">
          <strong>Payments are not live yet.</strong>
          <small>These cards explain the future business model first. Stripe or another payment system can be added after the app flow feels right.</small>
        </div>
        <div className="paymentStatusPanel">
          <div>
            <span>Current plan interest</span>
            <strong>{currentPaymentInterest ? currentPaymentInterest.label : "Free audience"}</strong>
            <small>
              {currentPaymentInterest
                ? `${currentPaymentInterest.amount_label} selected for later checkout`
                : "No paid plan selected yet"}
            </small>
          </div>
          <div>
            <span>Latest contribution interest</span>
            <strong>{latestContributionInterest ? latestContributionInterest.amount_label : "$0"}</strong>
            <small>
              {latestContributionInterest
                ? `${latestContributionInterest.label} saved`
                : "Optional founder support can be selected below"}
            </small>
          </div>
        </div>
        <div className="plansGrid">
          <article>
            <span>Audience</span>
            <strong>Free</strong>
            <p>For people watching talent, rating rooms, following profiles, and discovering winners.</p>
            <ul>
              <li>Watch challenge rooms</li>
              <li>Vote and rate out of 7</li>
              <li>Follow profiles and results</li>
            </ul>
            <button
              disabled={paymentActionKey === "Plan-Free audience-Free"}
              onClick={() => recordPaymentInterest("Plan", "Free audience", "Free")}
              type="button"
            >
              {paymentActionKey === "Plan-Free audience-Free" ? "Saving..." : "Keep free"}
            </button>
          </article>
          <article>
            <span>Basic challenger</span>
            <strong>Free</strong>
            <p>For people joining normal rooms and trying Talent7 without a payment barrier.</p>
            <ul>
              <li>Join open challenges</li>
              <li>Upload victory proof</li>
              <li>Build early public history</li>
            </ul>
            <button
              disabled={paymentActionKey === "Plan-Basic challenger-Free"}
              onClick={() => recordPaymentInterest("Plan", "Basic challenger", "Free")}
              type="button"
            >
              {paymentActionKey === "Plan-Basic challenger-Free" ? "Saving..." : "Select challenger"}
            </button>
          </article>
          <article>
            <span>Challenge Plus</span>
            <strong>Paid later</strong>
            <p>For frequent competitors who want more challenge tools and stronger visibility.</p>
            <ul>
              <li>Featured challenge rooms</li>
              <li>Advanced stats and history</li>
              <li>More invite and team tools</li>
            </ul>
            <em>Subscription idea</em>
            <button
              disabled={paymentActionKey === "Plan-Challenge Plus-Future subscription"}
              onClick={() => recordPaymentInterest("Plan", "Challenge Plus", "Future subscription")}
              type="button"
            >
              {paymentActionKey === "Plan-Challenge Plus-Future subscription" ? "Saving..." : "I want Challenge Plus"}
            </button>
          </article>
          <article>
            <span>Coach / instructor</span>
            <strong>Fee later</strong>
            <p>For coaches who upload lessons, run live sessions, and earn through Talent7.</p>
            <ul>
              <li>Coaching profile tools</li>
              <li>Paid session requests</li>
              <li>Uploaded lessons and live coaching</li>
            </ul>
            <em>Monthly or platform fee</em>
            <button
              disabled={paymentActionKey === "Plan-Coach Pro-Future coach fee"}
              onClick={() => recordPaymentInterest("Plan", "Coach Pro", "Future coach fee")}
              type="button"
            >
              {paymentActionKey === "Plan-Coach Pro-Future coach fee" ? "Saving..." : "I am a coach"}
            </button>
          </article>
          <article>
            <span>Team / organizer</span>
            <strong>Paid later</strong>
            <p>For sports organizers, gaming clans, and teams running repeated tournaments.</p>
            <ul>
              <li>Team pages and member roles</li>
              <li>Tournament and bracket tools</li>
              <li>Venue and event links</li>
            </ul>
            <em>Organizer tools</em>
            <button
              disabled={paymentActionKey === "Plan-Organizer Pro-Future organizer fee"}
              onClick={() => recordPaymentInterest("Plan", "Organizer Pro", "Future organizer fee")}
              type="button"
            >
              {paymentActionKey === "Plan-Organizer Pro-Future organizer fee" ? "Saving..." : "I organize events"}
            </button>
          </article>
        </div>
        <div className="contributionBox">
          <div>
            <p className="eyebrow">Founder support</p>
            <h3>Contribute as a kind gesture</h3>
            <p>Talent7 is being built by a standalone founder. If you like the idea and want to help it grow, these future contribution ranges are in US dollars.</p>
          </div>
          <div className="contributionButtons">
            {["$0-50", "$50-200", "$200-1000", "$1000+"].map((amount) => (
              <button
                disabled={paymentActionKey === `Contribution-Founder support-${amount}`}
                key={amount}
                onClick={() => recordPaymentInterest("Contribution", "Founder support", amount)}
                type="button"
              >
                {paymentActionKey === `Contribution-Founder support-${amount}` ? "Saving..." : amount}
              </button>
            ))}
          </div>
        </div>
        {isOwnerReviewer && (
          <div className="ownerPaymentPanel">
            <div className="ownerPaymentHeader">
              <div>
                <p className="eyebrow">Owner payments</p>
                <h3>Payment interest dashboard</h3>
                <small>See who selected plans or founder support before real checkout is connected.</small>
              </div>
              <strong>{paymentInterests.length} records</strong>
            </div>
            <div className="ownerPaymentStats">
              <article>
                <span>Challenge Plus</span>
                <strong>{paymentInterests.filter((interest) => interest.label === "Challenge Plus").length}</strong>
              </article>
              <article>
                <span>Coach Pro</span>
                <strong>{paymentInterests.filter((interest) => interest.label === "Coach Pro").length}</strong>
              </article>
              <article>
                <span>Organizer Pro</span>
                <strong>{paymentInterests.filter((interest) => interest.label === "Organizer Pro").length}</strong>
              </article>
              <article>
                <span>Contributions</span>
                <strong>{paymentInterests.filter((interest) => interest.intent_type === "Contribution").length}</strong>
              </article>
            </div>
            <div className="ownerPaymentList">
              {paymentInterests.length > 0 ? (
                paymentInterests.slice(0, 12).map((interest) => (
                  <article key={interest.id}>
                    <div>
                      <span>{interest.intent_type}</span>
                      <strong>{interest.label}</strong>
                      <small>{interest.display_name} / {interest.amount_label}</small>
                    </div>
                    <small>{new Date(interest.created_at).toLocaleDateString()}</small>
                    <div className="ownerPaymentActions">
                      {(["Interested", "Ready later", "Contact requested"] as PaymentInterest["status"][]).map(
                        (status) => (
                          <button
                            className={interest.status === status ? "active" : ""}
                            disabled={
                              paymentActionKey === `status-${interest.id}-${status}` ||
                              interest.status === status
                            }
                            key={status}
                            onClick={() => updatePaymentInterestStatus(interest, status)}
                            type="button"
                          >
                            {status}
                          </button>
                        )
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="emptyPaymentInterest">
                  <strong>No payment interest yet.</strong>
                  <small>When users select plans or contribution ranges, they will appear here.</small>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="section feedbackSection" id="feedback">
        <div className="sectionHeader">
          <p className="eyebrow">Founder feedback</p>
          <h2>Tell us what to fix, clarify, or build next</h2>
          <p>Launch-wave users can report bugs, confusing screens, payment questions, and feature requests directly inside Talent7.</p>
        </div>
        {session ? (
          <form className="feedbackForm" onSubmit={submitFounderFeedback}>
            <label>
              Feedback type
              <select
                name="feedback_type"
                onChange={(event) => setFeedbackDraftType(event.target.value as FounderFeedback["feedback_type"])}
                value={feedbackDraftType}
              >
                {(["Bug", "Confusing", "Feature request", "Payment interest", "General"] as FounderFeedback["feedback_type"][]).map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              Page or area
              <input name="area" placeholder="Example: challenge rooms, profile, payments..." />
            </label>
            <label className="wide">
              Message
              <textarea name="message" placeholder="What happened, what confused you, or what should Talent7 build next?" rows={4} />
            </label>
            <button disabled={savingFeedback} type="submit">
              {savingFeedback ? "Sending feedback..." : "Send feedback"}
            </button>
          </form>
        ) : (
          <div className="emptyState">
            <strong>Log in to send feedback.</strong>
            <a href="#account">Go to account</a>
          </div>
        )}
        <div className="feedbackInbox">
          <div className="feedbackInboxHeader">
            <div>
              <p className="eyebrow">{isOwnerReviewer ? "Owner feedback" : "My feedback"}</p>
              <h3>{isOwnerReviewer ? "Founder feedback dashboard" : "Submitted feedback"}</h3>
            </div>
            <small>{founderFeedback.length} shown</small>
          </div>
          {founderFeedback.length > 0 ? (
            <div className="feedbackList">
              {founderFeedback.slice(0, 12).map((feedback) => (
                <article key={feedback.id}>
                  <span>{feedback.feedback_type}</span>
                  <strong>{feedback.area || "General app feedback"}</strong>
                  <p>{feedback.message}</p>
                  <div className="feedbackMeta">
                    <small>{feedback.display_name}</small>
                    <small>{feedback.status}</small>
                    <small>{new Date(feedback.created_at).toLocaleDateString()}</small>
                  </div>
                  {isOwnerReviewer && (
                    <div className="feedbackActions">
                      {(["New", "Reviewed", "Planned", "Closed"] as FounderFeedback["status"][]).map((status) => (
                        <button
                          className={feedback.status === status ? "active" : ""}
                          disabled={
                            feedbackActionKey === `${feedback.id}-${status}` ||
                            feedback.status === status
                          }
                          key={status}
                          onClick={() => updateFounderFeedbackStatus(feedback, status)}
                          type="button"
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="emptyFeedback">
              <strong>No feedback yet.</strong>
              <small>Feedback from launch-wave users will appear here.</small>
            </div>
          )}
        </div>
      </section>

      {isOwnerReviewer && (
        <section className="section launchControlSection" id="launch-control">
          <div className="sectionHeader">
            <p className="eyebrow">Owner command center</p>
            <h2>Founder launch control</h2>
            <p>One private place to check Play Store launch readiness, review what needs attention, and copy updates for social posts.</p>
          </div>
          <div className="launchControlPanel">
            <div className="launchHeader">
              <div>
                <p className="eyebrow">Readiness</p>
                <h3>{launchControl.readinessPercent}% ready for Play Store launch path</h3>
                <small>Based on domain, launch-wave interest, Google Play closed-test gate, room activity, safety, feedback, and payment signals.</small>
              </div>
              <strong>{launchControl.checklist.filter((item) => item.done).length} / {launchControl.checklist.length}</strong>
            </div>
            <div className="launchStats">
              <article>
                <span>Profiles</span>
                <strong>{publicProfiles.length}</strong>
                <small>People with Talent7 identities</small>
              </article>
              <article>
                <span>First wave</span>
                <strong>{firstWaveInterests.length}</strong>
                <small>{launchControl.activeFirstWave.length} / {launchControl.googlePlayClosedTestTarget} active for Google Play</small>
              </article>
              <article>
                <span>Rooms</span>
                <strong>{challenges.length}</strong>
                <small>{launchControl.openChallenges.length} open, {launchControl.completedChallenges.length} completed</small>
              </article>
              <article>
                <span>Safety</span>
                <strong>{adminModeration.openReports.length}</strong>
                <small>Open reports</small>
              </article>
              <article>
                <span>Feedback</span>
                <strong>{launchControl.newFeedback.length}</strong>
                <small>New items waiting</small>
              </article>
              <article>
                <span>Payment signals</span>
                <strong>{paymentInterests.length}</strong>
                <small>{launchControl.contributionInterest.length} contribution interests</small>
              </article>
            </div>
            <div className="launchChecklist">
              {launchControl.checklist.map((item) => (
                <article className={item.done ? "done" : ""} key={item.title}>
                  <span>{item.done ? "Done" : "Check"}</span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </article>
              ))}
            </div>
            <div className="launchQaPanel">
              <div className="launchQaHeader">
                <div>
                  <p className="eyebrow">Before Play Store submission</p>
                  <h3>Manual launch QA checklist</h3>
                  <small>Tick these after you personally test them on the live site and prepare the Play Console release path.</small>
                </div>
                <strong>{launchQaProgress} / {launchQaChecklist.length}</strong>
              </div>
              <div className="launchQaGrid">
                {launchQaChecklist.map((item) => {
                  const done = launchQaDoneKeys.includes(item.key);

                  return (
                    <button
                      className={done ? "done" : ""}
                      key={item.key}
                      onClick={() => toggleLaunchQaItem(item.key)}
                      type="button"
                    >
                      <span>{done ? "Tested" : "Test"}</span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="playStorePanel">
              <div className="launchQaHeader">
                <div>
                  <p className="eyebrow">Google Play Console</p>
                  <h3>Production access checklist</h3>
                  <small>Use this private list while you fill Play Console and run the closed-test gate.</small>
                </div>
                <strong>{playStoreProgress} / {playStoreChecklist.length}</strong>
              </div>
              <div className="playStoreProgress">
                <span style={{ width: `${Math.round((playStoreProgress / playStoreChecklist.length) * 100)}%` }} />
              </div>
              <div className="playStoreGrid">
                {playStoreChecklist.map((item) => {
                  const done = playStoreDoneKeys.includes(item.key);

                  return (
                    <button
                      className={done ? "done" : ""}
                      key={item.key}
                      onClick={() => togglePlayStoreItem(item.key)}
                      type="button"
                    >
                      <span>{done ? "Done" : "Todo"}</span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="launchNextActions">
              <article>
                <p className="eyebrow">Next actions</p>
                <h3>Do these before Play Store production</h3>
                <a href="#first-wave">Review first-wave launch group</a>
                <a href="#safety">Check safety reports</a>
                <a href="#feedback">Review founder feedback</a>
                <a href="#rooms">Check challenge rooms</a>
              </article>
              <article>
                <p className="eyebrow">Copy update</p>
                <h3>Launch sharing tools</h3>
                <p>
                  Talent7 is preparing for Play Store launch at jointalent7.com. Current build: {challenges.length} challenge rooms,
                  {" "}{publicProfiles.length} talent profiles, {proofs.length} proof uploads, and {firstWaveInterests.length} first-wave launch signups.
                </p>
                <button onClick={copyLaunchUpdate} type="button">Copy launch update</button>
                <button
                  onClick={() =>
                    copyShareText(
                      "Instagram caption",
                      `Talent7 is preparing for Play Store launch.\n\nChallenge rooms, public 7-star ratings, victory proof, teams, coaching, and expert-help previews are ready for the first launch wave.\n\nJoin the first wave: ${siteUrl("#first-wave")}\n\n#Talent7 #ChallengeRooms #TalentShowcase #SportsChallenge #Breakdance #Gaming`
                    )
                  }
                  type="button"
                >
                  Copy Instagram caption
                </button>
                <button
                  onClick={() =>
                    copyShareText(
                      "YouTube description",
                      `Talent7 is preparing for Play Store launch as a proof-based talent, sports, and gaming challenge app. Users can create rooms, join as challenger or audience, vote winners, rate out of 7, upload proof, form teams, request coaching, and join the first launch wave.\n\nTry Talent7: ${siteUrl()}\nJoin first wave: ${siteUrl("#first-wave")}`
                    )
                  }
                  type="button"
                >
                  Copy YouTube description
                </button>
                <button
                  onClick={() =>
                    copyShareText(
                      "Direct invite",
                      `I am preparing Talent7 for Play Store launch. You can join challenges, vote, rate out of 7, upload proof, form teams, or try coaching/expert-help previews.\n\nStart here: ${siteUrl()}`
                    )
                  }
                  type="button"
                >
                  Copy direct invite
                </button>
              </article>
            </div>
          </div>
        </section>
      )}

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
            <strong>Profiles, coaching, sports links, and live previews</strong>
            <p>Improve public profiles, coaching flows, sports booking links, and the planned two-screen live battle experience.</p>
          </article>
          <article>
            <span>Later</span>
            <strong>Live battles and expert help</strong>
            <p>Add two-screen live challenge battles, real payments, instructor tools, and carefully designed emergency/expert video help.</p>
          </article>
        </div>
      </section>

      <section className="section trustTermsSection" id="trust-terms">
        <div className="sectionHeader">
          <p className="eyebrow">Trust & terms</p>
          <h2>Clear rules before real users arrive</h2>
          <p>
            These are simple MVP trust notes for launch-wave users. They are not a replacement for lawyer-reviewed terms,
            but they make Talent7's boundaries clear while the app is still growing.
          </p>
        </div>
        <div className="trustTermsGrid">
          <article>
            <span>Terms</span>
            <strong>Use Talent7 fairly</strong>
            <p>Create honest challenge rooms, respect other users, avoid spam, and do not use Talent7 to harass, threaten, or pressure anyone.</p>
          </article>
          <article>
            <span>Privacy</span>
            <strong>Use a sensible public profile</strong>
            <p>Your public name, username, role, region, posts, rooms, comments, and ratings may be visible. Do not post private information you do not want shared.</p>
          </article>
          <article>
            <span>Uploads</span>
            <strong>Only share content you can use</strong>
            <p>Upload photos, videos, screenshots, and links you own or have permission to share. Fake proof and misleading victory claims can be reported.</p>
          </article>
          <article>
            <span>Sports</span>
            <strong>Meet safely and follow venue rules</strong>
            <p>Talent7 does not run courts, pools, gyms, or events yet. Check local rules, safety, costs, and permissions before recording or playing.</p>
          </article>
          <article>
            <span>Medical caution</span>
            <strong>Emergency services come first</strong>
            <p>Expert help is guidance only. For medical emergencies, danger, serious injury, or urgent risk, contact local emergency services first.</p>
          </article>
          <article>
            <span>Payments</span>
            <strong>Payments are not live yet</strong>
            <p>Plans and contribution ranges show future interest only. No paid checkout is active until a real payment provider is added and clearly shown.</p>
          </article>
        </div>
        <div className="trustContactBox">
          <div>
            <p className="eyebrow">Contact</p>
            <h3>Questions, reports, or permission requests</h3>
            <p>Use Founder Feedback inside the app, or contact the Talent7 founder email if something needs direct attention.</p>
          </div>
          <a href="/privacy">Privacy Policy</a>
          <a href="/delete-account">Delete account</a>
          <a href="/support">Support</a>
          <a href="/child-safety">Child safety standards</a>
          <a href="mailto:jointalent7@gmail.com">jointalent7@gmail.com</a>
          <a href="#feedback">Open founder feedback</a>
          <a href="#safety">Open safety reports</a>
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
              <button
                onClick={() => {
                  setSelectedProfile(null);
                  if (window.location.hash.startsWith("#profile-")) {
                    window.history.replaceState(null, "", window.location.pathname);
                  }
                }}
                type="button"
              >
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
              <button onClick={() => copyProfileLink(selectedProfile)} type="button">
                Copy profile link
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
                  <button onClick={() => copyProfileLink(item)} type="button">
                    Copy link
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
          <h2>Your dashboard</h2>
          <p>One place for your challenge rooms, teams, posts, reports, invites, and next actions.</p>
        </div>
        {session ? (
          <div className="dashboardShell">
            <div className="onboardingChecklist">
              <div className="onboardingHeader">
                <div>
                  <p className="eyebrow">Get started</p>
                  <h3>New user checklist</h3>
                  <small>{completedOnboardingSteps} of {onboardingSteps.length} completed</small>
                </div>
                <strong>{Math.round((completedOnboardingSteps / onboardingSteps.length) * 100)}%</strong>
              </div>
              <div className="onboardingProgress">
                <span style={{ width: `${(completedOnboardingSteps / onboardingSteps.length) * 100}%` }} />
              </div>
              <div className="onboardingStepGrid">
                {onboardingSteps.map((step) => (
                  <article className={step.done ? "done" : ""} key={step.title}>
                    <span>{step.done ? "Done" : "Next"}</span>
                    <strong>{step.title}</strong>
                    <small>{step.detail}</small>
                    <a href={step.href}>{step.done ? "View" : "Start"}</a>
                  </article>
                ))}
              </div>
            </div>
            <div className="dashboardActions">
              <a href="#create">Create challenge</a>
              <a href="#showcase">Post showcase</a>
              <a href="#teams">Teams</a>
              <a href="#notifications">Notifications</a>
              <a href="#safety">Safety reports</a>
            </div>
            <div className="myTalentGrid">
              <article>
                <span>Rooms</span>
                <strong>{myDashboard.rooms.length}</strong>
                <small>{myDashboard.rooms[0]?.challenge.title || "No rooms yet"}</small>
              </article>
              <article>
                <span>Teams</span>
                <strong>{myDashboard.teamCount}</strong>
                <small>{myDashboard.pendingTeamRequests} pending team action{myDashboard.pendingTeamRequests === 1 ? "" : "s"}</small>
              </article>
              <article>
                <span>Showcase posts</span>
                <strong>{myDashboard.posts.length}</strong>
                <small>{myDashboard.posts[0]?.caption || "No posts yet"}</small>
              </article>
              <article>
                <span>Reports</span>
                <strong>{myDashboard.reports.length}</strong>
                <small>{myDashboard.reports[0]?.status || "No submitted reports"}</small>
              </article>
              <article>
                <span>Invites</span>
                <strong>{myDashboard.pendingInvites.length}</strong>
                <small>{myDashboard.pendingInvites[0] ? challengeTitle(myDashboard.pendingInvites[0].challenge_id) : "No pending invites"}</small>
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
            <div className="dashboardPanels">
              <article>
                <div>
                  <span>My rooms</span>
                  <a href="#rooms">View all rooms</a>
                </div>
                {myDashboard.rooms.length > 0 ? (
                  myDashboard.rooms.map((item) => (
                    <a
                      className="dashboardRow"
                      href={`#${roomHash(item.challenge.id)}`}
                      key={item.challenge.id}
                      onClick={() => {
                        setSelectedLane("All");
                        setSelectedStatus("All");
                        setRoomSearch("");
                        setHighlightedChallengeId(item.challenge.id);
                        window.setTimeout(() => setHighlightedChallengeId(null), 2600);
                      }}
                    >
                      <strong>{item.challenge.title}</strong>
                      <small>{item.label} / {item.detail}</small>
                    </a>
                  ))
                ) : (
                  <small>No challenge rooms yet.</small>
                )}
              </article>
              <article>
                <div>
                  <span>My teams</span>
                  <a href="#teams">Open teams</a>
                </div>
                {myTeamDashboard.owned.slice(0, 3).map((team) => (
                  <a className="dashboardRow" href="#teams" key={team.id}>
                    <strong>{team.name}</strong>
                    <small>Owner / {team.team_type} / {team.region}</small>
                  </a>
                ))}
                {myTeamDashboard.accepted.slice(0, 3).map((request) => (
                  <a className="dashboardRow" href="#teams" key={request.id}>
                    <strong>{request.team?.name || "Team"}</strong>
                    <small>Member / {request.member_role || "Player"}</small>
                  </a>
                ))}
                {myDashboard.teamCount === 0 && <small>No teams yet.</small>}
              </article>
              <article>
                <div>
                  <span>My showcase</span>
                  <a href="#showcase">Open showcase</a>
                </div>
                {myDashboard.posts.length > 0 ? (
                  myDashboard.posts.map((post) => (
                    <a className="dashboardRow" href="#showcase" key={post.id}>
                      <strong>{post.category}</strong>
                      <small>{post.caption}</small>
                    </a>
                  ))
                ) : (
                  <small>No showcase posts yet.</small>
                )}
              </article>
              <article>
                <div>
                  <span>My reports</span>
                  <a href="#safety">Open safety</a>
                </div>
                {myDashboard.reports.length > 0 ? (
                  myDashboard.reports.map((report) => (
                    <a className="dashboardRow" href="#safety" key={report.id}>
                      <strong>{report.title}</strong>
                      <small>{report.reason} / {report.status}</small>
                    </a>
                  ))
                ) : (
                  <small>No submitted reports yet.</small>
                )}
              </article>
              <article>
                <div>
                  <span>My invites</span>
                  <a href="#invites">Open invites</a>
                </div>
                {myDashboard.pendingInvites.length > 0 ? (
                  myDashboard.pendingInvites.map((invite) => (
                    <a className="dashboardRow" href="#invites" key={invite.id}>
                      <strong>{challengeTitle(invite.challenge_id)}</strong>
                      <small>{invite.status} invite for {invite.invited_name}</small>
                    </a>
                  ))
                ) : (
                  <small>No pending invites.</small>
                )}
              </article>
            </div>
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
              {challengeActivityOptions.map((interest) => (
                <option key={interest}>{interest}</option>
              ))}
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
                @{selectedActivityProfile.username} Â· {selectedActivityProfile.main_interest || "No interest yet"}
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
            const messages = roomMessages[challenge.id] || [];

            return (
            <article
              className={`roomCard ${challenge.id === createdChallengeId ? "newRoom" : ""} ${
                challenge.id === highlightedChallengeId ? "highlightRoom" : ""
              }`}
              id={roomHash(challenge.id)}
              key={challenge.id}
            >
              <span>{challenge.lane}</span>
              {challenge.id === createdChallengeId && <em>New challenge</em>}
              <h3>{challenge.title}</h3>
              <button className="roomLinkButton" onClick={() => copyRoomLink(challenge)} type="button">
                Copy room link
              </button>
              {canEditChallenge(challenge) && (
                <details className="editPanel roomEditPanel">
                  <summary>Edit room</summary>
                  <form onSubmit={(event) => updateChallengeDetails(event, challenge)}>
                    <label>
                      Challenge title
                      <input name="title" defaultValue={challenge.title} />
                    </label>
                    <label>
                      Lane
                      <select name="lane" defaultValue={challenge.lane}>
                        <option>Talent battle</option>
                        <option>Sports challenge</option>
                        <option>Mobile gaming challenge</option>
                      </select>
                    </label>
                    <label>
                      Team or challenger A
                      <input name="team_a" defaultValue={challenge.team_a} />
                    </label>
                    <label>
                      Team or challenger B
                      <input name="team_b" defaultValue={challenge.team_b} />
                    </label>
                    <label className="wide">
                      Rules
                      <textarea name="rules" defaultValue={challenge.rules} rows={3} />
                    </label>
                    <label>
                      Venue or booking note
                      <input name="venue_name" defaultValue={challenge.venue_name || ""} />
                    </label>
                    <label>
                      Booking link
                      <input name="booking_url" defaultValue={challenge.booking_url || ""} />
                    </label>
                    <label>
                      Sport / venue type
                      <select name="sport_type" defaultValue={challenge.sport_type || "Badminton doubles"}>
                        {challengeActivityOptions.map((interest) => (
                          <option key={interest}>{interest}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Booking region
                      <input name="booking_region" defaultValue={challenge.booking_region || ""} />
                    </label>
                    <button disabled={editingChallengeId === challenge.id} type="submit">
                      {editingChallengeId === challenge.id ? "Saving..." : "Save room"}
                    </button>
                  </form>
                </details>
              )}
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
                      <small>Optional: photos/screenshots up to 10 MB, videos up to 50 MB.</small>
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
                        {canDeleteUserContent(proof.user_id) && (
                          <>
                            <details className="editPanel proofEditPanel">
                              <summary>Edit proof</summary>
                              <form onSubmit={(event) => updateProofNote(event, proof)}>
                                <label>
                                  Proof type
                                  <select name="proof_type" defaultValue={proof.proof_type || "Video"}>
                                    <option>Photo</option>
                                    <option>Video</option>
                                    <option>Screenshot</option>
                                    <option>Match link</option>
                                  </select>
                                </label>
                                <label className="wide">
                                  Proof link
                                  <input name="proof_url" defaultValue={proof.proof_url} />
                                </label>
                                <label className="wide">
                                  Proof note
                                  <textarea name="notes" defaultValue={proof.notes || ""} rows={2} />
                                </label>
                                <button disabled={editingProofId === proof.id} type="submit">
                                  {editingProofId === proof.id ? "Saving..." : "Save proof"}
                                </button>
                              </form>
                            </details>
                            <button
                              className="dangerAction"
                              disabled={deletingProofId === proof.id}
                              onClick={() => deleteProof(proof)}
                              type="button"
                            >
                              {deletingProofId === proof.id ? "Deleting..." : "Delete proof"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="roomChat">
                <div className="roomChatHeader">
                  <div>
                    <strong>Room chat</strong>
                    <small>{roomChatHint(challenge)}</small>
                  </div>
                  <span>{messages.length} message{messages.length === 1 ? "" : "s"}</span>
                </div>
                {canUseRoomChat(challenge) && !isChallengeCompleted(challenge) && (
                  <form className="roomChatForm" onSubmit={(event) => sendChallengeMessage(event, challenge)}>
                    <input
                      maxLength={280}
                      name="body"
                      placeholder="Example: I reached, are you there, upload proof after match..."
                    />
                    <button disabled={sendingChatChallengeId === challenge.id} type="submit">
                      {sendingChatChallengeId === challenge.id ? "Sending..." : "Send"}
                    </button>
                  </form>
                )}
                <div className="roomChatMessages">
                  {messages.length > 0 ? (
                    messages.slice(0, 20).map((chatMessage) => (
                      <div className="roomChatMessage" key={chatMessage.id}>
                        <div>
                          <strong>{chatMessage.author_name}</strong>
                          <small>{new Date(chatMessage.created_at).toLocaleDateString()}</small>
                        </div>
                        <p>{chatMessage.body}</p>
                        <button
                          disabled={reportingChatMessageId === chatMessage.id}
                          onClick={() => reportChallengeMessage(chatMessage, challenge)}
                          type="button"
                        >
                          {reportingChatMessageId === chatMessage.id ? "Reporting..." : "Report"}
                        </button>
                      </div>
                    ))
                  ) : (
                    <small>No room messages yet.</small>
                  )}
                  {messages.length > 20 && <small>Showing latest 20 messages.</small>}
                </div>
              </div>
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
              <a
                href={`#${roomHash(item.challenge.id)}`}
                onClick={() => {
                  setSelectedLane("All");
                  setSelectedStatus("All");
                  setRoomSearch("");
                  setHighlightedChallengeId(item.challenge.id);
                  window.setTimeout(() => setHighlightedChallengeId(null), 2600);
                }}
              >
                Open room
              </a>
            </article>
          ))}
        </div>
      </section>
      <footer className="siteFooter">
        <div>
          <strong>Talent7</strong>
          <p>Proof-based challenge rooms, public 7-star ratings, teams, coaching, and expert-help previews.</p>
        </div>
        <nav>
          <a href="#account">Account</a>
          <a href="#first-wave">First wave</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/delete-account">Delete account</a>
          <a href="/support">Support</a>
          <a href="/child-safety">Child safety</a>
          <a href="#trust-terms">Trust & terms</a>
          <a href="#safety">Safety</a>
          <a href="#feedback">Feedback</a>
          <a href="mailto:jointalent7@gmail.com">Contact</a>
        </nav>
        <div className="footerSocials">
          <span>jointalent7.com</span>
          <span>@jointalent7</span>
          <span>YouTube: jointalent7</span>
        </div>
      </footer>
      {showBackToTop ? (
        <button className="backToTopButton" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          Back to top
        </button>
      ) : null}
    </main>
  );
}

