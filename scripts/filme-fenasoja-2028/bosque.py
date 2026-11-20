"""Register the Higgsfield grove plate to the seven-second Casa B12 shot.

Requires OpenCV, NumPy, SciPy and FFmpeg with libx264rgb. From the repository:
    python scripts/filme-fenasoja-2028/bosque.py 02-corda.mp4 02-bosque.mp4
Pass --qa-dir to export seven full-resolution before/after pairs and the measured
registration errors. The alpha plate and reference are authoring assets only.
"""

import argparse
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d

ASSETS = Path(__file__).resolve().parent / "bosque"
cv2.setNumThreads(2)


def match_anchors(before, cap, frame_count, width, height):
    # Frame registration uses the fixed buildings, streets, skyline and trees.
    # The skids, rotor, boarding party and line occupy the lower-left foreground.
    register_mask = np.full((height, width), 255, np.uint8)
    cv2.fillPoly(
        register_mask,
        [
            np.int32(
                np.array(
                    [
                        [0, 0.66],
                        [0.09, 0.57],
                        [0.42, 0.57],
                        [0.5, 0.69],
                        [0.59, 1],
                        [0, 1],
                    ]
                )
                * [width, height]
            )
        ],
        0,
    )
    register_mask[: int(0.10 * height)] = 0
    sift = cv2.SIFT_create(nfeatures=3300, contrastThreshold=0.025)
    original = cv2.cvtColor(before, cv2.COLOR_BGR2GRAY)
    keys, desc = sift.detectAndCompute(original, register_mask)
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    corners = np.float32([[0, 0], [width, 0], [width, height], [0, height]])
    tracks = []
    rows = []
    indices = sorted(set(range(0, frame_count, 6)) | {frame_count - 1})
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, fr = cap.read()
        if not ok:
            continue
        found, dst = sift.detectAndCompute(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY), None)
        if dst is None:
            continue
        pairs = matcher.knnMatch(desc, dst, k=2)
        matches = [a for a, b in pairs if a.distance < 0.75 * b.distance]
        if len(matches) < 12:
            continue
        src = np.float32([keys[m.queryIdx].pt for m in matches])
        tgt = np.float32([found[m.trainIdx].pt for m in matches])
        H, good = cv2.findHomography(src, tgt, cv2.USAC_MAGSAC, 2.65)
        if H is None:
            continue
        good = good.ravel().astype(bool)
        n = int(good.sum())
        if n < 15:
            continue
        xy = cv2.perspectiveTransform(corners[None], H)[0]
        coverage = cv2.contourArea(cv2.convexHull(src[good])) / (width * height)
        if coverage < 0.075 or not np.isfinite(xy).all():
            continue
        pred = cv2.perspectiveTransform(src[good][None], H)[0]
        err = np.linalg.norm(pred - tgt[good], axis=1)
        tracks.append((idx, xy))
        rows.append(
            {
                "frame": idx,
                "matches": len(matches),
                "inliers": n,
                "sourceCoverage": round(coverage, 3),
                "medianErrorPx": round(float(np.median(err)), 3),
            }
        )
    if len(tracks) < 2 or tracks[0][0] > 12 or tracks[-1][0] < frame_count - 12:
        raise RuntimeError("Too few verified background anchors: " + json.dumps(rows))
    indices = np.array([idx for idx, _ in tracks])
    points = np.stack([xy for _, xy in tracks])
    if np.any(np.diff(indices) > 24):
        raise RuntimeError("Unverified gap in background tracking")
    # Very small suppression of feature jitter; protect exact end anchors.
    filtered = gaussian_filter1d(points, 0.5, axis=0, mode="nearest")
    filtered[[0, -1]] = points[[0, -1]]
    sample = np.arange(frame_count)
    xy = np.stack(
        [
            np.interp(sample, indices, filtered[:, i, j])
            for i in range(4)
            for j in range(2)
        ],
        axis=1,
    ).reshape(-1, 4, 2)
    return [
        cv2.getPerspectiveTransform(corners, x.astype(np.float32)) for x in xy
    ], rows


