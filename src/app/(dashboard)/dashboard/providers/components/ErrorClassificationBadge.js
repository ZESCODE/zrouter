"use client";

import PropTypes from "prop-types";

// ErrorClassificationBadge — Phase 4: renders the classified error for a
// connection (AUTH / 429 / 5XX / NET / RUNTIME / CREDITS / BANNED / ERR) with
// the matching badge variant and tooltip.

const VARIANT_CLASSES = {
  error: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
  warning: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  default: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30",
};

export default function ErrorClassificationBadge({ classification, code, showLong = false }) {
  if (!classification) return null;
  const variant = VARIANT_CLASSES[classification.variant] || VARIANT_CLASSES.default;
  const text = showLong ? classification.longLabel : classification.tag;
  const tooltip = [
    classification.description,
    code ? `HTTP ${code}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${variant}`}
      title={tooltip}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: classification.color }} />
      {text}
    </span>
  );
}

ErrorClassificationBadge.propTypes = {
  classification: PropTypes.shape({
    id: PropTypes.string,
    label: PropTypes.string,
    longLabel: PropTypes.string,
    tag: PropTypes.string,
    variant: PropTypes.string,
    color: PropTypes.string,
    description: PropTypes.string,
  }),
  code: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  showLong: PropTypes.bool,
};
