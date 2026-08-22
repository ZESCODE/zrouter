"use client";

// ConnectionRow — Phase 2: rich connection row with inline actions.
//
// Features:
//   - selection checkbox (bulk operations)
//   - priority reorder (up/down swap)
//   - status badge from the error classification engine
//   - error type inference from testStatus, lastErrorType, HTTP codes
//   - live cooldown timer
//   - rate-limit protection toggle
//   - proxy visibility (pool / legacy connection proxy)
//   - per-row actions: retest, enable/disable, edit, delete
//
// Built on the ZES Frost Design System.

import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { Badge, Toggle, Tooltip } from "@/shared/components";
import useErrorClassification from "@/shared/hooks/useErrorClassification";
import { readBooleanToggle } from "@/shared/utils/providerPageUtils";
import CooldownTimer from "./CooldownTimer";
import ErrorClassificationBadge from "./ErrorClassificationBadge";

const STATUS_LABELS = {
  connected: "Connected",
  disabled: "Disabled",
  auth_failed: "Auth failed",
  rate_limited: "Rate limited",
  server_error: "Server error",
  network_issue: "Network issue",
  runtime_issue: "Runtime issue",
  credits_exhausted: "Out of credits",
  banned: "Banned",
  deactivated: "Deactivated",
  unknown_error: "Error",
};

function getStatusVariant(connection, isCooldown) {
  if (connection.isActive === false) return "default";
  const status = isCooldown
    ? "rate_limited"
    : connection.testStatus === "active" || connection.testStatus === "success" || !connection.testStatus
      ? "connected"
      : connection.testStatus === "banned"
        ? "banned"
        : connection.testStatus === "credits_exhausted"
          ? "credits_exhausted"
          : connection.testStatus === "unavailable"
            ? "server_error"
            : connection.testStatus;

  if (status === "connected") return "success";
  const byLabel = {
    auth_failed: "error",
    rate_limited: "warning",
    server_error: "error",
    network_issue: "warning",
    runtime_issue: "info",
    credits_exhausted: "warning",
    banned: "error",
    deactivated: "error",
    unknown_error: "error",
  };
  return byLabel[status] || "error";
}

