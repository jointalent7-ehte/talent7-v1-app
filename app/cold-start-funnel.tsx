"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type FunnelRow = {
  stage_order: number;
  stage_key: string;
  stage_title: string;
  user_count: number;
  cohort_percent: number;
};

export default function ColdStartFunnel() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<FunnelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadFunnel = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase.rpc("get_talent7_cold_start_funnel", {
      target_days: days
    });
    if (loadError) {
      setRows([]);
      setError(
        loadError.message.includes("get_talent7_cold_start_funnel")
          ? "Run the cold-start retention funnel migration in Supabase."
          : loadError.message
      );
    } else {
      setRows((data || []) as FunnelRow[]);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    void loadFunnel();
  }, [loadFunnel]);

  return (
    <section className="coldStartFunnel" aria-labelledby="cold-start-funnel-title">
      <header>
        <div>
          <span>Admin · cold-start health</span>
          <h3 id="cold-start-funnel-title">Are new members finding something useful?</h3>
          <small>Aggregate counts only. Paths can overlap; no member identities are shown.</small>
        </div>
        <div aria-label="Funnel period" role="group">
          {[7, 30, 90].map((period) => (
            <button
              aria-pressed={days === period}
              className={days === period ? "active" : ""}
              key={period}
              onClick={() => setDays(period)}
              type="button"
            >
              {period}d
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <p>Measuring the activation funnel…</p>
      ) : error ? (
        <p className="coldStartFunnelNotice">{error}</p>
      ) : rows.length === 0 || Number(rows[0]?.user_count || 0) === 0 ? (
        <p>No new accounts were created during this period.</p>
      ) : (
        <div className="coldStartFunnelRows">
          {rows.map((row) => (
            <article key={row.stage_key}>
              <span>{row.stage_order}</span>
              <div>
                <strong>{row.stage_title}</strong>
                <i><b style={{ width: `${Math.min(100, Number(row.cohort_percent))}%` }} /></i>
              </div>
              <strong>{row.user_count}</strong>
              <small>{Number(row.cohort_percent).toFixed(1)}%</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
