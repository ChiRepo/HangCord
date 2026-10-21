//! Memory governor v1 (MASTER_PLAN §11).
//! Picks a budget for the WHOLE app process tree (Rust core + WebView processes) from the machine's
//! RAM, never above 1.7 GB, and reports a Green / Yellow / Red zone that caches react to.

use serde::Serialize;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

/// The budget is re-evaluated every 10 s (§11); usage is sampled every 5 s.
pub const BUDGET_EVERY: Duration = Duration::from_secs(10);

pub const MIB: u64 = 1024 * 1024;
pub const GIB: u64 = 1024 * MIB;
/// Hard ceiling: 1.7 GB (1,700 MiB) for the whole app, on any machine.
pub const HARD_CEILING: u64 = 1_700 * MIB;
/// Never plan below this, even when the machine is almost out of memory.
pub const FLOOR: u64 = 250 * MIB;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Profile {
    Lite,
    Balanced,
    Smooth,
    Rich,
    Max,
}

impl Profile {
    pub fn budget(self) -> u64 {
        match self {
            Profile::Lite => 300 * MIB,
            Profile::Balanced => 500 * MIB,
            Profile::Smooth => 800 * MIB,
            Profile::Rich => 1_200 * MIB,
            Profile::Max => HARD_CEILING,
        }
    }
}

/// Profile from total RAM (MASTER_PLAN §11 table). Uses GiB as the OS reports it, so an "8 GB"
/// laptop (~7.6 GiB usable) lands in Balanced and a "16 GB" one in Smooth.
pub fn profile_for_total(total: u64) -> Profile {
    match total {
        t if t <= 4 * GIB => Profile::Lite,
        t if t <= 8 * GIB => Profile::Balanced,
        t if t <= 16 * GIB => Profile::Smooth,
        t if t <= 32 * GIB => Profile::Rich,
        _ => Profile::Max,
    }
}

