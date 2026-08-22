"use client";

// RoutingFallbacksCard — Phase 6: settings upgrade.
//
//   1. Provider priority ordering (drag to reorder)  → settings.providerOrder
//   2. Rate limiting config per provider             → settings.providerStrategies[id].rateLimit
//   3. Cost thresholds per provider                  → settings.providerStrategies[id].costThresholdUsd
//   4. Fallback chains config                        → settings.providerStrategies[id].fallbackStrategy / stickyRoundRobinLimit
//   5. Health check intervals                        → settings.providerStrategies[id].healthCheckIntervalSec
//
// `fallbackStrategy` + `stickyRoundRobinLimit` are consumed by the router
// (src/sse/services/auth.js reads settings.providerStrategies). The card only
// lists providers with at least one connection to keep the list actionable.

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { useNotificationStore } from "@/store/notificationStore";

const FALLBACK_STRATEGIES = [
  { value: "fill-first", label: "Fill first (priority order)", hint: "Use the highest-priority healthy connection until it fails, then fall back." },
  { value: "round-robin", label: "Round robin (sticky)", hint: "Rotate connections across accounts, sticking to one up to the limit." },
];

const HEALTH_INTERVALS = [
  { value: 0, label: "Off" },
  { value: 60, label: "1 min" },
  { value: 300, label: "5 min" },
  { value: 900, label: "15 min" },
  { value: 3600, label: "1 hour" },
];

