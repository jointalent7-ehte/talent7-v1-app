"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { openTalent7Share } from "./talent7-share-sheet";

type MyInviteState = {
  registered: boolean;
  invite_code: string | null;
  registration_count: number;
  confirmed_count: number;
  referred: boolean;
};

type TopInviter = {
  registration_id: string;
  display_name: string;
  public_anonymous: boolean;
  invite_code: string;
  registration_count: number;
  confirmed_count: number;
};

type AdminInviteState = {
  attributed_registrations: number;
  attributed_confirmed: number;
  top_inviters: TopInviter[];
};

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

export default function CompetitionInviteLoop({
  campaignId,
  campaignSlug,
  campaignTitle,
  registered,
  isAdmin
}: {
  campaignId: string;
  campaignSlug: string;
  campaignTitle: string;
  registered: boolean;
  isAdmin: boolean;
}) {
  const [myState, setMyState] = useState<MyInviteState>({ registered: false, invite_code: null, registration_count: 0, confirmed_count: 0, referred: false });
  const [adminState, setAdminState] = useState<AdminInviteState>({ attributed_registrations: 0, attributed_confirmed: 0, top_inviters: [] });
  const [capturedInvite, setCapturedInvite] = useState("");
  const [message, setMessage] = useState("");
  const claimAttempted = useRef("");

  const loadInviteState = useCallback(async () => {
    if (!supabase || campaignId.startsWith("preview-")) return;
    const sessionResult = await supabase.auth.getSession();
    if (!sessionResult.data.session) return;
    const requests = [supabase.rpc("get_my_talent7_competition_invite_state", { target_campaign_id: campaignId })];
    if (isAdmin) requests.push(supabase.rpc("get_talent7_competition_invite_admin_state", { target_campaign_id: campaignId }));
    const [mine, admin] = await Promise.all(requests);
    if (!mine.error && mine.data) setMyState(mine.data as MyInviteState);
    if (admin && !admin.error && admin.data) setAdminState(admin.data as AdminInviteState);
  }, [campaignId, isAdmin]);

  useEffect(() => {
    if (campaignId.startsWith("preview-")) return;
    const queryCode = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase() || "";
    const validQueryCode = /^JOIN-[A-Z0-9]{9}$/.test(queryCode) ? queryCode : "";
    const storageKey = `talent7-competition-referral:${campaignId}`;
    if (validQueryCode) sessionStorage.setItem(storageKey, validQueryCode);
    setCapturedInvite(validQueryCode || sessionStorage.getItem(storageKey) || "");
  }, [campaignId]);

  useEffect(() => {
    void loadInviteState();
  }, [loadInviteState, registered]);

  useEffect(() => {
    if (!supabase || !registered || !capturedInvite || claimAttempted.current === capturedInvite) return;
    claimAttempted.current = capturedInvite;
    const storageKey = `talent7-competition-referral:${campaignId}`;
    void (async () => {
      const { error } = await supabase.rpc("claim_talent7_competition_referral", {
        target_campaign_id: campaignId,
        target_invite_code: capturedInvite
      });
      sessionStorage.removeItem(storageKey);
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("ref");
      window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      setCapturedInvite("");
      if (error) setMessage(readableError(error, "The invitation could not be connected."));
      else {
        setMessage("Invitation connected to your registration. It does not affect cohort order, ranking, or prizes.");
        await loadInviteState();
      }
    })();
  }, [campaignId, capturedInvite, loadInviteState, registered]);

  function inviteUrl() {
    if (!myState.invite_code) return "";
    return `${window.location.origin}/competition/${encodeURIComponent(campaignSlug)}?ref=${encodeURIComponent(myState.invite_code)}`;
  }

  function shareInvite() {
    const url = inviteUrl();
    if (!url) return;
    setMessage("");
    openTalent7Share({
      title: campaignTitle,
      text: `Help choose and join ${campaignTitle} on Talent7. Registration is free.`,
      url,
      onShare: () => setMessage("Invitation shared. Your private registration code was not included.")
    });
  }

  async function copyInvite() {
    const url = inviteUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Invitation link copied. Your private registration code is never included.");
    } catch {
      setMessage("Your browser blocked copying. Use Share invitation instead.");
    }
  }

  if (campaignId.startsWith("preview-")) return null;

  return (
    <section className="competitionInviteLoop" aria-label="Community competition invitations">
      {message && <p className="competitionInviteMessage" role="status">{message}</p>}

      {!registered && capturedInvite && (
        <div className="capturedCompetitionInvite"><span>Invitation saved</span><strong>Reserve your free place to connect it.</strong><small>It will not change your cohort order, eligibility, ranking, or prizes.</small></div>
      )}

      {myState.registered && myState.invite_code && (
        <div className="competitionInviteCard">
          <div>
            <span>Fill the first competition together</span>
            <h3>Invite someone who would genuinely want to compete.</h3>
            <p>The link opens this competition directly. Talent7 records only completed registration attribution—there are no referral payments, entry advantages, or ranking boosts.</p>
          </div>
          <div className="competitionInviteStats"><article><strong>{myState.registration_count}</strong><span>joined</span></article><article><strong>{myState.confirmed_count}</strong><span>confirmed</span></article></div>
          <div className="competitionInviteActions"><code>{myState.invite_code}</code><button onClick={shareInvite} type="button">Share invitation</button><button className="secondary" onClick={copyInvite} type="button">Copy link</button></div>
          <small>Share this invitation code. Keep your separate registration code private.</small>
        </div>
      )}

      {isAdmin && (
        <details className="competitionInviteAdmin">
          <summary><span>Organizer acquisition view</span><strong>{adminState.attributed_registrations} attributed registrations</strong></summary>
          <div>
            <p>{adminState.attributed_confirmed} attributed members are confirmed. This dashboard measures useful invitations without creating financial or competitive incentives.</p>
            {adminState.top_inviters.map((inviter) => <article key={inviter.registration_id}><div><strong>{inviter.display_name}</strong><small>{inviter.invite_code}{inviter.public_anonymous ? " / public alias enabled" : ""}</small></div><span>{inviter.registration_count} joined</span><b>{inviter.confirmed_count} confirmed</b></article>)}
            {adminState.top_inviters.length === 0 && <p>No attributed registrations yet.</p>}
          </div>
        </details>
      )}
    </section>
  );
}
