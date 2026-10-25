// Deterministic fake API data for UI tests. Never used by production code.
import { BIT, type HangoutSnapshot, type Preferences } from "@hangcord/protocol";

const MANAGER = BIT.VIEW_ROOM | BIT.READ_HISTORY | BIT.SEND_MESSAGES | BIT.CONNECT | BIT.SPEAK | BIT.MANAGE_ROOMS | BIT.MANAGE_ROOM_PERMISSIONS;

export const SAMPLE_HANGOUT: HangoutSnapshot = {
  hangoutId: "night-owls",
  version: 12,
  permVersion: 3,
  hangout: { id: "night-owls", name: "Night Owls", icon: null },
  rooms: [
    { id: "cat-text", hangoutId: "night-owls", type: "category", position: 0, name: "Hang out", syncWithCategory: false, overrides: [], roomDefaults: { slowmode: 0 }, guidelinesText: "Be kind." },
    { id: "welcome", hangoutId: "night-owls", type: "text", categoryId: "cat-text", position: 0, name: "welcome", syncWithCategory: true, overrides: [] },
    { id: "general", hangoutId: "night-owls", type: "text", categoryId: "cat-text", position: 1, name: "general", syncWithCategory: true, overrides: [] },
    { id: "cat-study", hangoutId: "night-owls", type: "category", position: 1, name: "Study", syncWithCategory: false, overrides: [], roomDefaults: { slowmode: 10 }, guidelinesText: "Focus first." },
    { id: "late-night-study", hangoutId: "night-owls", type: "text", categoryId: "cat-study", position: 0, name: "late-night-study", syncWithCategory: true, overrides: [] },
    { id: "study-hall", hangoutId: "night-owls", type: "lounge", categoryId: "cat-study", position: 1, name: "Study Hall", syncWithCategory: true, overrides: [] },
    { id: "cat-voice", hangoutId: "night-owls", type: "category", position: 2, name: "Lounges", syncWithCategory: false, overrides: [] },
    { id: "lounge", hangoutId: "night-owls", type: "lounge", categoryId: "cat-voice", position: 0, name: "Lounge", syncWithCategory: true, overrides: [] },
    { id: "cat-news", hangoutId: "night-owls", type: "category", position: 3, name: "Announcements", syncWithCategory: false, overrides: [] },
    { id: "news", hangoutId: "night-owls", type: "text", categoryId: "cat-news", position: 0, name: "news", syncWithCategory: true, overrides: [] },
  ],
  roles: [],
  me: { userId: "test-user", roles: [] },
  // Cosmetic only — the server re-checks everything. You may add rooms everywhere except Announcements.
  myPermissions: {
    "cat-text": String(MANAGER),
    "cat-study": String(MANAGER),
    "cat-voice": String(MANAGER),
    "cat-news": String(BIT.VIEW_ROOM | BIT.READ_HISTORY),
  },
  emoji: [],
};

export const SAMPLE_PREFS: Preferences = {
  version: 4,
  values: { "rooms.newRoomGuidelines": { value: "category", updatedAt: 1 } },
};

