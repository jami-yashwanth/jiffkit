# Task 8 report
Implemented Plausible tag (Base.astro, env-gated, queue stub is:inline), events in dropzone.ts (convert_error per Failed event; convert_success when update() sees no queued rows, count = Done since last drain, never 0), privacy.spec.ts (2 tests), Playwright webServer env PUBLIC_PLAUSIBLE_DOMAIN=tools.test, states.spec stubs plausible.io in beforeEach.
RED: with dropzone.ts stashed, both privacy tests failed (no events received). GREEN: npm test 142 pass; typecheck 0 errors; check:budget 4.85 KB; playwright 63/63 across chromium/webkit/firefox.
Concern: whole e2e build carries the tag (states suite stubs plausible.io); unset build verified to render no plausible markup. Retry/Resize-then-succeed counting is by design but not E2E-tested.
