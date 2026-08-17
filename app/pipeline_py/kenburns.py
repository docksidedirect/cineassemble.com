#!/usr/bin/env python3
"""
Aspect-aware local animation for a still production frame.

Usage:
  python3 kenburns.py <image> <out.mp4> <effect_index> [seconds] [width] [height] [mode]

Mode ``product`` uses restrained, centered camera motion so a deterministically
composited real product is never redrawn or deformed by a generative model.
"""

import os
import subprocess
import sys

FFMPEG = os.environ.get("FFMPEG_BIN", "ffmpeg")
FPS = int(os.environ.get("VIDEO_FPS", "25"))


def dimensions(width=None, height=None):
    w = int(width or os.environ.get("VIDEO_WIDTH", "1280"))
    h = int(height or os.environ.get("VIDEO_HEIGHT", "720"))
    if w < 240 or h < 240 or w > 4096 or h > 4096:
        raise SystemExit("invalid output dimensions")
    # H.264 yuv420p requires even dimensions.
    return w - (w % 2), h - (h % 2)


def main(img, out, idx, seconds=5.0, width=None, height=None, mode="standard"):
    width, height = dimensions(width, height)
    seconds = max(1.0, min(float(seconds), 30.0))
    frames = max(1, int(seconds * FPS))
    pre = (
        f"scale={width * 2}:{height * 2}:force_original_aspect_ratio=increase,"
        f"crop={width * 2}:{height * 2}"
    )

    if mode == "product":
        step = 0.04 / frames
        zp = (
            f"zoompan=z='min(zoom+{step:.8f},1.04)':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d={frames}:s={width}x{height}:fps={FPS}"
        )
    else:
        effect = idx % 4
        step = 0.12 / frames
        if effect == 0:
            zp = (
                f"zoompan=z='min(zoom+{step:.8f},1.12)':"
                f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
                f"d={frames}:s={width}x{height}:fps={FPS}"
            )
        elif effect == 1:
            zp = (
                f"zoompan=z='if(eq(on,0),1.12,max(zoom-{step:.8f},1.0))':"
                f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
                f"d={frames}:s={width}x{height}:fps={FPS}"
            )
        elif effect == 2:
            zp = (
                f"zoompan=z='1.12':x='(iw-iw/zoom)*on/{frames}':"
                f"y='ih/2-(ih/zoom/2)':d={frames}:s={width}x{height}:fps={FPS}"
            )
        else:
            zp = (
                f"zoompan=z='1.12':x='(iw-iw/zoom)*(1-on/{frames})':"
                f"y='ih/2-(ih/zoom/2)':d={frames}:s={width}x{height}:fps={FPS}"
            )

    command = [
        FFMPEG,
        "-y",
        "-i",
        img,
        "-vf",
        f"{pre},{zp}",
        "-frames:v",
        str(frames),
        "-r",
        str(FPS),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        out,
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0 or not os.path.exists(out):
        raise SystemExit(f"kenburns failed: {result.stderr[-800:]}")


if __name__ == "__main__":
    main(
        sys.argv[1],
        sys.argv[2],
        int(sys.argv[3]),
        float(sys.argv[4]) if len(sys.argv) > 4 else 5.0,
        int(sys.argv[5]) if len(sys.argv) > 5 else None,
        int(sys.argv[6]) if len(sys.argv) > 6 else None,
        sys.argv[7] if len(sys.argv) > 7 else "standard",
    )
