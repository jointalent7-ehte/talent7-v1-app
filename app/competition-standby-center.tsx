"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type StandbyOffer = {
  id: string;
  status: string;
  expires_at: string;
  heat_id?: string;
  cohort_number: number;
  round_name: string;
  heat_number: number;
  stage_number?: number;
  lane_number: number;
  scheduled_start?: string;
  duration_seconds?: number;
  source_entry_id?: string | null;
  source_display_name?: string;
  candidate_name?: string;
  created_at: string;
};

type StandbyVacancy = {
  entry_id: string;
  heat_id: string;
  display_name: string;
  cohort_number: number;
  round_name: string;
  heat_number: number;
  stage_number: number;
  lane_number: number;
  scheduled_start: string;
};

type MyStandbyState = { registered: boolean; available: boolean; offers: StandbyOffer[] };
type AdminStandbyState = { candidate_count: number; vacancies: StandbyVacancy[]; offers: StandbyOffer[] };

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function CompetitionStandbyCenter({ campaignId, isAdmin }: { campaignId: string; isAdmin: boolean }) {
  const [myState, setMyState] = useState<MyStandbyState>({ registered: false, available: false, offers: [] });
  const [adminState, setAdminState] = useState<AdminStandbyState>({ candidate_count: 0, vacancies: [], offers: [] });
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const loadStandby = useCallback(async () => {
    if (!supabase || campaignId.startsWith("preview-")) return;
    const sessionResult = await supabase.auth.getSession();
    const hasSession = Boolean(sessionResult.data.session);
    setSignedIn(hasSession);
    if (!hasSession) return;

    const requests = [supabase.rpc("get_my_talent7_competition_standby_state", { target_campaign_id: campaignId })];
    if (isAdmin) requests.push(supabase.rpc("get_talent7_competition_standby_admin_state", { target_campaign_id: campaignId }));
    const [mine, admin] = await Promise.all(requests);
    if (!mine.error && mine.data) setMyState(mine.data as MyStandbyState);
    if (admin && !admin.error && admin.data) setAdminState(admin.data as AdminStandbyState);
  }, [campaignId, isAdmin]);

  useEffect(() => {
    void loadStandby();
  }, [loadStandby]);

  async function setAvailability(available: boolean) {
    if (!supabase) return;
    setBusy("availability");
    setMessage("");
    try {
      const { error } = await supabase.rpc("set_my_talent7_competition_standby_availability", {
        target_campaign_id: campaignId,
        target_available: available
      });
      if (error) throw error;
      await loadStandby();
      setMessage(available ? "You joined standby. Every lane offer still requires your approval." : "Standby availability is off and active offers were declined.");
    } catch (error) {
      setMessage(readableError(error, "Standby availability could not be changed."));
    } finally {
      setBusy("");
    }
  }

  async function respondToOffer(offer: StandbyOffer, accept: boolean) {
    if (!supabase) return;
    setBusy(`respond-${offer.id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("respond_to_talent7_competition_standby_offer", {
        target_offer_id: offer.id,
        target_accept: accept
      });
      if (error) throw error;
      await loadStandby();
      setMessage(accept ? `Lane ${offer.lane_number} is yours. Check your private heat desk for the assignment.` : "The offer was declined. Your original competition registration is unchanged.");
    } catch (error) {
      setMessage(readableError(error, "The standby response could not be saved."));
      await loadStandby();
    } finally {
      setBusy("");
    }
  }

  async function offerNext(vacancy: StandbyVacancy, minutes: number) {
    if (!supabase) return;
    setBusy(`offer-${vacancy.entry_id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("offer_next_talent7_competition_standby", {
        target_source_entry_id: vacancy.entry_id,
        target_expiry_minutes: minutes
      });
      if (error) throw error;
      await loadStandby();
      setMessage(`The earliest eligible standby member has ${minutes} minutes to accept lane ${vacancy.lane_number}.`);
    } catch (error) {
      setMessage(readableError(error, "A standby offer could not be created."));
    } finally {
      setBusy("");
    }
  }

  const activeOffers = myState.offers.filter((offer) => offer.status === "Offered");

  if (!signedIn && !isAdmin) return null;

  return (
    <section className="competitionStandbySection" aria-label="Competition standby and no-show replacement">
      {message && <p className="standbyMessage" role="status">{message}</p>}

      {signedIn && myState.registered && (
        <div className="participantStandbyCard">
          <div>
            <span>Optional standby queue</span>
            <h3>Step into an open lane without losing control.</h3>
            <p>Opting in only makes you eligible. If a confirmed competitor is marked as a no-show, you receive a private, expiring offer and must accept it yourself.</p>
          </div>
          <button className={myState.available ? "active" : ""} disabled={busy === "availability"} onClick={() => setAvailability(!myState.available)} type="button">
            {busy === "availability" ? "Saving..." : myState.available ? "Leave standby" : "Join standby"}
          </button>
          <small>{myState.available ? "Available for the next eligible unfilled lane" : "No automatic assignment and no penalty for staying unavailable"}</small>
        </div>
      )}

      {activeOffers.length > 0 && (
        <div className="myStandbyOffers">
          <div><span>Action required</span><h3>A tournament lane is waiting for you.</h3></div>
          {activeOffers.map((offer) => (
            <article key={offer.id}>
              <div>
                <span>Cohort {offer.cohort_number} / {offer.round_name}</span>
                <strong>Heat {offer.heat_number} / Stage {offer.stage_number} / Lane {offer.lane_number}</strong>
                {offer.scheduled_start && <small>{formatDate(offer.scheduled_start)} / {offer.duration_seconds}s clock</small>}
                <em>Offer closes {formatDate(offer.expires_at)}</em>
              </div>
              <div>
                <button disabled={busy === `respond-${offer.id}`} onClick={() => respondToOffer(offer, true)} type="button">Accept lane</button>
                <button className="secondary" disabled={busy === `respond-${offer.id}`} onClick={() => respondToOffer(offer, false)} type="button">Decline</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {isAdmin && signedIn && (
        <details className="organizerStandbyDesk" open>
          <summary><span>Standby recovery desk</span><strong>{adminState.candidate_count} available / {adminState.vacancies.length} open lanes</strong></summary>
          <div className="organizerStandbyBody">
            <p>Only pre-start qualifier lanes explicitly marked “No show” appear here. Later rounds remain qualification-based. Talent7 always offers the lane to the earliest eligible opted-in member.</p>
            <div className="standbyVacancyList">
              {adminState.vacancies.map((vacancy) => (
                <article key={vacancy.entry_id}>
                  <div><span>C{vacancy.cohort_number} / {vacancy.round_name}</span><strong>Heat {vacancy.heat_number}, lane {vacancy.lane_number}</strong><small>{vacancy.display_name} / {formatDate(vacancy.scheduled_start)}</small></div>
                  <button disabled={busy === `offer-${vacancy.entry_id}` || adminState.candidate_count === 0} onClick={() => offerNext(vacancy, 15)} type="button">
                    {busy === `offer-${vacancy.entry_id}` ? "Offering..." : "Offer next standby"}
                  </button>
                </article>
              ))}
              {adminState.vacancies.length === 0 && <div className="standbyEmpty">No eligible no-show lanes need replacement.</div>}
            </div>

            {adminState.offers.length > 0 && (
              <div className="standbyOfferLedger">
                <span>Recent private offer ledger</span>
                {adminState.offers.map((offer) => (
                  <div key={offer.id}><strong>{offer.candidate_name}</strong><small>C{offer.cohort_number} / {offer.round_name} / Heat {offer.heat_number} / Lane {offer.lane_number}</small><b className={`status-${offer.status.toLowerCase()}`}>{offer.status}</b></div>
                ))}
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
