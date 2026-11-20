"""Generate the six dated clock cues for the downloadable full-HD film."""

import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
STYLE = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Clock,Hind,60,&H00F9FBFF,&H00FFFFFF,&H77372718,&H88342517,-1,0,0,0,100,100,0,0,1,1.3,1.8,5,0,0,0,1
Style: Unit,Hind,27,&H00F9FBFF,&H00FFFFFF,&H77372718,&H88342517,0,0,0,0,100,100,1,0,1,0.7,1.4,5,0,0,0,1
Style: Source,Hind,22,&H10F9FBFF,&H00FFFFFF,&H77372718,&H88342517,0,0,0,0,100,100,0,0,1,0.7,1,5,0,0,0,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def write_clock(path, reference, end_seconds):
    result = subprocess.check_output(
        ["node", "--import", "tsx", str(HERE / "contagem.ts"), reference],
        cwd=HERE.parents[1],
        text=True,
    )
    clock = json.loads(result)
    start = end_seconds - len(clock["ticks"])
    lines = [STYLE]

    def cue(text, style, x, y, begin, end):
        def timestamp(t):
            cs = round(t * 100)
            return f"{cs // 360000:01}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}"

        lines.append(
            f"Dialogue: 0,{timestamp(begin)},{timestamp(end)},{style},,0,0,0,,"
            + r"{\an5\pos("
            + f"{x},{y}"
            + ")}"
            + text
            + "\n"
        )

    xs = [713, 878, 1042, 1207]
    for i, tick in enumerate(clock["ticks"]):
        if isinstance(tick, list):
            for x, value, unit in zip(
                xs, tick, ["DIAS", "HORAS", "MINUTOS", "SEGUNDOS"]
            ):
                cue(str(value).zfill(2), "Clock", x, 746, start + i, start + i + 1)
                cue(unit, "Unit", x, 797, start + i, start + i + 1)
        else:
            cue(tick, "Unit", 960, 760, start + i, start + i + 1)
    cue(
        f"Contagem em {clock['stamp']} (Brasília)",
        "Source",
        960,
        857,
        start,
        end_seconds,
    )
    path.write_text("".join(lines))
    print(
        json.dumps({"countdownReference": reference, "firstTick": clock["ticks"][0]}),
        flush=True,
    )
