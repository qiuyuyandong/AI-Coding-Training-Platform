# V4 Phase D D2 Privacy and Permission Audit - 2026-08-03

## Verdict

`D2 COMPLETE; INDEPENDENT PRIVACY REVIEW APPROVE; FINAL QUALITY GATE PASS`

This is not an immutable candidate, RC, product acceptance, or release. D3 has
not started.

## Scope

The audit covers the exact source manifest, current production-built
`extension/dist` manifest and JavaScript, all production TypeScript under
`extension/src`, and OJ/Fake-OJ JSON and HTML fixtures under `tests/fixtures`.
It does not inspect or change a real browser profile, perform a real OJ action,
or open the default SQLite database.

## RED Provenance

The required D2 artifacts did not exist before implementation. Both planned
commands failed nonzero for that exact absence:

```text
npx vitest run tests/unit/v4ExtensionPrivacyAudit.test.ts
No test files found, exiting with code 1

node scripts/audit-v4-extension-privacy.mjs
MODULE_NOT_FOUND, exit 1
```

This RED proves the missing privacy-audit capability. It is not evidence of a
product privacy violation.

The first implemented audit run reported four findings. Inspection classified
all four as audit-classifier defects:

- three `requestBody` strings were members of forbidden-input rejection sets,
  including two names changed by bundling;
- one Fake-OJ HTML page used equivalent provenance wording split over lines.

The classifier was corrected without deleting rejection guards or weakening
manifest checks.

## Independent Review Findings and Remediation

The first independent privacy review returned `CHANGES REQUIRED` with one
BLOCKER, three HIGH findings, and one MEDIUM finding. D2 did not close. New RED
tests then proved the following real defects and audit gaps:

- a configured remote OJ URL with the expected capture path could receive a
  bundle and bearer credential;
- non-success HTTP response JSON and thrown network messages could enter
  `lastCaptureError`, quarantine, popup text, or logs;
- aliased webRequest registration, computed request-body access, direct storage
  spread writes, and wrapper storage paths were insufficiently covered;
- remote manifest fields, unexpected dist files, and modified popup HTML were
  not fully rejected; and
- fixture forbidden-key aliases, malformed metadata, and unsafe paths were
  insufficiently validated.

The remediation now:

- accepts capture endpoints only over HTTP on `localhost`, `127.0.0.1`, or
  `[::1]`, and normalizes popup writes and every send/pair endpoint;
- never reads a non-success response body and maps HTTP, ACK, network, pairing,
  popup-operation, download, and console errors to closed text;
- re-sanitizes every outbox result before durable error/quarantine writes;
- adds a closed runtime local/session key allowlist around background storage
  wrappers;
- explicitly restricts session storage to `TRUSTED_CONTEXTS` and restricts
  local storage when the runtime exposes that API;
- rejects aliased listener extra-info, statically resolvable computed forbidden
  access, sensitive-input unknown computed access, and direct storage spreads;
- enforces the exact ten-file dist inventory, source/target manifest identity,
  source/target popup HTML identity, remote manifest/resource rejection, and
  symlink rejection; and
- validates approved OJ origins, real ISO dates, nonempty capture method,
  fixture-name pairing, broader forbidden aliases, credential-bearing HTML,
  and safe repository-relative paths.

Disposable Chromium `138.0.7204.23` confirmed that
`chrome.storage.session.setAccessLevel` exists and accepts `TRUSTED_CONTEXTS`,
while `chrome.storage.local.setAccessLevel` is actually absent despite the
current type declaration. The capability check therefore applies the local
restriction when supported without crashing Chromium 138; the runtime key
allowlist remains mandatory in every browser.

The second independent privacy review also returned `CHANGES REQUIRED`, with
two HIGH and two MEDIUM findings. It confirmed the remote endpoint, current
error-flow, and access-level fixes, but found retained legacy error display,
direct background storage paths, incomplete nested/link collection, and
remaining fixture credential aliases. The second remediation:

- sanitizes retained `lastCaptureError`, valid quarantine, malformed
  quarantine, structured summaries, and popup fallback data through one closed
  legacy-error classifier;
- routes every background local/session get/set/remove through the runtime key
  allowlist wrapper; only access-level calls remain direct;
