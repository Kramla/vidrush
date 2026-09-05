# Building a Vidrush-Like AI Long-Form Video Platform

## Scope and evidence

This is a lawful product reverse-engineering, not a copy of Vidrush code, branding, prompts, assets, or private APIs. It is based on Vidrush's public product pages and documentation as of 2026-08-31. Anything marked **confirmed** is documented publicly; anything marked **recommended** is the implementation chosen to reproduce the behavior reliably.

Confirmed product behavior:

- One natural-language brief (or a custom script, voiceover, talking-head video, or avatar) becomes a long-form YouTube project.
- A brand profile applies reusable voice, language, visual theme, background, source restrictions, and motion-graphics choices.
- A preflight checker produces pass/warning/block outcomes, followed by an editable quote that shows inferred format, duration, title, voice, model, and cost before the user approves work.
- Generation is an asynchronous cloud job: research, script, TTS narration, visual sourcing, motion composition, render, and project creation. Vidrush exposes `queued`, `processing`, `editing`, and `failed` project states.
- The editor contains a timeline, media search/replacement, text/captions, audio controls, animations, transitions, project history, and a narrowly scoped conversational editing agent.
- Its documented Pro model uses Storyblocks video B-roll, images, and motion graphics; its Mini model uses images and motion graphics only. It also documents a separate commercial-stock / public-domain / web-sourcing policy.

