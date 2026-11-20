"""Build the uncaptioned web film and its independently playable 4K download."""

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
UHD = "FENASOJA-2028-4K.mp4"


def ff(ffmpeg, args, **kwargs):
    subprocess.run(
        [ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-y", *args],
        check=True,
        **kwargs,
    )


def encode_cut(ffmpeg, path, cut, output, clock_folder=None):
    # Cuts stay independent so decoding never holds every 4K input in memory.
    crop = cut.get("crop")
    filters = [f"crop={':'.join(map(str, crop))}"] if crop else []
    filters += [
        "scale=3840:2160:flags=lanczos:out_color_matrix=bt709",
        "setsar=1",
        "fps=24",
        "format=yuv420p",
    ]
    inputs = ["-ss", str(cut.get("in", 0)), "-i", str(path)]
    if clock_folder is None:
        picture = ["-map", "0:v:0", "-vf", ",".join(filters)]
    else:
        inputs += ["-framerate", "1", "-i", str(clock_folder / "tick-%d.png")]
        clock_start = cut["seconds"] - 6
        # Overlay generated RGBA artwork only on the standalone closing shot.
        graph = (
            "[0:v]" + ",".join(filters) + "[sky];"
            "[1:v]fps=24,format=rgba,fade=t=in:st=0:d=0.35:alpha=1,"
            f"setpts=PTS+{clock_start}/TB[clock];"
            "[sky][clock]overlay=x=(W-w)/2:y=H*0.68:eof_action=repeat[movie]"
        )
        picture = ["-filter_complex", graph, "-map", "[movie]"]
    ff(
        ffmpeg,
        [
            *inputs,
            *picture,
            "-frames:v",
            str(round(cut["seconds"] * 24)),
            "-an",
            "-sn",
            "-dn",
            "-c:v",
            "libx265",
            "-preset",
            "fast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-tag:v",
            "hvc1",
            "-maxrate",
            "15800k",
            "-bufsize",
            "23000k",
            "-x265-params",
            "log-level=error:pools=4:frame-threads=2:keyint=48:colorprim=bt709:transfer=bt709:colormatrix=bt709",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-colorspace",
            "bt709",
            "-video_track_timescale",
            "24000",
            str(output),
        ],
    )


def join(ffmpeg, pieces, audio, work, output, duration, reference=None):
    # Internal file names are generated locally, so no source path needs concat escaping.
    index = work / "concat.txt"
    index.write_text("".join(f"file '{part.name}'\n" for part in pieces))
    args = [
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        str(index),
        "-i",
        str(audio),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
    ]
    if reference:
        args += [
            "-c:v",
            "copy",
            "-tag:v",
            "hvc1",
            "-bsf:v",
            "hevc_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0",
            "-metadata",
            f"comment=Contagem oficial calculada em {reference}",
        ]
    else:
        args += [
            "-vf",
            "scale=1280:720:flags=lanczos",
            "-c:v",
            "libx264",
            "-threads",
            "4",
            "-preset",
            "fast",
            "-crf",
            "17",
            "-profile:v",
            "high",
            "-pix_fmt",
            "yuv420p",
        ]
    progress = subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            *args,
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-colorspace",
            "bt709",
            "-color_range",
            "tv",
            "-sn",
            "-dn",
            "-c:a",
            "aac",
            "-b:a",
            "256k" if reference else "160k",
            "-ar",
            "48000",
            "-t",
            str(duration),
            "-movflags",
            "+faststart",
            "-metadata",
            "title=FENASOJA 2028",
            "-progress",
            "pipe:1",
            "-nostats",
            str(output),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if progress.returncode:
        raise RuntimeError(progress.stderr)
    frames = [
        int(row[6:]) for row in progress.stdout.splitlines() if row.startswith("frame=")
    ]
    if not frames or frames[-1] != round(duration * 24):
        raise RuntimeError(f"Unexpected length for {output.name}: {frames[-1:]!r}")


def render(shots, output, ffmpeg, reference):
    edition = json.loads((HERE / "montagem.json").read_text())
    cuts = edition["shots"]
    duration = sum(cut["seconds"] for cut in cuts)
    sound_duration = (
        sum(edition["soundShotSeconds"])
        + edition["soundIntroSeconds"]
        + edition["soundOutroSeconds"]
    )
    if duration != sound_duration or not cuts[-1].get("skyTitle"):
        raise ValueError("The sound and closing shot must match the picture timeline")
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output) as scratch:
        work = Path(scratch)
        title = work / "letreiro.mp4"
        render_title(shots / cuts[-1]["file"], title, ffmpeg)
        pieces = []
        for i, cut in enumerate(cuts):
            path = title if cut.get("skyTitle") else shots / cut["file"]
            segment = work / f"cut-{i:02}.mp4"
            encode_cut(ffmpeg, path, cut, segment)
            pieces.append(segment)
        export(ffmpeg, edition, pieces, title, work, output, duration, reference)


def export(ffmpeg, edition, pieces, title, work, output, duration, reference):
    closing = edition["shots"][-1]
    clock_folder = work / "clock"
    clock = write_clock(clock_folder, reference)
    dated = work / "dated.mp4"
    encode_cut(ffmpeg, title, closing, dated, clock_folder)
    audio = work / "ambiente.wav"
    subprocess.run(
        [
            sys.executable,
            str(HERE / "gerar_ambiente.py"),
            "--shots",
            *map(str, edition["soundShotSeconds"]),
            "--intro",
            str(edition["soundIntroSeconds"]),
            "--outro",
            str(edition["soundOutroSeconds"]),
            "--ffmpeg",
            ffmpeg,
            "--output",
            str(audio),
        ],
        check=True,
    )
    join(ffmpeg, pieces, audio, work, work / "amanhecer.mp4", duration)
    join(ffmpeg, [*pieces[:-1], dated], audio, work, work / UHD, duration, reference)
    output.mkdir(parents=True, exist_ok=True)
    for name in ["amanhecer.mp4", UHD]:
        shutil.move(work / name, output / name)
    print(
        json.dumps(
            {"referencia": reference, "primeiroSegundo": clock["ticks"][0]},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "shots",
        type=Path,
        help="Folder with the revised sources, including native UHD park shots.",
    )
    parser.add_argument("--output", type=Path, default=MEDIA)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument(
        "--clock-reference",
        help="ISO 8601 instant with UTC offset for the first recorded closing tick.",
    )
    args = parser.parse_args()
    render(
        args.shots.resolve(),
        args.output.resolve(),
        args.ffmpeg,
        args.clock_reference or datetime.now(UTC).replace(microsecond=0).isoformat(),
    )
