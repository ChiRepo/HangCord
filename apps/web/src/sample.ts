// Sample data for the Phase 0 shell only — replaced by the real API in Phase 1.
import { BIT, type HangoutSnapshot, type Preferences } from "@hangcord/protocol";
import type { Presence } from "@hangcord/ui";

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
  me: { userId: "you", roles: [] },
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

export const SAMPLE_HANGOUTS = [
  { id: "night-owls", initials: "NO" },
  { id: "study-circle", initials: "SC" },
  { id: "pixel-club", initials: "PC" },
];

export const SAMPLE_MEMBERS: Array<{ name: string; initials: string; status: Presence; note: string }> = [
  { name: "Kabir", initials: "KS", status: "online", note: "Online" },
  { name: "Aarav", initials: "AR", status: "online", note: "In Lounge" },
  { name: "Mira", initials: "MI", status: "idle", note: "Idle" },
  { name: "Riya", initials: "RD", status: "dnd", note: "Do not disturb" },
  { name: "Dev", initials: "DV", status: "offline", note: "Offline" },
];

export const SAMPLE_MESSAGES = [
  { id: "m1", author: "Aarav", initials: "AR", time: "10:42 PM", text: "anyone up for the Lounge? finishing the DBMS assignment" },
  { id: "m2", author: "Mira", initials: "MI", time: "10:44 PM", text: "joining in 5 — notes are pinned in #late-night-study" },
  { id: "m3", author: "Kabir", initials: "KS", time: "10:47 PM", text: "can someone set up movie night for Saturday?" },
];
