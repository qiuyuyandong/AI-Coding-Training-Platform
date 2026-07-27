# NowCoder V4 B3.1 Restart-Safe Browse-Only Observation

**Result:** `PASS` for the B3 browse-only navigation witness only.

- Implementation commits: `c208bc2`, `fdecf91`.
- Evidence commit: `b2c6aec`.
- Fixture: `tests/fixtures/nowcoder/network/nowcoder-browse-only-2026-07-27.json`.
- The authenticated, main-frame fixture contains exactly two E0 records in list then problem order, with one tab ID and distinct document IDs. It contains no E1, E2, or E3 records.
- The fixture passed `node scripts/validate-v4-network-transcript.mjs tests/fixtures/nowcoder/network/nowcoder-browse-only-2026-07-27.json` and its fixture-driven unit test.
- The final `npm run quality:gate` exited 0: 87 unit files / 1792 passed / 1 skipped; 25 web E2E passed; 34 extension files / 1077 passed; 31 extension E2E passed / 1 known skip; 20-page production build passed.
- The authorized path created only background tabs, opened the exact list then problem route in one main-frame tab, did not read or alter code, and did not activate a submit control. The popup reached `ready`, exported the fixture, and then cleared the diagnostic session.

## Boundary

This is not NowCoder production certification, a release candidate, user acceptance, or permission to start B4. The plan's dedicated real MV3 Worker termination A-D coverage remains an explicit engineering follow-up.
