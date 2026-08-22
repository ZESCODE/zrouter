import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
import { parseJson } from "@/lib/db/helpers/jsonCol.js";
import { getProviderConnections, getProviderNodes } from "@/lib/localDb";
import { AI_PROVIDERS, getProviderByAlias } from "@/shared/constants/providers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/provider-stats?window=14d
 *
 * Aggregates provider performance for the Provider Stats dashboard (Phase 5):
 *   - per-provider requests / success / error rate / latency p50-p95-p99 / cost / tokens
 *   - per-model stats (for the usage heatmap)
 *   - 14-day cost trend
 *   - error rate trend
 *
 * Data sources:
 *   - usageHistory (cost, status, counts — always available)
 *   - requestDetails (latency.total — when observability is enabled)
 */

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function dayKey(iso) {
  return (iso || "").slice(0, 10);
}

function providerDisplayName(providerId, nodeMap) {
  if (nodeMap[providerId]) return nodeMap[providerId];
  const cfg = getProviderByAlias(providerId) || AI_PROVIDERS[providerId];
  return cfg?.name || providerId;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const windowDays = Math.min(Math.max(parseInt(searchParams.get("window") || "14", 10) || 14, 1), 90);

    const db = await getAdapter();
    const nodeMap = {};
    try {
      const nodes = await getProviderNodes();
      for (const n of nodes) if (n.id && n.name) nodeMap[n.id] = n.name;
    } catch {
      /* optional */
    }

    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // ── usageHistory: counts, cost, errors per day/provider/model ──────────
    const historyRows = db.all(
      `SELECT timestamp, provider, model, cost, status, promptTokens, completionTokens
       FROM usageHistory WHERE timestamp >= ? ORDER BY id ASC`,
      [cutoff]
    );

    const providers = new Map(); // id -> stats
    const models = new Map(); // "provider|model" -> stats
    const days = new Map(); // dateKey -> { requests, cost, errors }

    const ensureProvider = (id) => {
      if (!id) return null;
      if (!providers.has(id)) {
        providers.set(id, {
          provider: id,
          name: providerDisplayName(id, nodeMap),
          requests: 0,
            successful: 0,
            failed: 0,
            cost: 0,
            tokensIn: 0,
            tokensOut: 0,
          latencies: [],
        });
      }
      return providers.get(id);
    };

    for (const r of historyRows) {
      const ok = r.status === "ok" || r.status == null;
      const p = ensureProvider(r.provider);
      if (p) {
        p.requests += 1;
        if (ok) p.successful += 1;
        else p.failed += 1;
        p.cost += r.cost || 0;
        p.tokensIn += r.promptTokens || 0;
        p.tokensOut += r.completionTokens || 0;
      }
      const key = `${r.provider || ""}|${r.model || ""}`;
      if (!models.has(key)) {
        models.set(key, {
          provider: r.provider || "",
          model: r.model || "",
          requests: 0,
          successful: 0,
          failed: 0,
          cost: 0,
          latencies: [],
        });
      }
      const m = models.get(key);
      m.requests += 1;
      if (ok) m.successful += 1;
      else m.failed += 1;
      m.cost += r.cost || 0;

      const dk = dayKey(r.timestamp);
      if (!days.has(dk)) days.set(dk, { date: dk, requests: 0, cost: 0, errors: 0 });
      const d = days.get(dk);
      d.requests += 1;
      d.cost += r.cost || 0;
      if (!ok) d.errors += 1;
    }

    // ── requestDetails: latency percentiles (observability) ────────────────
    let hasLatency = false;
    try {
      const detailRows = db.all(
        `SELECT data FROM requestDetails WHERE timestamp >= ?`,
        [cutoff]
      );
      for (const r of detailRows) {
        const rec = parseJson(r.data, null);
        if (!rec) continue;
        const lat = rec.latency?.total;
        if (typeof lat !== "number" || !Number.isFinite(lat) || lat <= 0) continue;
        hasLatency = true;
        const p = ensureProvider(rec.provider);
        if (p) p.latencies.push(lat);
        const m = models.get(`${rec.provider || ""}|${rec.model || ""}`);
        if (m) m.latencies.push(lat);
      }
    } catch {
      /* observability may be disabled */
    }

    const providerList = Array.from(providers.values()).map((p) => {
      const lat = p.latencies.slice().sort((a, b) => a - b);
      return {
        provider: p.provider,
        name: p.name,
        requests: p.requests,
        successful: p.successful,
        failed: p.failed,
        errorRate: p.requests > 0 ? (p.failed / p.requests) * 100 : 0,
        successRate: p.requests > 0 ? (p.successful / p.requests) * 100 : 100,
        avgLatencyMs: lat.length ? lat.reduce((s, v) => s + v, 0) / lat.length : null,
        p50Ms: lat.length ? percentile(lat, 0.5) : null,
        p95Ms: lat.length ? percentile(lat, 0.95) : null,
        p99Ms: lat.length ? percentile(lat, 0.99) : null,
        cost: p.cost,
        tokensIn: p.tokensIn,
        tokensOut: p.tokensOut,
      };
    });

    // Active providers (has at least one connection) for context
    let activeProviders = 0;
    try {
      const conns = await getProviderConnections();
      activeProviders = new Set(conns.map((c) => c.provider)).size;
    } catch {
      activeProviders = providerList.length;
    }

    const modelList = Array.from(models.values())
      .map((m) => {
        const lat = m.latencies.slice().sort((a, b) => a - b);
        return {
          provider: m.provider,
          model: m.model,
          requests: m.requests,
          successful: m.successful,
          failed: m.failed,
          avgLatencyMs: lat.length ? lat.reduce((s, v) => s + v, 0) / lat.length : null,
          cost: m.cost,
        };
      })
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 200);

    // ── Trends (fill missing days) ─────────────────────────────────────────
    const trend = [];
    for (let i = windowDays - 1; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dk = d.toISOString().slice(0, 10);
      const existing = days.get(dk) || { date: dk, requests: 0, cost: 0, errors: 0 };
      trend.push({
        date: dk,
        requests: existing.requests,
        cost: existing.cost,
        errors: existing.errors,
        errorRate: existing.requests > 0 ? (existing.errors / existing.requests) * 100 : 0,
      });
    }

    // Overall latency percentiles
    const allSorted = Array.from(providers.values())
      .flatMap((p) => p.latencies)
      .sort((a, b) => a - b);

    const totalRequests = providerList.reduce((s, p) => s + p.requests, 0);
    const totalSuccessful = providerList.reduce((s, p) => s + p.successful, 0);
    const totalFailed = providerList.reduce((s, p) => s + p.failed, 0);
    const totalCost = providerList.reduce((s, p) => s + p.cost, 0);

    return NextResponse.json({
      window: windowDays,
      generatedAt: new Date().toISOString(),
      hasLatency,
      summary: {
        totalRequests,
        successful: totalSuccessful,
        failed: totalFailed,
        errorRate: totalRequests > 0 ? (totalFailed / totalRequests) * 100 : 0,
        totalCost,
        activeProviders,
        avgLatencyMs: allSorted.length ? allSorted.reduce((s, v) => s + v, 0) / allSorted.length : null,
        p50Ms: allSorted.length ? percentile(allSorted, 0.5) : null,
        p95Ms: allSorted.length ? percentile(allSorted, 0.95) : null,
        p99Ms: allSorted.length ? percentile(allSorted, 0.99) : null,
      },
      providers: providerList.sort((a, b) => b.requests - a.requests),
      models: modelList,
      costTrend: trend,
      errorTrend: trend,
    });
  } catch (error) {
    console.error("[provider-stats] failed:", error);
    return NextResponse.json({ error: "Failed to build provider stats" }, { status: 500 });
  }
}
