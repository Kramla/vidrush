# ScriptFlow Director Architecture

## Runtime Boundaries

1. **Vanilla browser editor**
   - Displays the project, playback transport, timeline, inspector, and Gemini chat.
   - Sends natural-language requests and renders persistent job progress.
   - Commits an approved transaction through the same `ProjectStore.dispatch` path used by manual controls.

2. **Shared deterministic editing engine**
   - Lives in `js/editingEngine.js` and runs unchanged in the browser and Node.
   - Owns operation normalization, validation, atomic application, revision increments, timing recalculation, and manifest fingerprints.
   - Uses operation schema `1.0.0`.
   - A batch increments the project revision exactly once.

3. **Node execution layer**
   - Owns Gemini calls, tool execution, proposal integrity checks, persistence, media policy enforcement, rendering, and API boundaries.
   - Gemini never receives shell access, arbitrary file access, direct database access, or direct project-write access.

4. **Gemini creative director**
   - Uses the official Gemini function-calling protocol across multiple model turns.
   - Selects creative actions but can act only through six declared tools.
   - Tool-returned transcript and media fields are explicitly treated as untrusted data.

5. **Python/video-use worker**
   - `integrations/video-use/render_bridge.py` adapts a ScriptFlow project to the official vendored `browser-use/video-use` renderer.
   - The renderer performs segment extraction, audio fades, concat, subtitle-last compositing, and loudness normalization.

6. **ElevenLabs narration provider**
   - Remains the first-class cloud TTS path.
   - Speech-with-timestamps retimes scenes and captions before the video-use EDL is rendered.

## Director Job Lifecycle

```text
queued -> running -> awaiting_approval -> approved
                    |                  -> stale -> rebased job
                    |                  -> rejected
                    -> completed (answer only, no edits)
running -> cancelled
running -> failed
```

- Every request creates a durable SQLite record in `director_jobs`.
- A record stores its base revision, base fingerprint, base manifest, normalized operations, staged manifest, result, usage counters, and bounded tool trace.
- Jobs left in `queued` or `running` are marked `failed/interrupted` after a server restart rather than silently disappearing.
- API keys are used only for the active model request and are not written to the job record.

## Bounded Gemini Tools

### `inspect_project`

Returns project identity, revision, fingerprint, scene count, total duration, format, active scene, unresolved-media count, captions, and music settings.

### `read_transcript`

Returns exact narration, caption text, and timing in bounded pages. Gemini must read a scene before proposing a scene-scoped edit.

### `inspect_available_media`

Returns selected assets and bounded candidate lists. A visual replacement can reference only an existing asset ID marked `geminiVerified=true` for that exact scene.

### `propose_edits`

Submits operation intents to Node. Node resolves verified assets, rejects unsupported fields, compiles the operations through the shared engine, and stores a temporary staged manifest. It never commits the active project.

### `request_draft_preview`

Creates one cost-safe deterministic timeline-diff preview job. It reports timing, ordering, visual, caption, music, and unresolved-media changes without spending ElevenLabs or generative-media credits. It does not automatically launch a full video render.

### `inspect_job_results`

Reads only preview jobs created in the same director session. It cannot inspect arbitrary database records.

## Approval and Staleness

1. The browser receives a staged proposal card.
2. **Apply** sends the current manifest to Node.
3. Node compares both revision and deterministic fingerprint with the proposal base.
4. If unchanged, Node reconstructs the exact staged transaction and verifies its staged fingerprint.
5. The browser applies that approved transaction through `ProjectStore.dispatch`, creating one undo step, then saves it immediately.
6. If the project changed, Node marks the proposal `stale`. The user can reject it or create a new rebased director job.

## Operation Vocabulary

- `REWRITE_SCENE_TEXT`
- `REPLACE_VISUAL`
- `SET_SCENE_DURATION`
- `SET_SCENE_MOTION`
- `MOVE_SCENE`
- `REORDER_SCENES`
- `SET_CAPTION_STYLE`
- `SET_BGM_CONFIG`
- `SET_THEME`
- `ADD_SCENE`
- `REMOVE_SCENE`

Manual editor controls can additionally use project-configuration operations such as voice, aspect ratio, source policy, and project loading. All operations still pass through the same engine.

## Limits and Safety

- Maximum 10 model turns per director job.
- Maximum 24 tool calls per director job.
- Maximum one cost-safe preview request per director job.
- Maximum operations scale with project scene count and are hard-capped at 500.
- Cancellation uses an `AbortController` and a durable cancelled state.
- Gemini cannot fabricate a selected asset; Node must resolve it from current scene candidates and verify the stored Gemini pixel verdict.
- Gemini cannot commit, save, render, fetch arbitrary URLs, invoke a shell, or write the database directly.

## HTTP API

- `POST /api/director/jobs` — start a persistent director job.
- `GET /api/director/jobs` — list recent jobs.
- `GET /api/director/jobs/:id` — read status, proposal, usage, and tool trace.
- `POST /api/director/jobs/:id/approve` — integrity-check and approve a staged transaction.
- `POST /api/director/jobs/:id/reject` — reject without changing the project.
- `POST /api/director/jobs/:id/cancel` — cancel an active job.
- `POST /api/director/jobs/:id/rebase` — rerun the command against the latest manifest.

## Verification

Run:

```powershell
npm run check
```

This validates JavaScript syntax, deterministic transaction behavior, the mocked six-tool director loop, approval/stale/rebase behavior, and the video-use bridge/runtime.
