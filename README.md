# ClipLab Studio

A browser-based video editor that runs on PHP and works the way CapCut does: a multi-track timeline, text, stickers, filters, effects, transitions, keyframes, green screen and MP4 export.

## Start it (Windows)

1. Install **PHP 8+**. You can use XAMPP from https://www.apachefriends.org or PHP from https://windows.php.net/download.
2. Double-click **`start.bat`**. It opens http://localhost:8765 in your browser.
3. Use **Chrome or Edge**, because MP4 export needs them.

To use XAMPP's Apache instead, copy this folder into `C:\xampp\htdocs\cliplab` and open http://localhost/cliplab.

**Optional: FFmpeg.** Put `ffmpeg.exe` in your PATH, or set its path in `config.php` under `FFMPEG_PATH`. With FFmpeg, the app converts MKV/AVI/WMV/FLV uploads to MP4, and Fast-mode exports come out as proper MP4 files.

## Features

| Area | What you get |
|---|---|
| Media | Import video, photo and audio by drag & drop, with upload progress, a library with thumbnails and durations, and preview of audio |
| Timeline | Multi-track (main, overlays, text, audio), drag to move or change track, trim both ends, snapping, zoom (Ctrl+wheel), markers, mute/hide tracks, waveforms, thumbnails |
| Editing | Split, delete (the main track closes the gap), duplicate, copy/paste, undo/redo, freeze frame, extract audio, right-click menu |
| Transform | Position, scale, rotation, opacity, flip, fit/fill, blend modes; drag, resize and rotate directly on the preview |
| Keyframes | Animate position, scale, rotation, opacity and volume (◇ button) |
| Speed | 0.1×–10×, with presets and voice-pitch keep |
| Audio | Volume up to 400%, fade in/out, volume keyframes, voiceover recording, mute |
| Color | 16 filters with intensity; brightness, contrast, saturation, temperature, hue, vignette, blur |
| Effects | Slow zoom, zoom out, shake, pulse, flash, glitch, RGB split, flicker, vignette, old film, blur pulse, spin |
| Animations | In/out animations: fade, slide ×4, zoom, pop, spin, blur, typewriter (text) |
| Transitions | 15 transitions (dissolve, dip to black/white, slide, push, wipe, circle, zoom, spin, blur, flash), with an option to apply to all cuts |
| Text | 18 fonts including Sinhala (Noto Sans Sinhala, Abhaya Libre), stroke, shadow/glow, background box, spacing, 12 styles |
| Stickers | 100+ emoji stickers, or paste your own |
| Cutout | Chroma key (green screen) with an eyedropper, masks (circle, rounded, band, heart, star), crop |
| Captions | Import SRT/VTT, turn a pasted script into captions, export SRT |
| Canvas | 16:9, 9:16, 1:1, 4:5, 4:3, 3:4, 21:9; background can be a color, gradient or a blur of the clip |
| Export | **Precise** mode renders frame by frame to an H.264/AAC MP4 (WebCodecs). **Fast** mode records in real time. Output is 480p–4K at 24–60 fps |
| Projects | Autosave every 15 seconds, project list with thumbnails, list of exports |

## Folders

- `uploads/`: your imported media
- `exports/`: the videos you exported
- `data/projects/`: saved projects (JSON)

## Limits compared with CapCut

These features need cloud AI or licensed content that an offline PHP app does not have:

- Auto-captions (speech-to-text). Generate an SRT with a free Whisper app and import it.
- AI background removal. Use chroma key instead.
- Text-to-speech.
- Templates.
- Stock music library.

Reverse playback is also not included.
