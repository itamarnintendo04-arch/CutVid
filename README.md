# CutVid

Beat-synced "velocity edit" generator. Give it a folder of clips and a song;
it finds the tempo and the drop, builds a slow black-and-white intro, then
cuts on every beat with velocity ramps, zoom punches, shake, RGB split,
flashes, glitches and whip/zoom/spin transitions. Output is 1080x1920, 30 fps.

    pip install -r requirements.txt        # also needs ffmpeg on PATH
    python3 cutvid.py --clips clips/ --song song.mp3 --out edit.mp4

Options: `--duration 20` (length in seconds), `--intro-beats 8`,
`--drop 42.5` (set the drop time by hand if auto-detection misses),
`--seed 3` (different clip order and effects).
