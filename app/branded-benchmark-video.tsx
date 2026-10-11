"use client";

import { useEffect, useRef, useState } from "react";

type GeneratedVideo = {
  file: File;
  url: string;
};

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function safeFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "benchmark";
}

function drawCover(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number
) {
  const videoWidth = video.videoWidth || width;
  const videoHeight = video.videoHeight || height;
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const drawWidth = videoWidth * scale;
  const drawHeight = videoHeight * scale;
  context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  benchmarkTitle: string,
  scoreLabel: string,
  challengerName: string,
  verificationStatus: string,
  logo: HTMLImageElement | null
) {
  const topShade = context.createLinearGradient(0, 0, 0, 290);
  topShade.addColorStop(0, "rgba(3, 17, 21, 0.92)");
  topShade.addColorStop(1, "rgba(3, 17, 21, 0)");
  context.fillStyle = topShade;
  context.fillRect(0, 0, width, 290);

  const bottomShade = context.createLinearGradient(0, height - 390, 0, height);
  bottomShade.addColorStop(0, "rgba(3, 17, 21, 0)");
  bottomShade.addColorStop(1, "rgba(3, 17, 21, 0.95)");
  context.fillStyle = bottomShade;
  context.fillRect(0, height - 390, width, 390);

  if (logo) context.drawImage(logo, 38, 42, 72, 72);
  else {
    const brandGradient = context.createLinearGradient(38, 0, 265, 0);
    brandGradient.addColorStop(0, "#20d2c5");
    brandGradient.addColorStop(1, "#7367ff");
    context.fillStyle = brandGradient;
    context.fillRect(38, 42, 12, 72);
  }
  context.fillStyle = "#ffffff";
  context.font = "900 52px Arial, sans-serif";
  context.textBaseline = "top";
  context.fillText("Talent7", logo ? 128 : 72, 48);

  context.font = "700 24px Arial, sans-serif";
  context.fillStyle = "rgba(255,255,255,0.86)";
  context.fillText("COMPETE · PROVE IT · RISE", logo ? 128 : 72, 108);

  context.font = "900 88px Arial, sans-serif";
  context.fillStyle = "#ffffff";
  context.fillText(scoreLabel, 42, height - 250);

  context.font = "800 31px Arial, sans-serif";
  context.fillStyle = "#2fe0d1";
  context.fillText(benchmarkTitle.slice(0, 42), 44, height - 145);

  context.font = "700 25px Arial, sans-serif";
  context.fillStyle = "rgba(255,255,255,0.9)";
  context.fillText(challengerName.slice(0, 30), 44, height - 99);

  const badgeText = verificationStatus.toUpperCase();
  context.font = "800 20px Arial, sans-serif";
  const badgeWidth = Math.min(context.measureText(badgeText).width + 34, 275);
  context.fillStyle = verificationStatus === "Verified" ? "#1d9c61" : "rgba(16, 33, 38, 0.88)";
  context.fillRect(width - badgeWidth - 38, 52, badgeWidth, 48);
  context.fillStyle = "#ffffff";
  context.fillText(badgeText, width - badgeWidth - 21, 65);
}

