"use client";

import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { trackGrowthEvent } from "../lib/growth-analytics";
import type { SupporterTier } from "../lib/supporter-products";
import ChallengeLiveRoom from "./challenge-live-room";
import GrowthHub from "./growth-hub";
import SupporterPayments from "./supporter-payments";
import TurnstileWidget from "./turnstile-widget";

type ChallengeLane = "Talent battle" | "Sports challenge" | "Mobile gaming challenge";
type ChallengeStatusFilter = "All" | "Open" | "Completed" | "Saved";
type RoomDiscoveryMode = "Live" | "Trending" | "For you" | "Newest";
type ChallengeVotingStatus = "Closed" | "Open";
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
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
const roomPageSize = 6;
const profilePageSize = 8;
const feedPageSize = 8;
const notificationPageSize = 10;
const opponentPageSize = 8;
const sharedIntentStorageKey = "talent7-shared-intent";

function sharedIntentSearch(search = "") {
  const source = new URLSearchParams(search);
  const target = new URLSearchParams();
  const profileToken = source.get("profile");
  const teamToken = source.get("team");
  const inviteToken = source.get("invite");

  if (profileToken) {
    target.set("profile", profileToken);
    target.set("intent", source.get("intent") === "follow" ? "follow" : "challenge");
  } else if (teamToken) {
    target.set("team", teamToken);
    target.set("intent", source.get("intent") === "join" ? "join" : "challenge");
  } else if (inviteToken) {
    target.set("invite", inviteToken);
  }

  return target.toString();
}
const athleticsIndividualEvents = [
  "100 m sprint",
  "200 m sprint",
  "400 m sprint",
  "800 m run",
  "1200 m run (youth)",
  "1500 m run",
  "3000 m run",
  "5000 m run",
  "10,000 m run",
  "100 m hurdles",
  "110 m hurdles",
  "400 m hurdles",
  "3000 m steeplechase",
  "3 km road race",
  "5 km road race",
  "10 km road race",
  "Half marathon – 21.0975 km",
  "Marathon – 42.195 km",
  "Shot put",
  "Javelin throw",
  "Discus throw",
  "Hammer throw",
  "High jump",
  "Long jump",
  "Triple jump",
  "Pole vault"
];
const athleticsRelayEvents = ["4 × 100 m relay", "4 × 400 m relay"];
const challengeActivityGroups = [
  {
    label: "Popular challenges",
    options: ["Badminton doubles", "Badminton singles", "Breakdance battle", "Rap battle", "PUBG squad battle"]
  },
  {
    label: "Sports and fitness",
    options: [
      "Swimming race",
      "Volleyball match",
      "Football match",
      "Cricket match",
      "Basketball match",
      "Skating challenge",
      "Arm wrestling",
      "Karate sparring",
      "Bouldering challenge",
      "Calisthenics",
      "Gym / fitness",
      "Table tennis",
      "Tennis match",
      "Boxing challenge",
      "Kickboxing",
      "Martial arts challenge",
      "Cycling challenge",
      "Parkour challenge",
      "Yoga challenge"
    ]
  },
  {
    label: "Athletics events",
    options: [
      ...athleticsIndividualEvents,
      ...athleticsRelayEvents,
      "Running race",
      "Athletics challenge"
    ]
  },
  {
    label: "Gaming and strategy",
    options: ["Mech Arena challenge", "PUBG gaming", "Chess match"]
  },
  {
    label: "Performance and creative",
    options: ["Dance battle", "Singing battle", "Music performance", "Art challenge"]
  },
  {
    label: "More",
    options: ["Team tournament", "Sports coaching", "Expert help", "Other talent showcase"]
  }
];
const challengeActivityOptions = challengeActivityGroups.flatMap((group) => group.options);
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

type PrimaryTabId = "settings" | "challenges" | "listen";
type MoreTabId = "teams" | "profiles" | "notifications" | "feed" | "invites" | "safety" | "plans" | "feedback" | "roadmap";
type AppTabId = PrimaryTabId | MoreTabId;
type NoticeTone = "success" | "error" | "warning" | "info";
type ColorTheme = "light" | "dark";

type AppNotice = {
  id: number;
  text: string;
  tone: NoticeTone;
  duration: number;
};

type ConfirmationRequest = {
  title: string;
  detail: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
};

let noticeSequence = 0;

function noticeToneForMessage(text: string): NoticeTone {
  const normalized = text.toLowerCase();
  const errorStarts = [
    "could not",
    "copy failed",
    "please ",
    "only ",
    "you cannot",
    "this challenge is completed",
    "enter ",
    "add ",
    "choose ",
    "paste ",
    "write ",
    "log in",
    "connect supabase",
    "that username",
    "a session time must",
    "confirm the session"
  ];

  if (errorStarts.some((prefix) => normalized.startsWith(prefix)) || normalized.includes(" error")) return "error";
  if (
    normalized.startsWith("demo mode") ||
    normalized.startsWith("preview mode") ||
    normalized.includes("not connected") ||
    normalized.includes("read-only")
  ) return "warning";
  if (
    normalized.includes(" saved") ||
    normalized.includes("created") ||
    normalized.includes("updated") ||
    normalized.includes("sent") ||
    normalized.includes("copied") ||
    normalized.includes("joined") ||
    normalized.includes("following") ||
    normalized.includes("deleted") ||
    normalized.includes("completed") ||
    normalized.includes("recorded") ||
    normalized.includes("published") ||
    normalized.includes("accepted") ||
    normalized.includes("submitted") ||
    normalized.includes("added") ||
    normalized.includes("logged in") ||
    normalized.includes("logged out") ||
    normalized.includes("on the talent7")
  ) {
    return "success";
  }

  return "info";
}

function noticeDuration(tone: NoticeTone) {
  if (tone === "success") return 4000;
  if (tone === "warning") return 6500;
  if (tone === "error") return 9000;
  return 4500;
}

function noticeTitle(tone: NoticeTone) {
  if (tone === "success") return "Done";
  if (tone === "warning") return "Please note";
  if (tone === "error") return "Needs attention";
  return "Talent7 update";
}

function noticeIcon(tone: NoticeTone) {
  if (tone === "success") return "✓";
  if (tone === "warning") return "!";
  if (tone === "error") return "×";
  return "i";
}

function readableAuthError(error: unknown, fallback: string) {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
  const normalized = message.trim();

  if (!normalized || normalized === "{}" || normalized === "[object Object]") return fallback;
  return normalized;
}

function AppToast({ notice, onDismiss }: { notice: AppNotice; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timeout = window.setTimeout(() => onDismiss(notice.id), notice.duration);
    return () => window.clearTimeout(timeout);
  }, [notice.duration, notice.id, onDismiss, paused]);

  return (
    <aside
      aria-atomic="true"
      aria-live={notice.tone === "error" ? "assertive" : "polite"}
      className={`appToast appToast-${notice.tone}`}
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role={notice.tone === "error" ? "alert" : "status"}
    >
      <span className="appToastIcon" aria-hidden="true">{noticeIcon(notice.tone)}</span>
      <div className="appToastCopy">
        <strong>{noticeTitle(notice.tone)}</strong>
        <span>{notice.text}</span>
      </div>
      <button aria-label="Dismiss notification" onClick={() => onDismiss(notice.id)} type="button">×</button>
      <span
        aria-hidden="true"
        className="appToastProgress"
        style={{ animationDuration: `${notice.duration}ms`, animationPlayState: paused ? "paused" : "running" }}
      />
    </aside>
  );
}

function AppStatePanel({
  tone = "empty",
  title,
  detail,
  actionLabel,
  actionHref,
  onAction
}: {
  tone?: "empty" | "error" | "loading" | "success";
  title: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  const icon = tone === "error" ? "!" : tone === "loading" ? "…" : tone === "success" ? "✓" : "+";

  return (
    <div className={`appStatePanel ${tone}`} role={tone === "empty" ? undefined : tone === "error" ? "alert" : "status"}>
      <span className="appStateIcon" aria-hidden="true">{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      {actionLabel && actionHref && <a href={actionHref}>{actionLabel}</a>}
      {actionLabel && !actionHref && onAction && <button onClick={onAction} type="button">{actionLabel}</button>}
    </div>
  );
}

type MobileNavIconName = "settings" | "challenges" | "notifications" | "listen" | "more";

function MobileNavIcon({ name }: { name: MobileNavIconName }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      {name === "settings" && (
        <>
          <path d="M4 7h10M20 7h-2M4 17h2M10 17h10M4 12h4M12 12h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="8" cy="17" r="2" />
          <circle cx="10" cy="12" r="2" />
        </>
      )}
      {name === "challenges" && (
        <>
          <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
          <path d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 12v6M8 20h8" />
        </>
      )}
      {name === "notifications" && (
        <>
          <path d="M18 9a6 6 0 0 0-12 0c0 6-3 6-3 8h18c0-2-3-2-3-8Z" />
          <path d="M10 21h4" />
        </>
      )}
      {name === "listen" && (
        <>
          <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
          <path d="M4 13h3v7H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 1-2ZM20 13h-3v7h2a2 2 0 0 0 2-2v-3a2 2 0 0 0-1-2Z" />
        </>
      )}
      {name === "more" && (
        <>
          <circle cx="5" cy="12" fill="currentColor" r="1.6" stroke="none" />
          <circle cx="12" cy="12" fill="currentColor" r="1.6" stroke="none" />
          <circle cx="19" cy="12" fill="currentColor" r="1.6" stroke="none" />
        </>
      )}
    </svg>
  );
}

const primaryTabs: {
  id: PrimaryTabId;
  label: string;
  firstSection: string;
  links: { label: string; href: string }[];
}[] = [
  {
    id: "settings",
    label: "Settings",
    firstSection: "account",
    links: [
      { label: "Settings", href: "#account" },
      { label: "Dashboard", href: "#my-talent7" },
      { label: "First wave", href: "#first-wave" }
    ]
  },
  {
    id: "challenges",
    label: "Challenges",
    firstSection: "rooms",
    links: [
      { label: "Rooms", href: "#rooms" },
      { label: "Find opponents", href: "#opponents" },
      { label: "Create", href: "#create" },
      { label: "Leaderboard", href: "#leaderboard" }
    ]
  },
  {
    id: "listen",
    label: "Listen",
    firstSection: "listen-rooms",
    links: [{ label: "Listen rooms", href: "#listen-rooms" }]
  }
];

const moreTabs: { id: MoreTabId; label: string; href: string; description: string }[] = [
  { id: "teams", label: "Teams", href: "#teams", description: "Squads, crews, and requests" },
  { id: "profiles", label: "Profiles", href: "#profiles", description: "Discover Talent7 people" },
  { id: "notifications", label: "Notifications", href: "#notifications", description: "Updates that need attention" },
  { id: "feed", label: "Feed", href: "#following-feed", description: "Activity from people you follow" },
  { id: "invites", label: "Invites", href: "#invites", description: "Challenge invitations" },
  { id: "safety", label: "Safety", href: "#safety", description: "Reports, trust, and terms" },
  { id: "plans", label: "Plans", href: "#plans", description: "Plans and founder support" },
  { id: "feedback", label: "Feedback", href: "#feedback", description: "Send and review feedback" },
  { id: "roadmap", label: "Roadmap", href: "#roadmap", description: "Launch progress and what is next" }
];

const moreTabGroups: Array<{
  label: string;
  description: string;
  tabIds: MoreTabId[];
}> = [
  {
    label: "Community",
    description: "People, teams, conversations, and invitations",
    tabIds: ["teams", "profiles", "feed", "invites"]
  },
  {
    label: "Account & support",
    description: "Updates, plans, and direct feedback",
    tabIds: ["notifications", "plans", "feedback"]
  },
  {
    label: "Trust & product",
    description: "Safety controls and the Talent7 roadmap",
    tabIds: ["safety", "roadmap"]
  }
];

const sectionTabMap: Record<string, AppTabId> = {
  "first-wave": "settings",
  account: "settings",
  "my-talent7": "settings",
  create: "challenges",
  rooms: "challenges",
  opponents: "challenges",
  leaderboard: "challenges",
  "listen-rooms": "listen",
  teams: "teams",
  profiles: "profiles",
  notifications: "notifications",
  "following-feed": "feed",
  invites: "invites",
  safety: "safety",
  "trust-terms": "safety",
  plans: "plans",
  feedback: "feedback",
  roadmap: "roadmap",
  "launch-control": "roadmap"
};

function isLegacyFutureRoute(hash: string) {
  const target = hash.replace(/^#/, "");
  return target === "showcase" || target.startsWith("showcase-") || target === "coaching" || target === "expert-help";
}

function tabForHash(hash: string): AppTabId | null {
  const target = hash.replace(/^#/, "");
  if (isLegacyFutureRoute(hash)) return "plans";
  if (target.startsWith("profile-")) return "profiles";
  if (target.startsWith("room-")) return "challenges";
  if (target.startsWith("team-")) return "teams";
  return sectionTabMap[target] || null;
}

function sectionForHash(hash: string): string | null {
  const target = hash.replace(/^#/, "");
  if (isLegacyFutureRoute(hash)) return "plans";
  if (target.startsWith("profile-")) return "profiles";
  if (target.startsWith("room-")) return "rooms";
  if (target.startsWith("team-")) return "teams";
  return sectionTabMap[target] ? target : null;
}

type ListenMood = "Chill" | "Workout" | "Focus" | "Romantic" | "Party" | "Road trip" | "Study" | "Open vibe";
type ListenRoomStatus = "Open" | "Archived";
type ListenRoomVisibility = "Public" | "Private";

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
  status: ListenRoomStatus;
  visibility?: ListenRoomVisibility;
  room_code?: string | null;
  requires_passcode?: boolean;
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
  visibility: ListenRoomVisibility;
  passcode: string;
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
  current_track_url: "",
  visibility: "Public",
  passcode: ""
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
    status: "Open",
    created_at: "2026-07-17T00:00:00.000Z"
  }
];

const sampleListenTracks: ListenTrack[] = [];
const listenRoomsStorageKey = "talent7-listen-rooms";
const listenTracksStorageKey = "talent7-listen-tracks";
const colorThemeStorageKey = "talent7-color-theme";
const listenRoomPublicColumns =
  "id,created_by,title,host_name,mood,room_note,current_track_title,current_track_url,listener_count,love_count,vibe_count,status,visibility,room_code,requires_passcode,created_at,updated_at";
const roomViewerStorageKey = "talent7-room-viewer-id";

function makeLocalListenId(prefix = "listen") {
  return `${prefix}-${crypto.randomUUID()}`;
}

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
  match_format?: MatchFormat | null;
  roster_size?: number | null;
  voting_status?: ChallengeVotingStatus;
  voting_opened_at?: string | null;
  voting_closes_at?: string | null;
  voting_closed_at?: string | null;
  voting_updated_by?: string | null;
  result_share_token?: string | null;
  room_share_token?: string | null;
  created_at: string;
};

type MatchFormat = "Singles" | "Doubles" | "Team";

type ActivityMatchConfig = {
  formats: MatchFormat[];
  defaultFormat: MatchFormat;
  defaultRosterSize: number;
  teamRosterFlexible: boolean;
};

function activityMatchConfig(activity: string): ActivityMatchConfig {
  const normalized = activity.toLowerCase().trim();
  const fixed = (defaultFormat: MatchFormat, defaultRosterSize: number): ActivityMatchConfig => ({
    formats: [defaultFormat],
    defaultFormat,
    defaultRosterSize,
    teamRosterFlexible: false
  });
  const flexible = (
    formats: MatchFormat[],
    defaultFormat: MatchFormat,
    defaultRosterSize: number
  ): ActivityMatchConfig => ({ formats, defaultFormat, defaultRosterSize, teamRosterFlexible: formats.includes("Team") });

  if (normalized.includes("badminton doubles")) return fixed("Doubles", 2);
  if (normalized.includes("badminton singles")) return fixed("Singles", 1);
  if (normalized.includes("volleyball")) return fixed("Team", 6);
  if (normalized.includes("football") || normalized.includes("cricket")) return fixed("Team", 11);
  if (normalized.includes("basketball")) return fixed("Team", 5);
  if (normalized.includes("pubg squad")) return fixed("Team", 4);
  if (normalized.includes("mech arena")) return fixed("Team", 5);
  if (normalized.includes("relay")) return fixed("Team", 4);
  if (athleticsIndividualEvents.some((event) => event.toLowerCase() === normalized)) return fixed("Singles", 1);
  if (normalized.includes("team tournament")) return flexible(["Team"], "Team", 4);

  if (normalized.includes("table tennis") || normalized.includes("tennis")) {
    return flexible(["Singles", "Doubles"], "Singles", 1);
  }
  if (normalized.includes("pubg") || normalized.includes("gaming")) {
    return flexible(["Singles", "Doubles", "Team"], "Team", 4);
  }
  if (normalized.includes("chess")) return flexible(["Singles", "Team"], "Singles", 1);

  if (
    normalized.includes("breakdance") ||
    normalized.includes("dance battle") ||
    normalized.includes("rap") ||
    normalized.includes("singing") ||
    normalized.includes("music performance") ||
    normalized.includes("art challenge") ||
    normalized.includes("other talent")
  ) {
    return flexible(["Singles", "Team"], "Singles", 1);
  }

  if (
    normalized.includes("swimming") ||
    normalized.includes("running") ||
    normalized.includes("athletics") ||
    normalized.includes("skating") ||
    normalized.includes("cycling") ||
    normalized.includes("bouldering") ||
    normalized.includes("calisthenics") ||
    normalized.includes("gym / fitness") ||
    normalized.includes("parkour") ||
    normalized.includes("yoga") ||
    normalized.includes("sports coaching")
  ) {
    return flexible(["Singles", "Team"], "Singles", 1);
  }

  return fixed("Singles", 1);
}

function inferredMatchSetup(activity: string) {
  const config = activityMatchConfig(activity);
  return { format: config.defaultFormat, rosterSize: config.defaultRosterSize };
}

function validMatchFormatForActivity(activity: string, format: MatchFormat) {
  return activityMatchConfig(activity).formats.includes(format);
}

function rosterSizeForFormat(activity: string, format: MatchFormat) {
  if (format === "Singles") return 1;
  if (format === "Doubles") return 2;
  return Math.max(2, activityMatchConfig(activity).defaultRosterSize);
}

function validRosterSizeForActivity(activity: string, format: MatchFormat, rosterSize: number) {
  const config = activityMatchConfig(activity);
  if (!Number.isInteger(rosterSize) || rosterSize < 1 || rosterSize > 50) return false;
  if (format === "Team" && config.teamRosterFlexible) return rosterSize >= 2;
  return rosterSize === rosterSizeForFormat(activity, format);
}

function matchFormatLabel(format: MatchFormat, activity: string) {
  const normalized = activity.toLowerCase();
  if (normalized.includes("relay")) return "Relay team";
  if (athleticsIndividualEvents.some((event) => event.toLowerCase() === normalized)) return "Individual";
  if (normalized.includes("pubg") || normalized.includes("gaming")) {
    if (format === "Singles") return "Solo";
    if (format === "Doubles") return "Duo";
    return "Squad";
  }
  if (normalized.includes("chess")) return format === "Singles" ? "1 vs 1" : "Team";
  if (
    normalized.includes("race") ||
    normalized.includes("swimming") ||
    normalized.includes("running") ||
    normalized.includes("athletics") ||
    normalized.includes("skating") ||
    normalized.includes("cycling")
  ) {
    return format === "Singles" ? "Individual" : "Relay / team";
  }
  if (
    normalized.includes("dance") ||
    normalized.includes("break") ||
    normalized.includes("rap") ||
    normalized.includes("singing") ||
    normalized.includes("music") ||
    normalized.includes("art") ||
    normalized.includes("fitness") ||
    normalized.includes("calisthenics") ||
    normalized.includes("yoga") ||
    normalized.includes("parkour") ||
    normalized.includes("bouldering")
  ) {
    return format === "Singles" ? "Solo" : "Group / team";
  }
  if (
    normalized.includes("wrestling") ||
    normalized.includes("karate") ||
    normalized.includes("boxing") ||
    normalized.includes("kickboxing") ||
    normalized.includes("martial arts")
  ) {
    return "1 vs 1";
  }
  return format;
}

function challengeMatchFormat(challenge: Challenge): MatchFormat {
  const activity = `${challenge.sport_type || challenge.title}`;
  if (
    (challenge.match_format === "Singles" || challenge.match_format === "Doubles" || challenge.match_format === "Team") &&
    validMatchFormatForActivity(activity, challenge.match_format)
  ) {
    return challenge.match_format;
  }
  return inferredMatchSetup(activity).format;
}

function challengeRosterSize(challenge: Challenge) {
  const activity = `${challenge.sport_type || challenge.title}`;
  const format = challengeMatchFormat(challenge);
  const savedSize = Number(challenge.roster_size);
  if (validRosterSizeForActivity(activity, format, savedSize)) return savedSize;
  return rosterSizeForFormat(activity, format);
}

type ChallengeScheduleStatus = "Proposed" | "Changes requested" | "Confirmed" | "Cancelled";
type ChallengePlayMode = "In person" | "Online";

type ChallengeSchedule = {
  id: string;
  challenge_id: string;
  proposed_by: string;
  scheduled_for: string;
  timezone: string;
  play_mode: ChallengePlayMode;
  venue_name: string;
  meeting_details: string;
  session_url: string;
  note: string;
  status: ChallengeScheduleStatus;
  confirmed_by?: string | null;
  created_at: string;
  updated_at: string;
};

function defaultPlayModeForChallenge(challenge: Challenge): ChallengePlayMode {
  const challengeType = `${challenge.lane} ${challenge.title} ${challenge.sport_type || ""}`.toLowerCase();

  if (
    challenge.lane === "Mobile gaming challenge" ||
    challengeType.includes("pubg") ||
    challengeType.includes("mech arena") ||
    challengeType.includes("gaming") ||
    challengeType.includes("chess")
  ) {
    return "Online";
  }

  return "In person";
}

function availablePlayModesForChallenge(challenge: Challenge): ChallengePlayMode[] {
  if (challenge.lane === "Mobile gaming challenge") return ["Online"];
  if (challenge.lane === "Sports challenge") return ["In person"];
  return ["In person", "Online"];
}

type ChallengeLiveStatus = "Ready" | "Live" | "Ended";
type ChallengeLiveProvider = "YouTube" | "LiveKit";
type LiveReactionName = "Fire" | "Applause" | "Wow" | "Strong" | "Love";

type ChallengeLiveSession = {
  id: string;
  challenge_id: string;
  youtube_video_id: string | null;
  provider?: ChallengeLiveProvider;
  livekit_room_name?: string | null;
  status: ChallengeLiveStatus;
  created_by: string;
  updated_by: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

type ChallengeLiveReactionTotal = {
  live_session_id: string;
  challenge_id: string;
  reaction: LiveReactionName;
  reaction_count: number | string;
  updated_at: string;
};

const liveReactionOptions: Array<{ name: LiveReactionName; emoji: string; label: string }> = [
  { name: "Fire", emoji: "🔥", label: "Fire" },
  { name: "Applause", emoji: "👏", label: "Applause" },
  { name: "Wow", emoji: "😮", label: "Wow" },
  { name: "Strong", emoji: "💪", label: "Strong" },
  { name: "Love", emoji: "❤️", label: "Love" }
];

function isChallengeCompleted(challenge: Challenge) {
  return challenge.status === "Completed";
}

function isChallengeClosed(challenge: Challenge) {
  return challenge.status === "Completed" || challenge.status === "Cancelled";
}

function isChallengeVotingOpen(challenge: Challenge) {
  if (isChallengeClosed(challenge) || challenge.voting_status !== "Open") return false;
  if (!challenge.voting_closes_at) return true;
  return new Date(challenge.voting_closes_at).getTime() > Date.now();
}

function challengeVotingWindowDetail(challenge: Challenge) {
  if (challenge.status === "Cancelled") return "Voting is unavailable because this challenge was cancelled.";
  if (isChallengeCompleted(challenge)) return "Voting closed when this challenge was completed.";
  if (challenge.voting_status === "Open" && challenge.voting_closes_at) {
    const closeTime = new Date(challenge.voting_closes_at);
    return closeTime.getTime() > Date.now()
      ? `Closes automatically ${closeTime.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.`
      : "The timed voting window has expired.";
  }
  if (challenge.voting_status === "Open") return "Open until an authorized organizer closes it.";
  return "An authorized organizer opens voting after viewers have enough context to decide.";
}

function localDateTimeValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}

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

function resolvedChallengeSideName(
  challenge: Challenge,
  side: "Team A" | "Team B",
  challengeJoins: ChallengeJoin[]
) {
  const roster = challengeJoins.filter((join) => {
    const canonicalSide = join.side === side || (side === "Team B" && join.side === "Open invite");
    return join.challenge_id === challenge.id && join.role === "Challenger" && canonicalSide;
  });

  if (roster.length > 0) return roster.map((join) => join.participant_name).join(" + ");
  const linkedTeamId = side === "Team A" ? challenge.team_a_id : challenge.team_b_id;
  if (linkedTeamId) return side === "Team A" ? challenge.team_a : challenge.team_b;
  return `Open ${side}`;
}

function resolvedChallengeWinnerName(
  challenge: Challenge,
  challengeJoins: ChallengeJoin[],
  winner = challenge.winner
) {
  if (!winner) return "Winner declared";
  if (winner === challenge.team_a) return resolvedChallengeSideName(challenge, "Team A", challengeJoins);
  if (winner === challenge.team_b) return resolvedChallengeSideName(challenge, "Team B", challengeJoins);
  return winner;
}

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
  status: "Pending" | "Accepted" | "Declined" | "Withdrawn" | "Expired";
  created_at: string;
  updated_at?: string | null;
  expires_at?: string | null;
  share_token?: string | null;
};

function isChallengeInviteExpired(invite: ChallengeInvite) {
  if (invite.status !== "Pending") return false;
  const expiresAt = invite.expires_at
    ? new Date(invite.expires_at).getTime()
    : new Date(invite.created_at).getTime() + 7 * 24 * 60 * 60 * 1000;
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function challengeInviteDisplayStatus(invite: ChallengeInvite): ChallengeInvite["status"] {
  return isChallengeInviteExpired(invite) ? "Expired" : invite.status;
}

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

type ChallengeRoomSave = {
  id: string;
  user_id: string;
  challenge_id: string;
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

type AccountDeletionRequest = {
  id: string;
  user_id: string | null;
  account_email: string | null;
  reason: string | null;
  status: "Pending" | "In review" | "Deleting" | "Completed" | "Cancelled" | "Rejected";
  eligible_after: string;
  reviewed_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
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

type SupporterEntitlement = {
  active: boolean;
  tier: SupporterTier;
  user_id: string;
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
  share_token?: string | null;
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
  category: "Invites" | "Teams" | "Live" | "Voting" | "Proof" | "Results" | "Weekly" | "Reports" | "Showcase" | "Expert help" | "Feedback";
  title: string;
  detail: string;
  createdAt: string;
  href: string;
  challengeId?: string;
  challengeTitle?: string;
};

type PushNotificationEvent = {
  id: string;
  category: "Challenge invite" | "Challenge update" | "Live room" | "Voting" | "Proof and result" | "Social" | "Weekly summary";
  title: string;
  body: string;
  href: string;
  resource_id?: string | null;
  created_at: string;
};

type PushNotificationPreferences = {
  push_enabled: boolean;
  challenge_invites: boolean;
  challenge_updates: boolean;
  live_rooms: boolean;
  voting_windows: boolean;
  proof_results: boolean;
  social_updates: boolean;
  weekly_summary: boolean;
};

type Talent7PushBridge = {
  requestPermissionAndToken: () => void;
};

declare global {
  interface Window {
    Talent7Push?: Talent7PushBridge;
  }
}

const defaultPushNotificationPreferences: PushNotificationPreferences = {
  push_enabled: true,
  challenge_invites: true,
  challenge_updates: true,
  live_rooms: true,
  voting_windows: true,
  proof_results: true,
  social_updates: false,
  weekly_summary: true
};

const pushNotificationsEnabled = true;

type NotificationFilter = "All" | "Unread" | AppNotification["category"];

type NotificationReturnContext = {
  filter: NotificationFilter;
  search: string;
  scrollY: number;
  notificationTitle: string;
};

type Talent7HistoryState = {
  talent7NotificationReturn?: NotificationReturnContext;
};

const notificationFilterOptions: NotificationFilter[] = [
  "All",
  "Unread",
  "Invites",
  "Teams",
  "Live",
  "Voting",
  "Proof",
  "Results",
  "Weekly",
  "Reports",
  "Showcase",
  "Expert help",
  "Feedback"
];

function notificationReturnFromHistoryState(state: unknown): NotificationReturnContext | null {
  if (!state || typeof state !== "object") return null;

  const candidate = (state as Talent7HistoryState).talent7NotificationReturn;
  if (!candidate || typeof candidate !== "object") return null;
  if (!notificationFilterOptions.includes(candidate.filter)) return null;
  if (typeof candidate.search !== "string" || typeof candidate.notificationTitle !== "string") return null;
  if (typeof candidate.scrollY !== "number" || !Number.isFinite(candidate.scrollY)) return null;

  return candidate;
}

type TalentProfile = {
  user_id: string;
  display_name: string;
  username: string;
  role: string;
  main_interest: string;
  region: string;
  challenge_availability?: ChallengeAvailability | null;
  challenge_skill_level?: ChallengeSkillLevel | null;
  challenge_mode?: ChallengeMode | null;
  challenge_format?: ChallengeFormat | null;
  challenge_activities?: string[] | null;
  availability_note?: string | null;
  ready_now_until?: string | null;
  share_token?: string | null;
  updated_at: string;
};

type ChallengeAvailability = "Open to everyone" | "People I follow" | "Unavailable";
type ChallengeSkillLevel = "Open" | "Beginner" | "Intermediate" | "Advanced" | "Pro";
type ChallengeMode = "Either" | "In person" | "Online";
type ChallengeFormat = "Any" | "Singles" | "Doubles" | "Team";

const challengeAvailabilityOptions: ChallengeAvailability[] = ["Open to everyone", "People I follow", "Unavailable"];
const challengeSkillOptions: ChallengeSkillLevel[] = ["Open", "Beginner", "Intermediate", "Advanced", "Pro"];
const challengeModeOptions: ChallengeMode[] = ["Either", "In person", "Online"];
const challengeFormatOptions: ChallengeFormat[] = ["Any", "Singles", "Doubles", "Team"];

function discoveryValuesMatch(candidate: string | null | undefined, preference: string | null | undefined) {
  const normalizedCandidate = candidate?.trim().toLowerCase() || "";
  const normalizedPreference = preference?.trim().toLowerCase() || "";
  return Boolean(
    normalizedCandidate &&
      normalizedPreference &&
      (normalizedCandidate.includes(normalizedPreference) || normalizedPreference.includes(normalizedCandidate))
  );
}

function profileDiscoveryReasons(item: TalentProfile, viewer: TalentProfile | null) {
  if (!viewer || item.user_id === viewer.user_id) return [];

  const reasons: string[] = [];
  const activities = [item.main_interest, ...(item.challenge_activities || [])];
  if (activities.some((activity) => discoveryValuesMatch(activity, viewer.main_interest))) {
    reasons.push("Matches your interest");
  }
  if (discoveryValuesMatch(item.region, viewer.region)) reasons.push("Same region");
  if (profileChallengeAvailability(item) === "Open to everyone") reasons.push("Open to challenges");
  return reasons;
}

function profileDiscoveryScore(item: TalentProfile, viewer: TalentProfile | null) {
  if (!viewer) return 0;
  if (item.user_id === viewer.user_id) return -1;

  const reasons = profileDiscoveryReasons(item, viewer);
  return (
    Number(reasons.includes("Matches your interest")) * 6 +
    Number(reasons.includes("Same region")) * 3 +
    Number(reasons.includes("Open to challenges"))
  );
}

function teamDiscoveryReasons(team: TalentTeam, viewer: TalentProfile | null) {
  if (!viewer || team.owner_user_id === viewer.user_id) return [];

  const reasons: string[] = [];
  if (discoveryValuesMatch(team.main_activity, viewer.main_interest)) reasons.push("Matches your interest");
  if (discoveryValuesMatch(team.region, viewer.region)) reasons.push("Same region");
  return reasons;
}

function teamDiscoveryScore(team: TalentTeam, viewer: TalentProfile | null) {
  if (!viewer) return 0;
  if (team.owner_user_id === viewer.user_id) return -1;

  const reasons = teamDiscoveryReasons(team, viewer);
  return Number(reasons.includes("Matches your interest")) * 6 + Number(reasons.includes("Same region")) * 3;
}

function profileChallengeAvailability(item: TalentProfile): ChallengeAvailability {
  return item.challenge_availability || "Open to everyone";
}

function canonicalChallengeActivity(activity: string) {
  return activity === "Mobile gaming" ? "PUBG gaming" : activity;
}

function profileChallengeActivities(item: TalentProfile) {
  const activities = (item.challenge_activities || []).filter(Boolean).map(canonicalChallengeActivity);
  return Array.from(
    new Set(activities.length > 0 ? activities : [canonicalChallengeActivity(item.main_interest)].filter(Boolean))
  );
}

function canonicalTalentProfile(item: TalentProfile): TalentProfile {
  return {
    ...item,
    main_interest: canonicalChallengeActivity(item.main_interest),
    challenge_activities: profileChallengeActivities(item)
  };
}

type ChallengeDraft = {
  title: string;
  lane: ChallengeLane;
  team_a: string;
  team_b: string;
  openOpponent: boolean;
  team_a_id: string;
  team_b_id: string;
  rules: string;
  venue_name: string;
  booking_url: string;
  sport_type: string;
  booking_region: string;
  match_format: MatchFormat;
  roster_size: number;
  invitedProfile: string;
  invitedUserId: string;
  version: number;
};

const defaultChallengeDraft: ChallengeDraft = {
  title: "Badminton doubles",
  lane: "Sports challenge",
  team_a: "",
  team_b: "",
  openOpponent: true,
  team_a_id: "",
  team_b_id: "",
  rules: "Best of 3 games, 21 points each. Upload victory proof after the match.",
  venue_name: "Local badminton court or sports venue",
  booking_url: "",
  sport_type: "Badminton doubles",
  booking_region: "India",
  match_format: "Doubles",
  roster_size: 2,
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

function rulesForActivity(activity: string) {
  const normalized = activity.toLowerCase();

  if (normalized.includes("relay")) {
    return `${activity}: use four registered runners per side, agree the track, lane allocation, baton exchange rules, and timing method, then upload the official time and finish proof.`;
  }

  if (
    normalized.includes("shot put") ||
    normalized.includes("javelin") ||
    normalized.includes("discus") ||
    normalized.includes("hammer throw")
  ) {
    return `${activity}: agree the implement specification and number of valid attempts. Rank the best legal measured throw and upload the result sheet or measurement proof.`;
  }

  if (
    normalized.includes("high jump") ||
    normalized.includes("long jump") ||
    normalized.includes("triple jump") ||
    normalized.includes("pole vault")
  ) {
    return `${activity}: agree the competition rules and number of attempts. Rank the best legal height or distance and upload the result sheet or measurement proof.`;
  }

  if (normalized.includes("badminton")) {
    return "Best of 3 games, 21 points each. Upload the final score and victory proof after the match.";
  }

  if (normalized.includes("table tennis")) {
    return "Best of 5 games, 11 points each. Upload the final score and victory proof after the match.";
  }

  if (normalized.includes("tennis")) {
    return "Agree the number of sets before starting. Upload the final score and victory proof after the match.";
  }

  if (normalized.includes("pubg") || normalized.includes("mech arena") || normalized.includes("gaming")) {
    return "Agree the game mode, map, team size, and number of rounds before starting. Upload a result screenshot or video proof.";
  }

  if (normalized.includes("dance") || normalized.includes("break")) {
    return "Agree the number and length of rounds before starting. Upload both performances for audience ratings out of 7.";
  }

  if (normalized.includes("rap")) {
    return "Agree the beat, round length, and number of rounds before starting. Upload both performances for audience ratings out of 7.";
  }

  if (normalized.includes("singing") || normalized.includes("music")) {
    return "Agree the performance length and format before starting. Upload both performances for audience ratings out of 7.";
  }

  if (normalized.includes("art")) {
    return "Agree the prompt, time limit, and allowed tools before starting. Upload both finished entries for audience ratings out of 7.";
  }

  if (normalized.includes("race") || normalized.includes("running") || normalized.includes("cycling") || normalized.includes("swimming")) {
    return "Agree the distance, route, and timing method before starting. Upload the recorded times and finish proof.";
  }

  if (normalized.includes("football") || normalized.includes("basketball") || normalized.includes("volleyball") || normalized.includes("cricket")) {
    return "Agree the match format and duration before starting. Upload the final score and victory proof after the match.";
  }

  return `${activity}: agree the format and winning conditions before starting. Upload clear result proof after the challenge.`;
}

function venueForActivity(activity: string) {
  const normalized = activity.toLowerCase();

  if (
    athleticsIndividualEvents.some((event) => event.toLowerCase() === normalized) ||
    athleticsRelayEvents.some((event) => event.toLowerCase() === normalized) ||
    normalized.includes("athletics")
  ) {
    return normalized.includes("road race") || normalized.includes("marathon")
      ? "Measured road course or certified race event"
      : "Athletics track-and-field venue";
  }

  if (normalized.includes("pubg") || normalized.includes("mech arena") || normalized.includes("gaming") || normalized.includes("chess")) {
    return "Online lobby or agreed venue";
  }

  if (
    normalized.includes("dance") ||
    normalized.includes("break") ||
    normalized.includes("rap") ||
    normalized.includes("singing") ||
    normalized.includes("music") ||
    normalized.includes("art")
  ) {
    return "Stage, studio, or online submission";
  }

  return "Local sports venue or agreed location";
}

function challengeInterestScore(challenge: Challenge, interest?: string | null) {
  if (!interest) return 0;

  const normalizedInterest = interest.toLowerCase().trim();
  const challengeText = [challenge.title, challenge.lane, challenge.rules, challenge.sport_type || ""]
    .join(" ")
    .toLowerCase();

  if (challengeText.includes(normalizedInterest)) return 3;

  const genericWords = new Set(["battle", "challenge", "doubles", "fitness", "match", "performance", "race", "singles"]);
  const interestWords = normalizedInterest
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !genericWords.has(word));

  if (interestWords.some((word) => challengeText.includes(word))) return 2;
  return challenge.lane === laneForInterest(interest) ? 1 : 0;
}

function youtubeVideoId(value: string) {
  const candidate = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(candidate)) return candidate;

  try {
    const parsed = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";

    if (hostname === "youtu.be") {
      videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
    } else if (hostname === "youtube.com" || hostname === "m.youtube.com" || hostname === "youtube-nocookie.com") {
      videoId = parsed.searchParams.get("v") || "";
      if (!videoId) {
        const pathParts = parsed.pathname.split("/").filter(Boolean);
        if (["embed", "live", "shorts"].includes(pathParts[0])) videoId = pathParts[1] || "";
      }
    }

    return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : "";
  } catch {
    return "";
  }
}

function youtubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function youtubeEmbedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
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
    match_format: "Doubles",
    roster_size: 2,
    created_at: "2026-01-03T12:00:00.000Z"
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
    match_format: "Singles",
    roster_size: 1,
    created_at: "2026-01-02T12:00:00.000Z"
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
    match_format: "Team",
    roster_size: 4,
    created_at: "2026-01-01T12:00:00.000Z"
  }
];

type BookingShortcut = {
  label: string;
  url: string;
  detail: string;
  recommended?: boolean;
};

function suggestedBookingLinks(challenge: Challenge, fallbackRegion?: string | null): BookingShortcut[] {
  const sport = challenge.sport_type || challenge.title || "sports venue";
  const region = challenge.booking_region?.trim() || fallbackRegion?.trim() || "near me";
  const query = encodeURIComponent(`${sport} booking ${region}`);
  const mapQuery = encodeURIComponent(`${sport} venue ${region}`);
  const normalizedSport = sport.toLowerCase();
  const normalizedRegion = region.toLowerCase();

  const indiaLocations = [
    "india",
    "bengaluru",
    "bangalore",
    "mumbai",
    "delhi",
    "gurgaon",
    "gurugram",
    "noida",
    "hyderabad",
    "chennai",
    "pune",
    "kolkata",
    "ahmedabad",
    "jaipur",
    "kochi",
    "goa"
  ];
  const playoMarkets = ["india", "uae", "dubai", "qatar", "oman", "singapore", "sri lanka", "australia"];
  const racketSports = ["badminton", "tennis", "padel", "pickleball", "squash", "table tennis", "racquet", "racket"];
  const isIndia = indiaLocations.some((location) => normalizedRegion.includes(location));
  const isPlayoMarket = playoMarkets.some((location) => normalizedRegion.includes(location));
  const isRacketSport = racketSports.some((activity) => normalizedSport.includes(activity));

  if (challenge.lane === "Mobile gaming challenge" || sport.toLowerCase().includes("gaming")) {
    return [
      {
        label: "Find match rooms",
        url: `https://www.google.com/search?q=${query}`,
        detail: "Search public lobbies and community match rooms.",
        recommended: true
      },
      {
        label: "Search tournament apps",
        url: `https://www.google.com/search?q=${encodeURIComponent(`${sport} tournament app ${region}`)}`,
        detail: "Compare current tournament and matchmaking options."
      }
    ];
  }

  const shortcuts: BookingShortcut[] = [];

  if (isIndia) {
    shortcuts.push({
      label: "Book with Hudle",
      url: "https://www.hudle.in/",
      detail: "India-focused sports venues, courts, turfs, pools, and community games."
    });
  }

  if (isPlayoMarket || normalizedRegion === "global" || normalizedRegion === "near me") {
    shortcuts.push({
      label: "Find on Playo",
      url: "https://playo.co/",
      detail: "Find venues, trainers, and players in supported Playo cities."
    });
  }

  if (isRacketSport || normalizedRegion === "global") {
    shortcuts.push({
      label: "Search Playtomic",
      url: "https://playtomic.com/clubs",
      detail: "Global court discovery, especially for padel, tennis, and other racket sports."
    });
  }

  shortcuts.push(
    {
      label: "Find on Maps",
      url: `https://www.google.com/maps/search/${mapQuery}`,
      detail: `Search nearby ${sport} venues around ${region}.`
    },
    {
      label: "Search all booking options",
      url: `https://www.google.com/search?q=${query}`,
      detail: "Compare local providers when a dedicated platform is unavailable."
    },
    {
      label: "Set up with Planyo",
      url: "https://www.planyo.com/",
      detail: "For venue owners or organizers who need their own public booking page."
    }
  );

  const recommendedLabel = isIndia
    ? "Book with Hudle"
    : isRacketSport && !isPlayoMarket
      ? "Search Playtomic"
      : isPlayoMarket || normalizedRegion === "global" || normalizedRegion === "near me"
        ? "Find on Playo"
        : "Find on Maps";

  return shortcuts.map((shortcut) => ({
    ...shortcut,
    recommended: shortcut.label === recommendedLabel
  }));
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
        {/* User-provided media can come from Supabase or external URLs, so its dimensions and host are not known to next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
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

function PaginationControls({
  currentPage,
  label,
  onPageChange,
  pageSize,
  targetId,
  totalItems
}: {
  currentPage: number;
  label: string;
  onPageChange: (page: number) => void;
  pageSize: number;
  targetId: string;
  totalItems: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);
  const changePage = (page: number) => {
    onPageChange(page);
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <nav aria-label={`${label} pagination`} className="paginationBar">
      <small>
        Showing {firstItem}-{lastItem} of {totalItems}
      </small>
      <div>
        <button
          disabled={currentPage <= 1}
          onClick={() => changePage(currentPage - 1)}
          type="button"
        >
          Previous
        </button>
        <span aria-live="polite">
          Page {currentPage} of {totalPages}
        </span>
        <button
          disabled={currentPage >= totalPages}
          onClick={() => changePage(currentPage + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export default function Home() {
  const [challenges, setChallenges] = useState<Challenge[]>(sampleChallenges);
  const [roomViewCounts, setRoomViewCounts] = useState<Record<string, number>>({});
  const [liveRoomPresenceCounts, setLiveRoomPresenceCounts] = useState<Record<string, number>>({});
  const [activePresenceChallengeId, setActivePresenceChallengeId] = useState<string | null>(null);
  const [lockedRoomPageIds, setLockedRoomPageIds] = useState<string[] | null>(null);
  const [roomViewerToken, setRoomViewerToken] = useState("");
  const recordedRoomViewsRef = useRef<Set<string>>(new Set());
  const [roomPage, setRoomPage] = useState(1);
  const [profilePage, setProfilePage] = useState(1);
  const [opponentPage, setOpponentPage] = useState(1);
  const [feedPage, setFeedPage] = useState(1);
  const [notificationPage, setNotificationPage] = useState(1);
  const [selectedLane, setSelectedLane] = useState<ChallengeLane | "All">("All");
  const [selectedStatus, setSelectedStatus] = useState<ChallengeStatusFilter>("Open");
  const [roomDiscoveryMode, setRoomDiscoveryMode] = useState<RoomDiscoveryMode>("Trending");
  const [roomRankingTimestamp, setRoomRankingTimestamp] = useState(0);
  const [roomSearch, setRoomSearch] = useState("");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeAppTab, setActiveAppTab] = useState<AppTabId>("settings");
  const [activeSection, setActiveSection] = useState("account");
  const [notificationReturnContext, setNotificationReturnContext] = useState<NotificationReturnContext | null>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [colorTheme, setColorTheme] = useState<ColorTheme>("light");
  const [colorThemeHydrated, setColorThemeHydrated] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLElement>(null);
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const confirmationDialogRef = useRef<HTMLElement>(null);
  const confirmationReturnFocusRef = useRef<HTMLElement | null>(null);
  const [listenRooms, setListenRooms] = useState<ListenRoom[]>(sampleListenRooms);
  const [listenTracks, setListenTracks] = useState<ListenTrack[]>(sampleListenTracks);
  const [listenRoomStatus, setListenRoomStatus] = useState<ListenRoomStatus>("Open");
  const [listenRoomDraft, setListenRoomDraft] = useState<ListenRoomDraft>(defaultListenDraft);
  const [listenTrackDrafts, setListenTrackDrafts] = useState<Record<string, ListenTrackDraft>>({});
  const [listenLoading, setListenLoading] = useState(hasSupabaseConfig);
  const [listenLoadError, setListenLoadError] = useState("");
  const [listenActionKey, setListenActionKey] = useState<string | null>(null);
  const [privateListenRoomCode, setPrivateListenRoomCode] = useState("");
  const [privateListenRoomPasscode, setPrivateListenRoomPasscode] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedTheme = window.localStorage.getItem(colorThemeStorageKey);
    const nextTheme: ColorTheme = savedTheme === "dark" ? "dark" : "light";
    setColorTheme(nextTheme);
    document.documentElement.dataset.talent7Theme = nextTheme;
    setColorThemeHydrated(true);
  }, []);

  useEffect(() => {
    if (!colorThemeHydrated || typeof window === "undefined") return;

    document.documentElement.dataset.talent7Theme = colorTheme;
    window.localStorage.setItem(colorThemeStorageKey, colorTheme);
  }, [colorTheme, colorThemeHydrated]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const viewport = window.visualViewport;
    let keyboardOpen = false;
    let largestViewportHeight = viewport?.height || window.innerHeight;
    let focusTimer: number | undefined;

    const keepFocusedControlVisible = () => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !focused.matches("input, textarea, select, [contenteditable='true']")) return;

      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        focused.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }, 120);
    };

    const setKeyboardOpen = (nextOpen: boolean) => {
      if (keyboardOpen === nextOpen) return;
      keyboardOpen = nextOpen;
      root.classList.toggle("talent7KeyboardOpen", nextOpen);
      if (nextOpen) {
        setIsMoreOpen(false);
        keepFocusedControlVisible();
      }
    };

    const detectKeyboardFromViewport = () => {
      const currentHeight = viewport?.height || window.innerHeight;
      if (!keyboardOpen) largestViewportHeight = Math.max(largestViewportHeight, currentHeight);
      const heightLoss = largestViewportHeight - currentHeight;
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement
        && focused.matches("input, textarea, select, [contenteditable='true']");
      setKeyboardOpen(editing && heightLoss > Math.max(120, largestViewportHeight * 0.18));
    };

    const handleNativeKeyboard = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail;
      setKeyboardOpen(Boolean(detail?.visible));
    };

    const handleFocusIn = () => {
      window.setTimeout(detectKeyboardFromViewport, 80);
      if (keyboardOpen) keepFocusedControlVisible();
    };
    const handleFocusOut = () => window.setTimeout(detectKeyboardFromViewport, 80);

    viewport?.addEventListener("resize", detectKeyboardFromViewport);
    viewport?.addEventListener("scroll", detectKeyboardFromViewport);
    window.addEventListener("resize", detectKeyboardFromViewport);
    window.addEventListener("talent7-keyboard-visibility", handleNativeKeyboard);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      window.clearTimeout(focusTimer);
      root.classList.remove("talent7KeyboardOpen");
      viewport?.removeEventListener("resize", detectKeyboardFromViewport);
      viewport?.removeEventListener("scroll", detectKeyboardFromViewport);
      window.removeEventListener("resize", detectKeyboardFromViewport);
      window.removeEventListener("talent7-keyboard-visibility", handleNativeKeyboard);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  const closeConfirmationDialog = useCallback(() => {
    if (confirmationBusy) return;
    setConfirmationRequest(null);
    window.requestAnimationFrame(() => confirmationReturnFocusRef.current?.focus());
  }, [confirmationBusy]);

  const listenTracksByRoom = useMemo(() => {
    return listenTracks.reduce<Record<string, ListenTrack[]>>((grouped, track) => {
      if (!grouped[track.room_id]) grouped[track.room_id] = [];
      grouped[track.room_id].push(track);
      return grouped;
    }, {});
  }, [listenTracks]);

  const visibleListenRooms = useMemo(
    () => listenRooms.filter((room) => (room.status || "Open") === listenRoomStatus),
    [listenRoomStatus, listenRooms]
  );

  const listenRoomCounts = useMemo(
    () => ({
      open: listenRooms.filter((room) => (room.status || "Open") === "Open").length,
      archived: listenRooms.filter((room) => room.status === "Archived").length
    }),
    [listenRooms]
  );

  const refreshListenRooms = useCallback(async (showLoading = false) => {
    if (!supabase) return;
    if (showLoading) setListenLoading(true);

    const [roomsResult, tracksResult] = await Promise.all([
      supabase.from("listen_rooms").select(listenRoomPublicColumns).order("created_at", { ascending: false }),
      supabase.from("listen_tracks").select("*").order("created_at", { ascending: false })
    ]);

    if (roomsResult.error || tracksResult.error) {
      setListenRooms([]);
      setListenTracks([]);
      setListenLoadError("Shared listen rooms are not available yet. Apply the latest Supabase migration and try again.");
    } else {
      setListenRooms((roomsResult.data || []) as ListenRoom[]);
      setListenTracks((tracksResult.data || []) as ListenTrack[]);
      setListenLoadError("");
    }

    if (showLoading) setListenLoading(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (supabase) {
      const supabaseClient = supabase;
      void refreshListenRooms(true);

      const listenChannel = supabaseClient
        .channel("talent7-shared-listen-rooms")
        .on("postgres_changes", { event: "*", schema: "public", table: "listen_rooms" }, () => void refreshListenRooms())
        .on("postgres_changes", { event: "*", schema: "public", table: "listen_tracks" }, () => void refreshListenRooms())
        .on("postgres_changes", { event: "*", schema: "public", table: "listen_room_members" }, () => void refreshListenRooms())
        .on("postgres_changes", { event: "*", schema: "public", table: "listen_room_reactions" }, () => void refreshListenRooms())
        .subscribe();

      return () => {
        void supabaseClient.removeChannel(listenChannel);
      };
    }

    try {
      const savedRooms = window.localStorage.getItem(listenRoomsStorageKey);
      if (savedRooms) setListenRooms(JSON.parse(savedRooms));
      const savedTracks = window.localStorage.getItem(listenTracksStorageKey);
      if (savedTracks) setListenTracks(JSON.parse(savedTracks));
    } catch {
      setListenRooms(sampleListenRooms);
      setListenTracks(sampleListenTracks);
    }
  }, [refreshListenRooms]);

  useEffect(() => {
    const syncTabWithHash = () => {
      const requestedHash = window.location.hash;
      const navigationHash = isLegacyFutureRoute(requestedHash) ? "#plans" : requestedHash;
      if (navigationHash !== requestedHash) {
        window.history.replaceState(window.history.state, "", navigationHash);
      }
      const hashTab = tabForHash(navigationHash);
      if (hashTab) setActiveAppTab(hashTab);
      const hashSection = sectionForHash(navigationHash);
      if (hashSection) setActiveSection(hashSection);
      setNotificationReturnContext(notificationReturnFromHistoryState(window.history.state));
    };

    syncTabWithHash();
    window.addEventListener("hashchange", syncTabWithHash);
    return () => window.removeEventListener("hashchange", syncTabWithHash);
  }, []);

  useEffect(() => {
    if (!isMoreOpen) return;

    const menu = moreMenuRef.current;
    const focusableSelector =
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableItems = () =>
      Array.from(menu?.querySelectorAll<HTMLElement>(focusableSelector) || []).filter(
        (item) => item.getAttribute("aria-hidden") !== "true"
      );

    window.requestAnimationFrame(() => focusableItems()[0]?.focus());

    const handleMoreKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsMoreOpen(false);
        window.requestAnimationFrame(() => moreTriggerRef.current?.focus());
        return;
      }

      if (event.key !== "Tab") return;
      const items = focusableItems();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleMoreKeyDown);
    return () => document.removeEventListener("keydown", handleMoreKeyDown);
  }, [isMoreOpen]);

  useEffect(() => {
    if (!confirmationRequest) return;

    const dialog = confirmationDialogRef.current;
    const focusableItems = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || []);
    window.requestAnimationFrame(() => dialog?.querySelector<HTMLElement>("[data-confirm-cancel]")?.focus());

    const handleConfirmationKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !confirmationBusy) {
        event.preventDefault();
        closeConfirmationDialog();
        return;
      }

      if (event.key !== "Tab") return;
      const items = focusableItems();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleConfirmationKeyDown);
    return () => document.removeEventListener("keydown", handleConfirmationKeyDown);
  }, [closeConfirmationDialog, confirmationBusy, confirmationRequest]);

  useEffect(() => {
    if (typeof window === "undefined" || hasSupabaseConfig) return;
    window.localStorage.setItem(listenRoomsStorageKey, JSON.stringify(listenRooms));
  }, [listenRooms]);

  useEffect(() => {
    if (typeof window === "undefined" || hasSupabaseConfig) return;
    window.localStorage.setItem(listenTracksStorageKey, JSON.stringify(listenTracks));
  }, [listenTracks]);
  const [profileSearch, setProfileSearch] = useState("");
  const [profileDiscoverySort, setProfileDiscoverySort] = useState<"Best match" | "Name">("Best match");
  const [opponentSearch, setOpponentSearch] = useState("");
  const [opponentActivity, setOpponentActivity] = useState("All");
  const [opponentRegion, setOpponentRegion] = useState("");
  const [opponentSkill, setOpponentSkill] = useState<ChallengeSkillLevel | "All">("All");
  const [opponentMode, setOpponentMode] = useState<ChallengeMode | "All">("All");
  const [opponentFormat, setOpponentFormat] = useState<ChallengeFormat | "All">("All");
  const [opponentReadyOnly, setOpponentReadyOnly] = useState(false);
  const [challengeDraft, setChallengeDraft] = useState<ChallengeDraft>(defaultChallengeDraft);
  const [challengeEditSetups, setChallengeEditSetups] = useState<
    Record<string, { activity: string; format: MatchFormat; rosterSize: number }>
  >({});
  const [challengeCreateStep, setChallengeCreateStep] = useState<1 | 2 | 3>(1);
  const [challengeCreateMaxStep, setChallengeCreateMaxStep] = useState<1 | 2 | 3>(1);
  const [challengeStepError, setChallengeStepError] = useState("");
  const [challengeReview, setChallengeReview] = useState({
    activity: defaultChallengeDraft.sport_type,
    title: defaultChallengeDraft.title,
    lane: defaultChallengeDraft.lane,
    teamA: defaultChallengeDraft.team_a,
    teamB: defaultChallengeDraft.team_b
  });
  const [selectedActivityProfile, setSelectedActivityProfile] = useState<TalentProfile | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<TalentProfile | null>(null);
  const [sharedProfileTarget, setSharedProfileTarget] = useState<{
    userId: string;
    intent: "challenge" | "follow";
  } | null>(null);
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [authHydrated, setAuthHydrated] = useState(!hasSupabaseConfig);
  const [profileHydrated, setProfileHydrated] = useState(!hasSupabaseConfig);
  const [challengeLoadError, setChallengeLoadError] = useState("");
  const [challengeReloadKey, setChallengeReloadKey] = useState(0);
  const [refreshingChallengeRooms, setRefreshingChallengeRooms] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const challengeCreationLockRef = useRef(false);
  const [authMode, setAuthMode] = useState<"Sign up" | "Log in">("Sign up");
  const [authLoading, setAuthLoading] = useState(false);
  const [authCaptchaToken, setAuthCaptchaToken] = useState("");
  const [authCaptchaResetKey, setAuthCaptchaResetKey] = useState(0);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [recoveryCancelling, setRecoveryCancelling] = useState(false);
  const [authEmailAction, setAuthEmailAction] = useState<"reset" | "resend" | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [loginPrompt, setLoginPrompt] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<TalentProfile | null>(null);
  useEffect(() => {
    const currentIntent = sharedIntentSearch(window.location.search);
    if (currentIntent) {
      window.localStorage.setItem(sharedIntentStorageKey, currentIntent);
      return;
    }

    const savedIntent = window.localStorage.getItem(sharedIntentStorageKey);
    if (!savedIntent) return;
    window.history.replaceState(null, "", `/?${savedIntent}#account`);
  }, []);
  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get("invite");
    if (!inviteToken) return;

    if (session?.user.id) {
      setActiveAppTab("invites");
      setActiveSection("invites");
      window.history.replaceState(null, "", "#invites");
      window.setTimeout(() => document.getElementById("invites")?.scrollIntoView({ behavior: "smooth" }), 80);
    } else {
      setActiveAppTab("settings");
      setActiveSection("account");
      window.setTimeout(() => document.getElementById("account")?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, [session?.user.id]);
  const [publicProfiles, setPublicProfiles] = useState<TalentProfile[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [joiningChallengeId, setJoiningChallengeId] = useState<string | null>(null);
  const [leavingChallengeId, setLeavingChallengeId] = useState<string | null>(null);
  const [createdChallengeId, setCreatedChallengeId] = useState<string | null>(null);
  const [highlightedChallengeId, setHighlightedChallengeId] = useState<string | null>(null);
  const [highlightedTeamId, setHighlightedTeamId] = useState<string | null>(null);
  const [sharedTeamTarget, setSharedTeamTarget] = useState<{
    teamId: string;
    intent: "challenge" | "join";
  } | null>(null);
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
  const [challengeSchedules, setChallengeSchedules] = useState<ChallengeSchedule[]>([]);
  const [scheduleActionId, setScheduleActionId] = useState<string | null>(null);
  const [schedulePlayModes, setSchedulePlayModes] = useState<Record<string, ChallengePlayMode>>({});
  const [challengeLiveSessions, setChallengeLiveSessions] = useState<ChallengeLiveSession[]>([]);
  const [challengeLiveReactionTotals, setChallengeLiveReactionTotals] = useState<ChallengeLiveReactionTotal[]>([]);
  const [liveVideoDrafts, setLiveVideoDrafts] = useState<Record<string, string>>({});
  const [liveProviderDrafts, setLiveProviderDrafts] = useState<Record<string, ChallengeLiveProvider>>({});
  const [liveSessionActionKey, setLiveSessionActionKey] = useState<string | null>(null);
  const [liveReactionActionKey, setLiveReactionActionKey] = useState<string | null>(null);
  const [challengeLiveLoadError, setChallengeLiveLoadError] = useState("");
  const [votingDurationDrafts, setVotingDurationDrafts] = useState<Record<string, string>>({});
  const [votingWindowActionId, setVotingWindowActionId] = useState<string | null>(null);
  const [follows, setFollows] = useState<ProfileFollow[]>([]);
  const [savedRooms, setSavedRooms] = useState<ChallengeRoomSave[]>([]);
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null);
  const [savedRoomsLoadError, setSavedRoomsLoadError] = useState("");
  const [challengeMessages, setChallengeMessages] = useState<ChallengeMessage[]>([]);
  const [challengeReports, setChallengeReports] = useState<ChallengeReport[]>([]);
  const [showcaseReports, setShowcaseReports] = useState<ShowcaseReport[]>([]);
  const [accountDeletionRequests, setAccountDeletionRequests] = useState<AccountDeletionRequest[]>([]);
  const [accountDeletionActionId, setAccountDeletionActionId] = useState<string | null>(null);
  const [savingAccountDeletion, setSavingAccountDeletion] = useState(false);
  const [accountDeletionReloadKey, setAccountDeletionReloadKey] = useState(0);
  const [accountDeletionFormUserId, setAccountDeletionFormUserId] = useState<string | null>(null);
  const [accountDeletionCaptchaToken, setAccountDeletionCaptchaToken] = useState("");
  const [accountDeletionCaptchaResetKey, setAccountDeletionCaptchaResetKey] = useState(0);
  const [accountDeletionClock, setAccountDeletionClock] = useState(0);
  const [coachOffers, setCoachOffers] = useState<CoachOffer[]>([]);
  const [coachingInterests, setCoachingInterests] = useState<CoachingInterest[]>([]);
  const [paymentInterests, setPaymentInterests] = useState<PaymentInterest[]>([]);
  const [supporterEntitlements, setSupporterEntitlements] = useState<SupporterEntitlement[]>([]);
  const [founderFeedback, setFounderFeedback] = useState<FounderFeedback[]>([]);
  const [firstWaveInterests, setFirstWaveInterests] = useState<FirstWaveInterest[]>([]);
  const [expertHelpRequests, setExpertHelpRequests] = useState<ExpertHelpRequest[]>([]);
  const [expertProfiles, setExpertProfiles] = useState<ExpertProfile[]>([]);
  const [teams, setTeams] = useState<TalentTeam[]>([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [teamDiscoverySort, setTeamDiscoverySort] = useState<"Best match" | "Newest">("Best match");
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
  const [firstWaveSaveConfirmed, setFirstWaveSaveConfirmed] = useState(false);
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
  const [deletingChallengeId, setDeletingChallengeId] = useState<string | null>(null);
  const [editingShowcasePostId, setEditingShowcasePostId] = useState<string | null>(null);
  const [editingProofId, setEditingProofId] = useState<string | null>(null);
  const [readNotificationKeys, setReadNotificationKeys] = useState<string[]>([]);
  const [dismissedNotificationKeys, setDismissedNotificationKeys] = useState<string[]>([]);
  const [notificationUndo, setNotificationUndo] = useState<{ keys: string[]; label: string } | null>(null);
  const [launchQaDoneKeys, setLaunchQaDoneKeys] = useState<string[]>([]);
  const [playStoreDoneKeys, setPlayStoreDoneKeys] = useState<string[]>([]);
  const [selectedNotificationFilter, setSelectedNotificationFilter] = useState<NotificationFilter>("All");
  const [notificationSearch, setNotificationSearch] = useState("");
  const [pushNotificationEvents, setPushNotificationEvents] = useState<PushNotificationEvent[]>([]);
  const [pushPreferences, setPushPreferences] = useState<PushNotificationPreferences>(defaultPushNotificationPreferences);
  const [pushDeviceConnected, setPushDeviceConnected] = useState(false);
  const lastRegisteredPushTokenRef = useRef<string | null>(null);
  const [nativePushAvailable, setNativePushAvailable] = useState(false);
  const [pushPreferencesLoading, setPushPreferencesLoading] = useState(false);
  const [savingPushPreferences, setSavingPushPreferences] = useState(false);

  const dismissNotice = useCallback((id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const refreshRoomViewCounts = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase.rpc("get_challenge_room_view_counts");
    if (error) return;

    const nextCounts = ((data || []) as Array<{ challenge_id: string; unique_views: number | string }>).reduce<
      Record<string, number>
    >((counts, row) => {
      counts[row.challenge_id] = Number(row.unique_views) || 0;
      return counts;
    }, {});
    setRoomViewCounts(nextCounts);
  }, []);

  const refreshChallengeRooms = useCallback(async (showFeedback = false) => {
    if (!supabase) return;

    if (showFeedback) setRefreshingChallengeRooms(true);

    const [challengeResult, joinResult] = await Promise.all([
      supabase.from("challenges").select("*").order("created_at", { ascending: false }),
      supabase.from("challenge_joins").select("*").order("created_at", { ascending: false })
    ]);
    const refreshError = challengeResult.error || joinResult.error;

    if (refreshError) {
      setChallengeLoadError(refreshError.message);
      if (showFeedback) setMessage(`Could not refresh challenge rooms: ${refreshError.message}`);
    } else {
      setChallenges((challengeResult.data || []) as Challenge[]);
      setJoins((joinResult.data || []) as ChallengeJoin[]);
      setChallengeLoadError("");
      if (showFeedback) setMessage("Challenge rooms refreshed.");
    }

    if (showFeedback) setRefreshingChallengeRooms(false);
  }, []);

  function setMessage(text: string, tone?: NoticeTone) {
    if (!text) {
      setNotices([]);
      return;
    }

    const resolvedTone = tone || noticeToneForMessage(text);
    const notice: AppNotice = {
      id: ++noticeSequence,
      text,
      tone: resolvedTone,
      duration: noticeDuration(resolvedTone)
    };

    setNotices((current) => [...current.filter((item) => item.text !== text), notice].slice(-3));
  }
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

  const liveSessionsByRoom = useMemo(() => {
    return challengeLiveSessions.reduce<Record<string, ChallengeLiveSession>>((sessions, liveSession) => {
      sessions[liveSession.challenge_id] = liveSession;
      return sessions;
    }, {});
  }, [challengeLiveSessions]);

  const liveReactionTotalsByRoom = useMemo(() => {
    return challengeLiveReactionTotals.reduce<Record<string, Partial<Record<LiveReactionName, number>>>>(
      (totals, reactionTotal) => {
        totals[reactionTotal.challenge_id] = totals[reactionTotal.challenge_id] || {};
        totals[reactionTotal.challenge_id][reactionTotal.reaction] = Number(reactionTotal.reaction_count) || 0;
        return totals;
      },
      {}
    );
  }, [challengeLiveReactionTotals]);

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

  const trendingScores = useMemo(() => {
    return challenges.reduce<Record<string, number>>((scores, challenge) => {
      const ageHours = roomRankingTimestamp
        ? Math.max(0, (roomRankingTimestamp - new Date(challenge.created_at).getTime()) / 3_600_000)
        : Number.POSITIVE_INFINITY;
      const freshnessBoost = ageHours <= 24 ? 12 : ageHours <= 72 ? 8 : ageHours <= 168 ? 4 : 0;
      const uniqueViewScore = Math.log2((roomViewCounts[challenge.id] || 0) + 1) * 3;
      const liveAudienceScore = (liveRoomPresenceCounts[challenge.id] || 0) * 10;
      const conversationScore = (roomMessages[challenge.id]?.length || 0) * 1.5;
      const reactionsTotal = Object.values(liveReactionTotalsByRoom[challenge.id] || {}).reduce(
        (total, count) => total + (count || 0),
        0
      );
      const reactionScore = Math.log2(reactionsTotal + 1) * 4;

      scores[challenge.id] =
        (activityScores[challenge.id] || 0) +
        uniqueViewScore +
        liveAudienceScore +
        conversationScore +
        reactionScore +
        freshnessBoost;
      return scores;
    }, {});
  }, [
    activityScores,
    challenges,
    liveReactionTotalsByRoom,
    liveRoomPresenceCounts,
    roomMessages,
    roomRankingTimestamp,
    roomViewCounts
  ]);

  const challengeMatchesProfileActivity = useCallback((challenge: Challenge, item: TalentProfile) => {
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
  }, [joins, proofs, ratings, votes]);

  const savedRoomByChallengeId = useMemo(
    () => new Map(savedRooms.map((savedRoom) => [savedRoom.challenge_id, savedRoom])),
    [savedRooms]
  );

  const visibleChallenges = useMemo(() => {
    const search = roomSearch.trim().toLowerCase();
    const savedInterest = profile?.main_interest;

    const filteredChallenges = challenges.filter((challenge) => {
      const laneMatches = selectedLane === "All" || challenge.lane === selectedLane;
      const statusMatches =
        selectedStatus === "All" ||
        (selectedStatus === "Open" && !isChallengeClosed(challenge)) ||
        (selectedStatus === "Completed" && isChallengeClosed(challenge)) ||
        (selectedStatus === "Saved" && savedRoomByChallengeId.has(challenge.id));
      const profileActivityMatches =
        !selectedActivityProfile || challengeMatchesProfileActivity(challenge, selectedActivityProfile);
      const discoveryMatches =
        selectedStatus !== "Open" ||
        roomDiscoveryMode === "Trending" ||
        roomDiscoveryMode === "Newest" ||
        (roomDiscoveryMode === "Live" &&
          (liveSessionsByRoom[challenge.id]?.status === "Live" ||
            (liveRoomPresenceCounts[challenge.id] || 0) > 0)) ||
        (roomDiscoveryMode === "For you" && challengeInterestScore(challenge, savedInterest) > 0);
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

      return laneMatches && statusMatches && profileActivityMatches && discoveryMatches && searchMatches;
    });

    return [...filteredChallenges].sort((first, second) => {
      if (selectedStatus === "Saved") {
        const firstSavedAt = new Date(savedRoomByChallengeId.get(first.id)?.created_at || 0).getTime();
        const secondSavedAt = new Date(savedRoomByChallengeId.get(second.id)?.created_at || 0).getTime();
        const savedDifference = secondSavedAt - firstSavedAt;
        if (savedDifference !== 0) return savedDifference;
        return first.id.localeCompare(second.id);
      }

      if (selectedStatus === "Completed") {
        const firstCompletedAt = new Date(first.completed_at || first.created_at).getTime();
        const secondCompletedAt = new Date(second.completed_at || second.created_at).getTime();
        const completedDifference = secondCompletedAt - firstCompletedAt;
        if (completedDifference !== 0) return completedDifference;
        return first.id.localeCompare(second.id);
      }

      if (roomDiscoveryMode === "Live") {
        const broadcastDifference =
          Number(liveSessionsByRoom[second.id]?.status === "Live") -
          Number(liveSessionsByRoom[first.id]?.status === "Live");
        if (broadcastDifference !== 0) return broadcastDifference;

        const audienceDifference =
          (liveRoomPresenceCounts[second.id] || 0) - (liveRoomPresenceCounts[first.id] || 0);
        if (audienceDifference !== 0) return audienceDifference;
      }

      if (roomDiscoveryMode === "For you") {
        const interestDifference =
          challengeInterestScore(second, savedInterest) - challengeInterestScore(first, savedInterest);
        if (interestDifference !== 0) return interestDifference;
      }

      if (roomDiscoveryMode !== "Newest") {
        const scoreDifference = (trendingScores[second.id] || 0) - (trendingScores[first.id] || 0);
        if (scoreDifference !== 0) return scoreDifference;
      }

      const createdDifference =
        new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
      if (createdDifference !== 0) return createdDifference;
      return first.id.localeCompare(second.id);
    });
  }, [
    challengeMatchesProfileActivity,
    challenges,
    liveRoomPresenceCounts,
    liveSessionsByRoom,
    profile?.main_interest,
    roomDiscoveryMode,
    roomSearch,
    savedRoomByChallengeId,
    selectedActivityProfile,
    selectedLane,
    selectedStatus,
    trendingScores
  ]);

  const roomCollectionCounts = useMemo(
    () => ({
      active: challenges.filter((challenge) => !isChallengeClosed(challenge)).length,
      archived: challenges.filter((challenge) => isChallengeClosed(challenge)).length,
      live: challenges.filter(
        (challenge) =>
          !isChallengeClosed(challenge) &&
          (liveSessionsByRoom[challenge.id]?.status === "Live" ||
            (liveRoomPresenceCounts[challenge.id] || 0) > 0)
      ).length,
      saved: savedRooms.length
    }),
    [challenges, liveRoomPresenceCounts, liveSessionsByRoom, savedRooms.length]
  );

  const recommendedRoomCount = useMemo(
    () =>
      challenges.filter(
        (challenge) =>
          !isChallengeClosed(challenge) && challengeInterestScore(challenge, profile?.main_interest) > 0
      ).length,
    [challenges, profile?.main_interest]
  );

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

  const supporterTierByUser = useMemo(() => {
    return supporterEntitlements.reduce<Record<string, SupporterTier>>((tiers, entitlement) => {
      if (entitlement.active) tiers[entitlement.user_id] = entitlement.tier;
      return tiers;
    }, {});
  }, [supporterEntitlements]);

  const activeAccountDeletionRequest = useMemo(() => {
    return accountDeletionRequests.find(
      (request) => request.user_id === session?.user.id && ["Pending", "In review", "Deleting"].includes(request.status)
    ) || null;
  }, [accountDeletionRequests, session]);

  const myFirstWaveInterest = useMemo(() => {
    return firstWaveInterests.find((interest) => interest.user_id === session?.user.id) || null;
  }, [firstWaveInterests, session]);

  const visibleProfiles = useMemo(() => {
    const search = profileSearch.trim().toLowerCase();
    const filteredProfiles = publicProfiles.filter((item) =>
      !search ||
      [item.display_name, item.username, item.role, item.main_interest, item.region]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );

    return [...filteredProfiles].sort((first, second) => {
      if (profileDiscoverySort === "Best match") {
        const scoreDifference = profileDiscoveryScore(second, profile) - profileDiscoveryScore(first, profile);
        if (scoreDifference !== 0) return scoreDifference;
      }
      return first.display_name.localeCompare(second.display_name) || first.user_id.localeCompare(second.user_id);
    });
  }, [profile, profileDiscoverySort, profileSearch, publicProfiles]);

  const visibleTeams = useMemo(() => {
    const search = teamSearch.trim().toLowerCase();
    const filteredTeams = teams.filter((team) =>
      !search ||
      [team.name, team.team_type, team.main_activity, team.region, team.description]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );

    return [...filteredTeams].sort((first, second) => {
      if (teamDiscoverySort === "Best match") {
        const scoreDifference = teamDiscoveryScore(second, profile) - teamDiscoveryScore(first, profile);
        if (scoreDifference !== 0) return scoreDifference;
      } else {
        const createdDifference = new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
        if (createdDifference !== 0) return createdDifference;
      }
      return first.name.localeCompare(second.name) || first.id.localeCompare(second.id);
    });
  }, [profile, teamDiscoverySort, teamSearch, teams]);

  const visibleOpponents = useMemo(() => {
    const search = opponentSearch.trim().toLowerCase();
    const region = opponentRegion.trim().toLowerCase();
    const ownInterest = profile?.main_interest?.trim().toLowerCase();

    return publicProfiles
      .filter((item) => item.user_id !== session?.user.id)
      .filter((item) => profileChallengeAvailability(item) !== "Unavailable")
      .filter((item) => {
        const activities = profileChallengeActivities(item);
        const searchable = [
          item.display_name,
          item.username,
          item.role,
          item.main_interest,
          item.region,
          item.availability_note,
          ...activities
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const activityMatches = opponentActivity === "All" || activities.includes(opponentActivity);
        const regionMatches = !region || item.region.toLowerCase().includes(region);
        const skillMatches = opponentSkill === "All" || (item.challenge_skill_level || "Open") === opponentSkill;
        const mode = item.challenge_mode || "Either";
        const modeMatches = opponentMode === "All" || mode === "Either" || mode === opponentMode;
        const format = item.challenge_format || "Any";
        const formatMatches = opponentFormat === "All" || format === "Any" || format === opponentFormat;
        const readyMatches = !opponentReadyOnly || Boolean(
          item.ready_now_until && new Date(item.ready_now_until).getTime() > roomRankingTimestamp
        );

        return (!search || searchable.includes(search)) && activityMatches && regionMatches && skillMatches && modeMatches && formatMatches && readyMatches;
      })
      .sort((first, second) => {
        const firstReady = first.ready_now_until && new Date(first.ready_now_until).getTime() > roomRankingTimestamp ? 1 : 0;
        const secondReady = second.ready_now_until && new Date(second.ready_now_until).getTime() > roomRankingTimestamp ? 1 : 0;
        const firstOpen = profileChallengeAvailability(first) === "Open to everyone" ? 1 : 0;
        const secondOpen = profileChallengeAvailability(second) === "Open to everyone" ? 1 : 0;
        const firstInterestMatch = ownInterest && profileChallengeActivities(first).some((item) => item.toLowerCase() === ownInterest) ? 1 : 0;
        const secondInterestMatch = ownInterest && profileChallengeActivities(second).some((item) => item.toLowerCase() === ownInterest) ? 1 : 0;

        return secondReady - firstReady || secondOpen - firstOpen || secondInterestMatch - firstInterestMatch || first.display_name.localeCompare(second.display_name);
      });
  }, [opponentActivity, opponentFormat, opponentMode, opponentReadyOnly, opponentRegion, opponentSearch, opponentSkill, profile, publicProfiles, roomRankingTimestamp, session]);

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

    const completedItems = challenges
      .filter((challenge) => challenge.completed_by && followedSet.has(challenge.completed_by))
      .map((challenge) => {
        const actor = challenge.completed_by ? profileById[challenge.completed_by] : null;

        return {
          id: `completed-${challenge.id}`,
          actor: actor?.display_name || "Followed profile",
          action: "completed a challenge",
          title: challenge.title,
          detail: challenge.winner ? `Winner: ${resolvedChallengeWinnerName(challenge, joins)}` : "Winner declared",
          createdAt: challenge.completed_at || challenge.created_at,
          challengeId: challenge.id
        };
      });

    return [...createdItems, ...joinedItems, ...proofItems, ...completedItems]
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
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

  const challengeLinkableTeams = useMemo(() => {
    const connectedTeams = [
      ...myTeamDashboard.owned,
      ...myTeamDashboard.accepted.flatMap((request) => (request.team ? [request.team] : [])),
      ...teams.filter((team) => team.id === challengeDraft.team_a_id || team.id === challengeDraft.team_b_id)
    ];

    return connectedTeams.filter(
      (team, index, items) => items.findIndex((candidate) => candidate.id === team.id) === index
    );
  }, [challengeDraft.team_a_id, challengeDraft.team_b_id, myTeamDashboard, teams]);

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
        detail:
          challenge.status === "Completed"
            ? `Completed: ${resolvedChallengeWinnerName(challenge, joins)}`
            : challenge.status === "Cancelled"
              ? "Cancelled room"
              : "Open room"
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
        detail: `${resolvedChallengeWinnerName(challenge, joins)} won${challenge.final_score ? ` ${challenge.final_score}` : ""}`
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
      pendingInvites: inviteInbox.received
        .filter((invite) => challengeInviteDisplayStatus(invite) === "Pending")
        .slice(0, 4),
      teamCount: myTeamDashboard.owned.length + myTeamDashboard.accepted.length,
      pendingTeamRequests: myTeamDashboard.pending.length + teamInbox.filter((request) => request.status === "Pending").length
    };
  }, [
    challengeReports,
    challenges,
    inviteInbox.received,
    joins,
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
    const hasProof = Boolean(userId && proofs.some((proof) => proof.user_id === userId));
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
        title: "Upload victory proof",
        detail: "Add photo, video, screenshot, or link proof to a challenge room.",
        done: hasProof,
        href: hasProof ? "#my-talent7" : "#rooms"
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
  }, [challenges, follows, founderFeedback, joins, profile, proofs, ratings, session, showcaseRatings, votes]);

  const completedOnboardingSteps = onboardingSteps.filter((step) => step.done).length;

  const challengeTitle = useCallback(
    (challengeId: string) =>
      challenges.find((challenge) => challenge.id === challengeId)?.title || "Challenge room",
    [challenges]
  );

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

    const realtimeRoomAlerts = pushNotificationEvents
      .filter((event) => event.category === "Live room" || event.category === "Voting" || event.category === "Weekly summary")
      .map((event) => {
        const challenge = event.resource_id
          ? challenges.find((item) => item.id === event.resource_id)
          : null;
        return {
          id: `notification-push-${event.id}`,
          label: event.category === "Live room" ? "Live now" : event.category === "Voting" ? "Voting open" : "Weekly recap",
          category: (event.category === "Live room" ? "Live" : event.category === "Voting" ? "Voting" : "Weekly") as AppNotification["category"],
          title: challenge?.title || event.title,
          detail: event.body,
          createdAt: event.created_at,
          href: challenge ? `#${roomHash(challenge.id)}` : event.href,
          challengeId: challenge?.id,
          challengeTitle: challenge?.title
        };
      });

    const receivedInviteAlerts = inviteInbox.received.map((invite) => {
      const status = challengeInviteDisplayStatus(invite);
      return {
        id: `notification-invite-${invite.id}`,
        label: status === "Pending" ? "New invite" : "Invite updated",
        category: "Invites" as const,
        title: challengeTitle(invite.challenge_id),
        detail:
          status === "Pending"
            ? "Someone invited you to a challenge."
            : status === "Withdrawn"
              ? "The challenger withdrew this invitation."
              : status === "Expired"
                ? "This invitation expired before it was accepted."
                : `Invite ${status.toLowerCase()}.`,
        createdAt: invite.updated_at || invite.created_at,
        href: "#invites"
      };
    });

    const sentInviteAlerts = inviteInbox.sent
      .filter((invite) => challengeInviteDisplayStatus(invite) !== "Pending")
      .map((invite) => {
        const status = challengeInviteDisplayStatus(invite);
        return {
          id: `notification-sent-invite-${invite.id}`,
          label: status === "Accepted" || status === "Declined" ? "Invite response" : "Invite updated",
          category: "Invites" as const,
          title: challengeTitle(invite.challenge_id),
          detail:
            status === "Accepted" || status === "Declined"
              ? `${invite.invited_name} ${status.toLowerCase()} your invite.`
              : status === "Expired"
                ? `Your invite to ${invite.invited_name} expired.`
                : `You withdrew the invite to ${invite.invited_name}.`,
          createdAt: invite.updated_at || invite.created_at,
          href: "#invites"
        };
      });

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
        challengeId: proof.challenge_id,
        challengeTitle: challengeTitle(proof.challenge_id)
      }));

    const savedProofAlerts = proofs
      .filter(
        (proof) =>
          savedRoomByChallengeId.has(proof.challenge_id) &&
          proof.user_id !== userId &&
          !createdChallengeIds.has(proof.challenge_id)
      )
      .map((proof) => ({
        id: `notification-saved-proof-${proof.id}`,
        label: "Proof added to saved room",
        category: "Proof" as const,
        title: challengeTitle(proof.challenge_id),
        detail: `${proof.proof_type || "Proof"} was added to a room you saved.`,
        createdAt: proof.created_at,
        href: `#${roomHash(proof.challenge_id)}`,
        challengeId: proof.challenge_id,
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
        detail: challenge.winner ? `Winner: ${resolvedChallengeWinnerName(challenge, joins)}` : "Winner declared.",
        createdAt: challenge.completed_at || challenge.created_at,
        href: "#rooms",
        challengeId: challenge.id,
        challengeTitle: challenge.title
      }));

    const savedCompletedAlerts = challenges
      .filter(
        (challenge) =>
          challenge.status === "Completed" &&
          challenge.completed_by !== userId &&
          savedRoomByChallengeId.has(challenge.id) &&
          challenge.created_by !== userId &&
          !joinedChallengeIds.has(challenge.id)
      )
      .map((challenge) => ({
        id: `notification-saved-completed-${challenge.id}`,
        label: "Saved room completed",
        category: "Results" as const,
        title: challenge.title,
        detail: challenge.winner
          ? `Winner: ${resolvedChallengeWinnerName(challenge, joins)}`
          : "A saved room has published its result.",
        createdAt: challenge.completed_at || challenge.created_at,
        href: `#${roomHash(challenge.id)}`,
        challengeId: challenge.id,
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
        href: "#plans"
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
      ...realtimeRoomAlerts,
      ...receivedInviteAlerts,
      ...sentInviteAlerts,
      ...teamOwnerAlerts,
      ...teamMemberAlerts,
      ...proofAlerts,
      ...savedProofAlerts,
      ...completedAlerts,
      ...savedCompletedAlerts,
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
      .filter((notification) => !dismissedNotificationKeys.includes(notificationKey(notification)))
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
      .slice(0, 12);
  }, [
    challengeTitle,
    challenges,
    dismissedNotificationKeys,
    expertHelpRequests,
    expertProfiles,
    founderFeedback,
    inviteInbox,
    isOwnerReviewer,
    joins,
    mySafetyReports,
    pushNotificationEvents,
    proofs,
    savedRoomByChallengeId,
    session,
    showcaseComments,
    showcasePosts,
    teamInbox,
      teamRequests,
      teams
  ]);

  const notificationReadStorageKey = session?.user.id ? `talent7-read-notifications-${session.user.id}` : "";
  const notificationDismissStorageKey = session?.user.id ? `talent7-dismissed-notifications-${session.user.id}` : "";
  const launchQaStorageKey = session?.user.id ? `talent7-launch-qa-${session.user.id}` : "";
  const playStoreStorageKey = session?.user.id ? `talent7-play-store-launch-${session.user.id}` : "";

  const unreadNotifications = useMemo(() => {
    const readSet = new Set(readNotificationKeys);
    return notifications.filter((notification) => !readSet.has(notificationKey(notification)));
  }, [notifications, readNotificationKeys]);

  const dashboardPriorities = useMemo(() => {
    if (!session?.user.id) return [];

    const priorities: Array<{
      id: string;
      label: string;
      title: string;
      detail: string;
      href: string;
      action: string;
      tone: "urgent" | "attention" | "next" | "ready";
    }> = [];
    const pendingInvites = myDashboard.pendingInvites.length;
    const pendingTeams = myDashboard.pendingTeamRequests;
    const otherUnread = unreadNotifications.filter(
      (notification) => notification.category !== "Invites" && notification.category !== "Teams"
    ).length;
    const nextOnboardingStep = onboardingSteps.find((step) => !step.done);

    if (pendingInvites > 0) {
      priorities.push({
        id: "pending-invites",
        label: "Challenge invite",
        title: `${pendingInvites} invite${pendingInvites === 1 ? "" : "s"} waiting`,
        detail: "Accept or decline so the challenger knows whether you are joining.",
        href: "#invites",
        action: "Review invites",
        tone: "urgent"
      });
    }

    if (pendingTeams > 0) {
      priorities.push({
        id: "pending-teams",
        label: "Team activity",
        title: `${pendingTeams} pending team item${pendingTeams === 1 ? "" : "s"}`,
        detail: "Review membership requests or check the status of a team you asked to join.",
        href: "#teams",
        action: "Open teams",
        tone: "attention"
      });
    }

    if (otherUnread > 0) {
      priorities.push({
        id: "unread-updates",
        label: "New activity",
        title: `${otherUnread} unread update${otherUnread === 1 ? "" : "s"}`,
        detail: "Check results, proof, showcase, guidance, report, and feedback updates.",
        href: "#notifications",
        action: "View updates",
        tone: "attention"
      });
    }

    if (nextOnboardingStep) {
      priorities.push({
        id: `onboarding-${nextOnboardingStep.title}`,
        label: "Build your profile",
        title: nextOnboardingStep.title,
        detail: nextOnboardingStep.detail,
        href: nextOnboardingStep.href,
        action: "Continue setup",
        tone: "next"
      });
    }

    if (priorities.length === 0) {
      const activeRoom = myDashboard.rooms.find((item) => !isChallengeClosed(item.challenge));

      priorities.push(
        activeRoom
          ? {
              id: `active-room-${activeRoom.challenge.id}`,
              label: "Continue",
              title: activeRoom.challenge.title,
              detail: `${activeRoom.label}: ${activeRoom.detail}. Open the room for voting, proof, chat, and results.`,
              href: `#${roomHash(activeRoom.challenge.id)}`,
              action: "Open room",
              tone: "ready"
            }
          : {
              id: "find-next-room",
              label: "You are caught up",
              title: profile?.main_interest ? `Find a ${profile.main_interest} challenge` : "Find your next challenge",
              detail: "There are no account actions waiting. Browse active rooms or create a new matchup.",
              href: "#rooms",
              action: "Browse rooms",
              tone: "ready"
            }
      );
    }

    return priorities.slice(0, 4);
  }, [myDashboard, onboardingSteps, profile, session, unreadNotifications]);

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

  const pagedChallenges = useMemo(() => {
    if (lockedRoomPageIds) {
      const visibleById = new Map(visibleChallenges.map((challenge) => [challenge.id, challenge]));
      return lockedRoomPageIds
        .map((challengeId) => visibleById.get(challengeId))
        .filter((challenge): challenge is Challenge => Boolean(challenge));
    }

    return visibleChallenges.slice((roomPage - 1) * roomPageSize, roomPage * roomPageSize);
  }, [lockedRoomPageIds, roomPage, visibleChallenges]);

  const pagedProfiles = useMemo(
    () => visibleProfiles.slice((profilePage - 1) * profilePageSize, profilePage * profilePageSize),
    [profilePage, visibleProfiles]
  );

  const pagedOpponents = useMemo(
    () => visibleOpponents.slice((opponentPage - 1) * opponentPageSize, opponentPage * opponentPageSize),
    [opponentPage, visibleOpponents]
  );

  const pagedFollowingFeed = useMemo(
    () => followingFeed.slice((feedPage - 1) * feedPageSize, feedPage * feedPageSize),
    [feedPage, followingFeed]
  );

  const pagedNotifications = useMemo(
    () => visibleNotifications.slice(
      (notificationPage - 1) * notificationPageSize,
      notificationPage * notificationPageSize
    ),
    [notificationPage, visibleNotifications]
  );

  useEffect(() => {
    setRoomPage(1);
  }, [roomDiscoveryMode, roomSearch, selectedActivityProfile, selectedLane, selectedStatus]);

  useEffect(() => {
    setProfilePage(1);
  }, [profileDiscoverySort, profileSearch]);

  useEffect(() => {
    setOpponentPage(1);
  }, [opponentActivity, opponentFormat, opponentMode, opponentReadyOnly, opponentRegion, opponentSearch, opponentSkill]);

  useEffect(() => {
    setNotificationPage(1);
  }, [notificationSearch, selectedNotificationFilter]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(visibleChallenges.length / roomPageSize));
    setRoomPage((current) => Math.min(current, lastPage));
  }, [visibleChallenges.length]);

  useEffect(() => {
    if (!activePresenceChallengeId) return;

    const roomIsVisible = visibleChallenges.some((challenge) => challenge.id === activePresenceChallengeId);
    if (activeAppTab !== "challenges" || activeSection !== "rooms" || !roomIsVisible) {
      setActivePresenceChallengeId(null);
      setLockedRoomPageIds(null);
    }
  }, [activeAppTab, activePresenceChallengeId, activeSection, visibleChallenges]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(visibleProfiles.length / profilePageSize));
    setProfilePage((current) => Math.min(current, lastPage));
  }, [visibleProfiles.length]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(visibleOpponents.length / opponentPageSize));
    setOpponentPage((current) => Math.min(current, lastPage));
  }, [visibleOpponents.length]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(followingFeed.length / feedPageSize));
    setFeedPage((current) => Math.min(current, lastPage));
  }, [followingFeed.length]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(visibleNotifications.length / notificationPageSize));
    setNotificationPage((current) => Math.min(current, lastPage));
  }, [visibleNotifications.length]);

  useEffect(() => {
    if (createdChallengeId) setRoomPage(1);
  }, [createdChallengeId]);

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
  }, [challengeMatchesProfileActivity, challenges, joins, proofs, ratings, selectedActivityProfile, votes]);

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
  }, [challengeMatchesProfileActivity, challenges, joins, proofs, ratings, selectedProfile, showcasePosts, teamRequests, teams]);

  function profileDisplayName(userId: string) {
    return publicProfiles.find((item) => item.user_id === userId)?.display_name || "Talent7 creator";
  }

  function canDeleteUserContent(userId?: string | null) {
    return Boolean(session?.user.id && (isOwnerReviewer || userId === session.user.id));
  }

  function canEditChallenge(challenge: Challenge) {
    return Boolean(session?.user.id && (isOwnerReviewer || challenge.created_by === session.user.id));
  }

  function challengeHasActivity(challengeId: string) {
    return Boolean(
      joins.some((item) => item.challenge_id === challengeId) ||
        ratings.some((item) => item.challenge_id === challengeId) ||
        votes.some((item) => item.challenge_id === challengeId) ||
        proofs.some((item) => item.challenge_id === challengeId) ||
        invites.some((item) => item.challenge_id === challengeId) ||
        challengeMessages.some((item) => item.challenge_id === challengeId) ||
        challengeReports.some((item) => item.challenge_id === challengeId)
    );
  }

  function canDeleteChallenge(challenge: Challenge) {
    if (!session?.user.id) return false;
    if (isOwnerReviewer) return true;
    return Boolean(
      challenge.created_by === session.user.id &&
        !isChallengeClosed(challenge) &&
        !challengeHasActivity(challenge.id)
    );
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

  function targetAllowsChallenge(item: TalentProfile) {
    if (!session?.user.id || item.user_id === session.user.id) return false;
    const availability = profileChallengeAvailability(item);
    if (availability === "Unavailable") return false;
    if (availability === "Open to everyone") return true;

    return follows.some(
      (follow) => follow.follower_id === item.user_id && follow.following_id === session.user.id
    );
  }

  function inviteChallenge(invite: ChallengeInvite) {
    return challenges.find((challenge) => challenge.id === invite.challenge_id) || null;
  }

  function pairChallengeInvites(item: TalentProfile) {
    if (!session?.user.id) return null;
    return invites
      .filter(
        (invite) =>
          (invite.from_user_id === session.user.id && invite.invited_user_id === item.user_id) ||
          (invite.from_user_id === item.user_id && invite.invited_user_id === session.user.id)
      )
      .sort((first, second) => {
        const firstUpdated = new Date(first.updated_at || first.created_at).getTime();
        const secondUpdated = new Date(second.updated_at || second.created_at).getTime();
        return secondUpdated - firstUpdated;
      });
  }

  function latestChallengeInvite(item: TalentProfile) {
    return pairChallengeInvites(item)?.[0] || null;
  }

  function activeChallengeInvite(item: TalentProfile) {
    return (
      pairChallengeInvites(item)?.find((invite) => {
        const status = challengeInviteDisplayStatus(invite);
        const challenge = inviteChallenge(invite);
        return (status === "Pending" || status === "Accepted") && (!challenge || !isChallengeClosed(challenge));
      }) || null
    );
  }

  function canUseOpponentInviteAction(item: TalentProfile) {
    const activeInvite = activeChallengeInvite(item);
    if (activeInvite?.status === "Accepted") return true;
    if (
      activeInvite &&
      challengeInviteDisplayStatus(activeInvite) === "Pending" &&
      activeInvite.invited_user_id === session?.user.id
    ) return true;
    if (activeInvite) return false;
    return Boolean(profile) && targetAllowsChallenge(item);
  }

  function opponentInviteLabel(item: TalentProfile) {
    const activeInvite = activeChallengeInvite(item);
    if (activeInvite?.status === "Accepted") return "Open active room";
    if (activeInvite && challengeInviteDisplayStatus(activeInvite) === "Pending") {
      return activeInvite.invited_user_id === session?.user.id ? "Review invite" : "Invite pending";
    }
    const latestInvite = latestChallengeInvite(item);
    if (latestInvite?.status === "Accepted") return "Rematch";
    if (latestInvite && ["Declined", "Withdrawn", "Expired"].includes(challengeInviteDisplayStatus(latestInvite))) {
      return "Challenge again";
    }
    if (profileChallengeAvailability(item) === "People I follow" && !targetAllowsChallenge(item)) return "Followers only";
    return "Challenge";
  }

  function opponentInviteTitle(item: TalentProfile) {
    const activeInvite = activeChallengeInvite(item);
    if (activeInvite?.status === "Accepted") return "Open your active challenge room.";
    if (activeInvite && challengeInviteDisplayStatus(activeInvite) === "Pending") {
      return activeInvite.invited_user_id === session?.user.id
        ? "Review this person's pending invitation."
        : "This person already has your pending invitation.";
    }
    if (!profile) return "Save your profile before sending an invitation.";
    if (!targetAllowsChallenge(item)) return "This person only accepts invitations from profiles they follow.";
    return latestChallengeInvite(item)
      ? "Create a new challenge without changing the previous result."
      : "Create a challenge invitation.";
  }

  function notificationKey(notification: AppNotification) {
    return `${notification.id}-${notification.createdAt}`;
  }

  async function persistNotificationReads(keys: string[]) {
    if (!supabase || !session?.user.id || keys.length === 0) return;
    await supabase.from("user_notification_reads").upsert(
      keys.map((notification_key) => ({ user_id: session.user.id, notification_key })),
      { onConflict: "user_id,notification_key", ignoreDuplicates: true }
    );
  }

  async function persistNotificationDismissals(keys: string[]) {
    if (!supabase || !session?.user.id || keys.length === 0) return true;
    const { error } = await supabase.from("user_notification_dismissals").upsert(
      keys.map((notification_key) => ({ user_id: session.user.id, notification_key })),
      { onConflict: "user_id,notification_key", ignoreDuplicates: true }
    );
    return !error;
  }

  async function dismissNotificationKeys(keys: string[], label: string) {
    if (keys.length === 0) return;
    setDismissedNotificationKeys((items) => Array.from(new Set([...items, ...keys])));
    setNotificationUndo({ keys, label });

    if (!(await persistNotificationDismissals(keys))) {
      setDismissedNotificationKeys((items) => items.filter((key) => !keys.includes(key)));
      setNotificationUndo(null);
      setMessage("The notification could not be dismissed. Please try again.", "error");
    }
  }

  function dismissNotification(notification: AppNotification) {
    const key = notificationKey(notification);
    void dismissNotificationKeys([key], `“${notification.title}” dismissed.`);
  }

  function clearReadNotifications() {
    const readSet = new Set(readNotificationKeys);
    const keys = notifications.map(notificationKey).filter((key) => readSet.has(key));
    void dismissNotificationKeys(keys, `${keys.length} read notification${keys.length === 1 ? "" : "s"} cleared.`);
  }

  async function undoNotificationDismissal() {
    if (!notificationUndo) return;
    const undo = notificationUndo;
    setNotificationUndo(null);
    setDismissedNotificationKeys((items) => items.filter((key) => !undo.keys.includes(key)));

    if (!supabase || !session?.user.id) return;
    const { error } = await supabase
      .from("user_notification_dismissals")
      .delete()
      .eq("user_id", session.user.id)
      .in("notification_key", undo.keys);

    if (error) {
      setDismissedNotificationKeys((items) => Array.from(new Set([...items, ...undo.keys])));
      setMessage("The notification could not be restored. Please try again.", "error");
    }
  }

  function markNotificationRead(notification: AppNotification) {
    const key = notificationKey(notification);
    setReadNotificationKeys((items) => (items.includes(key) ? items : [...items, key]));
    void persistNotificationReads([key]);
  }

  function openNotificationTarget(event: MouseEvent<HTMLAnchorElement>, notification: AppNotification) {
    event.preventDefault();
    event.stopPropagation();
    markNotificationRead(notification);

    const targetChallenge = notification.challengeId
      ? challenges.find((challenge) => challenge.id === notification.challengeId)
      : null;

    if (targetChallenge) {
      setSelectedStatus(isChallengeClosed(targetChallenge) ? "Completed" : "Open");
      setRoomDiscoveryMode(isChallengeClosed(targetChallenge) ? "Newest" : "Trending");
      setRoomSearch("");
      setSelectedLane("All");
      setSelectedActivityProfile(null);
      setHighlightedChallengeId(targetChallenge.id);
      window.setTimeout(() => setHighlightedChallengeId(null), 2600);
    } else if (notification.challengeTitle) {
      setRoomSearch(notification.challengeTitle);
      setSelectedLane("All");
    }

    const returnContext: NotificationReturnContext = {
      filter: selectedNotificationFilter,
      search: notificationSearch,
      scrollY: window.scrollY,
      notificationTitle: notification.title
    };

    openSection(notification.href, true, { talent7NotificationReturn: returnContext });
  }

  function markAllNotificationsRead() {
    const keys = notifications.map(notificationKey);
    setReadNotificationKeys((items) => {
      const merged = new Set(items);
      keys.forEach((key) => merged.add(key));
      return Array.from(merged);
    });
    void persistNotificationReads(keys);
  }

  async function savePushNotificationPreferences() {
    if (!supabase || !session) return;
    setSavingPushPreferences(true);

    const { error } = await supabase.from("notification_preferences").upsert(
      {
        user_id: session.user.id,
        ...pushPreferences,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

    if (error) {
      setMessage(`Notification preferences were not saved: ${error.message}`, "error");
      setSavingPushPreferences(false);
      return;
    }

    await supabase
      .from("push_devices")
      .update({ enabled: pushPreferences.push_enabled, updated_at: new Date().toISOString() })
      .eq("user_id", session.user.id);

    if (pushPreferences.push_enabled) {
      window.Talent7Push?.requestPermissionAndToken();
    }

    setMessage("Notification preferences saved.", "success");
    setSavingPushPreferences(false);
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

    if (session.access_token) {
      const r2Response = await fetch("/api/media", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          kind: bucket,
          folder,
          fileName: file.name,
          contentType: file.type,
          size: file.size
        })
      });

      if (r2Response.ok) {
        const result = (await r2Response.json()) as { uploadUrl?: string; publicUrl?: string };
        if (!result.uploadUrl || !result.publicUrl) throw new Error("R2 returned an incomplete upload address.");

        const uploadResponse = await fetch(result.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type.toLowerCase() },
          body: file
        });
        if (!uploadResponse.ok) {
          throw new Error(
            uploadResponse.status === 403
              ? "R2 rejected the upload. Check the bucket CORS policy and API credentials."
              : `R2 upload failed with status ${uploadResponse.status}.`
          );
        }

        return result.publicUrl;
      }

      if (r2Response.status !== 503) {
        const result = (await r2Response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error || "Could not prepare the R2 upload.");
      }
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

  async function deleteR2MediaFile(mediaUrl: string) {
    if (!session?.access_token || !mediaUrl) return { managed: false, deleted: false };

    const response = await fetch("/api/media", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ mediaUrl })
    });

    if (response.status === 503) return { managed: false, deleted: false };
    const result = (await response.json().catch(() => null)) as
      | { managed?: boolean; deleted?: boolean; error?: string }
      | null;
    if (!response.ok) throw new Error(result?.error || "Could not remove the R2 media file.");
    return { managed: Boolean(result?.managed), deleted: Boolean(result?.deleted) };
  }

  function roomJoins(challengeId: string) {
    return joins.filter((join) => join.challenge_id === challengeId);
  }

  function participantGroup(challengeId: string, side: string, role?: JoinRole) {
    return roomJoins(challengeId).filter((join) => {
      // Early versions stored "Open invite" as if it were a third side.
      // It actually meant the open Team B slot, so keep those saved joins visible
      // under Team B while all new joins use the canonical side names.
      const sideMatches = join.side === side || (side === "Team B" && join.side === "Open invite");
      const roleMatches = !role || join.role === role;

      return sideMatches && roleMatches;
    });
  }

  function challengeSideRoster(challenge: Challenge, side: "Team A" | "Team B") {
    return participantGroup(challenge.id, side, "Challenger");
  }

  function challengeSideDisplay(challenge: Challenge, side: "Team A" | "Team B") {
    return resolvedChallengeSideName(challenge, side, joins);
  }

  function challengeWinnerDisplay(challenge: Challenge, winner = challenge.winner) {
    return resolvedChallengeWinnerName(challenge, joins, winner);
  }

  function challengeSideControlLabel(challenge: Challenge, side: "Team A" | "Team B") {
    const display = challengeSideDisplay(challenge, side);
    return display === `Open ${side}` ? side : display;
  }

  function challengeRosterState(challenge: Challenge) {
    const required = challengeRosterSize(challenge);
    const teamA = challengeSideRoster(challenge, "Team A").length;
    const teamB = challengeSideRoster(challenge, "Team B").length;
    return { required, teamA, teamB, ready: teamA >= required && teamB >= required };
  }

  function challengeRosterMessage(challenge: Challenge) {
    const roster = challengeRosterState(challenge);
    return `${challengeMatchFormat(challenge)} · Team A ${roster.teamA}/${roster.required} · Team B ${roster.teamB}/${roster.required}`;
  }

  function canUseRoomChat(challenge: Challenge) {
    if (!session?.user.id) return false;
    if (challenge.created_by === session.user.id) return true;
    return joins.some((join) => join.challenge_id === challenge.id && join.user_id === session.user.id);
  }

  function challengeSchedule(challengeId: string) {
    return challengeSchedules.find((schedule) => schedule.challenge_id === challengeId) || null;
  }

  function canCoordinateChallenge(challenge: Challenge) {
    if (!session?.user.id || isChallengeClosed(challenge)) return false;
    if (challenge.created_by === session.user.id) return true;

    const acceptedInvite = invites.some(
      (invite) =>
        invite.challenge_id === challenge.id &&
        invite.invited_user_id === session.user.id &&
        invite.status === "Accepted"
    );
    const challengerJoin = joins.some(
      (join) =>
        join.challenge_id === challenge.id && join.user_id === session.user.id && join.role === "Challenger"
    );

    return acceptedInvite || challengerJoin;
  }

  function formatChallengeSchedule(schedule: ChallengeSchedule) {
    return new Date(schedule.scheduled_for).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  async function recordChallengeRoomView(challenge: Challenge) {
    if (recordedRoomViewsRef.current.has(challenge.id)) return;

    if (!supabase || challenge.id.startsWith("sample-")) {
      recordedRoomViewsRef.current.add(challenge.id);
      setRoomViewCounts((current) => ({ ...current, [challenge.id]: (current[challenge.id] || 0) + 1 }));
      return;
    }
    if (!session?.user.id && !roomViewerToken) return;

    const { data, error } = await supabase.rpc("record_challenge_room_view", {
      target_challenge_id: challenge.id,
      anonymous_viewer_token: session?.user.id ? null : roomViewerToken
    });
    if (error) return;

    recordedRoomViewsRef.current.add(challenge.id);
    const result = (data as Array<{ room_id: string; unique_views: number | string }> | null)?.[0];
    if (result) {
      setRoomViewCounts((current) => ({ ...current, [result.room_id]: Number(result.unique_views) || 0 }));
    }
  }

  function handleRoomWorkspaceToggle(event: FormEvent<HTMLDetailsElement>, challenge: Challenge) {
    if (event.currentTarget.open) {
      setLockedRoomPageIds(pagedChallenges.map((room) => room.id));
      setActivePresenceChallengeId(challenge.id);
      void recordChallengeRoomView(challenge);
      return;
    }

    if (activePresenceChallengeId === challenge.id) {
      setActivePresenceChallengeId(null);
      setLockedRoomPageIds(null);
    }
  }

  function roomChatHint(challenge: Challenge) {
    if (!session) return "Log in to read and send room messages.";
    if (!canUseRoomChat(challenge)) return "Join this challenge first to send room messages.";
    if (isChallengeClosed(challenge)) return "This room is closed, so chat is read-only.";
    return "Use room chat for coordination. Avoid sharing phone numbers or sensitive personal details.";
  }

  function joinChoice(challengeId: string) {
    return joinChoices[challengeId] || { role: "Challenger" as JoinRole, side: "Team A" };
  }

  function updateJoinChoice(challengeId: string, choice: Partial<{ role: JoinRole; side: string }>) {
    setJoinChoices((current) => ({
      ...current,
      [challengeId]: {
        ...(current[challengeId] || { role: "Challenger" as JoinRole, side: "Team A" }),
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
    if (isOwnerReviewer) return true;
    if (challenge.created_by === session?.user.id) return true;
    if (ids.length === 0) {
      return joins.some(
        (join) =>
          join.challenge_id === challenge.id &&
          join.user_id === session?.user.id &&
          join.role === "Challenger"
      );
    }

    return userTeamRoles(challenge).some((item) => proofManagerRoles.includes(item.role));
  }

  function canManageTeamResult(challenge: Challenge) {
    const ids = challengeTeamIds(challenge);
    if (isOwnerReviewer) return true;
    if (challenge.created_by === session?.user.id) return true;
    if (ids.length === 0) return false;

    return userTeamRoles(challenge).some((item) => resultManagerRoles.includes(item.role));
  }

  function canManageChallengeLive(challenge: Challenge) {
    if (isChallengeClosed(challenge)) return false;
    if (!hasSupabaseConfig) return true;
    if (!session?.user.id) return false;
    if (isOwnerReviewer || challenge.created_by === session.user.id) return true;

    const isAcceptedOpponent = invites.some(
      (invite) =>
        invite.challenge_id === challenge.id &&
        invite.invited_user_id === session.user.id &&
        invite.status === "Accepted"
    );
    if (isAcceptedOpponent) return true;

    return userTeamRoles(challenge).some((item) => resultManagerRoles.includes(item.role));
  }

  function canManageChallengeVoting(challenge: Challenge) {
    return canManageChallengeLive(challenge);
  }

  function liveVideoDraft(challengeId: string) {
    if (Object.prototype.hasOwnProperty.call(liveVideoDrafts, challengeId)) {
      return liveVideoDrafts[challengeId];
    }

    const liveSession = liveSessionsByRoom[challengeId];
    return liveSession?.youtube_video_id ? youtubeWatchUrl(liveSession.youtube_video_id) : "";
  }

  function liveProviderDraft(challengeId: string): ChallengeLiveProvider {
    return liveProviderDrafts[challengeId] || liveSessionsByRoom[challengeId]?.provider || "LiveKit";
  }

  async function setChallengeLiveSession(challenge: Challenge, status: ChallengeLiveStatus) {
    if (!canManageChallengeLive(challenge)) {
      setMessage("Only the room creator, accepted opponent, authorized team manager, or Talent7 admin can manage this broadcast.", "error");
      return;
    }

    if (status === "Live" && !challengeRosterState(challenge).ready) {
      setMessage(`The registered roster is not full yet. ${challengeRosterMessage(challenge)}.`, "warning");
      return;
    }

    const currentSession = liveSessionsByRoom[challenge.id];
    const provider = status === "Ended" ? currentSession?.provider || "LiveKit" : liveProviderDraft(challenge.id);
    if (status === "Ended" && currentSession?.status !== "Live") {
      setMessage("Only a live broadcast can be ended.", "error");
      return;
    }

    const videoId = provider === "YouTube"
      ? status === "Ended"
        ? currentSession?.youtube_video_id || ""
        : youtubeVideoId(liveVideoDraft(challenge.id))
      : "";
    if (provider === "YouTube" && !videoId) {
      setMessage("Enter a valid public YouTube video, scheduled live, or livestream URL.", "error");
      return;
    }

    const actionKey = `${challenge.id}-${status}`;
    const shouldResetReactions =
      Boolean(currentSession) &&
      (currentSession?.provider !== provider || currentSession?.youtube_video_id !== (videoId || null) || currentSession?.status === "Ended");
    setLiveSessionActionKey(actionKey);

    try {
      if (!supabase) {
        const now = new Date().toISOString();
        const nextSession: ChallengeLiveSession = {
          id: currentSession?.id || crypto.randomUUID(),
          challenge_id: challenge.id,
          youtube_video_id: videoId || null,
          provider,
          livekit_room_name: provider === "LiveKit" ? `talent7-challenge-${challenge.id}` : null,
          status,
          created_by: currentSession?.created_by || session?.user.id || "preview-user",
          updated_by: session?.user.id || "preview-user",
          started_at:
            status === "Live" ? currentSession?.started_at || now : status === "Ended" ? currentSession?.started_at || now : null,
          ended_at: status === "Ended" ? now : null,
          created_at: currentSession?.created_at || now,
          updated_at: now
        };

        setChallengeLiveSessions((sessions) => [
          nextSession,
          ...sessions.filter((item) => item.challenge_id !== challenge.id)
        ]);
        if (shouldResetReactions) {
          setChallengeLiveReactionTotals((totals) =>
            totals.filter((item) => item.challenge_id !== challenge.id)
          );
        }
      } else {
        const { data, error } = await supabase.rpc("set_challenge_live_session", {
          target_challenge_id: challenge.id,
          target_youtube_video_id: videoId || null,
          target_status: status,
          target_provider: provider
        });
        if (error) throw error;

        const updatedSession = ((data || []) as ChallengeLiveSession[])[0];
        if (updatedSession) {
          setChallengeLiveSessions((sessions) => [
            updatedSession,
            ...sessions.filter((item) => item.challenge_id !== challenge.id)
          ]);
        }
        if (shouldResetReactions) {
          setChallengeLiveReactionTotals((totals) =>
            totals.filter((item) => item.challenge_id !== challenge.id)
          );
        }
      }

      if (videoId) setLiveVideoDrafts((drafts) => ({ ...drafts, [challenge.id]: youtubeWatchUrl(videoId) }));
      setMessage(
        status === "Ready"
          ? provider === "LiveKit"
            ? "Native Talent7 live room prepared. Start it when both challengers are ready."
            : "YouTube broadcast link saved. Start the stream in YouTube Studio before going live in this room."
          : status === "Live"
            ? "Broadcast is now live in this challenge room."
            : provider === "YouTube"
              ? "Broadcast ended. The YouTube replay remains available in the room."
              : "Native broadcast ended and camera access is closed.",
        "success"
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The room broadcast could not be updated.",
        "error"
      );
    } finally {
      setLiveSessionActionKey(null);
    }
  }

  async function sendChallengeLiveReaction(challenge: Challenge, reaction: LiveReactionName) {
    if (!requireLogin("react to this live room")) return;

    const liveSession = liveSessionsByRoom[challenge.id];
    if (!liveSession || liveSession.status !== "Live") {
      setMessage("This room is not live right now.", "warning");
      return;
    }

    const actionKey = `${challenge.id}-${reaction}`;
    setLiveReactionActionKey(actionKey);

    try {
      if (!supabase) return;
      const { data, error } = await supabase.rpc("send_challenge_live_reaction", {
        target_challenge_id: challenge.id,
        target_reaction: reaction
      });
      if (error) throw error;

      const updatedTotal = ((data || []) as ChallengeLiveReactionTotal[])[0];
      if (updatedTotal) {
        setChallengeLiveReactionTotals((totals) => [
          updatedTotal,
          ...totals.filter(
            (item) =>
              item.live_session_id !== updatedTotal.live_session_id || item.reaction !== updatedTotal.reaction
          )
        ]);
      }
    } catch (error) {
      setMessage(
        readableAuthError(error, "Your live reaction could not be sent."),
        "warning"
      );
    } finally {
      setLiveReactionActionKey(null);
    }
  }

  async function setChallengeVotingWindow(challenge: Challenge, action: "Open" | "Close") {
    if (!canManageChallengeVoting(challenge)) {
      setMessage("Only the room creator, accepted opponent, authorized team manager, or Talent7 admin can manage voting.", "error");
      return;
    }

    if (action === "Open" && !challengeRosterState(challenge).ready) {
      setMessage(`Voting cannot open until both rosters are full. ${challengeRosterMessage(challenge)}.`, "warning");
      return;
    }

    const durationValue = votingDurationDrafts[challenge.id] || "15";
    const durationMinutes = action === "Open" && durationValue !== "manual" ? Number(durationValue) : null;
    if (action === "Open" && durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 1)) {
      setMessage("Choose a valid voting duration.", "error");
      return;
    }

    setVotingWindowActionId(challenge.id);
    try {
      if (!supabase || challenge.id.startsWith("sample-")) {
        const now = new Date();
        const updatedChallenge: Challenge = {
          ...challenge,
          voting_status: action === "Open" ? "Open" : "Closed",
          voting_opened_at: action === "Open" ? now.toISOString() : challenge.voting_opened_at || null,
          voting_closes_at:
            action === "Open" && durationMinutes !== null
              ? new Date(now.getTime() + durationMinutes * 60_000).toISOString()
              : action === "Open"
                ? null
                : challenge.voting_closes_at || null,
          voting_closed_at: action === "Close" ? now.toISOString() : null,
          voting_updated_by: session?.user.id || "preview-user"
        };
        setChallenges((items) => items.map((item) => (item.id === challenge.id ? updatedChallenge : item)));
      } else {
        const { data, error } = await supabase.rpc("set_challenge_voting_window", {
          target_action: action,
          target_challenge_id: challenge.id,
          target_duration_minutes: durationMinutes
        });
        if (error) throw error;

        const updatedChallenge = ((data || []) as Challenge[])[0];
        if (updatedChallenge) {
          setChallenges((items) =>
            items.map((item) => (item.id === challenge.id ? updatedChallenge : item))
          );
        }
      }

      setMessage(
        action === "Open"
          ? durationMinutes === null
            ? "Voting opened and will remain available until an organizer closes it."
            : `Voting opened for ${durationMinutes} minutes.`
          : "Voting closed. Existing totals remain visible.",
        "success"
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The voting window could not be updated.", "error");
    } finally {
      setVotingWindowActionId(null);
    }
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
    const updateRankingClock = () => setRoomRankingTimestamp(new Date().getTime());
    updateRankingClock();
    const intervalId = window.setInterval(updateRankingClock, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let viewerToken = "";
    try {
      viewerToken = window.localStorage.getItem(roomViewerStorageKey) || "";
      if (!/^[0-9a-f-]{36}$/i.test(viewerToken)) {
        viewerToken = crypto.randomUUID();
        window.localStorage.setItem(roomViewerStorageKey, viewerToken);
      }
    } catch {
      viewerToken = crypto.randomUUID();
    }
    setRoomViewerToken(viewerToken);
  }, []);

  useEffect(() => {
    void refreshRoomViewCounts();
  }, [refreshRoomViewCounts]);

  useEffect(() => {
    const presenceKey = session?.user.id || roomViewerToken;
    if (!supabase || !presenceKey) return;

    const supabaseClient = supabase;
    const presenceChannel = supabaseClient.channel("talent7-challenge-room-presence", {
      config: { presence: { key: presenceKey } }
    });

    const updatePresenceCount = () => {
      const presenceState = presenceChannel.presenceState();
      const nextCounts: Record<string, number> = {};

      Object.values(presenceState).forEach((presenceEntries) => {
        const roomsForVisitor = new Set<string>();
        (presenceEntries as Array<{ challenge_id?: string }>).forEach((entry) => {
          if (entry.challenge_id) roomsForVisitor.add(entry.challenge_id);
        });
        roomsForVisitor.forEach((challengeId) => {
          nextCounts[challengeId] = (nextCounts[challengeId] || 0) + 1;
        });
      });

      setLiveRoomPresenceCounts(nextCounts);
    };

    presenceChannel
      .on("presence", { event: "sync" }, updatePresenceCount)
      .on("presence", { event: "join" }, updatePresenceCount)
      .on("presence", { event: "leave" }, updatePresenceCount)
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && activePresenceChallengeId) {
          void presenceChannel.track({
            challenge_id: activePresenceChallengeId,
            visitor_type: session?.user.id ? "signed-in" : "guest",
            opened_at: new Date().toISOString()
          });
        }
      });

    return () => {
      void presenceChannel.untrack();
      void supabaseClient.removeChannel(presenceChannel);
    };
  }, [activePresenceChallengeId, roomViewerToken, session?.user.id]);

  useEffect(() => {
    if (!pushNotificationsEnabled || !supabase || !session?.user.id) {
      setPushPreferences(defaultPushNotificationPreferences);
      setPushDeviceConnected(false);
      lastRegisteredPushTokenRef.current = null;
      return;
    }

    const supabaseClient = supabase;
    const userId = session.user.id;
    let cancelled = false;
    setNativePushAvailable(Boolean(window.Talent7Push));
    setPushPreferencesLoading(true);

    async function loadPushSettings() {
      const [{ data: preferences }, { data: devices }] = await Promise.all([
        supabaseClient.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle(),
        supabaseClient.from("push_devices").select("id").eq("user_id", userId).eq("enabled", true).limit(1)
      ]);

      if (cancelled) return;
      const resolvedPreferences = preferences
        ? {
          push_enabled: preferences.push_enabled,
          challenge_invites: preferences.challenge_invites,
          challenge_updates: preferences.challenge_updates,
          live_rooms: preferences.live_rooms,
          voting_windows: preferences.voting_windows,
          proof_results: preferences.proof_results,
          social_updates: preferences.social_updates,
          weekly_summary: preferences.weekly_summary ?? true
        }
        : defaultPushNotificationPreferences;

      setPushPreferences(resolvedPreferences);
      setPushDeviceConnected(Boolean(devices?.length));
      setPushPreferencesLoading(false);
    }

    async function handleNativePushToken(event: Event) {
      const detail = (event as CustomEvent<{ token?: string }>).detail;
      const token = detail?.token?.trim() || "";
      if (token.length < 32) return;

      const registrationKey = `${userId}:${token}`;
      if (lastRegisteredPushTokenRef.current === registrationKey) return;
      lastRegisteredPushTokenRef.current = registrationKey;

      const { error } = await supabaseClient.rpc("register_push_device", {
        target_token: token,
        target_platform: "Android",
        target_device_name: navigator.userAgent.slice(0, 120)
      });

      if (cancelled) return;
      if (error) {
        lastRegisteredPushTokenRef.current = null;
        setPushDeviceConnected(false);
        setMessage(`Push registration failed: ${error.message}`, "error");
        return;
      }
      setPushDeviceConnected(true);
    }

    window.addEventListener("talent7-native-push-token", handleNativePushToken);
    void loadPushSettings();

    return () => {
      cancelled = true;
      window.removeEventListener("talent7-native-push-token", handleNativePushToken);
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (!pushNotificationsEnabled || !supabase || !session?.user.id) {
      setPushNotificationEvents([]);
      return;
    }

    const supabaseClient = supabase;
    const userId = session.user.id;
    let cancelled = false;

    async function loadPushNotificationEvents() {
      const { data } = await supabaseClient
        .from("push_notification_events")
        .select("id, category, title, body, href, resource_id, created_at")
        .eq("user_id", userId)
        .in("category", ["Live room", "Voting", "Weekly summary"])
        .order("created_at", { ascending: false })
        .limit(30);

      if (!cancelled) setPushNotificationEvents((data || []) as PushNotificationEvent[]);
    }

    const channel = supabaseClient
      .channel(`talent7-push-events-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "push_notification_events", filter: `user_id=eq.${userId}` },
        (payload) => {
          const event = payload.new as PushNotificationEvent;
          if (event.category !== "Live room" && event.category !== "Voting" && event.category !== "Weekly summary") return;
          setPushNotificationEvents((items) => [event, ...items.filter((item) => item.id !== event.id)].slice(0, 30));
          setMessage(event.title, "info");
        }
      )
      .subscribe();

    void loadPushNotificationEvents();

    return () => {
      cancelled = true;
      void supabaseClient.removeChannel(channel);
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (!notificationReadStorageKey) {
      setReadNotificationKeys([]);
      return;
    }

    let localKeys: string[] = [];
    try {
      const saved = window.localStorage.getItem(notificationReadStorageKey);
      localKeys = saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      localKeys = [];
    }

    if (!supabase || !session?.user.id) {
      setReadNotificationKeys(localKeys);
      return;
    }

    let active = true;
    const userId = session.user.id;
    async function loadNotificationReadState() {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("user_notification_reads")
        .select("notification_key")
        .eq("user_id", userId);

      if (!active) return;
      if (error) {
        setReadNotificationKeys(localKeys);
        return;
      }

      const merged = Array.from(new Set([...localKeys, ...(data || []).map((item) => item.notification_key)]));
      setReadNotificationKeys(merged);
      if (localKeys.length > 0) {
        await supabase.from("user_notification_reads").upsert(
          localKeys.map((notification_key) => ({ user_id: userId, notification_key })),
          { onConflict: "user_id,notification_key", ignoreDuplicates: true }
        );
      }
    }

    void loadNotificationReadState();
    return () => {
      active = false;
    };
  }, [notificationReadStorageKey, session]);

  useEffect(() => {
    if (!notificationReadStorageKey) return;
    window.localStorage.setItem(notificationReadStorageKey, JSON.stringify(readNotificationKeys));
  }, [notificationReadStorageKey, readNotificationKeys]);

  useEffect(() => {
    if (!notificationDismissStorageKey) {
      setDismissedNotificationKeys([]);
      return;
    }

    let localKeys: string[] = [];
    try {
      const saved = window.localStorage.getItem(notificationDismissStorageKey);
      localKeys = saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      localKeys = [];
    }

    if (!supabase || !session?.user.id) {
      setDismissedNotificationKeys(localKeys);
      return;
    }

    let active = true;
    const userId = session.user.id;
    async function loadNotificationDismissals() {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("user_notification_dismissals")
        .select("notification_key")
        .eq("user_id", userId);

      if (!active) return;
      if (error) {
        setDismissedNotificationKeys(localKeys);
        return;
      }

      const merged = Array.from(new Set([...localKeys, ...(data || []).map((item) => item.notification_key)]));
      setDismissedNotificationKeys(merged);
      if (localKeys.length > 0) {
        await supabase.from("user_notification_dismissals").upsert(
          localKeys.map((notification_key) => ({ user_id: userId, notification_key })),
          { onConflict: "user_id,notification_key", ignoreDuplicates: true }
        );
      }
    }

    void loadNotificationDismissals();
    return () => {
      active = false;
    };
  }, [notificationDismissStorageKey, session]);

  useEffect(() => {
    if (!notificationDismissStorageKey) return;
    window.localStorage.setItem(notificationDismissStorageKey, JSON.stringify(dismissedNotificationKeys));
  }, [dismissedNotificationKeys, notificationDismissStorageKey]);

  useEffect(() => {
    if (!notificationUndo) return;
    const timeout = window.setTimeout(() => setNotificationUndo(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [notificationUndo]);

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

      setActiveAppTab("profiles");
      setActiveSection("profiles");
      setSelectedProfile(match);
      setTimeout(() => document.getElementById("profile-detail")?.scrollIntoView({ behavior: "smooth" }), 80);
    };

    openProfileFromHash();
    window.addEventListener("hashchange", openProfileFromHash);
    return () => window.removeEventListener("hashchange", openProfileFromHash);
  }, [publicProfiles]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const profileToken = search.get("profile");
    if (!profileToken) return;
    const intent = search.get("intent") === "follow" ? "follow" : "challenge";

    if (!session?.user.id) {
      setAuthMode("Log in");
      setActiveAppTab("settings");
      setActiveSection("account");
      setLoginPrompt(`Log in to ${intent === "follow" ? "follow" : "challenge"} this shared profile.`);
      window.setTimeout(() => document.getElementById("account")?.scrollIntoView({ behavior: "smooth" }), 80);
      return;
    }

    if (!profileHydrated) return;
    if (!profile) {
      setActiveAppTab("settings");
      setActiveSection("account");
      setLoginPrompt("");
      setMessage("Create your Talent7 profile first. You will return to the shared profile after saving it.", "warning");
      window.setTimeout(() => document.getElementById("account")?.scrollIntoView({ behavior: "smooth" }), 80);
      return;
    }

    const match = publicProfiles.find((item) => item.share_token === profileToken);
    if (!match) return;

    setSelectedProfile(match);
    setSharedProfileTarget({ userId: match.user_id, intent });
    setProfileSearch("");
    setActiveAppTab("profiles");
    setActiveSection("profiles");
    setLoginPrompt("");
    window.localStorage.removeItem(sharedIntentStorageKey);
    window.history.replaceState(null, "", `#${profileHash(match.username)}`);
    setMessage(
      match.user_id === session.user.id
        ? "This shared link opens your own profile."
        : `${match.display_name}'s profile is ready. Review it, then use the highlighted ${intent} action.`,
      match.user_id === session.user.id ? "warning" : "success"
    );
    void trackGrowthEvent("shared_return", { resourceType: "profile", resourceToken: profileToken, source: "shared_profile" });
    window.setTimeout(() => {
      const action = document.getElementById(`shared-profile-${intent}-action`);
      action?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (action instanceof HTMLElement) action.focus({ preventScroll: true });
    }, 160);
  }, [profile, profileHydrated, publicProfiles, session?.user.id]);

  useEffect(() => {
    if (challenges.length === 0) return;

    const openRoomFromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash.startsWith("room-")) return;

      const match = challenges.find((challenge) => roomHash(challenge.id) === hash);
      if (!match) return;

      setActiveAppTab("challenges");
      setActiveSection("rooms");
      setSelectedLane("All");
      setSelectedStatus(isChallengeClosed(match) ? "Completed" : "Open");
      setRoomDiscoveryMode(isChallengeClosed(match) ? "Newest" : "Trending");
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
    const roomToken = new URLSearchParams(window.location.search).get("room");
    if (!roomToken) return;

    if (!session?.user.id) {
      setActiveAppTab("settings");
      setActiveSection("account");
      setLoginPrompt("Log in to join or watch this shared challenge room.");
      window.setTimeout(() => document.getElementById("account")?.scrollIntoView({ behavior: "smooth" }), 80);
      return;
    }

    const match = challenges.find((challenge) => challenge.room_share_token === roomToken);
    if (!match) return;

    setActiveAppTab("challenges");
    setActiveSection("rooms");
    setSelectedLane("All");
    setSelectedStatus(isChallengeClosed(match) ? "Completed" : "Open");
    setRoomDiscoveryMode(isChallengeClosed(match) ? "Newest" : "Trending");
    setRoomSearch("");
    setHighlightedChallengeId(match.id);
    window.history.replaceState(null, "", `#${roomHash(match.id)}`);
    setMessage(`Opened the shared room for ${match.title}.`, "success");
    window.setTimeout(() => document.getElementById(roomHash(match.id))?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    window.setTimeout(() => setHighlightedChallengeId(null), 2600);
  }, [challenges, session?.user.id]);

  useEffect(() => {
    if (teams.length === 0) return;

    const openTeamFromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash.startsWith("team-")) return;

      const match = teams.find((team) => teamHash(team.id) === hash);
      if (!match) return;

      setActiveAppTab("teams");
      setActiveSection("teams");
      setHighlightedTeamId(match.id);
      setTimeout(() => document.getElementById(teamHash(match.id))?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      window.setTimeout(() => setHighlightedTeamId(null), 2600);
    };

    openTeamFromHash();
    window.addEventListener("hashchange", openTeamFromHash);
    return () => window.removeEventListener("hashchange", openTeamFromHash);
  }, [teams]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const teamToken = search.get("team");
    if (!teamToken) return;
    const intent = search.get("intent") === "join" ? "join" : "challenge";

    if (!session?.user.id) {
      setAuthMode("Log in");
      setActiveAppTab("settings");
      setActiveSection("account");
      setLoginPrompt(`Log in to ${intent === "join" ? "request to join" : "challenge"} this shared team.`);
      window.setTimeout(() => document.getElementById("account")?.scrollIntoView({ behavior: "smooth" }), 80);
      return;
    }

    if (!profileHydrated) return;
    if (!profile) {
      setActiveAppTab("settings");
      setActiveSection("account");
      setLoginPrompt("");
      setMessage("Create your Talent7 profile first. You will return to the shared team after saving it.", "warning");
      window.setTimeout(() => document.getElementById("account")?.scrollIntoView({ behavior: "smooth" }), 80);
      return;
    }

    const match = teams.find((team) => team.share_token === teamToken);
    if (!match) return;

    setSharedTeamTarget({ teamId: match.id, intent });
    setTeamSearch("");
    setActiveAppTab("teams");
    setActiveSection("teams");
    setHighlightedTeamId(match.id);
    setLoginPrompt("");
    window.localStorage.removeItem(sharedIntentStorageKey);
    window.history.replaceState(null, "", `#${teamHash(match.id)}`);
    setMessage(
      match.owner_user_id === session.user.id && intent === "join"
        ? `You already own ${match.name}.`
        : `${match.name} is ready. Review the team, then use the highlighted ${intent === "join" ? "join request" : "challenge"} action.`,
      match.owner_user_id === session.user.id && intent === "join" ? "warning" : "success"
    );
    void trackGrowthEvent("shared_return", { resourceType: "team", resourceToken: teamToken, source: "shared_team" });
    window.setTimeout(() => {
      const action = document.getElementById(`shared-team-${intent}-${match.id}`);
      document.getElementById(teamHash(match.id))?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (action instanceof HTMLElement) action.focus({ preventScroll: true });
    }, 160);
    window.setTimeout(() => setHighlightedTeamId(null), 2600);
  }, [profile, profileHydrated, session?.user.id, teams]);

  useEffect(() => {
    if (!supabase) {
      setAuthHydrated(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthHydrated(true);
      if (data.session && !tabForHash(window.location.hash)) {
        setActiveAppTab("challenges");
        setActiveSection("rooms");
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setAuthHydrated(true);
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
        setMessage("Password recovery confirmed. Set a new password below.");
        setActiveAppTab("settings");
        setActiveSection("account");
        window.setTimeout(() => document.getElementById("account")?.scrollIntoView({ behavior: "smooth" }), 80);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("open") !== "account-deletion") return;

    setAccountDeletionFormUserId(session.user.id);
    setActiveAppTab("settings");
    setActiveSection("account");
    url.searchParams.delete("open");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash || "#account"}`
    );
    window.setTimeout(
      () => document.getElementById("account-deletion-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80
    );
  }, [session]);

  useEffect(() => {
    if (!supabase) {
      setChallengeLoadError("");
      return;
    }

    void refreshChallengeRooms();
  }, [challengeReloadKey, refreshChallengeRooms]);

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
    const supabaseClient = supabase;
    const userId = session?.user.id;
    let cancelled = false;
    let inviteStatusesReady = false;
    const knownInviteStatuses = new Map<string, ChallengeInvite["status"]>();

    function rememberInviteStatus(invite: ChallengeInvite, announceResponse: boolean) {
      const previousStatus = knownInviteStatuses.get(invite.id);
      knownInviteStatuses.set(invite.id, invite.status);

      if (
        announceResponse &&
        invite.from_user_id === userId &&
        previousStatus === "Pending" &&
        invite.status !== "Pending"
      ) {
        const responseMessage =
          invite.status === "Accepted"
            ? `${invite.invited_name} accepted your challenge invitation.`
            : invite.status === "Declined"
              ? `${invite.invited_name} declined your challenge invitation.`
              : invite.status === "Expired"
                ? `Your challenge invitation for ${invite.invited_name} expired.`
                : `Your challenge invitation for ${invite.invited_name} was withdrawn.`;
        setMessage(responseMessage, invite.status === "Accepted" ? "success" : "info");
      }
    }

    async function loadInvites() {
      if (!supabaseClient || !userId) {
        setInvites([]);
        return;
      }

      await supabaseClient.rpc("expire_challenge_invites");

      const { data, error } = await supabaseClient
        .from("challenge_invites")
        .select("*")
        .or(`from_user_id.eq.${userId},invited_user_id.eq.${userId}`)
        .order("created_at", { ascending: false });

      if (cancelled || error) return;
      if (data) {
        const nextInvites = data as ChallengeInvite[];
        nextInvites.forEach((invite) => rememberInviteStatus(invite, inviteStatusesReady));
        inviteStatusesReady = true;
        setInvites(nextInvites);
      }
    }

    void loadInvites();

    if (!supabaseClient || !userId) return;

    const applyInviteChange = (payload: {
      eventType: string;
      old: Record<string, unknown>;
      new: Record<string, unknown>;
    }) => {
      const previousInvite = payload.old as Partial<ChallengeInvite>;
      const nextInvite = payload.new as Partial<ChallengeInvite>;
      const belongsToUser = [
        previousInvite.from_user_id,
        previousInvite.invited_user_id,
        nextInvite.from_user_id,
        nextInvite.invited_user_id
      ].includes(userId);

      if (!belongsToUser) return;

      if (payload.eventType === "DELETE" && previousInvite.id) {
        knownInviteStatuses.delete(previousInvite.id);
        setInvites((items) => items.filter((invite) => invite.id !== previousInvite.id));
        return;
      }

      if (nextInvite.id) {
        if (!knownInviteStatuses.has(nextInvite.id) && previousInvite.status) {
          knownInviteStatuses.set(nextInvite.id, previousInvite.status);
        }
        rememberInviteStatus(nextInvite as ChallengeInvite, inviteStatusesReady);
        inviteStatusesReady = true;
        setInvites((items) => [
          nextInvite as ChallengeInvite,
          ...items.filter((invite) => invite.id !== nextInvite.id)
        ]);
      } else {
        void loadInvites();
      }
    };

    const inviteChannel = supabaseClient
      .channel(`talent7-challenge-invites-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "challenge_invites",
          filter: `from_user_id=eq.${userId}`
        },
        applyInviteChange
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "challenge_invites",
          filter: `invited_user_id=eq.${userId}`
        },
        applyInviteChange
      )
      .subscribe();

    const refreshVisibleInvites = () => {
      if (document.visibilityState === "visible") void loadInvites();
    };
    // Realtime is primary. This short poll repairs state after a temporary
    // disconnect, suspended mobile browser, or a database publication delay.
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadInvites();
    }, 5_000);

    window.addEventListener("focus", refreshVisibleInvites);
    document.addEventListener("visibilitychange", refreshVisibleInvites);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleInvites);
      document.removeEventListener("visibilitychange", refreshVisibleInvites);
      void supabaseClient.removeChannel(inviteChannel);
    };
  }, [session?.user.id]);

  useEffect(() => {
    async function loadChallengeSchedules() {
      if (!supabase || !session?.user.id) {
        setChallengeSchedules([]);
        return;
      }

      const { data, error } = await supabase
        .from("challenge_schedules")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) return;
      setChallengeSchedules((data || []) as ChallengeSchedule[]);
    }

    loadChallengeSchedules();
  }, [session]);

  useEffect(() => {
    async function loadChallengeLiveRooms() {
      if (!supabase) return;

      const [sessionsResult, totalsResult] = await Promise.all([
        supabase.from("challenge_live_sessions").select("*").order("updated_at", { ascending: false }).limit(100),
        supabase.from("challenge_live_reaction_totals").select("*").order("updated_at", { ascending: false }).limit(500)
      ]);

      const loadError = sessionsResult.error || totalsResult.error;
      if (loadError) {
        setChallengeLiveLoadError(loadError.message);
        return;
      }

      setChallengeLiveLoadError("");
      setChallengeLiveSessions((sessionsResult.data || []) as ChallengeLiveSession[]);
      setChallengeLiveReactionTotals((totalsResult.data || []) as ChallengeLiveReactionTotal[]);
    }

    loadChallengeLiveRooms();
  }, []);

  useEffect(() => {
    if (!supabase) return;

    const supabaseClient = supabase;
    const liveUpdatesChannel = supabaseClient
      .channel("talent7-live-room-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenges" },
        (payload) => {
          const previous = payload.old as Partial<Challenge>;
          if (payload.eventType === "DELETE") {
            setChallenges((items) => items.filter((item) => item.id !== previous.id));
            return;
          }

          const updatedChallenge = payload.new as Challenge;
          setChallenges((items) => {
            const mergedItems = items.some((item) => item.id === updatedChallenge.id)
              ? items.map((item) => (item.id === updatedChallenge.id ? updatedChallenge : item))
              : [updatedChallenge, ...items];

            return mergedItems.filter(
              (item, index) => mergedItems.findIndex((candidate) => candidate.id === item.id) === index
            );
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenge_joins" },
        (payload) => {
          const previous = payload.old as Partial<ChallengeJoin>;
          if (payload.eventType === "DELETE") {
            setJoins((items) => items.filter((item) => item.id !== previous.id));
            return;
          }

          const updatedJoin = payload.new as ChallengeJoin;
          setJoins((items) =>
            items.some((item) => item.id === updatedJoin.id)
              ? items.map((item) => (item.id === updatedJoin.id ? updatedJoin : item))
              : [updatedJoin, ...items]
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenge_live_sessions" },
        (payload) => {
          const previous = payload.old as Partial<ChallengeLiveSession>;
          if (payload.eventType === "DELETE") {
            setChallengeLiveSessions((sessions) => sessions.filter((item) => item.id !== previous.id));
            return;
          }

          const liveSession = payload.new as ChallengeLiveSession;
          setChallengeLiveSessions((sessions) => [
            liveSession,
            ...sessions.filter((item) => item.id !== liveSession.id)
          ]);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenge_live_reaction_totals" },
        (payload) => {
          const previous = payload.old as Partial<ChallengeLiveReactionTotal>;
          if (payload.eventType === "DELETE") {
            setChallengeLiveReactionTotals((totals) =>
              totals.filter(
                (item) =>
                  item.live_session_id !== previous.live_session_id || item.reaction !== previous.reaction
              )
            );
            return;
          }

          const reactionTotal = payload.new as ChallengeLiveReactionTotal;
          setChallengeLiveReactionTotals((totals) => [
            reactionTotal,
            ...totals.filter(
              (item) =>
                item.live_session_id !== reactionTotal.live_session_id || item.reaction !== reactionTotal.reaction
            )
          ]);
        }
      )
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(liveUpdatesChannel);
    };
  }, []);

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
    async function loadSavedRooms() {
      if (!supabase || !session?.user.id) {
        setSavedRooms([]);
        setSavedRoomsLoadError("");
        return;
      }

      const { data, error } = await supabase
        .from("challenge_room_saves")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setSavedRooms([]);
        setSavedRoomsLoadError(
          error.code === "42P01"
            ? "Saved rooms need the latest Supabase migration."
            : "Saved rooms could not be loaded right now."
        );
        return;
      }

      setSavedRooms((data || []) as ChallengeRoomSave[]);
      setSavedRoomsLoadError("");
    }

    void loadSavedRooms();
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
    async function loadSupporterEntitlements() {
      if (!supabase) {
        setSupporterEntitlements([]);
        return;
      }

      const { data, error } = await supabase
        .from("supporter_entitlements")
        .select("user_id, tier, active")
        .eq("active", true);
      if (!error && data) setSupporterEntitlements(data as SupporterEntitlement[]);
    }

    void loadSupporterEntitlements();
  }, []);

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
    async function loadAccountDeletionRequests() {
      if (!supabase || !session?.user.id) {
        setAccountDeletionRequests([]);
        return;
      }

      const { data, error } = await supabase
        .from("account_deletion_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        setAccountDeletionRequests([]);
        return;
      }
      setAccountDeletionRequests((data || []) as AccountDeletionRequest[]);
    }

    loadAccountDeletionRequests();
  }, [accountDeletionReloadKey, isOwnerReviewer, session]);

  useEffect(() => {
    if (!isOwnerReviewer) {
      setAccountDeletionClock(0);
      return;
    }

    const updateClock = () => setAccountDeletionClock(Date.now());
    updateClock();
    const interval = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(interval);
  }, [isOwnerReviewer]);

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

    const requiredPasswordLength = authMode === "Sign up" ? 8 : 6;
    if (!email || password.length < requiredPasswordLength) {
      setMessage(`Enter an email and a password with at least ${requiredPasswordLength} characters.`);
      return;
    }
    if (turnstileSiteKey && !authCaptchaToken) {
      setMessage("Complete the security check before continuing.", "error");
      return;
    }

    setAuthLoading(true);
    setMessage("");
    setLoginPrompt("");

    const intentSearch = sharedIntentSearch(window.location.search) || window.localStorage.getItem(sharedIntentStorageKey) || "";
    const authReturnUrl = intentSearch ? `${siteUrl("/")}?${intentSearch}#account` : `${siteUrl("/")}#account`;
    if (intentSearch) window.localStorage.setItem(sharedIntentStorageKey, intentSearch);

    const result =
      authMode === "Sign up"
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              captchaToken: authCaptchaToken || undefined,
              emailRedirectTo: authReturnUrl
            }
          })
        : await supabase.auth.signInWithPassword({
            email,
            password,
            options: { captchaToken: authCaptchaToken || undefined }
          });

    setAuthCaptchaToken("");
    setAuthCaptchaResetKey((key) => key + 1);

    if (result.error) {
      setMessage(result.error.message);
    } else if (authMode === "Sign up" && !result.data.session) {
      setConfirmationEmail(email);
      setAuthMode("Log in");
      setMessage("Account created. Check your email to confirm it, then log in.");
    } else {
      setConfirmationEmail("");
      setMessage(authMode === "Sign up" ? "Account created and logged in." : "Logged in.");
      void trackGrowthEvent(authMode === "Sign up" ? "signup" : "login", {
        source: intentSearch ? "shared_intent" : "account"
      });
      if (authMode === "Log in" && !intentSearch) {
        window.setTimeout(() => openSection("rooms", true), 80);
      }
    }

    setAuthLoading(false);
  }

  async function logOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthMode("Log in");
    setLoginPrompt("");
    setAccountDeletionFormUserId(null);
    setSelectedStatus("Open");
    setMessage("Logged out.");
    openSection("account", true);
  }

  async function requestPasswordReset(event: MouseEvent<HTMLButtonElement>) {
    const email = String(new FormData(event.currentTarget.form || undefined).get("email") || "").trim();
    if (!supabase) {
      setMessage("Connect Supabase before requesting a password reset.");
      return;
    }
    if (!email) {
      setMessage("Enter your account email first, then select Forgot password.");
      return;
    }
    if (turnstileSiteKey && !authCaptchaToken) {
      setMessage("Complete the security check before requesting a password reset.", "error");
      return;
    }

    setAuthEmailAction("reset");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        captchaToken: authCaptchaToken || undefined,
        redirectTo: `${siteUrl("/")}#account`
      });

      if (error) {
        setMessage(readableAuthError(error, "Password reset email could not be sent. Please wait a moment and try again."), "error");
      } else {
        setMessage("Password reset email sent. Open its link on this device to choose a new password.", "success");
      }
    } catch (error) {
      setMessage(readableAuthError(error, "Password reset email could not be sent. Check your connection and try again."), "error");
    } finally {
      setAuthCaptchaToken("");
      setAuthCaptchaResetKey((key) => key + 1);
      setAuthEmailAction(null);
    }
  }

  async function resendConfirmationEmail() {
    if (!supabase || !confirmationEmail) return;
    if (turnstileSiteKey && !authCaptchaToken) {
      setMessage("Complete the security check before resending the confirmation email.", "error");
      return;
    }
    setAuthEmailAction("resend");
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: confirmationEmail,
        options: {
          captchaToken: authCaptchaToken || undefined,
          emailRedirectTo: `${siteUrl("/")}#account`
        }
      });

      if (error) {
        setMessage(readableAuthError(error, "Confirmation email could not be sent. Please wait a moment and try again."), "error");
      } else {
        setMessage("Confirmation email sent again.", "success");
      }
    } catch (error) {
      setMessage(readableAuthError(error, "Confirmation email could not be sent. Check your connection and try again."), "error");
    } finally {
      setAuthCaptchaToken("");
      setAuthCaptchaResetKey((key) => key + 1);
      setAuthEmailAction(null);
    }
  }

  async function cancelPasswordRecovery() {
    if (!supabase) return;
    setRecoveryCancelling(true);

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      setIsPasswordRecovery(false);
      setAuthMode("Log in");
      setMessage("Password recovery cancelled. You can log in or request a new reset link.", "info");
    } catch (error) {
      setMessage(readableAuthError(error, "Password recovery could not be cancelled. Close this page and try again."), "error");
    } finally {
      setRecoveryCancelling(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;

    if (!supabase || !session) {
      setMessage("Log in before changing your password.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("current_password") || "");
    const newPassword = String(form.get("new_password") || "");
    const confirmPassword = String(form.get("confirm_password") || "");

    if (!isPasswordRecovery && !currentPassword) {
      setMessage("Enter your current password before choosing a new one.");
      return;
    }

    if (newPassword.length < 8) {
      setMessage("Enter a new password with at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("The two new-password fields do not match.");
      return;
    }

    setUpdatingPassword(true);
    setMessage("");

    try {
      const passwordUpdate = isPasswordRecovery
        ? { password: newPassword }
        : { current_password: currentPassword, password: newPassword };
      const { error } = await supabase.auth.updateUser(passwordUpdate);
      if (error) throw error;

      formElement.reset();
      setShowCurrentPassword(false);
      setShowNewPassword(false);

      if (isPasswordRecovery) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
        if (signOutError) throw signOutError;
        setIsPasswordRecovery(false);
        setAuthMode("Log in");
        setMessage("Password reset complete. Log in with your new password.", "success");
      } else {
        setMessage("Password updated.", "success");
      }
    } catch (error) {
      setMessage(readableAuthError(error, "Your password could not be updated. Please try again."), "error");
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function submitAccountDeletionRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!session?.access_token) {
      setMessage("Log in again before requesting account deletion.", "error");
      return;
    }

    const form = new FormData(formElement);
    if (turnstileSiteKey && !accountDeletionCaptchaToken) {
      setMessage("Complete the security check before requesting account deletion.", "error");
      return;
    }
    setSavingAccountDeletion(true);
    setMessage("");

    try {
      const response = await fetch("/api/account-deletion", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          password: String(form.get("deletion_password") || ""),
          confirmation: String(form.get("deletion_confirmation") || ""),
          reason: String(form.get("deletion_reason") || ""),
          captchaToken: accountDeletionCaptchaToken || undefined
        })
      });
      const result = (await response.json().catch(() => null)) as
        | { request?: AccountDeletionRequest; error?: string }
        | null;
      if (!response.ok || !result?.request) throw new Error(result?.error || "The deletion request could not be saved.");

      formElement.reset();
      setAccountDeletionFormUserId(null);
      setAccountDeletionReloadKey((key) => key + 1);
      setMessage("Account deletion requested. You can cancel during the seven-day waiting period.", "success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The deletion request could not be saved.", "error");
    } finally {
      setAccountDeletionCaptchaToken("");
      setAccountDeletionCaptchaResetKey((key) => key + 1);
      setSavingAccountDeletion(false);
    }
  }

  function confirmCancelAccountDeletion(request: AccountDeletionRequest) {
    requestConfirmation({
      title: "Cancel account deletion?",
      detail: "Your Talent7 account and content will remain active. You can submit a new request later.",
      confirmLabel: "Keep my account",
      cancelLabel: "Continue with deletion",
      onConfirm: () => cancelAccountDeletion(request)
    });
  }

  async function cancelAccountDeletion(request: AccountDeletionRequest) {
    if (!session?.access_token) return;
    setAccountDeletionActionId(request.id);
    setMessage("");

    try {
      const response = await fetch("/api/account-deletion", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ requestId: request.id })
      });
      const result = (await response.json().catch(() => null)) as
        | { request?: AccountDeletionRequest; error?: string }
        | null;
      if (!response.ok || !result?.request) throw new Error(result?.error || "The deletion request could not be cancelled.");

      setAccountDeletionFormUserId(null);
      setAccountDeletionReloadKey((key) => key + 1);
      setMessage("Account deletion cancelled. Your account will remain active.", "success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The deletion request could not be cancelled.", "error");
    } finally {
      setAccountDeletionActionId(null);
    }
  }

  async function runAccountDeletionAdminAction(
    request: AccountDeletionRequest,
    action: "review" | "reject" | "complete"
  ) {
    if (!session?.access_token || !isOwnerReviewer) return;
    setAccountDeletionActionId(request.id);
    setMessage("");

    try {
      const response = await fetch("/api/account-deletion", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ requestId: request.id, action })
      });
      const result = (await response.json().catch(() => null)) as
        | { request?: AccountDeletionRequest; error?: string }
        | null;
      if (!response.ok || !result?.request) throw new Error(result?.error || "The deletion request could not be updated.");

      setAccountDeletionReloadKey((key) => key + 1);
      setMessage(
        action === "complete"
          ? "Account deletion completed and the request email was redacted."
          : action === "reject"
            ? "Account deletion request rejected."
            : "Account deletion request moved into review.",
        "success"
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The deletion request could not be updated.", "error");
    } finally {
      setAccountDeletionActionId(null);
    }
  }

  function confirmCompleteAccountDeletion(request: AccountDeletionRequest) {
    requestConfirmation({
      title: "Permanently delete this account?",
      detail: `This permanently removes ${request.account_email || "the requested account"}, its database records, and managed R2 media. This cannot be undone.`,
      confirmLabel: "Permanently delete",
      onConfirm: () => runAccountDeletionAdminAction(request, "complete")
    });
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
      "You can join now as a challenger, audience voter, organizer, or gaming squad. Showcase Talent, Coaching, and Guidance are planned future experiences.",
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

  async function shareChallengeInvite(invite: ChallengeInvite) {
    if (!invite.share_token) {
      setMessage("This invitation does not have a share link yet. Apply the invitation-sharing Supabase migration first.", "warning");
      return;
    }

    const title = challengeTitle(invite.challenge_id);
    const url = siteUrl(`/invite/${invite.share_token}`);
    const shareData = {
      title: `${title} challenge on Talent7`,
      text: `${profileName()} challenged you to ${title} on Talent7. Preview the matchup and respond:`,
      url
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setMessage("Challenge invitation shared.", "success");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    await copyShareText("Challenge invite link", `${shareData.text}\n${url}`);
  }

  async function shareChallengeResult(challenge: Challenge) {
    if (!challenge.result_share_token) {
      setMessage("This result does not have a share link yet. Apply the result-sharing Supabase migration first.", "warning");
      return;
    }

    const winner = challengeWinnerDisplay(challenge);
    const score = challenge.final_score?.trim();
    const url = siteUrl(`/result/${challenge.result_share_token}`);
    const shareData = {
      title: `${winner} won ${challenge.title} on Talent7`,
      text: `${winner} won ${challenge.title}${score ? ` (${score})` : ""} on Talent7. See the official result, audience votes, rating, and proof count:`,
      url
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        void trackGrowthEvent("result_shared", { resourceType: "challenge", resourceToken: challenge.result_share_token, source: "native_share" });
        setMessage("Challenge result shared.", "success");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    await copyShareText("Challenge result link", `${shareData.text}\n${url}`);
    void trackGrowthEvent("result_shared", { resourceType: "challenge", resourceToken: challenge.result_share_token, source: "copy_link" });
  }

  function openSection(sectionId: string, updateHash = false, historyState: Talent7HistoryState | null = null) {
    const tabId = tabForHash(sectionId);
    const section = sectionForHash(sectionId);
    if (tabId) setActiveAppTab(tabId);
    if (section) setActiveSection(section);
    setIsMoreOpen(false);

    if (updateHash) {
      window.history.pushState(historyState, "", `#${sectionId.replace(/^#/, "")}`);
      setNotificationReturnContext(notificationReturnFromHistoryState(historyState));
    }
    window.setTimeout(() => {
      document.getElementById(sectionId.replace(/^#/, ""))?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  function returnToNotifications() {
    const returnContext = notificationReturnContext;
    if (returnContext) {
      setSelectedNotificationFilter(returnContext.filter);
      setNotificationSearch(returnContext.search);
    }

    if (notificationReturnFromHistoryState(window.history.state)) {
      window.history.back();
    } else {
      openSection("notifications", true);
    }

    window.setTimeout(() => {
      if (returnContext) {
        window.scrollTo({ top: returnContext.scrollY, behavior: "smooth" });
      } else {
        document.getElementById("notifications")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 120);
  }

  function scrollToRoomShelf() {
    window.setTimeout(() => {
      document.querySelector(".roomsGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function browseActiveRooms() {
    setSelectedStatus("Open");
    setSelectedLane("All");
    setRoomSearch("");
    setSelectedActivityProfile(null);
    setRoomDiscoveryMode("Trending");
    scrollToRoomShelf();
  }

  function showMyRecommendations() {
    if (!profile?.main_interest) return;

    setSelectedStatus("Open");
    setSelectedLane("All");
    setRoomSearch("");
    setSelectedActivityProfile(null);
    setRoomDiscoveryMode("For you");
    setMessage(
      recommendedRoomCount > 0
        ? `${recommendedRoomCount} room${recommendedRoomCount === 1 ? "" : "s"} match ${profile.main_interest}.`
        : `No active ${profile.main_interest} rooms yet. You can create the first one.`
    );
    scrollToRoomShelf();
  }

  function createFromSavedInterest() {
    if (!profile?.main_interest) return;

    const activity = profile.main_interest;
    const matchSetup = inferredMatchSetup(activity);
    setChallengeCreateStep(1);
    setChallengeCreateMaxStep(1);
    setChallengeStepError("");
    setChallengeDraft((current) => ({
      ...current,
      title: activity,
      lane: laneForInterest(activity),
      team_a: profileName(),
      team_b: "",
      openOpponent: true,
      team_a_id: "",
      team_b_id: "",
      rules: rulesForActivity(activity),
      venue_name: venueForActivity(activity),
      sport_type: activity,
      booking_region: profile.region || current.booking_region || "Global",
      match_format: matchSetup.format,
      roster_size: matchSetup.rosterSize,
      invitedProfile: "",
      invitedUserId: "",
      version: current.version + 1
    }));
    setMessage(`${activity} challenge draft ready.`);
    openSection("create", true);
  }

  function switchAppTab(tabId: AppTabId) {
    const primaryTab = primaryTabs.find((item) => item.id === tabId);
    const moreTab = moreTabs.find((item) => item.id === tabId);
    openSection(primaryTab?.firstSection || moreTab?.href || "account", true);
  }

  function handlePrimaryTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, tabIndex: number) {
    const keyDirections: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    let nextIndex = tabIndex;

    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = primaryTabs.length - 1;
    else if (event.key in keyDirections) {
      nextIndex = (tabIndex + keyDirections[event.key] + primaryTabs.length) % primaryTabs.length;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = primaryTabs[nextIndex];
    switchAppTab(nextTab.id);
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(`[data-primary-tab="${nextTab.id}"]`)?.focus();
    }, 0);
  }

  function closeMoreMenu() {
    setIsMoreOpen(false);
    window.requestAnimationFrame(() => moreTriggerRef.current?.focus());
  }

  function requestConfirmation(request: ConfirmationRequest) {
    confirmationReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmationRequest(request);
    setConfirmationBusy(false);
  }

  async function runConfirmedAction() {
    if (!confirmationRequest || confirmationBusy) return;
    setConfirmationBusy(true);
    try {
      await confirmationRequest.onConfirm();
      setConfirmationRequest(null);
      window.requestAnimationFrame(() => confirmationReturnFocusRef.current?.focus());
    } finally {
      setConfirmationBusy(false);
    }
  }

  function skipToCurrentWorkspace(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    event.stopPropagation();
    const section = document.getElementById(activeSection);
    if (!section) return;

    section.setAttribute("tabindex", "-1");
    section.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleTabAwareNavigation(event: MouseEvent<HTMLElement>) {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!anchor) return;

    const href = anchor.getAttribute("href") || "";
    const tabId = tabForHash(href);
    if (!tabId) return;

    event.preventDefault();
    openSection(href, true);
  }

  function scrollToAccount() {
    openSection("account");
  }

  function startFounderFeedback(type: FounderFeedback["feedback_type"]) {
    setFeedbackDraftType(type);
    setMessage(`${type} selected. Add details in Founder Feedback.`);
    openSection("feedback");
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

    const prompt = `Please log in first before you ${action}.`;
    setAuthMode("Log in");
    setConfirmationEmail("");
    setLoginPrompt(prompt);
    setMessage("Log in to continue.", "warning");
    scrollToAccount();
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
    setLoginPrompt("");
    scrollToAccount();
    return false;
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

  async function handleCreateListenRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireProfile("create a listen room")) return;

    const trackUrl = listenRoomDraft.current_track_url.trim();
    if (trackUrl && !isPublicSongLink(trackUrl)) {
      setMessage("Please use a public song link that starts with http or https.");
      return;
    }

    const passcode = listenRoomDraft.passcode.trim();
    if (listenRoomDraft.visibility === "Private" && (passcode.length < 4 || passcode.length > 32)) {
      setMessage("Private room passcodes must be between 4 and 32 characters.");
      return;
    }
    if (listenRoomDraft.visibility === "Private" && !supabase) {
      setMessage("Private listen rooms require the live Talent7 service.");
      return;
    }

    const roomPayload = {
      title: listenRoomDraft.title.trim() || "Untitled listen room",
      host_name: listenRoomDraft.host_name.trim() || profileName(),
      mood: listenRoomDraft.mood,
      room_note: listenRoomDraft.room_note.trim() || null,
      current_track_title: listenRoomDraft.current_track_title.trim() || "Open the first shared song",
      current_track_url: trackUrl || "https://www.youtube.com",
      created_by: session?.user.id || null,
      visibility: listenRoomDraft.visibility
    };

    if (!supabase) {
      const room: ListenRoom = {
        id: makeLocalListenId("listen-room"),
        ...roomPayload,
        listener_count: 1,
        love_count: 0,
        vibe_count: 0,
        status: "Open",
        created_at: new Date().toISOString()
      };
      setListenRooms((current) => [room, ...current]);
    } else {
      setListenActionKey("create");
      const { data, error } = await supabase.rpc("create_listen_room", {
        room_title: roomPayload.title,
        room_host_name: roomPayload.host_name,
        room_mood: roomPayload.mood,
        room_note_value: roomPayload.room_note,
        room_track_title: roomPayload.current_track_title,
        room_track_url: roomPayload.current_track_url,
        room_visibility: roomPayload.visibility,
        room_passcode: roomPayload.visibility === "Private" ? passcode : null
      });

      if (error || !data) {
        setMessage(error?.message || "Could not create the listen room.");
        setListenActionKey(null);
        return;
      }

      if (trackUrl && session?.user.id) {
        const { error: trackError } = await supabase.from("listen_tracks").insert({
          room_id: data,
          user_id: session.user.id,
          track_title: roomPayload.current_track_title,
          track_url: trackUrl,
          added_by: profileName()
        });

        if (trackError) {
          await supabase.from("listen_rooms").delete().eq("id", data);
          setMessage(trackError.message);
          setListenActionKey(null);
          return;
        }
      }

      await refreshListenRooms();
      setListenActionKey(null);
    }

    setListenRoomDraft({ ...defaultListenDraft, host_name: profileName() });
    setListenRoomStatus("Open");
    setMessage(
      listenRoomDraft.visibility === "Private"
        ? "Private listen room created. Share its room code and passcode only with invited people."
        : "Public listen room created."
    );
    setActiveAppTab("listen");
    setActiveSection("listen-rooms");
    setTimeout(() => document.getElementById("listen-rooms")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  async function handleJoinListenRoom(roomId: string) {
    if (!requireProfile("join a listen room")) return;

    if (!supabase || !session?.user.id) {
      setListenRooms((current) =>
        current.map((room) => (room.id === roomId ? { ...room, listener_count: room.listener_count + 1 } : room))
      );
      setMessage("Joined listen room.");
      return;
    }

    setListenActionKey(`join-${roomId}`);
    const { error } = await supabase.rpc("join_public_listen_room", {
      target_room_id: roomId,
      member_display_name: profileName()
    });

    if (error && error.code !== "23505") {
      setMessage(error.message);
      setListenActionKey(null);
      return;
    }

    await refreshListenRooms();
    setListenActionKey(null);
    setMessage(error?.code === "23505" ? "You already joined this listen room." : "Joined listen room.");
  }

  async function handleJoinPrivateListenRoom() {
    if (!requireProfile("join a private listen room")) return;
    if (!supabase || !session?.user.id) {
      setMessage("Private listen rooms require the live Talent7 service.");
      return;
    }

    const roomCode = privateListenRoomCode.trim().toUpperCase();
    const passcode = privateListenRoomPasscode.trim();
    if (!roomCode || !passcode) {
      setMessage("Enter both the private room code and passcode.");
      return;
    }

    setListenActionKey("join-private");
    const { error } = await supabase.rpc("join_private_listen_room", {
      requested_room_code: roomCode,
      requested_passcode: passcode,
      member_display_name: profileName()
    });

    if (error) {
      setMessage(error.message.includes("Invalid room code or passcode") ? "Invalid private room code or passcode." : error.message);
    } else {
      setPrivateListenRoomCode("");
      setPrivateListenRoomPasscode("");
      await refreshListenRooms();
      setMessage("Joined private listen room.");
    }
    setListenActionKey(null);
  }

  async function ensureListenMembership(roomId: string) {
    if (!supabase || !session?.user.id) return true;
    const room = listenRooms.find((item) => item.id === roomId);
    if (room?.visibility === "Private") return true;
    const { error } = await supabase.rpc("join_public_listen_room", {
      target_room_id: roomId,
      member_display_name: profileName()
    });
    return !error || error.code === "23505";
  }

  async function handleReactListenRoom(roomId: string, reaction: "love" | "vibe") {
    if (!requireProfile("react in a listen room")) return;

    if (!supabase || !session?.user.id) {
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
      return;
    }

    setListenActionKey(`${reaction}-${roomId}`);
    const joined = await ensureListenMembership(roomId);
    if (!joined) {
      setMessage("Could not join this listen room.");
      setListenActionKey(null);
      return;
    }

    const { error } = await supabase.from("listen_room_reactions").insert({
      room_id: roomId,
      user_id: session.user.id,
      reaction
    });

    if (error && error.code !== "23505") {
      setMessage(error.message);
    } else {
      await refreshListenRooms();
      setMessage(error?.code === "23505" ? `You already added this ${reaction} reaction.` : "Reaction added.");
    }
    setListenActionKey(null);
  }

  async function handleAddListenTrack(event: FormEvent<HTMLFormElement>, roomId: string) {
    event.preventDefault();
    if (!requireProfile("add a song")) return;

    const draft = listenTrackDrafts[roomId] || { track_title: "", track_url: "", added_by: profileName() };
    const trackUrl = draft.track_url.trim();
    if (!trackUrl || !isPublicSongLink(trackUrl)) {
      setMessage("Please paste a public YouTube, Spotify, or song link.");
      return;
    }

    if (!supabase || !session?.user.id) {
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
            ? { ...room, current_track_title: track.track_title, current_track_url: track.track_url }
            : room
        )
      );
    } else {
      setListenActionKey(`track-${roomId}`);
      const joined = await ensureListenMembership(roomId);
      if (!joined) {
        setMessage("Could not join this listen room.");
        setListenActionKey(null);
        return;
      }

      const { error } = await supabase.from("listen_tracks").insert({
        room_id: roomId,
        user_id: session.user.id,
        track_title: draft.track_title.trim() || "Shared song",
        track_url: trackUrl,
        added_by: profileName()
      });

      if (error) {
        setMessage(error.message);
        setListenActionKey(null);
        return;
      }

      await refreshListenRooms();
      setListenActionKey(null);
    }

    setListenTrackDrafts((current) => ({
      ...current,
      [roomId]: { track_title: "", track_url: "", added_by: profileName() }
    }));
    setMessage("Song added to the listen room.");
  }

  async function archiveListenRoom(room: ListenRoom) {
    if (!supabase || !session?.user.id || room.created_by !== session.user.id) return;
    setListenActionKey(`archive-${room.id}`);
    const { error } = await supabase.from("listen_rooms").update({ status: "Archived" }).eq("id", room.id);
    if (error) setMessage(error.message);
    else {
      await refreshListenRooms();
      setListenRoomStatus("Archived");
      setMessage("Listen room closed and archived.");
    }
    setListenActionKey(null);
  }

  async function restoreListenRoom(room: ListenRoom) {
    if (!supabase || !session?.user.id || room.created_by !== session.user.id) return;
    setListenActionKey(`restore-${room.id}`);
    const { error } = await supabase.from("listen_rooms").update({ status: "Open" }).eq("id", room.id);
    if (error) setMessage(error.message);
    else {
      await refreshListenRooms();
      setListenRoomStatus("Open");
      setMessage("Listen room restored and open again.");
    }
    setListenActionKey(null);
  }

  function confirmDeleteListenRoom(room: ListenRoom) {
    const isArchived = room.status === "Archived";
    requestConfirmation({
      title: isArchived ? "Permanently delete this archived room?" : "Delete this listen room?",
      detail: "The room, its queue, membership, and reactions will be permanently deleted.",
      confirmLabel: isArchived ? "Delete permanently" : "Delete room",
      onConfirm: () => deleteListenRoom(room)
    });
  }

  async function deleteListenRoom(room: ListenRoom) {
    if (!supabase || !session?.user.id || room.created_by !== session.user.id) return;
    setListenActionKey(`delete-${room.id}`);
    const { error } = await supabase.from("listen_rooms").delete().eq("id", room.id);
    if (error) setMessage(error.message);
    else {
      await refreshListenRooms();
      setMessage("Listen room deleted.");
    }
    setListenActionKey(null);
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
      setMessage(`Preview mode: saved ${label} interest.`);
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
      setMessage(`${label} interest saved. No payment was collected.`, "success");
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
      setFirstWaveSaveConfirmed(false);
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
      setFirstWaveSaveConfirmed(true);
      setMessage("Interests saved for this preview.", "success");
      setSavingFirstWave(false);
      return;
    }

    const { data, error } = await supabase
      .from("first_wave_interests")
      .upsert(interest, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) {
      setFirstWaveSaveConfirmed(false);
      setMessage(`Could not save first-wave interest: ${error.message}`);
    } else if (data) {
      setFirstWaveInterests((items) => [
        data as FirstWaveInterest,
        ...items.filter((item) => item.id !== (data as FirstWaveInterest).id)
      ]);
      setFirstWaveSaveConfirmed(true);
      setMessage("Interests saved. You are on the Talent7 first-wave list.", "success");
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
      setMessage("Preview mode: feedback saved in this browser session.");
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
      if (!supabase || !session?.user.id) {
        setPublicProfiles([]);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("updated_at", { ascending: false });

      if (data) setPublicProfiles((data as TalentProfile[]).map(canonicalTalentProfile));
    }

    loadPublicProfiles();
  }, [session?.user.id]);

  useEffect(() => {
    async function loadProfile() {
      if (!supabase || !session?.user.id) {
        setProfile(null);
        setProfileHydrated(true);
        return;
      }

      setProfileHydrated(false);
      try {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle();

        setProfile(data ? canonicalTalentProfile(data as TalentProfile) : null);
      } finally {
        setProfileHydrated(true);
      }
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
    const mainInterest = String(form.get("main_interest") || "Badminton doubles");
    const challengeActivities = Array.from(
      new Set([
        mainInterest,
        ...form.getAll("challenge_activities").map((value) => String(value).trim()).filter(Boolean)
      ])
    );
    const availabilityNote = String(form.get("availability_note") || "").trim();

    if (displayName.length < 2 || displayName.length > 60) {
      setMessage("Use a display name between 2 and 60 characters.");
      return;
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      setMessage("Use 3 to 30 lowercase letters, numbers, or underscores for your username.");
      return;
    }

    if (availabilityNote.length > 180) {
      setMessage("Keep your challenge availability note under 180 characters.");
      return;
    }

    if (challengeActivities.length > 12) {
      setMessage("Choose no more than 12 challenge activities, including your main interest.");
      return;
    }

    setProfileLoading(true);
    setMessage("");

    const profileData = {
      user_id: session.user.id,
      display_name: displayName,
      username,
      role: String(form.get("role") || "Challenger"),
      main_interest: mainInterest,
      region: String(form.get("region") || "").trim() || "Global",
      challenge_availability: String(form.get("challenge_availability") || "Open to everyone") as ChallengeAvailability,
      challenge_skill_level: String(form.get("challenge_skill_level") || "Open") as ChallengeSkillLevel,
      challenge_mode: String(form.get("challenge_mode") || "Either") as ChallengeMode,
      challenge_format: String(form.get("challenge_format") || "Any") as ChallengeFormat,
      challenge_activities: challengeActivities,
      availability_note: availabilityNote,
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
      setProfile(canonicalTalentProfile(data as TalentProfile));
      setPublicProfiles((items) => {
        const savedProfile = canonicalTalentProfile(data as TalentProfile);
        const others = items.filter((item) => item.user_id !== savedProfile.user_id);

        return [savedProfile, ...others];
      });
      setRoomDiscoveryMode("Trending");
      setMessage("Profile and challenge preferences saved.");
      window.setTimeout(() => openSection("rooms", true), 80);
    }

    setProfileLoading(false);
  }

  function challengeFieldValue(formElement: HTMLFormElement, name: string) {
    const control = formElement.elements.namedItem(name);
    return control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement
      ? control.value.trim()
      : "";
  }

  function challengeCheckboxChecked(formElement: HTMLFormElement, name: string) {
    const control = formElement.elements.namedItem(name);
    return control instanceof HTMLInputElement && control.type === "checkbox" && control.checked;
  }

  function focusChallengeField(formElement: HTMLFormElement, name: string) {
    window.setTimeout(() => {
      const control = formElement.elements.namedItem(name);
      if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
        control.focus();
      }
    }, 0);
  }

  function validateChallengeCreateStep(step: 1 | 2 | 3, formElement: HTMLFormElement) {
    const requiredFields: Record<1 | 2 | 3, Array<{ name: string; label: string }>> = {
      1: [
        { name: "sport_type", label: "challenge type" },
        { name: "title", label: "challenge title" },
        { name: "lane", label: "category" }
      ],
      2: [
        { name: "match_format", label: "match format" }
      ],
      3: [{ name: "rules", label: "challenge rules" }]
    };
    const missing = requiredFields[step].find((field) => !challengeFieldValue(formElement, field.name));

    if (missing) {
      setChallengeStepError(`Add ${missing.label} before continuing.`);
      focusChallengeField(formElement, missing.name);
      return false;
    }

    if (step === 2) {
      const activity = challengeFieldValue(formElement, "sport_type");
      const format = challengeFieldValue(formElement, "match_format") as MatchFormat;
      const rosterSize = Number(challengeFieldValue(formElement, "roster_size"));
      const teamAId = challengeFieldValue(formElement, "team_a_id");
      const teamBId = challengeFieldValue(formElement, "team_b_id");
      const openOpponent = challengeCheckboxChecked(formElement, "open_opponent");
      if (!challengeFieldValue(formElement, "team_a") && !teamAId) {
        setChallengeStepError("Add your name or team for side A before continuing.");
        focusChallengeField(formElement, "team_a");
        return false;
      }
      if (!openOpponent && !challengeFieldValue(formElement, "team_b") && !teamBId) {
        setChallengeStepError("Add an opponent for side B, or choose Leave opponent open.");
        focusChallengeField(formElement, "team_b");
        return false;
      }
      if (!validMatchFormatForActivity(activity, format)) {
        setChallengeStepError(`${matchFormatLabel(format, activity)} is not a valid format for ${activity}.`);
        focusChallengeField(formElement, "match_format");
        return false;
      }
      if (!Number.isInteger(rosterSize) || rosterSize < 1 || rosterSize > 50) {
        setChallengeStepError("Choose between 1 and 50 registered players per side.");
        focusChallengeField(formElement, "roster_size");
        return false;
      }
      if (!validRosterSizeForActivity(activity, format, rosterSize)) {
        const requiredSize = rosterSizeForFormat(activity, format);
        setChallengeStepError(`${matchFormatLabel(format, activity)} must use ${requiredSize} registered player${requiredSize === 1 ? "" : "s"} per side.`);
        focusChallengeField(formElement, "match_format");
        return false;
      }
    }

    if (step === 3) {
      const bookingUrl = challengeFieldValue(formElement, "booking_url");
      if (bookingUrl) {
        try {
          const parsedUrl = new URL(bookingUrl);
          if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") throw new Error("Unsupported URL");
        } catch {
          setChallengeStepError("Use a complete http:// or https:// booking link, or leave it blank.");
          focusChallengeField(formElement, "booking_url");
          return false;
        }
      }
    }

    setChallengeStepError("");
    return true;
  }

  function updateChallengeReview(formElement: HTMLFormElement) {
    const teamAId = challengeFieldValue(formElement, "team_a_id");
    const teamBId = challengeFieldValue(formElement, "team_b_id");
    const openOpponent = challengeCheckboxChecked(formElement, "open_opponent");
    setChallengeReview({
      activity: challengeFieldValue(formElement, "sport_type"),
      title: challengeFieldValue(formElement, "title"),
      lane: challengeFieldValue(formElement, "lane") as ChallengeLane,
      teamA: challengeFieldValue(formElement, "team_a") || linkedTeam(teamAId)?.name || "Your side",
      teamB: openOpponent
        ? "Open invite"
        : challengeFieldValue(formElement, "team_b") || linkedTeam(teamBId)?.name || "Opponent"
    });
  }

  function moveChallengeCreateStep(nextStep: 1 | 2 | 3, formElement: HTMLFormElement | null) {
    if (!formElement) return;

    if (nextStep > challengeCreateStep) {
      for (let step = challengeCreateStep; step < nextStep; step += 1) {
        if (!validateChallengeCreateStep(step as 1 | 2, formElement)) return;
      }
    }

    if (nextStep === 3) updateChallengeReview(formElement);
    setChallengeCreateStep(nextStep);
    setChallengeCreateMaxStep((current) => Math.max(current, nextStep) as 1 | 2 | 3);
    setChallengeStepError("");
    window.setTimeout(() => document.getElementById("challenge-wizard")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }

  async function createChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    for (const step of [1, 2, 3] as const) {
      if (!validateChallengeCreateStep(step, formElement)) {
        setChallengeCreateStep(step);
        return;
      }
    }
    if (!requireLogin("create a challenge")) return;
    const selectedInviteProfile = publicProfiles.find((item) => item.user_id === challengeDraft.invitedUserId);
    const existingActiveInvite = selectedInviteProfile ? activeChallengeInvite(selectedInviteProfile) : null;
    if (existingActiveInvite) {
      setMessage(
        existingActiveInvite.status === "Accepted"
          ? "You already have an active challenge with this person. Open that room before starting a rematch."
          : "A challenge invitation between you and this person is already pending.",
        "warning"
      );
      return;
    }
    if (challengeCreationLockRef.current) return;

    challengeCreationLockRef.current = true;
    setIsSaving(true);
    setMessage("");

    const form = new FormData(formElement);
    const bookingUrl = String(form.get("booking_url") || "").trim();
    const matchFormat = String(form.get("match_format") || "Singles") as MatchFormat;
    const rosterSize =
      matchFormat === "Singles" ? 1 : matchFormat === "Doubles" ? 2 : Number(form.get("roster_size"));
    const teamAId = String(form.get("team_a_id") || "");
    const teamBId = String(form.get("team_b_id") || "");
    const openOpponent = form.get("open_opponent") === "on";
    const teamA = linkedTeam(teamAId);
    const teamB = linkedTeam(teamBId);
    if (!Number.isInteger(rosterSize) || rosterSize < 1 || rosterSize > 50) {
      setMessage("Choose a valid number of registered players per side.");
      challengeCreationLockRef.current = false;
      setIsSaving(false);
      return;
    }
    const challenge = {
      title: String(form.get("title") || "Untitled challenge"),
      lane: String(form.get("lane") || "Sports challenge") as ChallengeLane,
      team_a: String(form.get("team_a") || teamA?.name || "Challenger").trim(),
      team_b: openOpponent ? "Open invite" : String(form.get("team_b") || teamB?.name || "Opponent").trim(),
      team_a_id: teamAId || null,
      team_b_id: openOpponent ? null : teamBId || null,
      rules: String(form.get("rules") || "Upload proof after the challenge."),
      venue_name: String(form.get("venue_name") || "").trim() || null,
      booking_url: bookingUrl || null,
      sport_type: String(form.get("sport_type") || "").trim() || null,
      booking_region: String(form.get("booking_region") || "").trim() || null,
      match_format: matchFormat,
      roster_size: rosterSize,
      status: "Open",
      created_by: session?.user.id
    };

    try {
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
      setChallenges((items) => [localChallenge, ...items.filter((item) => item.id !== localChallenge.id)]);
      if (session?.user.id) {
        setJoins((items) => [
          {
            id: crypto.randomUUID(),
            challenge_id: localChallenge.id,
            user_id: session.user.id,
            participant_name: profileName(),
            role: "Challenger",
            side: "Team A",
            created_at: new Date().toISOString()
          },
          ...items
        ]);
      }
      setCreatedChallengeId(localChallenge.id);
      setSelectedLane(challenge.lane);
      setSelectedStatus("Open");
      setRoomDiscoveryMode("Newest");
      setMessage("Preview mode: challenge added in this browser session.");
      formElement.reset();
      setChallengeCreateStep(1);
      setChallengeCreateMaxStep(1);
      setChallengeStepError("");
      setActiveAppTab("challenges");
      setActiveSection("rooms");
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
        const { data: creatorJoinData } = await supabase
          .from("challenge_joins")
          .select("*")
          .eq("challenge_id", savedChallenge.id)
          .eq("user_id", session?.user.id || "")
          .maybeSingle();

        setChallenges((items) => [savedChallenge, ...items.filter((item) => item.id !== savedChallenge.id)]);
        if (creatorJoinData) {
          setJoins((items) => [
            creatorJoinData as ChallengeJoin,
            ...items.filter((item) => item.id !== (creatorJoinData as ChallengeJoin).id)
          ]);
        }
        setSelectedStatus(isChallengeClosed(savedChallenge) ? "Completed" : "Open");
        setRoomDiscoveryMode("Newest");
        setCreatedChallengeId(savedChallenge.id);
        setSelectedLane(savedChallenge.lane);
        setMessage(
          inviteMessage
            ? `Challenge created. ${inviteMessage}`
            : "Challenge created. No invite was sent because no profile invite target was selected."
        );
        formElement.reset();
        setChallengeCreateStep(1);
        setChallengeCreateMaxStep(1);
        setChallengeStepError("");
        setTimeout(() => document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" }), 80);
      }
    } catch (error) {
      setMessage(readableAuthError(error, "The challenge could not be created."), "error");
    } finally {
      challengeCreationLockRef.current = false;
      setIsSaving(false);
    }
  }

  function applyChallengeActivity(activity: string, formElement: HTMLFormElement | null) {
    const lane = laneForInterest(activity);
    const rules = rulesForActivity(activity);
    const venueName = venueForActivity(activity);
    const matchSetup = inferredMatchSetup(activity);

    const setControlValue = (name: string, value: string) => {
      const control = formElement?.elements.namedItem(name);

      if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
        control.value = value;
      }
    };

    setControlValue("sport_type", activity);
    setControlValue("title", activity);
    setControlValue("lane", lane);
    setControlValue("rules", rules);
    setControlValue("venue_name", venueName);
    setControlValue("match_format", matchSetup.format);
    setControlValue("roster_size", String(matchSetup.rosterSize));

    setChallengeDraft((currentDraft) => ({
      ...currentDraft,
      title: activity,
      lane,
      rules,
      venue_name: venueName,
      sport_type: activity,
      match_format: matchSetup.format,
      roster_size: matchSetup.rosterSize
    }));
  }

  function applyMatchFormat(format: MatchFormat, formElement: HTMLFormElement | null) {
    const activityControl = formElement?.elements.namedItem("sport_type");
    const activity =
      activityControl instanceof HTMLSelectElement || activityControl instanceof HTMLInputElement
        ? activityControl.value.trim()
        : challengeDraft.sport_type;
    const rosterSize = rosterSizeForFormat(activity, format);
    const rosterControl = formElement?.elements.namedItem("roster_size");
    if (rosterControl instanceof HTMLInputElement) rosterControl.value = String(rosterSize);
    setChallengeDraft((current) => ({ ...current, match_format: format, roster_size: rosterSize }));
  }

  function applyChallengeEditActivity(challenge: Challenge, activity: string) {
    const config = activityMatchConfig(activity);
    setChallengeEditSetups((current) => ({
      ...current,
      [challenge.id]: { activity, format: config.defaultFormat, rosterSize: config.defaultRosterSize }
    }));
  }

  function applyChallengeEditFormat(challenge: Challenge, activity: string, format: MatchFormat) {
    setChallengeEditSetups((current) => ({
      ...current,
      [challenge.id]: {
        activity,
        format,
        rosterSize: rosterSizeForFormat(activity, format)
      }
    }));
  }

  async function updateChallengeDetails(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    if (!requireLogin("edit a challenge")) return;

    if (!canEditChallenge(challenge)) {
      setMessage("Only the challenge creator or Talent7 owner can edit this room.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const updatedActivity = String(form.get("sport_type") || challenge.sport_type || challenge.title).trim();
    const updatedMatchFormat = String(form.get("match_format") || challengeMatchFormat(challenge)) as MatchFormat;
    if (!validMatchFormatForActivity(updatedActivity, updatedMatchFormat)) {
      setMessage(`${matchFormatLabel(updatedMatchFormat, updatedActivity)} is not a valid format for ${updatedActivity}.`);
      return;
    }
    const updatedRosterSize =
      updatedMatchFormat === "Singles"
        ? 1
        : updatedMatchFormat === "Doubles"
          ? 2
          : Number(form.get("roster_size") || challengeRosterSize(challenge));
    if (!validRosterSizeForActivity(updatedActivity, updatedMatchFormat, updatedRosterSize)) {
      const requiredSize = rosterSizeForFormat(updatedActivity, updatedMatchFormat);
      setMessage(
        `${matchFormatLabel(updatedMatchFormat, updatedActivity)} must use ${requiredSize} registered player${requiredSize === 1 ? "" : "s"} per side.`
      );
      return;
    }
    const update = {
      title: String(form.get("title") || challenge.title).trim() || challenge.title,
      lane: String(form.get("lane") || challenge.lane) as ChallengeLane,
      team_a: String(form.get("team_a") || challenge.team_a).trim() || challenge.team_a,
      team_b: String(form.get("team_b") || challenge.team_b).trim() || challenge.team_b,
      rules: String(form.get("rules") || challenge.rules).trim() || challenge.rules,
      venue_name: String(form.get("venue_name") || "").trim() || null,
      booking_url: String(form.get("booking_url") || "").trim() || null,
      sport_type: updatedActivity || null,
      booking_region: String(form.get("booking_region") || "").trim() || null,
      match_format: updatedMatchFormat,
      roster_size: updatedRosterSize
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
      status: "Pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    const { data, error } = await supabase
      .from("challenge_invites")
      .insert(invite)
      .select("*")
      .single();

    if (error) {
      const { error: cancellationError } = await supabase
        .from("challenges")
        .update({ status: "Cancelled" })
        .eq("id", challenge.id)
        .eq("created_by", session.user.id);
      if (!cancellationError) challenge.status = "Cancelled";
      return cancellationError
        ? `Challenge invite could not be saved yet: ${error.message}`
        : `Challenge invite was blocked: ${error.message} The unused room was cancelled.`;
    }

    if (data) setInvites((items) => [data as ChallengeInvite, ...items]);
    return `Invite sent to ${invite.invited_name}.`;
  }

  function inviteProfileToChallenge(item: TalentProfile) {
    if (!requireLogin("challenge another profile")) return;
    if (item.user_id === session?.user.id) {
      setMessage("Choose another profile to challenge.", "warning");
      return;
    }
    setSharedProfileTarget(null);
    const activeInvite = activeChallengeInvite(item);
    if (activeInvite?.status === "Accepted") {
      openInviteChallenge(activeInvite);
      return;
    }
    if (activeInvite && challengeInviteDisplayStatus(activeInvite) === "Pending") {
      if (activeInvite.invited_user_id === session?.user.id) {
        openSection("invites", true);
      } else {
        setMessage(`You already have a pending challenge invitation for ${item.display_name}.`, "warning");
      }
      return;
    }
    if (!requireProfile("challenge another profile")) return;
    if (profileChallengeAvailability(item) === "Unavailable") {
      setMessage(`${item.display_name} is not accepting challenge invitations right now.`, "warning");
      return;
    }
    if (!targetAllowsChallenge(item)) {
      setMessage(`${item.display_name} only accepts invitations from people they follow.`, "warning");
      return;
    }
    const invitedName = item.display_name || `@${item.username}`;
    const interest = item.main_interest || "New challenge";
    const matchSetup = inferredMatchSetup(interest);
    const creatorName = profile?.display_name || (profile?.username ? `@${profile.username}` : "Open challenger");

    setChallengeCreateStep(1);
    setChallengeCreateMaxStep(1);
    setChallengeStepError("");
    setChallengeDraft((currentDraft) => ({
      title: interest,
      lane: laneForInterest(interest),
      team_a: creatorName,
      team_b: invitedName,
      openOpponent: false,
      team_a_id: currentDraft.team_a_id || "",
      team_b_id: currentDraft.team_b_id || "",
      rules: `${interest} challenge with ${invitedName}. Upload proof after the match.`,
      venue_name: venueForActivity(interest),
      booking_url: currentDraft.booking_url || "",
      sport_type: interest,
      booking_region: currentDraft.booking_region || profile?.region || "Global",
      match_format: matchSetup.format,
      roster_size: matchSetup.rosterSize,
      invitedProfile: invitedName,
      invitedUserId: item.user_id,
      version: currentDraft.version + 1
    }));

    setMessage(`Invite draft ready for ${invitedName}. Review it, then create the challenge.`);
    setActiveAppTab("challenges");
    setActiveSection("create");
    setTimeout(() => document.getElementById("create")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  function viewTeamChallenge(challenge: Challenge) {
    setSelectedLane(challenge.lane);
    setRoomSearch(challenge.title);
    setMessage(`${challenge.title} is now shown in Challenge rooms.`);
    setActiveAppTab("challenges");
    setActiveSection("rooms");
    setTimeout(() => document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  function challengeTeam(team: TalentTeam) {
    if (!requireLogin("challenge teams")) return;
    if (!requireProfile("challenge teams")) return;
    setSharedTeamTarget(null);

    const isOwnTeam = team.owner_user_id === session?.user.id;
    const ownedTeam = isOwnTeam ? team : teams.find((item) => item.owner_user_id === session?.user.id);
    const activity = team.main_activity || "Team challenge";
    const matchSetup = inferredMatchSetup(activity);
    const region = team.region || profile?.region || "Global";
    const opponentName = isOwnTeam ? "" : team.name;

    setChallengeCreateStep(1);
    setChallengeCreateMaxStep(1);
    setChallengeStepError("");
    setChallengeDraft((currentDraft) => ({
      title: `${activity} challenge`,
      lane: laneForInterest(activity),
      team_a: ownedTeam?.name || profileName(),
      team_b: opponentName,
      openOpponent: isOwnTeam,
      team_a_id: ownedTeam?.id || "",
      team_b_id: isOwnTeam ? "" : team.id,
      rules: `${activity} team challenge. Upload proof after the match.`,
      venue_name: currentDraft.venue_name || `${activity} venue or online lobby`,
      booking_url: currentDraft.booking_url || "",
      sport_type: activity,
      booking_region: region,
      match_format: "Team",
      roster_size: Math.max(2, matchSetup.rosterSize),
      invitedProfile: "",
      invitedUserId: "",
      version: currentDraft.version + 1
    }));

    setMessage(
      isOwnTeam
        ? `Team challenge draft ready for ${team.name}. Review it, then create the challenge.`
        : `Challenge draft ready against ${team.name}. Review it, then create the challenge.`
    );
    setActiveAppTab("challenges");
    setActiveSection("create");
    setTimeout(() => document.getElementById("create")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  function viewProfileActivity(item: TalentProfile) {
    setSelectedActivityProfile(item);
    setRoomSearch("");
    setSelectedLane("All");
    setSelectedStatus("Open");
    setRoomDiscoveryMode("Trending");
    setMessage(`${item.display_name}'s public activity is now shown in Challenge rooms.`);
    setActiveAppTab("challenges");
    setActiveSection("rooms");
    setTimeout(() => document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  function openProfileDetail(item: TalentProfile) {
    setSelectedProfile(item);
    setSharedProfileTarget(null);
    window.history.replaceState(null, "", `#${profileHash(item.username)}`);
    setMessage(`Opened ${item.display_name}'s Talent7 profile.`);
    setActiveAppTab("profiles");
    setActiveSection("profiles");
    setTimeout(() => document.getElementById("profile-detail")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  async function shareProfile(item: TalentProfile) {
    if (!item.share_token) {
      setMessage("This profile does not have a public share link yet. Apply the profile-sharing Supabase migration first.", "warning");
      return;
    }

    const url = siteUrl(`/profile/${item.share_token}`);
    const shareData = {
      title: `${item.display_name} on Talent7`,
      text: `Meet ${item.display_name}, a ${item.role.toLowerCase()} interested in ${item.main_interest || "new challenges"} on Talent7.`,
      url
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setMessage(`${item.display_name}'s profile shared.`, "success");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    await copyShareText("Profile link", `${shareData.text}\n${url}`);
  }

  async function shareChallengeRoom(challenge: Challenge) {
    if (!challenge.room_share_token) {
      setMessage("This room does not have a public share link yet. Apply the room-sharing Supabase migration first.", "warning");
      return;
    }

    const url = siteUrl(`/room/${challenge.room_share_token}`);
    const teamA = challengeSideDisplay(challenge, "Team A");
    const teamB = challengeSideDisplay(challenge, "Team B");
    const shareData = {
      title: `${challenge.title} on Talent7`,
      text: `${teamA} vs ${teamB} in ${challenge.title}. Preview the challenge room on Talent7:`,
      url
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setMessage(`${challenge.title} shared.`, "success");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    await copyShareText("Challenge room link", `${shareData.text}\n${url}`);
  }

  async function toggleSavedRoom(challenge: Challenge) {
    if (!requireLogin("save challenge rooms")) return;
    if (!supabase || !session?.user.id) return;
    if (challenge.id.startsWith("sample-")) {
      setMessage("Preview rooms cannot be saved. Open a shared Supabase room instead.", "warning");
      return;
    }

    const existingSave = savedRoomByChallengeId.get(challenge.id);
    setSavingRoomId(challenge.id);
    setMessage("");

    if (existingSave) {
      const { error } = await supabase
        .from("challenge_room_saves")
        .delete()
        .eq("id", existingSave.id)
        .eq("user_id", session.user.id);

      if (error) {
        setMessage(`Could not remove saved room: ${error.message}`, "error");
      } else {
        setSavedRooms((items) => items.filter((item) => item.id !== existingSave.id));
        setMessage(`${challenge.title} removed from Saved rooms.`);
      }
      setSavingRoomId(null);
      return;
    }

    const { data, error } = await supabase
      .from("challenge_room_saves")
      .insert({ user_id: session.user.id, challenge_id: challenge.id })
      .select("*")
      .single();

    if (error) {
      setMessage(
        error.code === "42P01"
          ? "Apply add-saved-challenge-rooms.sql in Supabase before saving rooms."
          : error.code === "23505"
            ? "This room is already saved."
            : `Could not save room: ${error.message}`,
        error.code === "23505" ? "warning" : "error"
      );
    } else if (data) {
      setSavedRooms((items) => [data as ChallengeRoomSave, ...items]);
      setSavedRoomsLoadError("");
      setMessage(`${challenge.title} saved for later.`, "success");
    }
    setSavingRoomId(null);
  }

  async function shareTeam(team: TalentTeam) {
    if (!team.share_token) {
      setMessage("This team does not have a public share link yet. Apply the team-sharing Supabase migration first.", "warning");
      return;
    }

    const url = siteUrl(`/team/${team.share_token}`);
    const shareData = {
      title: `${team.name} on Talent7`,
      text: `Meet ${team.name}, a ${team.team_type.toLowerCase()} for ${team.main_activity} in ${team.region}. View the team on Talent7:`,
      url
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setMessage(`${team.name} shared.`, "success");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    await copyShareText("Team link", `${shareData.text}\n${url}`);
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
        setSharedProfileTarget(null);
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
      setSharedProfileTarget(null);
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
      setMessage("Preview mode: showcase post added in this browser session.");
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
      if (mediaFile) await deleteR2MediaFile(mediaUrl).catch(() => null);
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
      setActiveAppTab("settings");
      setActiveSection("account");
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
      setMessage("Preview mode: coaching offer added in this browser session.");
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
      setMessage("Preview mode: coaching interest saved in this browser session.");
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
      setMessage("Coaching interest sent. The coach can now review your request.");
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
      setMessage("Preview mode: team created in this browser session.");
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
      setMessage("Preview mode: team join request saved in this browser session.");
      formElement.reset();
      setSharedTeamTarget(null);
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
      setSharedTeamTarget(null);
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
      setMessage("Preview mode: comment added in this browser session.");
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
      setMessage("Preview mode: showcase report saved in this browser session.");
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

  function confirmDeleteShowcasePost(post: ShowcasePost) {
    requestConfirmation({
      title: "Delete showcase post?",
      detail: "The post, its ratings, comments, and related reports will be removed. This cannot be undone.",
      confirmLabel: "Delete post",
      onConfirm: () => deleteShowcasePost(post)
    });
  }

  async function deleteShowcasePost(post: ShowcasePost) {
    if (!requireLogin("delete a showcase post")) return;

    if (!canDeleteUserContent(post.user_id)) {
      setMessage("Only the post owner or Talent7 owner can delete this showcase post.");
      return;
    }

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
      const mediaCleanupFailed = await deleteR2MediaFile(post.media_url)
        .then(() => false)
        .catch(() => true);
      setShowcasePosts((items) => items.filter((item) => item.id !== post.id));
      setShowcaseRatings((items) => items.filter((item) => item.post_id !== post.id));
      setShowcaseComments((items) => items.filter((item) => item.post_id !== post.id));
      setShowcaseReports((items) => items.filter((item) => item.post_id !== post.id));
      setMessage(
        mediaCleanupFailed
          ? "Showcase post deleted, but its R2 media file needs manual cleanup."
          : "Showcase post deleted."
      );
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
    if (challengeInviteDisplayStatus(invite) !== "Pending") {
      setMessage("This invitation is no longer waiting for a response.", "warning");
      return;
    }

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
      if (joinedRoom) await supabase.from("challenge_joins").delete().eq("id", joinedRoom.id);
      setMessage(`Could not update invite: ${error.message}`);
    } else if (data) {
      setInvites((items) => items.map((item) => (item.id === invite.id ? (data as ChallengeInvite) : item)));
      if (joinedRoom) {
        setJoins((items) => [
          joinedRoom as ChallengeJoin,
          ...items.filter((item) => item.id !== (joinedRoom as ChallengeJoin).id)
        ]);
      }
      setMessage(status === "Accepted" ? "Invite accepted. You joined the challenge." : "Invite declined.");
      if (status === "Accepted") {
        setSelectedLane("All");
        setSelectedStatus("Open");
        setRoomDiscoveryMode("Trending");
        setRoomSearch("");
        setActiveAppTab("challenges");
        setActiveSection("rooms");
        openInviteChallenge(data as ChallengeInvite);
      } else {
        setChallenges((items) =>
          items.map((item) => (item.id === invite.challenge_id ? { ...item, status: "Cancelled" } : item))
        );
      }
    }

    setInviteActionId(null);
  }

  async function withdrawInvite(invite: ChallengeInvite) {
    if (!requireLogin("withdraw an invite")) return;
    if (!supabase || invite.from_user_id !== session?.user.id) return;
    if (challengeInviteDisplayStatus(invite) !== "Pending") {
      setMessage("This invitation is no longer pending.", "warning");
      return;
    }

    setInviteActionId(invite.id);
    setMessage("");
    const { data, error } = await supabase
      .from("challenge_invites")
      .update({ status: "Withdrawn", updated_at: new Date().toISOString() })
      .eq("id", invite.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not withdraw invite: ${error.message}`);
    } else if (data) {
      setInvites((items) => items.map((item) => (item.id === invite.id ? (data as ChallengeInvite) : item)));
      setChallenges((items) =>
        items.map((item) => (item.id === invite.challenge_id ? { ...item, status: "Cancelled" } : item))
      );
      setMessage("Invitation withdrawn. You can challenge this person again when ready.");
    }
    setInviteActionId(null);
  }

  function openInviteChallenge(invite: ChallengeInvite) {
    const challenge = inviteChallenge(invite);
    if (!challenge) {
      setMessage("The linked challenge room is not in the current room list yet.", "warning");
      openSection("rooms", true);
      return;
    }

    setSelectedLane("All");
    setSelectedStatus(isChallengeClosed(challenge) ? "Completed" : "Open");
    setRoomDiscoveryMode(isChallengeClosed(challenge) ? "Newest" : "Trending");
    setRoomSearch("");
    setHighlightedChallengeId(challenge.id);
    openSection(roomHash(challenge.id), true);
    window.setTimeout(() => setHighlightedChallengeId(null), 2600);
  }

  async function saveChallengeSchedule(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    if (!requireLogin("coordinate this challenge")) return;
    const roster = challengeRosterState(challenge);
    if (!canCoordinateChallenge(challenge) || roster.teamA < 1 || roster.teamB < 1) {
      setMessage(
        `A registered challenger is required on both sides before scheduling. Team A ${roster.teamA}; Team B ${roster.teamB}.`
      );
      return;
    }

    const existingSchedule = challengeSchedule(challenge.id);
    const form = new FormData(event.currentTarget);
    const scheduledForValue = String(form.get("scheduled_for") || "").trim();
    const scheduledFor = new Date(scheduledForValue);
    const playMode = String(form.get("play_mode") || "In person") as ChallengePlayMode;
    const venueName = String(form.get("venue_name") || "").trim();
    const meetingDetails = String(form.get("meeting_details") || "").trim();
    const sessionUrl = String(form.get("session_url") || "").trim();
    const note = String(form.get("note") || "").trim();

    if (!scheduledForValue || Number.isNaN(scheduledFor.getTime())) {
      setMessage("Choose a valid match date and time.");
      return;
    }
    if (scheduledFor.getTime() <= new Date().getTime()) {
      setMessage("Choose a match time in the future.");
      return;
    }
    if (!availablePlayModesForChallenge(challenge).includes(playMode)) {
      setMessage(
        challenge.lane === "Mobile gaming challenge"
          ? "Mobile gaming challenges must use Online play mode."
          : "Sports challenges must use In person play mode."
      );
      return;
    }
    if (playMode === "In person" && !venueName) {
      setMessage("Add the venue name for an in-person match.");
      return;
    }
    if (playMode === "Online" && !sessionUrl) {
      setMessage("Add the private lobby or session link for an online match.");
      return;
    }
    if (sessionUrl && !/^https?:\/\//i.test(sessionUrl)) {
      setMessage("The session link must begin with http:// or https://.");
      return;
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const scheduleUpdate = {
      scheduled_for: scheduledFor.toISOString(),
      timezone,
      play_mode: playMode,
      venue_name: venueName,
      meeting_details: meetingDetails,
      session_url: sessionUrl,
      note,
      proposed_by: session?.user.id || "",
      status: "Proposed" as ChallengeScheduleStatus,
      confirmed_by: null,
      updated_at: new Date().toISOString()
    };
    const actionId = existingSchedule?.id || challenge.id;

    setScheduleActionId(actionId);
    setMessage("");

    if (!supabase || challenge.id.startsWith("sample-")) {
      const previewSchedule: ChallengeSchedule = existingSchedule
        ? { ...existingSchedule, ...scheduleUpdate }
        : {
            id: `schedule-${crypto.randomUUID()}`,
            challenge_id: challenge.id,
            created_at: new Date().toISOString(),
            ...scheduleUpdate
          };
      setChallengeSchedules((items) => [previewSchedule, ...items.filter((item) => item.challenge_id !== challenge.id)]);
      setMessage("Schedule proposal saved in this preview.");
      setScheduleActionId(null);
      return;
    }

    const query = existingSchedule
      ? supabase.from("challenge_schedules").update(scheduleUpdate).eq("id", existingSchedule.id)
      : supabase.from("challenge_schedules").insert({ challenge_id: challenge.id, ...scheduleUpdate });
    const { data, error } = await query.select("*").single();

    if (error) {
      setMessage(`Could not save the schedule: ${error.message}`);
    } else if (data) {
      const savedSchedule = data as ChallengeSchedule;
      setChallengeSchedules((items) => [savedSchedule, ...items.filter((item) => item.challenge_id !== challenge.id)]);
      setMessage("Schedule proposal sent. The other challenger must confirm it.");
    }

    setScheduleActionId(null);
  }

  async function respondToChallengeSchedule(
    schedule: ChallengeSchedule,
    status: "Confirmed" | "Changes requested"
  ) {
    if (!requireLogin("respond to this schedule")) return;
    if (!supabase || !session?.user.id) return;
    if (schedule.proposed_by === session.user.id) {
      setMessage("The other challenger must respond to your proposal.");
      return;
    }

    setScheduleActionId(`${schedule.id}-${status}`);
    setMessage("");
    const { data, error } = await supabase
      .from("challenge_schedules")
      .update({
        status,
        confirmed_by: status === "Confirmed" ? session.user.id : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", schedule.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not update the schedule: ${error.message}`);
    } else if (data) {
      const savedSchedule = data as ChallengeSchedule;
      setChallengeSchedules((items) => items.map((item) => (item.id === schedule.id ? savedSchedule : item)));
      setMessage(status === "Confirmed" ? "Match schedule confirmed." : "Changes requested. Propose an updated schedule.");
    }

    setScheduleActionId(null);
  }

  function confirmCancelChallengeSchedule(schedule: ChallengeSchedule) {
    requestConfirmation({
      title: "Cancel this match schedule?",
      detail: "The challenge room will remain open, but the current date, venue, or online-session agreement will be cancelled.",
      confirmLabel: "Cancel schedule",
      onConfirm: () => cancelChallengeSchedule(schedule)
    });
  }

  async function cancelChallengeSchedule(schedule: ChallengeSchedule) {
    if (!requireLogin("cancel this schedule")) return;
    if (!supabase) return;

    setScheduleActionId(`${schedule.id}-cancel`);
    setMessage("");
    const { data, error } = await supabase
      .from("challenge_schedules")
      .update({ status: "Cancelled", confirmed_by: null, updated_at: new Date().toISOString() })
      .eq("id", schedule.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not cancel the schedule: ${error.message}`);
    } else if (data) {
      const savedSchedule = data as ChallengeSchedule;
      setChallengeSchedules((items) => items.map((item) => (item.id === schedule.id ? savedSchedule : item)));
      setMessage("Match schedule cancelled. The challenge room is still open.");
    }

    setScheduleActionId(null);
  }

  async function joinChallenge(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    if (!requireLogin("join a challenge")) return;
    if (!requireProfile("join a challenge")) return;

    if (isChallengeClosed(challenge)) {
      setMessage("This challenge is closed, so new joins are unavailable.");
      return;
    }

    if (joins.some((join) => join.challenge_id === challenge.id && join.user_id === session?.user.id)) {
      setMessage("You already joined this room. One account can occupy only one room role.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const participantName = profileName();

    const role = String(form.get("role") || "Challenger") as JoinRole;
    const requestedSide = String(form.get("side") || "Team A");
    const normalizedSide = requestedSide === "Team B" ? "Team B" : "Team A";
    const roster = challengeRosterState(challenge);
    const selectedSideCount = normalizedSide === "Team A" ? roster.teamA : roster.teamB;
    if (role === "Challenger" && selectedSideCount >= roster.required) {
      setMessage(`${normalizedSide} is full for this ${challengeMatchFormat(challenge).toLowerCase()} room. Choose the other side or join the audience.`);
      return;
    }
    const join = {
      challenge_id: challenge.id,
      user_id: session?.user.id,
      participant_name: participantName,
      role,
      side: role === "Audience" ? "Audience" : normalizedSide
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
      setJoins((items) => [
        data as ChallengeJoin,
        ...items.filter((item) => item.id !== (data as ChallengeJoin).id)
      ]);
      setMessage(`${participantName} joined ${challenge.title} as ${join.role.toLowerCase()}.`);
      formElement.reset();
    }

    setJoiningChallengeId(null);
  }

  function confirmLeaveChallenge(challenge: Challenge, membership: ChallengeJoin) {
    requestConfirmation({
      title: membership.role === "Audience" ? "Leave this audience?" : "Leave this challenge team?",
      detail:
        membership.role === "Audience"
          ? `You will stop appearing in the audience for “${challenge.title}”. You can join again while the room is active.`
          : `You will leave ${challengeSideControlLabel(challenge, membership.side === "Team B" ? "Team B" : "Team A")} in “${challenge.title}”. If one side becomes empty, the current match schedule will be cancelled.`,
      confirmLabel: "Leave room",
      onConfirm: () => leaveChallenge(challenge, membership)
    });
  }

  async function leaveChallenge(challenge: Challenge, membership: ChallengeJoin) {
    if (!requireLogin("leave this challenge room")) return;
    const currentUserId = session?.user.id;
    if (!currentUserId) return;
    if (membership.user_id !== currentUserId) {
      setMessage("You can remove only your own room membership.");
      return;
    }
    if (challenge.created_by === currentUserId) {
      setMessage("Room creators cannot leave their own room. Delete a mistaken room before activity begins instead.");
      return;
    }
    if (isChallengeClosed(challenge)) {
      setMessage("Closed challenge memberships cannot be changed.");
      return;
    }
    if (membership.role === "Challenger" && isChallengeVotingOpen(challenge)) {
      setMessage("Close the active voting window before leaving a challenge team.");
      return;
    }
    if (membership.role === "Challenger" && liveSessionsByRoom[challenge.id]?.status === "Live") {
      setMessage("End the live broadcast before leaving a challenge team.");
      return;
    }

    setLeavingChallengeId(challenge.id);
    setMessage("");

    if (supabase && !challenge.id.startsWith("sample-")) {
      const { error } = await supabase.from("challenge_joins").delete().eq("id", membership.id);
      if (error) {
        setMessage(`Could not leave the room: ${error.message}`);
        setLeavingChallengeId(null);
        return;
      }
    }

    setJoins((items) => items.filter((item) => item.id !== membership.id));
    if (membership.role === "Challenger") {
      const remainingOpposingPlayers = joins.some(
        (join) =>
          join.challenge_id === challenge.id &&
          join.id !== membership.id &&
          join.role === "Challenger" &&
          join.side !== membership.side
      );
      const remainingSameSidePlayers = joins.some(
        (join) =>
          join.challenge_id === challenge.id &&
          join.id !== membership.id &&
          join.role === "Challenger" &&
          join.side === membership.side
      );
      if (!remainingOpposingPlayers || !remainingSameSidePlayers) {
        setChallengeSchedules((items) =>
          items.map((schedule) =>
            schedule.challenge_id === challenge.id && schedule.status !== "Cancelled"
              ? { ...schedule, status: "Cancelled", confirmed_by: null, updated_at: new Date().toISOString() }
              : schedule
          )
        );
      }
    }
    setMessage(`You left ${challenge.title}.`);
    setLeavingChallengeId(null);
  }

  async function rateChallenge(challenge: Challenge, rating: number) {
    if (!requireLogin("rate a challenge")) return;

    if (isChallengeClosed(challenge)) {
      setMessage("This challenge is closed, so ratings are unavailable.");
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

    if (isChallengeClosed(challenge)) {
      setMessage("This challenge is closed, so voting is unavailable.");
      return;
    }

    if (!isChallengeVotingOpen(challenge)) {
      setMessage("Voting is closed. Wait for an organizer to open the voting window.", "warning");
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

    if (isChallengeClosed(challenge)) {
      setMessage("This challenge is closed, so proof uploads are unavailable.");
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
      if (proofFile) await deleteR2MediaFile(proofUrl).catch(() => null);
      setMessage(`Could not save proof: ${error.message}`);
    } else if (data) {
      setProofs((items) => [data as ChallengeProof, ...items]);
      setMessage(`Proof added for ${challenge.title}.`);
      formElement.reset();
    }

    setSavingProofChallengeId(null);
  }

  function confirmDeleteProof(proof: ChallengeProof) {
    requestConfirmation({
      title: "Delete challenge proof?",
      detail: "This proof and reports connected to it will be removed from the room. This cannot be undone.",
      confirmLabel: "Delete proof",
      onConfirm: () => deleteProof(proof)
    });
  }

  async function deleteProof(proof: ChallengeProof) {
    if (!requireLogin("delete proof")) return;

    if (!canDeleteUserContent(proof.user_id)) {
      setMessage("Only the proof uploader or Talent7 owner can delete this proof.");
      return;
    }

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
      const mediaCleanupFailed = await deleteR2MediaFile(proof.proof_url)
        .then(() => false)
        .catch(() => true);
      setProofs((items) => items.filter((item) => item.id !== proof.id));
      setChallengeReports((items) => items.filter((item) => item.proof_id !== proof.id));
      setMessage(mediaCleanupFailed ? "Proof deleted, but its R2 media file needs manual cleanup." : "Proof deleted.");
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

    if (isChallengeClosed(challenge)) {
      setMessage("This challenge is closed, so room chat is read-only.");
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
      setMessage("Preview mode: expert help request saved in this browser session.");
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
      setMessage("Expert help request saved for review and assignment.");
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
      setMessage(`Preview mode: request to ${expert.display_name} saved in this browser session.`);
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
      setMessage("Preview mode: expert response saved in this browser session.");
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
      setMessage("Preview mode: session time saved in this browser session.");
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
      setMessage("Preview mode: expert session confirmed in this browser session.");
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
      setMessage("Preview mode: session link saved in this browser session.");
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
      setMessage("Preview mode: expert session completed in this browser session.");
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
      setMessage("Preview mode: expert profile saved in this browser session.");
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

  function confirmDeleteChallengeRoom(challenge: Challenge) {
    requestConfirmation({
      title: isOwnerReviewer ? "Permanently discard this room?" : "Delete mistaken room?",
      detail: isOwnerReviewer
        ? `“${challenge.title}” and all related joins, votes, ratings, proof, invites, chat, and reports will be removed.`
        : `“${challenge.title}” will be deleted. Creator deletion is available only before the room receives activity.`,
      confirmLabel: isOwnerReviewer ? "Discard room" : "Delete room",
      onConfirm: () => deleteChallengeRoom(challenge)
    });
  }

  async function deleteChallengeRoom(challenge: Challenge) {
    if (!requireLogin("delete a challenge room")) return;

    if (!canDeleteChallenge(challenge)) {
      setMessage(
        "Only the room creator can delete an open room before anyone interacts with it. The Talent7 owner can remove rooms for moderation."
      );
      return;
    }

    setDeletingChallengeId(challenge.id);
    setMessage("");

    if (supabase && !challenge.id.startsWith("sample-")) {
      const { error } = await supabase.from("challenges").delete().eq("id", challenge.id);
      if (error) {
        setMessage(`Could not delete room: ${error.message}`);
        setDeletingChallengeId(null);
        return;
      }
    }

    const proofIds = new Set(proofs.filter((item) => item.challenge_id === challenge.id).map((item) => item.id));
    setChallenges((items) => items.filter((item) => item.id !== challenge.id));
    setJoins((items) => items.filter((item) => item.challenge_id !== challenge.id));
    setRatings((items) => items.filter((item) => item.challenge_id !== challenge.id));
    setVotes((items) => items.filter((item) => item.challenge_id !== challenge.id));
    setProofs((items) => items.filter((item) => item.challenge_id !== challenge.id));
    setInvites((items) => items.filter((item) => item.challenge_id !== challenge.id));
    setChallengeMessages((items) => items.filter((item) => item.challenge_id !== challenge.id));
    setChallengeReports((items) =>
      items.filter((item) => item.challenge_id !== challenge.id && !proofIds.has(item.proof_id || ""))
    );
    if (createdChallengeId === challenge.id) setCreatedChallengeId(null);
    if (highlightedChallengeId === challenge.id) setHighlightedChallengeId(null);
    setMessage("Challenge room deleted.");
    setDeletingChallengeId(null);
  }

  async function completeChallenge(event: FormEvent<HTMLFormElement>, challenge: Challenge) {
    event.preventDefault();
    if (!requireLogin("complete a challenge")) return;

    if (isChallengeClosed(challenge)) {
      setMessage("This challenge is already closed.");
      return;
    }

    if (!canManageTeamResult(challenge)) {
      setMessage("Only a team captain, organizer, or challenge creator can mark this team challenge completed.");
      return;
    }


    if (!challengeRosterState(challenge).ready) {
      setMessage(`This challenge cannot finish until both registered rosters are full. ${challengeRosterMessage(challenge)}.`);
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
      completed_by: session?.user.id,
      voting_status: "Closed" as ChallengeVotingStatus,
      voting_closed_at: new Date().toISOString()
    };

    setCompletingChallengeId(challenge.id);
    setMessage("");

    if (!supabase || challenge.id.startsWith("sample-")) {
      setChallenges((items) =>
        items.map((item) => (item.id === challenge.id ? { ...item, ...challengeResult } : item))
      );
      setSelectedStatus("Completed");
      setRoomDiscoveryMode("Newest");
      setMessage(`${challenge.title} completed and moved to Archive. Winner: ${challengeWinnerDisplay(challenge, winner)}.`);
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
      setSelectedStatus("Completed");
      setRoomDiscoveryMode("Newest");
      setMessage(`${challenge.title} completed and moved to Archive. Winner: ${challengeWinnerDisplay(challenge, winner)}.`);
      formElement.reset();
    }

    setCompletingChallengeId(null);
  }

  const activePrimaryConfig = primaryTabs.find((tab) => tab.id === activeAppTab);
  const activeMoreConfig = moreTabs.find((tab) => tab.id === activeAppTab);
  const moreIsActive = isMoreOpen || Boolean(activeMoreConfig);
  const activeSectionLinks = activeAppTab === "settings" && !session
    ? [{ label: "Account", href: "#account" }]
    : activePrimaryConfig?.links ||
      (activeAppTab === "safety"
        ? [
            { label: "Safety", href: "#safety" },
            { label: "Trust & terms", href: "#trust-terms" }
          ]
        : activeAppTab === "roadmap"
          ? [
              { label: "Roadmap", href: "#roadmap" },
              ...(isOwnerReviewer ? [{ label: "Launch control", href: "#launch-control" }] : [])
            ]
          : []);
  const activeSectionLink = activeSectionLinks.find((link) => link.href === `#${activeSection}`);
  const activeWorkspaceTitle = activeAppTab === "settings" && !session
    ? "Account"
    : activeSectionLink?.label || activeMoreConfig?.label || activePrimaryConfig?.label || "Talent7";
  const isRoomsWorkspace = activeAppTab === "challenges" && activeSection === "rooms";
  const showLandingHero = isRoomsWorkspace && authHydrated && !session;
  const showRoomsHero = isRoomsWorkspace && authHydrated && Boolean(session);
  const moreTabCounts: Partial<Record<MoreTabId, number>> = {
    teams: myDashboard.pendingTeamRequests,
    notifications: unreadNotifications.length,
    invites: myDashboard.pendingInvites.length,
    feedback: isOwnerReviewer
      ? founderFeedback.filter((feedback) => feedback.status === "New").length
      : 0
  };
  const moreAttentionSections = Object.values(moreTabCounts).filter((count) => (count || 0) > 0).length;

  if (isPasswordRecovery && session) {
    return (
      <main className="passwordRecoveryView">
        <header className="passwordRecoveryHeader">
          <strong>Talent7</strong>
          <span>Secure account recovery</span>
        </header>

        {notices.length > 0 && (
          <div className="appToastViewport" aria-label="Talent7 notifications">
            {notices.map((notice) => (
              <AppToast key={notice.id} notice={notice} onDismiss={dismissNotice} />
            ))}
          </div>
        )}

        <section aria-labelledby="password-recovery-title" className="passwordRecoverySection">
          <div className="passwordRecoveryIntro">
            <span>Verified recovery link</span>
            <h1 id="password-recovery-title">Reset your password</h1>
            <p>
              Your email link was verified. Choose a new password to finish recovery. Normal Talent7 features stay hidden until recovery is complete.
            </p>
          </div>

          <form className="passwordRecoveryForm" onSubmit={changePassword}>
            <label className="passwordField">
              New password
              <span>
                <input
                  autoComplete="new-password"
                  minLength={8}
                  name="new_password"
                  placeholder="At least 8 characters"
                  required
                  type={showNewPassword ? "text" : "password"}
                />
                <button type="button" onClick={() => setShowNewPassword((current) => !current)}>
                  {showNewPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            <label className="passwordField">
              Confirm new password
              <input
                autoComplete="new-password"
                minLength={8}
                name="confirm_password"
                placeholder="Repeat new password"
                required
                type={showNewPassword ? "text" : "password"}
              />
            </label>
            <div className="passwordRecoveryActions">
              <button disabled={updatingPassword || recoveryCancelling} type="submit">
                {updatingPassword ? "Saving new password..." : "Save new password"}
              </button>
              <button
                className="secondary"
                disabled={updatingPassword || recoveryCancelling}
                onClick={() => void cancelPasswordRecovery()}
                type="button"
              >
                {recoveryCancelling ? "Cancelling..." : "Cancel recovery"}
              </button>
            </div>
          </form>

          <p className="passwordRecoveryHelp">
            Did not request this change? Cancel recovery, close this page, and secure your email account.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={`appTab-${activeAppTab} appView-${activeSection}`} onClick={handleTabAwareNavigation}>
      <a className="skipLink" href={`#${activeSection}`} onClick={skipToCurrentWorkspace}>Skip to current workspace</a>
      <header
        className={`hero ${showLandingHero ? "heroLanding" : showRoomsHero ? "heroRoomsBanner" : "heroCompact"}`}
      >
        <nav>
          <div className="brandBlock">
            <strong>Talent7</strong>
            {!showLandingHero && <span>{activeWorkspaceTitle}</span>}
          </div>
          <div className="navActions">
            <span>{session ? profileName() : "Guest mode"}</span>
          </div>
        </nav>
        {showLandingHero && (
        <section>
          <p className="eyebrow">Early access MVP</p>
          <h1>Challenge anyone. Prove it. Rise on Talent7.</h1>
          <p>
            Talent7 brings fair, proof-based challenge rooms to talent battles, sports matchups,
            and mobile gaming.
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
            <a href="#rooms" className="primary">Browse challenge rooms</a>
            <a href="#create" className="secondary">Create a challenge</a>
          </div>
          <details className="heroTools">
            <summary>Share and launch tools</summary>
            <div className="heroToolsGrid">
              <button onClick={() => copyShareText("Talent7 link", siteUrl())} type="button">Copy invite link</button>
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
              <button onClick={() => startFounderFeedback("Bug")} type="button">Report a bug</button>
              <a href="#plans">Founder support</a>
            </div>
          </details>
        </section>
        )}
        {showRoomsHero && (
          <section className="roomsHeroContent">
            <p className="eyebrow">Challenge rooms</p>
            <h2>Compete, watch, and react live.</h2>
            <p>Find an opponent, enter a room, or follow the matchups getting attention now.</p>
            <div className="heroActions">
              <a href="#create" className="primary">Create a challenge</a>
              <a href="#profiles" className="secondary">Find opponents</a>
            </div>
          </section>
        )}
      </header>

      {!hasSupabaseConfig && (
        <aside className="setupNotice">
          <strong>Preview mode:</strong> Supabase is not connected. Changes made here stay in this browser session
          and are not shared with other users.
        </aside>
      )}

      {notices.length > 0 && (
        <div className="appToastViewport" aria-label="Talent7 notifications">
          {notices.map((notice) => (
            <AppToast key={notice.id} notice={notice} onDismiss={dismissNotice} />
          ))}
        </div>
      )}

      {confirmationRequest && (
        <>
          <button
            aria-label="Cancel destructive action"
            className="appConfirmBackdrop"
            disabled={confirmationBusy}
            onClick={closeConfirmationDialog}
            type="button"
          />
          <section
            aria-busy={confirmationBusy}
            aria-describedby="confirmation-dialog-detail"
            aria-labelledby="confirmation-dialog-title"
            aria-modal="true"
            className="appConfirmDialog"
            ref={confirmationDialogRef}
            role="alertdialog"
          >
            <span>Permanent action</span>
            <h2 id="confirmation-dialog-title">{confirmationRequest.title}</h2>
            <p id="confirmation-dialog-detail">{confirmationRequest.detail}</p>
            <div className="appConfirmActions">
              <button data-confirm-cancel disabled={confirmationBusy} onClick={closeConfirmationDialog} type="button">
                {confirmationRequest.cancelLabel || "Keep it"}
              </button>
              <button className="confirmDanger" disabled={confirmationBusy} onClick={runConfirmedAction} type="button">
                {confirmationBusy ? "Working..." : confirmationRequest.confirmLabel}
              </button>
            </div>
          </section>
        </>
      )}

      {isMoreOpen && (
        <>
          <button
            className="appMoreBackdrop"
            aria-label="Close More menu"
            onClick={closeMoreMenu}
            type="button"
          />
          <section
            aria-labelledby="more-menu-title"
            aria-modal="true"
            className="appMoreMenu"
            ref={moreMenuRef}
            role="dialog"
          >
            <div className="appMoreHeader">
              <div>
                <strong id="more-menu-title">More</strong>
                <span>Account, profile, appearance, and more options.</span>
              </div>
              <button
                aria-label="Close More menu"
                title="Close"
                onClick={closeMoreMenu}
                type="button"
              >
                X
              </button>
            </div>

            <div className="appMoreEssentials" aria-label="Account and appearance shortcuts">
              <div className="appMoreQuickLinks">
                <button onClick={() => openSection("account", true)} type="button">
                  <span className="appMoreQuickGlyph" aria-hidden="true">⚙</span>
                  <span>
                    <strong>Settings &amp; account</strong>
                    <small>Login, password, privacy, and account controls</small>
                  </span>
                </button>
                <button
                  onClick={() => {
                    openSection("account", true);
                    window.setTimeout(
                      () => document.querySelector<HTMLElement>(session ? ".profileForm" : ".authForm")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                      120
                    );
                  }}
                  type="button"
                >
                  <span className="appMoreQuickGlyph" aria-hidden="true">◎</span>
                  <span>
                    <strong>{session ? "My profile" : "Create profile"}</strong>
                    <small>{session ? "Edit your public Talent7 identity" : "Sign in to build your Talent7 identity"}</small>
                  </span>
                </button>
                <button onClick={() => switchAppTab("profiles")} type="button">
                  <span className="appMoreQuickGlyph" aria-hidden="true">⌕</span>
                  <span>
                    <strong>Discover profiles</strong>
                    <small>Find people to follow or challenge</small>
                  </span>
                </button>
              </div>

              <div className="appThemeControl">
                <span className="appThemeIcon" aria-hidden="true">{colorTheme === "dark" ? "☾" : "☀"}</span>
                <span>
                  <strong>Black theme</strong>
                  <small>{colorTheme === "dark" ? "Dark mode is on" : "Use the darker Talent7 interface"}</small>
                </span>
                <button
                  aria-label={`${colorTheme === "dark" ? "Turn off" : "Turn on"} black theme`}
                  aria-pressed={colorTheme === "dark"}
                  className={colorTheme === "dark" ? "active" : ""}
                  disabled={!colorThemeHydrated}
                  onClick={() => setColorTheme((current) => current === "dark" ? "light" : "dark")}
                  type="button"
                >
                  <span aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="appMoreGroups">
              {moreTabGroups.map((group) => (
                <section className="appMoreGroup" key={group.label}>
                  <div className="appMoreGroupHeader">
                    <strong>{group.label}</strong>
                    <span>{group.description}</span>
                  </div>
                  <div className="appMoreGrid">
                    {group.tabIds.map((tabId) => {
                      const tab = moreTabs.find((item) => item.id === tabId);
                      if (!tab) return null;
                      const attentionCount = moreTabCounts[tab.id] || 0;

                      return (
                        <button
                          aria-current={activeAppTab === tab.id ? "page" : undefined}
                          className={activeAppTab === tab.id ? "active" : ""}
                          data-more-tab={tab.id}
                          key={tab.id}
                          onClick={() => switchAppTab(tab.id)}
                          type="button"
                        >
                          <span className="appMoreItemTitle">
                            <strong>{tab.label}</strong>
                            {attentionCount > 0 && <em aria-label={`${attentionCount} items need attention`}>{attentionCount}</em>}
                          </span>
                          <span>{tab.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </>
      )}

      <nav className="appTabs" aria-label="Talent7 workspaces" role="tablist">
        <div className="appTabsScroller">
        {primaryTabs.map((tab, tabIndex) => (
          <button
            aria-controls={tab.firstSection}
            aria-selected={activeAppTab === tab.id}
            className={activeAppTab === tab.id ? "active" : ""}
            data-primary-tab={tab.id}
            key={tab.id}
            onClick={() => switchAppTab(tab.id)}
            onKeyDown={(event) => handlePrimaryTabKeyDown(event, tabIndex)}
            role="tab"
            type="button"
          >
            <span className="mobileNavIcon">
              <MobileNavIcon name={tab.id === "settings" ? "settings" : tab.id === "challenges" ? "challenges" : "listen"} />
            </span>
            <span className="mobileNavLabel">{tab.id === "settings" && !session ? "Account" : tab.label}</span>
          </button>
        ))}
        <button
          aria-controls="notifications"
          aria-label={unreadNotifications.length > 0 ? `Notifications, ${unreadNotifications.length} unread` : "Notifications"}
          aria-selected={activeAppTab === "notifications"}
          className={`mobileNotificationTab${activeAppTab === "notifications" ? " active" : ""}`}
          onClick={() => switchAppTab("notifications")}
          role="tab"
          type="button"
        >
          <span className="mobileNavIcon mobileNotificationBell"><MobileNavIcon name="notifications" /></span>
          <span className="mobileNavLabel mobileNotificationLabel">Notifications</span>
          {unreadNotifications.length > 0 && (
            <em className="appTabBadge" aria-hidden="true">
              {unreadNotifications.length > 99 ? "99+" : unreadNotifications.length}
            </em>
          )}
        </button>
        <button
          aria-expanded={isMoreOpen}
          aria-haspopup="dialog"
          className={`${moreIsActive ? "active" : ""}${activeAppTab === "notifications" ? " notificationIsActive" : ""}`}
          onClick={() => setIsMoreOpen((current) => !current)}
          ref={moreTriggerRef}
          type="button"
        >
          <span className="desktopMoreLabel">{activeMoreConfig ? `More: ${activeMoreConfig.label}` : "More"}</span>
          <span className="mobileMoreLabel mobileNavIcon"><MobileNavIcon name="more" /></span>
          <span className="mobileMoreLabel mobileNavLabel">More</span>
          {moreAttentionSections > 0 && (
            <em className="appTabBadge" aria-label={`${moreAttentionSections} More sections need attention`}>
              {moreAttentionSections}
            </em>
          )}
        </button>
        </div>
      </nav>

      {activeSectionLinks.length > 1 && (
        <nav className="appSubTabs" aria-label={`${activePrimaryConfig?.label || activeMoreConfig?.label || "Talent7"} options`}>
          {activeSectionLinks.map((link) => (
            <a className={activeSection === link.href.slice(1) ? "active" : ""} href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      )}

      {notificationReturnContext && activeAppTab !== "notifications" && (
        <aside className="notificationReturnBar" aria-label="Return to notifications">
          <button aria-label={`Back to Notifications from ${notificationReturnContext.notificationTitle}`} onClick={returnToNotifications} type="button">
            <span className="notificationReturnAction">
              <span aria-hidden="true">←</span> Back to Notifications
            </span>
            <small>{notificationReturnContext.notificationTitle}</small>
          </button>
        </aside>
      )}

      <section className="section firstWaveSection" id="first-wave">
        <div className="sectionHeader">
          <p className="eyebrow">Early access</p>
          <h2>Built for the first Play Store launch wave</h2>
          <p>Start as an audience member, challenger, team owner, or organizer and build an early Talent7 history.</p>
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
            <p>Follow profiles, form teams, and watch notifications for invites and challenge updates.</p>
            <a href="#profiles">Browse people</a>
          </article>
        </div>
        <div className="firstWaveSignup">
          <form onChange={() => setFirstWaveSaveConfirmed(false)} onSubmit={submitFirstWaveInterest}>
            <div>
              <p className="eyebrow">First wave list</p>
              <h3>Tell Talent7 what you want first</h3>
              <p>
                This helps the owner prioritize core challenge flows and future Showcase Talent, Coaching, and Guidance releases.
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
                    <option key={role} value={role}>
                      {role === "Coach" ? "Coach (future Coaching)" : role === "Expert helper" ? "Expert helper (future Guidance)" : role}
                    </option>
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
            <div className="firstWaveSubmit">
              <button disabled={savingFirstWave} type="submit">
                {savingFirstWave
                  ? "Saving interests..."
                  : firstWaveSaveConfirmed
                    ? "Interests saved ✓"
                    : myFirstWaveInterest
                      ? "Update interests"
                      : "Save interests"}
              </button>
              {firstWaveSaveConfirmed && (
                <span className="formSavedStatus" role="status">✓ Your interests were saved successfully.</span>
              )}
            </div>
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
              <small>{firstWaveInterests.filter((interest) => interest.role_goal === "Coach").length} future Coaching interests</small>
              <small>{firstWaveInterests.filter((interest) => interest.role_goal === "Expert helper").length} future Guidance interests</small>
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
          <p>See invites, team requests, live rooms, voting windows, proof uploads, results, report updates, and feedback in one place.</p>
        </div>
        {session ? (
          <>
            {pushNotificationsEnabled && <div className="pushPreferencesCard">
              <div className="pushPreferencesHeader">
                <div>
                  <span>Android push notifications</span>
                  <strong>{pushDeviceConnected ? "This device is connected" : "Connect the Talent7 Android app"}</strong>
                  <small>
                    {pushDeviceConnected
                      ? "Important updates can reach this phone even when Talent7 is closed."
                      : "Open this account in the updated Android app and allow notifications to connect the phone."}
                  </small>
                </div>
                <span className={pushDeviceConnected ? "pushDeviceStatus connected" : "pushDeviceStatus"}>
                  {pushPreferencesLoading ? "Checking..." : pushDeviceConnected ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="pushPreferenceGrid">
                {([
                  ["push_enabled", "Allow push notifications"],
                  ["challenge_invites", "Challenge invitations"],
                  ["challenge_updates", "Accepted, declined, and completed challenges"],
                  ["live_rooms", "Rooms going live"],
                  ["voting_windows", "Voting windows opening"],
                  ["proof_results", "Proof and result updates"],
                  ["social_updates", "Social updates"],
                  ["weekly_summary", "Weekly activity summary"]
                ] as Array<[keyof PushNotificationPreferences, string]>).map(([key, label]) => (
                  <label className={key !== "push_enabled" && !pushPreferences.push_enabled ? "disabled" : ""} key={key}>
                    <input
                      checked={pushPreferences[key]}
                      disabled={key !== "push_enabled" && !pushPreferences.push_enabled}
                      onChange={(event) =>
                        setPushPreferences((current) => ({ ...current, [key]: event.target.checked }))
                      }
                      type="checkbox"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="pushPreferencesActions">
                <button disabled={savingPushPreferences || pushPreferencesLoading} onClick={savePushNotificationPreferences} type="button">
                  {savingPushPreferences ? "Saving..." : "Save notification preferences"}
                </button>
                {pushPreferences.push_enabled && !pushDeviceConnected && nativePushAvailable && (
                  <button className="secondary" onClick={() => window.Talent7Push?.requestPermissionAndToken()} type="button">
                    Connect this phone
                  </button>
                )}
              </div>
              <small className="pushPrivacyNote">Device tokens are private, linked only to your signed-in account, and removed when the account is deleted.</small>
            </div>}
            {notifications.length > 0 ? (
            <>
              <div className="notificationToolbar">
                <strong>
                  {unreadNotifications.length} unread / {visibleNotifications.length} shown
                </strong>
                <div>
                  <button disabled={unreadNotifications.length === 0} onClick={markAllNotificationsRead} type="button">
                    Mark all read
                  </button>
                  <button
                    className="secondary"
                    disabled={!notifications.some((notification) => readNotificationKeys.includes(notificationKey(notification)))}
                    onClick={clearReadNotifications}
                    type="button"
                  >
                    Clear read
                  </button>
                </div>
              </div>
              {notificationUndo && (
                <div aria-live="polite" className="notificationUndoBar">
                  <span>{notificationUndo.label}</span>
                  <button onClick={() => void undoNotificationDismissal()} type="button">Undo</button>
                </div>
              )}
              <label className="notificationSearch">
                Search notifications
                <input
                  onChange={(event) => setNotificationSearch(event.target.value)}
                  placeholder="Search invites, saved rooms, proof, teams, reports..."
                  type="search"
                  value={notificationSearch}
                />
              </label>
              <div className="notificationFilters">
                {(["All", "Unread", "Invites", "Teams", "Live", "Voting", "Proof", "Results", "Reports", "Showcase", "Expert help"] as NotificationFilter[]).map(
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
                {pagedNotifications.map((notification) => {
                  const isRead = readNotificationKeys.includes(notificationKey(notification));

                  return (
                    <article className={`notificationItem ${isRead ? "read" : "unread"}`} key={notification.id}>
                      <a
                        href={notification.href}
                        onClick={(event) => openNotificationTarget(event, notification)}
                      >
                        <span>{notification.label}</span>
                        <strong>{notification.title}</strong>
                        <small>{notification.detail}</small>
                      </a>
                      <div className="notificationActions">
                        <button disabled={isRead} onClick={() => markNotificationRead(notification)} type="button">
                          {isRead ? "Read" : "Mark read"}
                        </button>
                        <button className="secondary" onClick={() => dismissNotification(notification)} type="button">
                          Dismiss
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <PaginationControls
                currentPage={notificationPage}
                label="Notifications"
                onPageChange={setNotificationPage}
                pageSize={notificationPageSize}
                targetId="notifications"
                totalItems={visibleNotifications.length}
              />
            </>
          ) : (
            <div className="emptyState">
              <strong>No notifications yet.</strong>
              <small>Invites, saved-room activity, team updates, proof uploads, reports, and comments will appear here.</small>
            </div>
          )}
          </>
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
          <p>Your account protects your profile, rooms, votes, proof uploads, teams, and safety reports.</p>
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
                <span>Talent7 access</span>
                <strong>Free member</strong>
                <small>Core challenge access stays free.</small>
              </div>
              <div>
                <span>Supporter badge</span>
                <strong>{supporterTierByUser[session.user.id] || "No badge yet"}</strong>
                <small>{supporterTierByUser[session.user.id] ? "Verified one-time support" : "Optional one-time support"}</small>
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
              <a href="/terms">Terms and Conditions</a>
              <a href="/shipping">Shipping Policy</a>
              <a href="/refunds">Cancellation and Refunds</a>
              <button
                onClick={() => setAccountDeletionFormUserId(session.user.id)}
                type="button"
              >
                {activeAccountDeletionRequest ? "View deletion request" : "Request account deletion"}
              </button>
              <a href="/support">Contact Us</a>
              <a href="/child-safety">Child safety standards</a>
            </div>
            {(activeAccountDeletionRequest || accountDeletionFormUserId === session.user.id) && (
              <div className="accountDeletionPanel" id="account-deletion-panel">
                <div className="accountDeletionPanelHeader">
                  <div>
                    <span>Account deletion</span>
                    <strong>{activeAccountDeletionRequest ? "Request in progress" : "Request permanent deletion"}</strong>
                    <small>
                      {activeAccountDeletionRequest
                        ? "Your account remains active during the seven-day cancellation window."
                        : "Confirm your current password. A seven-day cancellation window starts when you submit."}
                    </small>
                  </div>
                  {!activeAccountDeletionRequest && (
                    <button onClick={() => setAccountDeletionFormUserId(null)} type="button">Close</button>
                  )}
                </div>
                {activeAccountDeletionRequest ? (
                  <div className="accountDeletionStatus">
                    <p><strong>{activeAccountDeletionRequest.status}</strong></p>
                    <small>
                      Requested {new Date(activeAccountDeletionRequest.created_at).toLocaleString()} · eligible after{" "}
                      <time dateTime={activeAccountDeletionRequest.eligible_after}>
                        {new Date(activeAccountDeletionRequest.eligible_after).toLocaleString()}
                      </time>
                    </small>
                    {activeAccountDeletionRequest.reason && <p>{activeAccountDeletionRequest.reason}</p>}
                    {activeAccountDeletionRequest.last_error && <p className="deletionError">{activeAccountDeletionRequest.last_error}</p>}
                    <button
                      disabled={accountDeletionActionId === activeAccountDeletionRequest.id || activeAccountDeletionRequest.status === "Deleting"}
                      onClick={() => confirmCancelAccountDeletion(activeAccountDeletionRequest)}
                      type="button"
                    >
                      {accountDeletionActionId === activeAccountDeletionRequest.id ? "Cancelling..." : "Cancel deletion and keep account"}
                    </button>
                  </div>
                ) : (
                  <form className="accountDeletionForm" onSubmit={submitAccountDeletionRequest}>
                    <label>
                      Reason (optional)
                      <textarea maxLength={500} name="deletion_reason" placeholder="Tell us anything the reviewer should know." rows={3} />
                    </label>
                    <label>
                      Current password
                      <input autoComplete="current-password" name="deletion_password" placeholder="Current password" required type="password" />
                    </label>
                    <label>
                      Type DELETE to confirm
                      <input autoCapitalize="characters" autoComplete="off" name="deletion_confirmation" pattern="DELETE" placeholder="DELETE" required />
                    </label>
                    <TurnstileWidget
                      action="account_deletion"
                      onToken={setAccountDeletionCaptchaToken}
                      resetKey={accountDeletionCaptchaResetKey}
                      siteKey={turnstileSiteKey}
                    />
                    <button disabled={savingAccountDeletion} type="submit">
                      {savingAccountDeletion ? "Submitting request..." : "Request account deletion"}
                    </button>
                    <small>Need help accessing the account? Use the <a href="/delete-account">public deletion page</a>.</small>
                  </form>
                )}
              </div>
            )}
            <form className="passwordForm" onSubmit={changePassword}>
              <div>
                <span>Password</span>
                <strong>Change your password</strong>
                <small>Confirm your current password, then choose a new password with at least 8 characters.</small>
              </div>
              <label className="passwordField">
                Current password
                <span>
                  <input
                    autoComplete="current-password"
                    name="current_password"
                    placeholder="Current password"
                    required
                    type={showCurrentPassword ? "text" : "password"}
                  />
                  <button type="button" onClick={() => setShowCurrentPassword((current) => !current)}>
                    {showCurrentPassword ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
              <label className="passwordField">
                New password
                <span>
                  <input autoComplete="new-password" minLength={8} name="new_password" placeholder="New password" required type={showNewPassword ? "text" : "password"} />
                  <button type="button" onClick={() => setShowNewPassword((current) => !current)}>
                    {showNewPassword ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
              <label className="passwordField">
                Confirm new password
                <span>
                  <input autoComplete="new-password" minLength={8} name="confirm_password" placeholder="Repeat new password" required type={showNewPassword ? "text" : "password"} />
                </span>
              </label>
              <button disabled={updatingPassword} type="submit">
                {updatingPassword ? "Updating..." : "Update password"}
              </button>
            </form>
            <form className="profileForm" key={profile?.updated_at || session.user.id} onSubmit={saveProfile}>
              <label>
                Display name
                <input maxLength={60} minLength={2} name="display_name" defaultValue={profile?.display_name || ""} placeholder="Rahul Sharma" required />
              </label>
              <label>
                Username
                <input
                  autoCapitalize="none"
                  maxLength={30}
                  minLength={3}
                  name="username"
                  pattern="[A-Za-z0-9_]+"
                  defaultValue={profile?.username || ""}
                  placeholder="rahulbadminton"
                  required
                />
              </label>
              <label>
                Role
                <select name="role" defaultValue={profile?.role || "Challenger"}>
                  <option>Challenger</option>
                  <option>Audience / voter</option>
                  <option value="Coach / instructor">Coach / instructor (future Coaching)</option>
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
              <fieldset className="challengePreferenceFields wide">
                <legend>Challenge availability</legend>
                <p>Control who can discover and invite you from Find opponents. You can change this at any time.</p>
                <div className="challengePreferenceGrid">
                  <label>
                    Who can challenge you?
                    <select name="challenge_availability" defaultValue={profile?.challenge_availability || "Open to everyone"}>
                      {challengeAvailabilityOptions.map((option) => <option key={option}>{option}</option>)}
                    </select>
                    <small>“People I follow” means only profiles you follow can send an invitation.</small>
                  </label>
                  <label>
                    Skill level
                    <select name="challenge_skill_level" defaultValue={profile?.challenge_skill_level || "Open"}>
                      {challengeSkillOptions.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>
                    Play mode
                    <select name="challenge_mode" defaultValue={profile?.challenge_mode || "Either"}>
                      {challengeModeOptions.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>
                    Preferred format
                    <select name="challenge_format" defaultValue={profile?.challenge_format || "Any"}>
                      {challengeFormatOptions.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </label>
                </div>
                <details className="challengeActivityPicker">
                  <summary>Choose challenge activities</summary>
                  <p>Your main interest is always included. Select up to 12 activities in total.</p>
                  <div>
                    {challengeActivityGroups.map((group) => (
                      <fieldset key={group.label}>
                        <legend>{group.label}</legend>
                        {group.options.map((activity) => (
                          <label key={activity}>
                            <input
                              defaultChecked={
                                profile
                                  ? profileChallengeActivities(profile).includes(activity)
                                  : activity === "Badminton doubles"
                              }
                              name="challenge_activities"
                              type="checkbox"
                              value={activity}
                            />
                            <span>{activity}</span>
                          </label>
                        ))}
                      </fieldset>
                    ))}
                  </div>
                </details>
                <label className="wide">
                  Availability note
                  <textarea
                    defaultValue={profile?.availability_note || ""}
                    maxLength={180}
                    name="availability_note"
                    placeholder="Example: Weekends in Bengaluru, evenings online, or looking for doubles partners."
                    rows={3}
                  />
                  <small>Do not share a home address or private contact details.</small>
                </label>
              </fieldset>
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
                    setLoginPrompt("");
                    setAuthCaptchaToken("");
                    setAuthCaptchaResetKey((key) => key + 1);
                    if (mode === "Log in") setConfirmationEmail("");
                  }}
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </div>
            {loginPrompt && !session && (
              <div className="loginPrompt" role="alert">
                <div>
                  <strong>Log in first</strong>
                  <span>{loginPrompt}</span>
                </div>
                <div className="loginPromptActions">
                  <button type="button" onClick={() => setAuthMode("Log in")}>
                    Log in
                  </button>
                  <button className="secondary" type="button" onClick={() => setLoginPrompt("")}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {confirmationEmail && (
              <div className="confirmEmailNotice">
                <strong>Check your email to finish signup</strong>
                <span>We sent a confirmation link to {confirmationEmail}.</span>
                <small>Open that email, confirm your account, then come back and log in.</small>
                <button disabled={authEmailAction === "resend"} onClick={() => void resendConfirmationEmail()} type="button">
                  {authEmailAction === "resend" ? "Sending..." : "Resend confirmation email"}
                </button>
              </div>
            )}
            <label>
              Email
              <input autoComplete="email" name="email" placeholder="you@example.com" required type="email" />
            </label>
            <label>
              Password
              <span className="passwordField">
                <input
                  autoComplete={authMode === "Sign up" ? "new-password" : "current-password"}
                  minLength={authMode === "Sign up" ? 8 : 6}
                  name="password"
                  placeholder={authMode === "Sign up" ? "At least 8 characters" : "Your password"}
                  required
                  type={showAuthPassword ? "text" : "password"}
                />
                <button type="button" onClick={() => setShowAuthPassword((current) => !current)}>
                  {showAuthPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            <TurnstileWidget
              action="talent7_auth"
              onToken={setAuthCaptchaToken}
              resetKey={authCaptchaResetKey}
              siteKey={turnstileSiteKey}
            />
            {authMode === "Log in" && (
              <button
                className="authTextAction"
                disabled={authEmailAction === "reset"}
                onClick={(event) => void requestPasswordReset(event)}
                type="button"
              >
                {authEmailAction === "reset" ? "Sending reset email..." : "Forgot password?"}
              </button>
            )}
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
                      onClick={() => confirmDeleteShowcasePost(post)}
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
            <AppStatePanel
              actionLabel="Create the first post"
              detail="Post a video, photo, or public link to start the global talent showcase."
              onAction={() => document.querySelector<HTMLElement>(".showcaseForm")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              title="No showcase posts yet"
            />
          )}
        </div>
      </section>

      <section className="section listenSection" id="listen-rooms">
        <div className="sectionHeader">
          <span className="eyebrow">Listen together</span>
          <h2>Wanna listen to songs with your specials/buddies?</h2>
          <p>
            Create a shared room, add public song links, react together, and build a queue. Each track opens in its original
            music service, so Talent7 never stores or rebroadcasts the song.
          </p>
        </div>

        <div className="listenRoomTabs" aria-label="Listen room views" role="tablist">
          <button
            aria-selected={listenRoomStatus === "Open"}
            className={listenRoomStatus === "Open" ? "active" : ""}
            onClick={() => setListenRoomStatus("Open")}
            role="tab"
            type="button"
          >
            Open rooms <span>{listenRoomCounts.open}</span>
          </button>
          <button
            aria-selected={listenRoomStatus === "Archived"}
            className={listenRoomStatus === "Archived" ? "active" : ""}
            onClick={() => setListenRoomStatus("Archived")}
            role="tab"
            type="button"
          >
            Archive <span>{listenRoomCounts.archived}</span>
          </button>
        </div>

        <div className="listenLayout">
          {listenRoomStatus === "Open" ? (
            <>
            <form className="card listenCreateCard" onSubmit={handleCreateListenRoom}>
            <div>
              <span className="statusBadge">Public links only</span>
              <h3>Create a listen room</h3>
              <p className="muted">Choose who can enter, then use YouTube, Spotify, or another public song link. Talent7 does not store or rebroadcast songs.</p>
            </div>

            <fieldset className="listenVisibilityPicker">
              <legend>Who can enter?</legend>
              <label className={listenRoomDraft.visibility === "Public" ? "active" : ""}>
                <input
                  checked={listenRoomDraft.visibility === "Public"}
                  name="listen_visibility"
                  onChange={() => updateListenRoomDraft("visibility", "Public")}
                  type="radio"
                />
                <span>Public room</span>
                <small>Shown in Open rooms. Any signed-in Talent7 member can join.</small>
              </label>
              <label className={listenRoomDraft.visibility === "Private" ? "active" : ""}>
                <input
                  checked={listenRoomDraft.visibility === "Private"}
                  name="listen_visibility"
                  onChange={() => updateListenRoomDraft("visibility", "Private")}
                  type="radio"
                />
                <span>Private room</span>
                <small>Hidden from discovery. People need both its room code and passcode.</small>
              </label>
            </fieldset>

            {listenRoomDraft.visibility === "Private" && (
              <label>
                Room passcode
                <input
                  autoComplete="new-password"
                  maxLength={32}
                  minLength={4}
                  onChange={(event) => updateListenRoomDraft("passcode", event.target.value)}
                  placeholder="4–32 characters"
                  required
                  type="password"
                  value={listenRoomDraft.passcode}
                />
                <small className="fieldHint">Talent7 stores only a secure hash. Share the passcode privately.</small>
              </label>
            )}

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

            <button disabled={listenActionKey === "create"} type="submit">
              {listenActionKey === "create" ? "Creating room..." : "Create listen room"}
            </button>
            </form>
            <form
              className="card privateListenJoinForm"
              onSubmit={(event) => {
                event.preventDefault();
                void handleJoinPrivateListenRoom();
              }}
            >
              <div>
                <strong>Enter a private room</strong>
                <small>Ask the host for both values.</small>
              </div>
              <input
                aria-label="Private room code"
                autoCapitalize="characters"
                maxLength={12}
                onChange={(event) => setPrivateListenRoomCode(event.target.value.toUpperCase())}
                placeholder="Room code"
                value={privateListenRoomCode}
              />
              <input
                aria-label="Private room passcode"
                autoComplete="current-password"
                maxLength={32}
                onChange={(event) => setPrivateListenRoomPasscode(event.target.value)}
                placeholder="Passcode"
                type="password"
                value={privateListenRoomPasscode}
              />
              <button
                disabled={listenActionKey === "join-private"}
                type="submit"
              >
                {listenActionKey === "join-private" ? "Entering..." : "Enter private room"}
              </button>
            </form>
            </>
          ) : (
            <aside className="card listenArchiveInfo">
              <span className="statusBadge">Your saved queues</span>
              <h3>Listen room archive</h3>
              <p>
                Closing a room keeps its song links and queue here. Archived rooms are private to their creator and cannot
                receive new joins, reactions, or songs.
              </p>
              <strong>{listenRoomCounts.archived} archived room{listenRoomCounts.archived === 1 ? "" : "s"}</strong>
              <small>Restore a room to reopen it with its original privacy setting, or permanently delete it when you no longer need it.</small>
            </aside>
          )}

          <div className="listenRoomList">
            {listenLoading && (
              <AppStatePanel detail="Loading the shared room queue and reactions." title="Loading listen rooms..." />
            )}
            {!listenLoading && listenLoadError && (
              <AppStatePanel
                actionLabel="Try again"
                detail={listenLoadError}
                onAction={() => void refreshListenRooms(true)}
                title="Listen rooms need attention"
              />
            )}
            {!listenLoading && !listenLoadError && visibleListenRooms.length === 0 && (
              <AppStatePanel
                actionLabel={listenRoomStatus === "Open" ? "Create the first room" : undefined}
                detail={
                  listenRoomStatus === "Open"
                    ? "Start a shared queue for friends, teammates, study buddies, or someone special."
                    : "Rooms you close will keep their song links here until you restore or permanently delete them."
                }
                onAction={
                  listenRoomStatus === "Open"
                    ? () => document.querySelector<HTMLElement>(".listenCreateCard")?.scrollIntoView({ behavior: "smooth" })
                    : undefined
                }
                title={listenRoomStatus === "Open" ? "No open listen rooms yet" : "Your archive is empty"}
              />
            )}
            {visibleListenRooms.map((room) => {
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
                      <span className="statusBadge">
                        {room.status === "Archived" ? "Archived queue" : room.visibility === "Private" ? "Private room" : "Public room"}
                      </span>
                    </div>

                  {room.visibility === "Private" && room.room_code && (
                    <div className="privateListenRoomCode">
                      <span>Private room code</span>
                      <strong>{room.room_code}</strong>
                      <button onClick={() => void copyShareText("Private room code", room.room_code || "")} type="button">
                        Copy code
                      </button>
                      <small>Members still need the passcode chosen by the host.</small>
                    </div>
                  )}

                  {room.room_note ? <p>{room.room_note}</p> : null}

                  <div className="nowPlaying">
                    <span className="eyebrow">Now playing</span>
                    <a href={room.current_track_url} rel="noreferrer" target="_blank">
                      {room.current_track_title}
                    </a>
                  </div>

                  {room.status === "Open" ? (
                    <div className="listenRoomActions">
                      {room.visibility === "Private" ? (
                        <button disabled type="button">Private member ({room.listener_count})</button>
                      ) : (
                        <button
                          disabled={listenActionKey === `join-${room.id}`}
                          type="button"
                          onClick={() => void handleJoinListenRoom(room.id)}
                        >
                          {listenActionKey === `join-${room.id}` ? "Joining..." : `Join room (${room.listener_count})`}
                        </button>
                      )}
                      <button
                        disabled={listenActionKey === `love-${room.id}`}
                        type="button"
                        onClick={() => void handleReactListenRoom(room.id, "love")}
                      >
                        Love ({room.love_count})
                      </button>
                      <button
                        disabled={listenActionKey === `vibe-${room.id}`}
                        type="button"
                        onClick={() => void handleReactListenRoom(room.id, "vibe")}
                      >
                        Vibe ({room.vibe_count})
                      </button>
                    </div>
                  ) : (
                    <p className="listenArchivedNotice">Archived rooms are read-only. Restore this room to accept joins, reactions, or new songs.</p>
                  )}

                  {session?.user.id === room.created_by && supabase && (
                    <div className="listenOwnerActions">
                      {room.status === "Archived" ? (
                        <button
                          disabled={listenActionKey === `restore-${room.id}`}
                          onClick={() => void restoreListenRoom(room)}
                          type="button"
                        >
                          {listenActionKey === `restore-${room.id}` ? "Restoring..." : "Restore room"}
                        </button>
                      ) : (
                        <button
                          disabled={listenActionKey === `archive-${room.id}`}
                          onClick={() => void archiveListenRoom(room)}
                          type="button"
                        >
                          {listenActionKey === `archive-${room.id}` ? "Closing..." : "Close and archive"}
                        </button>
                      )}
                      <button
                        className="dangerAction"
                        disabled={listenActionKey === `delete-${room.id}`}
                        onClick={() => confirmDeleteListenRoom(room)}
                        type="button"
                      >
                        {room.status === "Archived" ? "Delete permanently" : "Delete room"}
                      </button>
                    </div>
                  )}

                  {room.status === "Open" && (
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
                      <button disabled={listenActionKey === `track-${room.id}`} type="submit">
                        {listenActionKey === `track-${room.id}` ? "Adding..." : "Add song"}
                      </button>
                    </form>
                  )}

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
          <p>Publish a coaching offer, share availability and expected pricing, or send a learner request directly to a coach.</p>
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
              Expected price range
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
            <AppStatePanel
              actionHref="#profiles"
              actionLabel="Find coach profiles"
              detail="Coach profiles can publish the first training offer here."
              title="No coaching offers yet"
            />
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
                          {challenge.winner ? ` / Winner: ${challengeWinnerDisplay(challenge)}` : ""}
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
        <div className="discoveryToolbar teamDiscoveryToolbar">
          <label>
            Search teams
            <input
              onChange={(event) => setTeamSearch(event.target.value)}
              placeholder="Search team, activity, region, or type..."
              type="search"
              value={teamSearch}
            />
          </label>
          <div aria-label="Team ordering" className="discoverySort" role="group">
            <button
              aria-pressed={teamDiscoverySort === "Best match"}
              className={teamDiscoverySort === "Best match" ? "active" : ""}
              onClick={() => setTeamDiscoverySort("Best match")}
              type="button"
            >
              Best match
            </button>
            <button
              aria-pressed={teamDiscoverySort === "Newest"}
              className={teamDiscoverySort === "Newest" ? "active" : ""}
              onClick={() => setTeamDiscoverySort("Newest")}
              type="button"
            >
              Newest
            </button>
          </div>
          <small>
            {profile
              ? `${visibleTeams.length} team${visibleTeams.length === 1 ? "" : "s"}; interest and region matches appear first.`
              : `${visibleTeams.length} team${visibleTeams.length === 1 ? "" : "s"}; save a profile to unlock matching.`}
          </small>
        </div>
        <div className="teamGrid">
          {visibleTeams.length > 0 ? (
            visibleTeams.map((team) => {
              const matchReasons = teamDiscoveryReasons(team, profile);
              return (
              <article
                className={team.id === highlightedTeamId ? "highlightShareTarget" : ""}
                id={teamHash(team.id)}
                key={team.id}
              >
                <span>{team.team_type}</span>
                <strong>{team.name}</strong>
                <small>Owner: {profileDisplayName(team.owner_user_id)}</small>
                {matchReasons.length > 0 && (
                  <div className="discoveryMatchRow" aria-label="Why this team matches">
                    {matchReasons.map((reason) => <small key={reason}>{reason}</small>)}
                  </div>
                )}
                <p>{team.description}</p>
                <div className="teamMeta">
                  <small>{team.main_activity}</small>
                  <small>{team.region}</small>
                  <small>{teamRequestCounts[team.id]?.accepted || 0} accepted</small>
                  <small>{teamRequestCounts[team.id]?.pending || 0} pending</small>
                </div>
                <button className="teamShareButton" onClick={() => shareTeam(team)} type="button">
                  Share team
                </button>
                {sharedTeamTarget?.teamId === team.id && (
                  <div className="sharedIntentNotice">
                    <strong>Continue from shared link</strong>
                    <small>
                      Review the team, then confirm the highlighted {sharedTeamTarget.intent === "join" ? "join request" : "challenge"} action.
                    </small>
                  </div>
                )}
                {team.owner_user_id === session?.user.id ? (
                  <div className="ownTeamNotice">
                    <strong>Your team</strong>
                    <small>Join requests will appear in your team inbox.</small>
                    <button
                      className={sharedTeamTarget?.teamId === team.id && sharedTeamTarget.intent === "challenge" ? "sharedIntentAction" : ""}
                      id={`shared-team-challenge-${team.id}`}
                      type="button"
                      onClick={() => challengeTeam(team)}
                    >
                      Start team challenge
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className={`teamChallengeButton${
                        sharedTeamTarget?.teamId === team.id && sharedTeamTarget.intent === "challenge" ? " sharedIntentAction" : ""
                      }`}
                      id={`shared-team-challenge-${team.id}`}
                      type="button"
                      onClick={() => challengeTeam(team)}
                    >
                      Challenge this team
                    </button>
                    <form className="teamRequestForm" onSubmit={(event) => requestTeamJoin(event, team)}>
                      <select name="member_role" defaultValue="Player">
                        {teamMemberRoles.map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                      <input name="message" placeholder="Short note: role, skill level, city, timing..." />
                      <button
                        className={sharedTeamTarget?.teamId === team.id && sharedTeamTarget.intent === "join" ? "sharedIntentAction" : ""}
                        disabled={teamRequestId === team.id}
                        id={`shared-team-join-${team.id}`}
                        type="submit"
                      >
                        {teamRequestId === team.id ? "Sending..." : "Request to join"}
                      </button>
                    </form>
                  </>
                )}
              </article>
              );
            })
          ) : (
            <AppStatePanel
              actionLabel={teams.length > 0 ? "Clear team search" : "Create the first team"}
              detail={
                teams.length > 0
                  ? "Try a team name, activity, region, or type, or show every team again."
                  : "Start a Talent7 sports team, dance crew, gaming clan, or fitness group."
              }
              onAction={() => {
                if (teams.length > 0) {
                  setTeamSearch("");
                  return;
                }
                document.querySelector<HTMLElement>(".teamForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              title={teams.length > 0 ? "No teams found" : "No teams yet"}
            />
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
            <p>Talent7 guidance is informational only. For medical or urgent danger, call local emergency services first.</p>
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
        {isOwnerReviewer && (
          <div className="adminDeletionPanel">
            <div className="adminModerationHeader">
              <div>
                <p className="eyebrow">Privacy operations</p>
                <h3>Account deletion queue</h3>
                <small>Review requests, respect the cancellation window, then complete deletion from this server-only workflow.</small>
              </div>
              <strong>{accountDeletionRequests.filter((request) => ["Pending", "In review", "Deleting"].includes(request.status)).length} active</strong>
            </div>
            {accountDeletionRequests.length > 0 ? (
              <div className="adminDeletionQueue">
                {accountDeletionRequests.slice(0, 12).map((request) => {
                  const waitingPeriodEnded = accountDeletionClock > 0 && new Date(request.eligible_after).getTime() <= accountDeletionClock;
                  const actionRunning = accountDeletionActionId === request.id;
                  return (
                    <article key={request.id}>
                      <div>
                        <strong>{request.account_email || "Email redacted after completion"}</strong>
                        <span>{request.status}</span>
                      </div>
                      <small>
                        Requested {new Date(request.created_at).toLocaleString()} · eligible {new Date(request.eligible_after).toLocaleString()}
                      </small>
                      <p>{request.reason || "No reason provided."}</p>
                      {request.last_error && <p className="deletionError">{request.last_error}</p>}
                      {request.status === "Pending" && (
                        <div className="ownerReportActions">
                          <button disabled={actionRunning} onClick={() => runAccountDeletionAdminAction(request, "review")} type="button">
                            Start review
                          </button>
                          <button disabled={actionRunning} onClick={() => runAccountDeletionAdminAction(request, "reject")} type="button">
                            Reject
                          </button>
                        </div>
                      )}
                      {request.status === "In review" && (
                        <div className="ownerReportActions">
                          <button
                            disabled={actionRunning || !waitingPeriodEnded}
                            onClick={() => confirmCompleteAccountDeletion(request)}
                            title={waitingPeriodEnded ? "Permanently delete this account" : "Available after the seven-day cancellation window"}
                            type="button"
                          >
                            {actionRunning ? "Working..." : waitingPeriodEnded ? "Complete deletion" : "Waiting period active"}
                          </button>
                          <button disabled={actionRunning} onClick={() => runAccountDeletionAdminAction(request, "reject")} type="button">
                            Reject
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="emptySafetyInbox">
                <strong>No deletion requests.</strong>
                <small>Authenticated user requests will appear here.</small>
              </div>
            )}
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
          <p>Create a private guidance request, find verified expert profiles, agree a session time, and keep responses connected to the request.</p>
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
            <small>Your request can be reviewed, assigned to a verified expert, scheduled, answered, and completed with feedback.</small>
          </form>
          <div className="expertRoadmap">
            <article>
              <span>Step 1</span>
              <strong>Describe the request</strong>
              <p>Add the help type, urgency, region, and a clear problem description.</p>
            </article>
            <article>
              <span>Step 2</span>
              <strong>Match a verified expert</strong>
              <p>Review expertise, availability, service type, pricing range, and verification status.</p>
            </article>
            <article>
              <span>Step 3</span>
              <strong>Schedule and follow up</strong>
              <p>Agree a time, save the session link, receive guidance, and leave feedback when complete.</p>
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
              Available for live video sessions
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

      <section className="section plansSection" id="plans">
        <div className="sectionHeader">
          <p className="eyebrow">Free access & supporter badges</p>
          <h2>Challenges stay free</h2>
          <p>Audience and challenger access remain free. Three optional one-time digital purchases deliver clearly defined profile badges without locking core challenge features behind payment.</p>
        </div>
        <div className="paymentNotice">
          <strong>Three defined one-time purchases—no subscription</strong>
          <small>Website payments use Razorpay and Android purchases use Google Play. Talent7 verifies every completed purchase on the server before delivering its profile badge.</small>
        </div>
        <SupporterPayments
          accessToken={session?.access_token}
          displayName={profileName()}
          email={session?.user.email}
          onEntitlementChange={(tier) => {
            const userId = session?.user.id;
            if (!userId) return;
            setSupporterEntitlements((items) => {
              const withoutCurrent = items.filter((item) => item.user_id !== userId);
              return tier ? [...withoutCurrent, { active: true, tier, user_id: userId }] : withoutCurrent;
            });
          }}
          onNotice={setMessage}
          onRequireLogin={() => {
            setActiveAppTab("settings");
            setActiveSection("account");
            setLoginPrompt("Log in or create an account before supporting Talent7.");
            window.setTimeout(() => document.getElementById("account")?.scrollIntoView({ behavior: "smooth" }), 80);
          }}
          userId={session?.user.id}
        />
        <div className="paymentStatusPanel">
          <div>
            <span>Future subscription research</span>
            <strong>{currentPaymentInterest ? currentPaymentInterest.label : "Free audience"}</strong>
            <small>
              {currentPaymentInterest
                ? `${currentPaymentInterest.amount_label} · interest recorded`
                : "Monthly subscriptions are not active"}
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
            <strong>Concept plan</strong>
            <p>For frequent competitors who want more challenge tools and stronger visibility.</p>
            <ul>
              <li>Featured challenge rooms</li>
              <li>Advanced stats and history</li>
              <li>More invite and team tools</li>
            </ul>
            <em>Pricing not set</em>
            <button
              disabled={paymentActionKey === "Plan-Challenge Plus-Pricing research"}
              onClick={() => recordPaymentInterest("Plan", "Challenge Plus", "Pricing research")}
              type="button"
            >
              {paymentActionKey === "Plan-Challenge Plus-Pricing research" ? "Saving..." : "Register interest"}
            </button>
          </article>
          <article>
            <span>Team / organizer</span>
            <strong>Concept plan</strong>
            <p>For sports organizers, gaming clans, and teams running repeated tournaments.</p>
            <ul>
              <li>Team pages and member roles</li>
              <li>Tournament and bracket tools</li>
              <li>Venue and event links</li>
            </ul>
            <em>Organizer tools</em>
            <button
              disabled={paymentActionKey === "Plan-Organizer Pro-Pricing research"}
              onClick={() => recordPaymentInterest("Plan", "Organizer Pro", "Pricing research")}
              type="button"
            >
              {paymentActionKey === "Plan-Organizer Pro-Pricing research" ? "Saving..." : "Register organizer interest"}
            </button>
          </article>
        </div>
        <div className="futureFeaturePromo" aria-labelledby="future-features-title">
          <div className="futureFeatureIntro">
            <p className="eyebrow">Future on Talent7</p>
            <h3 id="future-features-title">More ways to build, learn, and get help</h3>
            <p>These experiences are previews of the product roadmap. They are not active services or paid plans yet.</p>
          </div>
          <div className="futureFeatureGrid">
            <article>
              <span>Future feature</span>
              <strong>Showcase Talent</strong>
              <p>Build a dedicated talent portfolio with photos, videos, audience reactions, and public 7-star ratings.</p>
            </article>
            <article>
              <span>Future feature</span>
              <strong>Coaching</strong>
              <p>Discover coaches, explore learning offers, and coordinate structured live or recorded sessions.</p>
            </article>
            <article>
              <span>Future feature</span>
              <strong>Guidance</strong>
              <p>Find verified specialists and request carefully scoped help while keeping safety boundaries clear.</p>
            </article>
          </div>
          <a href="#feedback">Tell us which future feature matters most</a>
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
                <span>Future Coach Pro interest</span>
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
                      `Talent7 is preparing for Play Store launch.\n\nCreate proof-based challenge rooms, join as a challenger or audience member, vote winners, rate out of 7, upload proof, form teams, and join live community battles.\n\nJoin the first wave: ${siteUrl("#first-wave")}\n\n#Talent7 #ChallengeRooms #TalentBattles #SportsChallenge #Breakdance #Gaming`
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
                      `Talent7 is preparing for Play Store launch as a proof-based talent, sports, and gaming challenge app. Users can create rooms, join as challenger or audience, vote winners, rate out of 7, upload proof, form teams, and join the first launch wave.\n\nTry Talent7: ${siteUrl()}\nJoin first wave: ${siteUrl("#first-wave")}`
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
                      `I am preparing Talent7 for Play Store launch. You can create or join challenges, vote, rate out of 7, upload proof, form teams, and watch live community battles.\n\nStart here: ${siteUrl()}`
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
          <p>Talent7 is prioritizing reliable proof-based challenges first, then expanding the tools that active communities use most.</p>
        </div>
        <div className="roadmapGrid">
          <article>
            <span>Now</span>
            <strong>Proof-based challenge rooms</strong>
            <p>Create challenges, join as challenger or audience, vote, rate, upload proof, report issues, and lock winners.</p>
          </article>
          <article>
            <span>Available</span>
            <strong>Profiles, teams, live rooms, and shared queues</strong>
            <p>Build a public identity, organize teams, join live challenge rooms, and share music links.</p>
          </article>
          <article>
            <span>Future</span>
            <strong>Showcase Talent, Coaching, and Guidance</strong>
            <p>Explore dedicated talent portfolios, coach-led learning, verified guidance, advanced organizer tools, brackets, and richer statistics.</p>
          </article>
        </div>
      </section>

      <section className="section trustTermsSection" id="trust-terms">
        <div className="sectionHeader">
          <p className="eyebrow">Trust & terms</p>
          <h2>Clear rules before real users arrive</h2>
          <p>
            These are simple MVP trust notes for launch-wave users. They are not a replacement for lawyer-reviewed terms,
            but they make Talent7&apos;s boundaries clear while the app is still growing.
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
            <p>Talent7 does not operate courts, pools, gyms, or events. Check local rules, safety, costs, and permissions before recording or playing.</p>
          </article>
          <article>
            <span>Future Guidance</span>
            <strong>Emergency services come first</strong>
            <p>Future Guidance will not replace professional or emergency services. For danger, serious injury, or urgent risk, contact local emergency services first.</p>
          </article>
          <article>
            <span>Payments</span>
            <strong>One-time support is optional</strong>
            <p>Core access remains free. Razorpay and Google Play securely process supporter purchases; Talent7 stores only provider references, verification state, amounts, and badge entitlement.</p>
          </article>
        </div>
        <div className="trustContactBox">
          <div>
            <p className="eyebrow">Contact</p>
            <h3>Questions, reports, or permission requests</h3>
            <p>Use Founder Feedback inside the app, or contact the Talent7 founder email if something needs direct attention.</p>
          </div>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms and Conditions</a>
          <a href="/shipping">Shipping Policy</a>
          <a href="/refunds">Cancellation and Refunds</a>
          <a href="/delete-account">Delete account</a>
          <a href="/support">Contact Us</a>
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
          <p>Discover challengers, audience voters, organizers, and gaming squads building early Talent7 history.</p>
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
        <div className="discoveryToolbar profileDiscoveryToolbar">
          <div aria-label="Profile ordering" className="discoverySort" role="group">
            <button
              aria-pressed={profileDiscoverySort === "Best match"}
              className={profileDiscoverySort === "Best match" ? "active" : ""}
              onClick={() => setProfileDiscoverySort("Best match")}
              type="button"
            >
              Best match
            </button>
            <button
              aria-pressed={profileDiscoverySort === "Name"}
              className={profileDiscoverySort === "Name" ? "active" : ""}
              onClick={() => setProfileDiscoverySort("Name")}
              type="button"
            >
              Name
            </button>
          </div>
          <small>
            {profile
              ? `${visibleProfiles.length} profile${visibleProfiles.length === 1 ? "" : "s"}; relevant challengers appear first.`
              : `${visibleProfiles.length} profile${visibleProfiles.length === 1 ? "" : "s"}; save a profile to unlock matching.`}
          </small>
        </div>
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
                  setSharedProfileTarget(null);
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
              <small>{selectedProfileSummary.challenges.length} rooms</small>
              <small>{selectedProfileSummary.wins.length} wins</small>
              <small>{selectedProfileSummary.proofs.length} proofs</small>
            </div>
            <div className="trustBadgeRow">
              {supporterTierByUser[selectedProfile.user_id] && (
                <span className="supporterProfileBadge">★ {supporterTierByUser[selectedProfile.user_id]}</span>
              )}
              {profileTrustBadges(selectedProfile).length > 0 ? (
                profileTrustBadges(selectedProfile).map((badge) => <span key={badge}>{badge}</span>)
              ) : (
                <span>New Talent7 profile</span>
              )}
            </div>
            <div className="profileDetailActions">
              <button
                className={
                  sharedProfileTarget?.userId === selectedProfile.user_id && sharedProfileTarget.intent === "follow"
                    ? "sharedIntentAction"
                    : ""
                }
                disabled={
                  followActionId === selectedProfile.user_id ||
                  selectedProfile.user_id === session?.user.id ||
                  (sharedProfileTarget?.userId === selectedProfile.user_id &&
                    sharedProfileTarget.intent === "follow" &&
                    follows.some(
                      (follow) => follow.follower_id === session?.user.id && follow.following_id === selectedProfile.user_id
                    ))
                }
                id="shared-profile-follow-action"
                onClick={() => toggleFollow(selectedProfile)}
                type="button"
              >
                {follows.some((follow) => follow.follower_id === session?.user.id && follow.following_id === selectedProfile.user_id)
                  ? sharedProfileTarget?.userId === selectedProfile.user_id && sharedProfileTarget.intent === "follow"
                    ? "Already following"
                    : "Following"
                  : selectedProfile.user_id === session?.user.id
                    ? "Your profile"
                    : "Follow"}
              </button>
              <button
                className={
                  sharedProfileTarget?.userId === selectedProfile.user_id && sharedProfileTarget.intent === "challenge"
                    ? "sharedIntentAction"
                    : ""
                }
                disabled={!canUseOpponentInviteAction(selectedProfile)}
                id="shared-profile-challenge-action"
                onClick={() => inviteProfileToChallenge(selectedProfile)}
                type="button"
              >
                {opponentInviteLabel(selectedProfile)}
              </button>
              <button onClick={() => viewProfileActivity(selectedProfile)} type="button">
                View activity
              </button>
              <button onClick={() => shareProfile(selectedProfile)} type="button">
                Share profile
              </button>
            </div>
            <div className="profileDetailGrid">
              <article>
                <span>Challenge rooms</span>
                {selectedProfileSummary.challenges.length > 0 ? (
                  selectedProfileSummary.challenges.map((challenge) => (
                    <button key={challenge.id} onClick={() => viewTeamChallenge(challenge)} type="button">
                      <strong>{challenge.title}</strong>
                      <small>{challenge.status}{challenge.winner ? ` / Winner: ${challengeWinnerDisplay(challenge)}` : ""}</small>
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
                      <strong>{challengeWinnerDisplay(challenge)}</strong>
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
          <>
            <div className="profileGrid">
              {visibleProfiles.length === 0 && (
                <AppStatePanel
                  actionLabel="Clear profile search"
                  detail="Try all profiles again, then filter by a different name, role, interest, or region."
                  onAction={() => setProfileSearch("")}
                  title="No profiles found"
                />
              )}
              {pagedProfiles.map((item) => {
                const matchReasons = profileDiscoveryReasons(item, profile);
                return (
              <article key={item.user_id}>
                <strong>{item.display_name}</strong>
                <span>@{item.username}</span>
                {matchReasons.length > 0 && (
                  <div className="discoveryMatchRow" aria-label="Why this profile matches">
                    {matchReasons.slice(0, 3).map((reason) => <small key={reason}>{reason}</small>)}
                  </div>
                )}
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
                  {supporterTierByUser[item.user_id] && (
                    <span className="supporterProfileBadge">★ {supporterTierByUser[item.user_id]}</span>
                  )}
                  {profileTrustBadges(item).length > 0 ? (
                    profileTrustBadges(item).slice(0, 3).map((badge) => <span key={badge}>{badge}</span>)
                  ) : (
                    <span>New profile</span>
                  )}
                </div>
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
                  <button
                    disabled={!canUseOpponentInviteAction(item)}
                    onClick={() => inviteProfileToChallenge(item)}
                    type="button"
                  >
                    {opponentInviteLabel(item)}
                  </button>
                  <button onClick={() => viewProfileActivity(item)} type="button">
                    View rooms activity
                  </button>
                  <button onClick={() => shareProfile(item)} type="button">
                    Share profile
                  </button>
                </div>
              </article>
                );
              })}
            </div>
            <PaginationControls
              currentPage={profilePage}
              label="Profiles"
              onPageChange={setProfilePage}
              pageSize={profilePageSize}
              targetId="profiles"
              totalItems={visibleProfiles.length}
            />
          </>
        ) : (
          <AppStatePanel
            actionHref="#account"
            actionLabel="Create your profile"
            detail="Save a public Talent7 identity so people can discover and invite you."
            title="No public profiles yet"
          />
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
            <section className="dashboardFocus" aria-labelledby="dashboard-focus-title">
              <div className="dashboardFocusHeader">
                <div>
                  <p className="eyebrow">Your next move</p>
                  <h3 id="dashboard-focus-title">
                    {dashboardPriorities.length > 1 ? "What needs your attention" : "You are ready to continue"}
                  </h3>
                </div>
                <span>{dashboardPriorities.length} priority item{dashboardPriorities.length === 1 ? "" : "s"}</span>
              </div>
              <div className="dashboardPriorityGrid">
                {dashboardPriorities.map((item) => (
                  <article className={`dashboardPriority ${item.tone}`} key={item.id}>
                    <span>{item.label}</span>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <a href={item.href}>{item.action}</a>
                  </article>
                ))}
              </div>
            </section>
            <details className="onboardingChecklist">
              <summary className="onboardingHeader">
                <div>
                  <p className="eyebrow">Get started</p>
                  <h3>{completedOnboardingSteps === onboardingSteps.length ? "Setup completed" : "Profile setup checklist"}</h3>
                  <small>{completedOnboardingSteps} of {onboardingSteps.length} completed</small>
                </div>
                <strong>{Math.round((completedOnboardingSteps / onboardingSteps.length) * 100)}%</strong>
              </summary>
              <div className="onboardingChecklistBody">
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
            </details>
            {profile && (
              <GrowthHub
                displayName={profile.display_name}
                mainInterest={profile.main_interest}
                onReadyNowChange={(value) => {
                  setProfile((current) => current ? { ...current, ready_now_until: value } : current);
                  setPublicProfiles((items) => items.map((item) =>
                    item.user_id === profile.user_id ? { ...item, ready_now_until: value } : item
                  ));
                }}
                readyNowUntil={profile.ready_now_until}
                userId={session.user.id}
              />
            )}
            <div className="dashboardSectionHeader">
              <div>
                <span>Quick actions</span>
                <strong>Create, publish, or check another workspace</strong>
              </div>
            </div>
            <div className="dashboardActions">
              <a href="#create">Create challenge</a>
              <a href="#teams">Teams</a>
              <a href="#notifications">Notifications</a>
              <a href="#safety">Safety reports</a>
            </div>
            <div className="dashboardSectionHeader">
              <div>
                <span>At a glance</span>
                <strong>Your current Talent7 footprint</strong>
              </div>
            </div>
            <div className="myTalentGrid">
              <article>
                <span>Rooms</span>
                <strong>{myDashboard.rooms.length}</strong>
                <small>{myDashboard.rooms[0]?.challenge.title || "No rooms yet"}</small>
              </article>
              <article className="savedRoomsCard">
                <span>Saved rooms</span>
                <strong>{savedRooms.length}</strong>
                <small>
                  {savedRooms[0]
                    ? challenges.find((challenge) => challenge.id === savedRooms[0].challenge_id)?.title || "Saved challenge room"
                    : "Save rooms to revisit them later"}
                </small>
                <a
                  href="#rooms"
                  onClick={() => {
                    setSelectedStatus("Saved");
                    setSelectedLane("All");
                    setRoomSearch("");
                    setSelectedActivityProfile(null);
                  }}
                >
                  View saved rooms
                </a>
              </article>
              <article>
                <span>Teams</span>
                <strong>{myDashboard.teamCount}</strong>
                <small>{myDashboard.pendingTeamRequests} pending team action{myDashboard.pendingTeamRequests === 1 ? "" : "s"}</small>
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
            <details className="dashboardHistory">
              <summary>
                <div>
                  <span>Activity and history</span>
                  <strong>Rooms, teams, reports, and invites</strong>
                </div>
                <small>Open full dashboard</small>
              </summary>
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
                        setSelectedStatus(isChallengeClosed(item.challenge) ? "Completed" : "Open");
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
            </details>
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
            <>
              <div className="feedList">
                {pagedFollowingFeed.map((item) => (
                  <article key={item.id}>
                    <span>{item.action}</span>
                    <strong>{item.actor}</strong>
                    <a
                      href="#rooms"
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
              <PaginationControls
                currentPage={feedPage}
                label="Following feed"
                onPageChange={setFeedPage}
                pageSize={feedPageSize}
                targetId="following-feed"
                totalItems={followingFeed.length}
              />
            </>
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
                <small>{inviteInbox.received.filter((invite) => challengeInviteDisplayStatus(invite) === "Pending").length} pending</small>
              </div>
              {inviteInbox.received.length > 0 ? (
                inviteInbox.received.map((invite) => (
                  <div className="inviteItem" key={invite.id}>
                    <span>{challengeInviteDisplayStatus(invite)}</span>
                    <strong>{challengeTitle(invite.challenge_id)}</strong>
                    <small>Sent to {invite.invited_name}</small>
                    {challengeInviteDisplayStatus(invite) === "Pending" ? (
                      <div className="inviteActions">
                        {invite.share_token && (
                          <button onClick={() => shareChallengeInvite(invite)} type="button">Share invite</button>
                        )}
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
                    ) : invite.status === "Accepted" ? (
                      <div className="inviteActions">
                        <button onClick={() => openInviteChallenge(invite)} type="button">Open room</button>
                      </div>
                    ) : (
                      <small>Invite {challengeInviteDisplayStatus(invite).toLowerCase()}.</small>
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
                    <span>{challengeInviteDisplayStatus(invite)}</span>
                    <strong>{challengeTitle(invite.challenge_id)}</strong>
                    <small>To {invite.invited_name}</small>
                    {challengeInviteDisplayStatus(invite) === "Pending" ? (
                      <div className="inviteActions">
                        <button
                          disabled={inviteActionId === invite.id}
                          onClick={() => withdrawInvite(invite)}
                          type="button"
                        >
                          {inviteActionId === invite.id ? "Withdrawing…" : "Withdraw invite"}
                        </button>
                      </div>
                    ) : invite.status === "Accepted" ? (
                      <div className="inviteActions">
                        <button onClick={() => openInviteChallenge(invite)} type="button">Open room</button>
                      </div>
                    ) : null}
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

      <section className="section opponentsSection" id="opponents">
        <div className="sectionHeader opponentsHeader">
          <div>
            <p className="eyebrow">Find opponents</p>
            <h2>Challenge people who want to play</h2>
            <p>Search active Talent7 profiles by activity, location, skill, play mode, and format. Invitations expire after 7 days, and only one active matchup is allowed between the same two people.</p>
          </div>
          {session && <a href="#account">Manage my availability</a>}
        </div>

        {!session ? (
          <AppStatePanel
            actionHref="#account"
            actionLabel="Log in to find opponents"
            detail="Profiles are shared with signed-in Talent7 members. Log in to search people and send a challenge invitation."
            title="Find opponents after logging in"
          />
        ) : (
          <>
            {!profile && (
              <AppStatePanel
                actionHref="#account"
                actionLabel="Create your profile"
                detail="You can browse the directory now, but you need a saved profile before sending an invitation."
                title="Save your challenger identity"
              />
            )}

            <div className="opponentFilters" role="search">
              <label>
                Search people
                <input
                  onChange={(event) => setOpponentSearch(event.target.value)}
                  placeholder="Name, username, role, or note"
                  type="search"
                  value={opponentSearch}
                />
              </label>
              <label>
                Activity
                <select onChange={(event) => setOpponentActivity(event.target.value)} value={opponentActivity}>
                  <option>All</option>
                  {challengeActivityGroups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((activity) => <option key={activity}>{activity}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                Region
                <input
                  onChange={(event) => setOpponentRegion(event.target.value)}
                  placeholder="India, Bengaluru, Global..."
                  value={opponentRegion}
                />
              </label>
              <label>
                Skill
                <select onChange={(event) => setOpponentSkill(event.target.value as ChallengeSkillLevel | "All")} value={opponentSkill}>
                  <option>All</option>
                  {challengeSkillOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                Play mode
                <select onChange={(event) => setOpponentMode(event.target.value as ChallengeMode | "All")} value={opponentMode}>
                  <option>All</option>
                  {challengeModeOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                Format
                <select onChange={(event) => setOpponentFormat(event.target.value as ChallengeFormat | "All")} value={opponentFormat}>
                  <option>All</option>
                  {challengeFormatOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label className="opponentReadyFilter">
                <input
                  checked={opponentReadyOnly}
                  onChange={(event) => setOpponentReadyOnly(event.target.checked)}
                  type="checkbox"
                />
                Ready Now only
              </label>
              <button
                onClick={() => {
                  setOpponentSearch("");
                  setOpponentActivity("All");
                  setOpponentRegion("");
                  setOpponentSkill("All");
                  setOpponentMode("All");
                  setOpponentFormat("All");
                  setOpponentReadyOnly(false);
                }}
                type="button"
              >
                Clear filters
              </button>
            </div>

            <div className="opponentResultsHeader">
              <strong>{visibleOpponents.length} available profile{visibleOpponents.length === 1 ? "" : "s"}</strong>
              <small>Unavailable profiles are kept private from this list.</small>
            </div>

            {visibleOpponents.length > 0 ? (
              <>
                <div className="opponentGrid">
                  {pagedOpponents.map((item) => {
                    const availability = profileChallengeAvailability(item);
                    const canInvite = canUseOpponentInviteAction(item);
                    const initials = item.display_name
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <article className="opponentCard" key={item.user_id}>
                        <div className="opponentIdentity">
                          <span aria-hidden="true" className="opponentAvatar">{initials || "T7"}</span>
                          <div>
                            <strong>{item.display_name}</strong>
                            <small>@{item.username}</small>
                          </div>
                          <span className={`availabilityBadge ${availability === "Open to everyone" ? "open" : "limited"}`}>
                            {item.ready_now_until && new Date(item.ready_now_until).getTime() > roomRankingTimestamp
                              ? "Ready Now"
                              : availability === "Open to everyone" ? "Open to challenges" : "Followers only"}
                          </span>
                        </div>
                        <div className="opponentMeta">
                          <span>{item.role}</span>
                          <span>{item.region || "Global"}</span>
                          <span>{item.challenge_skill_level || "Open"} level</span>
                          <span>{item.challenge_mode || "Either"}</span>
                          <span>{item.challenge_format || "Any"} format</span>
                        </div>
                        <div className="opponentActivities" aria-label="Challenge activities">
                          {profileChallengeActivities(item).slice(0, 4).map((activity) => <span key={activity}>{activity}</span>)}
                          {profileChallengeActivities(item).length > 4 && <small>+{profileChallengeActivities(item).length - 4} more</small>}
                        </div>
                        {item.availability_note && <p>{item.availability_note}</p>}
                        <div className="trustBadgeRow compact">
                          <span>{followCounts[item.user_id]?.followers || 0} followers</span>
                          {profileTrustBadges(item).slice(0, 2).map((badge) => <span key={badge}>{badge}</span>)}
                        </div>
                        <div className="opponentActions">
                          <button onClick={() => openProfileDetail(item)} type="button">View profile</button>
                          <button
                            disabled={followActionId === item.user_id}
                            onClick={() => toggleFollow(item)}
                            type="button"
                          >
                            {follows.some((follow) => follow.follower_id === session.user.id && follow.following_id === item.user_id)
                              ? "Following"
                              : "Follow"}
                          </button>
                          <button
                            className="primary"
                            disabled={!canInvite}
                            onClick={() => inviteProfileToChallenge(item)}
                            title={opponentInviteTitle(item)}
                            type="button"
                          >
                            {opponentInviteLabel(item)}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <PaginationControls
                  currentPage={opponentPage}
                  label="Opponents"
                  onPageChange={setOpponentPage}
                  pageSize={opponentPageSize}
                  targetId="opponents"
                  totalItems={visibleOpponents.length}
                />
              </>
            ) : (
              <AppStatePanel
                actionLabel="Clear opponent filters"
                detail="Try a wider region, another activity, or All for skill, mode, and format."
                onAction={() => {
                  setOpponentSearch("");
                  setOpponentActivity("All");
                  setOpponentRegion("");
                  setOpponentSkill("All");
                  setOpponentMode("All");
                  setOpponentFormat("All");
                }}
                title="No matching opponents yet"
              />
            )}
          </>
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
              onClick={() => {
                setChallengeCreateStep(1);
                setChallengeCreateMaxStep(1);
                setChallengeStepError("");
                setChallengeDraft((currentDraft) => ({
                  ...currentDraft,
                  invitedProfile: "",
                  invitedUserId: "",
                  team_b: "",
                  team_b_id: "",
                  openOpponent: true,
                  version: currentDraft.version + 1
                }));
              }}
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
        <form className="createForm challengeWizard" id="challenge-wizard" key={challengeDraft.version} noValidate onSubmit={createChallenge}>
          <nav className="challengeWizardProgress" aria-label="Challenge creation progress">
            {[
              { step: 1 as const, label: "Challenge", detail: "Type and title" },
              { step: 2 as const, label: "Competitors", detail: "People or teams" },
              { step: 3 as const, label: "Rules & venue", detail: "Review and publish" }
            ].map((item) => (
              <button
                aria-current={challengeCreateStep === item.step ? "step" : undefined}
                className={`${challengeCreateStep === item.step ? "active" : ""} ${challengeCreateMaxStep > item.step ? "complete" : ""}`}
                disabled={item.step > challengeCreateMaxStep}
                key={item.step}
                onClick={(event) => moveChallengeCreateStep(item.step, event.currentTarget.form)}
                type="button"
              >
                <span>{challengeCreateMaxStep > item.step ? "✓" : item.step}</span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </button>
            ))}
          </nav>
          {challengeStepError && <div className="challengeStepError" role="alert">{challengeStepError}</div>}

          <fieldset className="challengeWizardPanel" hidden={challengeCreateStep !== 1}>
            <legend>Challenge</legend>
            <div className="challengeTypeStep wide">
              <div className="challengeTypeIntro">
                <span>Required</span>
                <div>
                  <strong>Choose the specific challenge</strong>
                  <small>This fills in a suitable category, title, rules, and venue note. You can adjust everything before publishing.</small>
                </div>
              </div>
              <div className="challengeTypeControls">
                <label>
                  Challenge type
                  <select
                    name="sport_type"
                    defaultValue={challengeDraft.sport_type}
                    onChange={(event) => applyChallengeActivity(event.currentTarget.value, event.currentTarget.form)}
                  >
                    {challengeActivityGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((activity) => (
                          <option key={activity}>{activity}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {profile?.main_interest && challengeActivityOptions.includes(profile.main_interest) && (
                  <button
                    className="useInterestButton"
                    onClick={(event) => applyChallengeActivity(profile.main_interest, event.currentTarget.form)}
                    type="button"
                  >
                    Use my interest: {profile.main_interest}
                  </button>
                )}
              </div>
            </div>
            <label>
              Challenge title
              <input name="title" defaultValue={challengeDraft.title} />
            </label>
            <label>
              Category
              <select name="lane" defaultValue={challengeDraft.lane}>
                <option>Talent battle</option>
                <option>Sports challenge</option>
                <option>Mobile gaming challenge</option>
              </select>
              <small className="fieldHint">Selected automatically; change it only if needed.</small>
            </label>
            <div className="challengeWizardActions wide">
              <span>Step 1 of 3</span>
              <button onClick={(event) => moveChallengeCreateStep(2, event.currentTarget.form)} type="button">Continue to competitors</button>
            </div>
          </fieldset>

          <fieldset className="challengeWizardPanel" hidden={challengeCreateStep !== 2}>
            <legend>Competitors</legend>
            <div className="challengeStageIntro wide">
              <span>Step 2</span>
              <div>
                <strong>Who is competing?</strong>
                <small>Use a person, duo, crew, squad, or an open invite. Saved Talent7 team connections are optional.</small>
              </div>
            </div>
            <label>
              Match format
              <select
                name="match_format"
                value={challengeDraft.match_format}
                onChange={(event) => applyMatchFormat(event.currentTarget.value as MatchFormat, event.currentTarget.form)}
              >
                {activityMatchConfig(challengeDraft.sport_type).formats.map((format) => (
                  <option key={format} value={format}>{matchFormatLabel(format, challengeDraft.sport_type)}</option>
                ))}
              </select>
              <small className="fieldHint">
                Only formats supported by {challengeDraft.sport_type} are available.
              </small>
            </label>
            <label>
              Registered players per side
              <input
                onChange={(event) =>
                  setChallengeDraft((current) => ({ ...current, roster_size: Number(event.currentTarget.value) }))
                }
                max={50}
                min={1}
                name="roster_size"
                readOnly={
                  challengeDraft.match_format !== "Team" ||
                  !activityMatchConfig(challengeDraft.sport_type).teamRosterFlexible
                }
                type="number"
                value={challengeDraft.roster_size}
              />
              <small className="fieldHint">
                {activityMatchConfig(challengeDraft.sport_type).teamRosterFlexible && challengeDraft.match_format === "Team"
                  ? "Adjust the registered players required on each side."
                  : `${matchFormatLabel(challengeDraft.match_format, challengeDraft.sport_type)} uses ${challengeDraft.roster_size} registered player${challengeDraft.roster_size === 1 ? "" : "s"} per side.`}
              </small>
            </label>
            <label>
              Team or challenger A
              <input
                name="team_a"
                onChange={(event) => setChallengeDraft((current) => ({ ...current, team_a: event.currentTarget.value }))}
                placeholder="Your name or team"
                value={
                  challengeDraft.team_a ||
                  profile?.display_name ||
                  (profile?.username ? `@${profile.username}` : "")
                }
              />
              <small className="fieldHint">This is your side. Your saved profile name is used automatically when available.</small>
            </label>
            <label>
              Team or challenger B
              <input
                disabled={challengeDraft.openOpponent}
                name="team_b"
                onChange={(event) => setChallengeDraft((current) => ({ ...current, team_b: event.currentTarget.value }))}
                placeholder={challengeDraft.openOpponent ? "Open for anyone eligible to join" : "Opponent name or team"}
                value={challengeDraft.team_b}
              />
            </label>
            <label className="openOpponentOption wide">
              <input
                checked={challengeDraft.openOpponent}
                name="open_opponent"
                onChange={(event) =>
                  setChallengeDraft((current) => ({
                    ...current,
                    openOpponent: event.currentTarget.checked,
                    team_b: event.currentTarget.checked ? "" : current.team_b,
                    team_b_id: event.currentTarget.checked ? "" : current.team_b_id
                  }))
                }
                type="checkbox"
              />
              <span>
                <strong>Leave opponent open</strong>
                <small>Publish the room without choosing side B. An eligible challenger can join later.</small>
              </span>
            </label>
            {challengeLinkableTeams.length > 0 && <details className="teamLinkOptions wide">
              <summary>Link existing Talent7 teams (optional)</summary>
              <p>
                This connects a side to a team you own or have joined, so Talent7 can apply its saved membership roles.
                Individual challengers and one-off groups do not need this.
              </p>
              <div className="teamLinkGrid">
                <label>
                  Saved team for side A
                  <select
                    name="team_a_id"
                    onChange={(event) => {
                      const selected = linkedTeam(event.currentTarget.value);
                      setChallengeDraft((current) => ({
                        ...current,
                        team_a_id: event.currentTarget.value,
                        team_a: selected?.name || current.team_a
                      }));
                    }}
                    value={challengeDraft.team_a_id}
                  >
                    <option value="">No saved team</option>
                    {challengeLinkableTeams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name} / {team.main_activity}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Saved team for side B
                  <select
                    disabled={challengeDraft.openOpponent}
                    name="team_b_id"
                    onChange={(event) => {
                      const selected = linkedTeam(event.currentTarget.value);
                      setChallengeDraft((current) => ({
                        ...current,
                        team_b_id: event.currentTarget.value,
                        team_b: selected?.name || current.team_b,
                        openOpponent: false
                      }));
                    }}
                    value={challengeDraft.team_b_id}
                  >
                    <option value="">No saved team</option>
                    {challengeLinkableTeams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name} / {team.main_activity}</option>
                    ))}
                  </select>
                </label>
              </div>
            </details>}
            <div className="challengeWizardActions wide">
              <button className="back" onClick={(event) => moveChallengeCreateStep(1, event.currentTarget.form)} type="button">Back</button>
              <span>Step 2 of 3</span>
              <button onClick={(event) => moveChallengeCreateStep(3, event.currentTarget.form)} type="button">Continue to rules</button>
            </div>
          </fieldset>

          <fieldset className="challengeWizardPanel" hidden={challengeCreateStep !== 3}>
            <legend>Rules and venue</legend>
            <aside className="challengeReview wide" aria-label="Challenge review">
              <div>
                <span>Review</span>
                <h3>{challengeReview.title}</h3>
                <small>{challengeReview.activity} / {challengeReview.lane}</small>
              </div>
              <strong>{challengeReview.teamA} <b>vs</b> {challengeReview.teamB}</strong>
            </aside>
            <label className="wide">
              Rules
              <textarea name="rules" rows={4} defaultValue={challengeDraft.rules} />
            </label>
            <details className="arrangedVenueDetails wide">
              <summary>
                <span>Already arranged a venue?</span>
                <small>Optional. Add public venue information now, or coordinate privately after an opponent joins.</small>
              </summary>
              <div className="arrangedVenueFields">
                <label>
                  Public venue name or note
                  <input name="venue_name" defaultValue={challengeDraft.venue_name} placeholder="Badminton court, pool, gym, event venue..." />
                </label>
                <label>
                  Public venue or event link (optional)
                  <input name="booking_url" defaultValue={challengeDraft.booking_url} inputMode="url" placeholder="https://venue-or-event-link.com" />
                  <small className="fieldHint">Use a complete public http:// or https:// link.</small>
                </label>
                <label>
                  Venue region
                  <input name="booking_region" defaultValue={challengeDraft.booking_region} placeholder="India, Dubai, London..." />
                </label>
                <aside className="publicVenuePrivacyNote">
                  <strong>Visible to everyone</strong>
                  <small>
                    Do not add receipts, private booking confirmations, access codes, phone numbers, or private lobby links here.
                    Share those only in Private coordination after another challenger joins.
                  </small>
                </aside>
              </div>
            </details>
            <div className="challengeWizardActions wide">
              <button className="back" onClick={(event) => moveChallengeCreateStep(2, event.currentTarget.form)} type="button">Back</button>
              <span>Step 3 of 3</span>
              <button disabled={isSaving} type="submit">{isSaving ? "Creating challenge..." : "Create challenge"}</button>
            </div>
          </fieldset>
        </form>
      </section>

      <section className="section roomsSection" id="rooms">
        <div className="sectionHeader">
          <p className="eyebrow">Rooms</p>
          <h2>Challenge rooms</h2>
          <p>Swipe through active rooms, revisit saved matchups, or open Archive for completed results and proof.</p>
        </div>
        <div className={`roomWelcomePanel ${session && profile?.display_name && profile?.username ? "personalized" : ""}`}>
          {!authHydrated || (session && !profileHydrated) ? (
            <div className="roomWelcomeCopy roomWelcomeLoading" role="status">
              <span className="roomWelcomeBadge">Getting ready</span>
              <h3>Personalizing your Challenge Rooms...</h3>
              <p>We are checking your account and saved interest.</p>
            </div>
          ) : !session ? (
            <>
              <div className="roomWelcomeCopy">
                <span className="roomWelcomeBadge">Start here</span>
                <h3>Explore challenges before creating an account</h3>
                <p>Rooms are public to browse. Create an account when you are ready to join, vote, upload proof, or start a challenge.</p>
              </div>
              <div className="roomWelcomeActions">
                <button onClick={browseActiveRooms} type="button">Browse active rooms</button>
                <a className="secondary" href="#account">Create account</a>
              </div>
            </>
          ) : !profile?.display_name || !profile?.username ? (
            <>
              <div className="roomWelcomeCopy">
                <span className="roomWelcomeBadge">Profile setup</span>
                <h3>Complete your profile to personalize Talent7</h3>
                <p>Add a display name, username, main interest, and region. Talent7 will then bring the most relevant rooms to the front.</p>
              </div>
              <div className="roomWelcomeActions">
                <a href="#account">Complete profile</a>
                <button className="secondary" onClick={browseActiveRooms} type="button">Browse for now</button>
              </div>
            </>
          ) : (
            <>
              <div className="roomWelcomeCopy">
                <span className="roomWelcomeBadge">For you</span>
                <h3>Welcome back, {profile.display_name}</h3>
                <p>
                  Talent7 is prioritizing rooms related to <strong>{profile.main_interest}</strong>. Your saved region is {profile.region || "Global"}.
                </p>
              </div>
              <div className="roomWelcomeActions">
                <button onClick={showMyRecommendations} type="button">
                  {recommendedRoomCount > 0
                    ? `Show ${recommendedRoomCount} match${recommendedRoomCount === 1 ? "" : "es"}`
                    : `Find ${profile.main_interest}`}
                </button>
                <button className="secondary" onClick={createFromSavedInterest} type="button">Create from interest</button>
                <a className="textAction" href="#my-talent7">My dashboard</a>
              </div>
            </>
          )}
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
        <div className="roomShelfToolbar">
          <div className="roomShelfTabs" aria-label="Room collections" role="tablist">
            <button
              aria-selected={selectedStatus === "Open"}
              className={selectedStatus === "Open" ? "active" : ""}
              onClick={() => {
                setSelectedStatus("Open");
                if (roomDiscoveryMode === "Newest") setRoomDiscoveryMode("Trending");
              }}
              role="tab"
              type="button"
            >
              Active rooms <span>{roomCollectionCounts.active}</span>
            </button>
            <button
              aria-selected={selectedStatus === "Completed"}
              className={selectedStatus === "Completed" ? "active" : ""}
              onClick={() => {
                setSelectedStatus("Completed");
                setRoomDiscoveryMode("Newest");
              }}
              role="tab"
              type="button"
            >
              Archive <span>{roomCollectionCounts.archived}</span>
            </button>
            <button
              aria-selected={selectedStatus === "Saved"}
              className={selectedStatus === "Saved" ? "active" : ""}
              onClick={() => {
                if (!requireLogin("view saved challenge rooms")) return;
                setSelectedStatus("Saved");
                setSelectedLane("All");
                setRoomSearch("");
                setSelectedActivityProfile(null);
              }}
              role="tab"
              type="button"
            >
              Saved <span>{roomCollectionCounts.saved}</span>
            </button>
          </div>
          <button
            className="roomRefreshButton"
            disabled={refreshingChallengeRooms}
            onClick={() => void refreshChallengeRooms(true)}
            type="button"
          >
            {refreshingChallengeRooms ? "Refreshing…" : "Refresh rooms"}
          </button>
        </div>
        {selectedStatus === "Open" && (
          <div className="roomDiscoveryPanel">
            <div aria-label="Discover challenge rooms" className="roomDiscoveryTabs" role="tablist">
              {(["Live", "Trending", "For you", "Newest"] as RoomDiscoveryMode[]).map((mode) => {
                const needsProfile = mode === "For you" && !profile?.main_interest;
                const count = mode === "Live" ? roomCollectionCounts.live : mode === "For you" ? recommendedRoomCount : null;

                return (
                  <button
                    aria-controls="challenge-room-list"
                    aria-selected={roomDiscoveryMode === mode}
                    className={`${roomDiscoveryMode === mode ? "active" : ""} ${mode === "Live" ? "live" : ""}`}
                    disabled={needsProfile}
                    key={mode}
                    onClick={() => {
                      setRoomDiscoveryMode(mode);
                      setRoomPage(1);
                    }}
                    role="tab"
                    title={needsProfile ? "Save a main interest in Account to unlock For you" : undefined}
                    type="button"
                  >
                    {mode === "Live" && <i aria-hidden="true" />}
                    {mode}
                    {count !== null && <span>{count}</span>}
                  </button>
                );
              })}
            </div>
            <p aria-live="polite">
              {roomDiscoveryMode === "Live"
                ? "Live Talent7 camera or YouTube broadcasts appear first, followed by rooms with people inside right now."
                : roomDiscoveryMode === "Trending"
                  ? "Recent views, joins, votes, ratings, proofs, chat, and live audience move rooms upward."
                  : roomDiscoveryMode === "For you"
                    ? `Matches for ${profile?.main_interest || "your saved interest"}, ranked by current activity.`
                    : "The most recently created rooms appear first."}
            </p>
          </div>
        )}
        <details className="roomFilterPanel">
          <summary>Search and filter rooms</summary>
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
        </details>
        {challengeLoadError && (
          <AppStatePanel
            actionLabel="Retry loading rooms"
            detail={`Talent7 could not refresh shared rooms: ${challengeLoadError}`}
            onAction={() => setChallengeReloadKey((current) => current + 1)}
            title="Challenge Rooms are temporarily unavailable"
            tone="error"
          />
        )}
        {challengeLiveLoadError && (
          <AppStatePanel
            detail={`Live broadcasts and reactions are unavailable until the latest database migration is applied: ${challengeLiveLoadError}`}
            title="Live room tools need setup"
            tone="error"
          />
        )}
        {savedRoomsLoadError && (
          <div className="savedRoomsSetupNotice" role="status">
            <strong>Saved rooms need setup</strong>
            <small>{savedRoomsLoadError} Run `supabase/add-saved-challenge-rooms.sql` once in the SQL editor.</small>
          </div>
        )}
        {visibleChallenges.length > 1 && <p className="roomSwipeHint">Swipe sideways to browse the rooms on this page.</p>}
        <div
          className="roomsGrid"
          id="challenge-room-list"
          aria-label={
            selectedStatus === "Completed"
              ? "Archived challenge rooms"
              : selectedStatus === "Saved"
                ? "Saved challenge rooms"
                : `${roomDiscoveryMode} challenge rooms`
          }
        >
          {visibleChallenges.length === 0 && (
            <AppStatePanel
              actionHref={
                selectedStatus === "Open" && roomDiscoveryMode === "Trending" && !roomSearch && selectedLane === "All" && !selectedActivityProfile
                  ? "#create"
                  : undefined
              }
              actionLabel={
                selectedStatus === "Saved"
                  ? "Browse active rooms"
                  : selectedStatus === "Completed"
                  ? "View active rooms"
                  : roomDiscoveryMode !== "Trending" || roomSearch || selectedLane !== "All" || selectedActivityProfile
                    ? "Clear room filters"
                    : "Create the first room"
              }
              detail={
                selectedStatus === "Saved"
                  ? "Save any active or archived challenge room and it will appear here for quick access."
                  : selectedStatus === "Completed"
                  ? "Completed challenges will move here with their result and proof."
                  : roomDiscoveryMode === "Live"
                    ? "A room appears here when its broadcast starts or someone opens it. Browse Trending while you wait."
                    : roomDiscoveryMode === "For you"
                      ? "Create the first matching room or browse Trending to see every active challenge."
                      : "Adjust the current filters or start a new challenge."
              }
              onAction={
                selectedStatus === "Saved" || selectedStatus === "Completed"
                  ? browseActiveRooms
                  : roomDiscoveryMode !== "Trending" || roomSearch || selectedLane !== "All" || selectedActivityProfile
                    ? browseActiveRooms
                    : undefined
              }
              title={
                selectedStatus === "Saved"
                  ? "No saved rooms yet"
                  : selectedStatus === "Completed"
                  ? "No archived rooms"
                  : roomDiscoveryMode === "Live"
                    ? "No rooms are live right now"
                    : roomDiscoveryMode === "For you"
                      ? `No active ${profile?.main_interest || "recommended"} rooms yet`
                      : "No active rooms found"
              }
            />
          )}
          {pagedChallenges.map((challenge) => {
            const proofAllowed = canManageTeamProof(challenge);
            const resultAllowed = canManageTeamResult(challenge);
            const roleNotice = teamPermissionLabel(challenge);
            const messages = roomMessages[challenge.id] || [];
            const schedule = challengeSchedule(challenge.id);
            const availableSchedulePlayModes = availablePlayModesForChallenge(challenge);
            const preferredSchedulePlayMode =
              schedulePlayModes[challenge.id] || schedule?.play_mode || defaultPlayModeForChallenge(challenge);
            const schedulePlayMode = availableSchedulePlayModes.includes(preferredSchedulePlayMode)
              ? preferredSchedulePlayMode
              : availableSchedulePlayModes[0];
            const effectiveBookingRegion = challenge.booking_region?.trim() || profile?.region?.trim() || "Near me";
            const bookingShortcuts = suggestedBookingLinks(challenge, profile?.region);
            const coordinationBookingShortcuts = bookingShortcuts.filter(
              (link) => link.label !== "Set up with Planyo"
            );
            const canCoordinate = canCoordinateChallenge(challenge);
            const liveSession = liveSessionsByRoom[challenge.id];
            const liveReactionTotals = liveReactionTotalsByRoom[challenge.id] || {};
            const canManageLive = canManageChallengeLive(challenge);
            const votingOpen = isChallengeVotingOpen(challenge);
            const canManageVoting = canManageChallengeVoting(challenge);
            const roomVoteCount =
              (roomResults[challenge.id]?.teamAVotes || 0) + (roomResults[challenge.id]?.teamBVotes || 0);
            const roster = challengeRosterState(challenge);
            const currentUserMembership = session?.user.id
              ? joins.find((join) => join.challenge_id === challenge.id && join.user_id === session.user.id) || null
              : null;
            const liveProvider = liveSession?.provider || "YouTube";
            const canPublishNativeLive = canManageLive || currentUserMembership?.role === "Challenger";
            const scheduleParticipantsReady = roster.teamA > 0 && roster.teamB > 0;
            const teamADisplay = challengeSideDisplay(challenge, "Team A");
            const teamBDisplay = challengeSideDisplay(challenge, "Team B");
            const savedEditActivity = challenge.sport_type || challenge.title || "Badminton doubles";
            const editSetup = challengeEditSetups[challenge.id] || {
              activity: savedEditActivity,
              format: challengeMatchFormat(challenge),
              rosterSize: challengeRosterSize(challenge)
            };
            const editMatchConfig = activityMatchConfig(editSetup.activity);

            return (
            <article
              className={`roomCard ${challenge.id === createdChallengeId ? "newRoom" : ""} ${
                challenge.id === highlightedChallengeId ? "highlightRoom" : ""
              } ${savedRoomByChallengeId.has(challenge.id) ? "savedRoom" : ""}`}
              id={roomHash(challenge.id)}
              key={challenge.id}
            >
              <span>{challenge.lane}</span>
              {challenge.id === createdChallengeId && <em className="newRoomBadge">New challenge</em>}
              {profile?.main_interest && challengeInterestScore(challenge, profile.main_interest) > 0 && (
                <em className="personalizedRoomBadge">Matches your interest</em>
              )}
              {liveSession?.status === "Live" && (
                <em className="roomLiveBadge">
                  <i aria-hidden="true" /> Live now
                </em>
              )}
              {liveSession?.status === "Ready" && <em className="roomBroadcastBadge">Broadcast ready</em>}
              {liveSession?.status === "Ended" && (
                <em className="roomBroadcastBadge replay">
                  {liveProvider === "YouTube" ? "Replay available" : "Broadcast ended"}
                </em>
              )}
              <button
                aria-pressed={savedRoomByChallengeId.has(challenge.id)}
                className={`roomSaveButton${savedRoomByChallengeId.has(challenge.id) ? " saved" : ""}`}
                disabled={savingRoomId === challenge.id}
                onClick={() => void toggleSavedRoom(challenge)}
                type="button"
              >
                <span aria-hidden="true">{savedRoomByChallengeId.has(challenge.id) ? "★" : "☆"}</span>
                {savingRoomId === challenge.id
                  ? "Saving…"
                  : savedRoomByChallengeId.has(challenge.id)
                    ? "Saved"
                    : "Save room"}
              </button>
              <h3>{challenge.title}</h3>
              {challenge.status === "Completed" && (
                <div className="winnerBanner">
                  <span>Winner</span>
                  <strong>{challengeWinnerDisplay(challenge)}</strong>
                  {challenge.final_score && <small>Final score: {challenge.final_score}</small>}
                  <button className="resultShareButton" onClick={() => shareChallengeResult(challenge)} type="button">
                    Share result
                  </button>
                </div>
              )}
              <div className="versus">
                <strong>{teamADisplay}</strong>
                <b>vs</b>
                <strong>{teamBDisplay}</strong>
              </div>
              <div className={`rosterSummary ${roster.ready ? "ready" : "waiting"}`}>
                <strong>{challengeMatchFormat(challenge)}</strong>
                <span>{challengeSideControlLabel(challenge, "Team A")} {roster.teamA}/{roster.required}</span>
                <span>{challengeSideControlLabel(challenge, "Team B")} {roster.teamB}/{roster.required}</span>
                <em>{roster.ready ? "Roster ready" : "Waiting for registered players"}</em>
              </div>
              <div className="roomOverviewStats" aria-label="Room activity summary">
                <div>
                  <strong>{joinCounts[challenge.id]?.challengers || 0}/{roster.required * 2}</strong>
                  <span>Registered players</span>
                </div>
                <div>
                  <strong>{joinCounts[challenge.id]?.audience || 0}</strong>
                  <span>Audience</span>
                </div>
                <div>
                  <strong>{(roomResults[challenge.id]?.teamAVotes || 0) + (roomResults[challenge.id]?.teamBVotes || 0)}</strong>
                  <span>Votes</span>
                </div>
                <div>
                  <strong>{roomResults[challenge.id]?.ratingAverage || "0.0"}</strong>
                  <span>Rating / 7</span>
                </div>
                <div>
                  <strong>{roomViewCounts[challenge.id] || 0}</strong>
                  <span>Unique views</span>
                </div>
                <div className={liveRoomPresenceCounts[challenge.id] ? "liveAudienceStat active" : "liveAudienceStat"}>
                  <strong aria-live="polite">
                    <i aria-hidden="true" />
                    {liveRoomPresenceCounts[challenge.id] || 0}
                  </strong>
                  <span>In room now</span>
                </div>
              </div>
              <details
                className="roomWorkspace"
                onToggle={(event) => handleRoomWorkspaceToggle(event, challenge)}
                open={activePresenceChallengeId === challenge.id}
              >
                <summary>
                  <span>{isChallengeClosed(challenge) ? "View archived room" : "Open room"}</span>
                  <small>
                    {liveRoomPresenceCounts[challenge.id]
                      ? `${liveRoomPresenceCounts[challenge.id]} in this room now`
                      : isChallengeClosed(challenge)
                        ? "Result, proof, chat, and participants"
                        : "Join, vote, proof, chat, and room tools"}
                  </small>
                </summary>
                <div className="roomWorkspaceBody">
              <div className="roomCardActions">
                <button className="roomLinkButton" onClick={() => shareChallengeRoom(challenge)} type="button">
                  Share room
                </button>
                {canDeleteChallenge(challenge) && (
                  <button
                    className="dangerAction"
                    disabled={deletingChallengeId === challenge.id}
                    onClick={() => confirmDeleteChallengeRoom(challenge)}
                    type="button"
                  >
                    {deletingChallengeId === challenge.id ? "Deleting..." : isOwnerReviewer ? "Discard room" : "Delete mistaken room"}
                  </button>
                )}
              </div>
              {!isOwnerReviewer &&
                challenge.created_by === session?.user.id &&
                !isChallengeClosed(challenge) &&
                challengeHasActivity(challenge.id) && (
                  <small className="deleteLockNote">Deletion locked after room activity begins. You can still edit or complete it.</small>
                )}
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
                      Public venue name or note
                      <input name="venue_name" defaultValue={challenge.venue_name || ""} />
                    </label>
                    <label>
                      Public venue or event link
                      <input name="booking_url" defaultValue={challenge.booking_url || ""} />
                      <small className="fieldHint">Visible in the room. Keep private booking details in Private coordination.</small>
                    </label>
                    <label>
                      Sport / venue type
                      <select
                        name="sport_type"
                        onChange={(event) => applyChallengeEditActivity(challenge, event.currentTarget.value)}
                        value={editSetup.activity}
                      >
                        {challengeActivityOptions.map((interest) => (
                          <option key={interest}>{interest}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Match format
                      <select
                        name="match_format"
                        onChange={(event) =>
                          applyChallengeEditFormat(challenge, editSetup.activity, event.currentTarget.value as MatchFormat)
                        }
                        value={editSetup.format}
                      >
                        {editMatchConfig.formats.map((format) => (
                          <option key={format} value={format}>{matchFormatLabel(format, editSetup.activity)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Registered players per side
                      <input
                        max={50}
                        min={1}
                        name="roster_size"
                        onChange={(event) =>
                          setChallengeEditSetups((current) => ({
                            ...current,
                            [challenge.id]: { ...editSetup, rosterSize: Number(event.currentTarget.value) }
                          }))
                        }
                        readOnly={editSetup.format !== "Team" || !editMatchConfig.teamRosterFlexible}
                        type="number"
                        value={editSetup.rosterSize}
                      />
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
              <div className="scoreBoard">
                <div>
                  <span>Votes</span>
                  <strong>
                    {challengeSideControlLabel(challenge, "Team A")} {roomResults[challenge.id]?.teamAVotes || 0} /{" "}
                    {challengeSideControlLabel(challenge, "Team B")} {roomResults[challenge.id]?.teamBVotes || 0}
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
              <section
                className={`challengeLivePanel ${liveSession?.status.toLowerCase() || "offline"}`}
                aria-label="Challenge live broadcast"
              >
                <div className="challengeLiveHeader">
                  <div>
                    <span>Live on Talent7</span>
                    <strong>
                      {liveSession?.status === "Live"
                        ? "Watch and react together"
                        : liveSession?.status === "Ready"
                          ? "Broadcast prepared"
                          : liveSession?.status === "Ended"
                            ? liveProvider === "YouTube" ? "Watch the replay" : "Broadcast finished"
                            : "No broadcast started yet"}
                    </strong>
                  </div>
                  <em className={`challengeLiveStatus ${liveSession?.status.toLowerCase() || "offline"}`}>
                    {liveSession?.status === "Live" && <i aria-hidden="true" />}
                    {liveSession?.status || "Offline"}
                  </em>
                </div>

                {!liveSession && (
                  <div className="liveBroadcastEmpty">
                    <strong>Waiting for a broadcast</strong>
                    <small>An organizer can start a Talent7 camera room or attach a YouTube broadcast.</small>
                  </div>
                )}

                {liveSession && liveProvider === "LiveKit" && liveSession.status === "Live" && (
                  session?.access_token ? (
                    <ChallengeLiveRoom
                      accessToken={session.access_token}
                      challengeId={challenge.id}
                      onReact={(reaction) => void sendChallengeLiveReaction(challenge, reaction)}
                      reactionActionKey={liveReactionActionKey}
                      reactionOptions={liveReactionOptions}
                      reactionTotals={liveReactionTotals}
                      requestedPublisher={canPublishNativeLive}
                      shareUrl={siteUrl(`#${roomHash(challenge.id)}`)}
                      sideLabels={[
                        challengeSideControlLabel(challenge, "Team A"),
                        challengeSideControlLabel(challenge, "Team B")
                      ]}
                      title={challenge.title}
                    />
                  ) : (
                    <div className="nativeLiveState">
                      <strong>Log in to watch this Talent7 live room</strong>
                      <small>Native rooms use your Talent7 account to keep camera access limited to registered players.</small>
                      <button onClick={() => openSection("account", true)} type="button">Log in</button>
                    </div>
                  )
                )}

                {liveSession && liveProvider === "LiveKit" && liveSession.status !== "Live" && (
                  <div className="liveBroadcastEmpty">
                    <strong>{liveSession.status === "Ready" ? "Native room prepared" : "Native broadcast ended"}</strong>
                    <small>
                      {liveSession.status === "Ready"
                        ? "The camera room will open when an organizer selects Go live in room."
                        : "This camera session is closed. Native video is not recorded by Talent7."}
                    </small>
                  </div>
                )}

                {liveSession && liveProvider === "YouTube" && liveSession.youtube_video_id && (
                  <>
                    <div className="youtubeLiveFrame">
                      <iframe
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        loading="lazy"
                        src={youtubeEmbedUrl(liveSession.youtube_video_id)}
                        title={`${challenge.title} YouTube ${liveSession.status === "Live" ? "broadcast" : "video"}`}
                      />
                    </div>
                    <div className="liveBroadcastMeta">
                      <p>
                        {liveSession.status === "Live"
                          ? "This organizer-marked broadcast is live on YouTube. React below while you watch."
                          : liveSession.status === "Ready"
                            ? "The broadcast is attached and will be marked Live after the YouTube stream starts."
                            : "The reaction window is closed, but the replay remains available while its creator keeps it public."}
                      </p>
                      <a href={youtubeWatchUrl(liveSession.youtube_video_id)} rel="noreferrer" target="_blank">
                        Open directly on YouTube
                      </a>
                    </div>
                  </>
                )}

                {liveSession?.status === "Live" && (
                  <div className="liveReactionBar" aria-label="React to the live broadcast">
                    <strong>Live reactions</strong>
                    <div>
                      {liveReactionOptions.map((option) => {
                        const actionKey = `${challenge.id}-${option.name}`;
                        return (
                          <button
                            aria-label={`${option.label}: ${liveReactionTotals[option.name] || 0}`}
                            disabled={liveReactionActionKey !== null}
                            key={option.name}
                            onClick={() => sendChallengeLiveReaction(challenge, option.name)}
                            type="button"
                          >
                            <span aria-hidden="true">{option.emoji}</span>
                            <small>{option.label}</small>
                            <b aria-live="polite">
                              {liveReactionActionKey === actionKey ? "…" : liveReactionTotals[option.name] || 0}
                            </b>
                          </button>
                        );
                      })}
                    </div>
                    {!session && <small>Log in to react.</small>}
                  </div>
                )}

                {canManageLive && (
                  <div className="liveManagerPanel">
                    <div>
                      <strong>Broadcast controls</strong>
                      <p>
                        {liveSession?.status === "Live" && liveProvider === "LiveKit"
                          ? "The native camera room is open. Registered challengers can join with camera; everyone else is watch-only."
                          : liveProviderDraft(challenge.id) === "LiveKit"
                            ? "Use Talent7 camera for a native live room with no YouTube subscriber requirement."
                            : "Attach a public YouTube broadcast URL. Never paste a stream key—Talent7 does not need or store it."}
                      </p>
                    </div>
                    {liveSession?.status === "Live" ? (
                      <div className="liveManagerActions live">
                        {liveProvider === "YouTube" && (
                          <a href="https://www.youtube.com/live_dashboard" rel="noreferrer" target="_blank">
                            Open YouTube Live dashboard
                          </a>
                        )}
                        <button
                          className="dangerAction"
                          disabled={liveSessionActionKey !== null}
                          onClick={() => setChallengeLiveSession(challenge, "Ended")}
                          type="button"
                        >
                          {liveSessionActionKey === `${challenge.id}-Ended` ? "Ending…" : "End broadcast"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <label className="liveProviderChoice">
                          Broadcast method
                          <select
                            onChange={(event) =>
                              setLiveProviderDrafts((drafts) => ({
                                ...drafts,
                                [challenge.id]: event.target.value as ChallengeLiveProvider
                              }))
                            }
                            value={liveProviderDraft(challenge.id)}
                          >
                            <option value="LiveKit">Talent7 camera (recommended)</option>
                            <option value="YouTube">YouTube broadcast link</option>
                          </select>
                        </label>
                        {liveProviderDraft(challenge.id) === "YouTube" && (
                          <label>
                            YouTube live, scheduled live, or replay URL
                            <input
                              inputMode="url"
                              onChange={(event) =>
                                setLiveVideoDrafts((drafts) => ({
                                  ...drafts,
                                  [challenge.id]: event.target.value
                                }))
                              }
                              placeholder="https://www.youtube.com/watch?v=..."
                              type="url"
                              value={liveVideoDraft(challenge.id)}
                            />
                          </label>
                        )}
                        <div className="liveManagerActions">
                          <button
                            className="secondaryAction"
                            disabled={liveSessionActionKey !== null}
                            onClick={() => setChallengeLiveSession(challenge, "Ready")}
                            type="button"
                          >
                            {liveSessionActionKey === `${challenge.id}-Ready`
                              ? "Saving…"
                              : liveProviderDraft(challenge.id) === "LiveKit" ? "Prepare camera room" : "Save link"}
                          </button>
                          <button
                            disabled={liveSessionActionKey !== null}
                            onClick={() => setChallengeLiveSession(challenge, "Live")}
                            type="button"
                          >
                            {liveSessionActionKey === `${challenge.id}-Live` ? "Starting…" : "Go live in room"}
                          </button>
                          {liveProviderDraft(challenge.id) === "YouTube" && (
                            <a href="https://www.youtube.com/live_dashboard" rel="noreferrer" target="_blank">
                              Open YouTube Studio
                            </a>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </section>
              {canCoordinate && (
                <section className="matchCoordinationPanel" aria-label="Private match coordination">
                  <div className="matchCoordinationHeader">
                    <div>
                      <span>Private coordination</span>
                      <strong>Set the match time and place</strong>
                    </div>
                    {schedule && (
                      <em className={`scheduleStatus ${schedule.status.toLowerCase().replace(" ", "-")}`}>
                        {schedule.status}
                      </em>
                    )}
                  </div>
                  <p className="coordinationPrivacyNote">
                    Only the room creator and registered challengers can see these details. Exact addresses, meeting
                    notes, and private lobby links are never shown to the audience.
                  </p>

                  {!scheduleParticipantsReady ? (
                    <div className="scheduleCallout waiting">
                      <strong>Waiting for an opponent</strong>
                      <small>
                        Scheduling unlocks after at least one challenger has registered on each side. {challengeRosterMessage(challenge)}.
                      </small>
                    </div>
                  ) : (
                    <>
                      {schedule && (
                        <div className="scheduleSummary">
                          <div>
                            <span>Date and time</span>
                            <strong>{formatChallengeSchedule(schedule)}</strong>
                            <small>{schedule.timezone}</small>
                          </div>
                          <div>
                            <span>Format</span>
                            <strong>{schedule.play_mode}</strong>
                            <small>{schedule.venue_name || "Private online session"}</small>
                          </div>
                          {schedule.meeting_details && (
                            <div>
                              <span>Meeting details</span>
                              <strong>{schedule.meeting_details}</strong>
                            </div>
                          )}
                          {schedule.note && (
                            <div>
                              <span>Participant note</span>
                              <strong>{schedule.note}</strong>
                            </div>
                          )}
                          {schedule.session_url && (
                            <div>
                              <span>Private session</span>
                              <a href={schedule.session_url} rel="noreferrer" target="_blank">
                                Open session link
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {schedule?.status === "Proposed" && schedule.proposed_by === session?.user.id && (
                        <div className="scheduleCallout waiting">
                          <strong>Waiting for confirmation</strong>
                          <small>A registered challenger from the other side can confirm this proposal or request changes.</small>
                        </div>
                      )}
                      {schedule?.status === "Proposed" && schedule.proposed_by !== session?.user.id && (
                        <div className="scheduleResponseActions">
                          <button
                            disabled={scheduleActionId !== null}
                            onClick={() => respondToChallengeSchedule(schedule, "Confirmed")}
                            type="button"
                          >
                            {scheduleActionId === `${schedule.id}-Confirmed` ? "Confirming..." : "Confirm schedule"}
                          </button>
                          <button
                            className="secondaryAction"
                            disabled={scheduleActionId !== null}
                            onClick={() => respondToChallengeSchedule(schedule, "Changes requested")}
                            type="button"
                          >
                            {scheduleActionId === `${schedule.id}-Changes requested` ? "Sending..." : "Request changes"}
                          </button>
                        </div>
                      )}
                      {schedule?.status === "Confirmed" && (
                        <div className="scheduleCallout confirmed">
                          <strong>Schedule confirmed</strong>
                          <small>Both sides have agreed to these match details.</small>
                        </div>
                      )}
                      {schedule?.status === "Changes requested" && (
                        <div className="scheduleCallout changes">
                          <strong>Changes requested</strong>
                          <small>Use the form below to send a revised date, venue, or session link.</small>
                        </div>
                      )}
                      {schedule?.status === "Cancelled" && (
                        <div className="scheduleCallout cancelled">
                          <strong>Schedule cancelled</strong>
                          <small>The room remains open. Either participant can propose a new schedule below.</small>
                        </div>
                      )}

                      <details
                        className="scheduleEditor"
                        open={!schedule || schedule.status === "Changes requested" || schedule.status === "Cancelled"}
                        key={schedule?.updated_at || challenge.id}
                      >
                        <summary>
                          {schedule
                            ? schedule.status === "Confirmed"
                              ? "Propose a schedule change"
                              : "Revise the proposal"
                            : "Propose time and place"}
                        </summary>
                        <form onSubmit={(event) => saveChallengeSchedule(event, challenge)}>
                          <label>
                            Match date and time
                            <input
                              defaultValue={localDateTimeValue(schedule?.scheduled_for)}
                              name="scheduled_for"
                              required
                              type="datetime-local"
                            />
                          </label>
                          <label>
                            Play mode
                            <select
                              name="play_mode"
                              onChange={(event) =>
                                setSchedulePlayModes((current) => ({
                                  ...current,
                                  [challenge.id]: event.currentTarget.value as ChallengePlayMode
                                }))
                              }
                              value={schedulePlayMode}
                            >
                              {availableSchedulePlayModes.map((mode) => (
                                <option key={mode}>{mode}</option>
                              ))}
                            </select>
                            <small>
                              {challenge.lane === "Sports challenge"
                                ? "Sports challenges are played at an agreed physical venue."
                                : challenge.lane === "Mobile gaming challenge"
                                  ? "Mobile gaming challenges use a private online lobby."
                                  : schedulePlayMode === "Online"
                                ? "Compete through a private lobby, video session, or remote submission."
                                : "Meet at an agreed physical venue."}
                            </small>
                          </label>
                          {schedulePlayMode === "In person" && (
                            <>
                              <label>
                                Venue name
                                <input
                                  defaultValue={schedule?.venue_name || ""}
                                  maxLength={160}
                                  name="venue_name"
                                  placeholder="Required for in-person matches"
                                />
                              </label>
                              <div className="coordinationBookingShortcuts wide">
                                <div>
                                  <strong>Find and book a venue</strong>
                                  <small>
                                    These open external services for {effectiveBookingRegion}. Return here and enter the venue you agree on.
                                  </small>
                                </div>
                                <div className="coordinationBookingLinks">
                                  {coordinationBookingShortcuts.map((link) => (
                                    <a
                                      className={link.recommended ? "recommendedBookingLink" : undefined}
                                      href={link.url}
                                      key={`coordinate-${link.label}`}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      {link.label}
                                      {link.recommended && <em>Recommended</em>}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                          {schedulePlayMode === "Online" && (
                            <label>
                              Private lobby or session link
                              <input
                                defaultValue={schedule?.session_url || ""}
                                maxLength={500}
                                name="session_url"
                                placeholder="Required for online matches"
                                type="url"
                              />
                            </label>
                          )}
                          <label className="wide">
                            {schedulePlayMode === "Online" ? "Online access details" : "Exact meeting details"}
                            <input
                              defaultValue={schedule?.meeting_details || ""}
                              maxLength={300}
                              name="meeting_details"
                              placeholder={
                                schedulePlayMode === "Online"
                                  ? "Room code, game server, submission method, or joining instructions"
                                  : "Court number, entrance, arrival point, or check-in instructions"
                              }
                            />
                          </label>
                          <label className="wide">
                            Note for the other challenger
                            <textarea
                              defaultValue={schedule?.note || ""}
                              maxLength={500}
                              name="note"
                              placeholder="Equipment, arrival time, match format, or anything they should bring"
                              rows={3}
                            />
                          </label>
                          <button disabled={scheduleActionId !== null} type="submit">
                            {scheduleActionId === (schedule?.id || challenge.id) ? "Sending proposal..." : "Send proposal"}
                          </button>
                        </form>
                      </details>

                      {schedule && schedule.status !== "Cancelled" && (
                        <button
                          className="cancelScheduleButton"
                          disabled={scheduleActionId !== null}
                          onClick={() => confirmCancelChallengeSchedule(schedule)}
                          type="button"
                        >
                          {scheduleActionId === `${schedule.id}-cancel` ? "Cancelling..." : "Cancel schedule"}
                        </button>
                      )}
                    </>
                  )}
                </section>
              )}
              {(challenge.venue_name || challenge.booking_url || challenge.sport_type || challenge.booking_region) && (
                <div className="bookingPanel">
                  <div className="bookingPanelIntro">
                    <span>Venue / booking</span>
                    <strong>{challenge.venue_name || "Booking link available"}</strong>
                    <small>
                      {[challenge.sport_type, effectiveBookingRegion].filter(Boolean).join(" / ") ||
                        "Add sport and region for better suggestions"}
                    </small>
                    <small>Availability and final prices are controlled by each external provider.</small>
                  </div>
                  <div className="bookingActions">
                    {challenge.booking_url && (
                      <a className="customBookingLink" href={challenge.booking_url} rel="noreferrer" target="_blank">
                        <span>Room booking link</span>
                        <strong>Open the organizer&apos;s booking page</strong>
                        <small>Exact link shared by the room creator</small>
                      </a>
                    )}
                    {bookingShortcuts.map((link) => (
                      <a
                        className={link.recommended ? "recommendedBookingLink" : undefined}
                        href={link.url}
                        key={link.label}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span>
                          {link.label}
                          {link.recommended && <em>Recommended</em>}
                        </span>
                        <small>{link.detail}</small>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {isChallengeClosed(challenge) ? (
                <div className="closedRoom">
                  <strong>{challenge.status === "Cancelled" ? "Challenge cancelled" : "Challenge closed"}</strong>
                  <small>
                    {challenge.status === "Cancelled"
                      ? "This invitation ended without an accepted matchup. Either person can start a new challenge."
                      : "Joins, votes, ratings, and proof uploads are locked after completion."}
                  </small>
                </div>
              ) : (
                <details className="roomActionPanel roomDisclosure">
                  <summary>Join, add proof, or finish</summary>
                  <div className="roomActionPanelBody">
                  {currentUserMembership ? (
                    <div className="joinedRoomMembership">
                      <div>
                        <span>Your room role</span>
                        <strong>
                          {currentUserMembership.role === "Audience"
                            ? "Audience"
                            : challengeSideControlLabel(
                                challenge,
                                currentUserMembership.side === "Team B" ? "Team B" : "Team A"
                              )}
                        </strong>
                        <small>
                          {challenge.created_by === session?.user.id
                            ? "You created this room, so this membership stays attached to it."
                            : "Joined by mistake or no longer participating? You can leave while the room is active."}
                        </small>
                      </div>
                      {challenge.created_by !== session?.user.id && (
                        <button
                          className="leaveRoomButton"
                          disabled={leavingChallengeId === challenge.id}
                          onClick={() => confirmLeaveChallenge(challenge, currentUserMembership)}
                          type="button"
                        >
                          {leavingChallengeId === challenge.id ? "Leaving…" : "Leave room"}
                        </button>
                      )}
                    </div>
                  ) : (
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
                          onClick={() =>
                            updateJoinChoice(challenge.id, {
                              role,
                              side:
                                role === "Audience"
                                  ? "Audience"
                                  : joinChoice(challenge.id).side === "Team B"
                                    ? "Team B"
                                    : "Team A"
                            })
                          }
                          type="button"
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                    {joinChoice(challenge.id).role === "Challenger" ? (
                      <div className="joinPicker">
                        <span>Side</span>
                        {["Team A", "Team B"].map((side) => (
                          <button
                            className={joinChoice(challenge.id).side === side ? "active" : ""}
                            disabled={
                              side === "Team A"
                                ? roster.teamA >= roster.required
                                : roster.teamB >= roster.required
                            }
                            key={side}
                            onClick={() => updateJoinChoice(challenge.id, { side })}
                            type="button"
                          >
                            {challengeSideControlLabel(challenge, side as "Team A" | "Team B")} ({
                              side === "Team A" ? roster.teamA : roster.teamB
                            }/{roster.required})
                          </button>
                        ))}
                      </div>
                    ) : (
                      <small className="formHint">Audience members watch and react without joining either side.</small>
                    )}
                    <button
                      disabled={
                        joiningChallengeId === challenge.id ||
                        (joinChoice(challenge.id).role === "Challenger" &&
                          (joinChoice(challenge.id).side === "Team B"
                            ? roster.teamB >= roster.required
                            : roster.teamA >= roster.required))
                      }
                      type="submit"
                    >
                      {joiningChallengeId === challenge.id ? "Joining..." : "Join"}
                    </button>
                  </form>
                  )}
                  <form className="proofForm" onSubmit={(event) => submitProof(event, challenge)}>
                    <strong>Victory proof</strong>
                    <input name="proof_type" type="hidden" value={selectedProofType(challenge.id)} />
                    <div className="proofEvidenceTools">
                      <label>
                        Proof type
                        <select
                          value={selectedProofType(challenge.id)}
                          onChange={(event) => updateProofType(challenge.id, event.currentTarget.value)}
                        >
                          {["Photo", "Video", "Screenshot", "Match link"].map((proofType) => (
                            <option key={proofType} value={proofType}>
                              {proofType}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedProofType(challenge.id) === "Match link" ? (
                        <p className="proofHint">Paste the match room, stream, Drive, or YouTube link below.</p>
                      ) : (
                        <label className="fileUpload compact">
                          {selectedProofType(challenge.id) === "Video"
                            ? "Record or upload video"
                            : selectedProofType(challenge.id) === "Screenshot"
                              ? "Upload screenshot"
                              : "Take or upload photo"}
                          <input
                            accept={selectedProofType(challenge.id) === "Video" ? "video/*" : "image/*"}
                            capture={selectedProofType(challenge.id) === "Screenshot" ? undefined : "environment"}
                            name="proof_file"
                            type="file"
                          />
                          <small>
                            {selectedProofType(challenge.id) === "Video"
                              ? "Videos can be up to 50 MB. On supported phones, this can open the camera recorder."
                              : "Photos/screenshots can be up to 10 MB. On supported phones, this can open the camera."}
                          </small>
                        </label>
                      )}
                    </div>
                    <input
                      name="proof_url"
                      placeholder={
                        selectedProofType(challenge.id) === "Match link"
                          ? "Paste match, stream, Drive, or YouTube link"
                          : "Optional: paste a link instead"
                      }
                    />
                    <textarea name="notes" rows={2} placeholder="Short note, winner name, score, or context" />
                    <button disabled={savingProofChallengeId === challenge.id || !proofAllowed} type="submit">
                      {!proofAllowed
                        ? "Team role required"
                        : savingProofChallengeId === challenge.id
                          ? "Saving proof..."
                          : "Submit proof"}
                    </button>
                  </form>
                    <form className="resultForm" onSubmit={(event) => completeChallenge(event, challenge)}>
                      <strong>Finish challenge</strong>
                      <select name="winner" defaultValue="">
                        <option value="">Choose winner</option>
                        <option value={challenge.team_a}>{teamADisplay}</option>
                        <option value={challenge.team_b}>{teamBDisplay}</option>
                      </select>
                      <input name="final_score" placeholder="Final score, like 21-18 or 2-1" />
                      <button disabled={completingChallengeId === challenge.id || !resultAllowed || !roster.ready} type="submit">
                        {!resultAllowed
                          ? "Captain/organizer required"
                          : !roster.ready
                            ? "Fill rosters first"
                          : completingChallengeId === challenge.id
                            ? "Saving result..."
                            : "Mark completed"}
                      </button>
                    </form>
                  </div>
                </details>
              )}
              {(roomProofs[challenge.id] || []).length > 0 && (
                <details className="proofList roomDisclosure">
                  <summary>Proofs submitted ({(roomProofs[challenge.id] || []).length})</summary>
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
                              onClick={() => confirmDeleteProof(proof)}
                              type="button"
                            >
                              {deletingProofId === proof.id ? "Deleting..." : "Delete proof"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </details>
              )}
              <details className="roomChat roomDisclosure">
                <summary>Room chat ({messages.length})</summary>
                <div className="roomChatBody">
                <div className="roomChatHeader">
                  <div>
                    <strong>Room chat</strong>
                    <small>{roomChatHint(challenge)}</small>
                  </div>
                  <span>{messages.length} message{messages.length === 1 ? "" : "s"}</span>
                </div>
                {canUseRoomChat(challenge) && !isChallengeClosed(challenge) && (
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
              </details>
              <details className="roomDetails">
                <summary>Room details</summary>
                <div className="detailGrid">
                  <div>
                    <span>Status</span>
                    <strong>{challenge.status}</strong>
                  </div>
                  <div>
                    <span>Winner</span>
                    <strong>{challenge.winner ? challengeWinnerDisplay(challenge) : "Not decided"}</strong>
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
                    { title: teamADisplay, people: participantGroup(challenge.id, "Team A", "Challenger") },
                    { title: teamBDisplay, people: participantGroup(challenge.id, "Team B", "Challenger") },
                    {
                      title: "Audience",
                      people: roomJoins(challenge.id).filter((join) => join.role === "Audience")
                    }
                  ].map((group) => (
                    <div className="participantList" key={group.title}>
                      <strong>
                        {group.title}
                        {group.title !== "Audience" && ` (${group.people.length}/${roster.required})`}
                      </strong>
                      {group.people.length > 0 ? (
                        group.people.slice(0, 5).map((join) => (
                          <small key={join.id}>{join.participant_name}</small>
                        ))
                      ) : (
                        <small>{group.title === "Audience" ? "No one yet." : "Open registered-player slot."}</small>
                      )}
                      {group.title !== "Audience" &&
                        group.people.length > 0 &&
                        group.people.length < roster.required &&
                        Array.from({ length: roster.required - group.people.length }).map((_, index) => (
                          <small className="openRosterSlot" key={`${group.title}-open-${index}`}>Open player slot</small>
                        ))}
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
              {!isChallengeClosed(challenge) && (
                <section className={`votingWindowPanel ${votingOpen ? "open" : "closed"}`} aria-label="Voting window">
                  <div className="votingWindowHeader">
                    <div>
                      <span>Audience voting</span>
                      <strong>{votingOpen ? "Voting is open" : "Voting is closed"}</strong>
                      <small>{challengeVotingWindowDetail(challenge)}</small>
                    </div>
                    <em className={votingOpen ? "open" : "closed"}>
                      {votingOpen ? "Open now" : challenge.voting_status === "Open" ? "Expired" : "Closed"}
                    </em>
                  </div>
                  <div className="votingWindowStats">
                    <strong>{roomVoteCount}</strong>
                    <span>{roomVoteCount === 1 ? "vote recorded" : "votes recorded"}</span>
                  </div>
                  {canManageVoting && (
                    <div className="votingManagerControls">
                      {votingOpen ? (
                        <button
                          className="closeVotingButton"
                          disabled={votingWindowActionId !== null}
                          onClick={() => setChallengeVotingWindow(challenge, "Close")}
                          type="button"
                        >
                          {votingWindowActionId === challenge.id ? "Closing…" : "Close voting now"}
                        </button>
                      ) : (
                        <>
                          <label>
                            Voting duration
                            <select
                              onChange={(event) =>
                                setVotingDurationDrafts((drafts) => ({
                                  ...drafts,
                                  [challenge.id]: event.target.value
                                }))
                              }
                              value={votingDurationDrafts[challenge.id] || "15"}
                            >
                              <option value="5">5 minutes</option>
                              <option value="10">10 minutes</option>
                              <option value="15">15 minutes</option>
                              <option value="30">30 minutes</option>
                              <option value="60">1 hour</option>
                              <option value="manual">Until manually closed</option>
                            </select>
                          </label>
                          <button
                            disabled={votingWindowActionId !== null || !roster.ready}
                            onClick={() => setChallengeVotingWindow(challenge, "Open")}
                            type="button"
                          >
                            {votingWindowActionId === challenge.id
                              ? "Opening…"
                              : roster.ready
                                ? "Open voting"
                                : "Fill rosters first"}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <small className="votingIntegrityNote">
                    One vote per signed-in account. Opening or closing the window never changes votes already recorded.
                  </small>
                </section>
              )}
              {!isChallengeClosed(challenge) && (
                <div className="roomButtons">
                  <button
                    disabled={hasUserVoted(challenge.id) || !votingOpen}
                    title={!votingOpen ? "Voting opens only when an organizer starts the window" : undefined}
                    type="button"
                    onClick={() => voteForWinner(challenge, challenge.team_a)}
                  >
                    {hasUserVoted(challenge.id)
                      ? "Voted"
                      : votingOpen
                        ? `Vote ${challengeSideControlLabel(challenge, "Team A")}`
                        : "Voting closed"}
                  </button>
                  <button
                    disabled={hasUserVoted(challenge.id) || !votingOpen}
                    title={!votingOpen ? "Voting opens only when an organizer starts the window" : undefined}
                    type="button"
                    onClick={() => voteForWinner(challenge, challenge.team_b)}
                  >
                    {hasUserVoted(challenge.id)
                      ? "Voted"
                      : votingOpen
                        ? `Vote ${challengeSideControlLabel(challenge, "Team B")}`
                        : "Voting closed"}
                  </button>
                  <button disabled={hasUserRated(challenge.id)} type="button" onClick={() => rateChallenge(challenge, 7)}>
                    {hasUserRated(challenge.id) ? "Rated" : "Rate 7/7"}
                  </button>
                </div>
              )}
                </div>
              </details>
            </article>
            );
          })}
        </div>
        <PaginationControls
          currentPage={roomPage}
          label="Challenge rooms"
          onPageChange={(page) => {
            setActivePresenceChallengeId(null);
            setLockedRoomPageIds(null);
            setRoomPage(page);
          }}
          pageSize={roomPageSize}
          targetId="rooms"
          totalItems={visibleChallenges.length}
        />
      </section>

      <section className="section leaderboard" id="leaderboard">
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
                  setSelectedStatus(isChallengeClosed(item.challenge) ? "Completed" : "Open");
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
            <p>Proof-based challenge rooms, public 7-star ratings, teams, and live community experiences.</p>
        </div>
        <nav>
          <a href="#account">Account</a>
          <a href="#first-wave">First wave</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms and Conditions</a>
          <a href="/shipping">Shipping Policy</a>
          <a href="/refunds">Cancellation and Refunds</a>
          <a href="/delete-account">Delete account</a>
          <a href="/support">Contact Us</a>
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

