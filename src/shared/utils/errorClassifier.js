// Error Classification Engine — Phase 4 of the ZESRouter dashboard rebuild.
//
// Ports OmniRoute's getConnectionErrorTag() + ConnectionRow.inferErrorType():
// every connection is classified into exactly one error type with a short
// tag (AUTH / 429 / 5XX / NET / RUNTIME / ERR), a badge variant, and a
// human-readable label.
//
// Classification precedence:
//   1. Cooldown in progress            → RATE_LIMITED
//   2. terminal testStatus (banned, credits_exhausted)
//   3. explicit lastErrorType
//   4. numeric errorCode (401/403 → AUTH, 429 → RATE_LIMITED, 5xx → SERVER)
//   5. error message heuristics
//   6. UNKNOWN

import { ERROR_TYPES, classifyErrorType } from "@/shared/constants/errorTypes";
import { getErrorCode } from "@/shared/utils";

const AUTH_MSG = /invalid api key|token invalid|revoked|unauthorized|access denied|authentication|credentials? (expired|invalid)|401\b|403\b/;
const RATE_MSG = /rate limit|quota|too many requests|\b429\b|limit exceeded|exceeded your current quota/i;
const RUNTIME_MSG = /runtime|not runnable|not installed|model (not )?not found|model_not_found|healthcheck/i;
const NETWORK_MSG = /fetch failed|network|timeout|timed out|econn|enotfound|eai_again|socket|dns/i;
const CREDITS_MSG = /no credits?|insufficient (credits?|balance|funds)|out of credits|balance (is )?(too low|exhausted)|usage (has )?exceeded/i;
const EXPIRED_MSG = /token expired|expired|session expired/i;

/**
 * Infer the low-level error type from a connection record.
 * Mirrors OmniRoute ConnectionRow.inferErrorType().
 * @param {object} connection
 * @param {boolean} isCooldown - whether the connection is in rate-limit cooldown
 * @returns {string|null} low-level type (e.g. "upstream_auth_error") or null
 */
export function inferConnectionErrorType(connection, isCooldown = false) {
  if (!connection) return null;
  if (isCooldown) return "upstream_rate_limited";
  if (connection.testStatus === "banned") return "banned";
  if (connection.testStatus === "credits_exhausted") return "credits_exhausted";
  if (connection.lastErrorType) return connection.lastErrorType;

  const code = Number(connection.errorCode);
  if (code === 401 || code === 403) return "upstream_auth_error";
  if (code === 429) return "upstream_rate_limited";
  if (Number.isFinite(code) && code >= 500) return "upstream_unavailable";

  const msg = (connection.lastError || "").toLowerCase();
  if (!msg) return null;

  if (RUNTIME_MSG.test(msg)) return "runtime_error";
  if (/refresh failed/.test(msg)) return "token_refresh_failed";
  if (EXPIRED_MSG.test(msg)) return "token_expired";
  if (AUTH_MSG.test(msg)) return "upstream_auth_error";
  if (CREDITS_MSG.test(msg)) return "credits_exhausted";
  if (RATE_MSG.test(msg)) return "upstream_rate_limited";
  if (NETWORK_MSG.test(msg)) return "network_error";
  if (/not supported/.test(msg)) return "unsupported";
  return "upstream_error";
}

/**
 * Classify a connection into one of the ERROR_TYPES taxonomy entries.
 * @param {object} connection - provider connection record
 * @param {{isCooldown?: boolean}} [opts]
 * @returns {{id:string,label:string,tag:string,variant:string,color:string,code:(string|number|null),description:string}}
 */
export function classifyConnectionError(connection, { isCooldown = false } = {}) {
  const rawType = inferConnectionErrorType(connection, isCooldown);
  if (!rawType) {
    const unknown = ERROR_TYPES.UNKNOWN;
    return { ...unknown, code: null };
  }

  const id = classifyErrorType(rawType);
  const base = ERROR_TYPES[id];
  const code = connection?.errorCode ?? null;
  return {
    ...base,
    rawType,
    code: Number.isFinite(Number(code)) && Number(code) >= 400 ? Number(code) : null,
  };
}

/**
 * Short tag for list views — port of OmniRoute's getConnectionErrorTag().
 * AUTH (401/403) → "AUTH", RATE_LIMITED (429) → "429", SERVER (5xx) → "5XX",
 * NETWORK → "NET", RUNTIME → "RUNTIME", UNKNOWN → "ERR".
 * @param {object} connection
 * @param {boolean} [isCooldown]
 * @returns {string|null}
 */
