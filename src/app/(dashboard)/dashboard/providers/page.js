"use client";

// Providers page — REBUILT (ZESRouter dashboard rebuild, Phase 1 + 3).
//
// Rich provider cards with:
//   - service kind badges (LLM, Embedding, Image, TTS, STT, Web Search, Video)
//   - error classification engine (AUTH, RUNTIME, RATE_LIMITED, SERVER, NETWORK)
//   - cooldown timers with live countdown
//   - connection count badges (connected/total)
//   - provider health status (healthy / degraded / offline)
//   - quick actions (test, configure, view logs)
//   - display mode toggle (All / Configured / Compact)
//
// All cards use the ZES Frost Design System (.glass-card).

import { useState, useEffect, useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import {
  Badge,
  Button,
  Toggle,
  CardSkeleton,
} from "@/shared/components";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS } from "@/shared/constants/providers";
import { getProviderCategory } from "@/shared/constants/providerRegistry";
import { getRelativeTime } from "@/shared/utils";
import { getProviderHealth } from "@/shared/utils/errorClassifier";
import { providerMatchesSearch, filterEntriesByDisplayMode, PROVIDER_DISPLAY_MODES, DISPLAY_MODE_STORAGE_KEY } from "@/shared/utils/providerPageUtils";
import { useNotificationStore } from "@/store/notificationStore";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import RichProviderCard from "./components/ProviderCard";
import BatchTestModal from "./components/BatchTestModal";
import AddCompatibleModal from "./components/AddCompatibleModal";
import ModelAvailabilityBadge from "./components/ModelAvailabilityBadge";
import RoutingFallbacksCard from "./components/RoutingFallbacksCard";

const APIKEY_INITIAL_VISIBLE = 20;

// ── Stats ───────────────────────────────────────────────────────────────────

/**
 * Effective status: model locks / rate-limit cooldowns suppress a stale
 * "unavailable" state once the window has passed.
 */
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
    errorTime: latestError?.lastErrorAt ? getRelativeTime(latestError.lastErrorAt) : null,
  };
}

// ── Display mode ────────────────────────────────────────────────────────────

