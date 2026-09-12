"use client";

import { useEffect, useState } from "react";
import {
  ControlBar,
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants
} from "@livekit/components-react";

type JoinCredentials = {
  server_url: string;
  participant_token: string;
  can_publish: boolean;
  role: "Host" | "Speaker" | "Listener";
};

type ListenVoiceRoomProps = {
  accessToken: string;
  areaLabel: string;
  memberRole: "Host" | "Speaker" | "Listener";
  roomId: string;
  title: string;
};

function AudioRoomStage({ can_publish: canPublish, role }: Pick<JoinCredentials, "can_publish" | "role">) {
  const participants = useParticipants();

  return (
    <div className="listenVoiceStage">
      <div className="listenVoicePeople" aria-label={`${participants.length} people in the voice room`}>
        {participants.map((participant) => {
          const name = participant.name || "Talent7 member";
          return (
            <span key={participant.identity} title={name}>
              <b aria-hidden="true">{name.trim().slice(0, 1).toUpperCase()}</b>
              <small>{name}</small>
            </span>
          );
        })}
      </div>
      <RoomAudioRenderer />
      <div className="listenVoiceControls">
        {canPublish ? (
          <>
            <ControlBar
              controls={{ camera: false, chat: false, leave: true, microphone: true, screenShare: false }}
              variation="minimal"
            />
            <small>You are an approved {role.toLowerCase()}. Your microphone starts off.</small>
          </>
        ) : (
          <>
            <ControlBar
              controls={{ camera: false, chat: false, leave: true, microphone: false, screenShare: false }}
              variation="minimal"
            />
            <small>Listening only. Request the mic from the room host to speak.</small>
          </>
        )}
      </div>
    </div>
  );
}

export default function ListenVoiceRoom({ accessToken, areaLabel, memberRole, roomId, title }: ListenVoiceRoomProps) {
  const [credentials, setCredentials] = useState<JoinCredentials | null>(null);
  const [entered, setEntered] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function prepareRoom() {
      setCredentials(null);
      setEntered(false);
      setError("");

      try {
        const response = await fetch("/api/listen-voice-token", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ roomId }),
          signal: controller.signal
        });
        const result = (await response.json()) as JoinCredentials & { error?: string };
        if (!response.ok) throw new Error(result.error || "The voice room could not be opened.");
        setCredentials(result);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "The voice room could not be opened.");
      }
    }

    void prepareRoom();
    return () => controller.abort();
  }, [accessToken, memberRole, retryKey, roomId]);

  if (error) {
    return (
      <div className="listenVoiceState error" role="alert">
        <strong>Voice room unavailable</strong>
        <small>{error}</small>
        <button onClick={() => setRetryKey((value) => value + 1)} type="button">Try again</button>
      </div>
    );
  }

  if (!credentials) {
    return (
      <div className="listenVoiceState" aria-live="polite">
        <strong>Preparing the local voice room…</strong>
        <small>Your microphone remains off until you enter and switch it on.</small>
      </div>
    );
  }

  if (!entered) {
    return (
      <div className="listenVoiceState ready">
        <div>
          <span>🎙 {areaLabel}</span>
          <strong>{title}</strong>
          <small>
            {credentials.can_publish
              ? `Enter as ${credentials.role.toLowerCase()}. Your microphone starts off.`
              : "Enter as a listener. You can request the microphone from the host."}
          </small>
        </div>
        <button onClick={() => setEntered(true)} type="button">Enter voice room</button>
      </div>
    );
  }

  return (
    <LiveKitRoom
      audio={false}
      connect
      data-lk-theme="default"
      onDisconnected={() => setEntered(false)}
      onError={(roomError: Error) => setError(roomError.message)}
      serverUrl={credentials.server_url}
      token={credentials.participant_token}
      video={false}
    >
      <AudioRoomStage can_publish={credentials.can_publish} role={credentials.role} />
    </LiveKitRoom>
  );
}
