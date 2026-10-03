"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type CompetitionPhase =
  | "Activity vote"
  | "Day vote"
  | "Time vote"
  | "Registration"
  | "Scheduled"
  | "Live"
  | "Review";

type CompetitionCampaign = {
  id: string;
  title: string;
  summary: string;
  phase: CompetitionPhase;
  capacity_per_cohort: number;
  registration_count: number;
  selected_activity_option_id: string | null;
  vote_closes_at: string | null;
  scheduled_start: string | null;
  prize_summary: string;
  eligibility_note: string;
  review_policy: string;
};

type CompetitionOption = {
  id: string;
  activity: string;
  pitch: string;
  option_kind: "Official" | "Community";
  proposer_name: string | null;
  vote_count: number;
};

type ScheduleOption = {
  id: string;
  phase: "Day vote" | "Time vote";
  label: string;
  proposed_start: string | null;
  vote_count: number;
  sort_order: number;
};

type CompetitionRegistration = {
  id: string;
  public_anonymous: boolean;
  shipping_region: string;
  cohort_number: number;
  slot_number: number;
  registration_code: string;
  status: string;
};

type CompetitionState = {
  activity_option_id: string | null;
  day_option_id: string | null;
  time_option_id: string | null;
  registration: CompetitionRegistration | null;
};

type OrganizerNomination = CompetitionOption & {
  created_at: string;
};

type OrganizerRegistration = CompetitionRegistration & {
  display_name: string;
  created_at: string;
};

type OrganizerAction = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
};

type OrganizerState = {
  pending_nominations: OrganizerNomination[];
  registrations: OrganizerRegistration[];
  selected_day_option_id: string | null;
  selected_time_option_id: string | null;
  recent_actions: OrganizerAction[];
};

const previewCampaign: CompetitionCampaign = {
  id: "preview-community-competition",
  title: "Choose the first Talent7 community competition",
  summary: "The community chooses the activity, then the day and time. Every 100 competitors form another cohort, so demand never closes the door.",
  phase: "Activity vote",
  capacity_per_cohort: 100,
  registration_count: 0,
  selected_activity_option_id: null,
  vote_closes_at: null,
  scheduled_start: null,
  prize_summary: "The final prize and eligible shipping regions will be announced before confirmation. Every eligible finisher can receive a digital certificate.",
  eligibility_note: "Interest registration is free. Physical prizes are limited to the published shipping regions; equivalent alternatives may be used where delivery is not practical.",
  review_policy: "Results remain provisional until the organizer reviews the required proof."
};

const previewOptions: CompetitionOption[] = [
  {
    id: "preview-push-ups",
    activity: "60-second push-up challenge",
    pitch: "A simple one-minute strength event with clear form rules and organizer review.",
    option_kind: "Official",
    proposer_name: null,
    vote_count: 0
  },
  {
    id: "preview-squats",
    activity: "60-second bodyweight squat challenge",
    pitch: "A highly accessible one-minute endurance event that needs no equipment.",
    option_kind: "Official",
    proposer_name: null,
    vote_count: 0
  },
  {
    id: "preview-plank",
    activity: "Strict plank endurance",
    pitch: "A controlled hold challenge with a simple clock and a clear legal body position.",
    option_kind: "Official",
    proposer_name: null,
    vote_count: 0
  },
  {
    id: "preview-burpees",
    activity: "60-second burpee sprint",
    pitch: "A fast full-body event built for dramatic live finishes and easy heats.",
    option_kind: "Official",
    proposer_name: null,
    vote_count: 0
  },
  {
    id: "preview-jump-rope",
    activity: "Jump-rope sprint",
    pitch: "A high-energy coordination event that works well in short recorded or live rounds.",
    option_kind: "Official",
    proposer_name: null,
    vote_count: 0
  }
];

