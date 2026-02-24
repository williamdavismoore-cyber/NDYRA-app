# NDYRA — IP Guardrails (Law Before Merge)
**Owner:** William Davis Moore  
**Applies to:** NDYRA (web/PWA + native wrappers)  
**Effective:** 2026-02-23  
**Goal:** Reduce avoidable copyright / trademark / patent / platform-policy risk through strict build rules.  
**Important:** This is not legal advice. It is an engineering/process guardrail document.

---

## 0) Absolute Rules (Non‑Negotiable)
- **No copying competitor code, UI assets, icons, audio, video, or marketing copy.** “Inspiration” is fine; **pixel-perfect replication is banned**.
- **No “it’s hidden in the UI” security.** Privacy/visibility must be enforced in DB/RLS (e.g., `can_view_post()`).
- **Every third‑party asset is either owned or licensed.** If we can’t prove ownership/license → we don’t ship it.
- **No feature that requires licensing may ship “temporarily.”** Music/GIF libraries/beauty SDKs must be compliant *before* release.

---

## 1) Highest‑Risk Feature Areas (Treat As Sensitive)
### 1.1 Signals (Stories‑like ephemeral layer)
**Guardrails**
- Do **NOT** ship a classic “timed auto‑advance stories gallery” as the defining behavior.
- Prefer **manual swipe navigation** + independent items with `expires_at` (not “gallery timers”).
- Keep UI grammar NDYRA‑native (not IG/Snap clones).

**Trigger for review (stop + assess)**
- Auto‑advance playback with progress bars and timed sequential galleries.

### 1.2 Music in Signals/posts
**Guardrails**
- **Licensed catalog only** (royalty‑free library or properly licensed provider).
- No mainstream song embedding unless we have a licensing strategy and compliant UX.
- Do not rehost or “rip” tracks. Ever.

**Trigger for review**
- Adding popular music library, allowing users to attach mainstream tracks, or any “sound” marketplace.

### 1.3 GIFs / Stickers / Fonts
**Guardrails**
- Use **curated NDYRA sticker packs** (owned assets) as default.
- If using Tenor/GIPHY: **comply with attribution + branding requirements** and do not remove their attribution UI.
- Fonts: use licensed fonts (commercial rights confirmed). Prefer open licenses with documentation.

### 1.4 Smoothing / Beauty filter
**Guardrails**
- Prefer a commercial SDK with clear commercial rights (and ideally indemnification).
- If built in-house: keep to **basic smoothing only** (Off/Low/Med), no face reshaping, no “beauty makeover” claims.
- Default Off (or Low) and always user‑controlled.

**Trigger for review**
- Face reshaping, AR beauty, or “enhance” claims beyond mild smoothing.

### 1.5 Aftermath (biometric reveal overlay)
**Guardrails**
- Aftermath is a **single‑user, single‑session summary card** (not a multi-user comparison system).
- No default public biometrics. Must obey privacy settings + post visibility.
- No “leaderboard overlay in video playback” without an explicit review.

### 1.6 Scheduling + Tokens/Credits + Booking
**Guardrails**
- Use standard schedule list/calendar UX; avoid competitor-specific “signature” flows.
- Don’t copy ClassPass/Mindbody language or UI patterns.
- Keep token pricing logic tenant-specific; avoid demand-based “credit surge” cloning early.

---

## 2) Content + Copyright Operations (UGC)
### Required before public launch
- **DMCA-style takedown workflow** (intake form/email, internal SLA, removal tooling).
- **Repeat infringer policy** (and enforcement).
- **Reporting + moderation pipeline** (already part of NDYRA anti-negativity design).

### Default user-facing rules
- Users must only upload content they own or have rights to use.
- No copyrighted music unless provided via NDYRA’s licensed catalog.

---

## 3) Brand + Trademark Hygiene (Avoid Confusion Claims)
- Name/logo/tagline must be checked for confusing similarity in our category.
- Avoid competitor brand names in UI labels (e.g., “ClassPass mode” is banned).
- Keep NDYRA’s visual identity distinctive (typography, spacing, icon language).

---

## 4) Platform Policy Guardrails (Apple/Google)
- Treat health/biometric data as **sensitive**. No ad-targeting based on health data.
- Any SDKs used in native wrappers must be documented + compliant with store disclosure requirements.
- Privacy disclosures must match reality (no “we don’t collect X” if we do).

---

## 5) “IP Gates” Before Merge (Hard Stop)
A PR cannot merge unless:
- [ ] **Assets check**: any new media/icons/stickers/fonts have documented license/source.
- [ ] **Music check**: no unlicensed music features or embeddings.
- [ ] **RLS check**: privacy/visibility enforced in DB/RLS (no permissive policies).
- [ ] **Attribution check**: Tenor/GIPHY attribution present if used.
- [ ] **Beauty check**: smoothing is SDK‑licensed or within “basic smoothing only” constraints.
- [ ] **UI distinctness check**: no pixel-level cloning of competitor flows.
- [ ] **Ops check**: report/takedown tooling exists for new UGC surface.

---

## 6) Engineering Documentation Rules (Proof of Independent Creation)
- Keep design files and commit history.
- Use descriptive commit messages (“Add SignalStrip manual swipe viewer” vs “Stories clone”).
- Store licenses in `/legal/licenses/` and reference them in PRs.

---

## 7) When to Pause and Escalate (Red Flags)
Escalate before shipping if any of these appear:
- Timed auto-advance “stories” gallery becomes core UX
- Mainstream music integration is added
- Face beautification expands beyond mild smoothing
- Multi-user biometric comparisons are introduced
- Third‑party content is embedded without clear licensing/attribution
