"use client";

// BatchTestModal — Phase 1.6/2: glass modal showing batch test results
// (per-connection pass/fail + latency + error tag, with a summary header).
// Backdrop uses the ZES Frost glass-strong treatment.

import PropTypes from "prop-types";
import { STATUS_HEX } from "@/shared/constants/statusColors";

export default function BatchTestModal({ open, onClose, mode = "", results = [], summary, error }) {
  if (!open) return null;

  const passed = summary?.passed ?? results.filter((r) => r.valid).length;
  const failed = summary?.failed ?? results.filter((r) => !r.valid).length;
  const total = summary?.total ?? results.length;

  return (
    <div
      className="glass-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Batch test results"
    >
      <div className="glass-modal">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-main">
            <span className="material-symbols-outlined text-[18px] text-blue-400">science</span>
            Batch test results
            {mode && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                {mode}
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-main"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2 px-5 py-4">
          <div className="glass-card-compact text-center">
            <p className="text-lg font-semibold tabular-nums" style={{ color: STATUS_HEX.muted }}>
              {total}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-text-subtle">Total</p>
          </div>
          <div className="glass-card-compact text-center" style={{ borderColor: "rgba(34,197,94,0.3)" }}>
            <p className="text-lg font-semibold tabular-nums" style={{ color: STATUS_HEX.success }}>
              {passed}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-text-subtle">Passed</p>
          </div>
          <div className="glass-card-compact text-center" style={{ borderColor: "rgba(239,68,68,0.3)" }}>
            <p className="text-lg font-semibold tabular-nums" style={{ color: STATUS_HEX.error }}>
              {failed}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-text-subtle">Failed</p>
          </div>
        </div>

        {/* Results list */}
        <div className="max-h-[40vh] overflow-y-auto px-5 pb-4">
          {error && (
            <div className="glass-card-compact mb-2 border-red-500/30 text-xs text-red-500">
              {typeof error === "string" ? error : error.message || "Test failed"}
            </div>
          )}
          {results.length === 0 && !error && (
            <p className="py-6 text-center text-xs text-text-muted">No results.</p>
          )}
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <div
                key={r.connectionId || i}
                className={`glass-card-compact flex items-center justify-between gap-2 border-l-2 ${
                  r.valid ? "glass-frost-green" : "glass-frost-red"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="material-symbols-outlined text-[16px] leading-none"
                    style={{ color: r.valid ? STATUS_HEX.success : STATUS_HEX.error }}
                  >
                    {r.valid ? "check_circle" : "error"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-text-main">
                      {r.connectionName || r.provider || r.connectionId || `Connection ${i + 1}`}
                    </p>
                    {!r.valid && r.diagnosis && (
                      <p className="truncate text-[10px] text-red-500" title={String(r.diagnosis)}>
                        {r.diagnosis.type || "failed"}
                      </p>
                    )}
                  </div>
                </div>
                {r.valid && typeof r.latencyMs === "number" && (
                  <span className="shrink-0 font-mono text-[10px] text-text-muted">
                    {Math.round(r.latencyMs)}ms
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-white/5 px-5 py-3">
          <button onClick={onClose} className="glass-btn glass-btn-sm glass-btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

BatchTestModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  mode: PropTypes.string,
  results: PropTypes.arrayOf(
    PropTypes.shape({
      connectionId: PropTypes.string,
      connectionName: PropTypes.string,
      provider: PropTypes.string,
      valid: PropTypes.bool,
      latencyMs: PropTypes.number,
      diagnosis: PropTypes.shape({ type: PropTypes.string }),
    })
  ),
  summary: PropTypes.shape({
    total: PropTypes.number,
    passed: PropTypes.number,
    failed: PropTypes.number,
  }),
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.shape({ message: PropTypes.string })]),
};
