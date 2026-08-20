"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useParticipants,
  useTracks
} from "@livekit/components-react";
import { Track } from "livekit-client";

type JoinCredentials = {
  server_url: string;
  participant_token: string;
  can_publish: boolean;
};

type LiveReactionName = "Fire" | "Applause" | "Wow" | "Strong" | "Love";

type LiveReactionOption = {
  name: LiveReactionName;
  emoji: string;
  label: string;
};

type FloatingReaction = LiveReactionOption & {
  id: number;
  lane: number;
};

type BattleScreenLayout = "stacked" | "side-by-side";

const LIVE_LAYOUT_STORAGE_KEY = "talent7-live-battle-layout";

type ChallengeLiveRoomProps = {
  accessToken: string;
  challengeId: string;
  requestedPublisher: boolean;
  title: string;
  shareUrl: string;
  sideLabels: [string, string];
  reactionOptions: LiveReactionOption[];
  reactionTotals: Partial<Record<LiveReactionName, number>>;
  reactionActionKey: string | null;
  onReact: (reaction: LiveReactionName) => void;
};

type Talent7VideoStageProps = Pick<
  ChallengeLiveRoomProps,
  "challengeId" | "title" | "shareUrl" | "sideLabels" | "reactionOptions" | "reactionTotals" | "reactionActionKey" | "onReact"
> & {
  canPublish: boolean;
};

