// Error classification taxonomy — OmniRoute-grade error engine constants.
// Every connection error is classified into exactly one of these types and
// rendered with the matching badge variant (see ErrorClassificationBadge).

export const ERROR_TYPES = {
  AUTH: {
    id: "AUTH",
    label: "Auth",
    longLabel: "Authentication error",
    badgeVariant: "error",
    tag: "AUTH",
    color: "#ef4444",
    description: "401/403 — invalid or expired credentials",
  },
  RATE_LIMITED: {
    id: "RATE_LIMITED",
    label: "Rate limited",
    longLabel: "Rate limit exceeded",
    badgeVariant: "warning",
    tag: "429",
    color: "#f97316",
    description: "429 — provider is throttling this account",
  },
  SERVER: {
    id: "SERVER",
    label: "Server error",
    longLabel: "Upstream server error",
    badgeVariant: "error",
    tag: "5XX",
    color: "#ef4444",
    description: "5xx — the upstream provider failed",
  },
  NETWORK: {
    id: "NETWORK",
    label: "Network",
    longLabel: "Network / timeout error",
    badgeVariant: "warning",
    tag: "NET",
    color: "#eab308",
    description: "Connection failed, DNS error, or timeout",
  },
  RUNTIME: {
    id: "RUNTIME",
    label: "Runtime",
    longLabel: "Runtime / model error",
    badgeVariant: "info",
    tag: "RUNTIME",
    color: "#3b82f6",
    description: "Model not found, not runnable, or CLI not installed",
  },
  CREDITS: {
    id: "CREDITS",
    label: "No credits",
    longLabel: "Credits exhausted",
    badgeVariant: "warning",
    tag: "CREDITS",
    color: "#f59e0b",
    description: "Account has run out of credits / quota",
  },
  BANNED: {
    id: "BANNED",
    label: "Banned",
    longLabel: "Account banned",
    badgeVariant: "error",
    tag: "BANNED",
    color: "#ef4444",
    description: "Account banned by the provider (403)",
  },
  DEACTIVATED: {
    id: "DEACTIVATED",
    label: "Deactivated",
    longLabel: "Account deactivated",
    badgeVariant: "error",
    tag: "OFF",
    color: "#ef4444",
    description: "Account deactivated or subscription cancelled",
  },
  UNKNOWN: {
    id: "UNKNOWN",
    label: "Error",
    longLabel: "Unknown error",
    badgeVariant: "default",
    tag: "ERR",
    color: "#6b7280",
    description: "Unclassified error",
  },
};

/**
 * Map a low-level error type string (lastErrorType / inferred type) to a
 * classification id.
 * @param {string} rawType
 * @returns {string} one of ERROR_TYPES ids
 */
export function classifyErrorType(rawType) {
  switch (rawType) {
    case "upstream_auth_error":
    case "auth_missing":
    case "token_refresh_failed":
    case "token_expired":
      return "AUTH";
    case "upstream_rate_limited":
      return "RATE_LIMITED";
    case "upstream_unavailable":
      return "SERVER";
    case "network_error":
      return "NETWORK";
    case "runtime_error":
      return "RUNTIME";
    case "credits_exhausted":
      return "CREDITS";
    case "banned":
      return "BANNED";
    case "account_deactivated":
      return "DEACTIVATED";
    default:
      return "UNKNOWN";
  }
}

/** Status → display presentation (label + badge variant) for a connection. */
export const STATUS_PRESENTATION = {
  connected: { label: "Connected", variant: "success" },
  disabled: { label: "Disabled", variant: "default" },
  auth_failed: { label: "Auth failed", variant: "error" },
  rate_limited: { label: "Rate limited", variant: "warning" },
  server_error: { label: "Server error", variant: "error" },
  network_issue: { label: "Network issue", variant: "warning" },
  runtime_issue: { label: "Runtime issue", variant: "info" },
  credits_exhausted: { label: "Out of credits", variant: "warning" },
  banned: { label: "Banned", variant: "error" },
  deactivated: { label: "Deactivated", variant: "error" },
  unknown_error: { label: "Error", variant: "error" },
};
