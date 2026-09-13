"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

type Club = {
  id: string;
  owner_user_id: string;
  name: string;
  club_type: string;
  main_activity: string;
  region: string;
  description: string;
  status: "Active" | "Paused" | "Closed";
  share_token: string;
  created_at: string;
};

type ClubMember = {
  id: string;
  club_id: string;
  user_id: string;
  display_name: string;
  role: "Owner" | "Manager" | "Scout" | "Member";
  joined_at: string;
};

type ClubShortlist = {
  id: string;
  club_id: string;
  profile_user_id: string;
  added_by: string;
  created_at: string;
};

type ClubInvitation = {
  id: string;
  club_id: string;
  target_user_id: string;
  sent_by: string;
  target_name: string;
  proposed_role: "Manager" | "Scout" | "Member";
  message: string;
  status: "Pending" | "Accepted" | "Declined" | "Withdrawn";
  created_at: string;
};

type ScoutProfile = {
  user_id: string;
  display_name: string;
  username: string;
  main_interest: string;
  region: string;
  scouting_open: boolean;
  scouting_note: string;
  share_token: string | null;
};

type RankProfile = {
  user_id: string;
  tier: string;
  rank_points: number;
  wins: number;
  completed_count: number;
};

const officialRoles = new Set(["Owner", "Manager", "Scout"]);

function formatClubDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export default function ClubsScouting({ activities, currentUserId }: { activities: string[]; currentUserId: string }) {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [shortlists, setShortlists] = useState<ClubShortlist[]>([]);
  const [invitations, setInvitations] = useState<ClubInvitation[]>([]);
  const [profiles, setProfiles] = useState<ScoutProfile[]>([]);
  const [ranks, setRanks] = useState<RankProfile[]>([]);
  const [tab, setTab] = useState<"Clubs" | "Scout" | "Invitations">("Clubs");
  const [selectedClubId, setSelectedClubId] = useState("");
  const [scoutSearch, setScoutSearch] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadClubNetwork = useCallback(async () => {
    if (!supabase || !currentUserId) {
      setLoading(false);
      return;
    }
    const [clubResult, memberResult, shortlistResult, inviteResult, profileResult, rankResult] = await Promise.all([
      supabase.from("talent_clubs").select("*").order("created_at", { ascending: false }),
      supabase.from("talent_club_members").select("*").order("joined_at"),
      supabase.from("talent_club_shortlists").select("*").order("created_at", { ascending: false }),
      supabase.from("talent_club_invitations").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id,display_name,username,main_interest,region,scouting_open,scouting_note,share_token").eq("scouting_open", true),
      supabase.from("talent7_rank_profiles").select("user_id,tier,rank_points,wins,completed_count").order("rank_points", { ascending: false }).limit(1000)
    ]);
    const error = clubResult.error || memberResult.error || shortlistResult.error || inviteResult.error || profileResult.error || rankResult.error;
    if (error) {
      setLoadError(error.message.includes("talent_club") || error.message.includes("scouting_open")
        ? "Clubs and scouting are waiting for the latest Supabase migration."
        : error.message);
    } else {
      setClubs((clubResult.data || []) as Club[]);
      setMembers((memberResult.data || []) as ClubMember[]);
      setShortlists((shortlistResult.data || []) as ClubShortlist[]);
      setInvitations((inviteResult.data || []) as ClubInvitation[]);
      setProfiles((profileResult.data || []) as ScoutProfile[]);
      setRanks((rankResult.data || []) as RankProfile[]);
      setLoadError("");
    }
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => { void loadClubNetwork(); }, [loadClubNetwork]);

  useEffect(() => {
    if (!supabase || !currentUserId) return;
    const refresh = () => void loadClubNetwork();
    const channel = supabase
      .channel("talent7-club-network")
      .on("postgres_changes", { event: "*", schema: "public", table: "talent_clubs" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "talent_club_members" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "talent_club_shortlists" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "talent_club_invitations" }, refresh)
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [currentUserId, loadClubNetwork]);

  const myMemberships = useMemo(() => members.filter((member) => member.user_id === currentUserId), [currentUserId, members]);
  const officialClubIds = useMemo(() => new Set(myMemberships.filter((member) => officialRoles.has(member.role)).map((member) => member.club_id)), [myMemberships]);
  const officialClubs = useMemo(() => clubs.filter((club) => officialClubIds.has(club.id)), [clubs, officialClubIds]);
  const selectedClub = clubs.find((club) => club.id === selectedClubId) || officialClubs[0] || clubs[0] || null;
  const scoutingClub = officialClubs.find((club) => club.id === selectedClubId) || officialClubs[0] || null;
  const selectedMembers = members.filter((member) => member.club_id === selectedClub?.id);
  const selectedShortlist = new Set(shortlists.filter((item) => item.club_id === scoutingClub?.id).map((item) => item.profile_user_id));
  const incomingInvitations = invitations.filter((invitation) => invitation.target_user_id === currentUserId);
  const outgoingInvitations = invitations.filter((invitation) => officialClubIds.has(invitation.club_id));

  useEffect(() => {
    if (selectedClubId || clubs.length === 0) return;
    const sharedClubId = new URLSearchParams(window.location.search).get("club");
    const preferred = clubs.find((club) => club.id === sharedClubId) || officialClubs[0] || clubs[0];
    setSelectedClubId(preferred.id);
  }, [clubs, officialClubs, selectedClubId]);

  const bestRankByUser = useMemo(() => {
    const result = new Map<string, RankProfile>();
    ranks.forEach((rank) => {
      if (!result.has(rank.user_id) || (result.get(rank.user_id)?.rank_points || 0) < rank.rank_points) result.set(rank.user_id, rank);
    });
    return result;
  }, [ranks]);

  const visibleScoutingProfiles = useMemo(() => {
    const search = scoutSearch.trim().toLowerCase();
    return profiles
      .filter((profile) => profile.user_id !== currentUserId)
      .filter((profile) => !search || [profile.display_name, profile.username, profile.main_interest, profile.region, profile.scouting_note].join(" ").toLowerCase().includes(search))
      .sort((first, second) => {
        const firstMatch = Number(first.main_interest.toLowerCase() === scoutingClub?.main_activity.toLowerCase()) * 2 + Number(first.region.toLowerCase() === scoutingClub?.region.toLowerCase());
        const secondMatch = Number(second.main_interest.toLowerCase() === scoutingClub?.main_activity.toLowerCase()) * 2 + Number(second.region.toLowerCase() === scoutingClub?.region.toLowerCase());
        return secondMatch - firstMatch || (bestRankByUser.get(second.user_id)?.rank_points || 0) - (bestRankByUser.get(first.user_id)?.rank_points || 0);
      });
  }, [bestRankByUser, currentUserId, profiles, scoutSearch, scoutingClub]);

  async function runAction(key: string, action: (client: NonNullable<typeof supabase>) => PromiseLike<{ error: { message: string } | null }>, success: string) {
    if (!supabase) return false;
    setBusyAction(key);
    setMessage("");
    const { error } = await action(supabase);
    if (error) setMessage(error.message);
    else {
      setMessage(success);
      await loadClubNetwork();
    }
    setBusyAction("");
    return !error;
  }

  async function createClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusyAction("create-club");
    setMessage("");
    const { data, error } = await supabase.rpc("create_talent7_club", {
      target_name: String(form.get("name") || ""),
      target_club_type: String(form.get("club_type") || "Sports club"),
      target_activity: String(form.get("activity") || ""),
      target_region: String(form.get("region") || ""),
      target_description: String(form.get("description") || "")
    });
    if (error) setMessage(error.message);
    else {
      setMessage("Club created. You can now build a private shortlist and invite people.");
      setSelectedClubId(String(data || ""));
      formElement.reset();
      await loadClubNetwork();
    }
    setBusyAction("");
  }

  async function toggleShortlist(profile: ScoutProfile) {
    if (!scoutingClub) return;
    const shortlisted = selectedShortlist.has(profile.user_id);
    await runAction(
      `shortlist-${profile.user_id}`,
      (client) => client.rpc(shortlisted ? "remove_talent7_club_shortlist" : "add_talent7_club_shortlist", {
        target_club_id: scoutingClub.id,
        target_profile_user_id: profile.user_id
      }),
      shortlisted ? `${profile.display_name} removed from the private shortlist.` : `${profile.display_name} added to the private shortlist.`
    );
  }

  async function sendInvitation(event: FormEvent<HTMLFormElement>, profile: ScoutProfile) {
    event.preventDefault();
    if (!scoutingClub) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await runAction(
      `invite-${profile.user_id}`,
      (client) => client.rpc("send_talent7_club_invitation", {
        target_club_id: scoutingClub.id,
        target_profile_user_id: profile.user_id,
        target_role: String(form.get("role") || "Member"),
        target_message: String(form.get("message") || "")
      }),
      `Invitation sent to ${profile.display_name}. They must accept before joining.`
    );
    if (saved) formElement.reset();
  }

  async function respondToInvitation(invitation: ClubInvitation, accept: boolean) {
    await runAction(
      `respond-${invitation.id}`,
      (client) => client.rpc("respond_talent7_club_invitation", { target_invitation_id: invitation.id, accept_invitation: accept }),
      accept ? "Club invitation accepted. Your membership is now active." : "Club invitation declined."
    );
  }

  async function withdrawInvitation(invitation: ClubInvitation) {
    await runAction(
      `withdraw-${invitation.id}`,
      (client) => client.rpc("withdraw_talent7_club_invitation", { target_invitation_id: invitation.id }),
      "Club invitation withdrawn."
    );
  }

  async function shareClub(club: Club) {
    const url = `${window.location.origin}${window.location.pathname}?club=${club.id}#teams`;
    const shareData = { title: `${club.name} on Talent7`, text: `Explore ${club.name}, a ${club.main_activity} club on Talent7.`, url };
    if (navigator.share) {
      await navigator.share(shareData).catch(() => null);
      return;
    }
    await navigator.clipboard.writeText(`${shareData.text}\n${url}`);
    setMessage("Club link copied.");
  }

  function clubName(clubId: string) {
    return clubs.find((club) => club.id === clubId)?.name || "Talent7 club";
  }

  if (!currentUserId) {
    return (
      <section className="clubsScouting clubsScoutingLocked">
        <div><span>Clubs & scouting</span><h2>Build the organization behind the talent.</h2><p>Sign in to discover clubs, choose whether scouts can find you, and review invitations.</p></div>
        <Link href="#account">Sign in to continue</Link>
      </section>
    );
  }

  return (
    <section className="clubsScouting">
      <header className="clubsScoutingHeader">
        <div><span>Club network</span><h2>Shortlist potential. Recruit with consent.</h2><p>Clubs bring organizers, scouts, and competitors together without assigning anyone a role they did not accept.</p></div>
        <div className="clubNetworkStats"><article><strong>{clubs.length}</strong><small>clubs</small></article><article><strong>{profiles.length}</strong><small>open to scouts</small></article><article><strong>{incomingInvitations.filter((item) => item.status === "Pending").length}</strong><small>your invitations</small></article></div>
      </header>

      <nav className="clubStudioTabs" aria-label="Clubs and scouting views">
        <button className={tab === "Clubs" ? "active" : ""} onClick={() => setTab("Clubs")} type="button">Club network</button>
        <button className={tab === "Scout" ? "active" : ""} onClick={() => setTab("Scout")} type="button">Scout talent</button>
        <button className={tab === "Invitations" ? "active" : ""} onClick={() => setTab("Invitations")} type="button">Invitations {incomingInvitations.filter((item) => item.status === "Pending").length > 0 && <b>{incomingInvitations.filter((item) => item.status === "Pending").length}</b>}</button>
      </nav>

      {message && <p className="clubStudioMessage" role="status">{message}</p>}
      {loadError && <div className="clubStudioEmpty"><strong>Clubs and scouting unavailable</strong><span>{loadError}</span></div>}
      {!loadError && loading && <div className="clubStudioEmpty"><strong>Loading the club network…</strong></div>}

      {!loadError && !loading && tab === "Clubs" && (
        <div className="clubNetworkWorkspace">
          <aside className="clubNetworkRail">
            {clubs.length > 0 ? clubs.map((club) => (
              <button className={selectedClub?.id === club.id ? "selected" : ""} key={club.id} onClick={() => setSelectedClubId(club.id)} type="button">
                <span>{club.club_type}</span><strong>{club.name}</strong><small>{club.main_activity} · {club.region}</small>
              </button>
            )) : <p>No clubs have been created yet.</p>}
          </aside>
          <div className="clubNetworkMain">
            {selectedClub ? (
              <>
                <header><div><span>{selectedClub.status} · {selectedClub.club_type}</span><h3>{selectedClub.name}</h3><p>{selectedClub.description}</p></div><button onClick={() => void shareClub(selectedClub)} type="button">Share club</button></header>
                <div className="clubIdentityGrid"><article><span>Focus</span><strong>{selectedClub.main_activity}</strong></article><article><span>Region</span><strong>{selectedClub.region}</strong></article><article><span>Members</span><strong>{selectedMembers.length}</strong></article><article><span>Started</span><strong>{formatClubDate(selectedClub.created_at)}</strong></article></div>
                <div className="clubRoster"><div><span>Club roster</span><strong>Accepted roles only</strong></div>{selectedMembers.map((member) => <article key={member.id}><span>{member.display_name.slice(0, 2).toUpperCase()}</span><div><strong>{member.display_name}</strong><small>Joined {formatClubDate(member.joined_at)}</small></div><b>{member.role}</b></article>)}</div>
              </>
            ) : <div className="clubStudioEmpty"><strong>Create the first club</strong><span>Use the form below to establish its identity and become the owner.</span></div>}
          </div>
        </div>
      )}

      {!loadError && !loading && tab === "Clubs" && (
        <details className="clubCreatePanel">
          <summary>Create a club</summary>
          <form onSubmit={createClub}>
            <label>Club name<input maxLength={80} minLength={2} name="name" placeholder="Nerul Performance Club" required /></label>
            <label>Club type<select name="club_type" defaultValue="Sports club"><option>Sports club</option><option>Talent collective</option><option>Esports organization</option><option>Community club</option></select></label>
            <label>Main activity<select name="activity" defaultValue={activities[0]}>{activities.map((activity) => <option key={activity}>{activity}</option>)}</select></label>
            <label>Region<input maxLength={100} minLength={2} name="region" placeholder="Nerul, Navi Mumbai" required /></label>
            <label className="wide">About the club<textarea maxLength={500} minLength={10} name="description" placeholder="What the club builds, who it supports, and what kind of competitors fit." required rows={3} /></label>
            <button disabled={Boolean(busyAction)} type="submit">{busyAction === "create-club" ? "Creating…" : "Create club"}</button>
          </form>
        </details>
      )}

      {!loadError && !loading && tab === "Scout" && (
        <div className="clubScoutWorkspace">
          {officialClubs.length > 0 ? (
            <>
              <div className="clubScoutToolbar">
                <label>Scout for club<select onChange={(event) => setSelectedClubId(event.target.value)} value={scoutingClub?.id || ""}>{officialClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
                <label>Search talent<input onChange={(event) => setScoutSearch(event.target.value)} placeholder="Name, activity, region, or goal" type="search" value={scoutSearch} /></label>
                <span>{selectedShortlist.size} private shortlist · {visibleScoutingProfiles.length} profiles</span>
              </div>
              <div className="clubScoutGrid">
                {visibleScoutingProfiles.map((profile) => {
                  const rank = bestRankByUser.get(profile.user_id);
                  const shortlisted = selectedShortlist.has(profile.user_id);
                  const pendingInvite = outgoingInvitations.some((invite) => invite.club_id === scoutingClub?.id && invite.target_user_id === profile.user_id && invite.status === "Pending");
                  return (
                    <article key={profile.user_id}>
                      <header><div><span>{profile.display_name.slice(0, 2).toUpperCase()}</span><div><strong>{profile.display_name}</strong><small>@{profile.username} · {profile.region}</small></div></div><button className={shortlisted ? "shortlisted" : ""} disabled={Boolean(busyAction)} onClick={() => void toggleShortlist(profile)} type="button">{shortlisted ? "Shortlisted" : "Shortlist"}</button></header>
                      <div className="clubScoutSignals"><span>{profile.main_interest}</span><span>{rank?.tier || "Rookie"}</span><span>{rank?.rank_points || 0} RP</span><span>{rank?.wins || 0} wins</span></div>
                      <p>{profile.scouting_note || "Open to hearing from clubs that match this activity and region."}</p>
                      {profile.share_token && <Link href={`/profile/${profile.share_token}`} rel="noreferrer" target="_blank">View Talent7 Passport</Link>}
                      <form onSubmit={(event) => sendInvitation(event, profile)}>
                        <select aria-label={`Proposed role for ${profile.display_name}`} defaultValue="Member" name="role"><option>Member</option><option>Scout</option><option>Manager</option></select>
                        <input aria-label={`Invitation note for ${profile.display_name}`} maxLength={300} name="message" placeholder="Why this club is interested" />
                        <button disabled={Boolean(busyAction) || pendingInvite} type="submit">{pendingInvite ? "Invitation pending" : busyAction === `invite-${profile.user_id}` ? "Sending…" : "Invite with consent"}</button>
                      </form>
                    </article>
                  );
                })}
              </div>
              {visibleScoutingProfiles.length === 0 && <div className="clubStudioEmpty"><strong>No matching scoutable profiles</strong><span>Try another search. People appear here only after enabling Open to scouting in Account settings.</span></div>}
            </>
          ) : <div className="clubStudioEmpty"><strong>Create or join a club as an official first</strong><span>Only an Owner, Manager, or Scout can access a club shortlist and send invitations.</span><button onClick={() => setTab("Clubs")} type="button">Open club network</button></div>}
        </div>
      )}

      {!loadError && !loading && tab === "Invitations" && (
        <div className="clubInvitationsWorkspace">
          <section><div><span>Received</span><strong>Your club invitations</strong></div>{incomingInvitations.length > 0 ? incomingInvitations.map((invitation) => <article key={invitation.id}><span>{invitation.status}</span><h3>{clubName(invitation.club_id)}</h3><strong>Proposed role: {invitation.proposed_role}</strong><p>{invitation.message || "The club did not add a private message."}</p><small>Sent {formatClubDate(invitation.created_at)}</small>{invitation.status === "Pending" && <div><button disabled={Boolean(busyAction)} onClick={() => void respondToInvitation(invitation, true)} type="button">Accept</button><button className="secondary" disabled={Boolean(busyAction)} onClick={() => void respondToInvitation(invitation, false)} type="button">Decline</button></div>}</article>) : <p>No club invitations received yet.</p>}</section>
          <section><div><span>Sent</span><strong>Club recruiting activity</strong></div>{outgoingInvitations.length > 0 ? outgoingInvitations.map((invitation) => <article key={invitation.id}><span>{invitation.status}</span><h3>{invitation.target_name}</h3><strong>{clubName(invitation.club_id)} · {invitation.proposed_role}</strong><p>{invitation.message || "No message added."}</p><small>Sent {formatClubDate(invitation.created_at)}</small>{invitation.status === "Pending" && <div><button className="secondary" disabled={Boolean(busyAction)} onClick={() => void withdrawInvitation(invitation)} type="button">Withdraw invitation</button></div>}</article>) : <p>No invitations have been sent from your clubs.</p>}</section>
        </div>
      )}
    </section>
  );
}
