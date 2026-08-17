#!/usr/bin/env python3
"""
CineAssemble manifest-driven final renderer.

Usage:
  python3 assemble.py <manifest.json> [output.mp4]

The manifest is produced by the trusted worker from MySQL scene records. This
script never reads a public job directory and never trusts client-supplied paths.
"""

import json
import os
import shutil
import subprocess
import sys
import textwrap

FFMPEG = os.environ.get("FFMPEG_BIN", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE_BIN", "ffprobe")
FORMATS = {
    "16:9": (1280, 720),
    "9:16": (720, 1280),
    "1:1": (1080, 1080),
}
PAD = 0.25
MAX_STRETCH = 2.5
TITLE_SECONDS = 3.0


def sh(command, **kwargs):
    result = subprocess.run(command, capture_output=True, text=True, check=False, **kwargs)
    if result.returncode != 0:
        raise RuntimeError(
            f"command failed ({result.returncode}): {' '.join(command)}\n{result.stderr[-1600:]}"
        )
    return result


def duration(file_path, default=5.0):
    try:
        result = sh(
            [
                FFPROBE,
                "-v",
                "quiet",
                "-show_entries",
                "format=duration",
                "-of",
                "csv=p=0",
                file_path,
            ]
        )
        return float(result.stdout.strip())
    except Exception:
        return default


def validate_file(file_path, label):
    if not file_path or not os.path.isabs(file_path):
        raise RuntimeError(f"{label} must be an absolute private path")
    real = os.path.realpath(file_path)
    if not os.path.isfile(real):
        raise RuntimeError(f"{label} does not exist")
    return real


def esc_drawtext(text):
    text = str(text).replace("'", "’").replace('"', "“")
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("%", "\\%")
        .replace(",", "\\,")
        .replace("[", "\\[")
        .replace("]", "\\]")
    )


def find_font():
    configured = os.environ.get("FONT_FILE")
    candidates = [
        configured,
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]
    return next((item for item in candidates if item and os.path.exists(item)), "")


def timestamp_srt(value):
    milliseconds = int(round(value * 1000))
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"


def timestamp_ass(value):
    centiseconds = int(round(value * 100))
    hours, centiseconds = divmod(centiseconds, 360_000)
    minutes, centiseconds = divmod(centiseconds, 6_000)
    seconds, centiseconds = divmod(centiseconds, 100)
    return f"{hours}:{minutes:02d}:{seconds:02d}.{centiseconds:02d}"


def wrap_caption(text, width):
    lines = textwrap.wrap(str(text).strip(), width=width, break_long_words=False)
    while len(lines) > 2:
        lines = [lines[0] + " " + lines[1]] + lines[2:]
    return "\\N".join(lines)


def ass_escape(text):
    return str(text).replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}")


def write_captions(work_dir, cues, width, height, karaoke):
    font_size = min(42, max(28, round(height * 0.044)))
    margin_v = max(34, round(height * 0.065))
    if karaoke:
        file_path = os.path.join(work_dir, "captions.ass")
        header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,{font_size},&H00FFFFFF,&H0000B8FF,&H90000000,&H60000000,-1,0,0,0,100,100,0,0,1,2,1,2,45,45,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        with open(file_path, "w", encoding="utf-8") as handle:
            handle.write(header)
            for start, end, text in cues:
                words = [word for word in str(text).split() if word]
                if not words:
                    continue
                total = max(1, int(round((end - start) * 100)))
                each, remainder = divmod(total, len(words))
                rendered = []
                for index, word in enumerate(words):
                    amount = max(1, each + (1 if index < remainder else 0))
                    rendered.append(f"{{\\k{amount}}}{ass_escape(word)}")
                handle.write(
                    f"Dialogue: 0,{timestamp_ass(start)},{timestamp_ass(end)},Default,,0,0,0,,{' '.join(rendered)}\n"
                )
        return "captions.ass"

    file_path = os.path.join(work_dir, "captions.srt")
    wrap_width = 32 if height > width else 48
    with open(file_path, "w", encoding="utf-8") as handle:
        for index, (start, end, text) in enumerate(cues, 1):
            caption = wrap_caption(text, wrap_width).replace("\n", " ")
            handle.write(
                f"{index}\n{timestamp_srt(start)} --> {timestamp_srt(end)}\n{caption}\n\n"
            )
    style = (
        f"FontName=DejaVu Sans,FontSize={font_size},PrimaryColour=&H00FFFFFF,"
        "OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=1,"
        f"Alignment=2,MarginV={margin_v}"
    )
    return "captions.srt", style


