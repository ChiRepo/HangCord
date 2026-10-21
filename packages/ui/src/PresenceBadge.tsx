import type { Presence } from "./tokens";

const LABEL: Record<Presence, string> = { online: "Online", idle: "Idle", dnd: "Do not disturb", offline: "Offline" };

/**
 * Always a perfect circle (DESIGN_SYSTEM §6). Each state has its own shape so it never relies on
 * colour alone: online dot, idle crescent, do-not-disturb bar, offline ring. Styles: components.css.
 */
export function PresenceBadge({ status }: { status: Presence }) {
  return <span className={`hc-presence hc-presence--${status}`} role="img" aria-label={LABEL[status]} />;
}

export function Avatar({ initials, status, color }: { initials: string; status?: Presence; color?: string }) {
  return (
    <span className="hc-avatar" style={color ? { background: color } : undefined} aria-hidden={status ? undefined : true}>
      {initials}
      {status ? <PresenceBadge status={status} /> : null}
    </span>
  );
}
