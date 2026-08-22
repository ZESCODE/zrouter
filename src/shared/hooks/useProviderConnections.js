"use client";

// useProviderConnections — Phase 2 connection-management hook.
//
// Owns the connection list for one provider family: fetch, sort, and all
// inline/bulk mutations (enable, rate-limit protection, priority swap,
// retest, delete, batch operations). Local state is updated optimistically
// and reconciled from the server after each mutation.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getProviderConnectionFamilyIds } from "@/shared/constants/providerRegistry";
import { sortConnectionsByPriority } from "@/shared/utils/providerPageUtils";

const jsonHeaders = { "Content-Type": "application/json" };

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

/**
 * @param {string} providerId - provider id (family-aware)
 * @returns {{
 *   connections: Array,
 *   loading: boolean,
 *   refresh: Function,
 *   retestingId: string|null,
 *   batchRetesting: boolean,
 *   batchDeleting: boolean,
 *   handleUpdateConnectionStatus: (id:string,isActive:boolean)=>Promise<void>,
 *   handleToggleRateLimit: (id:string,enabled:boolean)=>Promise<void>,
 *   handleToggleQuotaVisibility: (id:string,visible:boolean)=>Promise<void>,
 *   handleToggleProxyEnabled: (id:string,enabled:boolean)=>Promise<void>,
 *   handleSwapPriority: (a:object,b:object)=>Promise<void>,
 *   handleRetestConnection: (id:string)=>Promise<object|null>,
 *   handleBatchRetest: (ids:string[])=>Promise<object|null>,
 *   handleBatchSetActive: (ids:string[],active:boolean)=>Promise<void>,
 *   handleDeleteConnection: (id:string)=>Promise<void>,
 *   handleBatchDelete: (ids:string[])=>Promise<void>,
 *   handleUpdateConnection: (id:string,patch:object)=>Promise<void>,
 * }}
 */
export function useProviderConnections(providerId) {
  const [allConnections, setAllConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retestingId, setRetestingId] = useState(null);
  const [batchRetesting, setBatchRetesting] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const familyIds = useMemo(
    () => getProviderConnectionFamilyIds(providerId),
    [providerId]
  );
  const familySet = useMemo(() => new Set(familyIds), [familyIds]);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch("/api/providers", { cache: "no-store" });
      setAllConnections(data.connections || []);
    } catch (err) {
      console.error("useProviderConnections: fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial state is loading=true; subsequent fetches (provider change /
  // manual refresh) keep the list visible and update in place. The IIFE keeps
  // every setState behind an await (no synchronous state updates in the
  // effect body) and guards against unmount mid-flight.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch("/api/providers", { cache: "no-store" });
        if (!cancelled) setAllConnections(data.connections || []);
      } catch (err) {
        if (!cancelled) console.error("useProviderConnections: fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const connections = useMemo(
    () => sortConnectionsByPriority(allConnections.filter((c) => familySet.has(c.provider))),
    [allConnections, familySet]
  );

  const patchConnection = useCallback(
    async (id, patch) => {
      await apiFetch(`/api/providers/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(patch),
      });
      await refresh();
    },
    [refresh]
  );

  const handleUpdateConnectionStatus = useCallback(
    async (id, isActive) => {
      await patchConnection(id, { isActive });
    },
    [patchConnection]
  );

  const handleToggleRateLimit = useCallback(
    async (id, enabled) => {
      const conn = allConnections.find((c) => c.id === id);
      const psd = { ...(conn?.providerSpecificData || {}) };
      psd.rateLimitProtection = enabled;
      await patchConnection(id, { providerSpecificData: psd });
    },
    [allConnections, patchConnection]
  );

  const handleToggleQuotaVisibility = useCallback(
    async (id, visible) => {
      const conn = allConnections.find((c) => c.id === id);
      const psd = { ...(conn?.providerSpecificData || {}) };
      psd.quotaVisible = visible;
      await patchConnection(id, { providerSpecificData: psd });
    },
    [allConnections, patchConnection]
  );

  const handleToggleProxyEnabled = useCallback(
    async (id, enabled) => {
      const conn = allConnections.find((c) => c.id === id);
      const psd = { ...(conn?.providerSpecificData || {}) };
      psd.connectionProxyEnabled = psd.connectionProxyEnabled && !enabled ? false : enabled;
      if (!enabled) psd.connectionProxyEnabled = false;
      await patchConnection(id, {
        providerSpecificData: psd,
        connectionProxyEnabled: enabled && !!psd.connectionProxyUrl ? true : undefined,
      });
    },
    [allConnections, patchConnection]
  );

  const handleSwapPriority = useCallback(
    async (a, b) => {
      if (!a || !b || a.id === b.id) return;
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      await Promise.all([
        patchConnection(a.id, { priority: pb }),
        patchConnection(b.id, { priority: pa }),
      ]);
    },
    [patchConnection]
  );

  const handleRetestConnection = useCallback(
    async (id) => {
      setRetestingId(id);
      try {
        const result = await apiFetch(`/api/providers/${encodeURIComponent(id)}/test`, {
          method: "POST",
        });
        await refresh();
        return result;
      } finally {
        setRetestingId(null);
      }
    },
    [refresh]
  );

  const handleBatchRetest = useCallback(
    async (ids) => {
      setBatchRetesting(true);
      try {
        const results = await Promise.allSettled(
          ids.map((id) =>
            apiFetch(`/api/providers/${encodeURIComponent(id)}/test`, { method: "POST" })
          )
        );
        await refresh();
        return results;
      } finally {
        setBatchRetesting(false);
      }
    },
    [refresh]
  );

  const handleBatchSetActive = useCallback(
    async (ids, active) => {
      await Promise.allSettled(ids.map((id) => patchConnection(id, { isActive: active })));
      await refresh();
    },
    [patchConnection, refresh]
  );

  const handleDeleteConnection = useCallback(
    async (id) => {
      await apiFetch(`/api/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    },
    [refresh]
  );

  const handleBatchDelete = useCallback(
    async (ids) => {
      setBatchDeleting(true);
      try {
        await Promise.allSettled(
          ids.map((id) => apiFetch(`/api/providers/${encodeURIComponent(id)}`, { method: "DELETE" }))
        );
        await refresh();
      } finally {
        setBatchDeleting(false);
      }
    },
    [refresh]
  );

  const handleUpdateConnection = useCallback(
    async (id, patch) => {
      await patchConnection(id, patch);
    },
    [patchConnection]
  );

  return {
    connections,
    allConnections,
    loading,
    refresh,
    retestingId,
    batchRetesting,
    batchDeleting,
    handleUpdateConnectionStatus,
    handleToggleRateLimit,
    handleToggleQuotaVisibility,
    handleToggleProxyEnabled,
    handleSwapPriority,
    handleRetestConnection,
    handleBatchRetest,
    handleBatchSetActive,
    handleDeleteConnection,
    handleBatchDelete,
    handleUpdateConnection,
  };
}

export default useProviderConnections;
