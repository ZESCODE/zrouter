"use client";

// useErrorClassification — memoized error classification + live cooldown
// tracking for a single connection (Phase 2/4 support hook).

import { useState, useEffect, useMemo } from "react";
import {
  classifyConnectionError,
  isConnectionInCooldown,
  formatCooldownRemaining,
} from "@/shared/utils/errorClassifier";

/**
 * @param {object} connection - provider connection record
 * @returns {{classification:object, isCooldown:boolean, cooldownRemaining:string}}
 */
export function useErrorClassification(connection) {
  const rateLimitedUntil = connection?.rateLimitedUntil || null;
  const [isCooldown, setIsCooldown] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState("");

  // Tick every second while a cooldown window exists (same pattern as the
  // legacy ConnectionRow: state updates happen inside the checker callback).
  useEffect(() => {
    const checkCooldown = () => {
      if (!rateLimitedUntil) {
        setIsCooldown(false);
        setCooldownRemaining("");
        return;
      }
      const inCooldown = isConnectionInCooldown({ ...connection, rateLimitedUntil });
      setIsCooldown(inCooldown);
      setCooldownRemaining(inCooldown ? formatCooldownRemaining(rateLimitedUntil) : "");
    };
    checkCooldown();
    const interval = rateLimitedUntil ? setInterval(checkCooldown, 1000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [rateLimitedUntil, connection]);

  const classification = useMemo(
    () => classifyConnectionError(connection, { isCooldown }),
    [connection, isCooldown]
  );

  return { classification, isCooldown, cooldownRemaining };
}

export default useErrorClassification;
