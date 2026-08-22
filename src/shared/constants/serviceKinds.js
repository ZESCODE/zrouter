// Service kind definitions — single source of truth for the service-kind
// badges rendered on provider cards and detail pages.
// Kinds mirror the OmniRoute service-kind vocabulary (llm, embedding, image,
// imageToText, tts, stt, webSearch, webFetch, video, music).

export const SERVICE_KINDS = [
  { id: "llm", label: "LLM", short: "Chat", icon: "chat", color: "#60a5fa" },
  { id: "embedding", label: "Embedding", short: "Embed", icon: "data_array", color: "#a78bfa" },
  { id: "image", label: "Image", short: "Image", icon: "brush", color: "#f472b6" },
  { id: "imageToText", label: "Image→Text", short: "I→T", icon: "image_search", color: "#fb923c" },
  { id: "tts", label: "TTS", short: "TTS", icon: "record_voice_over", color: "#34d399" },
  { id: "stt", label: "STT", short: "STT", icon: "mic", color: "#2dd4bf" },
  { id: "webSearch", label: "Web Search", short: "Search", icon: "travel_explore", color: "#fbbf24" },
  { id: "webFetch", label: "Web Fetch", short: "Fetch", icon: "language", color: "#facc15" },
  { id: "video", label: "Video", short: "Video", icon: "movie", color: "#c084fc" },
  { id: "music", label: "Music", short: "Music", icon: "music_note", color: "#818cf8" },
];

export const SERVICE_KIND_MAP = Object.fromEntries(
  SERVICE_KINDS.map((k) => [k.id, k])
);

/**
 * Resolve the display list of service kinds for a provider.
 * Providers without an explicit serviceKinds list default to ["llm"].
 * @param {object} provider - registry entry (may have serviceKinds + hiddenKinds)
 * @returns {Array<{id:string,label:string,short:string,icon:string,color:string}>}
 */
export function getProviderServiceKinds(provider) {
  if (!provider) return [{ ...SERVICE_KIND_MAP.llm }];
  const raw = Array.isArray(provider.serviceKinds) && provider.serviceKinds.length > 0
    ? provider.serviceKinds
    : ["llm"];
  const hidden = provider.hiddenKinds || [];
  const kinds = raw
    .filter((k) => k !== "llm" || !hidden.includes("llm"))
    .filter((k) => !hidden.includes(k))
    .map((k) => SERVICE_KIND_MAP[k] || { id: k, label: k, short: k, icon: "tag", color: "#9ca3af" });
  return kinds.length > 0 ? kinds : [{ ...SERVICE_KIND_MAP.llm }];
}

/** True when the provider can do chat completion (enables the Test button). */
export function isLlmServiceKind(provider) {
  return getProviderServiceKinds(provider).some((k) => k.id === "llm");
}
