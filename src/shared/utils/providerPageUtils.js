// Provider page utilities — Phase 1/3 helpers shared by the providers list
// page, provider cards, and the connections panel.

import { getProviderConnectionFamilyIds } from "@/shared/constants/providerRegistry";

/** Display modes for the providers page (Phase 1.7). */
export const PROVIDER_DISPLAY_MODES = {
  ALL: "all",
  CONFIGURED: "configured",
  COMPACT: "compact",
};

export const DISPLAY_MODE_STORAGE_KEY = "zrouter.providerDisplayMode";

/**
 * Does this connection belong to the provider card (family-aware)?
 * @param {object} connection
 * @param {string} providerId
 * @param {string} [authType] - optional auth-type constraint (oauth/apikey/cookie)
 */
export function connectionMatchesProviderCard(connection, providerId, authType) {
  if (!connection) return false;
  if (authType === "oauth" && connection.authType !== "oauth") return false;
  if (authType === "apikey" && connection.authType === "oauth") return false;
  if (authType === "cookie" && connection.authType !== "cookie") return false;
  return getProviderConnectionFamilyIds(providerId).includes(connection.provider);
}

/**
 * Search match over name + id + family aliases.
 * @param {string} query
 * @param {object} entry - {id, name}
 */
export function providerMatchesSearch(query, entry) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;
  if (entry.name && entry.name.toLowerCase().includes(q)) return true;
  if (entry.id && entry.id.toLowerCase().includes(q)) return true;
  const alias = entry.alias || "";
  return !!alias && alias.toLowerCase().includes(q);
}

/**
 * Filter entries by display mode.
 * @param {Array<object>} entries - {providerId, stats}
 * @param {string} mode
 */
export function filterEntriesByDisplayMode(entries, mode) {
  if (mode === PROVIDER_DISPLAY_MODES.CONFIGURED) {
    return entries.filter((e) => Number(e.stats?.total || 0) > 0);
  }
  return entries;
}

/**
 * Simple client-side pagination.
 * @param {Array} items
 * @param {number} page - 0-based
 * @param {number} pageSize
 * @returns {{pageItems:Array,totalPages:number,totalItems:number,pageStart:number,pageEnd:number}}
 */
export function paginateItems(items, page, pageSize) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageStart = safePage * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, totalItems);
  return {
    pageItems: items.slice(pageStart, pageEnd),
    totalPages,
    totalItems,
    pageStart,
    pageEnd,
    clampedPage: safePage,
  };
}

/**
 * Case-insensitive substring filter over connection id/name/email/tag.
 * Port of OmniRoute filterConnectionsByQuery().
 */
export function filterConnectionsByQuery(query, connections) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return connections;
  return connections.filter((c) => {
    const tag = c.providerSpecificData?.tag;
    return (
      (c.id || "").toLowerCase().includes(q) ||
      (c.name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.displayName || "").toLowerCase().includes(q) ||
      (tag || "").toLowerCase().includes(q)
    );
  });
}

/**
 * Read a boolean toggle that may be stored as a string.
 */
export function readBooleanToggle(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1";
  return value === 1;
}

/**
 * "1 account" / "3 accounts" / "1 selected" …
 */
export function providerCountText(count, singular, plural) {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`;
}

/**
 * Sort connections by priority (stable for equal priorities).
 */
export function sortConnectionsByPriority(connections) {
  return [...(connections || [])].sort((a, b) => (a.priority || 0) - (b.priority || 0));
}
