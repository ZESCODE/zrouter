"use client";

// Provider Stats dashboard — Phase 5: dashboard stats upgrade.
//   1. Provider performance ranking (sortable)
//   2. Model usage heatmap
//   3. Cost trend chart (14-day)
//   4. Error rate trend
//   5. Latency distribution (p50 / p95 / p99)
//   6. Provider comparison
//   7. Real-time metrics (30s auto-refresh)
//
// Built on the ZES Frost Design System; charts use frost palette colors.

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { STATUS_HEX } from "@/shared/constants/statusColors";
import { useHeaderSearchStore } from "@/store/headerSearchStore";

const REFRESH_MS = 30000;

const FROST = {
  blue: "#60a5fa",
  green: "#4ade80",
  orange: "#fb923c",
  red: "#f87171",
  purple: "#a78bfa",
  grid: "rgba(148, 163, 184, 0.12)",
  text: "rgba(148, 163, 184, 0.8)",
};

function formatNumber(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n * 100) / 100);
}

function formatLatency(ms) {
  if (ms == null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatCost(usd) {
  if (usd == null) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "rgba(15, 23, 42, 0.92)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  fontSize: 12,
  color: "#e2e8f0",
};

// ── Summary cards ───────────────────────────────────────────────────────────

function SummaryCards({ summary, hasLatency }) {
  const cards = [
    { label: "Total Requests", value: formatNumber(summary.totalRequests), icon: "analytics", color: FROST.blue },
    {
      label: hasLatency ? "Latency p50 / p95 / p99" : "Avg Latency",
      value: hasLatency
        ? `${formatLatency(summary.p50Ms)} / ${formatLatency(summary.p95Ms)} / ${formatLatency(summary.p99Ms)}`
        : "n/a",
      icon: "timer",
      color: FROST.purple,
      title: hasLatency ? "Latency distribution across all providers" : "Enable observability to track latency",
    },
    {
      label: "Success Rate",
      value: summary.totalRequests > 0 ? `${(100 - summary.errorRate).toFixed(1)}%` : "—",
      icon: "check_circle",
      color: FROST.green,
    },
    { label: "Total Cost", value: formatCost(summary.totalCost), icon: "payments", color: FROST.orange },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="glass-card p-4" title={c.title}>
          <div className="mb-2 flex items-center gap-2.5">
            <span
              className="flex size-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${c.color}1a` }}
            >
              <span className="material-symbols-outlined text-[18px]" style={{ color: c.color }}>
                {c.icon}
              </span>
            </span>
            <span className="text-xs text-text-muted">{c.label}</span>
          </div>
          <p className="text-lg font-semibold tabular-nums text-text-main">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Provider ranking table ──────────────────────────────────────────────────

const SORT_KEYS = ["requests", "successRate", "p50Ms", "p95Ms", "cost", "tokensIn"];

function ProviderRankingTable({ providers, hasLatency }) {
  const [sortKey, setSortKey] = useState("requests");
  const [sortDir, setSortDir] = useState("desc");

  const sorted = useMemo(() => {
    const list = [...providers];
    list.sort((a, b) => {
      const va = a[sortKey] ?? -1;
      const vb = b[sortKey] ?? -1;
      // For latency, "asc" = fastest first = best
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return list;
  }, [providers, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir(key === "p50Ms" || key === "p95Ms" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ col }) =>
    sortKey === col ? (
      <span className="material-symbols-outlined ml-0.5 inline-block text-[13px] align-[-2px] text-blue-400">
        {sortDir === "desc" ? "arrow_downward" : "arrow_upward"}
      </span>
    ) : null;

  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px] text-blue-400">leaderboard</span>
        <h2 className="text-sm font-semibold text-text-main">Provider Performance Ranking</h2>
        <span className="text-xs text-text-muted">· {providers.length} providers</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-text-muted">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Provider</th>
              {SORT_KEYS.map((k) => (
                <th
                  key={k}
                  onClick={() => toggleSort(k)}
                  className="cursor-pointer select-none px-3 py-2 text-right font-medium transition-colors hover:text-text-main"
                >
                  {k === "requests"
                    ? "Requests"
                    : k === "successRate"
                      ? "Success"
                      : k === "p50Ms"
                        ? "p50"
                        : k === "p95Ms"
                          ? "p95"
                          : k === "cost"
                            ? "Cost"
                            : "Tokens in"}
                  <SortIcon col={k} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.provider} className="border-b border-white/5 transition-colors hover:bg-white/[0.03]">
                <td className="px-3 py-2.5 font-mono text-xs text-text-subtle">{i + 1}</td>
                <td className="max-w-[220px] truncate px-3 py-2.5 font-medium text-text-main" title={p.name}>
                  {p.name}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-text-main">{formatNumber(p.requests)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span
                    style={{
                      color: p.successRate >= 99 ? STATUS_HEX.success : p.successRate >= 95 ? STATUS_HEX.warning : STATUS_HEX.error,
                    }}
                  >
                    {p.requests > 0 ? `${p.successRate.toFixed(1)}%` : "—"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-text-muted">{formatLatency(p.p50Ms)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-text-muted">{formatLatency(p.p95Ms)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-text-main">{formatCost(p.cost)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-text-muted">{formatNumber(p.tokensIn)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-text-muted">
                  No provider traffic in this window yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!hasLatency && (
        <p className="mt-2 text-[11px] text-text-subtle">
          Latency columns require observability (request logs) to be enabled.
        </p>
      )}
    </div>
  );
}

// ── Model usage heatmap ─────────────────────────────────────────────────────

function ModelHeatmap({ models, maxRows = 12, maxCols = 8 }) {
  // providers (rows) × top models (cols), intensity = request count
  const data = useMemo(() => {
    const byProvider = new Map();
    for (const m of models) {
      if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
      byProvider.get(m.provider).push(m);
    }
    const rows = Array.from(byProvider.entries())
      .map(([provider, list]) => ({
        provider,
        name: list[0]?.providerName || provider,
        cells: list.slice(0, maxCols).map((m) => ({ model: m.model, requests: m.requests })),
      }))
      .sort((a, b) => b.cells.reduce((s, c) => s + c.requests, 0) - a.cells.reduce((s, c) => s + c.requests, 0))
      .slice(0, maxRows);
    const max = Math.max(1, ...models.map((m) => m.requests));
    return { rows, max };
  }, [models, maxRows, maxCols]);

  if (data.rows.length === 0) return null;

  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px] text-purple-400">heat_map</span>
        <h2 className="text-sm font-semibold text-text-main">Model Usage Heatmap</h2>
        <span className="text-xs text-text-muted">· requests in window</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {data.rows.map((row) => (
            <div key={row.provider} className="flex items-center gap-2 border-b border-white/5 py-1.5 last:border-b-0">
              <span className="w-36 shrink-0 truncate text-xs font-medium text-text-main" title={row.provider}>
                {row.provider}
              </span>
              <div className="flex flex-1 flex-wrap gap-1.5">
                {row.cells.map((cell) => {
                  const t = cell.requests / data.max;
                  return (
                    <span
                      key={cell.model}
                      className="rounded-md px-2 py-1 font-mono text-[10px] tabular-nums"
                      style={{
                        backgroundColor: `rgba(96, 165, 250, ${0.08 + t * 0.55})`,
                        color: t > 0.55 ? "#0b1220" : "#93c5fd",
                      }}
                      title={`${cell.model}: ${cell.requests} requests`}
                    >
                      {cell.model.length > 22 ? `${cell.model.slice(0, 21)}…` : cell.model}
                      <span className="ml-1 opacity-70">{cell.requests}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Trend charts ────────────────────────────────────────────────────────────

function TrendCharts({ costTrend, errorTrend }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="glass-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-orange-400">payments</span>
          <h2 className="text-sm font-semibold text-text-main">Cost Trend (14-day)</h2>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={costTrend} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="frostCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={FROST.orange} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={FROST.orange} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={FROST.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: FROST.text }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: FROST.text }} tickFormatter={(v) => `$${v}`} width={54} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => [formatCost(v), "Cost"]} labelStyle={{ color: "#e2e8f0" }} />
              <Area type="monotone" dataKey="cost" stroke={FROST.orange} strokeWidth={2} fill="url(#frostCost)" name="Cost" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-red-400">monitor_heart</span>
          <h2 className="text-sm font-semibold text-text-main">Error Rate Trend</h2>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={errorTrend} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={FROST.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: FROST.text }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: FROST.text }} tickFormatter={(v) => `${v}%`} width={44} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, name) => (name === "Errors" ? [v, "Errors"] : [`${v}%`, "Error rate"])} labelStyle={{ color: "#e2e8f0" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="errors" stroke={FROST.red} strokeWidth={2} dot={false} name="Errors" />
              <Line type="monotone" dataKey="errorRate" stroke={FROST.orange} strokeWidth={2} dot={false} name="Error rate" yAxisId={0} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Provider comparison ─────────────────────────────────────────────────────

function ProviderComparison({ providers }) {
  const top = providers.slice(0, 8);
  const data = top.map((p) => ({
    name: p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name,
    requests: p.requests,
    failed: p.failed,
    cost: Number(p.cost.toFixed(3)),
  }));
  if (data.length === 0) return null;
  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px] text-green-400">compare_arrows</span>
        <h2 className="text-sm font-semibold text-text-main">Provider Comparison</h2>
        <span className="text-xs text-text-muted">· top {data.length} by traffic</span>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={FROST.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: FROST.text }} interval={0} angle={-18} textAnchor="end" height={48} />
            <YAxis tick={{ fontSize: 10, fill: FROST.text }} width={44} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} labelStyle={{ color: "#e2e8f0" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="requests" fill={FROST.blue} radius={[4, 4, 0, 0]} name="Requests" />
            <Bar dataKey="failed" fill={FROST.red} radius={[4, 4, 0, 0]} name="Failed" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ProviderStatsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [secondsToRefresh, setSecondsToRefresh] = useState(REFRESH_MS / 1000);
  const registerSearch = useHeaderSearchStore((s) => s.register);
  const unregisterSearch = useHeaderSearchStore((s) => s.unregister);

  useEffect(() => {
    registerSearch("");
    return () => unregisterSearch();
  }, [registerSearch, unregisterSearch]);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/provider-stats?window=14", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date());
      setSecondsToRefresh(REFRESH_MS / 1000);
    } catch (err) {
      setError(err.message || "Failed to load stats");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_MS);
    const tick = setInterval(() => setSecondsToRefresh((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(tick);
    };
  }, [fetchData]);

  if (error && !data) {
    return (
      <div className="frost-bg px-1 py-6 sm:px-0">
        <div className="glass-card flex flex-col items-center gap-3 p-10 text-center">
          <span className="material-symbols-outlined text-[32px] text-red-400">error</span>
          <p className="text-sm text-text-muted">Failed to load provider stats: {error}</p>
          <button onClick={fetchData} className="glass-btn glass-btn-sm glass-btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="frost-bg flex flex-col gap-4 px-1 py-6 sm:px-0">
        <div className="glass-skeleton h-10 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-skeleton h-24 w-full" />
          ))}
        </div>
        <div className="glass-skeleton h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="frost-bg flex min-w-0 flex-col gap-4 px-1 py-4 sm:px-0">
      {/* Header */}
      <div className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-purple-500/10">
            <span className="material-symbols-outlined text-[22px] text-purple-400">monitoring</span>
          </span>
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-text-main">
              Provider Stats
              <span
                className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-500"
                title={`Auto-refresh every ${REFRESH_MS / 1000}s`}
              >
                <span className={`size-1.5 rounded-full bg-green-500 ${refreshing ? "animate-pulse" : ""}`} />
                LIVE
              </span>
            </h1>
            <p className="text-xs text-text-muted">
              {data.summary.activeProviders} active providers · window {data.window}d
              {lastRefresh ? ` · updated ${lastRefresh.toLocaleTimeString()}` : ""} · next refresh in {secondsToRefresh}s
            </p>
          </div>
        </div>
        <button onClick={fetchData} disabled={refreshing} className="glass-btn glass-btn-sm self-start sm:self-auto" title="Refresh now">
          <span className={`material-symbols-outlined text-[15px] ${refreshing ? "animate-spin" : ""}`}>refresh</span>
          Refresh
        </button>
      </div>

      <SummaryCards summary={data.summary} hasLatency={data.hasLatency} />
      <ProviderRankingTable providers={data.providers} hasLatency={data.hasLatency} />
      <TrendCharts costTrend={data.costTrend} errorTrend={data.errorTrend} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ProviderComparison providers={data.providers} />
        <ModelHeatmap models={data.models} />
      </div>
    </div>
  );
}
