# Responsiveness and functionality review — 2026-10-14

This update requires both Terms and Privacy checkboxes at **each new sign-in**, as requested, as well as signup. Session renewal and the second MFA step retain their existing behavior; linking Google from an already authenticated profile remains a separate account operation.

## Changes

- Shared login agreement state gates password, Google and phone controls. Enter-key submission is also guarded.
- Password and phone APIs reject absent, false or string-valued acceptance. Google OAuth checks agreement before redirecting to Google and again in the callback. Mobile handoff tickets bind the policy version into the signed result; existing unsigned-policy tickets must restart login.
- Password visibility controls and policy labels have 44px touch targets. Input padding accommodates the larger controls without covering typed text.
- Removed the stale profile instruction claiming password/email setup was unavailable.
- Positive authentication fixtures explicitly include policy acceptance, including the local k6 workload. Negative-consent API tests remain separate and assert no session is issued.

## Verification scope

| Area | Verification |
| --- | --- |
| Authentication | Signup agreement, login agreement and Google URL gates, invalid credentials, verified email, password changes, MFA, session revocation, CSRF, signed handoff replay |
| Chat | Membership and cross-account authorization, encrypted delivery, history pagination, latest-message positioning, long-message composer, requests/approval, retries, drafts after reload |
| Media | Profile/group photos, status photos, attachment safety, image viewer, voice playback/contrast, distinct GIF/sticker content |
| Device security | No-trusted-device recovery, device name/country, one-time linking, rejection/expiry/replay, key possession and synchronization, isolated logout |
| Account/settings | Profile disclosures, themes, privacy and notifications, push subscription persisted binding with mocked browser push |
| Community/group/admin | Role and membership boundaries, community quotas, report validation, moderation persistence/audit, authenticated admin pages and XSS rendering |
| Mobile | 320/360/390/412px chat and main authenticated pages; short 740×360 landscape composer; 4× CPU long-history typing |

These are bounded automated checks, not proof that every possible state or every device is bug-free. Live email inbox delivery, actual push-provider delivery, Android APK/native Google sign-in and real iOS/Android hardware are not certified by these browser tests. The external Strix scan remains unavailable with a zero-credit balance.

## Speed measurements

Public live baseline: `public-speed-baseline-2026-10-14.json`. Sequential samples only, no live load testing. Mobile: Chromium 390px, 4× CPU, 80ms latency, 1.6Mbps download. Desktop: 1440px, unthrottled. Each page has first/repeat navigation within the same context; first navigation to a route can reuse shared assets already loaded on earlier routes.

| Mobile page | First main-content paint (LCP) | Repeat LCP |
| --- | ---: | ---: |
| Landing | 2800ms | 1732ms |
| Login | 1420ms | 1100ms |
| Signup | 728ms | 788ms |
| Forgot password | 1064ms | 884ms |
| Privacy | 1164ms | 1016ms |
| Terms | 872ms | 1160ms |

All 24 baseline navigations returned 200, with no horizontal overflow or browser exceptions. Landing first LCP exceeded the 2500ms good-range boundary in this one sample. No new sustained API capacity result is inferred from page loads: the previous measured login p95 of 518.8ms remains the last full load-test result.

Authenticated local lab, same mobile throttle: overview LCP 1088–1176ms, profile 772–788ms, chat 688–972ms; sampled interaction latency (INP) 64–200ms; CLS 0–0.01. These are local fixture measurements, not live field-user percentiles.

Repeat the final live check after deployment:

```powershell
$env:PUBLIC_QA_BASE_URL = 'https://circlo.chat'
$env:PUBLIC_QA_LABEL = 'public-speed-after'
node scripts/test-public-responsiveness.mjs
```

Output is saved to `.freebuff/performance/public-speed-after.json`. It also checks both agreement gates, unchecking after acceptance, Google URL propagation, password visibility and its touch target. Network/cache variance means before/after differences must not be attributed to an optimization without repeated controlled measurements.
