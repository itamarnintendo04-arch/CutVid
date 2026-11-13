#!/usr/bin/env python3
"""CutVid - beat-synced "velocity edit" generator.

Give it a folder of clips and a song. It finds the tempo and the drop,
builds a slow cinematic intro, then cuts on every beat after the drop with
velocity ramps, zoom punches, shake, RGB split, flashes and transitions.

    python3 cutvid.py --clips clips/ --song song.mp3 --out edit.mp4
"""
import argparse
import math
import random
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

W, H, FPS = 1080, 1920, 30
SR, HOP, NFFT = 22050, 256, 1024
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
TRANSITIONS = ["flash", "whip_l", "whip_r", "zoom", "spin", "glitch", "invert", "whip_u"]


# ---------------------------------------------------------------- audio ----

def load_audio(path):
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def analyze(y):
    """Return (beat_times, drop_beat_index, bpm)."""
    frames = np.lib.stride_tricks.sliding_window_view(y, NFFT)[::HOP]
    mag = np.abs(np.fft.rfft(frames * np.hanning(NFFT).astype(np.float32), axis=1))
    flux = np.maximum(0, np.diff(np.log1p(10 * mag), axis=0))
    env = flux.sum(1) + 2 * flux[:, :12].sum(1)  # extra weight below ~250 Hz (kick)
    env = (env - env.mean()) / (env.std() + 1e-9)
    low = flux[:, :12].sum(1)  # kick only: used to lock the beat phase
    rms = np.sqrt((frames ** 2).mean(1))[1:]
    fr = SR / HOP

    # coarse tempo: autocorrelation with a prior centred on 130 BPM
    best, coarse = -1e18, 130.0
    for lag in range(int(fr * 60 / 190), int(fr * 60 / 75)):
        bpm = 60 * fr / lag
        score = np.dot(env[:-lag], env[lag:]) * math.exp(-0.5 * (math.log2(bpm / 130) / 0.6) ** 2)
        if score > best:
            best, coarse = score, bpm

    # refine tempo + phase with a comb over the whole track
    idx = np.arange(len(env))
    best, bpm, phase = -1e18, coarse, 0.0
    for cand in np.arange(coarse * 0.96, coarse * 1.04, 0.02):
        period = fr * 60 / cand
        for ph in np.linspace(0, period, 24, endpoint=False):
            grid = np.arange(ph, len(env) - 1, period)
            score = np.interp(grid, idx, low).mean()
            if score > best:
                best, bpm, phase = score, cand, ph
    period = fr * 60 / bpm
    grid = np.arange(phase, len(env) - 1, period)
    beats = grid / fr + NFFT / 2 / SR

    # drop = beat where the following 8 beats are loudest relative to the previous 8
    e = np.array([rms[int(a):max(int(a) + 1, int(b))].mean() for a, b in zip(grid[:-1], grid[1:])])
    best, drop = -1e18, 8
    for i in range(8, len(e) - 16):
        score = e[i:i + 8].mean() - e[i - 8:i].mean()
        if score > best:
            best, drop = score, i
    return beats, drop, bpm


# ---------------------------------------------------------------- video ----

def probe_duration(path):
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]
    return float(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip())


def cover(img):
    h, w = img.shape[:2]
    s = max(W / w, H / h)
    img = cv2.resize(img, (math.ceil(w * s), math.ceil(h * s)), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    y, x = (img.shape[0] - H) // 2, (img.shape[1] - W) // 2
    return np.ascontiguousarray(img[y:y + H, x:x + W])


def decode(path, start, dur):
    """Decode `dur` seconds from `start` as a list of WxH BGR frames at FPS."""
    if path.suffix.lower() in IMAGE_EXT:
        return [cover(cv2.imread(str(path)))]
    vf = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}"
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", str(path),
           "-vf", vf, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = len(raw) // (W * H * 3)
    if n == 0:
        raise RuntimeError(f"no frames decoded from {path}")
    arr = np.frombuffer(raw, np.uint8)[:n * W * H * 3].reshape(n, H, W, 3)
    return [arr[i] for i in range(n)]


