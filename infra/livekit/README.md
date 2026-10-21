# LiveKit on Oracle Cloud Always Free (owner steps)

Agents can't create cloud accounts or touch real keys, so this part of checkpoint 1 is **owner-run**.

1. Create the Oracle Always Free Ampere A1 VM (MASTER_PLAN §10). Install Docker + the compose plugin.
2. Open ports in the VCN security list **and** the host firewall: TCP 7880, 7881, 443; UDP 3478, 50000–60000.
3. Copy this folder to the VM. Create `.env` next to `docker-compose.yml` (never commit it):
   `LIVEKIT_KEYS="<api key>: <api secret>"` — generate a long random secret on your own computer.
4. Put the same key/secret into Cloudflare with `npx wrangler secret put LIVEKIT_API_KEY` and
   `npx wrangler secret put LIVEKIT_API_SECRET` in `workers/api` (the Worker issues 10-minute room tokens).
5. Point a DNS name at the VM for TURN/TLS, mount the certificate, set `turn.domain` in `livekit.yaml`.
6. `docker compose up -d`, then check `curl http://<vm-ip>:7880` answers. That's the Phase 0 "LiveKit reachable" exit check.
7. Oracle may reclaim idle Always Free VMs — keep a health check pinging it (MASTER_PLAN §10).