- recursively inspects filesystem entries with `lstat`, rejects any dist
  directory/extra entry/link and any source/fixture symlink or junction without
  following it; and
- canonicalizes fixture key names before rejecting access-token, API-key,
  session-token, authorization, secret, credential, source, header, account,
  and related aliases.

The third review found one remaining HIGH issue: a caller-provided structured
quarantine summary could retain sensitive text in a leading segment. The final
fix discards every caller-provided structured summary and renders one fixed
diagnostic; valid quarantine records still derive metadata from the strictly
parsed bundle path. The fourth independent review found no remaining issue and
returned `APPROVE`.

## Implemented Audit Contract

`scripts/audit-v4-extension-privacy.mjs` now fails closed on:

- any source or target manifest drift from the exact approved permission,
  host-permission, and MAIN-bridge match allowlists;
- broad hosts, optional permission surfaces, `webRequestBlocking`, `debugger`,
  DevTools, external connections, and test-only content-script paths;
- any production `requestBody` use; strings inside named forbidden-key
  rejection sets are classified separately and remain allowed as defenses;
- any production `webRequest.addListener` third `extraInfoSpec` argument;
- direct forbidden raw-data keys written to Chrome storage or referenced by
  console/error sinks;
- direct local/session storage ownership inversion for the approved D1 key
  inventory;
- `eval`, `Function`, `importScripts`, remote imports, and broad production
  request filters;
- a missing or different `extension/dist/manifest.json`;
- forbidden raw keys in OJ fixture JSON, active credential-bearing real HTML,
  Fake-OJ fixtures without explicit synthetic provenance, and real fixtures
  without embedded or paired provenance.

The approved production `requestBody` use allowlist remains exactly empty.

## Adversarial Tests

`tests/unit/v4ExtensionPrivacyAudit.test.ts` contains 35 passing cases covering:

- the current repository and exact target artifact;
- rejection-set classification versus four forms of real `requestBody` use;
- all production webRequest extra-info arguments;
- forbidden permissions, broad hosts, and test-only manifest paths;
- storage, log, and error sinks;
- local/session ownership inversion;
- remote-code surfaces, broad filters, and remote imports;
- source/target manifest disagreement;
- missing synthetic and real fixture provenance; and
- forbidden fixture data keys.

Focused product privacy tests additionally pass `68/68` across transport,
outbox, popup, storage privacy, and background initialization.

## Verification Evidence

Commands executed after implementation:

```text
npx vitest run tests/unit/v4ExtensionPrivacyAudit.test.ts
1 file passed; 35 tests passed

node scripts/audit-v4-extension-privacy.mjs
V4 extension privacy audit PASS (0 findings)

npm run extension:check (post-remediation)
typecheck PASS
43 extension test files passed; 1412 tests passed
production extension build PASS
dist parity/ignore check PASS

node scripts/audit-v4-extension-privacy.mjs
V4 extension privacy audit PASS (0 findings) after the authoritative rebuild
```

The first full post-remediation extension E2E attempt failed `43/54` because
worker initialization called a storage API absent in Chromium 138. After the
capability correction, a full run reached `51 passed / 1 known skip / 2
resource-flake failures`; each failed test then passed alone (`duplicate
verdict` 1/1 and D1 exact-dist chain 1/1). This is supporting evidence, not a
claim that the full E2E command exited zero; at that checkpoint the canonical
quality gate remained pending.

After the final privacy `APPROVE`, `npm run quality:gate` exited `0`:

- lint, disposable migration, curriculum validation, and typecheck PASS;
- unit: `99` files, `2197` passed, `1` Windows file-symlink capability skip;
- app E2E: `25` passed;
- extension check: `43` files, `1412` passed, production build and dist check
  PASS;
- extension E2E: `53` passed, `1` known service-worker harness skip;
- Next.js production build: `20/20` static pages generated.

The post-gate privacy CLI again returned `0 findings`; V4 adapter readiness
also passed.

Focused ESLint for the new and modified privacy files exited `0`. The
default `training-platform.sqlite` remained `479232` bytes with
`LastWriteTimeUtc=2026-07-23 15:56:38`.

## Remaining Gate

D2 is complete. D3 remains unstarted and requires explicit user authorization
to create the immutable implementation candidate commit. D2 completion does
not imply RC, acceptance, or release.
