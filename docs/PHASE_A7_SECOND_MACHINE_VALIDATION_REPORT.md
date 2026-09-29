# PHASE A.7 — SECOND MACHINE VALIDATION

**Predecessor:** `docs/PHASE_A6_AUTO_UPDATE_FOUNDATION_REPORT.md` (verdict A — VALIDATED, single environment)
**Date:** 2026-09-29
**Scope:** Validation only. No code changes, no dependency changes, no version changes, no new artifacts.

---

## 1. Objective

Determine whether iReader's electron-updater auto-update mechanism (0.2.0 → 0.2.1), already validated end-to-end on one Windows machine in Phase A.6, also works on a **second, independent Windows environment** — to rule out any accidental dependency on the first machine's state (cache, prior install, dev tooling, environment variables).

---

## 2. Environment

**This phase could not be executed.** The tooling available in this session (Bash/PowerShell) only has access to the single Windows machine used for Phase A.6. There is no mechanism available to this session to reach a second physical machine, a second VM, or any remote host — no SSH/RDP credentials or connection details for another machine were provided, and none could be discovered from the repository.

Per the task's own precedent for exactly this kind of resource gap (§2: *"Si los artefactos A.6 ya no están disponibles: DETENTE... NO fabriques nuevos artefactos sin autorización"*), the same principle was applied here to the second machine itself: rather than substitute an unauthorized workaround, the user was asked directly how to proceed. Three options were offered:
1. Use the document's own explicit fallback — a second, clean Windows **user profile** on this same physical machine.
2. Provide remote access to a genuinely separate Windows machine.
3. Stop and mark the phase blocked, pending a second environment being made available.

**The user chose option 3.** No test execution was attempted as a result. This report exists to close out the phase's documentation requirement and record the reason for the block — not to report simulated or partial test results.

---

## 3. Windows Version

