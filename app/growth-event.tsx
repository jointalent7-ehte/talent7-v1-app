"use client";

import { useEffect } from "react";
import { trackGrowthEvent, type GrowthEventName } from "../lib/growth-analytics";

export default function GrowthEvent({
  eventName,
  resourceType,
  resourceToken,
  source
}: {
  eventName: GrowthEventName;
  resourceType?: string;
  resourceToken?: string;
  source?: string;
}) {
  useEffect(() => {
    const key = `talent7-growth:${eventName}:${resourceType || "page"}:${resourceToken || source || "open"}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    void trackGrowthEvent(eventName, { resourceType, resourceToken, source });
  }, [eventName, resourceToken, resourceType, source]);

  return null;
}