/// Effective budget = min(profile, 25% of currently available RAM, 1.7 GB), floor 250 MB.
/// Lightweight mode forces the Lite profile.
pub fn effective_budget(total: u64, available: u64, lightweight: bool) -> (Profile, u64) {
    let profile = if lightweight { Profile::Lite } else { profile_for_total(total) };
    let budget = profile.budget().min(available / 4).clamp(FLOOR, HARD_CEILING);
    (profile, budget)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Zone {
    Green,
    Yellow,
    Red,
}

/// < 70% Green (grow caches), 70–90% Yellow (evict LRU, stop prefetch), > 90% Red (unload).
pub fn zone(used: u64, budget: u64) -> Zone {
    if budget == 0 {
        return Zone::Red;
    }
    // Exact comparisons, no integer-division rounding: 90.5% is Red.
    let used100 = used.saturating_mul(100);
    if used100 > budget.saturating_mul(90) {
        Zone::Red
    } else if used100 >= budget.saturating_mul(70) {
        Zone::Yellow
    } else {
        Zone::Green
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub profile: Profile,
    pub budget_bytes: u64,
    pub used_bytes: u64,
    pub zone: Zone,
    pub lightweight: bool,
    pub process_count: usize,
}

/// `root` and every process descending from it (WebView helpers included).
pub fn tree_members(root: u32, procs: &[(u32, Option<u32>)]) -> Vec<u32> {
    let parent: HashMap<u32, Option<u32>> = procs.iter().copied().collect();
    let mut out = Vec::new();
    for (pid, _) in procs {
        let mut cur = Some(*pid);
        for _ in 0..64 {
            match cur {
                Some(p) if p == root => {
                    out.push(*pid);
                    break;
                }
                Some(p) => cur = parent.get(&p).copied().flatten(),
                None => break,
            }
        }
    }
    out
}

/// Sum of `mem` over the tree under `root`. Returns (bytes, process count).
pub fn tree_memory(root: u32, procs: &[(u32, Option<u32>, u64)]) -> (u64, usize) {
    let links: Vec<(u32, Option<u32>)> = procs.iter().map(|(p, pp, _)| (*p, *pp)).collect();
    let mem: HashMap<u32, u64> = procs.iter().map(|(p, _, m)| (*p, *m)).collect();
    let members = tree_members(root, &links);
    (members.iter().map(|p| mem.get(p).copied().unwrap_or(0)).sum(), members.len())
}

/// Proportional set size from /proc/<pid>/smaps_rollup: shared libraries and shared memory are
/// split between the processes that map them, so the app's helpers aren't counted several times
/// (plain RSS made an idle app look Red). `None` → fall back to RSS.
#[cfg(target_os = "linux")]
pub fn pss_bytes(pid: u32) -> Option<u64> {
    parse_pss(&std::fs::read_to_string(format!("/proc/{pid}/smaps_rollup")).ok()?)
}

#[cfg(not(target_os = "linux"))]
pub fn pss_bytes(_pid: u32) -> Option<u64> {
    // macOS: phys_footprint (proc_pid_rusage) and Windows: private working set are TODO — they
    // need platform FFI that can only be verified on those systems (what has to be changed.md).
    None
}

pub fn parse_pss(rollup: &str) -> Option<u64> {
    rollup
        .lines()
        .find_map(|l| l.strip_prefix("Pss:"))
        .and_then(|v| v.trim().trim_end_matches("kB").trim().parse::<u64>().ok())
        .map(|kb| kb * 1024)
}

pub struct Governor {
    sys: System,
    pid: Pid,
    pub lightweight: bool,
    budget: Option<(Instant, bool, Profile, u64)>,
}

impl Governor {
    pub fn new() -> Self {
        let pid = sysinfo::get_current_pid().unwrap_or_else(|_| Pid::from_u32(std::process::id()));
        Self { sys: System::new(), pid, lightweight: false, budget: None }
    }

    pub fn sample(&mut self) -> Status {
        self.sys.refresh_memory();
        self.sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_memory());
        let procs: Vec<(u32, Option<u32>, u64)> = self
            .sys
            .processes()
            .iter()
            // On Linux sysinfo also lists threads ("tasks"); they share their process's memory,
            // so counting them would multiply the total. Count real processes only.
            .filter(|(_, p)| p.thread_kind().is_none())
            .map(|(pid, p)| (pid.as_u32(), p.parent().map(|x| x.as_u32()), pss_bytes(pid.as_u32()).unwrap_or_else(|| p.memory())))
            .collect();
        let (used, process_count) = tree_memory(self.pid.as_u32(), &procs);
        let total = self.sys.total_memory();
        let available = self.sys.available_memory();
        let (profile, budget) = match self.budget {
            Some((at, lw, p, b)) if lw == self.lightweight && at.elapsed() < BUDGET_EVERY => (p, b),
            _ => {
                let (p, b) = effective_budget(total, available, self.lightweight);
                self.budget = Some((Instant::now(), self.lightweight, p, b));
                (p, b)
            }
        };
        Status {
            total_bytes: total,
            available_bytes: available,
            profile,
            budget_bytes: budget,
            used_bytes: used,
            zone: zone(used, budget),
            lightweight: self.lightweight,
            process_count,
        }
    }
}

impl Default for Governor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profiles_follow_the_ram_table() {
        assert_eq!(profile_for_total(4 * GIB), Profile::Lite);
        assert_eq!(profile_for_total(7 * GIB + 600 * MIB), Profile::Balanced); // "8 GB" laptop
        assert_eq!(profile_for_total(15 * GIB + 500 * MIB), Profile::Smooth); // "16 GB"
        assert_eq!(profile_for_total(31 * GIB), Profile::Rich);
        assert_eq!(profile_for_total(64 * GIB), Profile::Max);
    }

    #[test]
    fn budget_never_exceeds_1_7_gb_and_respects_available_and_floor() {
        // 128 GB machine with lots free: capped at 1.7 GB.
        assert_eq!(effective_budget(128 * GIB, 100 * GIB, false), (Profile::Max, HARD_CEILING));
        // 16 GB machine with only 2 GB free: 25% of available = 512 MiB beats the 800 MiB profile.
        assert_eq!(effective_budget(16 * GIB, 2 * GIB, false).1, 512 * MIB);
        // Nearly out of memory: floor 250 MiB.
        assert_eq!(effective_budget(8 * GIB, 100 * MIB, false).1, FLOOR);
        // Lightweight mode forces Lite even on a big machine.
        assert_eq!(effective_budget(64 * GIB, 40 * GIB, true), (Profile::Lite, 300 * MIB));
    }

    #[test]
    fn zones() {
        assert_eq!(zone(69, 100), Zone::Green);
        assert_eq!(zone(70, 100), Zone::Yellow);
        assert_eq!(zone(90, 100), Zone::Yellow);
        assert_eq!(zone(905, 1000), Zone::Red, "90.5% is above 90%");
        assert_eq!(zone(91, 100), Zone::Red);
        assert_eq!(zone(1, 0), Zone::Red);
    }

    #[test]
    fn parses_pss_from_smaps_rollup() {
        let sample = "55a1-7ffe ---p 00000000 00:00 0 [rollup]\nRss:              180224 kB\nPss:               96512 kB\nPss_Anon:          60000 kB\n";
        assert_eq!(parse_pss(sample), Some(96512 * 1024));
        assert_eq!(parse_pss("Rss: 1 kB"), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn pss_is_available_for_own_process_and_not_above_rss() {
        let pss = pss_bytes(std::process::id()).expect("smaps_rollup readable for self");
        let rss = std::fs::read_to_string("/proc/self/status").unwrap().lines().find_map(|l| l.strip_prefix("VmRSS:")).unwrap().trim().trim_end_matches("kB").trim().parse::<u64>().unwrap() * 1024;
        assert!(pss > 0 && pss <= rss + 1024 * 1024);
    }

    #[test]
    fn lightweight_change_recomputes_budget_immediately() {
        let mut g = Governor::new();
        let normal = g.sample();
        g.lightweight = true;
        let lite = g.sample();
        assert_eq!(lite.profile, Profile::Lite);
        assert!(lite.budget_bytes <= normal.budget_bytes);
    }

    #[test]
    fn tree_memory_counts_only_descendants() {
        // 10 = app, 11 = webview child, 12 = grandchild, 20 = unrelated, cycle 30<->31 must not hang.
        let procs = vec![
            (10, Some(1), 100),
            (11, Some(10), 50),
            (12, Some(11), 25),
            (20, Some(1), 999),
            (30, Some(31), 7),
            (31, Some(30), 7),
        ];
        assert_eq!(tree_memory(10, &procs), (175, 3));
    }

    #[test]
    fn live_sample_ignores_threads() {
        // Spawn busy threads: if threads were counted as processes, used memory would multiply.
        let mut g = Governor::new();
        let before = g.sample();
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let stop = stop.clone();
                std::thread::spawn(move || while !stop.load(std::sync::atomic::Ordering::Relaxed) { std::thread::sleep(std::time::Duration::from_millis(5)) })
            })
            .collect();
        std::thread::sleep(std::time::Duration::from_millis(50));
        let during = g.sample();
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(during.process_count, before.process_count, "threads must not count as processes");
        assert!(during.used_bytes < before.used_bytes * 3, "memory multiplied by thread count");
    }

    #[test]
    fn live_sample_is_sane() {
        let mut g = Governor::new();
        let s = g.sample();
        assert!(s.total_bytes > 0);
        assert!(s.used_bytes > 0, "the test process itself uses memory");
        assert!(s.budget_bytes >= FLOOR && s.budget_bytes <= HARD_CEILING);
    }
}
