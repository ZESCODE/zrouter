"use client";

// ConnectionsListPanel — Phase 2: paginated connection list with
//   - search + health filter (All / Active / Error / Banned / Out of credits)
//   - bulk selection + bulk operations (activate, deactivate, test all, delete)
//   - per-row inline actions (via ConnectionRow)
//   - pagination bar
//
// Built on the ZES Frost Design System.

import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import ConnectionRow from "./ConnectionRow";
import {
  filterConnectionsByQuery,
  paginateItems,
  providerCountText,
} from "@/shared/utils/providerPageUtils";

const PAGE_SIZE = 8;

const HEALTH_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "error", label: "Error" },
  { value: "banned", label: "Banned" },
  { value: "credits_exhausted", label: "No credits" },
];

function isHealthy(c) {
  return c.isActive !== false && (!c.testStatus || c.testStatus === "active" || c.testStatus === "success");
}

export default function ConnectionsListPanel({
  connections,
  isOAuth = false,
  loading = false,
  retestingId = null,
  batchRetesting = false,
  batchDeleting = false,
  oneByOneStatuses = {},
  onToggleActive,
  onToggleRateLimit,
  onToggleQuotaVisibility,
  onSwapPriority,
  onRetest,
  onEdit,
  onDelete,
  onProxy,
  onBatchSetActive,
  onBatchRetest,
  onBatchDelete,
  // Controlled selection (optional — shared with the parent page, e.g. for
  // the bulk proxy modal on the provider detail page)
  controlledSelectedIds = null,
  onSelectionChange,
  // Row-level extras (forwarded to every ConnectionRow)
  proxyPools = null,
  onUpdateProxy,
  getAutoPing = null,
}) {
  const [page, setPage] = useState(0);
  const [healthFilter, setHealthFilter] = useState("all");
  const [accountSearch, setAccountSearch] = useState("");
  const [internalSelected, setInternalSelected] = useState(() => new Set());

  const isControlled = controlledSelectedIds !== null && controlledSelectedIds !== undefined;
  const selectedIds = isControlled ? controlledSelectedIds : internalSelected;
  const setSelectedIds = (updater) => {
    const next = typeof updater === "function" ? updater(selectedIds) : updater;
    if (isControlled) onSelectionChange?.(next);
    else setInternalSelected(next);
  };

  const sorted = useMemo(
    () => [...(connections || [])].sort((a, b) => (a.priority || 0) - (b.priority || 0)),
    [connections]
  );

  const healthFiltered = useMemo(() => {
    if (healthFilter === "all") return sorted;
    return sorted.filter((c) => {
      if (healthFilter === "active") return isHealthy(c);
      if (healthFilter === "error")
        return !isHealthy(c) && c.testStatus !== "banned" && c.testStatus !== "credits_exhausted";
      return c.testStatus === healthFilter;
    });
  }, [sorted, healthFilter]);

  const filtered = useMemo(
    () => filterConnectionsByQuery(accountSearch, healthFiltered),
    [healthFiltered, accountSearch]
  );

  const { pageItems, totalPages, totalItems, pageStart, pageEnd, clampedPage } =
    paginateItems(filtered, page, PAGE_SIZE);

  const allSelected = selectedIds.size === filtered.length && filtered.length > 0;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filtered.length;
  const selectedList = Array.from(selectedIds);
  const bulkBusy = batchRetesting || batchDeleting;

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allSelected) return new Set();
      return new Set(filtered.map((c) => c.id));
    });
  };

  const pageAllSelected =
    pageItems.length > 0 && pageItems.every((c) => selectedIds.has(c.id));
  const pageSomeSelected = pageItems.some((c) => selectedIds.has(c.id));

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) {
        for (const c of pageItems) next.delete(c.id);
      } else {
        for (const c of pageItems) next.add(c.id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-skeleton h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!connections || connections.length === 0) {
    return (
      <div className="glass-card flex flex-col items-center gap-2 p-8 text-center">
        <span className="material-symbols-outlined text-[32px] text-text-subtle">cloud_off</span>
        <p className="text-sm text-text-muted">No connections yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="glass-card-compact flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer select-none items-center gap-2">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={toggleSelectAll}
              className="size-4 cursor-pointer rounded border-border accent-blue-500"
              aria-label="Select all connections"
            />
            <span className="text-xs font-medium text-text-muted">
              {selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : providerCountText(filtered.length, "account", "accounts")}
            </span>
          </label>

          {/* Search */}
          <div className="relative min-w-[150px] max-w-[220px] flex-1">
            <span className="material-symbols-outlined pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-text-subtle">
              search
            </span>
            <input
              type="text"
              value={accountSearch}
              onChange={(e) => {
                setAccountSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search accounts…"
              aria-label="Search connections"
              className="glass-input w-full pl-7 text-xs"
            />
          </div>

          {/* Health filter pills */}
          <div className="flex flex-wrap items-center gap-1">
            {HEALTH_FILTERS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setHealthFilter(opt.value);
                  setPage(0);
                  clearSelection();
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  healthFilter === opt.value
                    ? "bg-blue-500/20 text-blue-600 dark:text-blue-300"
                    : "bg-surface-2/60 text-text-muted hover:bg-surface-3/60"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-2">
            <button
              className="glass-btn glass-btn-xs glass-btn-success"
              disabled={bulkBusy}
              onClick={() => onBatchSetActive?.(selectedList, true)}
            >
              <span className="material-symbols-outlined text-[12px]">toggle_on</span>
              Enable selected
            </button>
            <button
              className="glass-btn glass-btn-xs"
              disabled={bulkBusy}
              onClick={() => onBatchSetActive?.(selectedList, false)}
            >
              <span className="material-symbols-outlined text-[12px]">toggle_off</span>
              Disable selected
            </button>
            <button
              className="glass-btn glass-btn-xs glass-btn-primary"
              disabled={bulkBusy || !!retestingId}
              onClick={() => {
                onBatchRetest?.(selectedList);
              }}
            >
              <span className={`material-symbols-outlined text-[12px] ${batchRetesting ? "animate-spin" : ""}`}>
                {batchRetesting ? "progress_activity" : "play_arrow"}
              </span>
              {batchRetesting ? "Testing…" : `Test ${selectedIds.size}`}
            </button>
            <button
              className="glass-btn glass-btn-xs glass-btn-destructive"
              disabled={bulkBusy}
              onClick={() => {
                onBatchDelete?.(selectedList);
                clearSelection();
              }}
            >
              <span className="material-symbols-outlined text-[12px]">delete</span>
              Delete {selectedIds.size}
            </button>
            <button
              className="glass-btn glass-btn-xs"
              onClick={clearSelection}
              title="Clear selection"
            >
              <span className="material-symbols-outlined text-[12px]">close</span>
            </button>
          </div>
        )}
      </div>

      {/* Rows */}
      <div className="glass-card space-y-1 p-2">
        <div className="flex items-center justify-between px-1.5 pt-1">
          <label className="flex cursor-pointer select-none items-center gap-2">
            <input
              type="checkbox"
              checked={pageAllSelected}
              ref={(el) => {
                if (el) el.indeterminate = pageSomeSelected;
              }}
              onChange={toggleSelectPage}
              className="size-4 cursor-pointer rounded border-border accent-blue-500"
              aria-label="Select page"
            />
            <span className="text-[11px] text-text-subtle">
              {pageStart + 1}–{Math.min(pageEnd, totalItems)} of {totalItems}
            </span>
          </label>
        </div>
        {pageItems.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-text-muted">
            No connections match the current filter.
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {pageItems.map((conn, index) => {
              const absIndex = filtered.indexOf(conn);
              return (
                <ConnectionRow
                  key={conn.id}
                  connection={conn}
                  isOAuth={conn.authType === "oauth" || isOAuth}
                  isFirst={index === 0}
                  isLast={index === pageItems.length - 1}
                  isSelected={selectedIds.has(conn.id)}
                  onToggleSelect={() => toggleSelectOne(conn.id)}
                  onMoveUp={() => onSwapPriority?.(conn, filtered[absIndex - 1])}
                  onMoveDown={() => onSwapPriority?.(conn, filtered[absIndex + 1])}
                  onToggleActive={(active) => onToggleActive?.(conn.id, active)}
                  onToggleRateLimit={(enabled) => onToggleRateLimit?.(conn.id, enabled)}
                  onToggleQuotaVisibility={(visible) => onToggleQuotaVisibility?.(conn.id, visible)}
                  onRetest={() => onRetest?.(conn.id)}
                  isRetesting={retestingId === conn.id}
                  onEdit={onEdit ? () => onEdit(conn) : undefined}
                  onDelete={onDelete ? () => onDelete(conn) : undefined}
                  onProxy={onProxy ? () => onProxy(conn) : undefined}
                  proxyPools={proxyPools}
                  onUpdateProxy={
                    onUpdateProxy
                      ? (proxyPoolId) => onUpdateProxy(conn.id, proxyPoolId)
                      : undefined
                  }
                  autoPing={getAutoPing ? getAutoPing(conn) : null}
                  oneByOneStatus={oneByOneStatuses[conn.id]}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="glass-card-compact flex items-center justify-between">
          <button
            className="glass-btn glass-btn-xs"
            disabled={clampedPage === 0}
            onClick={() => setPage(clampedPage - 1)}
          >
            <span className="material-symbols-outlined text-[13px]">chevron_left</span>
            Prev
          </button>
          <span className="text-xs text-text-muted">
            Page {clampedPage + 1} of {totalPages}
          </span>
          <button
            className="glass-btn glass-btn-xs"
            disabled={clampedPage >= totalPages - 1}
            onClick={() => setPage(clampedPage + 1)}
          >
            Next
            <span className="material-symbols-outlined text-[13px]">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}

ConnectionsListPanel.propTypes = {
  connections: PropTypes.arrayOf(PropTypes.object).isRequired,
  isOAuth: PropTypes.bool,
  loading: PropTypes.bool,
  retestingId: PropTypes.string,
  batchRetesting: PropTypes.bool,
  batchDeleting: PropTypes.bool,
  oneByOneStatuses: PropTypes.objectOf(
    PropTypes.shape({ state: PropTypes.string, error: PropTypes.string })
  ),
  onToggleActive: PropTypes.func,
  onToggleRateLimit: PropTypes.func,
  onToggleQuotaVisibility: PropTypes.func,
  onSwapPriority: PropTypes.func,
  onRetest: PropTypes.func,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
  onProxy: PropTypes.func,
  onBatchSetActive: PropTypes.func,
  onBatchRetest: PropTypes.func,
  onBatchDelete: PropTypes.func,
  controlledSelectedIds: PropTypes.object,
  onSelectionChange: PropTypes.func,
  proxyPools: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      isActive: PropTypes.bool,
    })
  ),
  onUpdateProxy: PropTypes.func,
  getAutoPing: PropTypes.func,
};
