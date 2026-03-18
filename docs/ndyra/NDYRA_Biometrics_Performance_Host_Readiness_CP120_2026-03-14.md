# NDYRA Biometrics + Performance Host Readiness - CP120

## Purpose
Prepare Core to host the new biometrics and performance system without faking integration.

## Core-hosted surfaces now reserved
- health-device settings entry in Settings
- fitness bio / performance shell in Profile
- dedicated `/app/performance/` dashboard shell
- host registry entry for the new biometrics module lane

## Ownership
- **BIO01** will own connectors, normalization, storage, sync, and chart data
- **PROF01** will own the member-facing settings and profile mounts that consume BIO01
- **Core** owns the shell truth and the beginner-friendly exposure rules

## Privacy rule
Biometric data must stay private by default until the member explicitly chooses what can be shared.