def build_title_card(work_dir, manifest, first_image, width, height, fps):
    title = str(manifest.get("title") or "").strip()
    if not title:
        return None
    creator = str(manifest.get("creatorName") or "").strip()
    segment = os.path.join(work_dir, "segment-title.mp4")
    font = find_font()
    font_reference = ""
    if font:
        font_dir = os.path.join(work_dir, "fonts")
        os.makedirs(font_dir, exist_ok=True)
        staged = os.path.join(font_dir, "title.ttf")
        shutil.copyfile(font, staged)
        font_reference = "fonts/title.ttf"

    title_size = min(62, max(42, round(height * 0.065)))
    creator_size = min(30, max(22, round(height * 0.03)))
    line_width = 18 if height > width else 28
    lines = textwrap.wrap(title, width=line_width)[:3] or [title]
    line_gap = round(title_size * 1.22)
    y_start = height // 2 - (line_gap * len(lines)) // 2

    def draw_filters(prefix):
        filters = ""
        for index, line in enumerate(lines):
            filters += (
                f",drawtext={prefix}text='{esc_drawtext(line)}':fontcolor=white:"
                f"fontsize={title_size}:borderw=3:bordercolor=black@0.7:"
                f"x=(w-text_w)/2:y={y_start + index * line_gap}"
            )
        if creator:
            filters += (
                f",drawtext={prefix}text='{esc_drawtext('Created by ' + creator)}':"
                f"fontcolor=white@0.9:fontsize={creator_size}:borderw=2:"
                "bordercolor=black@0.6:x=(w-text_w)/2:y=h-0.12*h"
            )
        return filters

    command = [FFMPEG, "-y"]
    if first_image:
        command += ["-loop", "1", "-t", str(TITLE_SECONDS), "-i", first_image]
        base = (
            f"[0:v]fps={fps},scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},setsar=1,eq=brightness=-0.42:saturation=0.82"
        )
    else:
        command += [
            "-f",
            "lavfi",
            "-t",
            str(TITLE_SECONDS),
            "-i",
            f"color=c=0x111827:s={width}x{height}:r={fps}",
        ]
        base = "[0:v]setsar=1"
    command += [
        "-f",
        "lavfi",
        "-t",
        str(TITLE_SECONDS),
        "-i",
        "anullsrc=r=48000:cl=stereo",
    ]

    variants = []
    if font_reference:
        variants.append(draw_filters(f"fontfile={font_reference}:"))
    variants.append(draw_filters("font='DejaVu Sans':"))
    variants.append("")
    for draws in variants:
        try:
            sh(
                command
                + [
                    "-filter_complex",
                    f"{base}{draws}[v]",
                    "-map",
                    "[v]",
                    "-map",
                    "1:a",
                    "-t",
                    str(TITLE_SECONDS),
                    "-r",
                    str(fps),
                    "-c:v",
                    "libx264",
                    "-preset",
                    "fast",
                    "-crf",
                    "20",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "160k",
                    segment,
                ],
                cwd=work_dir,
            )
            return segment
        except RuntimeError:
            continue
    return None


