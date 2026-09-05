# Scriptflow n8n Publishing Bridge

This bridge connects **only completed, Gemini-verified renders** to n8n. It does not send scripts, stock-search candidates, Gemini API keys, ElevenLabs keys, or raw media through the browser.

## 1. What Scriptflow sends

After a successful render, Scriptflow writes `renders/<render-id>/automation.json` and evaluates the selected scene visuals.

- Every selected scene must have `answer: "yes"`, `eligible: true`, and `verdict: "strong-match"` from Gemini.
- If any scene is unverified, rendering still works locally, but n8n publishing is `blocked`.
- With approval enabled, the user clicks **Approve & Queue Publishing** after the render.
- With approval disabled, Scriptflow sends `render.completed` automatically.

The n8n webhook receives this signed JSON shape:

```json
{
  "schemaVersion": 1,
  "eventId": "evt_...",
  "eventType": "publish.requested",
  "occurredAt": "2026-09-02T00:00:00.000Z",
  "callbackUrl": "http://127.0.0.1:8080/api/automation/n8n/callback",
  "render": {
    "renderId": "2026-...",
    "title": "Video title",
    "durationSeconds": 47.2,
    "scenesCount": 9,
    "aspectRatio": "9:16",
    "videoUrl": "http://127.0.0.1:8080/renders/.../vidrush-render.mp4",
    "manifestUrl": "http://127.0.0.1:8080/renders/.../render-manifest.json"
  }
}
```

## 2. Server configuration

Add these values to `.env.local` on the Scriptflow machine. Generate long random secrets; never place them in browser local storage or a project manifest.

```text
N8N_RENDER_WEBHOOK_URL=http://127.0.0.1:5678/webhook/scriptflow-verified-render
N8N_WEBHOOK_SECRET=replace-with-a-long-random-secret
N8N_CALLBACK_SECRET=replace-with-a-different-long-random-secret
N8N_REQUIRE_APPROVAL=true
SCRIPTFLOW_PUBLIC_BASE_URL=http://127.0.0.1:8080
```

For local n8n on the same computer, the `127.0.0.1` URLs work. For n8n Cloud or a remote n8n server, `SCRIPTFLOW_PUBLIC_BASE_URL` must be a public HTTPS URL that both n8n and the social publisher can reach. Do not expose the local server without authentication, TLS, and an access-control layer.

Restart Scriptflow after changing these values. The n8n modal then reports **configured**.

## 3. Build the n8n workflow

Create an inactive workflow named `Scriptflow Verified Render Publishing` with these nodes:

```text
Webhook (POST /scriptflow-verified-render)
  -> Verify Scriptflow HMAC
  -> Respond to Webhook (202 accepted)
  -> Switch eventType
      -> publish.requested / render.completed
      -> Download rendered MP4
      -> Upload to your storage or publishing service
      -> Publish or schedule
      -> Send signed Scriptflow callback
```

### Webhook node

- Method: `POST`
- Path: `scriptflow-verified-render`
- Response mode: use a **Respond to Webhook** node so n8n returns `202` immediately before downloading/uploading the video.
- Activate the workflow and copy the production webhook URL into `N8N_RENDER_WEBHOOK_URL`.

### Verify Scriptflow HMAC

Scriptflow sends these headers:

```text
X-Scriptflow-Event-Id
X-Scriptflow-Timestamp
X-Scriptflow-Signature: sha256=<hex>
```

The signature is HMAC-SHA256 over this exact string:

```text
<timestamp>.<raw request body>
```

Configure the verification node with `N8N_WEBHOOK_SECRET` stored as an n8n credential/custom variable. Reject the request if the timestamp is more than five minutes old, the signature differs, or `eventType` is not `render.completed` or `publish.requested`.

For self-hosted n8n, a Code node can use Node's `crypto.createHmac('sha256', secret)`. If your n8n setup restricts Node built-ins, implement the same HMAC check with its Crypto node or an approved internal verification endpoint. Do not remove this check merely to make the workflow easier to test.

### Download and publish

Use an HTTP Request node to download `render.videoUrl` as a file. Then connect only the destinations you actually own, for example:

- Google Drive/S3/R2 archival upload;
- a human approval branch;
- YouTube, TikTok, Instagram, or a vetted publishing provider;
- Discord/Slack completion notification.

Keep all destination OAuth/API credentials inside n8n Credentials. The Scriptflow event contains no destination credentials and has no permission to choose a social account.

## 4. Send the callback

After each meaningful state, n8n must POST to `callbackUrl` with a unique `callbackId`:

```json
{
  "renderId": "2026-...",
  "eventId": "evt_...",
  "callbackId": "n8n-unique-id-for-this-attempt",
  "status": "publishing",
  "message": "Uploading the verified render to the selected destination.",
  "platforms": ["youtube"]
}
```

Allowed statuses are `awaiting-approval`, `publishing`, `published`, and `failed`. A final `published` callback can also include `publishedUrl`.

Sign the exact raw JSON callback body with `N8N_CALLBACK_SECRET` and send:

```text
X-Scriptflow-Timestamp: <unix milliseconds>
X-Scriptflow-Signature: sha256=<HMAC_SHA256(timestamp + '.' + raw_body)>
```

Configure the n8n HTTP Request node to send the already-serialized raw JSON body, not a re-serialized object, so it matches the HMAC input. Scriptflow rejects expired, invalid, duplicate, or wrong-event callbacks.

## 5. Safety and failure behavior

- n8n cannot publish an unverified render because Scriptflow never creates a publish event for it.
- Scriptflow stores callback IDs and ignores repeat callbacks, making retries safe.
- A failed n8n dispatch becomes `dispatch-failed`; the local MP4 remains available.
- A failed publishing callback becomes `failed`; it never removes the local MP4.
- Scriptflow does not assume a `published` result until n8n sends a valid signed callback.
- Do not place API keys in an n8n Set node or in a workflow export committed to source control.

## 6. First safe test

1. Configure n8n locally with a webhook that verifies the signature and responds `202`.
2. Set `N8N_REQUIRE_APPROVAL=true`.
3. Render a project where every selected visual has a Gemini `strong-match`.
4. Click **Approve & Queue Publishing**.
5. Confirm n8n receives `publish.requested` and the Scriptflow panel becomes `Queued`.
6. Send a signed `publishing` callback, then a signed `published` callback with a test URL.
7. Confirm the Scriptflow panel updates without changing the render or media audit.
