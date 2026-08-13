"use client";

import { useEffect, useState } from "react";
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks
} from "@livekit/components-react";
import { Track } from "livekit-client";

type JoinCredentials = {
  server_url: string;
  participant_token: string;
  can_publish: boolean;
};

type ChallengeLiveRoomProps = {
  accessToken: string;
  challengeId: string;
  requestedPublisher: boolean;
};

function Talent7VideoStage({ canPublish }: { canPublish: boolean }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  );

  return (
    <div className="nativeLiveStage">
      <GridLayout tracks={tracks}>
        <ParticipantTile />
      </GridLayout>
      <RoomAudioRenderer />
      {canPublish ? (
        <ControlBar
          controls={{ camera: true, microphone: true, screenShare: false, chat: false, leave: true }}
          variation="minimal"
        />
      ) : (
        <div className="nativeAudienceLabel">Watching as audience · camera and microphone are off</div>
      )}
    </div>
  );
}

export default function ChallengeLiveRoom({
  accessToken,
  challengeId,
  requestedPublisher
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
      <Talent7VideoStage canPublish={credentials.can_publish} />
    </LiveKitRoom>
  );
}
