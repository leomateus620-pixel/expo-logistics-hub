"""Synthesize and mix a continuous, editable morning-park soundtrack at 48 kHz.

Python 3, NumPy and SciPy. The default uses two documented CC0 helicopter
recordings over a synthesized park bed. See CREDITOS-AUDIO.txt for sources.
"""

import argparse
import json
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.interpolate import PchipInterpolator

RATE = 48000
TAU = 2 * np.pi
DEFAULT_SHOTS = (7, 6, 6, 6, 7)


def band(samples, low, high):
    sos = signal.butter(2, [low, high], btype="bandpass", fs=RATE, output="sos")
    return signal.sosfilt(sos, samples)


def texture(rng, n, low, high):
    filtered = band(rng.standard_normal(n), low, high)
    return filtered / max(1e-8, np.sqrt(np.mean(filtered**2)))


def wind_gusts(rng, t, step):
    x = np.arange(-step, t[-1] + 2 * step, step)
    return PchipInterpolator(x, rng.uniform(-1, 1, len(x)))(t)


def pan(mono, location):
    # Equal-power coefficients plus an interaural delay below 0.5 ms.
    idx = np.arange(len(mono))
    delay = 0.00046 * RATE * location
    left = np.interp(idx - np.maximum(delay, 0), idx, mono, left=0)
    right = np.interp(idx + np.minimum(delay, 0), idx, mono, left=0)
    angle = (location + 1) * np.pi / 4
    return np.column_stack((left * np.cos(angle), right * np.sin(angle)))


def delayed(mono, seconds):
    n = round(seconds * RATE)
    out = np.zeros_like(mono)
    if 0 < n < len(mono):
        out[n:] = mono[:-n]
    return out


def morning(rng, t):
    n = len(t)
    gust = 0.84 + 0.30 * wind_gusts(rng, t, 2.1)
    common = 0.017 * texture(rng, n, 100, 620)
    ambience = np.empty((n, 2))
    for ear in range(2):
        leaf = 0.004 * texture(rng, n, 750, 3200) + 0.007 * texture(rng, n, 250, 1480)
        leaf *= 1 + 0.38 * wind_gusts(rng, t, 0.35)
        ambience[:, ear] = (leaf + common * 0.8) * gust
    # A few distant vehicles form a slow, diffuse street bed beyond the grounds.
    for centre in np.arange(-3, t[-1] + 8, 7.8):
        centre += rng.uniform(-1.5, 1.5)
        envelope = np.exp(-0.5 * ((t - centre) / rng.uniform(1.4, 2.7)) ** 2)
        tyre = 0.010 * texture(rng, n, 112, 360) + 0.004 * texture(rng, n, 510, 1300)
        ambience += pan(tyre * envelope, 0.38 * np.tanh((t - centre) / 3) - 0.25)
    # Irregular two- and three-note contact calls. The timing, pitch, position
    # and breath noise belong to each individual bird rather than a repeated loop.
    moment = 0.58
    while moment < t[-1] - 0.35:
        origin = rng.uniform(-0.78, 0.78)
        f0 = rng.uniform(1720, 2930)
        level = rng.uniform(0.018, 0.043)
        lift = rng.uniform(390, 840) * rng.choice([-1, 1])
        for _ in range(int(rng.choice([1, 2, 2, 3]))):
            duration = rng.uniform(0.09, 0.22)
            length = min(round(duration * RATE), n - int(moment * RATE))
            if length < 2:
                break
            j = int(moment * RATE)
            w = np.arange(length) / RATE
            u = w / duration
            envelope = np.maximum(0, np.sin(np.pi * u)) ** 1.4
            frequency = (
                f0
                + lift * (u - 0.30)
                + 120 * np.sin(np.pi * u)
                + 28 * np.sin(TAU * rng.uniform(18, 33) * w)
            )
            phase = TAU * np.cumsum(frequency) / RATE
            syllable = np.sin(phase) + 0.13 * np.sin(2 * phase + 0.5)
            syllable += 0.04 * texture(rng, length, 2300, 5700)
            ambience[j : j + length] += pan(level * envelope * syllable, origin)
            moment += duration + rng.uniform(0.07, 0.18)
            f0 *= rng.uniform(0.91, 1.055)
        moment += rng.uniform(1.05, 2.85)
    return ambience