export default function ConnectionRow({
  connection,
  isOAuth = false,
  isFirst = false,
  isLast = false,
  isSelected = false,
  onToggleSelect,
  onMoveUp,
  onMoveDown,
  onToggleActive,
  onToggleRateLimit,
  onToggleQuotaVisibility,
  onRetest,
  isRetesting = false,
  onEdit,
  onDelete,
  onProxy,
  proxyPools = null,
  onUpdateProxy,
  autoPing = null,
  oneByOneStatus = null,
}) {
  const { classification, isCooldown, cooldownRemaining } = useErrorClassification(connection);
  const [showProxyInfo, setShowProxyInfo] = useState(false);
  const [showProxyDropdown, setShowProxyDropdown] = useState(false);
  const [updatingProxy, setUpdatingProxy] = useState(false);
  const proxyDropdownRef = useRef(null);

  const proxyPoolMap = new Map((proxyPools || []).map((pool) => [pool.id, pool]));
  const boundProxyPoolId = connection.providerSpecificData?.proxyPoolId || null;
  // Pool-aware binding; fall back to the raw id when pools aren't loaded.
  const boundProxyPool = boundProxyPoolId
    ? (proxyPoolMap.get(boundProxyPoolId) || { id: boundProxyPoolId, name: boundProxyPoolId, isActive: true })
    : null;

  // Close proxy dropdown when clicking outside
  useEffect(() => {
    if (!showProxyDropdown) return;
    const handler = (e) => {
      if (proxyDropdownRef.current && !proxyDropdownRef.current.contains(e.target)) {
        setShowProxyDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProxyDropdown]);

  const handleSelectProxy = async (poolId) => {
    if (!onUpdateProxy) return;
    setUpdatingProxy(true);
    try {
      await onUpdateProxy(poolId === "__none__" ? null : poolId);
    } finally {
      setUpdatingProxy(false);
      setShowProxyDropdown(false);
    }
  };

  const displayName =
    connection.name ||
    connection.email ||
    connection.displayName ||
    (isOAuth ? "OAuth Account" : "API Key");

  const statusLabel =
    connection.isActive === false
      ? "Disabled"
      : STATUS_LABELS[
          isCooldown
            ? "rate_limited"
            : connection.testStatus === "active" || connection.testStatus === "success" || !connection.testStatus
              ? "connected"
              : connection.testStatus === "banned"
                ? "banned"
                : connection.testStatus === "credits_exhausted"
                  ? "credits_exhausted"
                  : connection.testStatus === "unavailable"
                    ? "server_error"
                    : connection.testStatus
        ] || connection.testStatus || "Unknown";

  const variant = getStatusVariant(connection, isCooldown);
  const hasError = connection.isActive !== false &&
    (connection.lastError || classification.rawType || (connection.testStatus && !["active", "success"].includes(connection.testStatus)));

  const rateLimitEnabled = readBooleanToggle(connection.providerSpecificData?.rateLimitProtection, false);
  const quotaVisible = readBooleanToggle(connection.quotaVisible, true);
  const psd = connection.providerSpecificData || {};
  const hasLegacyProxy = psd.connectionProxyEnabled === true && !!psd.connectionProxyUrl;
  const hasAnyProxy = !!boundProxyPool || hasLegacyProxy;

  const oneByOneLabel = oneByOneStatus
    ? oneByOneStatus.state === "success"
      ? "success"
      : oneByOneStatus.state === "failed"
        ? `failed${oneByOneStatus.error ? `: ${oneByOneStatus.error.slice(0, 40)}` : ""}`
        : oneByOneStatus.state === "testing"
          ? "testing…"
          : "queued"
    : null;

  return (
    <div
      className={`group flex flex-col gap-2 rounded-lg p-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] lg:flex-row lg:items-center lg:justify-between ${
        connection.isActive === false ? "opacity-60" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border accent-blue-500"
            aria-label={`Select ${displayName}`}
          />
        )}
        {/* Priority arrows */}
        <div className="flex shrink-0 flex-col">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className={`rounded p-0.5 ${isFirst ? "cursor-not-allowed text-text-subtle/40" : "text-text-muted hover:bg-surface-2 hover:text-primary"}`}
            title="Move up (higher priority)"
          >
            <span className="material-symbols-outlined text-sm">keyboard_arrow_up</span>
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className={`rounded p-0.5 ${isLast ? "cursor-not-allowed text-text-subtle/40" : "text-text-muted hover:bg-surface-2 hover:text-primary"}`}
            title="Move down (lower priority)"
          >
            <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
          </button>
        </div>
        <span className="material-symbols-outlined mt-0.5 shrink-0 text-base text-text-muted">
          {connection.authType === "cookie" ? "cookie" : isOAuth ? "lock" : "key"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-main" title={displayName}>
            {displayName}
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge variant={variant} size="sm" dot>
              {statusLabel}
            </Badge>
            {hasError && (
              <ErrorClassificationBadge classification={classification} code={connection.errorCode} />
            )}
            {isCooldown && connection.isActive !== false && (
              <CooldownTimer until={connection.rateLimitedUntil} />
            )}
            <span className="text-[11px] text-text-subtle">#{connection.priority ?? 0}</span>
            {connection.globalPriority && (
              <span className="text-[11px] text-text-subtle">auto #{connection.globalPriority}</span>
            )}
            {oneByOneLabel && (
              <Badge
                variant={oneByOneStatus.state === "success" ? "success" : oneByOneStatus.state === "failed" ? "error" : "info"}
                size="sm"
              >
                {oneByOneLabel}
              </Badge>
            )}
            {hasAnyProxy && (
              <button
                onClick={() => setShowProxyInfo((v) => !v)}
                className="inline-flex items-center gap-0.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-blue-600 dark:text-blue-400"
                title={boundProxyPool ? `Proxy pool: ${boundProxyPool.name}` : "Connection proxy"}
              >
                <span className="material-symbols-outlined text-[11px] leading-none">vpn_key</span>
                {boundProxyPool ? boundProxyPool.name : "Proxy"}
              </button>
            )}
            {/* Proxy pool selector (detail page) */}
            {(proxyPools || []).length > 0 && onUpdateProxy && (
              <div className="relative" ref={proxyDropdownRef}>
                <button
                  onClick={() => setShowProxyDropdown((v) => !v)}
                  disabled={updatingProxy}
                  className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors ${
                    boundProxyPoolId
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "border-border-subtle bg-surface-2/50 text-text-subtle hover:text-text-muted"
                  }`}
                  title="Assign proxy pool"
                >
                  <span className={`material-symbols-outlined text-[11px] leading-none ${updatingProxy ? "animate-spin" : ""}`}>
                    {updatingProxy ? "progress_activity" : "lan"}
                  </span>
                  {boundProxyPoolId ? "Pool" : "No pool"}
                </button>
                {showProxyDropdown && (
                  <div className="absolute right-0 top-full z-50 mt-1 max-w-[78vw] min-w-[160px] rounded-lg border border-border bg-bg py-1 shadow-lg">
                    <button
                      onClick={() => handleSelectProxy("__none__")}
                      className={`w-full px-3 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5 ${!boundProxyPoolId ? "font-medium text-primary" : "text-text-main"}`}
                    >
                      None
                    </button>
                    {(proxyPools || []).map((pool) => (
                      <button
                        key={pool.id}
                        onClick={() => handleSelectProxy(pool.id)}
                        className={`w-full px-3 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5 ${boundProxyPoolId === pool.id ? "font-medium text-primary" : "text-text-main"}`}
                      >
                        {pool.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Auto-ping (5h window providers) */}
            {autoPing && (
              <Tooltip
                text={
                  autoPing.provider === "codex"
                    ? "Auto-starts the next 5h Codex window after reset by sending a tiny request. Consumes a small amount of quota."
                    : "When your 5h quota runs out, auto-sends a request the moment it resets so a new window starts right away."
                }
              >
                <button
                  onClick={() => autoPing.onToggle(!autoPing.on)}
                  className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors ${
                    autoPing.on
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "border-border-subtle bg-surface-2/50 text-text-subtle hover:text-text-muted"
                  }`}
                  title="Auto-ping on quota reset"
                >
                  <span className="material-symbols-outlined text-[11px] leading-none">bolt</span>
                  Auto-ping
                </button>
              </Tooltip>
            )}
            {/* Rate limit protection toggle */}
            {onToggleRateLimit && (
              <button
                onClick={() => onToggleRateLimit(!rateLimitEnabled)}
                className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors ${
                  rateLimitEnabled
                    ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                    : "border-border-subtle bg-surface-2/50 text-text-subtle hover:text-text-muted"
                }`}
                title={rateLimitEnabled ? "Rate-limit protection ON — click to disable" : "Rate-limit protection OFF — click to enable"}
              >
                <span className="material-symbols-outlined text-[11px] leading-none">shield</span>
                {rateLimitEnabled ? "Protected" : "No protection"}
              </button>
            )}
            {onToggleQuotaVisibility && (
              <button
                onClick={() => onToggleQuotaVisibility(!quotaVisible)}
                className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors ${
                  quotaVisible
                    ? "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                    : "border-border-subtle bg-surface-2/50 text-text-subtle hover:text-text-muted"
                }`}
                title={quotaVisible ? "Quota visible — click to hide" : "Quota hidden — click to show"}
              >
                <span className="material-symbols-outlined text-[11px] leading-none">visibility</span>
                Quota
              </button>
            )}
            {hasError && connection.lastError && (
              <span className="max-w-[280px] truncate text-[11px] text-red-500" title={connection.lastError}>
                {connection.lastError}
              </span>
            )}
          </div>
          {showProxyInfo && hasAnyProxy && (
            <div className="mt-1.5 rounded-lg border border-border-subtle bg-surface-2/40 p-2 text-[11px] text-text-muted">
              {boundProxyPool ? (
                <p>
                  <span className="font-medium text-text-main">Pool:</span> {boundProxyPool.name}
                </p>
              ) : null}
              {hasLegacyProxy && (
                <p>
                  <span className="font-medium text-text-main">URL:</span>{" "}
                  <code className="break-all font-mono text-[10px]">{psd.connectionProxyUrl}</code>
                </p>
              )}
              {psd.connectionNoProxy && (
                <p>
                  <span className="font-medium text-text-main">no_proxy:</span> {psd.connectionNoProxy}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inline actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={onRetest}
          disabled={isRetesting || connection.isActive === false}
          className="glass-btn glass-btn-xs"
          title={
            isOAuth || connection.authType === "oauth"
              ? "Retest (auto-refreshes the OAuth token on demand)"
              : "Retest this connection"
          }
        >
          <span className={`material-symbols-outlined text-[12px] leading-none ${isRetesting ? "animate-spin" : ""}`}>
            {isRetesting ? "progress_activity" : "refresh"}
          </span>
          {isRetesting ? "Testing" : "Test"}
        </button>
        {onEdit && (
          <button onClick={onEdit} className="glass-btn glass-btn-xs" title="Edit connection">
            <span className="material-symbols-outlined text-[12px] leading-none">edit</span>
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="glass-btn glass-btn-xs glass-btn-destructive"
            title="Delete connection"
          >
            <span className="material-symbols-outlined text-[12px] leading-none">delete</span>
          </button>
        )}
        <Toggle
          size="sm"
          checked={connection.isActive ?? true}
          onChange={onToggleActive}
          title={(connection.isActive ?? true) ? "Disable connection" : "Enable connection"}
        />
      </div>
    </div>
  );
}

ConnectionRow.propTypes = {
  connection: PropTypes.shape({
    id: PropTypes.string,
    provider: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    displayName: PropTypes.string,
    authType: PropTypes.string,
    priority: PropTypes.number,
    globalPriority: PropTypes.number,
    isActive: PropTypes.bool,
    testStatus: PropTypes.string,
    lastError: PropTypes.string,
    lastErrorType: PropTypes.string,
    lastErrorAt: PropTypes.string,
    errorCode: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    rateLimitedUntil: PropTypes.string,
    providerSpecificData: PropTypes.object,
    quotaVisible: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
  }).isRequired,
  isOAuth: PropTypes.bool,
  isFirst: PropTypes.bool,
  isLast: PropTypes.bool,
  isSelected: PropTypes.bool,
  onToggleSelect: PropTypes.func,
  onMoveUp: PropTypes.func.isRequired,
  onMoveDown: PropTypes.func.isRequired,
  onToggleActive: PropTypes.func.isRequired,
  onToggleRateLimit: PropTypes.func,
  onToggleQuotaVisibility: PropTypes.func,
  onRetest: PropTypes.func.isRequired,
  isRetesting: PropTypes.bool,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
  onProxy: PropTypes.func,
  proxyPools: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      isActive: PropTypes.bool,
    })
  ),
  onUpdateProxy: PropTypes.func,
  autoPing: PropTypes.shape({
    on: PropTypes.bool,
    onToggle: PropTypes.func,
    provider: PropTypes.string,
  }),
  oneByOneStatus: PropTypes.shape({
    state: PropTypes.string,
    error: PropTypes.string,
  }),
};
