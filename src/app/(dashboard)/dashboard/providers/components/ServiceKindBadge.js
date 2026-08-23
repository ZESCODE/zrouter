"use client";

import PropTypes from "prop-types";

// ServiceKindBadge — Phase 1.1: service kind chips (LLM, Embedding, Image,
// TTS, STT, Web Search, Video, …) rendered on provider cards.

export default function ServiceKindBadge({ kind, size = "sm", title }) {
  const color = kind.color || "#9ca3af";
  const label = size === "xs" ? kind.short : kind.label;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none"
      style={{
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
      }}
      title={title || `${kind.label} service`}
    >
      <span className="material-symbols-outlined text-[11px] leading-none">{kind.icon}</span>
      {label}
    </span>
  );
}

ServiceKindBadge.propTypes = {
  kind: PropTypes.shape({
    id: PropTypes.string,
    label: PropTypes.string,
    short: PropTypes.string,
    icon: PropTypes.string,
    color: PropTypes.string,
  }).isRequired,
  size: PropTypes.oneOf(["xs", "sm"]),
  title: PropTypes.string,
};
