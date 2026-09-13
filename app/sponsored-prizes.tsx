"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type PrizeOffer = {
  id: string;
  tournament_id: string;
  sponsor_user_id: string | null;
  sponsor_name: string;
  title: string;
  prize_type: "Equipment" | "Voucher" | "Coaching" | "Digital reward" | "Other";
  description: string;
  value_label: string;
  eligibility_text: string;
  fulfillment_text: string;
  sponsor_url: string | null;
  status: "Proposed" | "Approved" | "Rejected" | "Withdrawn" | "Fulfilled";
  created_at: string;
};

type PrizeClaim = {
  id: string;
  offer_id: string;
  claimant_user_id: string;
  claimant_name: string;
  claim_note: string;
  status: "Submitted" | "Verified" | "Rejected" | "Fulfilled";
  created_at: string;
};

type SponsoredPrizesProps = {
  tournamentId: string;
  tournamentTitle: string;
  tournamentStatus: "Registration" | "Live" | "Completed" | "Cancelled";
  organizerId: string;
  championName: string;
  canCurrentUserClaim: boolean;
  userId: string;
};

function safePublicUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function shortPrizeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export default function SponsoredPrizes({
  tournamentId,
  tournamentTitle,
  tournamentStatus,
  organizerId,
  championName,
  canCurrentUserClaim,
  userId
}: SponsoredPrizesProps) {
  const [offers, setOffers] = useState<PrizeOffer[]>([]);
  const [claims, setClaims] = useState<PrizeClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const isOrganizer = organizerId === userId;

  const loadPrizes = useCallback(async () => {
    setLoading(true);
    setOffers([]);
    setClaims([]);
    if (!supabase) {
      setLoading(false);
      return;
    }
    const [offerResult, claimResult] = await Promise.all([
      userId
        ? supabase.from("tournament_prize_offers").select("*").eq("tournament_id", tournamentId).order("created_at", { ascending: false })
        : supabase.rpc("get_public_talent7_tournament_prizes", { target_tournament_id: tournamentId }),
      userId
        ? supabase.from("tournament_prize_claims").select("*").eq("tournament_id", tournamentId).order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null })
    ]);
    const error = offerResult.error || claimResult.error;
    if (error) {
      setLoadError(error.message.includes("tournament_prize")
        ? "Sponsored prizes are waiting for the latest Supabase migration."
        : error.message);
    } else {
      setOffers((offerResult.data || []) as PrizeOffer[]);
      setClaims((claimResult.data || []) as PrizeClaim[]);
      setLoadError("");
    }
    setLoading(false);
  }, [tournamentId, userId]);

  useEffect(() => { void loadPrizes(); }, [loadPrizes]);

  useEffect(() => {
    if (!supabase) return;
    const refresh = () => void loadPrizes();
    const channel = supabase
      .channel(`talent7-tournament-prizes-${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_prize_offers", filter: `tournament_id=eq.${tournamentId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_prize_claims", filter: `tournament_id=eq.${tournamentId}` }, refresh)
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [loadPrizes, tournamentId]);

  const visibleOffers = useMemo(
    () => offers.filter((offer) => offer.status === "Approved" || offer.status === "Fulfilled"),
    [offers]
  );
  const proposedOffers = offers.filter((offer) => offer.status === "Proposed");
  const myUnpublishedOffers = offers.filter((offer) =>
    offer.sponsor_user_id === userId
    && !["Approved", "Fulfilled"].includes(offer.status)
    && (!isOrganizer || offer.status !== "Proposed")
  );
  const claimByOffer = useMemo(() => new Map(claims.map((claim) => [claim.offer_id, claim])), [claims]);

  async function runAction(
    key: string,
    action: (client: NonNullable<typeof supabase>) => PromiseLike<{ error: { message: string } | null }>,
    success: string
  ) {
    if (!supabase) return false;
    setBusyAction(key);
    setMessage("");
    const { error } = await action(supabase);
    if (error) setMessage(error.message);
    else {
      setMessage(success);
      await loadPrizes();
    }
    setBusyAction("");
    return !error;
  }

  async function proposePrize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await runAction(
      "propose",
      (client) => client.rpc("propose_talent7_tournament_prize", {
        target_tournament_id: tournamentId,
        target_title: String(form.get("title") || ""),
        target_prize_type: String(form.get("prize_type") || "Equipment"),
        target_description: String(form.get("description") || ""),
        target_value_label: String(form.get("value_label") || ""),
        target_eligibility_text: String(form.get("eligibility_text") || ""),
        target_fulfillment_text: String(form.get("fulfillment_text") || ""),
        target_sponsor_url: String(form.get("sponsor_url") || "") || null
      }),
      "Prize proposed. The tournament organizer must approve it before competitors see it."
    );
    if (saved) formElement.reset();
  }

  async function reviewOffer(offer: PrizeOffer, approve: boolean) {
    await runAction(
      `review-${offer.id}`,
      (client) => client.rpc("review_talent7_tournament_prize", { target_offer_id: offer.id, approve_offer: approve }),
      approve ? "Prize approved and published on this tournament." : "Prize proposal declined."
    );
  }

  async function withdrawOffer(offer: PrizeOffer) {
    await runAction(
      `withdraw-${offer.id}`,
      (client) => client.rpc("withdraw_talent7_tournament_prize", { target_offer_id: offer.id }),
      "Prize offer withdrawn."
    );
  }

  async function claimPrize(event: FormEvent<HTMLFormElement>, offer: PrizeOffer) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await runAction(
      `claim-${offer.id}`,
      (client) => client.rpc("claim_talent7_tournament_prize", {
        target_offer_id: offer.id,
        target_claim_note: String(form.get("claim_note") || "")
      }),
      "Champion claim submitted for organizer verification."
    );
    if (saved) formElement.reset();
  }

  async function reviewClaim(claim: PrizeClaim, approve: boolean) {
    await runAction(
      `claim-review-${claim.id}`,
      (client) => client.rpc("review_talent7_tournament_prize_claim", { target_claim_id: claim.id, approve_claim: approve }),
      approve ? "Champion claim verified." : "Champion claim rejected."
    );
  }

  async function fulfillClaim(claim: PrizeClaim) {
    await runAction(
      `fulfill-${claim.id}`,
      (client) => client.rpc("fulfill_talent7_tournament_prize_claim", { target_claim_id: claim.id }),
      "Prize marked as fulfilled."
    );
  }

  return (
    <section className="sponsoredPrizeVault">
      <header className="sponsoredPrizeHeader">
        <div><span>Prize vault</span><h3>Rewards earned through the bracket.</h3><p>Every published offer is approved by the tournament organizer and awarded only to the recorded champion.</p></div>
        <div><strong>{visibleOffers.length}</strong><small>approved prize{visibleOffers.length === 1 ? "" : "s"}</small></div>
      </header>

      {message && <p className="sponsoredPrizeMessage" role="status">{message}</p>}
      {loadError && <div className="sponsoredPrizeEmpty"><strong>Prize vault unavailable</strong><span>{loadError}</span></div>}
      {!loadError && loading && <div className="sponsoredPrizeEmpty"><strong>Opening prize vault...</strong></div>}

      {!loadError && !loading && (
        <>
          <div className="sponsoredPrizeGrid">
            {visibleOffers.map((offer) => {
              const claim = claimByOffer.get(offer.id);
              const sponsorUrl = safePublicUrl(offer.sponsor_url);
              const canFulfill = claim?.status === "Verified" && (isOrganizer || offer.sponsor_user_id === userId);
              return (
                <article key={offer.id}>
                  <div className="sponsoredPrizeCardTop"><span>{offer.prize_type}</span><b>{offer.status}</b></div>
                  <h4>{offer.title}</h4>
                  <strong>{offer.value_label}</strong>
                  <p>{offer.description}</p>
                  <dl><div><dt>Eligibility</dt><dd>{offer.eligibility_text}</dd></div><div><dt>Fulfilment</dt><dd>{offer.fulfillment_text}</dd></div></dl>
                  <footer><span>Offered by {offer.sponsor_name} · {shortPrizeDate(offer.created_at)}</span>{sponsorUrl && <a href={sponsorUrl} rel="noopener noreferrer" target="_blank">Sponsor link</a>}</footer>
                  {claim && <div className="sponsoredClaimStatus"><strong>Claim: {claim.status}</strong><small>{claim.claimant_name}{claim.claim_note ? ` · ${claim.claim_note}` : ""}</small></div>}
                  {tournamentStatus === "Completed" && canCurrentUserClaim && offer.status === "Approved" && (!claim || claim.status === "Rejected") && (
                    <form className="sponsoredClaimForm" onSubmit={(event) => void claimPrize(event, offer)}>
                      <label>Champion claim note<input maxLength={300} name="claim_note" placeholder="Optional context—do not add an address or banking details" /></label>
                      <button disabled={Boolean(busyAction)} type="submit">{busyAction === `claim-${offer.id}` ? "Submitting..." : `Claim as ${championName || "champion"}`}</button>
                    </form>
                  )}
                  {isOrganizer && claim?.status === "Submitted" && <div className="sponsoredPrizeActions"><button disabled={Boolean(busyAction)} onClick={() => void reviewClaim(claim, true)} type="button">Verify claim</button><button className="secondary" disabled={Boolean(busyAction)} onClick={() => void reviewClaim(claim, false)} type="button">Reject claim</button></div>}
                  {canFulfill && <button className="sponsoredFulfillButton" disabled={Boolean(busyAction)} onClick={() => void fulfillClaim(claim)} type="button">Confirm prize fulfilled</button>}
                  {offer.sponsor_user_id === userId && offer.status === "Approved" && tournamentStatus === "Registration" && !claim && <button className="sponsoredWithdrawButton" disabled={Boolean(busyAction)} onClick={() => void withdrawOffer(offer)} type="button">Withdraw before tournament starts</button>}
                </article>
              );
            })}
          </div>
          {visibleOffers.length === 0 && <div className="sponsoredPrizeEmpty"><strong>No approved prizes yet</strong><span>The bracket stays free to enter. A signed-in supporter can propose a skill-based reward for organizer review.</span></div>}

          {isOrganizer && proposedOffers.length > 0 && (
            <section className="sponsoredPrizeReview">
              <header><span>Organizer review</span><strong>Check every promise before publishing it.</strong></header>
              {proposedOffers.map((offer) => <article key={offer.id}><div><strong>{offer.title}</strong><span>{offer.value_label} · {offer.sponsor_name}</span><p>{offer.description}</p><small>{offer.fulfillment_text}</small></div><div><button disabled={Boolean(busyAction)} onClick={() => void reviewOffer(offer, true)} type="button">Approve</button><button className="secondary" disabled={Boolean(busyAction)} onClick={() => void reviewOffer(offer, false)} type="button">Decline</button></div></article>)}
            </section>
          )}

          {myUnpublishedOffers.length > 0 && (
            <section className="sponsoredPrizeReview sponsoredPrizeMyOffers">
              <header><span>Your proposals</span><strong>Private until the organizer approves.</strong></header>
              {myUnpublishedOffers.map((offer) => <article key={offer.id}><div><strong>{offer.title}</strong><span>{offer.value_label} · {offer.status}</span><p>{offer.description}</p></div>{offer.status === "Proposed" && <div><button className="secondary" disabled={Boolean(busyAction)} onClick={() => void withdrawOffer(offer)} type="button">Withdraw proposal</button></div>}</article>)}
            </section>
          )}

          {userId && ["Registration", "Live"].includes(tournamentStatus) && (
            <details className="sponsoredPrizeProposal">
              <summary>Propose a prize for {tournamentTitle}</summary>
              <p>Your Talent7 display name appears as the sponsor. The organizer reviews the offer; Talent7 does not guarantee or process its monetary value.</p>
              <form onSubmit={proposePrize}>
                <label>Prize title<input maxLength={100} minLength={3} name="title" placeholder="Champion equipment kit" required /></label>
                <label>Prize type<select defaultValue="Equipment" name="prize_type"><option>Equipment</option><option>Voucher</option><option>Coaching</option><option>Digital reward</option><option>Other</option></select></label>
                <label>Value description<input maxLength={80} minLength={2} name="value_label" placeholder="₹5,000 equipment voucher" required /></label>
                <label>Sponsor link<input maxLength={300} name="sponsor_url" placeholder="https://... (optional)" type="url" /></label>
                <label className="wide">What is included?<textarea maxLength={500} minLength={10} name="description" placeholder="Describe the exact product, voucher, coaching session, or digital reward." required rows={3} /></label>
                <label className="wide">Who earns it?<input defaultValue="Recorded first-place tournament champion" maxLength={240} minLength={5} name="eligibility_text" required /></label>
                <label className="wide">How will it be fulfilled?<textarea maxLength={300} minLength={5} name="fulfillment_text" placeholder="Explain timing, geographic limits, expiry, and redemption. A parent or guardian must handle fulfilment for a winner under 18." required rows={3} /></label>
                <label className="sponsoredPrizeConfirmation wide"><input required type="checkbox" /><span>I confirm this is a genuine skill-based non-cash prize, requires no entry fee or random draw, and does not ask users to submit payment, address, or banking information inside Talent7.</span></label>
                <button disabled={Boolean(busyAction)} type="submit">{busyAction === "propose" ? "Sending proposal..." : "Send for organizer review"}</button>
              </form>
            </details>
          )}

          {!userId && <p className="sponsoredPrizeSignIn">Sign in to propose or claim a tournament prize.</p>}
        </>
      )}
    </section>
  );
}