Not recorded for a second machine — none was available. (The first machine's details are already on record in `docs/PHASE_A6_AUTO_UPDATE_FOUNDATION_REPORT.md`.)

---

## 4. Machine / User Profile

N/A — no second machine or profile was provisioned or used.

---

## 5. Artifacts

Read-only check performed (no test execution, purely confirming §2 of the task's own artifact-availability precondition): the A.6 artifacts **are still present** in this session's scratchpad directory (outside the repo, as they were during A.6):

| File | Size (bytes) | Status |
|---|---|---|
| `iReader-0.2.0-fixed.exe` | 81,099,808 | The **correct** 0.2.0 build — includes the bundling fix from A.6 §3.1. This is the one that must be used for any future A.7 attempt. |
| `iReader by Pro Buyer Setup 0.2.0.exe` | 80,995,166 | A **stale, broken** pre-fix 0.2.0 build left over from early A.6 troubleshooting (crashes on launch — `Cannot find module 'electron-updater'`). **Must not be used.** |
| `update-server/iReader by Pro Buyer Setup 0.2.1.exe` | 81,099,804 | The validated 0.2.1 build. |
| `update-server/iReader by Pro Buyer Setup 0.2.1.exe.blockmap` | present | Matches the 0.2.1 build above. |
| `update-server/latest.yml` | present | Points to the 0.2.1 build above with its correct SHA512/size. |

No artifact was rebuilt, regenerated, or modified to produce this table — it is a listing of what A.6 already left in place.

**Flag for whoever runs A.7 next:** two files with very similar names exist side by side (the broken original and the fixed one). Confirm using the correct `iReader-0.2.0-fixed.exe` before installing, or the test will fail immediately for an already-diagnosed, unrelated reason (A.6 §3.1), not a real second-environment finding.

---

## 6. Update Server

Not started. No server was needed since no client machine was available to point it at.

---

## 7. Clean Installation

Not performed.

---

## 8. 0.2.0 Launch

Not performed.

---

## 9. Update Detection

Not performed.

---

## 10. Download

Not performed.

---

## 11. SHA512 / Integrity

Not performed. (Per §9 of the task, this was correctly scoped to *not* repeat the destructive negative test anyway — but even the positive "download completes cleanly" check could not be attempted without a client.)

---

## 12. `quitAndInstall`

Not performed.

---

## 13. 0.2.1 Relaunch

Not performed.

---

## 14. Offline Test

Not performed.

---

## 15. Apple USB

Not performed. Per the task's own instruction for this exact situation: **APPLE USB — NOT TESTED.**

---

## 16. Environment Independence

This was the actual purpose of the phase, and it remains **unanswered**. Specifically still unverified:

- Whether A.6's success depended on the first machine's `%LocalAppData%\icellshoppos-desktop-updater` cache, prior install state, or residual files.
- Whether the `ELECTRON_RUN_AS_NODE=1` environment variable observed on the first machine (A.6 §10) is a global/system-level setting on that machine (which would need to be re-checked on any second environment too) or something scoped only to the specific terminal session used — this was never determined in A.6, and remains an open question for A.7 to answer once it actually runs.
- Whether the port-8080-vs-Docker-Desktop conflict observed in A.6 (§9) is specific to that machine's installed software or would recur elsewhere.

None of these can be resolved without actually running the test on a genuinely separate environment.

---

## 17. Git Status

**Before this phase (session start):**
```
 M desktop/electron.vite.config.ts
 M desktop/package.json
 M desktop/src/main/index.ts
 M desktop/src/preload/index.ts
 M desktop/src/renderer/src/App.tsx
 M desktop/src/renderer/src/styles.css
 M package-lock.json
?? desktop/src/main/update/
?? docs/AUDIT_IREADER_AUTO_UPDATE_FOUNDATION.md
?? docs/AUDIT_IREADER_DISTRIBUTION_AWS_TO_HETZNER.md
?? docs/PHASE_A6_AUTO_UPDATE_FOUNDATION_REPORT.md
```

**After this phase:** identical, plus this report:
```
 M desktop/electron.vite.config.ts
 M desktop/package.json
 M desktop/src/main/index.ts
 M desktop/src/preload/index.ts
 M desktop/src/renderer/src/App.tsx
 M desktop/src/renderer/src/styles.css
 M package-lock.json
?? desktop/src/main/update/
?? docs/AUDIT_IREADER_AUTO_UPDATE_FOUNDATION.md
?? docs/AUDIT_IREADER_DISTRIBUTION_AWS_TO_HETZNER.md
?? docs/PHASE_A6_AUTO_UPDATE_FOUNDATION_REPORT.md
?? docs/PHASE_A7_SECOND_MACHINE_VALIDATION_REPORT.md
```

**No code, config, or dependency file was touched during this phase.** A read-only inspection (§1 of the task) was performed: `git status --short`, and reading `desktop/package.json`'s version/dependency/publish fields via `node -e`, plus `npm ls electron-updater` — all confirmed the repository is in exactly the same state A.6 left it in (version `0.2.1`, `electron-updater@6.8.10` as the single effective resolved version, `build.publish` still pointing at the local test URL `http://127.0.0.1:45280`).

---

## 18. Findings

1. **No second Windows environment (physical machine, VM, or remote host) is reachable from this session's tooling.** This is an access/infrastructure gap, not a product defect.
2. **A stale, broken 0.2.0 artifact from early A.6 troubleshooting is sitting alongside the correct one** in the scratchpad, with a confusingly similar filename — a real risk for whoever runs A.7 next without reading this report first (documented in §5 specifically to prevent that).
3. The environment-independence question this phase exists to answer (§16) is **still open** — A.6's result should still be treated as "validated on one machine only" until this phase actually runs.

---

## 19. Limitations

- The user was offered the document's own sanctioned fallback (a second clean Windows user profile on the same physical machine) and explicitly chose **not** to use it at this time, opting instead to pause the phase entirely pending a real second environment. This was the user's call to make, and it was respected rather than substituted with the fallback unilaterally.
- Because nothing was executed, this report cannot speak to any of the actual technical questions (SHA512, quitAndInstall, offline behavior, etc.) on a second environment — those all remain exactly as validated (only once, on one machine) in A.6.

---

## 20. Final Verdict

**C — BLOCKED.**

Clarification on why **C** rather than a new category: the task defines only A/B/C. This is not "B — partially validated" because the *main flow itself* was never attempted here (B requires the main flow to have been validated, with only a secondary test skipped). It is reported as **C — BLOCKED**, with the explicit qualifier:

> **BLOCKED — NO SECOND ENVIRONMENT AVAILABLE** (not a functional failure of the product; A.6's result stands, but only as single-machine evidence).

No further action was taken. Per the task's stop condition, this phase does not proceed to Phase B (Hetzner) or attempt any workaround. It waits on either a second machine/remote access being provided, or explicit authorization to use the second-user-profile fallback.