def warp(img, zoom=1.0, angle=0.0, dx=0.0, dy=0.0):
    m = cv2.getRotationMatrix2D((W / 2, H / 2), angle, zoom)
    m[0, 2] += dx
    m[1, 2] += dy
    return cv2.warpAffine(img, m, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def rgb_split(img, k):
    if k < 1:
        return img
    out = img.copy()
    out[:, :, 2] = np.roll(img[:, :, 2], k, axis=1)
    out[:, :, 0] = np.roll(img[:, :, 0], -k, axis=1)
    return out


def saturate(img, s, contrast=1.0, bright=0.0):
    gray = cv2.cvtColor(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    out = cv2.addWeighted(img, s, gray, 1 - s, 0)
    return cv2.convertScaleAbs(out, alpha=contrast, beta=bright - 128 * (contrast - 1))


def glitch(img, rng, strength):
    out = img.copy()
    for _ in range(10):
        y0 = rng.randrange(0, H - 40)
        hh = rng.randrange(20, 180)
        out[y0:y0 + hh] = np.roll(out[y0:y0 + hh], int(rng.uniform(-1, 1) * 260 * strength), axis=1)
    return rgb_split(out, int(40 * strength))


def make_vignette():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / math.sqrt(2)
    v = np.clip(1.0 - 0.75 * d ** 2.2, 0, 1)
    return cv2.merge([(v * 255).astype(np.uint8)] * 3)


def transition(kind, img, prev, p, rng):
    """Blend into `img` from `prev` (last frame of previous cut). p goes 0 -> 1."""
    q = (1 - p) ** 2
    if kind == "flash":
        return cv2.addWeighted(img, 1, np.full_like(img, 255), 0, 255 * q)
    if kind == "invert":
        return 255 - img if p < 0.5 else img
    if kind == "glitch":
        return glitch(img, rng, q + 0.2)
    if kind == "zoom":
        out = warp(img, zoom=1 + 1.4 * q)
        k = int(60 * q) | 1
        return cv2.GaussianBlur(out, (k, k), 0) if k > 1 else out
    if kind == "spin":
        out = warp(img, zoom=1 + 0.9 * q, angle=55 * q)
        k = int(40 * q) | 1
        return cv2.GaussianBlur(out, (k, k), 0) if k > 1 else out
    if kind.startswith("whip"):
        vertical = kind == "whip_u"
        sign = -1 if kind == "whip_l" else 1
        size = H if vertical else W
        off = int(size * q)
        base = prev if prev is not None else np.zeros_like(img)
        out = np.empty_like(img)
        if vertical:
            out[:off] = base[H - off:] if off else base[:0]
            out[off:] = img[:H - off]
        elif sign > 0:
            out[:, :off] = base[:, W - off:] if off else base[:, :0]
            out[:, off:] = img[:, :W - off]
        else:
            out[:, W - off:] = base[:, :off]
            out[:, :W - off] = img[:, off:]
        k = int(220 * q) + 1
        return cv2.blur(out, (1, k) if vertical else (k, 1))
    return img


# ------------------------------------------------------------- timeline ----

def build_segments(beats, drop, intro_beats, duration, rng):
    """Return list of dicts: start, end (seconds on song clock), kind."""
    segs = []
    i = drop - intro_beats
    t0 = beats[i]
    while i < drop:  # intro: slow cuts every 2 beats
        j = min(i + 2, drop)
        segs.append(dict(start=beats[i], end=beats[j], kind="intro"))
        i = j
    segs[-1]["kind"] = "build"
    bar = 0
    while i < len(beats) - 4 and beats[i] - t0 < duration:
        if bar % 4 == 3:  # burst bar: half-beat strobe cuts at the end
            pattern = [1, 1, 0.5, 0.5, 0.5, 0.5]
        elif bar % 4 == 1 and rng.random() < 0.7:  # one long slow-mo hero shot
            pattern = [2, 1, 1]
        else:
            pattern = [1, 1, 1, 1]
        pos = float(i)
        for n in pattern:
            a = np.interp(pos, np.arange(len(beats)), beats)
            b = np.interp(pos + n, np.arange(len(beats)), beats)
            segs.append(dict(start=a, end=b, kind={2: "hero", 0.5: "burst"}.get(n, "beat")))
            pos += n
        i += 4
        bar += 1
    segs[len([s for s in segs if s["kind"] in ("intro", "build")])]["kind"] = "drop"
    return segs, t0


def render(args):
    rng = random.Random(args.seed)
    clips = sorted(p for p in Path(args.clips).iterdir() if p.suffix.lower() in VIDEO_EXT | IMAGE_EXT)
    if not clips:
        sys.exit(f"no clips found in {args.clips}")
    durations = {p: (probe_duration(p) if p.suffix.lower() in VIDEO_EXT else 0) for p in clips}

    print("analysing song...")
    beats, drop, bpm = analyze(load_audio(args.song))
    if args.drop is not None:
        drop = int(np.argmin(np.abs(beats - args.drop)))
    drop = max(drop, args.intro_beats)
    segs, t0 = build_segments(beats, drop, args.intro_beats, args.duration, rng)
    total = segs[-1]["end"] - t0
    print(f"tempo {bpm:.1f} BPM, drop at {beats[drop]:.2f}s, {len(segs)} cuts, {total:.1f}s")

    out_cmd = ["ffmpeg", "-y", "-v", "error",
               "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
               "-ss", f"{t0:.3f}", "-t", f"{total:.3f}", "-i", str(args.song),
               "-af", f"afade=t=in:d=0.3,afade=t=out:st={total - 0.6:.3f}:d=0.6",
               "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", str(args.out)]
    out = subprocess.Popen(out_cmd, stdin=subprocess.PIPE)

    vignette = make_vignette()
    order, prev_last, prev_out, frame_no = [], None, None, 0
    beat_rel = beats - t0
    for si, seg in enumerate(segs):
        kind = seg["kind"]
        f_end = round((seg["end"] - t0) * FPS)
        n = f_end - frame_no
        if n <= 0:
            continue
        dur = n / FPS

        # speed curve: source seconds consumed per output second, over u in [0,1]
        u = (np.arange(n) + 0.5) / n
        if kind in ("intro", "build"):
            speed = np.full(n, 0.45)
        elif kind == "hero":
            speed = 3.0 * np.exp(-9 * u) + 0.3
        else:
            speed = 2.4 * np.exp(-5 * u) + 0.55
        pos = np.concatenate([[0], np.cumsum(speed)[:-1]]) / FPS
        need = pos[-1] + 0.2

        if not order:
            order = clips[:]
            rng.shuffle(order)
        clip = order.pop()
        start = rng.uniform(0, max(0.0, durations[clip] - need - 0.1))
        src = decode(clip, start, need)

        trans = "cut" if kind in ("intro", "build") else rng.choice(TRANSITIONS)
        if kind == "drop":
            trans = "flash"
        t_len = max(2, min(5, n // 2))
        ghost = kind == "hero" or (kind == "beat" and rng.random() < 0.3)
        mirror = kind in ("beat", "burst") and rng.random() < 0.2
        drift = rng.choice([-1, 1])
        punch = {"drop": 0.35, "hero": 0.22, "burst": 0.16}.get(kind, 0.14)

        for f in range(n):
            t = (frame_no + 0.5) / FPS
            x = min(pos[f] * FPS, len(src) - 1)
            i0 = int(x)
            img = src[i0]
            if x - i0 > 0.05 and i0 + 1 < len(src) and speed[f] < 1:  # smooth slow-mo
                img = cv2.addWeighted(img, 1 - (x - i0), src[i0 + 1], x - i0, 0)
            if mirror:
                img = cv2.flip(img, 1)

            since_beat = t - beat_rel[beat_rel <= t + 1e-6].max() if (beat_rel <= t + 1e-6).any() else 9
            local = f / FPS
            if kind in ("intro", "build"):
                img = warp(img, zoom=1.04 + 0.10 * u[f] + 0.03 * math.exp(-6 * since_beat))
                img = saturate(img, 0.25, contrast=1.15, bright=-18)
                if kind == "build":  # push in, shake harder, sink to black
                    amp = 14 * u[f] ** 2
                    img = warp(img, zoom=1 + 0.5 * u[f] ** 3, dx=rng.uniform(-amp, amp), dy=rng.uniform(-amp, amp))
                    img = rgb_split(img, int(14 * u[f] ** 2))
                    img = cv2.convertScaleAbs(img, alpha=max(0.0, 1 - u[f] ** 4))
                img[:210] = 0
                img[-210:] = 0
            else:
                decay = math.exp(-7 * min(since_beat, local))
                amp = 26 * math.exp(-6 * local) * (2.0 if kind == "drop" else 1.0)
                img = warp(img,
                           zoom=1.05 + punch * decay + 0.04 * u[f],
                           angle=drift * (1.2 - 2.4 * u[f]) + rng.uniform(-1, 1) * 1.5 * decay,
                           dx=rng.uniform(-amp, amp), dy=rng.uniform(-amp, amp))
                img = rgb_split(img, int(22 * decay))
                img = saturate(img, 1.4, contrast=1.18, bright=-4)
                if f < t_len:
                    img = transition(trans, img, prev_last, (f + 0.5) / t_len, rng)
                if kind == "burst" and f == n - 1 and si % 2:
                    img = 255 - img
                if ghost and prev_out is not None:
                    img = cv2.addWeighted(img, 0.62, prev_out, 0.38, 0)
                if kind == "drop":
                    img = cv2.addWeighted(img, 1, np.full_like(img, 255), 0, 255 * math.exp(-9 * local))
            img = cv2.multiply(img, vignette, scale=1 / 255)
            out.stdin.write(img.tobytes())
            prev_out = img
            frame_no += 1
        prev_last = prev_out
        print(f"\r{si + 1}/{len(segs)} cuts", end="", flush=True)

    out.stdin.close()
    if out.wait() != 0:
        sys.exit("\nffmpeg encode failed")
    print(f"\nwrote {args.out}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--clips", required=True, help="folder with video clips / images")
    ap.add_argument("--song", required=True, help="audio file")
    ap.add_argument("--out", default="edit.mp4")
    ap.add_argument("--duration", type=float, default=20.0, help="approx. total length in seconds")
    ap.add_argument("--intro-beats", type=int, default=8, help="slow beats before the drop")
    ap.add_argument("--drop", type=float, help="drop time in the song (seconds); auto-detected if omitted")
    ap.add_argument("--seed", type=int, default=7, help="change for a different cut")
    render(ap.parse_args())


if __name__ == "__main__":
    main()
