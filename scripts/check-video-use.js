const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ffmpegPath = require('ffmpeg-static');

const root = path.resolve(__dirname, '..');
const bridge = path.join(root, 'integrations', 'video-use', 'render_bridge.py');
const upstreamRenderer = path.join(root, 'vendor', 'video-use', 'helpers', 'render.py');
const upstreamLicense = path.join(root, 'vendor', 'video-use', 'LICENSE');

for (const requiredPath of [bridge, upstreamRenderer, upstreamLicense, ffmpegPath]) {
  if (!fs.existsSync(requiredPath)) throw new Error(`Missing video-use dependency: ${requiredPath}`);
}

const candidates = [
  process.env.VIDEO_USE_PYTHON,
  process.env.PYTHON,
  process.env.USERPROFILE && path.join(
    process.env.USERPROFILE,
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'python',
    'python.exe'
  ),
  process.platform === 'win32' ? 'python.exe' : 'python3'
].filter(Boolean);

const python = candidates.find((candidate) => !path.isAbsolute(candidate) || fs.existsSync(candidate));
if (!python) throw new Error('Python 3.10+ was not found. Set VIDEO_USE_PYTHON to its executable.');

const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
const env = {
  ...process.env,
  [pathKey]: `${path.dirname(ffmpegPath)}${path.delimiter}${process.env[pathKey] || ''}`
};
const result = spawnSync(python, [bridge, '--help'], { cwd: root, env, encoding: 'utf8' });
if (result.status !== 0) {
  throw new Error(`video-use bridge failed: ${(result.stderr || result.stdout || '').trim()}`);
}

console.log(`video-use ready: ${upstreamRenderer}`);
console.log(`python: ${python}`);
console.log(`ffmpeg: ${ffmpegPath}`);
