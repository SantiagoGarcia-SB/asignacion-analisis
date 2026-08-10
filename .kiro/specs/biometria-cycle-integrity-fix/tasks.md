# Implementation Plan

## Overview

Fix four related bugs in the biometry assignment cycle: (1) cases stuck in WA_ENVIADO when SAI returns null repeatedly, (2) orphan records in admin_desarchivarBiometrias, (3) fragile dual-constant coupling, and (4) off-by-one boundary comparison. Uses the bug condition methodology with exploration tests before fix, preservation tests to prevent regressions, then implementation and validation.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Biometria Cycle Integrity Bugs (SAI Null Stuck, Orphan Desarchivar, Dual-Constant, Boundary Off-by-One)
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the four bugs exist
  - **Scoped PBT Approach**: Scope properties to concrete failing cases for each bug:
    - Bug 1: Case in WA_ENVIADO with N consecutive null SAI responses → assert escalation after threshold (currently never happens)
    - Bug 2: `admin_desarchivarBiometrias` with `procesarYGuardarLote` throwing → assert cases remain ARCHIVADA (currently orphaned as ESCALADA)
    - Bug 3: Assert `autoAsignarBiometria` uses `TARGET_SOLICITUDES_SS_ID` (currently uses `ID_WAREHOUSE_USUARIOS`)
    - Bug 4: Case with fechaResultado exactly at boundary (noon/midnight) → assert case IS included (currently excluded by `>=`)
  - Create pure functions in `tests/lib/biometria-cycle-integrity-puro.js` extracting the relevant logic
  - Write property-based test in `tests/properties/biometria-cycle-integrity.property.test.js`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples found:
    - Bug 1: "After 3+ null SAI responses, case remains WA_ENVIADO with no escalation path"
    - Bug 2: "Cases marked ESCALADA even though procesarYGuardarLote threw — orphan records"
    - Bug 4: "Case at exactly 12:00:00.000 filtered out by `>=` comparison"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [-] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Normal SAI Response, Successful Desarchivar, and Non-Boundary Case Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - **Observe on UNFIXED code:**
    - Normal SAI flow: When `_consultarSaiIndividual()` returns non-null, case is escalated (if APROBADO_PENDIENTE_BIOMETRIA) or resolved (if status changed) in the same corte
    - Successful desarchivar: When `procesarYGuardarLote` succeeds, cases are marked ESCALADA and admin sees count
    - Non-boundary filtering: Cases with fechaResultado strictly before boundary are offered; cases strictly after are deferred
    - `_volcarBloque()` protective pattern continues to work (try/catch around procesarYGuardarLote, mark ESCALADA only on success)
  - **Write property-based tests capturing observed behavior:**
    - For all non-null SAI responses, escalation/resolution decision matches original logic
    - For all successful `procesarYGuardarLote` calls in desarchivar, cases become ESCALADA and admin message is correct
    - For all fechaResultado values NOT exactly at boundary: include/exclude decision is identical with `>` vs `>=`
    - For all non-buggy inputs, assignment ordering (cupo limits, fechaResultado order) is unchanged
  - Create tests in `tests/properties/biometria-cycle-integrity.property.test.js` (same file, separate describe block)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 3. Fix for biometria cycle integrity bugs

  - [~] 3.1 Implement Bug 1 fix — Retry counter for SAI null responses in `_procesarCortePendientes()`
    - Add retry counter column in pendiente_biometria (column 78 or available unused column) to persist `intentos_sai_null`
    - When `datosApi` is null: read current retry count, increment, persist new value
    - Add configurable threshold via ScriptProperties (`MAX_INTENTOS_SAI_NULL`, default: 3)
    - When counter reaches threshold: escalate case with `SAI_NO_CONFIRMO` flag instead of leaving in WA_ENVIADO
    - When `datosApi` is non-null (escalation or resolution): reset counter to 0
    - _Bug_Condition: isBugCondition(input) where fase == "WA_ENVIADO" AND saiResponse == null AND noRetryCounterExists_
    - _Expected_Behavior: Increment retry counter on each null, escalate with SAI_NO_CONFIRMO when threshold reached_
    - _Preservation: Non-null SAI responses continue immediate escalation/resolution unchanged (3.1, 3.2)_
    - _Requirements: 2.1, 3.1, 3.2_

  - [~] 3.2 Implement Bug 2 fix — Atomic mark-on-success in `admin_desarchivarBiometrias()`
    - Reorder operations: call `procesarYGuardarLote(paraReponer)` FIRST, wrapped in try/catch
    - Only populate and write `filasAActualizar` with fase="ESCALADA" AFTER `procesarYGuardarLote` succeeds
    - On failure: leave cases as "ARCHIVADA", log error, report partial success to admin
    - Cases resolved as RESUELTA (SAI status changed) can still be marked independently
    - _Bug_Condition: isBugCondition(input) where caller == "admin_desarchivarBiometrias" AND procesarYGuardarLote THROWS_
    - _Expected_Behavior: Cases remain ARCHIVADA on write failure, available for future retry_
    - _Preservation: Successful writes still mark ESCALADA and report count to admin (3.3)_
    - _Requirements: 2.2, 3.3_

  - [~] 3.3 Implement Bug 3 fix — Unify constant reference in `autoAsignarBiometria()`
    - Replace `SpreadsheetApp.openById(ID_WAREHOUSE_USUARIOS)` with `SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID)` (or use `_abrirSSCacheado(TARGET_SOLICITUDES_SS_ID)`)
    - Import/reference `TARGET_SOLICITUDES_SS_ID` from `Código.js` (global scope in Apps Script)
    - Add comment documenting that "solicitud" is the single source for both write (escalation) and read (assignment)
    - Optionally add runtime assertion in health-check: `ID_WAREHOUSE_USUARIOS === TARGET_SOLICITUDES_SS_ID`
    - _Bug_Condition: isBugCondition(input) where caller == "autoAsignarBiometria" AND constantUsed == "ID_WAREHOUSE_USUARIOS"_
    - _Expected_Behavior: autoAsignarBiometria reads from TARGET_SOLICITUDES_SS_ID, same as escalation write target_
    - _Preservation: Assignment ordering, cupo limits, fechaResultado order unchanged (3.4)_
    - _Requirements: 2.3, 3.4_

  - [~] 3.4 Implement Bug 4 fix — Strictly-greater boundary comparison
    - In `autoAsignarBiometria()`: change `fechaResultadoCaseMs >= limiteLiberacionDesaplazamiento.getTime()` to `fechaResultadoCaseMs > limiteLiberacionDesaplazamiento.getTime()`
    - In `_recolectarPendientesPrincipal()`: apply same operator change
    - In `_contarYRecolectarPrincipal()`: apply same operator change
    - Verify all three functions use consistent `>` operator
    - _Bug_Condition: isBugCondition(input) where fechaResultadoCaseMs == limiteLiberacionDesaplazamiento.getTime() AND operator == ">="_
    - _Expected_Behavior: Case at exactly boundary IS included in current corte (offered, not deferred)_
    - _Preservation: Cases strictly before boundary still offered; cases strictly after still deferred (3.5, 3.6)_
    - _Requirements: 2.4, 3.5, 3.6_

  - [~] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Biometria Cycle Integrity Bugs Fixed
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior for all four bugs
    - When this test passes, it confirms:
      - Bug 1: Cases are escalated after N consecutive null SAI responses
      - Bug 2: Cases remain ARCHIVADA when write fails
      - Bug 3: autoAsignarBiometria uses TARGET_SOLICITUDES_SS_ID
      - Bug 4: Cases at boundary are included (not excluded)
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms all four bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [~] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Normal SAI Response, Successful Desarchivar, and Non-Boundary Case Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix:
      - Normal SAI response processing unchanged
      - Successful desarchivar flow unchanged
      - Non-boundary case filtering unchanged
      - Assignment ordering and cupo logic unchanged
      - `_volcarBloque()` protective pattern preserved

- [~] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `npx vitest --run`
  - Ensure all property-based tests pass (exploration + preservation)
  - Ensure no regressions in existing tests (`tests/properties/` and `tests/lib/`)
  - Verify the four fixes are cohesive and do not introduce new edge cases
  - Ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["3.5", "3.6"] },
    { "id": 4, "tasks": ["4"] }
  ]
}
```

## Notes

- Test infrastructure: Pure functions go in `tests/lib/biometria-cycle-integrity-puro.js`, property tests go in `tests/properties/biometria-cycle-integrity.property.test.js`
- The retry counter threshold is configurable via ScriptProperties (`MAX_INTENTOS_SAI_NULL`, default: 3 cortes ≈ 36h)
- Bug 3 fix is a single-line constant swap but has high impact on preventing future misalignment
- Bug 4 fix must be applied consistently across all three functions that use the boundary comparison
- All fixes are localized to `Biometria.js` and `MotorAsignacion.js`
