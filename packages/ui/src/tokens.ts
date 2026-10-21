/** TypeScript view of tokens.css (Calm Minimal). test/tokens.test.ts keeps the two identical. */
export const color = {
  lantern: "#F2A93B",
  onLantern: "#1A1205",
  moss: "#34C77B",
  honey: "#D9B54A",
  ember: "#B8322C",
  emberText: "#F0605A",
  sky: "#86B6FF",
  bg: "#111316",
  panel: "#181B20",
  surface: "#1D2026",
  raised: "#22262D",
  line: "#2A2F37",
  lineStrong: "#3A404A",
  text: "#ECEEF1",
  textMuted: "#A9B0BA",
  textDim: "#858E9B",
} as const;

/** Breakpoints used by every layout (MASTER_PLAN §15.1). */
export const breakpoint = {
  phone: 720, // < 720: one pane at a time + bottom tabs
  tablet: 1100, // 720–1099: members list hidden
} as const;

export const size = { touch: 44, presence: 16, presenceRing: 3, avatar: 40, hangoutIcon: 48 } as const;

export type Presence = "online" | "idle" | "dnd" | "offline";
