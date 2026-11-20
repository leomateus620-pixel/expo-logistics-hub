"""Bring fine texture from the original cabin photograph into the moving close-up."""

import argparse
import subprocess

import cv2
import numpy as np


def register(plate, reference):
    height, width = reference.shape
    scaled = cv2.resize(plate, (width, height), interpolation=cv2.INTER_AREA)
    finder = cv2.SIFT_create(nfeatures=1800)
    ka, da = finder.detectAndCompute(scaled, None)
    kb, db = finder.detectAndCompute(reference, None)
    pairs = [
        a
        for a, b in cv2.BFMatcher().knnMatch(da, db, k=2)
        if a.distance < 0.73 * b.distance
    ]
    if len(pairs) < 25:
        raise ValueError("The selected photograph does not match the cabin footage")
    transform, mask = cv2.estimateAffine2D(
        np.float32([ka[m.queryIdx].pt for m in pairs]),
        np.float32([kb[m.trainIdx].pt for m in pairs]),
        ransacReprojThreshold=1.6,
    )
    if mask is None or mask.sum() < 25:
        raise ValueError("The cabin reference could not be registered reliably")
    # Double working resolution preserves texture present in the 2752px reference.
    transform[:, 0] *= 2 * width / plate.shape[1]
    transform[:, 1] *= 2 * height / plate.shape[0]
    transform[:, 2] *= 2
    return cv2.warpAffine(
        plate,
        transform,
        (2 * width, 2 * height),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REFLECT_101,
    )


def finish(plate_path, video, output, ffmpeg):
    cap = cv2.VideoCapture(video)
    ref = cv2.imread(plate_path, cv2.IMREAD_GRAYSCALE)
    try:
        ok, first = cap.read()
        if not ok or ref is None or abs(cap.get(cv2.CAP_PROP_FPS) - 24) > 0.001:
            raise ValueError(
                "The cabin pass requires the photograph and the 24 fps motion take"
            )
        height, width = first.shape[:2]
        scale = (width * 2, height * 2)
        ref = register(ref, cv2.cvtColor(first, cv2.COLOR_BGR2GRAY))
        guide = cv2.resize(ref, (width, height), interpolation=cv2.INTER_AREA)
        detail = np.clip(
            ref.astype(np.float32) - cv2.GaussianBlur(ref, (0, 0), 1.2), -18, 18
        )
        xx, yy = np.meshgrid(
            np.arange(width, dtype=np.float32), np.arange(height, dtype=np.float32)
        )
        flow = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgr24",
            "-s",
            f"{scale[0]}x{scale[1]}",
            "-r",
            "24",
            "-i",
            "-",
            "-an",
            "-c:v",
            "libx264",
            "-threads",
            "3",
            "-preset",
            "veryfast",
            "-crf",
            "13",
            "-pix_fmt",
            "yuv420p",
            output,
        ]
        cap.set(cv2.CAP_PROP_POS_FRAMES, 9)
        with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
            for _ in range(60):
                ok, frame = cap.read()
                if not ok:
                    raise ValueError("The cabin shot ended too early")
                mono = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                offset = flow.calc(mono, guide, None)
                mx, my = xx + offset[:, :, 0], yy + offset[:, :, 1]
                aligned = cv2.remap(
                    guide, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101
                )
                diff = cv2.GaussianBlur(
                    cv2.absdiff(mono, aligned).astype(np.float32), (0, 0), 1.0
                )
                # Mouths, eyes, new highlights and newly revealed fabric retain their actual moving pixels.
                confidence = np.clip(1 - diff / 16, 0, 1) ** 2
                tx = cv2.resize(mx * 2, scale)
                ty = cv2.resize(my * 2, scale)
                grit = cv2.remap(
                    detail, tx, ty, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101
                )
                texture = 0.78 * grit * cv2.resize(confidence, scale)
                picture = cv2.resize(
                    frame, scale, interpolation=cv2.INTER_LANCZOS4
                ).astype(np.float32)
                encoder.stdin.write(
                    np.uint8(np.clip(picture + texture[:, :, None], 0, 255)).tobytes()
                )
            encoder.stdin.close()
            if encoder.wait():
                raise RuntimeError("The restored cabin shot could not be encoded")
    finally:
        cap.release()


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("plate")
    cli.add_argument("video")
    cli.add_argument("output")
    cli.add_argument("--ffmpeg", default="ffmpeg")
    args = cli.parse_args()
    finish(args.plate, args.video, args.output, args.ffmpeg)
