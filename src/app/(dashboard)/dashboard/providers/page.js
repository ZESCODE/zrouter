"use client";

// Providers page — OmniRoute-style layout (multi-section card list).
//
//   - Header frost card (blue frost hero glow): search, Configured-only
//     toggle, Test All
//   - Category filter pills with configured/total counts
//   - Sections (Compatible → Free Tier → OAuth → API Key → Web Cookie →
//     Search → Audio → Local), each with a count + Test All
//   - Card grid: 1 column on mobile/Termux, up to 6 on wide desktop
//   - All cards use the ZES Frost card with the default BLUE glow border
//
// Data + behavior (dual auth, batch test, add compatible, toggles) is
// unchanged from the previous rebuild.

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import {
  Button,
  Toggle,
} from "@/shared/components";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, WEB_COOKIE_PROVIDERS, AI_PROVIDERS as AI_PROVIDERS_ALL } from "@/shared/constants/providers";
import { getProviderCategory, CATEGORY_DOT_COLORS } from "@/shared/constants/providerRegistry";
import { getProviderHealth } from "@/shared/utils/errorClassifier";
import { providerMatchesSearch } from "@/shared/utils/providerPageUtils";
import { useNotificationStore } from "@/store/notificationStore";
import RichProviderCard from "./components/ProviderCard";
import BatchTestModal from "./components/BatchTestModal";
import AddCompatibleModal from "./components/AddCompatibleModal";
import ModelAvailabilityBadge from "./components/ModelAvailabilityBadge";
import RoutingFallbacksCard from "./components/RoutingFallbacksCard";

const APIKEY_INITIAL_VISIBLE = 20;

// ── Stats ──────────────────────────────────────────────────────────────────

function getEffectiveStatus(conn) {
  const inCooldown =
    (conn.rateLimitedUntil && new Date(conn.rateLimitedUntil).getTime() > Date.now()) ||
    Object.entries(conn).some(
      ([k, v]) => k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now()
    );
  return conn.testStatus === "unavailable" && !inCooldown
    ? "active"
    : conn.testStatus;
}

function computeProviderStats(connections, providerId, authTypes) {
  const authTypeList = Array.isArray(authTypes) ? authTypes : [authTypes];
  const providerConnections = connections.filter(
    (c) => c.provider === providerId && authTypeList.includes(c.authType)
  );

  const connected = providerConnections.filter((c) => {
    const status = getEffectiveStatus(c);
    return c.isActive !== false && (status === "active" || status === "success");
  }).length;

  const errorConns = providerConnections.filter((c) => {
    if (c.isActive === false) return false;
    const status = getEffectiveStatus(c);
    return status && !["active", "success"].includes(status);
  });
  const error = errorConns.length;
  const total = providerConnections.length;
  const allDisabled = total > 0 && providerConnections.every((c) => c.isActive === false);

  const cooldownConns = providerConnections.filter(
    (c) => c.rateLimitedUntil && new Date(c.rateLimitedUntil).getTime() > Date.now() && c.isActive !== false
  );
  let cooldownUntil = null;
  for (const c of cooldownConns) {
    if (!cooldownUntil || new Date(c.rateLimitedUntil).getTime() < new Date(cooldownUntil).getTime()) {
      cooldownUntil = c.rateLimitedUntil;
    }
  }

  const latestError = errorConns
    .slice()
    .sort((a, b) => new Date(b.lastErrorAt || 0).getTime() - new Date(a.lastErrorAt || 0).getTime())[0];

  return {
    connected,
    error,
    total,
    warning: cooldownConns.length,
    allDisabled,
    health: allDisabled ? "none" : getProviderHealth(providerConnections),
    inCooldown: cooldownConns.length > 0,
    cooldownUntil,
    latestError: latestError?.lastError || null,
    errorCode: latestError?.errorCode || null,
  };
}

// ── Category pills ──────────────────────────────────────────────────────────