function SortableProviderRow({ id, entry, index, strategy, onStrategyChange, onResetStrategy }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const s = strategy || {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="glass-card-compact flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded-md p-1 text-text-subtle hover:bg-surface-2 hover:text-text-main active:cursor-grabbing"
          title="Drag to reorder priority"
          aria-label={`Reorder ${entry.name}`}
        >
          <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
        </button>
        <span className="w-6 shrink-0 text-center font-mono text-xs text-text-subtle">
          {index + 1}
        </span>
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
          style={{ backgroundColor: `${entry.color || "#64748b"}22`, color: entry.color || "#9ca3af" }}
        >
          {entry.textIcon || entry.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 truncate text-xs font-semibold text-text-main" title={entry.name}>
          {entry.name}
        </span>
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-muted">
          {entry.connectionCount} conn
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Fallback chain */}
        <select
          value={s.fallbackStrategy || "fill-first"}
          onChange={(e) => onStrategyChange(id, { fallbackStrategy: e.target.value })}
          className="glass-input px-2 py-1 text-[11px]"
          title="Fallback strategy for this provider"
        >
          {FALLBACK_STRATEGIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        {(s.fallbackStrategy || "fill-first") === "round-robin" && (
          <input
            type="number"
            min="1"
            max="50"
            value={s.stickyRoundRobinLimit || 3}
            onChange={(e) => onStrategyChange(id, { stickyRoundRobinLimit: parseInt(e.target.value || "1", 10) })}
            className="glass-input w-14 px-2 py-1 text-[11px] tabular-nums"
            title="Sticky round-robin limit (requests per account before rotating)"
          />
        )}
        {/* Rate limit */}
        <input
          type="number"
          min="0"
          placeholder="RPM"
          value={s.rateLimit?.rpm ?? ""}
          onChange={(e) =>
            onStrategyChange(id, { rateLimit: { ...(s.rateLimit || {}), rpm: e.target.value === "" ? undefined : parseInt(e.target.value, 10) } })
          }
          className="glass-input w-16 px-2 py-1 text-[11px] tabular-nums"
          title="Requests per minute limit (0 = off)"
        />
        <input
          type="number"
          min="0"
          placeholder="TPM"
          value={s.rateLimit?.tpm ?? ""}
          onChange={(e) =>
            onStrategyChange(id, { rateLimit: { ...(s.rateLimit || {}), tpm: e.target.value === "" ? undefined : parseInt(e.target.value, 10) } })
          }
          className="glass-input w-20 px-2 py-1 text-[11px] tabular-nums"
          title="Tokens per minute limit (0 = off)"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="$ cap"
          value={s.costThresholdUsd ?? ""}
          onChange={(e) =>
            onStrategyChange(id, { costThresholdUsd: e.target.value === "" ? undefined : parseFloat(e.target.value) })
          }
          className="glass-input w-16 px-2 py-1 text-[11px] tabular-nums"
          title="Cost threshold in USD (budget alert)"
        />
        <select
          value={s.healthCheckIntervalSec ?? 0}
          onChange={(e) => onStrategyChange(id, { healthCheckIntervalSec: parseInt(e.target.value, 10) })}
          className="glass-input px-2 py-1 text-[11px]"
          title="Health check interval"
        >
          {HEALTH_INTERVALS.map((h) => (
            <option key={h.value} value={h.value}>HC: {h.label}</option>
          ))}
        </select>
        {hasStrategy(s) && (
          <button
            onClick={() => onResetStrategy(id)}
            className="glass-btn glass-btn-xs"
            title="Reset provider routing settings"
          >
            <span className="material-symbols-outlined text-[12px]">restart_alt</span>
          </button>
        )}
      </div>
    </div>
  );
}

function hasStrategy(s) {
  return !!(
    s.fallbackStrategy ||
    s.stickyRoundRobinLimit ||
    s.costThresholdUsd != null ||
    s.healthCheckIntervalSec != null ||
    (s.rateLimit && Object.values(s.rateLimit).some((v) => v != null))
  );
}

export default function RoutingFallbacksCard({ providerNodes, connections }) {
  const notify = useNotificationStore();
  const [settings, setSettings] = useState(null);
  const [providerOrder, setProviderOrder] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setLoaded(true);
      }
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Providers with at least one connection, in current priority order
  const providerEntries = (() => {
    const counts = {};
    for (const c of connections || []) {
      counts[c.provider] = (counts[c.provider] || 0) + 1;
    }
    const entries = Object.entries(counts).map(([id, connectionCount]) => {
      const cfg = AI_PROVIDERS[id];
      return {
        id,
        name: cfg?.name || id,
        color: cfg?.color,
        textIcon: cfg?.textIcon,
        connectionCount,
      };
    });
    const order = settings?.providerOrder || [];
    entries.sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return entries;
  })();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const saveSettings = useCallback(
    async (patch, successMsg) => {
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error((await res.json())?.error || "Save failed");
        const data = await res.json();
        setSettings((prev) => ({ ...prev, ...data }));
        if (successMsg) notify.success(successMsg);
        return data;
      } catch (err) {
        notify.error(err.message || "Failed to save settings");
      }
    },
    [notify]
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = providerEntries.findIndex((e) => e.id === active.id);
    const newIndex = providerEntries.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(providerEntries, oldIndex, newIndex);
    setProviderOrder(next.map((e) => e.id));
    await saveSettings({ providerOrder: next.map((e) => e.id) }, "Provider priority order saved");
  };

  const handleStrategyChange = async (id, patch) => {
    const current = settings?.providerStrategies || {};
    const updated = { ...current, [id]: { ...(current[id] || {}), ...patch } };
    setSettings((prev) => ({ ...prev, providerStrategies: updated }));
    // Optimistic; persist silently (rate-limit inputs change on every keystroke)
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerStrategies: updated }),
    }).catch(() => null);
    if (res && !res.ok) notify.error("Failed to save provider settings");
  };

  const handleResetStrategy = async (id) => {
    const current = { ...(settings?.providerStrategies || {}) };
    delete current[id];
    setSettings((prev) => ({ ...prev, providerStrategies: current }));
    await saveSettings({ providerStrategies: current }, "Provider routing settings reset");
  };

  if (!loaded) {
    return <div className="glass-card space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="glass-skeleton h-12 w-full" />)}</div>;
  }

  if (providerEntries.length === 0) {
    return (
      <div className="glass-card flex flex-col items-center gap-2 p-8 text-center">
        <span className="material-symbols-outlined text-[32px] text-text-subtle">route</span>
        <p className="text-sm text-text-muted">Add connections to configure routing and fallbacks.</p>
      </div>
    );
  }

  return (
    <div className="glass-card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted">
          Drag providers to set fallback priority. Per-provider rate limits, cost thresholds, fallback chains, and health-check intervals are saved to settings.
        </p>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={providerEntries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {providerEntries.map((entry, index) => (
              <SortableProviderRow
                key={entry.id}
                id={entry.id}
                entry={entry}
                index={index}
                strategy={(settings?.providerStrategies || {})[entry.id]}
                onStrategyChange={handleStrategyChange}
                onResetStrategy={handleResetStrategy}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

RoutingFallbacksCard.propTypes = {
  providerNodes: PropTypes.arrayOf(PropTypes.object),
  connections: PropTypes.arrayOf(PropTypes.object),
};
