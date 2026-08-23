"use client";

// ProviderCard — OmniRoute-style compact card (see reference screenshot).
//
//   Row 1: icon (tinted) + provider name + category dot
//   Row 2: "N Connected" / "No connections" + error tag + cooldown + toggle
//   Row 3: service-kind chips (LLM, Embedding, Image, TTS, STT, …)
//
// The card IS the link to the provider detail page. Built on the ZES Frost
// card with the default BLUE glow border; glow intensifies on hover.

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

const KIND_LABELS = {
  llm: "Chat",
  embedding: "Embedding",
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

// apiType → kind label for compatible nodes ("Messages" / "Chat" / "Responses")
const COMPATIBLE_KIND_LABEL = {
  responses: "Responses",
  messages: "Messages",
  chat: "Chat",
};

const HEALTH_DOT = {
  healthy: "bg-green-500",
  degraded: "bg-orange-500",
  offline: "bg-red-500",
  none: "bg-gray-400",
};

export default function ProviderCard({
  providerId,
  provider,
  stats,
  category = "apikey",
  onToggle,
}) {
  const health = stats?.health || "none";
  const healthMeta = PROVIDER_HEALTH[health] || PROVIDER_HEALTH.none;
  const connected = Number(stats?.connected || 0);
  const error = Number(stats?.error || 0);
  const total = Number(stats?.total || 0);
  const allDisabled = !!stats?.allDisabled;

  const isCompatible = typeof providerId === "string" &&
    (providerId.startsWith("openai-compatible-") || providerId.startsWith("anthropic-compatible-"));

  const dotColor = CATEGORY_DOT_COLORS[category] || CATEGORY_DOT_COLORS.apikey;

  const kinds = isCompatible
    ? [
        {
          id: provider.apiType || "chat",
          label: COMPATIBLE_KIND_LABEL[provider.apiType || "chat"] || "Chat",
          short: COMPATIBLE_KIND_LABEL[provider.apiType || "chat"] || "Chat",
          icon: provider.apiType === "responses" ? "swap_horiz" : "chat",
          color: providerId.startsWith("anthropic-compatible-") ? "#fb923c" : "#60a5fa",
        },
      ]
    : (provider.serviceKinds && provider.serviceKinds.length > 0
        ? provider.serviceKinds
        : ["llm"]
      )
        .filter((k) => !provider.hiddenKinds?.includes(k))
        .map((k) => ({
          id: k,
          label: KIND_LABELS[k] || k,
          short: KIND_LABELS[k] || k,
          icon: KIND_ICONS[k] || "tag",
          color: KIND_COLORS[k] || "#9ca3af",
        }));

  const shownKinds = kinds.slice(0, 2);
  const extraKinds = kinds.length - shownKinds.length;

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (total > 0 && onToggle) onToggle(allDisabled);
  };

  return (
    <Link
      id={`provider-${providerId}`}
      href={`/dashboard/providers/${encodeURIComponent(providerId)}`}
      className="group block h-full focus-visible:outline-none"
    >
      <div
        className={`glass-card !p-3.5 flex h-full min-h-[92px] flex-col gap-2 group-focus-visible:ring-2 group-focus-visible:ring-blue-500/40 ${
          allDisabled ? "opacity-50" : ""
        } ${provider.deprecated ? "opacity-60" : ""}`}
      >
        {/* Row 1 — identity */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="relative flex size-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${provider.color || "#64748b"}26` }}
          >
            <ProviderIcon
              providerId={providerId}
              size={18}
              fallbackText={provider.textIcon || providerId.slice(0, 2).toUpperCase()}
              fallbackColor={provider.color}
            />
            {total > 0 && (
              <span
                className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-[var(--color-bg)] ${HEALTH_DOT[health]}`}
                title={`Status: ${healthMeta.label}`}
              />
            )}
          </span>
          <h3
            className={`min-w-0 flex-1 truncate text-[13px] font-semibold text-text-main ${
              provider.deprecated ? "line-through opacity-60" : ""
            }`}
            title={provider.name}
          >
            {provider.name}
          </h3>
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor }}
            title={category}
          />
        </div>

        {/* Row 2 — status + toggle */}
        <div className="flex min-w-0 items-center gap-1.5">
          {allDisabled ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
              <span className="material-symbols-outlined text-[12px]">pause_circle</span>
              Disabled
            </span>
          ) : total > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400" title={`${connected} of ${total} connections healthy`}>
              <span className="size-1.5 rounded-full bg-green-500" />
              {connected} Connected
            </span>
          ) : (
            <span className="text-[11px] text-text-subtle">No connections</span>
          )}
          {error > 0 && (
            <ErrorClassificationBadge
              classification={{
                id: "UNKNOWN",
                tag: stats?.errorCode || "ERR",
                variant: "error",
                color: "#ef4444",
                description: stats?.latestError || "connection error",
              }}
            />
          )}
          {stats?.inCooldown && stats.cooldownUntil && <CooldownTimer until={stats.cooldownUntil} />}
          {error > 0 && stats?.latestError && (
            <span className="hidden min-w-0 truncate text-[10px] text-red-400/80 md:inline" title={stats.latestError}>
              {stats.latestError}
            </span>
          )}
          {total > 0 && onToggle && (
            <div className="ml-auto shrink-0" onClick={handleToggle}>
              <Toggle
                size="sm"
                checked={!allDisabled}
                onChange={() => {}}
                title={allDisabled ? "Enable provider" : "Disable provider"}
              />
            </div>
          )}
        </div>

        {/* Row 3 — service kinds */}
        {shownKinds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {shownKinds.map((k) => (
              <ServiceKindBadge key={k.id} kind={k} size="xs" />
            ))}
            {extraKinds > 0 && (
              <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium leading-none text-text-muted">
                +{extraKinds}
              </span>
            )}
            {stats?.errorTime && <span className="ml-auto text-[10px] text-text-subtle">{getRelativeTime(stats.errorTime)}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}

ProviderCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  provider: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string.isRequired,
    color: PropTypes.string,
    textIcon: PropTypes.string,
    apiType: PropTypes.string,
    serviceKinds: PropTypes.arrayOf(PropTypes.string),
    hiddenKinds: PropTypes.arrayOf(PropTypes.string),
    deprecated: PropTypes.bool,
    deprecationReason: PropTypes.string,
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
};
