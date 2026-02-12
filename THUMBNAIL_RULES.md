# HIIT56 Thumbnail Rules
Version: v0.2  
Date: 2026-02-07  
Owner: William / Aelric (build system)

## CP07 interim rule (shipping now)
Until we implement a dedicated thumbnail selection pipeline, the app uses the `thumbnail_url` already provided in `Workout Videos.csv` as the **source of truth** for every video card thumbnail.

**Meaning:** to “pick the best frame” right now, set the desired thumbnail frame in Vimeo for that video. The app will reflect it automatically.

This document defines the *deterministic standard* for HIIT56 workout thumbnails so they stay consistent as the library grows.

---

## Goals
- Thumbnails instantly communicate: **trainer**, **movement**, **intensity category**, and **brand**.
- Look premium on **mobile first**, then desktop.
- Prevent random / blurry / awkward frames.
- Make thumbnails *pipeline-friendly*: consistent naming, sizes, and overlay zones.

---

## Output formats
Primary (site/app library grid)
- **1280×720** (16:9)  
- **WEBP** (primary) + **JPG** (fallback, optional)

Optional (vertical placements later: Reels-style, app promos)
- **1080×1920** (9:16) WEBP

---

## Naming convention (required)
Each workout has a stable Workout ID (recommended). Thumbnails must match:

- `thumb_<workout_id>_16x9.webp`
- `thumb_<workout_id>_16x9.jpg` *(optional fallback)*
- `thumb_<workout_id>_9x16.webp` *(optional)*

Example:
- `thumb_w001_16x9.webp`

---

## Frame selection rules (what makes a “good” still)
We are selecting a still from each video (Vimeo-export MP4 preferred) that meets:

### Required
- **Face is visible** and not cut off.
- **Eyes toward camera** *or* a clearly intentional “hero” angle that still reads confident.
- **Mid-move pose**: obvious athletic shape (not standing idle, not resting).
- **Sharpness**: no heavy motion blur.
- **Clean composition**:
  - Minimal clutter behind subject.
  - No weird cropped limbs.
  - No distracting text already baked into the video.

### Strongly preferred
- **Negative space** on one side for overlay title (especially for mobile cropping).
- **High contrast** between subject and background.
- **Consistent lighting** across the library.

### Avoid
- Blink / grimace / awkward facial expression
- Downward gaze frames (unless intentional and strong)
- Extreme motion blur
- Frames where the body is “folded” in a way that looks messy at small size
- Frames that place the face behind hands/arms/equipment

---

## Safe overlay zones (so titles never cover the move)
We’ll apply a category/title overlay that you design (e.g., “HIIT”, “KICKBOXING”).

### 16:9 safe zones
- Keep **top-left** or **bottom-left** corner clean for overlay.
- Keep the **center** clear for the subject’s torso/face.
- Avoid placing the subject’s face within the outer ~10% margins (cropping variance).

### 9:16 safe zones (optional)
- Reserve a clean band at top or bottom for text.
- Keep face roughly in the upper-middle third.

---

## Overlay rules (brand consistency)
Overlay should be consistent across all thumbnails:

- Use **one font family** and **one weight system**.
- Use a **pill / badge** style for category:
  - Examples: HIIT, KICKBOXING, CORE, MOBILITY, STRENGTH
- Use a subtle **gradient plate** behind text if needed for readability (never harsh blocks).
- Keep overlay minimal: **Category + optional duration**.
- If adding workout title, keep it short (2–5 words) or use title only on the detail page.

### Suggested hierarchy
- Primary: Category pill (largest)
- Secondary (optional): Duration badge (e.g., “20 MIN”)

---

## Extraction pipeline (recommended approach)
For each workout video file:
1. Sample frames across the video (e.g., every 0.5–1.0 seconds).
2. Score candidates:
   - Sharpness (laplacian/edge clarity)
   - Face presence (detected)
   - Composition (subject size/centered)
3. Export **top 3** candidates:
   - `thumb_<id>_candidate1.webp`
   - `thumb_<id>_candidate2.webp`
   - `thumb_<id>_candidate3.webp`
4. Pick the winner (default = candidate1 unless overridden).
5. Apply overlay (category/title) and export final `thumb_<id>_16x9.webp`.

This keeps the pipeline fast while still giving you control.

---

## Data plumbing (must align with manifests)
### CONTENT_MANIFEST.csv
Each workout row should include:
- `workout_id`
- `title`
- `category_label` (used for overlay)
- `thumbnail_file` (final filename)
- `thumbnail_alt` (accessible alt text)

### ASSET_MANIFEST.csv
Each thumbnail is listed as:
- asset type: `thumbnail`
- used on: `member library`, `workout detail`, `program day tiles` (as applicable)

---

## QA checklist (thumbnail acceptance)
A thumbnail is “approved” only if:
- Reads clearly on a phone at small size.
- Face is visible and confident.
- Movement is obvious.
- Overlay does not cover face/hands/equipment.
- File is optimized (WEBP, reasonable size).
- Matches naming convention and manifests.

---

## Default alt text pattern (accessibility)
Use:
- `HIIT56 workout thumbnail: <Title> (<Category>)`

Example:
- `HIIT56 workout thumbnail: 20-Min HIIT Burn (HIIT)`

---

## Notes
If the library expands fast, we can automate 90% and keep a “manual override” field in the manifest for the rare video where gaze/move detection picks a weird frame.
