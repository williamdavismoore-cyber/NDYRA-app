# NDYRA Core System Alignment - CP122

## Purpose
CP122 closes the gap between Core and the latest CP121 starter packs.

## Core decisions locked in here
- **For You** remains the familiar default signed-in landing surface.
- **Simple Home** remains the calmer backup.
- **Signals** remain alerts.
- **Stories** remain content.
- **BIO01** remains host-ready, not integrated.
- **Timer** and **BizGym** remain separate workflows.
- **Check-In** remains paused, but Core now keeps both member and business boundary shells honest.
- **Prelaunch production stays on Stripe sandbox/test values** until launch day.

## What changed in Core
- Added `/app/check-in/` as a paused member boundary shell.
- Added explicit Core-side contract stubs for GYM01, CE01, and CHKIN01.
- Added a host-level module kill-switch layer so Core can hide/disable a module lane without rewriting the shell.
- Updated deployment templates and live-wiring examples so production can stay non-live on Stripe during prelaunch.

## What did not happen here
- no Timer integration
- no BizGym integration
- no Check-In runtime claim
- no Stories engine claim beyond existing host surfaces
- no biometric ingestion claim

## QA principle
Core should stay bootable, honest, and host-ready even if a module is absent, disabled, broken, or still waiting on handback.
