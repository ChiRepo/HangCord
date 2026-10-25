import { useCallback, useEffect, useRef, useState } from "react";
import {
  has, liveSlug, MAX_ROOMS_PER_CATEGORY, type NewRoomError, type Room,
} from "@hangcord/protocol";
import { ClientCache, getPref, MemoryCacheStore, newRoomGuidelinesDefault } from "@hangcord/cache";
import { Avatar } from "@hangcord/ui";
import { LiveClient, type LiveState } from "./live";
import { SignIn, CreateHangoutForm, CreateHangoutDialog, errorText } from "./SignIn";
import { Icon } from "./Icon";
import { isDesktop, NativeDesktopPort, setLightweight, TauriCacheStore, watchGovernor, type GovernorStatus } from "./platform";

const PHONE_QUERY = "(max-width: 719px)";

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

export const PREF_LIGHTWEIGHT = "performance.lightweight";

function useLive() {
  const [state, setState] = useState<LiveState | null>(null);
  const client = useRef<LiveClient | null>(null);
  useEffect(() => {
    const cache = new ClientCache(isDesktop() ? new TauriCacheStore() : new MemoryCacheStore(), "desktop");
    const current = new LiveClient(new NativeDesktopPort(), cache, setState);
    client.current = current;
    setState(current.state);
    void current.start();
    return () => { void current.dispose(); };
  }, []);
  return { state, client };
}

function useGovernor(lightweightPref: boolean | undefined) {
  const [status, setStatus] = useState<GovernorStatus | null>(null);
  useEffect(() => {
    if (!isDesktop()) return;
    let stop: (() => void) | undefined;
    let active = true;
    void watchGovernor((value) => { if (active) setStatus(value); }).then((s) => { if (active) stop = s; else s(); }).catch(() => {});
    return () => { active = false; stop?.(); };
  }, []);
  // Lightweight mode is a saved preference (MASTER_PLAN §7.1): re-apply it on every start.
  useEffect(() => {
    if (isDesktop() && lightweightPref) void setLightweight(true).then(setStatus).catch(() => {});
  }, [lightweightPref]);
  return [status, setStatus] as const;
}

const mb = (b: number) => `${Math.round(b / (1024 * 1024))} MB`;

/** One history entry per layer, so the system back button (phones) closes the top layer. */
type Layer = "room" | "members" | "dialog";