export function getConnectionErrorTag(connection, isCooldown = false) {
  if (!connection) return null;
  const cls = classifyConnectionError(connection, { isCooldown });
  if (cls.id === "UNKNOWN" && !connection.lastError && !connection.lastErrorType) return null;
  return cls.tag;
}

/**
 * Compute a provider-level health status from its connections.
 * @param {Array<object>} connections
 * @returns {'none'|'healthy'|'degraded'|'offline'}
 */
export function getProviderHealth(connections) {
  const list = (connections || []).filter((c) => c.isActive !== false);
  if (list.length === 0) return "none";

  const connected = list.filter(
    (c) => !c.testStatus || c.testStatus === "active" || c.testStatus === "success"
  );
  const inCooldown = list.filter((c) => isConnectionInCooldown(c));
  const errored = list.length - connected.length;

  if (connected.length === 0) {
    return inCooldown.length > 0 ? "degraded" : "offline";
  }
  // Every usable connection is in cooldown → provider is temporarily degraded
  if (inCooldown.length > 0 && errored === 0 && inCooldown.length === connected.length) {
    return "degraded";
  }
  if (errored === 0) return "healthy";
  if (connected.length >= list.length / 2) return "degraded";
  return "offline";
}

export const PROVIDER_HEALTH = {
  healthy: { label: "Healthy", variant: "success", color: "#22c55e" },
  degraded: { label: "Degraded", variant: "warning", color: "#f59e0b" },
  offline: { label: "Offline", variant: "error", color: "#ef4444" },
  none: { label: "No connections", variant: "default", color: "#6b7280" },
};

/**
 * Is the connection currently in rate-limit cooldown?
 * @param {object} connection
 */
export function isConnectionInCooldown(connection) {
  return !!(
    connection &&
    connection.rateLimitedUntil &&
    new Date(connection.rateLimitedUntil).getTime() > Date.now() &&
    connection.isActive !== false
  );
}

/**
 * Human-readable remaining cooldown time.
 * @param {string} until - ISO timestamp
 * @returns {string} e.g. "5m 12s" / "" when expired
 */
export function formatCooldownRemaining(until) {
  if (!until) return "";
  const diff = new Date(until).getTime() - Date.now();
  if (diff <= 0) return "";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  return `${hrs}h ${mins}m`;
}

/**
 * Aggregate stats for a provider card (OmniRoute getProviderStats port).
 * @param {Array<object>} connections - ALL connections
 * @param {string} providerId
 * @param {Array<string>} familyIds - getProviderConnectionFamilyIds(providerId)
 * @returns {object}
 */
export function getProviderStats(connections, providerId, familyIds) {
  const family = familyIds && familyIds.length ? familyIds : [providerId];
  const familySet = new Set(family);
  const providerConnections = (connections || []).filter((c) => familySet.has(c.provider));

  const connected = providerConnections.filter(
    (c) =>
      c.isActive !== false &&
      (!c.testStatus || c.testStatus === "active" || c.testStatus === "success")
  ).length;

  const errorConns = providerConnections.filter((c) => {
    if (c.isActive === false) return false;
    return c.testStatus && !["active", "success"].includes(c.testStatus);
  });
  const error = errorConns.length;
  const total = providerConnections.length;
  const allDisabled = total > 0 && providerConnections.every((c) => c.isActive === false);

  // Cooldown among active connections
  const cooldownConns = providerConnections.filter((c) => isConnectionInCooldown(c));
  const inCooldown = cooldownConns.length > 0;
  let cooldownUntil = null;
  for (const c of cooldownConns) {
    const t = new Date(c.rateLimitedUntil).getTime();
    if (!cooldownUntil || t < new Date(cooldownUntil).getTime()) cooldownUntil = c.rateLimitedUntil;
  }

  // Latest error info (by lastErrorAt)
  const latestError = errorConns
    .slice()
    .sort(
      (a, b) =>
        new Date(b.lastErrorAt || b.lastTested || 0).getTime() -
        new Date(a.lastErrorAt || a.lastTested || 0).getTime()
    )[0] || null;

  const errorCode = latestError ? getConnectionErrorTag(latestError) : null;
  const errorTime = latestError?.lastErrorAt || latestError?.lastTested || null;

  const health = getProviderHealth(providerConnections);

  return {
    total,
    connected,
    error,
    warning: cooldownConns.length,
    allDisabled,
    inCooldown,
    cooldownUntil,
    health,
    latestError: latestError?.lastError || null,
    errorCode,
    errorTime,
  };
}

export { getErrorCode };
