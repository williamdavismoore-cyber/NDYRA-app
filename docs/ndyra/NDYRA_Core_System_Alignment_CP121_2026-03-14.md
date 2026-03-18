# NDYRA Core System Alignment - CP121

## Purpose
CP121 aligns Core to the newer module system without claiming module integration that has not happened yet.

## Core decisions locked in here
- **For You** is the familiar default signed-in landing surface.
- **Simple Home** remains available as the calm backup for members who want only the essentials.
- **BIO01** is now a real module lane in Core's host registry.
- **SOC01** is treated as the owner of Stories plus Aftermath expansion.
- **Signals** are alerts, not story content.
- **BRG01** exists as a Core-owned draft bridge between Timer sessions and Aftermath.

## What changed in Core
- `/app/` is now a member-entry launcher.
- `/app/home/` is the dedicated Simple Home route.
- `/app/stories/` is a reserved social content shell.
- `/app/performance/` is a reserved biometrics/performance shell.
- Profile and Settings now expose honest host-ready surfaces for fitness bio, device settings, and performance.
- Module registry and contract files now include BIO01 readiness and the new social language rules.

## What did not happen here
- no Timer integration
- no BizGym integration
- no HealthKit / Garmin connector implementation
- no biometric ingestion claim
- no Stories feed implementation claim

## QA principle
Core should tell the truth about what is ready, what is reserved, and what still belongs to separate workflows.