export function App() {
  const phone = useMedia(PHONE_QUERY);
  const wide = useMedia("(min-width: 1100px)");
  const { state, client } = useLive();
  const [governor, setGovernor] = useGovernor(state ? getPref(state.prefs, PREF_LIGHTWEIGHT) === true : undefined);
  const [draft, setDraft] = useState("");
  const [creatingHangout, setCreatingHangout] = useState(false);
  const [pane, setPane] = useState<"list" | "room">("list");
  const [membersOpen, setMembersOpen] = useState(false);
  const [addTo, setAddTo] = useState<Room | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  const push = useCallback((layer: Layer) => history.pushState({ hc: layer }, ""), []);
  const closeLayer = useCallback((layer: Layer) => {
    if (history.state?.hc === layer) history.back(); // popstate does the closing
    else if (layer === "dialog") setAddTo(null);
    else if (layer === "members") setMembersOpen(false);
    else setPane("list");
  }, []);

  // Refs mirror the open layers so the popstate handler always sees the latest state.
  const layers = useRef({ addTo, membersOpen, pane });
  layers.current = { addTo, membersOpen, pane };
  useEffect(() => {
    const onPop = () => {
      const l = layers.current; // close the top-most open layer
      if (l.addTo) setAddTo(null);
      else if (l.membersOpen) setMembersOpen(false);
      else if (l.pane === "room") setPane("list");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Escape closes the members overlay (the dialog handles its own Escape).
  useEffect(() => {
    if (!membersOpen || wide || addTo) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeLayer("members");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [membersOpen, wide, addTo, closeLayer]);

  // Return focus to the + that opened the dialog.
  useEffect(() => {
    if (!addTo) opener.current?.focus();
  }, [addTo]);

  useEffect(() => { if (governor) client.current?.pressure(governor.zone); }, [governor, client]);
  useEffect(() => { setDraft(""); }, [state?.roomId]);

  if (!state || state.booting || !client.current) return <div className="boot" aria-busy="true" aria-label="Opening HangCord" />;
  const live = client.current;
  if (!state.user) return <SignIn state={state} client={live} />;
  const signOut = <button className="btn btn--ghost" onClick={() => void live.logout()}>Sign out</button>;
  if (!state.snap) return <main className="empty-hangout">
    {signOut}
    {state.error && <p className="error" role="alert">{errorText(state.error)} <button className="btn" onClick={() => void live.refresh()}>Retry</button></p>}
    {state.hangouts.length ? <p role="status">Loading your hangout…</p> : <CreateHangoutForm client={live} />}
  </main>;

  const toggleLightweight = async (on: boolean) => {
    setGovernor(await setLightweight(on));
    await live.preference(PREF_LIGHTWEIGHT, on);
  };
  const { snap, prefs, user } = state;
  const bits = (id: string) => BigInt(snap.myPermissions[id] ?? "0");
  const categories = snap.rooms.filter((r) => r.type === "category").sort((a, b) => a.position - b.position);
  const room = snap.rooms.find((r) => r.id === state.roomId);
  const initials = (name: string) => name.split(/[\s_-]+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  const canSend = !!room && has(bits(room.id), "SEND_MESSAGES") && state.connection !== "paused";
  const connectionLabel = { live: "Connected", connecting: "Reconnecting…", offline: "Offline", paused: "Paused for memory" }[state.connection];

  const openRoom = (id: string) => {
    void live.selectRoom(id);
    if (phone && pane !== "room") {
      setPane("room");
      push("room");
    }
  };
  const openMembers = () => {
    if (membersOpen) return closeLayer("members");
    setMembersOpen(true);
    push("members");
  };
  const openAdd = (cat: Room, el: HTMLButtonElement) => {
    opener.current = el;
    setAddTo(cat);
    push("dialog");
  };

  const addRoom = async (cat: Room, type: "text" | "lounge", name: string, guidelines: "category" | "own"): Promise<AddError | null> => {
    const error = await live.addRoom(cat, type, name, guidelines);
    if (error) return Object.hasOwn(ERROR_TEXT, error) ? error as AddError : "save_failed";
    const toRoom = phone && pane !== "room";
    if (history.state?.hc === "dialog") history.replaceState(toRoom ? { hc: "room" } : null, "");
    else if (toRoom) push("room");
    setAddTo(null);
    if (phone) setPane("room");
    return null;
  };

  const showList = !phone || pane === "list";
  const showRoom = !phone || pane === "room";

  return (
    <div className="app" data-layout={phone ? "phone" : "wide"} data-source={state.source} data-platform={isDesktop() ? "desktop" : "web"}>
      <div className="beta" role="note">
        <span>HangCord is in beta — things may load slowly or glitch while we build.</span>
        {signOut}
        {governor && (
          <span className="perf">
            <span className={`mem mem--${governor.zone}`} title={`Memory profile: ${governor.profile}`}>
              Memory {mb(governor.usedBytes)} / {mb(governor.budgetBytes)} · {governor.profile}
            </span>
            <button className="switch" role="switch" aria-checked={governor.lightweight} onClick={() => void toggleLightweight(!governor.lightweight)}>
              Lightweight mode
            </button>
          </span>
        )}
      </div>
      <div className="frame">
        {showList && (
          <nav className="dock" aria-label="Hangouts">
            {state.hangouts.map((h) => (
              <button key={h.id} className={`hangout${h.id === snap.hangoutId ? " is-active" : ""}`} aria-label={h.id === snap.hangoutId ? `${snap.hangout.name} (selected)` : h.name} aria-current={h.id === snap.hangoutId || undefined} onClick={() => void live.selectHangout(h.id)}>
                {initials(h.name)}
              </button>
            ))}
            <button className="hangout hangout--add" aria-label="Add a hangout" onClick={() => setCreatingHangout(true)}><Icon name="plus" /></button>
          </nav>
        )}

        {showList && (
          <aside className="rooms" aria-label="Rooms and lounges">
            <header className="rooms__head"><h1>{snap.hangout.name}</h1></header>
            <div className="rooms__list">
              {categories.map((cat) => {
                const may = has(bits(cat.id), "MANAGE_ROOMS");
                const children = snap.rooms.filter((r) => r.categoryId === cat.id).sort((a, b) => a.position - b.position);
                const full = children.length >= MAX_ROOMS_PER_CATEGORY;
                return (
                  <section key={cat.id} className="category" aria-labelledby={`cat-${cat.id}`}>
                    <div className="category__head">
                      <h2 id={`cat-${cat.id}`}>{cat.name}</h2>
                      {may && (
                        <button
                          className="add"
                          aria-label={full ? `${cat.name} is full (${MAX_ROOMS_PER_CATEGORY} rooms)` : `Add a room or lounge to ${cat.name}`}
                          title={full ? `This category is full (${MAX_ROOMS_PER_CATEGORY} rooms)` : undefined}
                          disabled={full}
                          onClick={(e) => openAdd(cat, e.currentTarget)}
                        >
                          <Icon name="plus" />
                        </button>
                      )}
                    </div>
                    {children.map((r) => (
                      <button
                        key={r.id}
                        className={`room${r.id === room?.id ? " is-active" : ""}`}
                        aria-current={r.id === room?.id ? "page" : undefined}
                        onClick={() => openRoom(r.id)}
                        onContextMenu={may ? (e) => { e.preventDefault(); openAdd(cat, e.currentTarget); } : undefined}
                      >
                        <Icon name={r.type === "lounge" ? "speaker" : "hash"} />
                        <span>{r.name}</span>
                      </button>
                    ))}
                  </section>
                );
              })}
            </div>
          </aside>
        )}

        {showRoom && room && (
          <main className="chat" aria-label={`Messages in ${room.name}`}>
            <header className="chat__head">
              {phone && <button className="icon-btn" aria-label="Back to rooms" onClick={() => closeLayer("room")}><Icon name="back" /></button>}
              <Icon name={room.type === "lounge" ? "speaker" : "hash"} />
              <h1>{room.name}</h1>
              {!room.syncWithCategory && room.type !== "category" && room.categoryId && <span className="tag">Own guidelines</span>}
              <span className="connection" role="status">{connectionLabel}</span>
              {!wide && <button className="icon-btn push" aria-label="Members" aria-expanded={membersOpen} onClick={openMembers}><Icon name="users" /></button>}
            </header>
            {state.error && <div className="chat-error" role="alert">{errorText(state.error)}</div>}
            <section className="messages" aria-live="polite">
              {state.hasMore && <button className="btn btn--ghost" onClick={() => void live.history()}>Earlier messages</button>}
              {!state.messages.length && <p className="empty-messages">No messages here yet.</p>}
              {state.messages.map((m) => {
                const author = m.authorId === user.id ? user.displayName : m.authorId;
                return <article key={m.id} className="msg">
                  <Avatar initials={initials(author)} />
                  <div><p className="msg__meta"><b>{author}</b> <time dateTime={new Date(m.createdAt).toISOString()}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></p><p>{m.content}</p>
                    {m.delivery === "sending" && <small>Sending…</small>}
                    {m.delivery === "failed" && <button className="btn btn--ghost" disabled={!canSend} onClick={() => void live.send(m.content, m.nonce)}>Retry message</button>}
                  </div>
                </article>;
              })}
            </section>
            <form className="composer" onSubmit={(event) => { event.preventDefault(); if (canSend && draft.trim()) { void live.send(draft); setDraft(""); } }}>
              <label className="sr-only" htmlFor="composer">Message {room.name}</label>
              <input id="composer" placeholder={canSend ? `Message ${room.type === "lounge" ? room.name : "#" + room.name}` : "You can't send messages here"} autoComplete="off" maxLength={4000} disabled={!canSend} value={draft} onChange={(event) => setDraft(event.target.value)} />
              <button className="icon-btn" aria-label="Send" disabled={!canSend || !draft.trim()}><Icon name="send" /></button>
            </form>
          </main>
        )}

        {(membersOpen || wide) && (
          <>
            {!wide && <div className="members-scrim" onClick={() => closeLayer("members")} aria-hidden="true" />}
            <aside className={`members${!wide ? " overlay" : ""}${phone ? " sheet" : ""}`} aria-label="Members">
              <div className="members__head">
                <h2>Members</h2>
                {!wide && <button className="icon-btn" aria-label="Close members" onClick={() => closeLayer("members")}><Icon name="close" /></button>}
              </div>
              <div className="member">
                <Avatar initials={initials(user.displayName)} status={state.connection === "live" ? "online" : "offline"} />
                <span><b>{user.displayName}</b><small>You</small></span>
              </div>
              <p className="directory-note">The full member directory is coming later.</p>
            </aside>
          </>
        )}
      </div>

      {phone && (
        <nav className="tabs" aria-label="Main">
          {(["Home", "Chats", "Notifications", "You"] as const).map((t, i) => (
            <button key={t} className="tab" aria-current={i === 0 ? "page" : undefined}><Icon name={(["home", "chat", "bell", "user"] as const)[i]!} /><span>{t}</span></button>
          ))}
        </nav>
      )}

      {creatingHangout && <CreateHangoutDialog client={live} close={() => setCreatingHangout(false)} />}

      {addTo && (
        <AddRoomDialog
          category={addTo}
          preselect={newRoomGuidelinesDefault(prefs, snap.hangoutId)}
          onCancel={() => closeLayer("dialog")}
          onCreate={(type, name, g) => addRoom(addTo, type, name, g)}
        />
      )}
    </div>
  );
}

type AddError = NewRoomError | "save_failed";

const ERROR_TEXT: Record<AddError, string> = {
  save_failed: "Couldn't save on this device. Try again.",
  bad_settings: "Some of those settings aren't allowed.",
  forbidden: "You can't add rooms to this category.",
  needs_manage_room_permissions: "You can't change permissions here.",
  grants_exceed_creator: "Those guidelines would open more than you're allowed to.",
  bad_bits: "Those permissions aren't valid.",
  category_full: `This category is full (${MAX_ROOMS_PER_CATEGORY} rooms).`,
  hangout_full: "This hangout has the maximum number of rooms.",
  not_a_category: "That category doesn't exist any more.",
  nested_category: "Categories can't go inside categories.",
  bad_name: "Use letters or numbers in the name.",
};

/** "Add to ‹category›" — dialog on wide screens, bottom sheet on phones (ACCESS_AND_SETTINGS §7.1). */
function AddRoomDialog(props: {
  category: Room;
  preselect: "category" | "own" | null;
  onCancel: () => void;
  onCreate: (type: "text" | "lounge", name: string, guidelines: "category" | "own") => Promise<AddError | null>;
}) {
  const [type, setType] = useState<"text" | "lounge">("text");
  const [name, setName] = useState("");
  const [guidelines, setGuidelines] = useState<"category" | "own" | null>(props.preselect);
  const [error, setError] = useState<AddError | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const { onCancel } = props;

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key !== "Tab" || !formRef.current) return;
      // Keep focus inside the modal.
      const f = [...formRef.current.querySelectorAll<HTMLElement>("input, button:not([disabled])")];
      const first = f[0];
      const last = f[f.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const canCreate = name.trim().length > 0 && guidelines !== null;
  const titleId = `add-${props.category.id}`;

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <form ref={formRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
        onSubmit={async (e) => { e.preventDefault(); if (canCreate) setError(await props.onCreate(type, name, guidelines!)); }}>
        <h2 id={titleId}>Add to {props.category.name}</h2>
        <fieldset className="choice">
          <legend>Type</legend>
          <label><input type="radio" name="type" checked={type === "text"} onChange={() => { setType("text"); setName(liveSlug(name)); }} /> <Icon name="hash" /> Room <small>Text chat</small></label>
          <label><input type="radio" name="type" checked={type === "lounge"} onChange={() => setType("lounge")} /> <Icon name="speaker" /> Lounge <small>Voice &amp; video</small></label>
        </fieldset>
        <label className="field">
          <span>Name</span>
          <input ref={nameRef} value={name} onChange={(e) => setName(type === "text" ? liveSlug(e.target.value) : e.target.value)} placeholder={type === "text" ? "new-room" : "New Lounge"} maxLength={100} aria-describedby={error ? "add-error" : undefined} />
        </label>
        <fieldset className="choice">
          <legend>Guidelines</legend>
          <label>
            <input type="radio" name="guidelines" checked={guidelines === "category"} onChange={() => setGuidelines("category")} />
            Follow {props.category.name} guidelines <small>Same permissions and defaults, kept in sync</small>
          </label>
          <label>
            <input type="radio" name="guidelines" checked={guidelines === "own"} onChange={() => setGuidelines("own")} />
            Own guidelines <small>Starts as a copy — change it just for this room</small>
          </label>
        </fieldset>
        {error && <p id="add-error" className="error" role="alert">{ERROR_TEXT[error]}</p>}
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={!canCreate}>Create</button>
        </div>
      </form>
    </div>
  );
}
