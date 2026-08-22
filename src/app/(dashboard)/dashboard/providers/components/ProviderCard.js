"use client";

// ProviderCard — Phase 1: rich provider card with
//   1. service kind badges (LLM, Embedding, Image, TTS, STT, Web Search, Video)
//   2. error classification engine (AUTH, RUNTIME, RATE_LIMITED, SERVER, NETWORK)
//   3. cooldown timer with live countdown
//   4. connection count badges (connected/total)
//   5. provider health status (healthy/degraded/offline)
//   6. quick actions (test, configure, view logs)
//   7. display mode aware (all / configured / compact)
//
// Built on the ZES Frost Design System (.glass-card).

import Link from "next/link";
import PropTypes from "prop-types";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { Toggle } from "@/shared/components";
import { getRelativeTime } from "@/shared/utils";
import { PROVIDER_HEALTH } from "@/shared/utils/errorClassifier";
import { CATEGORY_DOT_COLORS } from "@/shared/constants/providerRegistry";
import ServiceKindBadge from "./ServiceKindBadge";
import ErrorClassificationBadge from "./ErrorClassificationBadge";
import CooldownTimer from "./CooldownTimer";

const HEALTH_ICON = {
  healthy: "check_circle",
  degraded: "warning",
  offline: "error",
  none: "circle_outline",
};

const HEALTH_TEXT = {
  healthy: "text-green-600 dark:text-green-400",
  degraded: "text-orange-600 dark:text-orange-400",
  offline: "text-red-600 dark:text-red-400",
  none: "text-text-subtle",
};

