# ScriptFlow video-use bridge

The official MIT-licensed `browser-use/video-use` source is vendored at `vendor/video-use`.

ScriptFlow is script-first, so its sources can be still images or silent stock video while narration is generated separately. The bridge materializes each scene as a normalized audio/video source, writes a video-use EDL, and invokes the official `helpers/render.py` pipeline for per-segment extraction, 30 ms audio fades, lossless concat, subtitle-last compositing, and loudness normalization.

ElevenLabs remains the narration and timing provider. ScriptFlow uses ElevenLabs speech-with-timestamps, caches the returned alignment in the render directory, and maps those timings into the EDL before video-use renders the final MP4.

Run `npm run video-use:check` to verify the vendored source, Python runtime, bridge, and FFmpeg binary.