export default function BrandedBenchmarkVideo({
  videoUrl,
  benchmarkTitle,
  scoreLabel,
  challengerName,
  verificationStatus
}: {
  videoUrl: string;
  benchmarkTitle: string;
  scoreLabel: string;
  challengerName: string;
  verificationStatus: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [generatedVideo, setGeneratedVideo] = useState<GeneratedVideo | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    return () => {
      if (generatedVideo) URL.revokeObjectURL(generatedVideo.url);
    };
  }, [generatedVideo]);

  async function generateBrandedCopy() {
    const video = videoRef.current as CapturableVideo | null;
    if (!video || typeof MediaRecorder === "undefined") {
      setStatus("This browser cannot create a branded video. Try current Chrome on Android or desktop.");
      return;
    }

    const canvas = document.createElement("canvas");
    if (typeof canvas.captureStream !== "function") {
      setStatus("This browser cannot export canvas video. Try current Chrome on Android or desktop.");
      return;
    }

    setGenerating(true);
    setProgress(0);
    setStatus("Preparing the vertical Talent7 copy…");

    try {
      if (video.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener("loadedmetadata", () => resolve(), { once: true });
          video.addEventListener("error", () => reject(new Error("The uploaded video could not be loaded.")), { once: true });
          video.load();
        });
      }
      if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("The video duration is unavailable.");
      if (video.duration > 180) throw new Error("Branded exports are limited to three minutes.");

      canvas.width = 720;
      canvas.height = 1280;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Video rendering is unavailable on this device.");
      const logo = await new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        image.addEventListener("load", () => resolve(image), { once: true });
        image.addEventListener("error", () => resolve(null), { once: true });
        image.src = "/talent7-icon.svg";
      });

      const canvasStream = canvas.captureStream(30);
      const sourceStream = video.captureStream?.() || video.mozCaptureStream?.();
      sourceStream?.getAudioTracks().forEach((track) => canvasStream.addTrack(track));

      const preferredTypes = [
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = new MediaRecorder(
        canvasStream,
        mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : { videoBitsPerSecond: 5_000_000 }
      );
      const chunks: BlobPart[] = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });

      let animationFrame = 0;
      const renderFrame = () => {
        context.fillStyle = "#071417";
        context.fillRect(0, 0, canvas.width, canvas.height);
        drawCover(context, video, canvas.width, canvas.height);
        drawOverlay(context, canvas.width, canvas.height, benchmarkTitle, scoreLabel, challengerName, verificationStatus, logo);
        setProgress(Math.min(100, Math.round((video.currentTime / video.duration) * 100)));
        if (!video.ended) animationFrame = window.requestAnimationFrame(renderFrame);
      };

      const finished = new Promise<Blob>((resolve, reject) => {
        recorder.addEventListener("stop", () => {
          const outputType = recorder.mimeType || mimeType || "video/webm";
          const blob = new Blob(chunks, { type: outputType });
          if (blob.size === 0) reject(new Error("The generated video was empty."));
          else resolve(blob);
        }, { once: true });
        recorder.addEventListener("error", () => reject(new Error("The browser stopped video generation.")), { once: true });
      });

      video.pause();
      video.currentTime = 0;
      video.muted = true;
      recorder.start(1000);
      renderFrame();
      await video.play();
      await new Promise<void>((resolve, reject) => {
        video.addEventListener("ended", () => resolve(), { once: true });
        video.addEventListener("error", () => reject(new Error("The uploaded video stopped during export.")), { once: true });
      });
      window.cancelAnimationFrame(animationFrame);
      recorder.stop();
      const blob = await finished;
      canvasStream.getTracks().forEach((track) => track.stop());

      const extension = blob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `talent7-${safeFilePart(benchmarkTitle)}.${extension}`, { type: blob.type });
      if (generatedVideo) URL.revokeObjectURL(generatedVideo.url);
      setGeneratedVideo({ file, url: URL.createObjectURL(blob) });
      setProgress(100);
      setStatus(extension === "mp4"
        ? "Your branded video is ready to share."
        : "Branded video ready. Your browser created WebM; Chrome’s phone share sheet can send the file, but some social apps may prefer MP4.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The branded video could not be generated.");
    } finally {
      video.pause();
      setGenerating(false);
    }
  }

  async function shareGeneratedVideo() {
    if (!generatedVideo) return;
    try {
      const shareData = {
        files: [generatedVideo.file],
        title: `${benchmarkTitle} on Talent7`,
        text: `${challengerName} recorded ${scoreLabel} on Talent7.`
      };
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        setStatus("Branded video shared.");
        return;
      }
      setStatus("Direct file sharing is unavailable here. Download the video and select it inside your social app.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("The phone share sheet could not open. Download the video instead.");
    }
  }

  return (
    <section className="brandedBenchmarkVideo" aria-label="Talent7 branded benchmark video">
      <div className="brandedBenchmarkPreview">
        <video controls crossOrigin="anonymous" playsInline preload="metadata" ref={videoRef} src={videoUrl} />
        <div className="brandedBenchmarkOverlay" aria-hidden="true">
          <strong><i />Talent7</strong>
          <span>{verificationStatus}</span>
          <div><b>{scoreLabel}</b><small>{benchmarkTitle}</small></div>
        </div>
      </div>
      <div className="brandedBenchmarkActions">
        <button disabled={generating} onClick={() => void generateBrandedCopy()} type="button">
          {generating ? `Creating… ${progress}%` : generatedVideo ? "Recreate branded video" : "Create branded video"}
        </button>
        {generatedVideo && (
          <>
            <button className="secondary" onClick={() => void shareGeneratedVideo()} type="button">Share video file</button>
            <a download={generatedVideo.file.name} href={generatedVideo.url}>Download</a>
          </>
        )}
      </div>
      <small>The overlay is burned into a new vertical copy on your device. Keep this page open while it plays through once.</small>
      <p aria-live="polite">{status}</p>
    </section>
  );
}