const phaseSteps = ["Activity vote", "Day vote", "Time vote", "Registration", "Scheduled"] as const;

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function formatDate(value: string | null) {
  if (!value) return "To be announced";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function datetimeLocalValue(value?: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 48 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function CompetitionOrganizerConsole({
  campaign,
  options,
  scheduleOptions,
  onChanged
}: {
  campaign: CompetitionCampaign;
  options: CompetitionOption[];
  scheduleOptions: ScheduleOption[];
  onChanged: () => Promise<void>;
}) {
  const [organizerState, setOrganizerState] = useState<OrganizerState>({
    pending_nominations: [],
    registrations: [],
    selected_day_option_id: null,
    selected_time_option_id: null,
    recent_actions: []
  });
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");

  const loadOrganizerState = useCallback(async () => {
    if (!supabase || campaign.id.startsWith("preview-")) return;
    const { data, error } = await supabase.rpc("get_talent7_competition_organizer_state", {
      target_campaign_id: campaign.id
    });
    if (!error && data) setOrganizerState(data as OrganizerState);
  }, [campaign.id]);

  useEffect(() => {
    void loadOrganizerState();
  }, [loadOrganizerState, campaign.phase, campaign.registration_count]);

  async function finishAction(successMessage: string) {
    await onChanged();
    await loadOrganizerState();
    setMessage(successMessage);
  }

  async function reviewNomination(optionId: string, decision: "Approved" | "Rejected") {
    if (!supabase) return;
    setBusyAction(`nomination-${optionId}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("review_talent7_competition_nomination", {
        target_option_id: optionId,
        target_decision: decision
      });
      if (error) throw error;
      await finishAction(`Nomination ${decision.toLowerCase()}.`);
    } catch (error) {
      setMessage(readableError(error, "The nomination could not be reviewed."));
    } finally {
      setBusyAction("");
    }
  }

  async function saveScheduleOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const phase = String(data.get("phase") || "Day vote");
    const label = String(data.get("label") || "").trim();
    const proposedStart = String(data.get("proposedStart") || "");
    setBusyAction("schedule-option");
    setMessage("");
    try {
      const { error } = await supabase.rpc("save_talent7_competition_schedule_option", {
        target_campaign_id: campaign.id,
        target_phase: phase,
        target_label: label,
        target_proposed_start: proposedStart ? new Date(proposedStart).toISOString() : null
      });
      if (error) throw error;
      form.reset();
      await finishAction(`${phase} choice saved.`);
    } catch (error) {
      setMessage(readableError(error, "The schedule choice could not be saved."));
    } finally {
      setBusyAction("");
    }
  }

  async function removeScheduleOption(optionId: string) {
    if (!supabase) return;
    setBusyAction(`remove-${optionId}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("remove_talent7_competition_schedule_option", {
        target_option_id: optionId
      });
      if (error) throw error;
      await finishAction("Schedule choice removed.");
    } catch (error) {
      setMessage(readableError(error, "The schedule choice could not be removed."));
    } finally {
      setBusyAction("");
    }
  }

  async function advancePhase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    const nextPhase = String(data.get("nextPhase") || "");
    const winner = String(data.get("winner") || "");
    const voteClosesAt = String(data.get("voteClosesAt") || "");
    const scheduledStart = String(data.get("scheduledStart") || "");
    setBusyAction("advance");
    setMessage("");
    try {
      const { error } = await supabase.rpc("advance_talent7_competition_phase", {
        target_campaign_id: campaign.id,
        target_next_phase: nextPhase,
        target_selected_option_id: winner || null,
        target_vote_closes_at: voteClosesAt ? new Date(voteClosesAt).toISOString() : null,
        target_scheduled_start: scheduledStart ? new Date(scheduledStart).toISOString() : null
      });
      if (error) throw error;
      await finishAction(`Competition advanced to ${nextPhase}.`);
    } catch (error) {
      setMessage(readableError(error, "The competition phase could not be advanced."));
    } finally {
      setBusyAction("");
    }
  }

  async function updateEntrantStatus(registrationId: string, status: string) {
    if (!supabase) return;
    setBusyAction(`entrant-${registrationId}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("update_talent7_competition_registration_status", {
        target_registration_id: registrationId,
        target_status: status
      });
      if (error) throw error;
      await finishAction(`Entrant marked ${status.toLowerCase()}.`);
    } catch (error) {
      setMessage(readableError(error, "The entrant status could not be updated."));
    } finally {
      setBusyAction("");
    }
  }

  const phasePlan = (() => {
    if (campaign.phase === "Activity vote") return {
      nextPhase: "Day vote",
      button: "Lock activity and open day vote",
      choices: options,
      winnerLabel: "Winning activity",
      needsVoteDeadline: true,
      needsScheduledStart: false
    };
    if (campaign.phase === "Day vote") return {
      nextPhase: "Time vote",
      button: "Lock day and open time vote",
      choices: scheduleOptions.filter((option) => option.phase === "Day vote"),
      winnerLabel: "Winning day",
      needsVoteDeadline: true,
      needsScheduledStart: false
    };
    if (campaign.phase === "Time vote") return {
      nextPhase: "Registration",
      button: "Lock time and open confirmation",
      choices: scheduleOptions.filter((option) => option.phase === "Time vote"),
      winnerLabel: "Winning time",
      needsVoteDeadline: false,
      needsScheduledStart: true
    };
    if (campaign.phase === "Registration") return {
      nextPhase: "Scheduled",
      button: "Publish final schedule",
      choices: [],
      winnerLabel: "",
      needsVoteDeadline: false,
      needsScheduledStart: true
    };
    if (campaign.phase === "Scheduled") return {
      nextPhase: "Live",
      button: "Mark competition live",
      choices: [],
      winnerLabel: "",
      needsVoteDeadline: false,
      needsScheduledStart: false
    };
    if (campaign.phase === "Live") return {
      nextPhase: "Review",
      button: "Close event for review",
      choices: [],
      winnerLabel: "",
      needsVoteDeadline: false,
      needsScheduledStart: false
    };
    if (campaign.phase === "Review") return {
      nextPhase: "Completed",
      button: "Complete reviewed event",
      choices: [],
      winnerLabel: "",
      needsVoteDeadline: false,
      needsScheduledStart: false
    };
    return null;
  })();

  const cohortCount = Math.max(1, Math.ceil(campaign.registration_count / campaign.capacity_per_cohort));

  return (
    <details className="competitionOrganizerConsole" open>
      <summary>
        <span>Private organizer control</span>
        <strong>{campaign.phase} / {organizerState.pending_nominations.length} pending nominations</strong>
      </summary>
      <div className="competitionOrganizerBody">
        {message && <p className="organizerMessage" role="status">{message}</p>}

        <div className="organizerStats">
          <article><span>Entrants</span><strong>{campaign.registration_count}</strong></article>
          <article><span>Cohorts</span><strong>{cohortCount}</strong></article>
          <article><span>Pending ideas</span><strong>{organizerState.pending_nominations.length}</strong></article>
          <article><span>Current phase</span><strong>{campaign.phase}</strong></article>
        </div>

        <div className="organizerControlGrid">
          <section>
            <div className="organizerPanelHeader">
              <div><span>Phase control</span><h3>Move the event forward</h3></div>
              <small>Changes are audited and cannot skip a phase.</small>
            </div>
            {phasePlan ? (
              <form className="organizerPhaseForm" onSubmit={advancePhase}>
                <input name="nextPhase" type="hidden" value={phasePlan.nextPhase} />
                {phasePlan.choices.length > 0 && (
                  <label>
                    {phasePlan.winnerLabel}
                    <select name="winner" required>
                      <option value="">Select the verified winner</option>
                      {phasePlan.choices.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {"activity" in choice ? choice.activity : choice.label} ({choice.vote_count} votes)
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {phasePlan.needsVoteDeadline && (
                  <label>
                    Next vote closes
                    <input defaultValue={datetimeLocalValue()} name="voteClosesAt" required type="datetime-local" />
                  </label>
                )}
                {phasePlan.needsScheduledStart && (
                  <label>
                    Final event date and time
                    <input defaultValue={datetimeLocalValue(campaign.scheduled_start)} name="scheduledStart" required type="datetime-local" />
                  </label>
                )}
                <button disabled={busyAction === "advance"} type="submit">
                  {busyAction === "advance" ? "Updating phase..." : phasePlan.button}
                </button>
              </form>
            ) : (
              <p className="competitionEmpty">No further public phase is available.</p>
            )}
          </section>

          <section>
            <div className="organizerPanelHeader">
              <div><span>Ballot builder</span><h3>Add day and time choices</h3></div>
              <small>Create choices before opening their vote.</small>
            </div>
            <form className="organizerScheduleForm" onSubmit={saveScheduleOption}>
              <label>
                Ballot
                <select name="phase"><option>Day vote</option><option>Time vote</option></select>
              </label>
              <label>
                Public label
                <input maxLength={80} name="label" placeholder="Saturday, 24 October" required />
              </label>
              <label>
                Proposed date/time (optional)
                <input name="proposedStart" type="datetime-local" />
              </label>
              <button disabled={busyAction === "schedule-option"} type="submit">
                {busyAction === "schedule-option" ? "Saving..." : "Add ballot choice"}
              </button>
            </form>
            <div className="organizerScheduleOptions">
              {scheduleOptions.map((option) => (
                <article key={option.id}>
                  <span>{option.phase}</span>
                  <strong>{option.label}</strong>
                  <small>{option.vote_count} votes{option.proposed_start ? ` / ${formatDate(option.proposed_start)}` : ""}</small>
                  <button
                    disabled={option.vote_count > 0 || busyAction === `remove-${option.id}`}
                    onClick={() => removeScheduleOption(option.id)}
                    type="button"
                  >
                    {busyAction === `remove-${option.id}` ? "Removing..." : option.vote_count > 0 ? "Has votes" : "Remove"}
                  </button>
                </article>
              ))}
              {scheduleOptions.length === 0 && <small>No day or time choices yet.</small>}
            </div>
          </section>
        </div>

        <section className="organizerQueueSection">
          <div className="organizerPanelHeader">
            <div><span>Moderation</span><h3>Community nominations</h3></div>
            <small>Approve only activities with clear, safe, feasible rules.</small>
          </div>
          <div className="organizerNominationQueue">
            {organizerState.pending_nominations.map((nomination) => (
              <article key={nomination.id}>
                <div><strong>{nomination.activity}</strong><small>{nomination.pitch}</small><em>Suggested by {nomination.proposer_name || "Talent7 member"}</em></div>
                <div>
                  <button disabled={busyAction === `nomination-${nomination.id}`} onClick={() => reviewNomination(nomination.id, "Approved")} type="button">Approve</button>
                  <button className="secondary" disabled={busyAction === `nomination-${nomination.id}`} onClick={() => reviewNomination(nomination.id, "Rejected")} type="button">Reject</button>
                </div>
              </article>
            ))}
            {organizerState.pending_nominations.length === 0 && <p className="competitionEmpty">No nominations need review.</p>}
          </div>
        </section>

        <section className="organizerQueueSection">
          <div className="organizerPanelHeader">
            <div><span>Private roster</span><h3>Entrants by cohort</h3></div>
            <small>Real names and codes stay inside this organizer view.</small>
          </div>
          <div className="organizerRoster">
            {organizerState.registrations.map((registration) => (
              <article key={registration.id}>
                <div>
                  <span>C{registration.cohort_number} / {registration.slot_number}</span>
                  <strong>{registration.display_name}</strong>
                  <small>{registration.public_anonymous ? "Public alias enabled" : "Public profile"} / {registration.shipping_region}</small>
                </div>
                <code>{registration.registration_code}</code>
                <select
                  aria-label={`Status for ${registration.display_name}`}
                  disabled={busyAction === `entrant-${registration.id}`}
                  onChange={(event) => updateEntrantStatus(registration.id, event.target.value)}
                  value={registration.status}
                >
                  <option>Interested</option><option>Confirmed</option><option>Disqualified</option><option>Completed</option>
                </select>
              </article>
            ))}
            {organizerState.registrations.length === 0 && <p className="competitionEmpty">No one has registered yet.</p>}
          </div>
        </section>

        <section className="organizerAuditSection">
          <div className="organizerPanelHeader">
            <div><span>Audit trail</span><h3>Recent organizer actions</h3></div>
          </div>
          <ol>
            {organizerState.recent_actions.map((action) => (
              <li key={action.id}><strong>{action.action}</strong><span>{formatDate(action.created_at)}</span></li>
            ))}
            {organizerState.recent_actions.length === 0 && <li><span>No organizer actions recorded yet.</span></li>}
          </ol>
        </section>
      </div>
    </details>
  );
}

export default function CommunityCompetitionLaunchpad({
  userId,
  displayName,
  region,
  isAdmin
}: {
  userId: string;
  displayName: string;
  region: string;
  isAdmin: boolean;
}) {
  const [campaign, setCampaign] = useState<CompetitionCampaign>(previewCampaign);
  const [options, setOptions] = useState<CompetitionOption[]>(previewOptions);
  const [scheduleOptions, setScheduleOptions] = useState<ScheduleOption[]>([]);
  const [myState, setMyState] = useState<CompetitionState>({
    activity_option_id: null,
    day_option_id: null,
    time_option_id: null,
    registration: null
  });
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [loadWarning, setLoadWarning] = useState("");

  const loadCompetition = useCallback(async () => {
    if (!supabase) {
      setCampaign(previewCampaign);
      setOptions(previewOptions);
      return;
    }

    const campaignResult = await supabase
      .from("talent7_competition_campaigns")
      .select("id,title,summary,phase,capacity_per_cohort,registration_count,selected_activity_option_id,vote_closes_at,scheduled_start,prize_summary,eligibility_note,review_policy")
      .not("phase", "in", "(Draft,Completed,Cancelled)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (campaignResult.error || !campaignResult.data) {
      setCampaign(previewCampaign);
      setOptions(previewOptions);
      setScheduleOptions([]);
      setLoadWarning("Community competition voting is in preview mode until the latest Supabase migration is applied.");
      return;
    }

    const liveCampaign = campaignResult.data as CompetitionCampaign;
    setCampaign(liveCampaign);
    setLoadWarning("");

    const [optionResult, scheduleResult] = await Promise.all([
      supabase
        .from("talent7_competition_options")
        .select("id,activity,pitch,option_kind,proposer_name,vote_count")
        .eq("campaign_id", liveCampaign.id)
        .eq("moderation_status", "Approved")
        .order("vote_count", { ascending: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("talent7_competition_schedule_options")
        .select("id,phase,label,proposed_start,vote_count,sort_order")
        .eq("campaign_id", liveCampaign.id)
        .eq("status", "Active")
        .order("sort_order", { ascending: true })
    ]);

    if (!optionResult.error) setOptions((optionResult.data || []) as CompetitionOption[]);
    if (!scheduleResult.error) setScheduleOptions((scheduleResult.data || []) as ScheduleOption[]);

    if (!userId) {
      setMyState({ activity_option_id: null, day_option_id: null, time_option_id: null, registration: null });
      return;
    }

    const stateResult = await supabase.rpc("get_my_talent7_competition_state", {
      target_campaign_id: liveCampaign.id
    });
    if (!stateResult.error && stateResult.data) setMyState(stateResult.data as CompetitionState);
  }, [userId]);

  useEffect(() => {
    void loadCompetition();
  }, [loadCompetition]);

  const phaseIndex = Math.max(0, phaseSteps.indexOf(campaign.phase as (typeof phaseSteps)[number]));
  const cohortCount = Math.max(1, Math.ceil(campaign.registration_count / campaign.capacity_per_cohort));
  const totalActivityVotes = useMemo(
    () => options.reduce((sum, option) => sum + Number(option.vote_count || 0), 0),
    [options]
  );
  const activeScheduleOptions = scheduleOptions.filter((option) => option.phase === campaign.phase);
  const selectedActivity = options.find((option) => option.id === campaign.selected_activity_option_id);

  async function voteForActivity(optionId: string) {
    if (!userId) {
      setMessage("Log in to vote for the next competition.");
      return;
    }
    if (!supabase || campaign.id.startsWith("preview-")) {
      setMyState((current) => ({ ...current, activity_option_id: optionId }));
      setOptions((items) => items.map((item) => ({
        ...item,
        vote_count: item.id === optionId
          ? item.vote_count + (myState.activity_option_id === optionId ? 0 : 1)
          : item.id === myState.activity_option_id
            ? Math.max(0, item.vote_count - 1)
            : item.vote_count
      })));
      setMessage("Preview vote selected. Apply the Supabase migration to save real votes.");
      return;
    }

    setBusyAction(`activity-${optionId}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("vote_talent7_competition_activity", {
        target_campaign_id: campaign.id,
        target_option_id: optionId
      });
      if (error) throw error;
      await loadCompetition();
      setMessage("Your activity vote is saved. You can change it while voting remains open.");
    } catch (error) {
      setMessage(readableError(error, "The vote could not be saved."));
    } finally {
      setBusyAction("");
    }
  }

  async function nominateActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!userId) {
      setMessage("Log in to nominate a competition.");
      return;
    }
    const data = new FormData(form);
    const activity = String(data.get("activity") || "").trim();
    const pitch = String(data.get("pitch") || "").trim();
    setBusyAction("nominate");
    setMessage("");
    try {
      if (!supabase || campaign.id.startsWith("preview-")) {
        setMessage("Preview nomination received. Apply the Supabase migration to send it for moderation.");
      } else {
        const { error } = await supabase.rpc("nominate_talent7_competition_activity", {
          target_campaign_id: campaign.id,
          target_activity: activity,
          target_pitch: pitch
        });
        if (error) throw error;
        setMessage("Nomination received. It will appear publicly after a safety and feasibility review.");
      }
      form.reset();
    } catch (error) {
      setMessage(readableError(error, "The nomination could not be sent."));
    } finally {
      setBusyAction("");
    }
  }

  async function voteForSchedule(optionId: string) {
    if (!userId) {
      setMessage("Log in to vote for the event schedule.");
      return;
    }
    if (!supabase) return;
    setBusyAction(`schedule-${optionId}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("vote_talent7_competition_schedule", {
        target_campaign_id: campaign.id,
        target_option_id: optionId
      });
      if (error) throw error;
      await loadCompetition();
      setMessage(`Your ${campaign.phase === "Day vote" ? "day" : "time"} vote is saved.`);
    } catch (error) {
      setMessage(readableError(error, "The schedule vote could not be saved."));
    } finally {
      setBusyAction("");
    }
  }

  async function registerInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) {
      setMessage("Log in and complete your profile to reserve a free place.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const anonymous = data.get("anonymous") === "on";
    const shippingRegion = String(data.get("shippingRegion") || region || "To be confirmed").trim();
    setBusyAction("register");
    setMessage("");
    try {
      if (!supabase || campaign.id.startsWith("preview-")) {
        setMessage("Preview registration is not permanent. Apply the Supabase migration to reserve real places.");
        return;
      }
      const { error } = await supabase.rpc("register_talent7_competition_interest", {
        target_campaign_id: campaign.id,
        target_public_anonymous: anonymous,
        target_shipping_region: shippingRegion
      });
      if (error) throw error;
      await loadCompetition();
      setMessage("Your free place is reserved. Final participation is confirmed after the activity and schedule are announced.");
    } catch (error) {
      setMessage(readableError(error, "Your place could not be reserved."));
    } finally {
      setBusyAction("");
    }
  }

  async function withdrawInterest() {
    if (!supabase || !userId) return;
    setBusyAction("withdraw");
    setMessage("");
    try {
      const { error } = await supabase.rpc("withdraw_talent7_competition_interest", {
        target_campaign_id: campaign.id
      });
      if (error) throw error;
      await loadCompetition();
      setMessage("Your competition interest was withdrawn.");
    } catch (error) {
      setMessage(readableError(error, "Your registration could not be withdrawn."));
    } finally {
      setBusyAction("");
    }
  }

  return (
    <section className="section communityCompetitionSection" id="community-competition">
      <div className="communityCompetitionHero">
        <div>
          <p className="eyebrow">Built by the crowd</p>
          <h2>{campaign.title}</h2>
          <p>{campaign.summary}</p>
        </div>
        <div className="competitionDemandCard">
          <span>Early interest</span>
          <strong>{campaign.registration_count}</strong>
          <small>{cohortCount} {cohortCount === 1 ? "cohort" : "cohorts"} ready to scale</small>
        </div>
      </div>

      {loadWarning && <aside className="competitionNotice warning">{loadWarning}</aside>}
      {message && <p className="competitionNotice" role="status">{message}</p>}

      <ol className="competitionPhaseRail" aria-label="Competition planning phases">
        {phaseSteps.map((step, index) => (
          <li className={index < phaseIndex ? "complete" : index === phaseIndex ? "active" : ""} key={step}>
            <span>{index < phaseIndex ? "OK" : index + 1}</span>
            <strong>{step}</strong>
          </li>
        ))}
      </ol>

      <div className="communityCompetitionLayout">
        <div className="competitionBallot">
          {campaign.phase === "Activity vote" ? (
            <>
              <div className="competitionBlockHeader">
                <div>
                  <span>Phase one</span>
                  <h3>What should everyone compete in?</h3>
                </div>
                <small>{totalActivityVotes} {totalActivityVotes === 1 ? "vote" : "votes"} cast</small>
              </div>
              <div className="competitionOptionGrid">
                {options.map((option) => {
                  const selected = myState.activity_option_id === option.id;
                  const share = totalActivityVotes > 0 ? Math.round((option.vote_count / totalActivityVotes) * 100) : 0;
                  return (
                    <article className={selected ? "selected" : ""} key={option.id}>
                      <div className="competitionOptionMeta">
                        <span>{option.option_kind === "Community" ? "Community pick" : "Talent7 pick"}</span>
                        <strong>{share}%</strong>
                      </div>
                      <h4>{option.activity}</h4>
                      <p>{option.pitch}</p>
                      {option.option_kind === "Community" && option.proposer_name && <small>Suggested by {option.proposer_name}</small>}
                      <div className="competitionVoteBar"><span style={{ width: `${share}%` }} /></div>
                      <button
                        className={selected ? "selected" : ""}
                        disabled={busyAction === `activity-${option.id}`}
                        onClick={() => voteForActivity(option.id)}
                        type="button"
                      >
                        {selected ? "Your vote" : busyAction === `activity-${option.id}` ? "Saving..." : "Vote for this"}
                      </button>
                    </article>
                  );
                })}
              </div>

              <details className="competitionNominationPanel">
                <summary>Suggest a different competition</summary>
                <form onSubmit={nominateActivity}>
                  <label>
                    Competition idea
                    <input maxLength={80} name="activity" placeholder="For example: 2-minute skipping challenge" required />
                  </label>
                  <label>
                    Why it would work
                    <textarea maxLength={240} minLength={10} name="pitch" placeholder="Explain the rules, accessibility, and why people would want to watch." required />
                  </label>
                  <button disabled={busyAction === "nominate"} type="submit">
                    {busyAction === "nominate" ? "Sending..." : "Send for review"}
                  </button>
                  <small>Community suggestions are reviewed before appearing on the public ballot.</small>
                </form>
              </details>
            </>
          ) : campaign.phase === "Day vote" || campaign.phase === "Time vote" ? (
            <>
              <div className="competitionBlockHeader">
                <div>
                  <span>{campaign.phase === "Day vote" ? "Phase two" : "Phase three"}</span>
                  <h3>{campaign.phase === "Day vote" ? "Choose the competition day" : "Choose the start time"}</h3>
                </div>
                {selectedActivity && <small>{selectedActivity.activity}</small>}
              </div>
              <div className="competitionScheduleGrid">
                {activeScheduleOptions.map((option) => {
                  const selected = campaign.phase === "Day vote"
                    ? myState.day_option_id === option.id
                    : myState.time_option_id === option.id;
                  return (
                    <button
                      className={selected ? "selected" : ""}
                      disabled={busyAction === `schedule-${option.id}`}
                      key={option.id}
                      onClick={() => voteForSchedule(option.id)}
                      type="button"
                    >
                      <span>{option.label}</span>
                      <strong>{option.vote_count} votes</strong>
                    </button>
                  );
                })}
              </div>
              {activeScheduleOptions.length === 0 && <p className="competitionEmpty">Schedule choices are being prepared by the organizer.</p>}
            </>
          ) : (
            <div className="competitionChosenEvent">
              <span>{campaign.phase}</span>
              <h3>{selectedActivity?.activity || "Community competition"}</h3>
              <p>{campaign.scheduled_start ? `Starts ${formatDate(campaign.scheduled_start)}` : "The final start time will be announced here."}</p>
            </div>
          )}
        </div>

        <aside className="competitionRegistrationCard">
          <span className="competitionFreeBadge">Free interest registration</span>
          <h3>Reserve your place now</h3>
          <p>No paid entry and no token requirement. If more than {campaign.capacity_per_cohort} people join, Talent7 opens another cohort automatically.</p>

          <div className="competitionCapacityMeter">
            <div>
              <strong>Cohort {cohortCount}</strong>
              <span>{campaign.registration_count % campaign.capacity_per_cohort || (campaign.registration_count ? campaign.capacity_per_cohort : 0)} / {campaign.capacity_per_cohort}</span>
            </div>
            <progress max={campaign.capacity_per_cohort} value={campaign.registration_count % campaign.capacity_per_cohort || (campaign.registration_count ? campaign.capacity_per_cohort : 0)} />
          </div>

          {myState.registration ? (
            <div className="competitionTicket">
              <small>{myState.registration.public_anonymous ? "Publicly anonymous competitor" : displayName || "Registered competitor"}</small>
              <strong>Cohort {myState.registration.cohort_number} / Slot {myState.registration.slot_number}</strong>
              <code>{myState.registration.registration_code}</code>
              <p>Keep this private code. It identifies your registration when final confirmation opens.</p>
              <button className="textButton" disabled={busyAction === "withdraw"} onClick={withdrawInterest} type="button">
                {busyAction === "withdraw" ? "Withdrawing..." : "Withdraw interest"}
              </button>
            </div>
          ) : (
            <form className="competitionRegistrationForm" onSubmit={registerInterest}>
              <label>
                Prize shipping region
                <input defaultValue={region || ""} maxLength={80} name="shippingRegion" placeholder="State and country" required />
              </label>
              <label className="competitionAnonymousChoice">
                <input name="anonymous" type="checkbox" />
                <span>
                  <strong>Compete with a public alias</strong>
                  <small>Other members will not see your profile name, but authorized organizers can still verify you.</small>
                </span>
              </label>
              <button disabled={busyAction === "register"} type="submit">
                {busyAction === "register" ? "Reserving..." : userId ? "Reserve free place" : "Log in to reserve"}
              </button>
            </form>
          )}

          <div className="competitionDeadline">
            <span>{campaign.phase === "Activity vote" ? "Current vote closes" : "Scheduled start"}</span>
            <strong>{formatDate(campaign.phase === "Activity vote" ? campaign.vote_closes_at : campaign.scheduled_start)}</strong>
          </div>
        </aside>
      </div>

      <div className="competitionTrustGrid">
        <article>
          <span>01</span>
          <strong>Prizes motivate; they do not set entry price</strong>
          <p>{campaign.prize_summary}</p>
        </article>
        <article>
          <span>02</span>
          <strong>Shipping is confirmed before commitment</strong>
          <p>{campaign.eligibility_note}</p>
        </article>
        <article>
          <span>03</span>
          <strong>Organizer review protects the result</strong>
          <p>{campaign.review_policy}</p>
        </article>
      </div>

      {isAdmin && !campaign.id.startsWith("preview-") && (
        <CompetitionOrganizerConsole
          campaign={campaign}
          onChanged={loadCompetition}
          options={options}
          scheduleOptions={scheduleOptions}
        />
      )}
    </section>
  );
}