Public evidence: [Vidrush overview](https://dev.docs.vidrush.ai/docs), [first-video flow](https://docs.vidrush.ai/docs/first-video-creation), [queue stages](https://docs.vidrush.ai/docs/queue-generation-overview), [editor](https://docs.vidrush.ai/docs/video-editor-overview), [brand profiles](https://docs.vidrush.ai/docs/brand-profiles), [asset compliance](https://docs.vidrush.ai/docs/compliance-footage-sourcing), and [credits](https://docs.vidrush.ai/docs/credit-systems).

## What you are actually building

Do **not** try to train a single model that produces a 20-minute video. The product is a durable workflow engine that turns structured editorial decisions into an editable timeline.

```mermaid
flowchart LR
  A[Brief / Script / Voice / A-roll] --> B[Preflight and Quote]
  B --> C[Durable Generation Workflow]
  C --> D[Research and Script]
  D --> E[Narration and Timing]
  E --> F[Visual Plan and Licensed Assets]
  F --> G[Timeline JSON]
  G --> H[Preview and Final Render]
  H --> I[Timeline Editor]
  I --> J[Versioned Re-render]
```

The timeline JSON is the product's source of truth. The MP4 is only a derived artifact. This single decision makes editing, history, re-rendering, agent edits, source attribution, and cost accounting tractable.

## Feature parity matrix

| Capability | Ship in | Exact implementation choice |
| --- | --- | --- |
| Prompt or custom-script documentary | MVP | English only, 6-20 minutes, one 16:9 format, one visual theme |
| Brand profiles | MVP | Voice, language, theme, background, source policy and banned templates |
| Quote before work | MVP | Structured interpretation plus immutable price quote and short-lived ledger hold |
| Research-backed script | MVP | Search/retrieval, source cards, citations in an internal fact sheet, JSON script schema |
| TTS and captions | MVP | Per-scene narration chunks, word timestamps, caption chunks derived from the same timings |
| Licensed visual sourcing | MVP | Customer uploads plus one commercial stock supplier; no open-web downloading |
| Composer and final MP4 | MVP | Timeline JSON -> Remotion composition -> FFmpeg worker render |
| Basic editor | MVP | Preview, replace visual, edit text, music volume, captions toggle, re-render |
| Credit ledger and subscriptions | MVP | Stripe subscription plus append-only credit ledger; settle only on successful final render |
| Multi-theme templates | V1 | Five original theme packs, each with fonts, palette, overlays, transitions and rules |
| Conversational editor | V1 | Constrained tools that propose JSON Patch operations; no direct arbitrary code or URL access |
| Talking-head edit | V2 | Transcription, silence/filler cuts, face/person checks, A-roll/B-roll planner |
| AI avatar | V2 | Contracted avatar provider and preset presenters only; explicit consent and category restrictions |
| General-web media crawling | Never by default | Add only with demonstrated rights, source allowlists, provenance, takedown handling and legal review |

## Recommended technical architecture

### Applications

Use a TypeScript monorepo with these deployables:

1. `apps/web` — Next.js, React, Tailwind, TanStack Query, authenticated dashboard and timeline editor.
2. `apps/api` — Fastify or NestJS REST API, WebSocket/SSE progress channel, webhook receivers, signed-upload creation.
3. `apps/workflow` — Temporal workers; this runs long jobs and survives restarts, retries, timeouts, and deploys.
4. `apps/render-worker` — container worker with Remotion, Chromium and FFmpeg. It reads a locked project revision and writes artifacts only.
5. `packages/domain` — Zod schemas, timeline types, pricing, policy code and shared API contracts.
6. `packages/templates` — original visual theme definitions and Remotion components.

### Managed infrastructure

| Need | Recommended service / component | Why |
| --- | --- | --- |
| Relational source of truth | PostgreSQL | Transactions for quotes, memberships, revisions and credit ledger |
| Workflow durability | Temporal Cloud or self-hosted Temporal | A 60-minute job needs resumable, idempotent steps rather than a request handler |
| Short-lived cache/limits | Redis | Rate limiting, progress fan-out and cached provider search results |
| Files | S3-compatible object store + CDN | Raw uploads, proxy previews, rendered MP4, thumbnails and transcripts |
| Search vectors | PostgreSQL `pgvector` initially | Store research/source embeddings without another database |
| Authentication | Clerk, WorkOS, or a robust in-house OIDC setup | Organizations, invitations, session security, MFA and audit events |
| Billing | Stripe | Subscriptions, payment methods, invoices and webhook events |
| Observability | Sentry + OpenTelemetry + structured logs | Correlate API request, workflow, provider request and render attempt by project ID |
| Rendering runtime | ECS/Fargate, Kubernetes, or a dedicated container runner | Isolate FFmpeg/Chromium, bound CPU/RAM, and auto-scale from workflow demand |

Keep secrets in a proper secret manager. The browser receives only signed upload/download URLs and never supplier, TTS, LLM, or payment secrets.

## Core domain model

Use UUID/ULID primary keys and `workspace_id` on every tenant-owned row. Apply row-level security in PostgreSQL and re-check workspace membership in the API.

| Table | Minimum important fields |
| --- | --- |
| `users` | `id`, `email`, `created_at` |
| `workspaces` / `memberships` | ownership, role, seat limit |
| `brand_profiles` | language, voice preset, `theme_id`, background asset, source-policy JSON, disabled-template IDs |
| `projects` | workspace, name, status, active revision, original input type, visible progress stage |
| `project_revisions` | immutable `timeline_json`, transcript, settings, created_by, parent revision |
| `generation_requests` | canonical requested settings, quote ID, idempotency key, Temporal workflow ID, status/error |
| `generation_steps` | request, stage, attempt, provider IDs, timestamps, sanitized failure reason |
| `assets` | owner, type, storage key, duration/dimensions, provider, source URL, rights/provenance JSON |
| `asset_licenses` | asset, license type, supplier ID, required attribution, allowed usage, expiry |
| `render_jobs` | revision, quality, status, output asset, checksum, worker metadata |
| `credit_ledger` | workspace, delta, type, reference ID, balance-after, immutable timestamp |
| `credit_holds` | quote, amount, expiry, state; protects against concurrent overspend |
| `agent_runs` | input, selected timeline scope, tool calls, proposed patch, approval, result |
| `audit_events` | actor, action, object, IP/request ID, before/after hash |

### Timeline contract

Store timeline data as validated JSON rather than hand-written FFmpeg filter strings.

```ts
type Timeline = {
  schemaVersion: 1;
  fps: 30;
  width: 1920;
  height: 1080;
  durationMs: number;
  tracks: Array<{
    id: string;
    kind: "visual" | "narration" | "music" | "sfx" | "caption" | "overlay";
    clips: Array<{
      id: string;
      assetId?: string;
      startMs: number;
      durationMs: number;
      trimStartMs?: number;
      transform?: { x: number; y: number; scale: number; opacity: number };
      text?: string;
      animation?: string;
      metadata: { sceneId: string; source?: "user" | "stock" | "generated" };
    }>;
  }>;
  markers: Array<{ atMs: number; type: "chapter" | "transition" | "hook" }>;
  provenance: Record<string, { sourceUrl?: string; licenseId?: string }>;
};
```

Schema-validate it on every write. The renderer accepts one project-revision ID, reads the immutable timeline, records its SHA-256 hash, and cannot modify editable project state.

## API surface

Use REST for conventional resources and SSE for project progress. Every mutation requires an `Idempotency-Key` header.

```text
POST   /v1/uploads/sign
POST   /v1/brand-profiles
PATCH  /v1/brand-profiles/:id
POST   /v1/generation/preflight
POST   /v1/generation/quotes
POST   /v1/generation/quotes/:id/approve
GET    /v1/projects?status=
GET    /v1/projects/:id
GET    /v1/projects/:id/events              # SSE
POST   /v1/projects/:id/revisions           # timeline JSON Patch
POST   /v1/projects/:id/assets/search
POST   /v1/projects/:id/assets/replace
POST   /v1/projects/:id/renders
POST   /v1/projects/:id/agent-runs
POST   /v1/stripe/webhooks
GET    /v1/billing/ledger
```

`POST /generation/preflight` returns a strict schema, never free-form prose:

```json
{
  "verdict": "pass | warning | block",
  "issues": [{"code":"LOW_FOOTAGE", "message":"...", "fix":"..."}],
  "inferred": {
    "format":"documentary",
    "targetDurationSec":1200,
    "title":"...",
    "language":"en",
    "visualModel":"pro",
    "reasoning":"medium"
  },
  "quoteInputHash":"sha256..."
}
```

The quote endpoint recomputes price server-side from the inference and active plan. The approval endpoint verifies the input hash, profile version, quote expiry, balance, and concurrency quota before starting exactly one workflow.

## Generation workflow, step by step

Implement this with a Temporal workflow named `GenerateProjectV1`. Each activity has an idempotency key based on `request_id + stage + input_hash`; write its result before moving on. Retries must be provider-specific, with exponential backoff and a dead-letter/needs-review state for repeated failures.

1. **Validate and reserve** — validate plan limits, inputs, uploaded-file metadata, source policy, prompt policy; create a temporary credit hold.
2. **Normalize inputs** — extract text from a custom script, transcode audio/video to a standard format, and transcribe user audio when supplied. Do not use LLM duration guesses when measured duration is available.
3. **Create editorial brief** — return typed JSON: topic, audience, format, target duration, pacing, chapters, title options, visual themes, must-cover facts, and prohibited claims.
4. **Research** — query reputable sources. Store URL, publication date, extraction hash, claim text, and source quality. Generate a fact sheet with a claim-to-source mapping. Refuse or downgrade claims that lack credible support.
5. **Write the script** — generate a scene-level script. Require every factual statement to link to one or more fact-sheet IDs. Run a second pass for contradictions, defamatory/medical/financial claims, duration and pronunciation notes.
6. **Plan scenes** — turn the script into `ScenePlan[]`: narration text, purpose, duration target, search terms, visual category, motion template, on-screen text, and whether a map/chart is needed.
7. **Generate narration** — send each scene to the TTS provider with the Brand Profile voice. Concatenate losslessly, normalize loudness, and retain segment timing. Use forced alignment or STT on the produced audio for word-level caption timestamps.
8. **Acquire visuals** — search only suppliers permitted by the profile. Rank candidates using semantic relevance, orientation, shot diversity, source preference, scene novelty, and license eligibility. Persist an `asset_license` record before use. Fallback order: licensed video -> licensed image -> user asset -> generated image with metadata.
9. **Build the timeline** — place narration first, then scene visual clips over the exact narration ranges, then transitions, captions, original overlays, original music and effects. Keep clip audio muted by default except when explicitly designed.
10. **Create preview and perform QC** — produce a 480p preview. Programmatically check missing assets, black frames, overlaps, invalid caption ranges, audio loudness, duration tolerance, license coverage and output decodability. A small LLM/vision review can flag obvious narrative mismatch, but must not be the sole gate.
11. **Render delivery** — create 1080p H.264/AAC MP4 and an HLS preview. Store project revision hash, artifact checksums, transcript, SRT/VTT, thumbnail, and source-attribution text.
12. **Settle billing and notify** — atomically convert the hold to a charge only after a successful final render. Release the hold on a system failure. Emit an audit event and notify the client via SSE/email.

The progress UI should map internal tasks to user-readable stages rather than expose raw provider details: `queued`, `researching`, `writing`, `narrating`, `finding visuals`, `assembling`, `rendering`, `editing`, `failed`.

## The editor and the agent

### Editor implementation

Build the editor around the same `Timeline` schema.

- Use a React preview player with frame-accurate time state; use a canvas/WebGL layer only for editing interaction, not as the source of truth.
- Use React DnD or pointer events for track/clip movement; quantize time to frames and provide snapping.
- Autosave optimistic JSON Patches, then create a named immutable revision after each meaningful mutation or render. Never silently overwrite a revision edited in another browser.
- Make every media replacement server-side: asset search returns rights-safe assets; the replacement API verifies that the output range is valid and maintains license provenance.
- Render lower-resolution previews for active editing and full quality only when a user requests an export. Cache by `timeline_hash + render_settings`.

The first editor should support only: clip replacement, clip trim, text edits, captions on/off, music level, transition enable/disable, and project history. That gives users control without taking on a full Premiere clone.

### Conversational edit agent

The agent should be an LLM calling a **small allowlisted toolset**, not an autonomous browser.

```text
get_selected_range(project_id)
search_licensed_assets(query, duration, policy)
propose_replace_clip(clip_id, asset_id)
propose_regenerate_narration(range, revised_text, voice_id)
propose_set_audio_level(track_id, db)
propose_set_project_setting(key, value)
propose_timeline_patch(json_patch)
create_render_preview(revision_id)
```

Pass the selected clip IDs/timestamps and a compact timeline summary into the model. Require the model to produce a JSON Patch plus a human-readable summary. Apply automatically only for safe, reversible, no-cost settings. Require confirmation for media downloads, generated assets, narration replacement, and any operation that consumes credits. Keep an `agent_runs` audit record containing the inputs, tools, proposed patch, user approval, and resulting revision.

## Visual themes and composition

Create original theme packs as versioned data plus components. Never copy Vidrush's logos, templates, background assets, or transition implementations.

```text
theme/
  theme.json              # palette, font license references, typography scale
  overlays/*.tsx          # original chapter, CTA, quote, statistic components
  transitions/*.tsx       # original cut, fade, swipe, zoom transitions
  selection-rules.json    # when each component can appear
```

Use a deliberate pacing algorithm: narration determines scene time; hard cuts are the default; transitions are sparse; a visual must change when the narration changes subject; no asset repeats inside a configurable window. A 70/30 cut-to-transition mix is a reasonable initial heuristic and is publicly described by Vidrush, but make your own templates and tune it using retention data.

## Legal, safety, and trust requirements

This is where a real competitor succeeds or fails.

1. **Media rights:** do not treat a web search result or YouTube download as reusable footage. Start with customer uploads and a commercial supplier. Record license, supplier asset ID, URL, retrieval date, and attribution requirements for every asset.
2. **Source controls:** implement per-profile provider toggles, URL/channel allowlists and blocklists, global high-risk source blocks, and a source-provenance panel in the editor.
3. **Generative media:** label generated visuals in provenance, apply platform disclosure workflows, and prohibit impersonation/deceptive presenters. Require user rights to uploaded faces, voices, and footage.
4. **Editorial safety:** maintain policies for illegal content, sexual material, graphic violence, defamation, medical/financial/legal claims, and current-event misinformation. Use risk-scored review queues rather than silently trusting a model.
5. **Privacy:** virus-scan uploads; isolate tenant storage paths; encrypt at rest; issue expiring signed URLs; define retention/deletion rules; support export/delete requests.
6. **Render isolation:** render untrusted uploaded files in locked-down containers with CPU/RAM/time limits, no internal-network access, and strict FFmpeg input validation.
7. **Billing correctness:** use append-only double-entry-like credit movements, idempotent payment webhooks, quote expiration, capacity limits, and refunds for platform failures.

## Build order

### Milestone 0 — Foundations

- Provision PostgreSQL, object storage, Temporal, Stripe test mode, provider credentials, error tracking and CI.
- Implement workspace auth, role checks, signed uploads, legal consent, audit events and the append-only credit ledger.
- Design the schemas above and create one manual timeline rendered by the same render-worker you will use in production.

Exit criterion: a test workspace can render a known, rights-cleared timeline end-to-end and reproduce the same artifact from a revision hash.

### Milestone 1 — Useful MVP

- Support English prompt/custom-script projects only; limit output to 6-20 minutes.
- Implement preflight, editable quote, credit hold, one brand profile, research/fact sheet, scene script, one TTS provider and one commercial stock source.
- Create one original theme, captions, music ducking, thumbnails, queued progress, MP4 download and a project list.
- Allow post-generation visual replacement and full re-render.

Exit criterion: a user can create a rights-safe 10-minute documentary, see its sources, swap one visual, and export a revised MP4 without staff intervention.

### Milestone 2 — Production quality

- Add five original themes, custom voiceover, source policy controls, team workspaces, usage quotas, subscriptions, project history and deterministic billing recovery.
- Add quality scoring: fact coverage, visual diversity, scene-to-visual semantic score, missing-license rate, render error rate, and time-to-first-preview.
- Add support tooling: project replay, provider retry, render logs, asset claim/takedown workflow and customer-visible source report.

Exit criterion: several concurrent jobs complete reliably; every finished asset has provenance; operators can replay a failed generation from its last successful workflow stage.

### Milestone 3 — Advanced inputs and agent

- Add talking-head uploads only after transcript/face/person/silence/quality checks are dependable.
- Add the constrained conversational edit tools, patch preview and approval flow.
- Integrate avatars through a licensed provider with explicit policy controls; do not offer arbitrary real-person likenesses.

Exit criterion: all agent actions are bounded, reversible, auditable, and cost-controlled.

## What not to build first

- General-web scraping/downloading, unlicensed media reuse, or a YouTube downloader.
- A complex multi-track NLE, custom voice cloning, arbitrary avatars, dozens of video-generation models, vertical formats, or direct YouTube publishing.
- “Research” that has no stored sources, a pipeline that charges before success, or a renderer that mutates project state.

The durable moat is not the prompt box. It is a reliable editable timeline, rights-safe media acquisition, consistently good visual selection, revision-safe rendering, and an operations system that can rerun long jobs without charging twice.

## Acceptance test suite

Before charging a real customer, automate these cases:

1. Identical quote approval requests create one workflow and one hold.
2. Two concurrent quote approvals cannot overspend credits.
3. A failed TTS or render retry resumes from checkpoints and neither duplicates external work nor double-charges.
4. Every visual clip in a completed project maps to a valid asset and license/provenance record.
5. Re-rendering the same revision/settings returns a cached result; a changed timeline produces a new revision/hash.
6. A user in workspace A cannot read, sign a URL for, or render workspace B's assets.
7. An agent cannot modify clips outside the selected scope or request arbitrary network URLs.
8. Invalid uploads, malformed timeline JSON and malicious media inputs are rejected before the render worker.
9. System failures release holds and produce a clear recoverable project state.
10. A project transcript, captions and visual scene timings remain synchronized after a clip replacement.
