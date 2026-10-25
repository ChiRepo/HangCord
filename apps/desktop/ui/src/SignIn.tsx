import { useEffect, useRef, useState } from "react";
import type { LiveClient, LiveState } from "./live";

const errors: Record<string, string> = {
  invalid_credentials: "We couldn't sign you in. Check your email and password.",
  email_unverified: "Verify your email before signing in.",
  account_link_required: "This email already uses a password. Enter it below to link your Google account.",
  auth_not_configured: "Sign-in is not available in this build yet.",
  auth_unavailable: "Sign-in is temporarily unavailable. Try again.",
  auth_timeout: "Google sign-in expired. Choose Continue with Google and finish within three minutes.",
  auth_failed: "We couldn't complete sign-in. Try again.",
  invalid_response: "Sign-in returned an unexpected response. Try again.",
  network_unavailable: "Couldn't reach HangCord. Check your connection and try again.",
  rate_limited: "Too many attempts. Wait a moment and try again.",
  cancelled: "Sign-in was cancelled.",
  auth_cancelled: "Sign-in was cancelled.",
  sign_in_required: "Your session ended. Sign in again.",
  reauth_required: "Your session ended. Sign in again.",
  keychain_unavailable: "Unlock your device's secure credential storage, then try again.",
  cache_unavailable: "Device storage is unavailable. Changes will stay online for this session.",
  memory_paused: "Chat is paused while your device frees memory.",
  outbox_full: "Retry or finish pending messages before sending more.",
  forbidden: "You don't have permission for that action.",
  not_found: "This room is no longer available to you.",
  slowmode: "This room has slowmode. Wait before sending again.",
};
export const errorText = (code: string) => errors[code] ?? "Couldn't connect. Try again.";

export function SignIn({ state, client }: { state: LiveState; client: LiveClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const linking = state.error === "account_link_required";
  const submit = (google = false) => {
    const secret = password; setPassword("");
    void client.login(google || linking ? "google" : "password", email, secret, linking);
  };
  return <div className="signin">
    <section className="signin__brand" aria-label="HangCord">
      <div className="brand"><span aria-hidden="true">H</span>HangCord</div>
      <div><h1>A better place to hang out.</h1><p>Talk and share with the people you want to spend time with.</p></div>
      <p>Windows · macOS · Linux</p>
    </section>
    <main className="signin__main">
      <form className="signin__form" onSubmit={(event) => { event.preventDefault(); submit(); }} aria-labelledby="signin-title">
        <div><h2 id="signin-title">{linking ? "Link Google account" : "Welcome back"}</h2><p>Sign in to pick up where you left off.</p></div>
        <button className="btn btn--ghost" type="button" disabled={!state.configured || state.busy} onClick={() => submit(true)}>Continue with Google</button>
        <div className="signin__divider">or with email</div>
        <label>Email<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={state.busy} /></label>
        <label>Password<input type="password" autoComplete="current-password" required maxLength={4096} value={password} onChange={(event) => setPassword(event.target.value)} disabled={state.busy} /></label>
        {!state.configured && <p role="status">Sign-in is not available in this build yet.</p>}
        {state.error && <p className="error" role="alert">{errorText(state.error)}</p>}
        {state.busy && <p role="status">Signing in… If your browser opened, complete Google sign-in within three minutes.</p>}
        <button type="submit" className="btn btn--primary" disabled={!state.configured || state.busy || !email || !password}>{linking ? "Link Google account" : "Sign in"}</button>
        {(state.busy || linking) && <button type="button" className="btn btn--ghost" onClick={() => { setPassword(""); void client.cancelLogin(); }}>Cancel</button>}
        <p className="signin__later">Account creation and password reset are coming in the next checkpoint.</p>
      </form>
    </main>
  </div>;
}

export function CreateHangoutForm({ client, cancel }: { client: LiveClient; cancel?: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return <form className="signin__form" onSubmit={(event) => {
    event.preventDefault(); setBusy(true); setError(false);
    void client.createHangout(name.trim()).then(() => cancel?.()).catch(() => setError(true)).finally(() => setBusy(false));
  }}>
    <h1>{cancel ? "Create a hangout" : "Your first hangout"}</h1>
    <p>Create a place to talk with your friends.</p>
    <label>Hangout name<input autoFocus value={name} maxLength={100} required onChange={(event) => setName(event.target.value)} /></label>
    {error && <p className="error" role="alert">Couldn't create your hangout. Try again.</p>}
    <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>Create hangout</button>
    {cancel && <button type="button" className="btn btn--ghost" onClick={cancel}>Cancel</button>}
  </form>;
}


export function CreateHangoutDialog({ client, close }: { client: LiveClient; close: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
      if (!elements?.length) return;
      const first = elements[0]!, last = elements[elements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus(); };
  }, []);
  return <div className="scrim" onClick={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={ref} className="dialog" role="dialog" aria-modal="true" aria-label="Create a hangout"><CreateHangoutForm client={client} cancel={close} /></section></div>;
}
