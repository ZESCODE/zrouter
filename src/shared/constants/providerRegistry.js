// Dynamic provider registry — Phase 3 of the ZESRouter dashboard rebuild.
//
// Wraps the open-sse provider REGISTRY (via @/shared/constants/providers) with
// the OmniRoute-grade registry conveniences the dashboard needs:
//   - provider categories (OAuth / API Key / Free / Web-Cookie / Compatible / No-Auth)
//   - provider family aliases (one dashboard card, several backend IDs)
//   - service kind mapping
//   - provider metadata (name, color, icon, website, textIcon)
//   - free-tier tracking

import {
  AI_PROVIDERS,
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  getProviderByAlias,
  resolveProviderId,
  getProviderAlias,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/shared/constants/providers";
import { getProviderServiceKinds, isLlmServiceKind } from "./serviceKinds";

// ── Provider categories ─────────────────────────────────────────────────────

export const PROVIDER_CATEGORIES = [
  { id: "oauth", label: "OAuth", dotColor: "#3b82f6" },
  { id: "apikey", label: "API Key", dotColor: "#f59e0b" },
  { id: "free", label: "Free", dotColor: "#22c55e" },
  { id: "freeTier", label: "Free Tier", dotColor: "#22c55e" },
  { id: "webCookie", label: "Web Cookie", dotColor: "#a855f7" },
  { id: "compatible", label: "Compatible", dotColor: "#fb923c" },
  { id: "noAuth", label: "No Auth", dotColor: "#78716c" },
];

export const CATEGORY_DOT_COLORS = Object.fromEntries(
  PROVIDER_CATEGORIES.map((c) => [c.id, c.dotColor])
);

/**
 * Which category bucket a provider id belongs to (for the dot on cards).
 * @param {string} providerId
 * @returns {string} one of PROVIDER_CATEGORIES ids
 */
export function getProviderCategory(providerId) {
  if (isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId)) {
    return "compatible";
  }
  const entry = AI_PROVIDERS[providerId];
  if (!entry) return "apikey";
  if (FREE_PROVIDERS[providerId]) return "free";
  if (FREE_TIER_PROVIDERS[providerId]) return "freeTier";
  if (entry.noAuth) return "noAuth";
  if (OAUTH_PROVIDERS[providerId] && !APIKEY_PROVIDERS[providerId]) return "oauth";
  if (APIKEY_PROVIDERS[providerId]) return "apikey";
  if (WEB_COOKIE_PROVIDERS[providerId]) return "webCookie";
  if (entry.authType === "oauth" && !entry.hasOAuth) return "oauth";
  if (entry.hasOAuth || entry.authType === "oauth") return "oauth";
  return "apikey";
}

// ── Provider family aliases ─────────────────────────────────────────────────
//
// Backend provider IDs that are managed from one dashboard provider family.
// Family members intentionally remain distinct in the registry and database:
// e.g. a compatible node id vs its base provider. Consumers that need to list
// or test every connection for a family should use
// getProviderConnectionFamilyIds() rather than duplicating this map.

export const PROVIDER_CONNECTION_FAMILY_ALIASES = {
  // Claude Code compatible nodes are a family of the Claude provider in the UI
  "anthropic-compatible": ["anthropic"],
  alibaba: ["alibaba-cn"],
  glm: ["glm-cn"],
  minimax: ["minimax-cn"],
};

export function getProviderConnectionFamilyIds(providerId) {
  if (typeof providerId !== "string" || providerId.length === 0) return [];
  return [providerId, ...(PROVIDER_CONNECTION_FAMILY_ALIASES[providerId] || [])];
}

// ── Registry entry resolution ───────────────────────────────────────────────

/**
 * Resolve a full registry entry for a provider id (or compatible-node id).
 * Compatible node ids (openai-compatible-<id>) resolve to a synthesized entry
 * based on the provider node name.
 *
 * @param {string} providerId
 * @param {{name?: string, apiType?: string, color?: string}} [nodeOverride]
 * @returns {object|null}
 */
export function getProviderRegistryEntry(providerId, nodeOverride) {
  if (!providerId) return null;
  const resolvedId = resolveProviderId(providerId);
  const entry = AI_PROVIDERS[resolvedId] || AI_PROVIDERS[providerId] || null;

  if (isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId)) {
    const isCC = providerId.startsWith("anthropic-compatible-cc-");
    const isAnthropic = isAnthropicCompatibleProvider(providerId);
    return {
      id: providerId,
      name: nodeOverride?.name || providerId.replace(/^(openai|anthropic)-compatible(-cc)?-/, "").replace(/-/g, " "),
      color: nodeOverride?.color || (isAnthropic ? "#D97757" : "#616A6B"),
      icon: nodeOverride?.icon || (isAnthropic ? "smart_toy" : "open_in_new"),
      textIcon: nodeOverride?.textIcon || (isAnthropic ? "AC" : isCC ? "CC" : "OC"),
      website: null,
      category: "compatible",
      serviceKinds: nodeOverride?.serviceKinds,
      compatible: true,
      apiType: nodeOverride?.apiType || "chat",
      hasFree: false,
    };
  }

  if (!entry) {
    // Unknown / custom provider — synthesize a minimal entry.
    return {
      id: providerId,
      name: nodeOverride?.name || providerId,
      color: nodeOverride?.color || "#64748b",
      icon: nodeOverride?.icon || "dns",
      textIcon: nodeOverride?.textIcon || providerId.slice(0, 2).toUpperCase(),
      website: null,
      category: "apikey",
      serviceKinds: undefined,
      hasFree: false,
    };
  }

  return {
    id: entry.id,
    name: entry.name,
    color: entry.color || "#64748b",
    icon: entry.icon || "dns",
    textIcon: entry.textIcon,
    website: entry.website || null,
    category: getProviderCategory(entry.id),
    serviceKinds: entry.serviceKinds,
    hiddenKinds: entry.hiddenKinds,
    hasFree: entry.hasFree === true || !!FREE_TIER_PROVIDERS[entry.id],
    freeNote: entry.freeNote,
    deprecated: entry.deprecated === true,
    deprecationReason: entry.deprecationReason,
    noAuth: entry.noAuth === true,
    displayMode: entry.displayMode,
  };
}

/** All service kinds a provider supports (defaults to ["llm"]). */
export function getRegistryServiceKinds(providerId, nodeOverride) {
  return getProviderServiceKinds(getProviderRegistryEntry(providerId, nodeOverride));
}

/** LLM-capable providers only (enables Test buttons etc.). */
export function isLlmProvider(providerId, nodeOverride) {
  return isLlmServiceKind(getProviderRegistryEntry(providerId, nodeOverride));
}

// ── Free tier tracking ──────────────────────────────────────────────────────

export function isFreeTierProvider(providerId) {
  return !!FREE_TIER_PROVIDERS[providerId] || !!FREE_PROVIDERS[providerId];
}

// ── Re-exports for importers that expect the classic helpers ────────────────

export {
  AI_PROVIDERS,
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  getProviderByAlias,
  resolveProviderId,
  getProviderAlias,
};
