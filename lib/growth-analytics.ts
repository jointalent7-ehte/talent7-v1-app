"use client";

import { supabase } from "./supabase";

export type GrowthEventName =
  | "shared_link_view"
  | "shared_return"
  | "signup"
  | "login"
  | "result_shared"
  | "league_joined";

const anonymousIdKey = "talent7-growth-id";

function anonymousId() {
  if (typeof window === "undefined") return null;
  const existing = window.localStorage.getItem(anonymousIdKey);
  if (existing) return existing;
  const created = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `t7-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(anonymousIdKey, created);
  return created;
}

export async function trackGrowthEvent(
  eventName: GrowthEventName,
  options: { resourceType?: string; resourceToken?: string; source?: string } = {}
) {
  if (!supabase || typeof window === "undefined") return;

  await supabase.rpc("track_growth_event", {
    target_event_name: eventName,
    target_anonymous_id: anonymousId(),
    target_resource_type: options.resourceType || null,
    target_resource_token: options.resourceToken || null,
    target_source: options.source || window.location.pathname
  });
}