def main(manifest_path, output_path=None):
    manifest_path = validate_file(os.path.abspath(manifest_path), "manifest")
    with open(manifest_path, encoding="utf-8") as handle:
        manifest = json.load(handle)

    aspect_ratio = manifest.get("aspectRatio")
    if aspect_ratio not in FORMATS:
        raise RuntimeError("unsupported aspect ratio")
    width, height = FORMATS[aspect_ratio]
    fps = int(manifest.get("fps") or 25)
    if fps not in (24, 25, 30):
        raise RuntimeError("unsupported frame rate")

    work_dir = os.path.realpath(manifest.get("workDir") or os.path.dirname(manifest_path))
    os.makedirs(work_dir, mode=0o700, exist_ok=True)
    output_path = os.path.abspath(output_path or manifest.get("outputPath") or os.path.join(work_dir, "final.mp4"))
    scenes = manifest.get("scenes") or []
    if not scenes:
        raise RuntimeError("no scenes to assemble")

    normalized = []
    cues = []
    timeline = 0.0
    first_image = None
    for scene in scenes:
        if not first_image and scene.get("imagePath"):
            first_image = validate_file(scene["imagePath"], "first scene image")
            break

    title_segment = build_title_card(work_dir, manifest, first_image, width, height, fps)
    if title_segment:
        normalized.append(title_segment)
        timeline = TITLE_SECONDS

    for ordinal, scene in enumerate(scenes):
        clip_value = scene.get("lipClipPath") or scene.get("clipPath")
        clip = validate_file(clip_value, f"scene {ordinal + 1} clip")
        audio = validate_file(scene.get("audioPath"), f"scene {ordinal + 1} audio")
        segment = os.path.join(work_dir, f"segment-{ordinal:03d}.mp4")
        target = duration(audio) + PAD
        clip_duration = duration(clip)
        stretch = min(MAX_STRETCH, max(1.0, target / max(clip_duration, 0.1)))
        video_filter = (
            f"fps={fps},scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,"
            f"setpts={stretch:.5f}*PTS,tpad=stop_mode=clone:stop=-1"
        )
        sh(
            [
                FFMPEG,
                "-y",
                "-i",
                clip,
                "-i",
                audio,
                "-filter_complex",
                f"[0:v]{video_filter}[v];[1:a]aresample=48000,apad[a]",
                "-map",
                "[v]",
                "-map",
                "[a]",
                "-t",
                f"{target:.3f}",
                "-r",
                str(fps),
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "160k",
                segment,
            ]
        )
        normalized.append(segment)
        cues.append((timeline, timeline + duration(audio) + 0.05, scene.get("narration") or ""))
        timeline += target

    use_captions = bool(manifest.get("subtitles", True))
    karaoke = bool(manifest.get("karaokeCaptions", False))
    caption_file = None
    caption_style = None
    if use_captions:
        caption_result = write_captions(work_dir, cues, width, height, karaoke)
        if karaoke:
            caption_file = caption_result
        else:
            caption_file, caption_style = caption_result

    inputs = []
    for segment in normalized:
        inputs += ["-i", segment]
    stream_labels = "".join(f"[{index}:0][{index}:1]" for index in range(len(normalized)))
    count = len(normalized)

    bgm = manifest.get("bgmPath") or os.environ.get("BGM_PATH") or ""
    use_bgm = bool(bgm and os.path.exists(bgm))
    if use_bgm:
        bgm = validate_file(os.path.abspath(bgm), "background music")
        inputs += ["-stream_loop", "-1", "-i", bgm]

    watermark = str(manifest.get("watermarkText") or "Made with CineAssemble").strip()
    watermark_required = bool(manifest.get("watermarkRequired", False) and watermark)
    watermark_size = min(28, max(18, round(height * 0.025)))

    def graph(with_captions):
        value = f"{stream_labels}concat=n={count}:v=1:a=1[vc][ac]"
        current_video = "vc"
        if with_captions and caption_file:
            if karaoke:
                value += f";[{current_video}]subtitles='{caption_file}'[vsub]"
            else:
                value += (
                    f";[{current_video}]subtitles='{caption_file}':"
                    f"force_style='{caption_style}'[vsub]"
                )
            current_video = "vsub"
        if watermark_required:
            value += (
                f";[{current_video}]drawtext=text='{esc_drawtext(watermark)}':"
                f"fontcolor=white@0.72:fontsize={watermark_size}:borderw=2:"
                "bordercolor=black@0.45:x=w-text_w-0.035*w:y=0.035*h[vwm]"
            )
            current_video = "vwm"
        if use_bgm:
            value += (
                f";[{count}:a]volume=0.12,aresample=48000[bgm];"
                "[ac][bgm]amix=inputs=2:duration=first[am];"
                "[am]loudnorm=I=-16:TP=-1.5:LRA=11[ao]"
            )
        else:
            value += ";[ac]loudnorm=I=-16:TP=-1.5:LRA=11[ao]"
        return value, current_video

    def render(with_captions):
        filter_graph, video_label = graph(with_captions)
        sh(
            [
                FFMPEG,
                "-y",
                *inputs,
                "-filter_complex",
                filter_graph,
                "-map",
                f"[{video_label}]",
                "-map",
                "[ao]",
                "-r",
                str(fps),
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                output_path,
            ],
            cwd=work_dir,
        )

    try:
        render(use_captions)
    except RuntimeError:
        if not use_captions:
            raise
        render(False)

    for segment in normalized:
        try:
            os.remove(segment)
        except OSError:
            pass

    if not os.path.exists(output_path):
        raise RuntimeError("final output was not created")
    print(
        json.dumps(
            {
                "output": output_path,
                "aspectRatio": aspect_ratio,
                "width": width,
                "height": height,
                "durationSeconds": round(duration(output_path), 3),
                "byteSize": os.path.getsize(output_path),
                "captions": use_captions,
                "karaoke": karaoke,
                "watermark": watermark_required,
            }
        )
    )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: assemble.py <manifest.json> [output.mp4]")
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