const PILL_ORDER = [
  "compatible",
  "free",
  "oauth",
  "apikey",
  "webCookie",
  "search",
  "audio",
  "local",
];

const PILL_META = {
  compatible: { label: "Compatible", dot: "#fb923c" },
  free: { label: "Free", dot: "#22c55e" },
  oauth: { label: "OAuth", dot: "#3b82f6" },
  apikey: { label: "API Key", dot: "#f59e0b" },
  webCookie: { label: "Web Cookie", dot: "#a855f7" },
  search: { label: "Search", dot: "#14b8a6" },
  audio: { label: "Audio", dot: "#f43f5e" },
  local: { label: "Local", dot: "#84cc16" },
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function ProvidersPage() {
  const [connections, setConnections] = useState([]);
  const [providerNodes, setProviderNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllApikey, setShowAllApikey] = useState(false);
  const [showAddCompatibleModal, setShowAddCompatibleModal] = useState(false);
  const [showAddAnthropicCompatibleModal, setShowAddAnthropicCompatibleModal] = useState(false);
  const [testingMode, setTestingMode] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [showRoutingFallbacks, setShowRoutingFallbacks] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [configuredOnly, setConfiguredOnly] = useState(false);
  const [activeCategory, setActiveCategory] = useState("total");
  const notify = useNotificationStore();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [connectionsRes, nodesRes] = await Promise.all([
          fetch("/api/providers", { cache: "no-store" }),
          fetch("/api/provider-nodes", { cache: "no-store" }),
        ]);
        const connectionsData = await connectionsRes.json();
        const nodesData = await nodesRes.json();
        if (connectionsRes.ok) setConnections(connectionsData.connections || []);
        if (nodesRes.ok) setProviderNodes(nodesData.nodes || []);
      } catch (error) {
        console.log("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getProviderStats = useCallback(
    (providerId, authTypes) => computeProviderStats(connections, providerId, authTypes),
    [connections]
  );

  const matchSearch = (name, id) => providerMatchesSearch(searchQuery, { name, id });

  const handleToggleProvider = async (providerId, authTypes, newActive) => {
    const authTypeList = Array.isArray(authTypes) ? authTypes : [authTypes];
    const matches = (c) => c.provider === providerId && authTypeList.includes(c.authType);
    const providerConns = connections.filter(matches);
    setConnections((prev) => prev.map((c) => (matches(c) ? { ...c, isActive: newActive } : c)));
    await Promise.allSettled(
      providerConns.map((c) =>
        fetch(`/api/providers/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: newActive }),
        })
      )
    );
  };

  const handleBatchTest = async (mode, providerId = null) => {
    if (testingMode) return;
    setTestingMode(mode === "provider" ? `provider:${providerId}` : mode);
    setTestResults(null);
    try {
      const res = await fetch("/api/providers/test-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, providerId }),
      });
      const data = await res.json();
      setTestResults(data);
      if (data.summary) {
        const { passed, failed, total } = data.summary;
        if (total === 0) notify.warning("No active connections to test");
        else if (failed === 0) notify.success(`All ${total} tests passed`);
        else notify.warning(`${passed}/${total} passed, ${failed} failed`);
      }
    } catch (error) {
      setTestResults({ error: "Test request failed" });
      notify.error("Provider test failed");
    } finally {
      setTestingMode(null);
    }
  };

  // ── Sections ──────────────────────────────────────────────────────────────

  const compatibleProviders = providerNodes
    .filter((node) => node.type === "openai-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "OpenAI Compatible",
      color: "#10A37F",
      textIcon: "OC",
      apiType: node.apiType,
    }))
    .filter((p) => matchSearch(p.name, p.id));

  const anthropicCompatibleProviders = providerNodes
    .filter((node) => node.type === "anthropic-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "Anthropic Compatible",
      color: "#D97757",
      textIcon: "AC",
    }))
    .filter((p) => matchSearch(p.name, p.id));

  // Dual-auth providers (oauth + apikey) store keys under both auth types.
  const dualAuthTypes = (info, key) => {
    if (key === "kiro") return ["oauth", "apikey", "api_key"];
    const modes = info?.authModes;
    if (!Array.isArray(modes)) {
      return key in FREE_TIER_PROVIDERS || key in APIKEY_PROVIDERS
        ? ["oauth", "apikey", "api_key"]
        : "oauth";
    }
    if (!modes.includes("apikey")) return "oauth";
    return ["oauth", "apikey", "api_key"];
  };

  const sortByPriority = (entries, authType) =>
    [...entries].sort(([ka, a], [kb, b]) => {
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      if (pa !== pb) return pa - pb;
      const sa = getProviderStats(ka, authType);
      const sb = getProviderStats(kb, authType);
      const ca = sa.connected > 0 ? 1 : 0;
      const cb = sb.connected > 0 ? 1 : 0;
      if (ca !== cb) return cb - ca;
      return (a.name || "").localeCompare(b.name || "");
    });

  const withStats = (entries, authTypeFor) =>
    entries.map(([key, info]) => {
      const authTypes = authTypeFor ? authTypeFor(info, key) : dualAuthTypes(info, key);
      return { key, info, stats: getProviderStats(key, authTypes), authTypes };
    });

  const oauthEntries = withStats(
    sortByPriority(
      Object.entries(OAUTH_PROVIDERS).filter(([, info]) => !info.hidden && matchSearch(info.name, info.id)),
      "oauth"
    ),
    dualAuthTypes
  );
  const freeEntries = withStats(
    Object.entries(FREE_PROVIDERS)
      .filter(([, info]) => !info.hidden && matchSearch(info.name, info.id))
      .sort(([, a], [, b]) => (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0)),
    dualAuthTypes
  );
  const freeTierEntries = withStats(
    Object.entries(FREE_TIER_PROVIDERS)
      .filter(
        ([, info]) =>
          !info.hidden &&
          matchSearch(info.name, info.id) &&
          (info.serviceKinds ?? ["llm"]).includes("llm")
      )
      .sort(([ka, a], [kb, b]) => {
        const pa = a.priority ?? 999;
        const pb = b.priority ?? 999;
        if (pa !== pb) return pa - pb;
        const noAuthDiff = (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0);
        if (noAuthDiff !== 0) return noAuthDiff;
        const ca = getProviderStats(ka, dualAuthTypes(a, ka)).connected > 0 ? 0 : 1;
        const cb = getProviderStats(kb, dualAuthTypes(b, kb)).connected > 0 ? 0 : 1;
        if (ca !== cb) return ca - cb;
        return (a.name || "").localeCompare(b.name || "");
      }),
    dualAuthTypes
  );
  const apikeyEntries = withStats(
    Object.entries(APIKEY_PROVIDERS)
      .filter(
        ([, info]) =>
          !info.hidden &&
          (info.serviceKinds ?? ["llm"]).includes("llm") &&
          matchSearch(info.name, info.id)
      )
      .sort(([ka, a], [kb, b]) => {
        const ca = getProviderStats(ka, "apikey").total > 0 ? 0 : 1;
        const cb = getProviderStats(kb, "apikey").total > 0 ? 0 : 1;
        if (ca !== cb) return ca - cb;
        return (a.name || "").localeCompare(b.name || "");
      }),
      null
  );
  const webCookieEntries = withStats(
    Object.entries(WEB_COOKIE_PROVIDERS).filter(([, info]) => !info.hidden && matchSearch(info.name, info.id)),
    dualAuthTypes
  );

  // Specialized (non-LLM) providers — search / audio / local sections.
  const allRegistry = Object.entries(AI_PROVIDERS_ALL);
  const searchEntries = withStats(
    allRegistry.filter(
      ([, info]) =>
        !info.hidden &&
        (info.serviceKinds ?? []).some((k) => k === "webSearch" || k === "webFetch") &&
        !(info.serviceKinds ?? ["llm"]).includes("llm") &&
        matchSearch(info.name, info.id)
    ),
    dualAuthTypes
  );
  const audioEntries = withStats(
    allRegistry.filter(
      ([, info]) =>
        !info.hidden &&
        (info.serviceKinds ?? []).some((k) => k === "tts" || k === "stt" || k === "music") &&
        !(info.serviceKinds ?? ["llm"]).includes("llm") &&
        matchSearch(info.name, info.id)
    ),
    dualAuthTypes
  );
  const localEntries = withStats(
    allRegistry.filter(
      ([, info]) =>
        !info.hidden &&
        info.noAuth &&
        matchSearch(info.name, info.id)
    ),
    dualAuthTypes
  );

  // ── Counts for header + pills ────────────────────────────────────────────
  const countOf = (entries) => {
    const total = entries.length;
    const configured = entries.filter((e) => Number(e.stats?.total || 0) > 0).length;
    return { total, configured };
  };

  const pillCounts = {
    compatible: { total: compatibleProviders.length + anthropicCompatibleProviders.length, configured: compatibleProviders.filter((p) => getProviderStats(p.id, "apikey").total > 0).length + anthropicCompatibleProviders.filter((p) => getProviderStats(p.id, "apikey").total > 0).length },
    free: { ...countOf(freeEntries), total: countOf(freeEntries).total + countOf(freeTierEntries).total, configured: countOf(freeEntries).configured + countOf(freeTierEntries).configured },
    oauth: countOf(oauthEntries),
    apikey: countOf(apikeyEntries),
    webCookie: countOf(webCookieEntries),
    search: countOf(searchEntries),
    audio: countOf(audioEntries),
    local: countOf(localEntries),
  };
  pillCounts.total = {
    total: Object.values(pillCounts).reduce((s, c) => s + c.total, 0),
    configured: Object.values(pillCounts).reduce((s, c) => s + c.configured, 0),
  };

  // Configured-only filter
  const cfg = (entries) =>
    configuredOnly ? entries.filter((e) => Number(e.stats?.total || 0) > 0) : entries;

  const showOauth = oauthEntries.length > 0;
  const showFree = freeEntries.length + freeTierEntries.length > 0;
  const showApikey = apikeyEntries.length > 0;
  const showWebCookie = webCookieEntries.length > 0;
  const showSearch = searchEntries.length > 0;
  const showAudio = audioEntries.length > 0;
  const showLocal = localEntries.length > 0;
  const showCompatible = compatibleProviders.length + anthropicCompatibleProviders.length > 0;

  const inCat = (cat) => activeCategory === "total" || activeCategory === cat;

  const visibleApikeyAll = cfg(apikeyEntries);
  const visibleApikey =
    showAllApikey || searchQuery.trim()
      ? visibleApikeyAll
      : visibleApikeyAll.slice(0, APIKEY_INITIAL_VISIBLE);
  const hiddenApikeyCount = visibleApikeyAll.length - visibleApikey.length;

  const hasAnyResult =
    (inCat("compatible") && showCompatible) ||
    (inCat("free") && (cfg(freeEntries).length + cfg(freeTierEntries).length > 0)) ||
    (inCat("oauth") && cfg(oauthEntries).length > 0) ||
    (inCat("apikey") && visibleApikey.length > 0) ||
    (inCat("webCookie") && cfg(webCookieEntries).length > 0) ||
    (inCat("search") && cfg(searchEntries).length > 0) ||
    (inCat("audio") && cfg(audioEntries).length > 0) ||
    (inCat("local") && cfg(localEntries).length > 0);

  if (loading) {
    return (
      <div className="frost-bg flex min-w-0 flex-col gap-4 px-1 py-4 sm:px-0">
        <div className="glass-skeleton h-36 w-full" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="glass-skeleton h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const renderCard = (entry, categoryOverride) => (
    <RichProviderCard
      key={entry.key ?? entry.id}
      providerId={entry.key ?? entry.id}
      provider={entry.info || entry}
      stats={entry.stats}
      category={categoryOverride || getProviderCategory(entry.key ?? entry.id)}
      onToggle={(active) => handleToggleProvider(entry.key ?? entry.id, entry.authTypes, active)}
    />
  );

  const sectionTestButton = (mode, testingKey) => (
    <button
      onClick={() => handleBatchTest(mode)}
      disabled={!!testingMode}
      className={`glass-btn glass-btn-sm ${testingMode === testingKey ? "glass-btn-frost animate-pulse" : ""}`}
      title={`Test all ${mode} connections`}
    >
      <span className={`material-symbols-outlined text-[14px] ${testingMode === testingKey ? "animate-spin" : ""}`}>
        play_arrow
      </span>
      {testingMode === testingKey ? "Testing…" : "Test All"}
    </button>
  );

  const sectionHeader = (title, dotColor, count, action) => (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-text-main sm:text-lg">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
        <span className="truncate">{title}</span>
        {count != null && (
          <span className="shrink-0 text-xs font-normal text-text-muted">
            {count.configured}/{count.total}
          </span>
        )}
      </h2>
      {action && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{action}</div>}
    </div>
  );

  const gridClass = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6";

  return (
    <div className="frost-bg flex min-w-0 flex-col gap-5 px-1 py-4 sm:px-0">
      {/* ── Header card (blue frost hero glow) ─────────────────────────── */}
      <div className="glass-frost-blue-bg flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 dark:bg-white/10">
            <span className="material-symbols-outlined text-[22px] text-blue-300 dark:text-blue-200">dns</span>
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight text-text-main">Providers</h1>
            <p className="truncate text-xs text-text-muted">Manage your AI provider connections</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search providers"
              aria-label="Search providers"
              className="glass-input w-full pl-10"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="glass-badge flex cursor-pointer select-none items-center gap-2 py-1.5 pl-3 pr-2 text-xs font-medium text-text-main">
              <Toggle
                size="sm"
                checked={configuredOnly}
                onChange={(v) => setConfiguredOnly(v)}
              />
              Configured only
            </label>
            {sectionTestButton("all", "all")}
          </div>
        </div>

        {/* Category pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setActiveCategory("total")}
            className={`glass-badge flex shrink-0 items-center gap-1.5 text-xs font-semibold transition-all ${
              activeCategory === "total" ? "glass-frost-blue-bg !text-white" : "text-text-muted hover:text-text-main"
            }`}
          >
            Total
            <span className="tabular-nums opacity-80">
              {pillCounts.total.configured}/{pillCounts.total.total}
            </span>
          </button>
          {PILL_ORDER.filter((c) => pillCounts[c]?.total > 0).map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(activeCategory === c ? "total" : c)}
              className={`glass-badge flex shrink-0 items-center gap-1.5 text-xs font-medium transition-all ${
                activeCategory === c ? "glass-frost-blue-bg !text-white" : "text-text-muted hover:text-text-main"
              }`}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: PILL_META[c].dot }} />
              {PILL_META[c].label}
              <span className="tabular-nums opacity-80">
                {pillCounts[c].configured}/{pillCounts[c].total}
              </span>
            </button>
          ))}
        </div>
      </div>

      {!hasAnyResult && (
        <div className="glass-card flex flex-col items-center gap-2 py-10 text-center">
          <span className="material-symbols-outlined text-[32px] text-text-muted">search_off</span>
          <p className="text-sm text-text-muted">
            No providers match your search
            {configuredOnly ? " (Configured only is on)" : ""}
          </p>
        </div>
      )}

      {/* ── Custom / Compatible providers ─────────────────────────────────── */}
      {inCat("compatible") && (
        <div className="flex flex-col gap-3">
          {sectionHeader(
            "API Key Compatible Providers",
            PILL_META.compatible.dot,
            pillCounts.compatible,
            <>
              {sectionTestButton("compatible", "compatible")}
              <Button size="sm" icon="add" variant="destructive" onClick={() => setShowAddAnthropicCompatibleModal(true)} className="w-full sm:w-auto">
                Add Anthropic Compatible
              </Button>
              <Button size="sm" icon="add" variant="destructive" onClick={() => setShowAddCompatibleModal(true)} className="w-full sm:w-auto">
                Add OpenAI Compatible
              </Button>
            </>
          )}
          {showCompatible ? (
            <div className={gridClass}>
              {[...compatibleProviders, ...anthropicCompatibleProviders].map((p) => (
                <RichProviderCard
                  key={p.id}
                  providerId={p.id}
                  provider={p}
                  stats={getProviderStats(p.id, "apikey")}
                  category="compatible"
                  onToggle={(active) => handleToggleProvider(p.id, "apikey", active)}
                />
              ))}
            </div>
          ) : (
            <div className="glass-card-compact flex items-center justify-center gap-2 text-sm text-text-muted">
              <span className="material-symbols-outlined text-[18px]">extension</span>
              No custom providers — use the buttons above to add OpenAI/Anthropic compatible endpoints
            </div>
          )}
        </div>
      )}

      {/* ── Free Tier providers ───────────────────────────────────────────── */}
      {inCat("free") && (cfg(freeEntries).length + cfg(freeTierEntries).length > 0) && (
        <div className="flex flex-col gap-3">
          {sectionHeader(
            "Free Tier Providers",
            PILL_META.free.dot,
            { configured: cfg(freeEntries).filter((e) => e.stats.total > 0).length + cfg(freeTierEntries).filter((e) => e.stats.total > 0).length, total: freeEntries.length + freeTierEntries.length },
            <>
              <ModelAvailabilityBadge />
              {sectionTestButton("free", "free")}
            </>
          )}
          <p className="-mt-1 text-xs text-text-muted">
            Providers with free tiers — some require an API key signup, others need no credentials at all.
          </p>
          <div className={gridClass}>
            {cfg(freeEntries).map((entry) => renderCard(entry, entry.info.noAuth ? "local" : "free"))}
            {cfg(freeTierEntries).map((entry) => renderCard(entry, "free"))}
          </div>
        </div>
      )}

      {/* ── OAuth providers ───────────────────────────────────────────────── */}
      {inCat("oauth") && cfg(oauthEntries).length > 0 && (
        <div className="flex flex-col gap-3">
          {sectionHeader(
            "OAuth Providers",
            PILL_META.oauth.dot,
            { configured: cfg(oauthEntries).filter((e) => e.stats.total > 0).length, total: oauthEntries.length },
            sectionTestButton("oauth", "oauth")
          )}
          <div className={gridClass}>
            {cfg(oauthEntries).map((entry) => renderCard(entry, "oauth"))}
          </div>
        </div>
      )}

      {/* ── API Key providers ─────────────────────────────────────────────── */}
      {inCat("apikey") && visibleApikey.length > 0 && (
        <div className="flex flex-col gap-3">
          {sectionHeader(
            "API Key Providers",
            PILL_META.apikey.dot,
            { configured: visibleApikeyAll.filter((e) => e.stats.total > 0).length, total: apikeyEntries.length },
            sectionTestButton("apikey", "apikey")
          )}
          <div className={gridClass}>
            {visibleApikey.map((entry) => renderCard(entry, "apikey"))}
          </div>
          {!searchQuery.trim() && !showAllApikey && hiddenApikeyCount > 0 && (
            <button
              onClick={() => setShowAllApikey(true)}
              className="glass-btn w-full justify-center py-2.5 text-sm"
            >
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
              Show all {visibleApikeyAll.length} providers
            </button>
          )}
        </div>
      )}

      {/* ── Web Cookie providers ──────────────────────────────────────────── */}
      {inCat("webCookie") && cfg(webCookieEntries).length > 0 && (
        <div className="flex flex-col gap-3">
          {sectionHeader(
            "Web Cookie Providers",
            PILL_META.webCookie.dot,
            { configured: cfg(webCookieEntries).filter((e) => e.stats.total > 0).length, total: webCookieEntries.length },
            null
          )}
          <div className={gridClass}>
            {cfg(webCookieEntries).map((entry) => renderCard(entry, "webCookie"))}
          </div>
        </div>
      )}

      {/* ── Search providers ──────────────────────────────────────────────── */}
      {inCat("search") && cfg(searchEntries).length > 0 && (
        <div className="flex flex-col gap-3">
          {sectionHeader(
            "Search Providers",
            PILL_META.search.dot,
            { configured: cfg(searchEntries).filter((e) => e.stats.total > 0).length, total: searchEntries.length },
            null
          )}
          <div className={gridClass}>
            {cfg(searchEntries).map((entry) => renderCard(entry, "search"))}
          </div>
        </div>
      )}

      {/* ── Audio providers ───────────────────────────────────────────────── */}
      {inCat("audio") && cfg(audioEntries).length > 0 && (
        <div className="flex flex-col gap-3">
          {sectionHeader(
            "Audio Providers",
            PILL_META.audio.dot,
            { configured: cfg(audioEntries).filter((e) => e.stats.total > 0).length, total: audioEntries.length },
            null
          )}
          <div className={gridClass}>
            {cfg(audioEntries).map((entry) => renderCard(entry, "audio"))}
          </div>
        </div>
      )}

      {/* ── Local / no-auth providers ─────────────────────────────────────── */}
      {inCat("local") && cfg(localEntries).length > 0 && (
        <div className="flex flex-col gap-3">
          {sectionHeader(
            "Local Providers",
            PILL_META.local.dot,
            { configured: cfg(localEntries).filter((e) => e.stats.total > 0).length, total: localEntries.length },
            null
          )}
          <div className={gridClass}>
            {cfg(localEntries).map((entry) => renderCard(entry, "local"))}
          </div>
        </div>
      )}

      {/* ── Routing & Fallbacks (Phase 6) — normal frost card ────────────── */}
      <div className="flex flex-col gap-3">
        <div className="glass-card flex items-center justify-between p-4">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
              <span className="material-symbols-outlined text-[20px] text-violet-500">route</span>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-main">Routing & Fallbacks</span>
              <span className="block truncate text-xs text-text-muted">
                Provider priority ordering, rate limits, cost thresholds, fallback chains, health checks
              </span>
            </span>
          </span>
          <button
            onClick={() => setShowRoutingFallbacks((v) => !v)}
            className="glass-btn glass-btn-xs shrink-0"
            aria-expanded={showRoutingFallbacks}
          >
            {showRoutingFallbacks ? "Hide" : "Configure"}
            <span className={`material-symbols-outlined text-[13px] transition-transform ${showRoutingFallbacks ? "rotate-180" : ""}`}>
              expand_more
            </span>
          </button>
        </div>
        {showRoutingFallbacks && (
          <RoutingFallbacksCard providerNodes={providerNodes} connections={connections} />
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <AddCompatibleModal
        variant="openai"
        isOpen={showAddCompatibleModal}
        onClose={() => setShowAddCompatibleModal(false)}
        onCreated={(node) => {
          setProviderNodes((prev) => [...prev, node]);
          setShowAddCompatibleModal(false);
        }}
      />
      <AddCompatibleModal
        variant="anthropic"
        isOpen={showAddAnthropicCompatibleModal}
        onClose={() => setShowAddAnthropicCompatibleModal(false)}
        onCreated={(node) => {
          setProviderNodes((prev) => [...prev, node]);
          setShowAddCompatibleModal(false);
        }}
      />

      <BatchTestModal
        open={!!testResults}
        onClose={() => setTestResults(null)}
        mode={testResults?.mode || ""}
        results={testResults?.results || []}
        summary={testResults?.summary}
        error={testResults?.error}
      />
    </div>
  );
}
