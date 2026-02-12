# Vimeo Thumbnail Pipeline (CP16)

William — this is how we make thumbnails **work at scale** without you hand-picking 600+ images.

## What ships in the app
The website now loads a file at:

`/assets/data/thumbnail_overrides.json`

If that file contains an entry for a video ID, the site will use that URL instead of the default `thumbnail_url` that came with the ingest.

This keeps runtime fast and avoids hitting Vimeo from the frontend.

## Why we don’t embed the Vimeo token
Your Vimeo personal access token is a **secret**.

- It must **never** be committed into the kit, repo, or any public deploy.
- The safe pattern is: run the pipeline locally → it writes a JSON mapping → deploy the JSON.

## 1) Install prerequisites
From the kit root (same folder as `package.json`), you can run the script with plain Python.

Recommended (better picks):
- Python 3.10+
- `pip install requests pillow opencv-python`

Bare minimum (still works):
- Python 3.10+

## 2) Set your token locally
**Mac / Linux (bash/zsh):**

```bash
export VIMEO_TOKEN="YOUR_TOKEN_HERE"
```

**Windows (PowerShell):**

```powershell
$env:VIMEO_TOKEN = "YOUR_TOKEN_HERE"
```

## 3) Run the pipeline
Fast sanity run (first 20 videos):

```bash
python tools/vimeo_thumbnail_pipeline.py \
  --input site/assets/data/videos_all.json \
  --output site/assets/data/thumbnail_overrides.json \
  --limit 20 \
  --only-missing
```

Full run (all videos):

```bash
python tools/vimeo_thumbnail_pipeline.py \
  --input site/assets/data/videos_all.json \
  --output site/assets/data/thumbnail_overrides.json \
  --only-missing
```

### Useful flags
- `--fast` skips face/quality scoring and just chooses the active/largest thumbnail.
- `--no-cache` forces fresh API fetches.

## 4) Redeploy
Once the overrides file is generated, redeploy the site to Netlify.

## Notes on “best frame with a face”
If you install `opencv-python`, the script attempts lightweight face detection and strongly prefers thumbnails with faces.

If OpenCV isn’t installed, it falls back to:
- Sharpness / exposure (Pillow)
- Otherwise active thumbnail / largest thumbnail.

That gets us **80/20 quality now**, and we can still support manual overrides later for the handful of videos where Vimeo doesn’t generate great candidate thumbs.
