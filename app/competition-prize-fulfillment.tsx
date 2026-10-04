"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type PrizeBoardRow = {
  offer_id: string;
  cohort_number: number;
  title: string;
  description: string;
  prize_type: string;
  placement_from: number;
  placement_to: number;
  value_label: string;
  shipping_regions: string[];
  ships_worldwide: boolean;
  allow_digital_alternative: boolean;
  fulfillment_note: string;
  status: string;
  is_eligible: boolean;
  eligible_registration_id: string | null;
  eligible_entry_id: string | null;
  my_claim_id: string | null;
  my_claim_status: string | null;
  my_delivery_choice: string | null;
  my_courier_name: string | null;
  my_tracking_code: string | null;
};

type AdminPrizeClaim = {
  id: string;
  offer_id: string;
  registration_id: string;
  display_name: string;
  delivery_choice: string;
  recipient_name: string | null;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  delivery_note: string | null;
  status: string;
  courier_name: string | null;
  tracking_code: string | null;
  admin_note: string | null;
  submitted_at: string;
  pii_delete_after: string | null;
};

type AdminPrizeOffer = PrizeBoardRow & { id: string };
type AdminPrizeState = { offers: AdminPrizeOffer[]; claims: AdminPrizeClaim[] };

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function placementLabel(from: number, to: number) {
  if (from === to) return from === 1 ? "Champion" : `Place #${from}`;
  return `Places #${from}-#${to}`;
}

