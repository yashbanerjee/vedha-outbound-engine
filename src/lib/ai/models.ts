/** Small, cheap OpenAI models suitable for high-volume lead pre-filtering. */
export const AI_MODELS: { id: string; label: string; note: string }[] = [
  { id: "gpt-4o-mini", label: "GPT-4o mini", note: "Recommended: fast, cheap, good judgement" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", note: "Slightly stronger reasoning, a bit more expensive" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 nano", note: "Cheapest and fastest, less nuanced" },
  { id: "gpt-4o", label: "GPT-4o", note: "Highest quality, ~15x the cost of mini" },
];
