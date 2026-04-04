# Hosted Testing Notes

This extension project uses two runtime paths:

- `local`: browser source or local file testing against `ws://127.0.0.1:8787`
- `twitch`: hosted Twitch Extension context using `window.Twitch.ext.listen("broadcast", ...)`

## Force Hosted Mode

Use:

```text
?transport=twitch
```

Recommended additional validation:

```text
?transport=twitch&channelId=<expected broadcaster id>&authTimeoutMs=12000
```

## What the clients now validate

1. They wait briefly for Twitch helper availability before falling back in `auto` mode.
2. They fail visibly in `twitch` mode if Twitch context never appears.
3. They compare the authorized channel ID against the expected `channelId` query param when provided.
4. They surface `Channel mismatch`, `No context`, `Auth timeout`, `Stale`, and `Live` transport states in the UI.
5. They benefit from a periodic relay state heartbeat, so a hosted page refresh should recover within one heartbeat interval even if no new gameplay event fires.
6. The panel includes testing controls that can save shared runtime overrides for same-origin reload testing.

## Hosted Testing Checklist

1. Confirm the extension is installed on the intended broadcaster channel.
2. Confirm `TWITCH_BROADCASTER_ID` in the relay matches that same channel.
3. Confirm `TWITCH_EXTENSION_CLIENT_ID` and `TWITCH_EXTENSION_SECRET_BASE64` belong to the same extension.
4. Open the overlay and panel in hosted mode.
5. Verify the transport badge enters Twitch waiting or live state.
6. Trigger a relay event and confirm both clients receive the broadcast.
7. Refresh the hosted page and confirm state returns within the configured heartbeat interval.

## If Hosted Mode Fails

- `No context`: Twitch helper or extension host context never became available.
- `Auth timeout`: helper loaded, but Twitch authorization did not complete in time.
- `Channel mismatch`: the extension was authorized on a different channel than expected.
- `Stale`: authorization succeeded, but no recent payloads arrived.

## Hosted Snapshot Heartbeat

The relay sends a `shop_state` heartbeat on startup and then at a configurable interval using `STATE_BROADCAST_INTERVAL_MS`.

Default:

```text
15000
```

Lower intervals improve refresh recovery but increase Twitch broadcast traffic. Keep this conservative unless you need faster hosted rehydration.