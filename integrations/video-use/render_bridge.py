from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


def load_renderer():
    project_root = Path(__file__).resolve().parents[2]
    helpers_dir = project_root / "vendor" / "video-use" / "helpers"
    renderer_path = helpers_dir / "render.py"
    if not renderer_path.exists():
        raise SystemExit(f"video-use renderer not found: {renderer_path}")
    sys.path.insert(0, str(helpers_dir))
    spec = importlib.util.spec_from_file_location("scriptflow_video_use_renderer", renderer_path)
    if spec is None or spec.loader is None:
        raise SystemExit("Unable to load the video-use renderer.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def subtitle_style(style):
    style = style if isinstance(style, dict) else {}
    preset = str(style.get("preset") or "hormozi").lower()
    position = str(style.get("position") or "bottom").lower()
    try:
        size = max(16, min(96, int(float(style.get("size") or 44))))
    except (TypeError, ValueError):
        size = 44

    presets = {
        "hormozi": ("Montserrat", "&H0000FFFF", "&H00000000", 4, 2, 1),
        "beast": ("Anton", "&H0000EAFF", "&H00000000", 5, 3, 1),
        "neon": ("JetBrains Mono", "&H00FFFF00", "&H00331100", 3, 2, 1),
        "minimal": ("Arial", "&H00FFFFFF", "&H00151515", 2, 0, 0),
    }
    font, primary, outline_color, outline, shadow, bold = presets.get(preset, presets["hormozi"])
    alignment = {"top": 8, "center": 5, "bottom": 2}.get(position, 2)
    margin = 52 if position == "bottom" else 28
    return (
        f"FontName={font},FontSize={size},Bold={bold},"
        f"PrimaryColour={primary},OutlineColour={outline_color},BackColour=&H00000000,"
        f"BorderStyle=1,Outline={outline},Shadow={shadow},"
        f"Alignment={alignment},MarginV={margin}"
    )


def main():
    renderer = load_renderer()
    renderer.is_hdr_source = lambda _path: False

    if "--help" in sys.argv or "-h" in sys.argv:
        renderer.is_portrait_source = lambda _path: False
        renderer.main()
        return

    if len(sys.argv) < 2:
        raise SystemExit("An EDL path is required.")
    edl_path = Path(sys.argv[1]).resolve()
    edl = json.loads(edl_path.read_text(encoding="utf-8"))
    canvas = edl.get("canvas") if isinstance(edl.get("canvas"), dict) else {}
    portrait = int(canvas.get("height") or 1080) > int(canvas.get("width") or 1920)
    renderer.is_portrait_source = lambda _path: portrait
    renderer.SUB_FORCE_STYLE = subtitle_style(edl.get("subtitle_style"))
    renderer.main()


if __name__ == "__main__":
    main()