def foreground_holdout(index, w, h, keyframes):
    # Polygons are in normalized picture coordinates and interpolated between observed frames.
    mask = np.zeros((h, w), np.uint8)
    frames = np.array(sorted(keyframes), int)
    if not len(frames):
        return mask
    left = max(0, np.searchsorted(frames, index, side="right") - 1)
    right = min(left + 1, len(frames) - 1)
    t = np.clip((index - frames[left]) / max(1, frames[right] - frames[left]), 0, 1)
    for a, b in zip(keyframes[int(frames[left])], keyframes[int(frames[right])]):
        xy = (1 - t) * np.array(a) + t * np.array(b)
        cv2.fillPoly(mask, [np.int32(xy * [w, h])], 255)
    return mask


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--qa-dir", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error("Choose a different file for the composited shot.")
    work = args.qa_dir
    if work:
        work.mkdir(exist_ok=True, parents=True)
    cap = cv2.VideoCapture(str(args.input))
    w, h = (
        int(cap.get(k)) for k in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT)
    )
    fps = cap.get(cv2.CAP_PROP_FPS)
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if (w, h) != (1280, 720) or count != 169 or abs(fps - 24) > 0.01:
        raise ValueError(
            "Expected the 169-frame, 1280×720 Higgsfield shot 02 at 24 fps."
        )
    original = cv2.imread(str(ASSETS / "registro-parque.webp"))
    plate = cv2.imread(str(ASSETS / "placa-bosque.webp"), cv2.IMREAD_UNCHANGED)
    if original is None or plate is None or plate.shape != (h, w, 4):
        raise ValueError("Grove plate or registration image is missing or invalid.")
    matte = plate[:, :, 3]
    # RGB contains the previously composited correction at soft mask boundaries.
    # Apply its difference once, preserving the underlying shot's light and motion.
    delta = plate[:, :, :3].astype(np.float32) - original.astype(np.float32)
    delta[matte == 0] = 0
    Hs, anchors = match_anchors(original, cap, count, w, h)
    if work:
        (work / "anchors.json").write_text(json.dumps(anchors, indent=2))
    print(
        "anchors",
        len(anchors),
        "inliers",
        min(a["inliers"] for a in anchors),
        flush=True,
    )
    coords = np.dstack(
        (
            np.tile(np.arange(w, dtype=np.float32), (h, 1)),
            np.tile(np.arange(h, dtype=np.float32)[:, None], (1, w)),
        )
    )
    keyframes = {
        int(k): v for k, v in json.loads((ASSETS / "oclusoes.json").read_text()).items()
    }
    read_half = (w // 2, h // 2)
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    temp = args.output.with_name(args.output.stem + ".rendering.mp4")
    encoder = subprocess.Popen(
        [
            args.ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pixel_format",
            "bgr24",
            "-video_size",
            f"{w}x{h}",
            "-framerate",
            str(fps),
            "-i",
            "-",
            "-an",
            "-c:v",
            "libx264rgb",
            "-qp",
            "0",
            "-preset",
            "veryfast",
            "-movflags",
            "+faststart",
            str(temp),
        ],
        stdin=subprocess.PIPE,
    )
    selected = set(np.linspace(0, count - 1, 7).round().astype(int))
    diagnostics = []
    caps = []
    threshold_max = 0
    changed_total = 0
    outside_total = 0
    try:
        for i, H in enumerate(Hs):
            ok, frame = cap.read()
            if not ok:
                raise RuntimeError("Frame missing " + str(i))
            base = cv2.warpPerspective(original, H, (w, h), flags=cv2.INTER_LINEAR)
            difference = cv2.warpPerspective(delta, H, (w, h), flags=cv2.INTER_LINEAR)
            region = cv2.warpPerspective(matte, H, (w, h), flags=cv2.INTER_LINEAR)
            # A backward, bounded dense flow attaches leaf texture to existing moving foliage.
            now_small = cv2.cvtColor(cv2.resize(frame, read_half), cv2.COLOR_BGR2GRAY)
            ref_small = cv2.cvtColor(cv2.resize(base, read_half), cv2.COLOR_BGR2GRAY)
            flow = cv2.calcOpticalFlowFarneback(
                now_small, ref_small, None, 0.5, 3, 19, 3, 5, 1.15, 0
            )
            flow = cv2.resize(cv2.GaussianBlur(flow, (0, 0), 1.8), (w, h)) * 2
            flow = np.clip(flow, -4.0, 4.0)
            map_xy = coords + flow
            base = cv2.remap(base, map_xy, None, cv2.INTER_LINEAR)
            difference = cv2.remap(difference, map_xy, None, cv2.INTER_LINEAR)
            region = np.minimum(
                region, cv2.remap(region, map_xy, None, cv2.INTER_LINEAR)
            )
            # Match the current shot's exposure without pasting a static photo over motion.
            light = frame.astype(np.float32) - base.astype(np.float32)
            pixels = light[::8, ::8][region[::8, ::8] > 165]
            median = np.median(pixels, axis=0) if len(pixels) else 0
            err = np.max(np.abs(cv2.GaussianBlur(light, (0, 0), 1.1) - median), axis=2)
            # Preserve local foreground silhouettes, cable edges and rotor blur.
            incompatible = (err > 39).astype(np.uint8)
            incompatible = cv2.dilate(incompatible, np.ones((3, 3), np.uint8))
            protection = foreground_holdout(i, w, h, keyframes)
            compatible = np.clip((44.0 - err) / 17.0, 0.0, 1.0) * (
                1.0 - cv2.GaussianBlur(incompatible.astype(np.float32), (0, 0), 0.85)
            )
            clearance = cv2.distanceTransform(255 - protection, cv2.DIST_L2, 3)
            compatible *= np.clip(clearance / (w * 0.009), 0, 1)
            compatible[protection != 0] = 0
            compatible[region == 0] = 0
            applied = (
                np.rint(frame.astype(np.float32) + difference * compatible[:, :, None])
                .clip(0, 255)
                .astype(np.uint8)
            )
            change = np.max(cv2.absdiff(applied, frame), axis=2)
            protected = (region == 0) | (protection != 0)
            threshold_max = max(threshold_max, int(change[protected].max()))
            outside_total += int((change[protected] != 0).sum())
            changed_total += int((change > 0).sum())
            encoder.stdin.write(applied.tobytes())
            if work and i in selected:
                a = cv2.resize(frame, (480, round(h * 480 / w)))
                b = cv2.resize(applied, (480, a.shape[0]))
                x = np.hstack((a, b))
                cv2.putText(
                    x,
                    f"{i / fps:.2f}s  |  antes / depois",
                    (9, 20),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.48,
                    (240, 240, 240),
                    1,
                    cv2.LINE_AA,
                )
                caps.append(x)
                cv2.imwrite(str(work / f"antes-{i:04}.png"), frame)
                cv2.imwrite(str(work / f"depois-{i:04}.png"), applied)
                cv2.imwrite(
                    str(work / f"area-{i:04}.png"),
                    ((region != 0) & (compatible > 0.05)).astype(np.uint8) * 255,
                )
                diagnostics.append(
                    {
                        "frame": i,
                        "seconds": round(i / fps, 3),
                        "activePixels": int((change > 0).sum()),
                        "modifiedByMoreThan8": int((change > 8).sum()),
                        "protectedPixels": int((protection != 0).sum()),
                        "maxChannelDelta": int(change.max()),
                    }
                )
    finally:
        encoder.stdin.close()
        result = encoder.wait()
        cap.release()
    if result or threshold_max or not changed_total:
        raise RuntimeError("Encoder or spatial isolation failed")
    temp.replace(args.output)
    if work:
        cv2.imwrite(
            str(work / "comparativo.jpg"),
            np.vstack(caps),
            [cv2.IMWRITE_JPEG_QUALITY, 91],
        )
    report = {
        "source": str(args.input),
        "output": str(args.output),
        "frames": count,
        "fps": fps,
        "width": w,
        "height": h,
        "anchorCount": len(anchors),
        "changedPixelsSummed": changed_total,
        "outsideOrProtectedChangedPixels": outside_total,
        "maxDeltaOutsideOrProtected": threshold_max,
        "encoding": "lossless H.264 RGB intermediate",
        "sampleFrames": diagnostics,
    }
    if work:
        (work / "verificacao.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