def flight(rng, t, shots):
    cuts = np.r_[0.0, np.cumsum(shots)]
    # 1 approach from the left; 2 close hover; 3/4 two boarding angles;
    # 5 recede to the right over the city. Perspective changes bridge the cuts.
    keys = np.array(
        [
            0.0,
            cuts[1] * 0.38,
            cuts[1] * 0.80,
            cuts[1],
            cuts[1] + shots[1] * 0.40,
            cuts[2],
            cuts[2] + shots[2] * 0.31,
            cuts[3],
            cuts[3] + shots[3] * 0.42,
            cuts[4],
            cuts[4] + shots[4] * 0.40,
            cuts[5],
        ]
    )
    distance = PchipInterpolator(
        keys, [270, 160, 62, 51, 42, 46, 62, 46, 59, 45, 104, 410]
    )(t)
    location = PchipInterpolator(
        keys,
        [
            -0.64,
            -0.54,
            -0.34,
            -0.28,
            -0.18,
            -0.14,
            -0.15,
            -0.11,
            -0.09,
            -0.04,
            0.23,
            0.68,
        ],
    )(t)
    elevation = (42 / distance) ** 0.92
    # The shared Doppler factor keeps main rotor, tail rotor and turbine coherent.
    # A modest airframe-speed limit avoids a pitch sweep on unusually short edits.
    radial_speed = np.clip(np.gradient(distance, 1 / RATE), -23, 23)
    doppler = 343 / (343 + radial_speed)
    engine_load = 0.25 + 0.75 * elevation
    speed = (
        6.38
        + 0.10 * engine_load
        + 0.014 * np.sin(TAU * 0.21 * t)
        + 0.012 * wind_gusts(rng, t, 0.8)
    ) * doppler
    rev = np.cumsum(speed) / RATE
    blade = 3 * rev
    # Main rotor strokes: broad pressure pulse, softer following rarefaction
    # and slight differences between the three individual blade paths.
    position = np.mod(blade + 0.5, 1.0) - 0.5
    thump = np.exp(-0.5 * (position / 0.071) ** 2) - 0.58 * np.exp(
        -0.5 * ((position - 0.118) / 0.081) ** 2
    )
    irregular = 1 + 0.15 * np.sin(TAU * rev + 0.7) + 0.045 * np.sin(TAU * rev * 2)
    thump = band(thump * irregular, 39, 230)
    body = (
        0.34 * thump
        + 0.021 * np.sin(TAU * blade * 3 + 0.4)
        + 0.013 * np.sin(TAU * blade * 5)
        + 0.009 * np.sin(TAU * blade * 7 + 1.2)
    )
    stroke = np.maximum(0, np.cos(TAU * (blade - 0.095))) ** 2
    rotor_air = (0.026 + 0.037 * stroke) * texture(rng, len(t), 76, 620) + (
        0.009 + 0.016 * stroke
    ) * texture(rng, len(t), 470, 1660)
    rpm_shaft = 1 + 0.0017 * np.sin(TAU * 0.49 * t)
    tail_phase = TAU * phase_cycles(92.5 * rpm_shaft * doppler)
    tail = 0.016 * np.sin(tail_phase + 0.18 * np.sin(TAU * rev)) + 0.010 * np.sin(
        2 * tail_phase
    )
    turbine_pitch = (406 + 11 * engine_load + 1.1 * np.sin(TAU * 0.31 * t)) * doppler
    turbine_phase = TAU * phase_cycles(turbine_pitch)
    turbine = (
        0.0085 * np.sin(turbine_phase)
        + 0.004 * np.sin(2 * turbine_phase + 0.8)
        + 0.0025 * np.sin(3 * turbine_phase)
    )
    turbine += 0.012 * texture(rng, len(t), 1700, 4300) * (0.85 + 0.15 * stroke)
    mechanical = (body + rotor_air + tail + turbine) * elevation
    # Distant high frequencies fall off while engine body remains audible.
    low = signal.sosfilt(signal.butter(2, 770, fs=RATE, output="sos"), mechanical)
    direct = low + (0.37 + 0.58 * elevation) * (mechanical - low)
    stereo = pan(direct, location)
    # Short, uneven reflections from the ground and pavilion walls, no cavern tail.
    reflection = band(direct, 145, 1850)
    stereo[:, 0] += 0.068 * delayed(reflection, 0.033) + 0.022 * delayed(
        reflection, 0.082
    )
    stereo[:, 1] += 0.058 * delayed(reflection, 0.043) + 0.026 * delayed(
        reflection, 0.068
    )
    return stereo


def phase_cycles(frequency):
    """Integrate Hertz to continuous phase in cycles."""
    return np.cumsum(frequency) / RATE


def transition(t, start, end):
    x = np.clip((t - start) / (end - start), 0.0, 1.0)
    return x * x * (3 - 2 * x)


def field_track(name, ffmpeg):
    path = Path(__file__).with_name("fontes") / (name + ".mp3")
    data = subprocess.check_output(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-i",
            str(path),
            "-ac",
            "2",
            "-ar",
            str(RATE),
            "-f",
            "s16le",
            "pipe:1",
        ]
    )
    pcm = np.frombuffer(data, dtype="<i2").reshape(-1, 2)
    # Remove subsonic pressure and rumble, preserving the recording's rotor slap.
    sos = signal.butter(2, 30, fs=RATE, btype="highpass", output="sos")
    return signal.sosfilt(sos, pcm.astype(float) / 32768.0, axis=0)


