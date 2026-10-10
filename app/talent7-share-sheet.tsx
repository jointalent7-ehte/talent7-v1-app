"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Talent7ShareChannel =
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "x"
  | "telegram"
  | "email"
  | "copy"
  | "more";

export type Talent7SharePayload = {
  title: string;
  text?: string;
  url: string;
  onShare?: (channel: Talent7ShareChannel) => void;
};

const SHARE_EVENT = "talent7:open-share-sheet";

export function openTalent7Share(payload: Talent7SharePayload) {
  window.dispatchEvent(new CustomEvent<Talent7SharePayload>(SHARE_EVENT, { detail: payload }));
}

function fullShareText(payload: Talent7SharePayload) {
  return [payload.text || payload.title, payload.url].filter(Boolean).join("\n");
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function openExternal(url: string) {
  const popup = window.open(url, "_blank");
  if (popup) {
    try {
      popup.opener = null;
    } catch {
      // Some embedded browsers isolate the new window before this assignment.
    }
    return;
  }
  window.location.assign(url);
}

export default function Talent7ShareSheetHost() {
  const [payload, setPayload] = useState<Talent7SharePayload | null>(null);
  const [status, setStatus] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setPayload(null);
    setStatus("");
  }, []);

  useEffect(() => {
    function open(event: Event) {
      const detail = (event as CustomEvent<Talent7SharePayload>).detail;
      if (!detail?.url) return;
      setPayload(detail);
      setStatus("");
    }

    window.addEventListener(SHARE_EVENT, open);
    return () => window.removeEventListener(SHARE_EVENT, open);
  }, []);

  useEffect(() => {
    if (!payload) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, payload]);

  if (!payload) return null;

  const sharePayload = payload;
  const encodedUrl = encodeURIComponent(sharePayload.url);
  const encodedText = encodeURIComponent(sharePayload.text || sharePayload.title);
  const encodedFullText = encodeURIComponent(fullShareText(sharePayload));

  function finish(channel: Talent7ShareChannel, message: string) {
    sharePayload.onShare?.(channel);
    setStatus(message);
    window.setTimeout(close, 650);
  }

  function openChannel(channel: Talent7ShareChannel, url: string) {
    openExternal(url);
    finish(channel, "Opening share option…");
  }

  async function shareToInstagram() {
    try {
      await copyText(fullShareText(sharePayload));
      openExternal("https://www.instagram.com/");
      finish("instagram", "Caption and link copied — paste them in Instagram.");
    } catch {
      setStatus("Could not copy the link. Try Copy link instead.");
    }
  }

  async function copyLink() {
    try {
      await copyText(sharePayload.url);
      finish("copy", "Link copied.");
    } catch {
      setStatus("Your device blocked copying. Try More apps instead.");
    }
  }

  async function shareMore() {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: sharePayload.title, text: sharePayload.text, url: sharePayload.url });
        finish("more", "Shared.");
        return;
      }
      await copyText(fullShareText(sharePayload));
      finish("more", "Share text copied — paste it into any app.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Sharing was unavailable. Try Copy link instead.");
    }
  }

  return (
    <div className="talent7ShareBackdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section aria-labelledby="talent7-share-title" aria-modal="true" className="talent7ShareSheet" role="dialog">
        <div className="talent7ShareHandle" aria-hidden="true" />
        <header>
          <div>
            <span>Share on Talent7</span>
            <h2 id="talent7-share-title">{sharePayload.title}</h2>
          </div>
          <button aria-label="Close share options" className="talent7ShareClose" onClick={close} ref={closeButtonRef} type="button">×</button>
        </header>

        <div className="talent7ShareGrid">
          <button onClick={() => openChannel("whatsapp", `https://wa.me/?text=${encodedFullText}`)} type="button">
            <i className="whatsapp" aria-hidden="true">W</i><span>WhatsApp</span>
          </button>
          <button onClick={() => void shareToInstagram()} type="button">
            <i className="instagram" aria-hidden="true">◎</i><span>Instagram</span>
          </button>
          <button onClick={() => openChannel("facebook", `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`)} type="button">
            <i className="facebook" aria-hidden="true">f</i><span>Facebook</span>
          </button>
          <button onClick={() => openChannel("x", `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`)} type="button">
            <i className="x" aria-hidden="true">𝕏</i><span>X</span>
          </button>
          <button onClick={() => openChannel("telegram", `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`)} type="button">
            <i className="telegram" aria-hidden="true">➤</i><span>Telegram</span>
          </button>
          <button onClick={() => openChannel("email", `mailto:?subject=${encodeURIComponent(sharePayload.title)}&body=${encodedFullText}`)} type="button">
            <i className="email" aria-hidden="true">✉</i><span>Email</span>
          </button>
          <button onClick={() => void copyLink()} type="button">
            <i className="copy" aria-hidden="true">↗</i><span>Copy link</span>
          </button>
          <button onClick={() => void shareMore()} type="button">
            <i className="more" aria-hidden="true">•••</i><span>More apps</span>
          </button>
        </div>

        <div className="talent7SharePreview">
          <span>{sharePayload.text || "Share this from Talent7."}</span>
          <small>{sharePayload.url}</small>
        </div>
        <p aria-live="polite" className="talent7ShareStatus">{status}</p>
      </section>
    </div>
  );
}
