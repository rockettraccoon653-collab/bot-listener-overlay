# Rockett DnD Overlay

This project is a hybrid Twitch Extension + local relay setup for a DnD-themed stream overlay.

## Project Map

- `index.html`, `script.js`, `style.css`, `config.js`: overlay client
- `extension/panel.html`, `extension/panel.js`: Twitch panel client
- `chat-bridge/`: local relay that reads Twitch chat, maintains viewer state, and sends extension broadcasts
- `start-chat-relay.bat`: Windows launcher for the local relay

## Local Development

### 1. Start the relay

From the repo root on Windows:

```bat
start-chat-relay.bat
```

Or manually:

```powershell
Set-Location .\chat-bridge
npm install
npm run check
npm start
```

### 2. Open the overlay or panel in local mode

Use query params to force local transport and avoid Twitch-context ambiguity during browser-source testing.

- Overlay local mode: `index.html?transport=local`
- Panel local mode: `extension/panel.html?transport=local`
- Custom relay URL: append `&ws=ws://127.0.0.1:8787`

### 3. Open the local guild hall

When the relay is running, the local guild site is available at:

- `http://127.0.0.1:8788/guild-shop/`
- `http://127.0.0.1:8788/guild-shop/?player=<username>`

This page is read-only for now and shows the persistent profile, currency, XP, level, stats, classes, titles, inventory, equipped gear, shop catalog, and gold leaderboard.

## Hosted Guild Hall Deployment

The Guild Hall web entry point is the standalone site in `guild-site/`:

- deploy folder: `guild-site`
- entry file: `guild-site/index.html`
- Vercel Root Directory: `guild-site`

Keep the repo root deployment pointed at the overlay only if you still want the stream overlay hosted separately. The overlay root page remains `index.html` at the repo root and was not moved.

For a standalone Guild Hall deployment, `guild-site/config.js` controls where the browser sends Guild Hall API requests:

- leave `apiBaseUrl` empty when the site and `/api/guild/*` endpoints are served from the same origin
- set `apiBaseUrl` to your relay or API host when the frontend is deployed separately, for example `https://your-api-host.example.com`

### 4. Watch transport status

Both overlay and panel now show a transport badge:

- `LOCAL Waiting`: connected but waiting for state/events
- `LOCAL Live`: payloads are arriving
- `LOCAL Stale`: no recent payloads
- `LOCAL Error`: connection/bootstrap failed

The local relay now sends an immediate state snapshot on connect, so reloads should no longer wait for the next timed update to restore boss, leaderboard, purchases, and XP boost state.

The panel also includes a testing-controls section that can save runtime overrides into local storage. When the overlay is served from the same origin, it will pick up those saved overrides on its next reload.

## Hosted Twitch Testing

### Overlay or panel in Twitch mode

Force Twitch-only behavior with:

- `?transport=twitch`

Optional validation params:

- `channelId=<numeric broadcaster channel id>`
- `authTimeoutMs=12000`

Examples:

- `index.html?transport=twitch&channelId=12345678`
- `extension/panel.html?transport=twitch&channelId=12345678`

You can also set these values from the panel testing controls instead of editing query params manually.

If Twitch auth succeeds on the wrong channel, the client will now show `Channel mismatch` instead of silently proceeding.

If Twitch extension context never arrives, the client will show `No context` or `Auth timeout` instead of silently failing.

The relay also emits a periodic hosted state heartbeat so Twitch-only pages can recover leaderboard, boss, purchase, and XP boost state without waiting for a fresh gameplay event. The interval defaults to `15000ms` and can be tuned with `STATE_BROADCAST_INTERVAL_MS`.

## Required Secrets

See `chat-bridge/.env.example`.

Minimum relay secrets:

- `TWITCH_BOT_USERNAME`
- `TWITCH_BOT_OAUTH_TOKEN`
- `TWITCH_CHANNEL`
- `TWITCH_EXTENSION_CLIENT_ID`
- `TWITCH_EXTENSION_OWNER_USER_ID`
- `TWITCH_EXTENSION_SECRET_BASE64`
- `TWITCH_BROADCASTER_ID`
- `STATE_BROADCAST_INTERVAL_MS` for hosted snapshot heartbeat tuning

## Checks

Run the repo validation command from `chat-bridge/`:

```powershell
Set-Location .\chat-bridge
npm run check
```

This validates JavaScript syntax, DOM bindings, config shape, env example coverage, and viewer JSON integrity.

## Current Deployment Boundary

This repo contains the extension clients and the local relay sender, but it does not contain a separate hosted EBS service or a checked-in Twitch manifest file.

Use the Twitch Developer Console to:

1. Register the panel and overlay assets
2. Configure hosting URLs
3. Install the extension on the intended broadcaster channel
4. Verify the configured broadcaster ID matches `TWITCH_BROADCASTER_ID`

## Recommended Workflow

1. Build and test overlay and panel with `?transport=local`
2. Run `npm run check`
3. Move to hosted testing with `?transport=twitch&channelId=<expected id>`
4. Verify the transport badge shows Twitch authorization on the correct channel
5. Only then validate live extension broadcasts from the relay