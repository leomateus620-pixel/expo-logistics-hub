"""Finish the project from the Higgsfield shots listed in the edit decision list."""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from contagem import write_clock
from titular import render_title

HERE = Path(__file__).resolve().parent
MEDIA = HERE.parents[1] / "public/media/fenasoja-2028"


def caption_time(seconds):
    millis = round(seconds * 1000)
    return f"{millis // 3600000:02}:{millis // 60000 % 60:02}:{millis // 1000 % 60:02}.{millis % 1000:03}"


def render(shots, output, ffmpeg, hd_shots=None, clock_reference=None):
    hd = hd_shots is not None
    dimensions = "1920:1080" if hd else "1280:720"
    filename = "FENASOJA-2028-Full-HD.mp4" if hd else "amanhecer.mp4"
    edition = json.loads((HERE / "montagem.json").read_text())
    cuts = edition["shots"]
    source = [shots / cut["file"] for cut in cuts]
    if hd:
        for i, cut in enumerate(cuts):
            if cut.get("hdSource"):
                source[i] = hd_shots / cut["file"]
    for path in source:
        if not path.is_file():
            raise FileNotFoundError(path)
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        for i, cut in enumerate(cuts):
            if cut.get("skyTitle"):
                title = temp / "letreiro.mp4"
                render_title(source[i], title, ffmpeg, hd)
                source[i] = title
        sound = temp / "ambiente.wav"
        subprocess.run(
            [
                sys.executable,
                str(HERE / "gerar_ambiente.py"),
                "--shots",
                *map(str, edition["soundShotSeconds"]),
                "--intro",
                str(edition.get("soundIntroSeconds", 0)),
                "--outro",
                str(edition.get("soundOutroSeconds", 0)),
                "--ffmpeg",
                ffmpeg,
                "--output",
                str(sound),
            ],
            check=True,
        )
        args = [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y"]
        filters, labels, cues = [], [], ["WEBVTT", ""]
        total = 0
        for i, (cut, path) in enumerate(zip(cuts, source)):
            args.extend(["-threads", "2", "-i", str(path)])
            crop = cut.get("crop")
            framing = f"crop={':'.join(map(str, crop))}," if crop else ""
            filters.append(
                f"[{i}:v]trim=start={cut.get('in', 0)}:duration={cut['seconds']},"
                f"setpts=PTS-STARTPTS,fps=24,{framing}scale={dimensions}:flags=lanczos:out_color_matrix=bt709,setsar=1,format=yuv420p[v{i}]"
            )
            labels.append(f"[v{i}]")
            end = total + cut["seconds"]
            if desc := cut.get("caption"):
                cues.extend(
                    [
                        f"{caption_time(total + 0.15)} --> {caption_time(end - 0.2)}"
                        + (" line:10%" if cut.get("skyTitle") else ""),
                        desc,
                        "",
                    ]
                )
            total = end
        sound_total = (
            edition.get("soundIntroSeconds", 0)
            + sum(edition["soundShotSeconds"])
            + edition.get("soundOutroSeconds", 0)
        )
        if abs(total - sound_total) > 1 / 24:
            raise ValueError(
                "The picture and sound timelines must have the same duration"
            )
        filters.append("".join(labels) + f"concat=n={len(cuts)}:v=1:a=0[picture]")
        captions = temp / "captions.vtt"
        captions.write_text("\n".join(cues).rstrip() + "\n")
        streams = ["-i", str(sound)]
        maps = ["-map", "[picture]", "-map", f"{len(cuts)}:a"]
        if hd:
            # Relative asset names keep the filtergraph portable, including paths with spaces.
            shutil.copytree(HERE.parents[1] / "src/assets/fonts", temp / "fonts")
            reference = (
                clock_reference
                or datetime.now(UTC).replace(microsecond=0).isoformat()
            )
            write_clock(temp / "clock.ass", reference, total)
            filters.append("[picture]ass=clock.ass:fontsdir=fonts[dated]")
            streams += ["-i", str(captions)]
            maps = [
                "-map",
                "[dated]",
                "-map",
                f"{len(cuts)}:a",
                "-map",
                f"{len(cuts) + 1}:s:0",
                "-c:s",
                "mov_text",
                "-metadata:s:s:0",
                "language=por",
                "-disposition:s:0",
                "0",
            ]
        # Verify the complete encoded picture before publishing either deliverable.
        master = temp / "amanhecer.mp4"
        args.extend(
            [
                *streams,
                "-filter_complex_threads",
                "3",
                "-filter_complex",
                ";".join(filters),
                *maps,
                "-t",
                str(total),
                "-c:v",
                "libx264",
                "-threads",
                "5",
                "-preset",
                "slow",
                "-crf",
                "16" if hd else "18",
                "-profile:v",
                "high",
                "-pix_fmt",
                "yuv420p",
                "-color_primaries",
                "bt709",
                "-color_trc",
                "bt709",
                "-colorspace",
                "bt709",
                "-c:a",
                "aac",
                "-b:a",
                "256k" if hd else "160k",
                "-ar",
                "48000",
                "-movflags",
                "+faststart",
                "-metadata",
                "title=FENASOJA 2028",
                "-progress",
                "pipe:1",
                "-nostats",
                str(master),
            ]
        )
        progress = subprocess.run(
            args, check=True, stdout=subprocess.PIPE, text=True, cwd=temp
        )
        frames = [
            int(line.split("=")[1])
            for line in progress.stdout.splitlines()
            if line.startswith("frame=")
        ]
        if not frames or frames[-1] != round(total * 24):
            raise RuntimeError(f"Picture length differs from the {total:g}-second edit")
        # temp and output may be on different file systems.
        with tempfile.NamedTemporaryFile(
            dir=output, suffix=".mp4", delete=False
        ) as staged:
            try:
                with master.open("rb") as src:
                    shutil.copyfileobj(src, staged)
            except BaseException:
                Path(staged.name).unlink(missing_ok=True)
                raise
        Path(staged.name).chmod(0o644)
        Path(staged.name).replace(output / filename)
        if not hd:
            shutil.copyfile(captions, output / "amanhecer.vtt")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("shots", type=Path)
    parser.add_argument("--output", type=Path, default=MEDIA)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument(
        "--full-hd-shots",
        type=Path,
        help="Export the full-HD download with native map shots from this folder.",
    )
    parser.add_argument(
        "--clock-reference",
        help="ISO 8601 instant with UTC offset for the first dated closing cue; defaults to export time.",
    )
    args = parser.parse_args()
    render(
        args.shots.resolve(),
        args.output.resolve(),
        args.ffmpeg,
        args.full_hd_shots.resolve() if args.full_hd_shots else None,
        args.clock_reference,
    )