def recorded_flight(t, shots, ffmpeg):
    flyby = field_track("h135", ffmpeg)
    hover = field_track("hover", ffmpeg)
    cuts = np.r_[0.0, np.cumsum(shots)]
    incoming_blend = min(1.05, shots[0] * 0.25, shots[1] * 0.26)
    outgoing_blend = min(1.15, shots[3] * 0.27, shots[4] * 0.24)
    in_mix = transition(t, cuts[1] - incoming_blend, cuts[1] + incoming_blend)
    out_mix = transition(t, cuts[4] - outgoing_blend, cuts[4] + outgoing_blend)
    a = np.cos(np.pi / 2 * in_mix)
    b = np.sin(np.pi / 2 * in_mix) * np.cos(np.pi / 2 * out_mix)
    c = np.sin(np.pi / 2 * out_mix)

    # Two phase-continuous extracts of a real H135 pass: the approach up to its
    # crest and the departing aircraft after it. No resampling or pitch shift.
    def passage(seconds):
        index = np.clip(np.rint(seconds * RATE).astype(int), 0, len(flyby) - 1)
        return flyby[index]

    arrival = passage(8.68 + t - cuts[1])
    departure = passage(9.55 + t - cuts[4])
    # Preserve speed for long hover edits; use an equal-power overlap at the
    # loop seam, independent of the cuts within the boarding sequence.
    usable = hover[round(0.35 * RATE) : round(21.45 * RATE)]
    repeat = round(0.58 * RATE)
    x = np.linspace(0, np.pi / 2, repeat)[:, None]
    end = usable[-repeat:] * np.cos(x) + usable[:repeat] * np.sin(x)
    loop = np.vstack((usable[repeat:-repeat], end))
    idx = (
        np.rint((t - cuts[1] + incoming_blend) * RATE).astype(int) + round(0.7 * RATE)
    ) % len(loop)
    sustaining = loop[idx]
    shift = PchipInterpolator(cuts, [-0.56, -0.19, -0.11, -0.08, -0.04, 0.68])(t)
    # Restrained changes of listening perspective from the ground-level and
    # cabin-side shots. Preserve a portion of the authentic stereo field.
    near = 0.99 - 0.12 * np.sin(np.pi * np.clip((t - cuts[2]) / shots[2], 0, 1))
    arrival_gain = 0.77
    hover_gain = 1.42
    departure_gain = 0.84 * (
        1.0 - 0.38 * transition(t, cuts[4] + shots[4] * 0.48, cuts[5])
    )
    recorded = (
        arrival * (a * arrival_gain)[:, None]
        + sustaining * (b * near * hover_gain)[:, None]
        + departure * (c * departure_gain)[:, None]
    )
    mid = recorded.mean(axis=1) * np.sqrt(2)
    side = (recorded[:, 0] - recorded[:, 1]) * 0.36
    return pan(mid, shift) + np.column_stack((side, -side))


