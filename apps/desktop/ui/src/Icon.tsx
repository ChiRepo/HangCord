// Lucide-style stroke icons, inline so the shell has no icon dependency. Decorative: aria-hidden.
const PATHS = {
  plus: "M5 12h14M12 5v14",
  hash: "M4 9h16M4 15h16M10 3 8 21M16 3l-2 18",
  speaker: "M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  back: "m12 19-7-7 7-7M19 12H5",
  send: "m22 2-7 20-4-9-9-4ZM22 2 11 13",
  close: "M18 6 6 18M6 6l12 12",
  home: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM9 22V12h6v10",
  chat: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
} as const;

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