export default function CompetitionPrizeFulfillment({
  campaignId,
  cohortCount,
  isAdmin
}: {
  campaignId: string;
  cohortCount: number;
  isAdmin: boolean;
}) {
  const [offers, setOffers] = useState<PrizeBoardRow[]>([]);
  const [adminState, setAdminState] = useState<AdminPrizeState>({ offers: [], claims: [] });
  const [deliveryChoices, setDeliveryChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const loadPrizes = useCallback(async () => {
    if (!supabase || campaignId.startsWith("preview-")) return;
    const boardResult = await supabase.rpc("get_talent7_competition_prize_board", {
      target_campaign_id: campaignId
    });
    if (!boardResult.error) setOffers((boardResult.data || []) as PrizeBoardRow[]);
    if (isAdmin) {
      const adminResult = await supabase.rpc("get_talent7_competition_prize_admin_state", {
        target_campaign_id: campaignId
      });
      if (!adminResult.error && adminResult.data) setAdminState(adminResult.data as AdminPrizeState);
    }
  }, [campaignId, isAdmin]);

  useEffect(() => {
    void loadPrizes();
  }, [loadPrizes]);

  async function createOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const worldwide = data.get("worldwide") === "on";
    const regions = String(data.get("regions") || "").split(",").map((item) => item.trim()).filter(Boolean);
    setBusy("create-prize");
    setMessage("");
    try {
      const { error } = await supabase.rpc("create_talent7_competition_prize_offer", {
        target_campaign_id: campaignId,
        target_cohort_number: Number(data.get("cohort")),
        target_title: String(data.get("title") || ""),
        target_description: String(data.get("description") || ""),
        target_prize_type: String(data.get("prizeType") || "Physical prize"),
        target_placement_from: Number(data.get("placementFrom")),
        target_placement_to: Number(data.get("placementTo")),
        target_value_label: String(data.get("valueLabel") || ""),
        target_shipping_regions: regions,
        target_ships_worldwide: worldwide,
        target_allow_digital_alternative: data.get("digitalAlternative") === "on",
        target_fulfillment_note: String(data.get("fulfillmentNote") || "")
      });
      if (error) throw error;
      form.reset();
      await loadPrizes();
      setMessage("The prize is published with its placement and shipping rules visible before anyone claims it.");
    } catch (error) {
      setMessage(readableError(error, "The prize could not be published."));
    } finally {
      setBusy("");
    }
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>, offer: PrizeBoardRow) {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const choice = String(data.get("deliveryChoice") || "Ship prize");
    setBusy(`claim-${offer.offer_id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("submit_my_talent7_competition_prize_claim", {
        target_offer_id: offer.offer_id,
        target_delivery_choice: choice,
        target_recipient_name: String(data.get("recipientName") || "").trim() || null,
        target_phone: String(data.get("phone") || "").trim() || null,
        target_address_line: String(data.get("address") || "").trim() || null,
        target_city: String(data.get("city") || "").trim() || null,
        target_region: String(data.get("region") || "").trim() || null,
        target_postal_code: String(data.get("postalCode") || "").trim() || null,
        target_country: String(data.get("country") || "").trim() || null,
        target_delivery_note: String(data.get("deliveryNote") || "").trim() || null
      });
      if (error) throw error;
      form.reset();
      await loadPrizes();
      setMessage(choice === "Decline" ? "The prize was declined. No delivery address was stored." : "Your private fulfilment request was submitted to the organizer.");
    } catch (error) {
      setMessage(readableError(error, "The fulfilment request could not be submitted."));
    } finally {
      setBusy("");
    }
  }

  async function updateClaim(event: FormEvent<HTMLFormElement>, claim: AdminPrizeClaim) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    setBusy(`admin-claim-${claim.id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("update_talent7_competition_prize_claim", {
        target_claim_id: claim.id,
        target_status: String(data.get("status") || "Verified"),
        target_courier_name: String(data.get("courier") || "").trim() || null,
        target_tracking_code: String(data.get("tracking") || "").trim() || null,
        target_admin_note: String(data.get("adminNote") || "").trim() || null
      });
      if (error) throw error;
      await loadPrizes();
      setMessage(`${claim.display_name}'s private fulfilment record was updated.`);
    } catch (error) {
      setMessage(readableError(error, "The fulfilment record could not be updated."));
    } finally {
      setBusy("");
    }
  }

  async function purgeExpiredPii() {
    if (!supabase) return;
    setBusy("purge-prize-pii");
    setMessage("");
    try {
      const { data: count, error } = await supabase.rpc("run_talent7_competition_prize_pii_cleanup");
      if (error) throw error;
      await loadPrizes();
      setMessage(`${Number(count) || 0} expired private fulfilment records were scrubbed.`);
    } catch (error) {
      setMessage(readableError(error, "Expired delivery data could not be cleaned up."));
    } finally {
      setBusy("");
    }
  }

  if (offers.length === 0 && !isAdmin) return null;

  return (
    <section className="competitionPrizeSection" aria-labelledby="competition-prize-title">
      <div className="competitionPrizeHeader"><div><span>Transparent rewards</span><h3 id="competition-prize-title">Prizes with published rules and private fulfilment.</h3><p>Entry remains free. Reward eligibility comes only from verified final results—not purchases, tokens, or chance.</p></div><strong>Private<small>delivery desk</small></strong></div>
      {message && <p className="prizeFulfillmentMessage" role="status">{message}</p>}

      {offers.length > 0 && <div className="competitionPrizeGrid">{offers.map((offer) => {
        const choice = deliveryChoices[offer.offer_id] || (offer.prize_type === "Digital prize" || offer.prize_type === "Voucher" ? "Digital alternative" : "Ship prize");
        const canClaim = offer.is_eligible && (!offer.my_claim_id || offer.my_claim_status === "Rejected");
        return (
          <article className={offer.is_eligible ? "eligible" : ""} key={offer.offer_id}>
            <div className="competitionPrizeTopline"><span>{offer.prize_type}</span><strong>{placementLabel(offer.placement_from, offer.placement_to)}</strong></div>
            <h4>{offer.title}</h4><p>{offer.description}</p>
            <div className="competitionPrizeFacts"><span>{offer.value_label}</span><span>{offer.ships_worldwide ? "Worldwide fulfilment" : offer.shipping_regions.join(" / ")}</span>{offer.allow_digital_alternative && <span>Digital alternative available</span>}</div>
            <small>{offer.fulfillment_note}</small>
            {offer.my_claim_id && <div className="myPrizeClaimStatus"><span>Your request</span><strong>{offer.my_claim_status}</strong><small>{offer.my_delivery_choice}{offer.my_courier_name ? ` / ${offer.my_courier_name}` : ""}{offer.my_tracking_code ? ` / ${offer.my_tracking_code}` : ""}</small></div>}
            {canClaim && (
              <form className="prizeClaimForm" onSubmit={(event) => submitClaim(event, offer)}>
                <label className="wide">Delivery choice<select name="deliveryChoice" onChange={(event) => setDeliveryChoices((current) => ({ ...current, [offer.offer_id]: event.target.value }))} value={choice}><option>Ship prize</option>{offer.allow_digital_alternative && <option>Digital alternative</option>}<option>Decline</option></select></label>
                {choice === "Ship prize" && <><label>Recipient name<input maxLength={100} name="recipientName" required /></label><label>Phone for courier<input maxLength={30} name="phone" required /></label><label className="wide">Address<input maxLength={300} name="address" required /></label><label>City<input maxLength={100} name="city" required /></label><label>State / region<input maxLength={100} name="region" required /></label><label>Postal code<input maxLength={30} name="postalCode" required /></label><label>Country<input maxLength={100} name="country" required /></label></>}
                {choice !== "Decline" && <label className="wide">Delivery note<input maxLength={300} name="deliveryNote" placeholder="Landmark, size choice, or digital alternative preference" /></label>}
                <button disabled={busy === `claim-${offer.offer_id}`} type="submit">{busy === `claim-${offer.offer_id}` ? "Submitting privately..." : choice === "Decline" ? "Decline prize" : "Submit private fulfilment request"}</button>
                <small className="wide">Only authorized organizers can read these details. Delivery information is removed 30 days after fulfilment closes.</small>
              </form>
            )}
          </article>
        );
      })}</div>}

      {isAdmin && !campaignId.startsWith("preview-") && <details className="prizeOrganizerConsole" open>
        <summary><span>Organizer prize desk</span><strong>{adminState.claims.length} private claims</strong></summary>
        <div className="prizeOrganizerBody">
          <form className="prizeOfferForm" onSubmit={createOffer}>
            <div className="wide"><span>Publish a fulfilment promise</span><h4>Declare eligibility, value, and shipping limits before winners claim.</h4></div>
            <label>Cohort<select name="cohort">{Array.from({ length: Math.max(1, cohortCount) }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label>
            <label>Prize type<select defaultValue="Custom trophy" name="prizeType"><option>Custom trophy</option><option>Physical prize</option><option>Voucher</option><option>Digital prize</option></select></label>
            <label>From place<input defaultValue="1" max="100" min="1" name="placementFrom" required type="number" /></label>
            <label>To place<input defaultValue="1" max="100" min="1" name="placementTo" required type="number" /></label>
            <label className="wide">Prize title<input maxLength={100} name="title" placeholder="Founding Champion Trophy" required /></label>
            <label className="wide">Description<textarea maxLength={500} name="description" placeholder="A custom engraved Talent7 trophy for the verified cohort champion." required /></label>
            <label>Value label<input maxLength={80} name="valueLabel" placeholder="Approx. ₹2,000 value" required /></label>
            <label className="wide">Shipping regions<input name="regions" placeholder="India, Maharashtra, Karnataka (comma-separated)" /></label>
            <label className="prizeBoolean"><input name="worldwide" type="checkbox" /><span>Ships worldwide</span></label>
            <label className="prizeBoolean"><input defaultChecked name="digitalAlternative" type="checkbox" /><span>Allow digital alternative</span></label>
            <label className="wide">Fulfilment promise<textarea maxLength={500} name="fulfillmentNote" placeholder="Ships within 30 days after address verification; an equivalent voucher may be offered where delivery is impractical." required /></label>
            <button disabled={busy === "create-prize"} type="submit">{busy === "create-prize" ? "Publishing..." : "Publish prize rules"}</button>
          </form>

          <div className="privatePrizeClaims">
            <div className="privatePrizeClaimsHeader"><div><span>Private winner details</span><strong>Never copy these into public comments or leaderboards.</strong></div><button disabled={busy === "purge-prize-pii"} onClick={purgeExpiredPii} type="button">{busy === "purge-prize-pii" ? "Cleaning..." : "Clean expired delivery data"}</button></div>
            {adminState.claims.map((claim) => (
              <form key={claim.id} onSubmit={(event) => updateClaim(event, claim)}>
                <div className="privateClaimIdentity"><span>{claim.delivery_choice}</span><strong>{claim.display_name}</strong><small>Submitted {new Date(claim.submitted_at).toLocaleString()}</small></div>
                {claim.delivery_choice === "Ship prize" && <address><strong>{claim.recipient_name || "Address removed"}</strong>{claim.address_line && <span>{claim.address_line}</span>}{claim.city && <span>{claim.city}, {claim.region} {claim.postal_code}</span>}{claim.country && <span>{claim.country}</span>}{claim.phone && <span>Courier phone: {claim.phone}</span>}</address>}
                {claim.delivery_note && <p>{claim.delivery_note}</p>}
                <label>Status<select defaultValue={claim.status} name="status"><option>Verified</option><option>Ordered</option><option>Shipped</option><option>Delivered</option><option>Alternative sent</option><option>Rejected</option><option>Cancelled</option></select></label>
                <label>Courier<input defaultValue={claim.courier_name || ""} maxLength={100} name="courier" /></label>
                <label>Tracking code<input defaultValue={claim.tracking_code || ""} maxLength={150} name="tracking" /></label>
                <label className="wide">Private organizer note<input defaultValue={claim.admin_note || ""} maxLength={500} name="adminNote" /></label>
                <button disabled={busy === `admin-claim-${claim.id}`} type="submit">{busy === `admin-claim-${claim.id}` ? "Saving..." : "Update fulfilment"}</button>
                {claim.pii_delete_after && <small className="wide">Delivery data scheduled for removal after {new Date(claim.pii_delete_after).toLocaleDateString()}.</small>}
              </form>
            ))}
            {adminState.claims.length === 0 && <p className="noPrizeClaims">No eligible winner has submitted private delivery details yet.</p>}
          </div>
        </div>
      </details>}
    </section>
  );
}