function Talent7VideoStage({
  canPublish,
  challengeId,
  title,
  shareUrl,
  sideLabels,
  reactionOptions,
  reactionTotals,
  reactionActionKey,
  onReact
}: Talent7VideoStageProps) {
  const [expanded, setExpanded] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share");
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [screenLayout, setScreenLayout] = useState<BattleScreenLayout>("stacked");
  const previousTotalsRef = useRef<Partial<Record<LiveReactionName, number>> | null>(null);
  const reactionIdRef = useRef(0);
  const participants = useParticipants();
  const peopleInRoom = participants.length;
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  );

  useEffect(() => {
    try {
      const savedLayout = window.localStorage.getItem(LIVE_LAYOUT_STORAGE_KEY);
      if (savedLayout === "stacked" || savedLayout === "side-by-side") {
        setScreenLayout(savedLayout);
      }
    } catch {
      // Layout preference persistence is optional (for example, in private browsing).
    }
  }, []);

  useEffect(() => {
    const previousTotals = previousTotalsRef.current;
    previousTotalsRef.current = { ...reactionTotals };
    if (!previousTotals) return;

    const incoming: FloatingReaction[] = [];
    reactionOptions.forEach((option) => {
      const previousCount = previousTotals[option.name] || 0;
      const nextCount = reactionTotals[option.name] || 0;
      const visibleBurstCount = Math.min(Math.max(nextCount - previousCount, 0), 5);

      for (let index = 0; index < visibleBurstCount; index += 1) {
        reactionIdRef.current += 1;
        incoming.push({
          ...option,
          id: reactionIdRef.current,
          lane: (reactionIdRef.current + index) % 7
        });
      }
    });

    if (incoming.length > 0) {
      setFloatingReactions((current) => [...current.slice(-18), ...incoming]);
    }
  }, [reactionOptions, reactionTotals]);

  useEffect(() => {
    if (!expanded) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  async function shareLiveRoom() {
    const shareData = {
      title: `${title} live on Talent7`,
      text: `Watch ${sideLabels[0]} vs ${sideLabels[1]} live on Talent7.`,
      url: shareUrl
    };

    try {
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setShareLabel("Link copied");
      window.setTimeout(() => setShareLabel("Share"), 2200);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setShareLabel("Try again");
      window.setTimeout(() => setShareLabel("Share"), 2200);
    }
  }

  function selectScreenLayout(layout: BattleScreenLayout) {
    setScreenLayout(layout);
    try {
      window.localStorage.setItem(LIVE_LAYOUT_STORAGE_KEY, layout);
    } catch {
      // Keep the selected layout for this session even when storage is unavailable.
    }
  }

  const stage = (
    <section
      aria-label={expanded ? `${title} expanded live stage` : `${title} live video`}
      aria-modal={expanded ? "true" : undefined}
      className={`nativeLiveStage layout-${screenLayout}${expanded ? " expanded" : ""}`}
      role={expanded ? "dialog" : undefined}
    >
      {expanded && (
        <header className="expandedLiveHeader">
          <div>
            <span className="expandedLiveBadge"><i aria-hidden="true" /> Live on Talent7</span>
            <strong>{title}</strong>
            <small>{sideLabels[0]} <b>vs</b> {sideLabels[1]}</small>
          </div>
          <div className="expandedLiveActions">
            <span className="liveViewerBadge" aria-label={`${peopleInRoom} people in the live room`}>
              <i aria-hidden="true" /> {peopleInRoom}
            </span>
            <button onClick={() => void shareLiveRoom()} type="button">{shareLabel}</button>
            <button aria-label="Close expanded live stage" onClick={() => setExpanded(false)} type="button">
              <span aria-hidden="true">×</span> Close
            </button>
          </div>
        </header>
      )}

      <div className="nativeLiveVideoCanvas">
        {!expanded && (
          <div className="nativeLiveOverlay" aria-label="Live room status">
            <span className="expandedLiveBadge"><i aria-hidden="true" /> Live</span>
            <span className="liveViewerBadge" aria-label={`${peopleInRoom} people in the live room`}>
              <i aria-hidden="true" /> {peopleInRoom}
            </span>
          </div>
        )}
        <GridLayout tracks={tracks}>
          <ParticipantTile />
        </GridLayout>

        <div aria-hidden="true" className="floatingReactionLayer">
          {floatingReactions.map((reaction) => (
            <span
              className="floatingLiveReaction"
              key={reaction.id}
              onAnimationEnd={() => {
                setFloatingReactions((current) => current.filter((item) => item.id !== reaction.id));
              }}
              style={{ "--reaction-left": `${7 + reaction.lane * 13}%` } as CSSProperties}
            >
              <b>{reaction.emoji}</b>
              <small>{reaction.label}</small>
            </span>
          ))}
        </div>

        <div className="liveLayoutSwitcher" role="group" aria-label="Battle screen layout">
          <button
            aria-pressed={screenLayout === "stacked"}
            onClick={() => selectScreenLayout("stacked")}
            title="Place the battle screens one above the other"
            type="button"
          >
            <span aria-hidden="true" className="liveLayoutIcon stacked">
              <i />
              <i />
            </span>
            Stacked
          </button>
          <button
            aria-pressed={screenLayout === "side-by-side"}
            onClick={() => selectScreenLayout("side-by-side")}
            title="Place the battle screens beside each other"
            type="button"
          >
            <span aria-hidden="true" className="liveLayoutIcon sideBySide">
              <i />
              <i />
            </span>
            Side by side
          </button>
        </div>

        {!expanded && (
          <div className="nativeLiveStageActions">
            <button className="shareLiveStageButton" onClick={() => void shareLiveRoom()} type="button">
              {shareLabel}
            </button>
            <button className="expandLiveStageButton" onClick={() => setExpanded(true)} type="button">
              <span aria-hidden="true">↗</span> Expand
            </button>
          </div>
        )}
      </div>

      <RoomAudioRenderer />
      <div className="nativeLiveControls">
        {canPublish ? (
          <ControlBar
            controls={{ camera: true, microphone: true, screenShare: false, chat: false, leave: true }}
            variation="minimal"
          />
        ) : (
          <div className="nativeAudienceLabel">Watching as audience · camera and microphone are off</div>
        )}
      </div>

      {expanded && (
        <aside className="expandedReactionDock" aria-label="Send a live reaction">
          <div>
            <strong>React live</strong>
            <small>Your reaction floats across every connected screen.</small>
          </div>
          <div className="expandedReactionButtons">
            {reactionOptions.map((option) => {
              const actionKey = `${challengeId}-${option.name}`;
              return (
                <button
                  aria-label={`${option.label}: ${reactionTotals[option.name] || 0}`}
                  disabled={reactionActionKey !== null}
                  key={option.name}
                  onClick={() => onReact(option.name)}
                  type="button"
                >
                  <span aria-hidden="true">{option.emoji}</span>
                  <small>{option.label}</small>
                  <b aria-live="polite">
                    {reactionActionKey === actionKey ? "…" : reactionTotals[option.name] || 0}
                  </b>
                </button>
              );
            })}
          </div>
        </aside>
      )}
    </section>
  );

  return expanded ? createPortal(stage, document.body) : stage;
}

export default function ChallengeLiveRoom({
  accessToken,
  challengeId,
  requestedPublisher,
  title,
  shareUrl,
  sideLabels,
  reactionOptions,
  reactionTotals,
  reactionActionKey,
  onReact
}: ChallengeLiveRoomProps) {
  const [credentials, setCredentials] = useState<JoinCredentials | null>(null);
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function joinRoom() {
      setCredentials(null);
      setJoined(false);
      setConnected(false);
      setError("");

      try {
        const response = await fetch("/api/livekit-token", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ challengeId, publish: requestedPublisher }),
          signal: controller.signal
        });
        const result = (await response.json()) as JoinCredentials & { error?: string };
        if (!response.ok) throw new Error(result.error || "The live room could not be opened.");
        setCredentials(result);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "The live room could not be opened.");
      }
    }

    void joinRoom();
    return () => controller.abort();
  }, [accessToken, challengeId, requestedPublisher, retryKey]);

  if (error) {
    return (
      <div className="nativeLiveState error" role="alert">
        <strong>Live video unavailable</strong>
        <small>{error}</small>
        <button onClick={() => setRetryKey((value) => value + 1)} type="button">Try again</button>
      </div>
    );
  }

  if (!credentials) {
    return (
      <div className="nativeLiveState" aria-live="polite">
        <strong>Preparing the Talent7 live room…</strong>
        <small>Your camera and microphone stay off unless you are an authorized challenger.</small>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="nativeLiveState ready">
        <strong>{credentials.can_publish ? "You can join the broadcast" : "The Talent7 room is live"}</strong>
        <small>
          {credentials.can_publish
            ? "Enter first, then turn on camera and microphone separately using the broadcast controls."
            : "You will enter as audience with your camera and microphone off."}
        </small>
        <button onClick={() => setJoined(true)} type="button">
          {credentials.can_publish ? "Enter broadcast" : "Watch live"}
        </button>
      </div>
    );
  }

  return (
    <LiveKitRoom
      audio={false}
      connect
      data-lk-theme="default"
      onConnected={() => setConnected(true)}
      onDisconnected={() => {
        setConnected(false);
        setJoined(false);
      }}
      onError={(roomError: Error) => {
        if (!connected) setError(roomError.message);
      }}
      serverUrl={credentials.server_url}
      token={credentials.participant_token}
      video={false}
    >
      <Talent7VideoStage
        canPublish={credentials.can_publish}
        challengeId={challengeId}
        onReact={onReact}
        reactionActionKey={reactionActionKey}
        reactionOptions={reactionOptions}
        reactionTotals={reactionTotals}
        shareUrl={shareUrl}
        sideLabels={sideLabels}
        title={title}
      />
    </LiveKitRoom>
  );
}
