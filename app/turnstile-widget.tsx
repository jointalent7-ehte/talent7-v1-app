"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileWidgetId = string;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "auto" | "light" | "dark";
      size: "flexible" | "compact";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    }
  ) => TurnstileWidgetId;
  remove: (widgetId: TurnstileWidgetId) => void;
  reset: (widgetId: TurnstileWidgetId) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileWidgetProps = {
  action: string;
  onToken: (token: string) => void;
  resetKey: number;
  siteKey: string;
};

export default function TurnstileWidget({ action, onToken, resetKey, siteKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const previousResetKeyRef = useRef(resetKey);
  const [scriptReady, setScriptReady] = useState(false);
  const [verified, setVerified] = useState(false);

  const renderWidget = useCallback(() => {
    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile || widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      theme: "light",
      size: window.matchMedia("(max-width: 420px)").matches ? "compact" : "flexible",
      callback: (token) => {
        setVerified(true);
        onToken(token);
      },
      "expired-callback": () => {
        setVerified(false);
        onToken("");
      },
      "error-callback": () => {
        setVerified(false);
        onToken("");
      }
    });
  }, [action, onToken, scriptReady, siteKey]);

  useEffect(() => {
    renderWidget();
  }, [renderWidget]);

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) return;
    previousResetKeyRef.current = resetKey;
    setVerified(false);
    onToken("");
    if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
  }, [onToken, resetKey]);

  useEffect(() => {
    return () => {
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, []);

  if (!siteKey) return null;

  return (
    <div className="turnstileField">
      <Script
        onLoad={() => setScriptReady(true)}
        onReady={() => setScriptReady(true)}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div aria-label="Security verification" className="turnstileWidget" ref={containerRef} />
      <small aria-live="polite">
        {verified ? "Security check completed." : "Complete the security check to continue."}
      </small>
    </div>
  );
}