export default function ProviderCard({
  providerId,
  provider,
  stats,
  category = "apikey",
  onToggle,
  onTest,
  testing = false,
  compact = false,
}) {
  const health = stats?.health || "none";
  const healthMeta = PROVIDER_HEALTH[health] || PROVIDER_HEALTH.none;
  const connected = Number(stats?.connected || 0);
  const error = Number(stats?.error || 0);
  const total = Number(stats?.total || 0);
  const allDisabled = !!stats?.allDisabled;

  const kinds = (provider.serviceKinds && provider.serviceKinds.length > 0
    ? provider.serviceKinds
    : ["llm"]
  )
    .filter((k) => !provider.hiddenKinds?.includes(k))
    .map((k) => ({
      id: k,
      label: KIND_LABELS[k] || k,
      short: KIND_SHORTS[k] || k,
      icon: KIND_ICONS[k] || "tag",
      color: KIND_COLORS[k] || "#9ca3af",
    }));

  const isCompatible = typeof providerId === "string" &&
    (providerId.startsWith("openai-compatible-") || providerId.startsWith("anthropic-compatible-"));

  const dotColor = CATEGORY_DOT_COLORS[category] || CATEGORY_DOT_COLORS.apikey;

  // ── Compact mode: single dense row ─────────────────────────────────────
  if (compact) {
    return (
      <Link
        href={`/dashboard/providers/${encodeURIComponent(providerId)}`}
        className="glass-card-compact group flex items-center gap-2.5 transition-all hover:border-white/15"
      >
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${provider.color || "#64748b"}22` }}
        >
          <ProviderIcon providerId={providerId} size={16} fallbackText={provider.textIcon || providerId.slice(0,2).toUpperCase()} fallbackColor={provider.color} />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text-main">
          {provider.name}
        </span>
        <span className={`material-symbols-outlined text-[14px] ${HEALTH_TEXT[health]}`} title={healthMeta.label}>
          {HEALTH_ICON[health]}
        </span>
        {total > 0 && (
          <span
            className="rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-green-600 dark:text-green-400"
            title={`${connected}/${total} connected`}
          >
            {connected}/{total}
          </span>
        )}
        {error > 0 && (
          <ErrorClassificationBadge
            classification={{
              id: "UNKNOWN",
              tag: stats?.errorCode || "ERR",
              variant: "error",
              color: "#ef4444",
              description: stats?.latestError || "error",
            }}
          />
        )}
        <span className="text-text-subtle opacity-0 transition-opacity group-hover:opacity-100">
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        </span>
      </Link>
    );
  }

  return (
    <div id={`provider-${providerId}`} className="flex h-full flex-col">
      <Link
        href={`/dashboard/providers/${encodeURIComponent(providerId)}`}
        className="group flex-1 focus-visible:outline-none"
      >
        <div
          className={`glass-card flex h-full flex-col gap-2.5 p-4 transition-all hover:border-white/15 group-focus-visible:ring-2 group-focus-visible:ring-blue-500/40 ${
            allDisabled ? "opacity-50" : ""
          } ${provider.deprecated ? "opacity-60" : ""}`}
        >
          {/* Row 1 — identity */}
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${provider.color || "#64748b"}22` }}
            >
              <ProviderIcon providerId={providerId} size={22} fallbackText={provider.textIcon || providerId.slice(0,2).toUpperCase()} fallbackColor={provider.color} />
            </span>
            <h3 className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-text-main">
              <span title={provider.name} className={provider.deprecated ? "line-through opacity-60" : ""}>
                {provider.name}
              </span>
            </h3>
            <span className="flex shrink-0 items-center gap-1 pt-0.5">
              {provider.deprecated && (
                <span className="material-symbols-outlined text-[15px] leading-none text-text-subtle" title={provider.deprecationReason || "Deprecated"}>
                  block
                </span>
              )}
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: dotColor }}
                title={category}
              />
            </span>
          </div>

          {/* Row 2 — capabilities: service kinds + compatibility */}
          {(kinds.length > 0 || isCompatible) && (
            <div className="flex flex-wrap items-center gap-1">
              {kinds.map((k) => (
                <ServiceKindBadge key={k.id} kind={k} size="xs" />
              ))}
              {isCompatible && (
                <span className="rounded-md border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-orange-600 dark:text-orange-400">
                  {providerId.startsWith("anthropic-compatible-") ? "Anthropic API" : "OpenAI API"}
                </span>
              )}
              {provider.hasFree && (
                <span className="rounded-md border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-green-600 dark:text-green-400">
                  Free
                </span>
              )}
            </div>
          )}

          {/* Row 3 — health + status + cooldown */}
          <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2">
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${HEALTH_TEXT[health]}`} title={`Provider status: ${healthMeta.label}`}>
              <span className="material-symbols-outlined text-[13px] leading-none">{HEALTH_ICON[health]}</span>
              {healthMeta.label}
            </span>
            {total > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400"
                title={`${connected} of ${total} connections healthy`}
              >
                <span className="size-1.5 rounded-full bg-green-500" />
                {connected}/{total}
              </span>
            )}
            {error > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400" title={stats?.latestError || "Some connections errored"}>
                <span className="size-1.5 rounded-full bg-red-500" />
                {error} error{error > 1 ? "s" : ""}
              </span>
            )}
            {stats?.inCooldown && stats.cooldownUntil && (
              <CooldownTimer until={stats.cooldownUntil} />
            )}
            {error > 0 && stats?.errorCode && (
              <ErrorClassificationBadge
                classification={{
                  id: "UNKNOWN",
                  tag: stats.errorCode,
                  variant: "error",
                  color: "#ef4444",
                  description: stats.latestError || "connection error",
                }}
              />
            )}
            {stats?.errorTime && (
              <span className="min-w-0 truncate text-[10px] text-text-subtle">
                {getRelativeTime(stats.errorTime)}
              </span>
            )}
            {total === 0 && <span className="text-[11px] text-text-subtle">No connections</span>}
          </div>
        </div>
      </Link>

      {/* Quick actions */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="glass-btn glass-btn-xs"
            onClick={() => onTest?.(providerId, provider)}
            disabled={testing || total === 0}
            title="Test connections"
          >
            <span className="material-symbols-outlined text-[12px] leading-none">play_arrow</span>
            Test
          </button>
          <Link
            href={`/dashboard/providers/${encodeURIComponent(providerId)}`}
            className="glass-btn glass-btn-xs"
            title="Configure provider"
          >
            <span className="material-symbols-outlined text-[12px] leading-none">settings</span>
            Configure
          </Link>
          <Link href="/dashboard/usage" className="glass-btn glass-btn-xs" title="View request logs">
            <span className="material-symbols-outlined text-[12px] leading-none">receipt_long</span>
            Logs
          </Link>
        </div>
        {total > 0 && onToggle && (
          <Toggle
            size="sm"
            checked={!allDisabled}
            onChange={() => onToggle(allDisabled)}
            title={allDisabled ? "Enable provider" : "Disable provider"}
          />
        )}
      </div>
    </div>
  );
}

// Service kind display maps (kept local to avoid a constants cycle)
const KIND_LABELS = {
  llm: "LLM",
  embedding: "Embedding",
  image: "Image",
  imageToText: "Image→Text",
  tts: "TTS",
  stt: "STT",
  webSearch: "Web Search",
  webFetch: "Web Fetch",
  video: "Video",
  music: "Music",
};
const KIND_SHORTS = {
  llm: "LLM",
  embedding: "Embed",
  image: "Image",
  imageToText: "I→T",
  tts: "TTS",
  stt: "STT",
  webSearch: "Search",
  webFetch: "Fetch",
  video: "Video",
  music: "Music",
};
const KIND_ICONS = {
  llm: "chat",
  embedding: "data_array",
  image: "brush",
  imageToText: "image_search",
  tts: "record_voice_over",
  stt: "mic",
  webSearch: "travel_explore",
  webFetch: "language",
  video: "movie",
  music: "music_note",
};
const KIND_COLORS = {
  llm: "#60a5fa",
  embedding: "#a78bfa",
  image: "#f472b6",
  imageToText: "#fb923c",
  tts: "#34d399",
  stt: "#2dd4bf",
  webSearch: "#fbbf24",
  webFetch: "#facc15",
  video: "#c084fc",
  music: "#818cf8",
};

ProviderCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  provider: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string.isRequired,
    color: PropTypes.string,
    serviceKinds: PropTypes.arrayOf(PropTypes.string),
    hiddenKinds: PropTypes.arrayOf(PropTypes.string),
    deprecated: PropTypes.bool,
    deprecationReason: PropTypes.string,
    hasFree: PropTypes.bool,
  }).isRequired,
  stats: PropTypes.shape({
    total: PropTypes.number,
    connected: PropTypes.number,
    error: PropTypes.number,
    allDisabled: PropTypes.bool,
    health: PropTypes.string,
    inCooldown: PropTypes.bool,
    cooldownUntil: PropTypes.string,
    errorCode: PropTypes.string,
    errorTime: PropTypes.string,
    latestError: PropTypes.string,
  }),
  category: PropTypes.string,
  onToggle: PropTypes.func,
  onTest: PropTypes.func,
  testing: PropTypes.bool,
  compact: PropTypes.bool,
};
