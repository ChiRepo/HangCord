/**
 * Every timed job runs from ONE 15-minute cron (free plan: 5 Cron Triggers per account).
 * The schedule below decides which jobs are due at a given tick. Jobs are no-ops until their
 * phase lands; the schedule itself is tested now so it can't silently drift.
 */
export type JobName =
  | "snapshot-flush" // every 15 min: CSV snapshot when a DB is in snapshot mode (§8.3)
  | "health-probe" // every 15 min: database health + quota meter (§8.2)
  | "rebalance" // hourly: move snapshots home after quota reset (§8.3)
  | "mover-ageing" // hourly: Ground-to-Sky ageing via Queues (§7)
  | "daily-csv-export" // daily 01:00 UTC: encrypted CSV export of everything (§8.5)
  | "journal-truncate" // daily 01:30 UTC: truncate chunks only if committed AND in a verified export (§8.5)
  | "vault-sweep"; // daily 02:00 UTC: orphan vault copies (ACCESS_AND_SETTINGS §10.3)

export function jobsDue(at: Date): JobName[] {
  const m = at.getUTCMinutes();
  const h = at.getUTCHours();
  const jobs: JobName[] = ["snapshot-flush", "health-probe"];
  if (m < 15) jobs.push("rebalance", "mover-ageing");
  if (h === 1 && m < 15) jobs.push("daily-csv-export");
  if (h === 1 && m >= 30 && m < 45) jobs.push("journal-truncate");
  if (h === 2 && m < 15) jobs.push("vault-sweep");
  return jobs;
}
