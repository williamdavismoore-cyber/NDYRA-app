#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'

TARGETS = [
    (SITE / 'pricing.html', 'data-public-pricing-root', 'pricingPublic.mjs'),
    (SITE / 'join.html', 'data-public-join-root', 'joinPublic.mjs'),
    (SITE / 'for-gyms' / 'index.html', 'data-for-gyms-root', 'forGymsLanding.mjs'),
    (SITE / 'for-gyms' / 'pricing.html', 'data-public-pricing-root', 'pricingPublic.mjs'),
    (SITE / 'for-gyms' / 'start.html', 'data-for-gyms-start-root', 'forGymsStart.mjs'),
    (SITE / 'gym' / 'profile' / 'index.html', 'data-public-gym-profile-root', 'publicGymProfile.mjs'),
    (SITE / 'gym' / 'join' / 'index.html', 'data-public-gym-join-root', 'gymJoinPublic.mjs'),
]

BANNED_PHRASES = [
    'Member and business pricing placeholder.',
    'Create a member account.',
    'NDYRA for gyms landing page.',
    'Business pricing.',
    'Business onboarding start.',
    'Public gym profile placeholder.',
    'Quick join entry. Dynamic routes supported.',
]


def assert_(cond, msg):
    if not cond:
        raise AssertionError(msg)


def main() -> int:
    print('NDYRA PUBLIC SURFACE CHECK')
    for path, data_attr, module_name in TARGETS:
        assert_(path.exists(), f'Missing page: {path.relative_to(ROOT)}')
        text = path.read_text(encoding='utf-8', errors='replace')
        assert_(data_attr in text, f'{path.relative_to(ROOT)} missing root attr: {data_attr}')
        assert_(module_name in text, f'{path.relative_to(ROOT)} missing module import: {module_name}')
        for phrase in BANNED_PHRASES:
            assert_(phrase not in text, f'{path.relative_to(ROOT)} still contains stale placeholder text: {phrase}')
        print(f'OK: {path.relative_to(ROOT)}')
    print('PUBLIC SURFACE CHECK PASS')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