function useDisplayMode() {
  const [mode, setMode] = useState(PROVIDER_DISPLAY_MODES.ALL);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
      if (stored && Object.values(PROVIDER_DISPLAY_MODES).includes(stored)) setMode(stored);
    } catch {
      /* ignore */
    }
  }, []);
  const update = useCallback((m) => {
    setMode(m);
    try {
      window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);
  return [mode, update];
}

const MODE_OPTIONS = [
  { value: PROVIDER_DISPLAY_MODES.ALL, label: "All", icon: "grid_view" },
  { value: PROVIDER_DISPLAY_MODES.CONFIGURED, label: "Configured", icon: "tune" },
  { value: PROVIDER_DISPLAY_MODES.COMPACT, label: "Compact", icon: "view_headline" },
];

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
  const [displayMode, setDisplayMode] = useDisplayMode();
  const notify = useNotificationStore();
  const searchQuery = useHeaderSearchStore((s) => s.query);
  const registerSearch = useHeaderSearchStore((s) => s.register);
  const unregisterSearch = useHeaderSearchStore((s) => s.unregister);

  useEffect(() => {
    registerSearch("Search providers...");
    return () => unregisterSearch();
  }, [registerSearch, unregisterSearch]);

  const matchSearch = (name) => providerMatchesSearch(searchQuery, { name });

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
    .filter((p) => matchSearch(p.name));

  const anthropicCompatibleProviders = providerNodes
    .filter((node) => node.type === "anthropic-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "Anthropic Compatible",
      color: "#D97757",
      textIcon: "AC",
    }))
    .filter((p) => matchSearch(p.name));

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
      return {
        key,
        info,
        stats: getProviderStats(key, authTypes),
        authTypes,
      };
    });

  const oauthEntries = withStats(
    sortByPriority(
      Object.entries(OAUTH_PROVIDERS).filter(([, info]) => !info.hidden && matchSearch(info.name)),
      "oauth"
    ),
    dualAuthTypes
  );
  const freeEntries = withStats(
    Object.entries(FREE_PROVIDERS)
      .filter(([, info]) => !info.hidden && matchSearch(info.name))
      .sort(([, a], [, b]) => (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0)),
    dualAuthTypes
  );
  const freeTierEntries = withStats(
    Object.entries(FREE_TIER_PROVIDERS)
      .filter(
        ([, info]) =>
          !info.hidden &&
          matchSearch(info.name) &&
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
          matchSearch(info.name)
      )
      .sort(([ka, a], [kb, b]) => {
        const ca = getProviderStats(ka, "apikey").total > 0 ? 0 : 1;
        const cb = getProviderStats(kb, "apikey").total > 0 ? 0 : 1;
        if (ca !== cb) return ca - cb;
        return (a.name || "").localeCompare(b.name || "");
      }),
    null
  );

  // Display-mode filtering (Phase 1.7)
  const filterForMode = (list) =>
    filterEntriesByDisplayMode(
      list.map((e) => ({ providerId: e.key, stats: e.stats, entry: e })),
      displayMode
    ).map((x) => x.entry);

  const visibleOauth = filterForMode(oauthEntries);
  const visibleFree = filterForMode(freeEntries);
  const visibleFreeTier = filterForMode(freeTierEntries);
  const visibleCompatible = compatibleProviders.length + anthropicCompatibleProviders.length;
  const isApikeySearching = !!searchQuery.trim();
  const visibleApikeyAll = filterForMode(apikeyEntries);
  const visibleApikey =
    isApikeySearching || showAllApikey
      ? visibleApikeyAll
      : visibleApikeyAll.slice(0, APIKEY_INITIAL_VISIBLE);
  const hiddenApikeyCount = visibleApikeyAll.length - visibleApikey.length;

  const hasAnyResult =
    visibleOauth.length > 0 ||
    visibleFree.length > 0 ||
    visibleFreeTier.length > 0 ||
    visibleApikey.length > 0 ||
    compatibleProviders.length > 0 ||
    anthropicCompatibleProviders.length > 0;

  if (loading) {
    return (
      <div className="frost-bg flex min-w-0 flex-col gap-6 px-1 sm:px-0">
        <div className="glass-skeleton h-14 w-full" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-skeleton h-32 w-full" />
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
      compact={displayMode === PROVIDER_DISPLAY_MODES.COMPACT}
      onToggle={(active) => handleToggleProvider(entry.key ?? entry.id, entry.authTypes, active)}
      onTest={(pid) => handleBatchTest("provider", pid)}
      testing={testingMode === `provider:${entry.key ?? entry.id}`}
    />
  );

  const sectionTestButton = (mode, label = "Test All") => (
    <button
      onClick={() => handleBatchTest(mode)}
      disabled={!!testingMode}
      className={`glass-btn glass-btn-sm w-full sm:w-auto ${
        testingMode === mode ? "glass-btn-primary animate-pulse" : ""
      }`}
      title={`Test all ${mode} connections`}
    >
      <span className={`material-symbols-outlined text-[14px] ${testingMode === mode ? "animate-spin" : ""}`}>
        play_arrow
      </span>
      {testingMode === mode ? "Testing…" : label}
    </button>
  );

  const sectionHeader = (title, action) => (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="flex items-center gap-2 text-lg font-semibold leading-tight text-text-main sm:text-xl">
        {title}
      </h2>
      {action}
    </div>
  );

  return (
    <div className="frost-bg flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Page header + display mode */}
      <div className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10">
            <span className="material-symbols-outlined text-[22px] text-blue-500">dns</span>
          </span>
          <div>
            <h1 className="text-lg font-semibold text-text-main">Providers</h1>
            <p className="text-xs text-text-muted">
              {connections.length} connection{connections.length === 1 ? "" : "s"} ·{" "}
              {Object.keys(APIKEY_PROVIDERS).length + Object.keys(OAUTH_PROVIDERS).length + Object.keys(FREE_PROVIDERS).length + Object.keys(FREE_TIER_PROVIDERS).length} available
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDisplayMode(opt.value)}
                className={`flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  displayMode === opt.value
                    ? "bg-blue-500/20 text-blue-600 dark:text-blue-300"
                    : "text-text-muted hover:text-text-main"
                }`}
                title={`Display: ${opt.label}`}
              >
                <span className="material-symbols-outlined text-[14px]">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
          {sectionTestButton("all", "Test Everything")}
        </div>
      </div>

      {!hasAnyResult && (
        <div className="rounded-xl border border-dashed border-border py-8 text-center">
          <span className="material-symbols-outlined mb-2 block text-[32px] text-text-muted">
            search_off
          </span>
          <p className="text-sm text-text-muted">
            No providers match your search{displayMode === PROVIDER_DISPLAY_MODES.CONFIGURED ? " (Configured view — switch to All to see every provider)" : ""}
          </p>
        </div>
      )}

      {/* Custom Providers (OpenAI/Anthropic Compatible) — dynamic */}
      <div className="flex flex-col gap-4">
        {sectionHeader(
          "Custom Providers (OpenAI/Anthropic Compatible)",
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
            <Button size="sm" variant="secondary" icon="add" onClick={() => setShowAddCompatibleModal(true)} className="w-full sm:w-auto">
              Add OpenAI Compatible
            </Button>
            <Button size="sm" icon="add" onClick={() => setShowAddAnthropicCompatibleModal(true)} className="w-full sm:w-auto">
              Add Anthropic Compatible
            </Button>
          </div>
        )}
        {compatibleProviders.length === 0 && anthropicCompatibleProviders.length === 0 ? (
          <div className="glass-card-compact flex items-center justify-center gap-2 text-sm text-text-muted">
            <span className="material-symbols-outlined text-[18px]">extension</span>
            No custom providers — use buttons above to add OpenAI/Anthropic compatible endpoints
          </div>
        ) : (
          <div className={displayMode === PROVIDER_DISPLAY_MODES.COMPACT ? "flex flex-col gap-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"}>
            {[...compatibleProviders.map((p) => ({ id: p.id, info: p, stats: getProviderStats(p.id, "apikey"), authTypes: "apikey" })),
              ...anthropicCompatibleProviders.map((p) => ({ id: p.id, info: p, stats: getProviderStats(p.id, "apikey"), authTypes: "apikey" }))].map((entry) => (
              <RichProviderCard
                key={entry.id}
                providerId={entry.id}
                provider={entry.info}
                stats={entry.stats}
                category="compatible"
                compact={displayMode === PROVIDER_DISPLAY_MODES.COMPACT}
                onToggle={(active) => handleToggleProvider(entry.id, "apikey", active)}
                onTest={(pid) => handleBatchTest("provider", pid)}
                testing={testingMode === `provider:${entry.id}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* OAuth Providers */}
      {visibleOauth.length > 0 && (
        <div className="flex flex-col gap-4">
          {sectionHeader(
            <span className="flex items-center gap-2">
              OAuth Providers
              <Badge variant="info" size="sm">{visibleOauth.length}</Badge>
            </span>,
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <ModelAvailabilityBadge />
              {sectionTestButton("oauth")}
            </div>
          )}
          <div className={displayMode === PROVIDER_DISPLAY_MODES.COMPACT ? "flex flex-col gap-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"}>
            {visibleOauth.map((entry) => renderCard(entry, "oauth"))}
          </div>
        </div>
      )}

      {/* Free Tier Providers */}
      {(visibleFree.length > 0 || visibleFreeTier.length > 0) && (
        <div className="flex flex-col gap-4">
          {sectionHeader(
            <span className="flex items-center gap-2">
              Free Tier Providers
              <Badge variant="success" size="sm">{visibleFree.length + visibleFreeTier.length}</Badge>
            </span>,
            sectionTestButton("free")
          )}
          <div className={displayMode === PROVIDER_DISPLAY_MODES.COMPACT ? "flex flex-col gap-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"}>
            {visibleFree.map((entry) => renderCard(entry, entry.info.noAuth ? "noAuth" : "free"))}
            {visibleFreeTier.map((entry) => renderCard(entry, "freeTier"))}
          </div>
        </div>
      )}

      {/* API Key Providers */}
      {visibleApikey.length > 0 && (
        <div className="flex flex-col gap-4">
          {sectionHeader(
            <span className="flex items-center gap-2">
              API Key Providers
              <Badge variant="default" size="sm">{visibleApikeyAll.length}</Badge>
            </span>,
            sectionTestButton("apikey")
          )}
          <div className={displayMode === PROVIDER_DISPLAY_MODES.COMPACT ? "flex flex-col gap-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"}>
            {visibleApikey.map((entry) => renderCard(entry, "apikey"))}
          </div>
          {!isApikeySearching && !showAllApikey && hiddenApikeyCount > 0 && (
            <button
              onClick={() => setShowAllApikey(true)}
              className="glass-btn w-full justify-center border-dashed py-2.5 text-sm"
            >
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
              Show all {visibleApikeyAll.length} providers
            </button>
          )}
        </div>
      )}

      {/* Phase 6 — Routing & Fallbacks */}
      <div className="flex flex-col gap-4">
        <button
          onClick={() => setShowRoutingFallbacks((v) => !v)}
          className="glass-card flex items-center justify-between p-4 text-left transition-colors"
        >
          <span className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10">
              <span className="material-symbols-outlined text-[20px] text-violet-500">route</span>
            </span>
            <span>
              <span className="block text-sm font-semibold text-text-main">Routing & Fallbacks</span>
              <span className="block text-xs text-text-muted">
                Provider priority ordering, rate limits, cost thresholds, fallback chains, health checks
              </span>
            </span>
          </span>
          <span className={`material-symbols-outlined text-[20px] text-text-muted transition-transform ${showRoutingFallbacks ? "rotate-180" : ""}`}>
            expand_more
          </span>
        </button>
        {showRoutingFallbacks && (
          <RoutingFallbacksCard providerNodes={providerNodes} connections={connections} />
        )}
      </div>

      {/* Modals */}
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
          setShowAddAnthropicCompatibleModal(false);
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