def loudness(stereo):
    # BS.1770 K-weighting / stereo energy, 400 ms blocks, 75% overlap,
    # absolute -70 LUFS and relative -10 LU gates. Always evaluated at 48 kHz.
    shelf = signal.lfilter(
        [1.53512485958697, -2.69169618940638, 1.19839281085285],
        [1, -1.69065929318241, 0.73248077421585],
        stereo,
        axis=0,
    )
    weighted = signal.lfilter(
        [1, -2, 1], [1, -1.99004745483398, 0.99007225036621], shelf, axis=0
    )
    energy = np.sum(weighted**2, axis=1)
    width = min(len(energy), int(RATE * 0.4))
    starts = np.arange(0, len(energy) - width + 1, max(1, width // 4))
    cumulative = np.r_[0, np.cumsum(energy)]
    values = (cumulative[starts + width] - cumulative[starts]) / width
    louder = values[values > 10 ** ((-70 + 0.691) / 10)]
    if not len(louder):
        return -70.0
    audible = louder[louder >= np.mean(louder) * 0.1]
    return float(-0.691 + 10 * np.log10(np.mean(audible)))


def true_peak(stereo):
    peak = 0.0
    # Overlap avoids measuring the artificial edge of a resampling block.
    for start in range(0, len(stereo), RATE):
        chunk = stereo[max(0, start - 24) : min(len(stereo), start + RATE + 24)]
        up = signal.resample_poly(chunk, 4, 1, axis=0, window=("kaiser", 8.0))
        offset = 96 if start >= 24 else 0
        peak = max(peak, float(np.max(np.abs(up[offset : offset + 4 * RATE]))))
    return peak


def write_pcm24(path, stereo):
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.rint(np.clip(stereo, -1, 1 - 2**-23) * 2**23).astype("<i4")
    with wave.open(str(path), "wb") as handle:
        handle.setparams((2, 3, RATE, len(stereo), "NONE", "not compressed"))
        handle.writeframes(pcm.view("u1").reshape(-1, 4)[:, :3].tobytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    durations = parser.add_mutually_exclusive_group()
    durations.add_argument(
        "--shots", nargs=5, type=float, metavar=("S1", "S2", "S3", "S4", "S5")
    )
    durations.add_argument(
        "--total", type=float, help="Distribute a total duration across five shots."
    )
    parser.add_argument(
        "--output", type=Path, default=Path(__file__).with_name("ambiente-parque.wav")
    )
    parser.add_argument("--seed", type=int, default=2028)
    parser.add_argument(
        "--lufs", type=float, default=-21.0, help="Integrated loudness target."
    )
    parser.add_argument(
        "--sintetico",
        action="store_true",
        help="Use the original fully synthesized rotor instead of CC0 field recordings.",
    )
    parser.add_argument(
        "--intro",
        type=float,
        default=0.0,
        help="Prepend an establishing shot in seconds.",
    )
    parser.add_argument(
        "--outro",
        type=float,
        default=0.0,
        help="Append the park bed after the aircraft recedes.",
    )
    parser.add_argument(
        "--ffmpeg",
        default="ffmpeg",
        help="FFmpeg executable to decode the bundled field recordings.",
    )
    args = parser.parse_args()
    shots = np.array(args.shots or DEFAULT_SHOTS, dtype=float)
    if args.total is not None:
        shots *= args.total / shots.sum()
    if not np.isfinite(shots).all() or np.min(shots) < 0.02:
        parser.error("Each shot must be a finite duration of at least 0.02 seconds.")
    if not np.isfinite(args.lufs):
        parser.error("Loudness target must be finite.")
    if not all(np.isfinite(d) and d >= 0 for d in (args.intro, args.outro)):
        parser.error("Intro and outro must be finite and nonnegative.")
    n_intro, n_outro = round(args.intro * RATE), round(args.outro * RATE)
    t_flight = np.arange(round(RATE * sum(shots))) / RATE
    t = np.arange(n_intro + len(t_flight) + n_outro) / RATE
    rng = np.random.default_rng(args.seed)
    cuts = np.r_[0.0, np.cumsum(shots)]
    park_open = transition(
        t, args.intro + cuts[4] + shots[4] * 0.42, args.intro + cuts[5]
    )
    park = morning(rng, t) * (1.10 + 0.46 * park_open)[:, None]
    aircraft = (
        flight(rng, t_flight, shots)
        if args.sintetico
        else recorded_flight(t_flight, shots, args.ffmpeg)
    )
    stereo = park
    # Introduce the aircraft over the continuous park bed without an edit click.
    aircraft *= transition(t_flight, 0, min(0.14, shots[0] / 5))[:, None]
    aircraft *= (
        1.0 - transition(t_flight, cuts[5] - min(0.32, shots[-1] / 5), cuts[5])
    )[:, None]
    stereo[n_intro : n_intro + len(aircraft)] += aircraft
    # Gentle trims preserve the field and rotor phase across all five cuts.
    fade = np.minimum(1, t / min(0.5, shots[0] / 3)) * np.minimum(
        1, (t[-1] - t) / min(0.85, shots[-1] / 3)
    )
    stereo *= (fade * fade * (3 - 2 * fade))[:, None]
    stereo -= stereo.mean(axis=0)
    gain = min(
        10 ** ((args.lufs - loudness(stereo)) / 20),
        10 ** (-2 / 20) / max(1.0e-10, true_peak(stereo)),
    )
    stereo *= gain
    write_pcm24(args.output, stereo)
    bounds = n_intro + np.rint(np.r_[0, np.cumsum(shots)] * RATE).astype(int)
    print(
        json.dumps(
            {
                "output": str(args.output),
                "durationSeconds": len(stereo) / RATE,
                "shotsSeconds": shots.tolist(),
                "introSeconds": args.intro,
                "outroSeconds": args.outro,
                "helicopterSources": ["synthesized"]
                if args.sintetico
                else ["Freesound 524249", "Freesound 181071"],
                "sampleRate": RATE,
                "channels": 2,
                "pcmBits": 24,
                "integratedLufs": round(loudness(stereo), 2),
                "truePeakDbtp": round(20 * np.log10(true_peak(stereo)), 2),
                "loudnessPerShot": [
                    round(loudness(stereo[bounds[i] : bounds[i + 1]]), 2)
                    for i in range(len(shots))
                ],
                "stereoCorrelation": round(float(np.corrcoef(stereo.T)[0, 1]), 3),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
