# Biometria Cycle Integrity Fix — Bugfix Design

## Overview

Four related bugs in the biometry assignment cycle prevent cases from completing their lifecycle reliably. Bug 1: cases stuck in WA_ENVIADO indefinitely when SAI returns null (no retry counter). Bug 2: orphan records when `admin_desarchivarBiometrias` marks ESCALADA before confirming the write succeeded. Bug 3: fragile coupling between `ID_WAREHOUSE_USUARIOS` and `TARGET_SOLICITUDES_SS_ID` constants that happen to share the same value today. Bug 4: off-by-one boundary comparison (`>=` instead of `>`) excludes cases at exactly midnight/noon.

The fix introduces a retry counter with configurable threshold (Bug 1), reorders write-then-mark to mark-only-on-success (Bug 2), unifies the constant reference (Bug 3), and changes the boundary operator from `>=` to `>` (Bug 4). All changes are localized to `Biometria.js` and `MotorAsignacion.js`.

## Glossary

- **Bug_Condition (C)**: The set of conditions under which one of the four bugs manifests — SAI null with no retry tracking, write-before-confirm in desarchivar, dual-constant coupling, or boundary equality exclusion
- **Property (P)**: The desired correct behavior — retry escalation after N nulls, atomic mark-on-success, single constant for solicitud sheet, and strictly-greater boundary comparison
- **Preservation**: Existing behavior that must remain unchanged — normal SAI-response processing, successful desarchivar flow, assignment ordering/cupo logic, and non-boundary case filtering
- **`_procesarCortePendientes()`**: Function in `Biometria.js` that escalates WA_ENVIADO cases to the assignment queue after consulting SAI
- **`admin_desarchivarBiometrias()`**: Admin function in `Biometria.js` that recovers archived biometries back into the assignment queue
- **`autoAsignarBiometria()`**: Self-service function in `Biometria.js` where analysts request biometry cases from the queue
- **`_calcularLimiteLiberacionDesaplazamiento()`**: Function in `Biometria.js` that computes the time boundary for case release
- **`procesarYGuardarLote()`**: Function in `Código.js` that writes escalated cases to the "solicitud" sheet with its own ScriptLock
- **`TARGET_SOLICITUDES_SS_ID`**: Constant in `Código.js` pointing to the warehouse spreadsheet (`1x9groW5...`)
- **`ID_WAREHOUSE_USUARIOS`**: Constant in `Biometria.js` pointing to the same spreadsheet — the fragile duplication

## Bug Details

### Bug Condition

The bugs manifest across four distinct conditions in the biometry cycle. Together they create a fragile pipeline where cases can get permanently stuck, orphaned, misrouted, or delayed.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { bugId: 1|2|3|4, context: CycleContext }
  OUTPUT: boolean

  SWITCH input.bugId:
    CASE 1:
      RETURN input.context.fase == "WA_ENVIADO"
             AND _consultarSaiIndividual(input.context.consecutivo) == null
             AND noRetryCounterExists(input.context)
    CASE 2:
      RETURN input.context.caller == "admin_desarchivarBiometrias"
             AND input.context.casesMarkedEscalada.length > 0
             AND procesarYGuardarLote(input.context.paraReponer) THROWS error
    CASE 3:
      RETURN input.context.caller == "autoAsignarBiometria"
             AND input.context.constantUsed == "ID_WAREHOUSE_USUARIOS"
             AND input.context.constantUsed != "TARGET_SOLICITUDES_SS_ID"
             AND bothResolveToSameValueOnlyByCoincidence()
    CASE 4:
      RETURN input.context.fechaResultadoCaseMs == limiteLiberacionDesaplazamiento.getTime()
             AND comparisonOperator == ">="
  END SWITCH
END FUNCTION
```

### Examples

- **Bug 1**: Case 12345678 in WA_ENVIADO, SAI is unreachable for 5 consecutive cortes (60h). Without a retry counter, the case stays in WA_ENVIADO forever — never escalated, never archived.
- **Bug 2**: Admin runs `admin_desarchivarBiometrias(10)`. SAI confirms 7 cases still pending. The function marks all 7 as ESCALADA in pendiente_biometria and calls `procesarYGuardarLote(7 cases)`. The lock times out → throw. Cases are now ESCALADA but absent from "solicitud". No automatic process revisits ESCALADA cases.
- **Bug 3**: If a future refactor changes `TARGET_SOLICITUDES_SS_ID` but forgets `ID_WAREHOUSE_USUARIOS`, `autoAsignarBiometria` reads from a different spreadsheet than where `_procesarCortePendientes` writes escalated cases. Cases become invisible to assignment.
- **Bug 4**: Case with fechaResultado = "2026-07-22 12:00:00.000". Afternoon corte boundary = 12:00:00.000. Comparison `fechaResultadoCaseMs >= limite` is true → case is filtered out. Morning corte already passed → case not offered until next morning (~18h delay).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When `_consultarSaiIndividual()` returns a valid response, the escalation/resolution logic proceeds in the same corte (Requirement 3.1)
- When SAI returns a non-biometria status, the case is marked RESUELTA immediately (Requirement 3.2)
- When `admin_desarchivarBiometrias` write succeeds, cases are marked ESCALADA and admin sees the count (Requirement 3.3)
- Assignment ordering (cupo limits, fechaResultado order, limiteLiberacion filtering for non-boundary cases) remains unchanged (Requirement 3.4)
- Cases with fechaResultado strictly before the boundary continue to be offered (Requirement 3.5)
- Cases with fechaResultado strictly after the boundary continue to be deferred (Requirement 3.6)
- `_volcarBloque()` inside `_procesarCortePendientes()` continues using the existing protective pattern (Requirement 3.7)

**Scope:**
All inputs that do NOT match the four bug conditions should be completely unaffected by this fix. This includes:
- Normal SAI responses (non-null) during corte processing
- Successful `procesarYGuardarLote` calls in any context
- Reading from the assignment queue when constants are aligned
- Cases with fechaResultado that are not exactly at the boundary timestamp

## Hypothesized Root Cause

Based on the code analysis, the confirmed root causes are:

1. **Bug 1 — Missing Retry Counter**: In `_procesarCortePendientes()` (line ~1791), when `datosApi` is null, the code does `sinRespuesta++; continue;`. No per-case counter is persisted in pendiente_biometria. The case remains in WA_ENVIADO and is re-evaluated next corte, but if SAI is persistently unreachable for that case, it loops indefinitely without escalation.

2. **Bug 2 — Write-Before-Confirm in `admin_desarchivarBiometrias()`**: The function (line ~2050) first builds `filasAActualizar` with fase="ESCALADA", then calls `SpreadsheetApp.flush()` on pendiente_biometria, and THEN calls `procesarYGuardarLote(paraReponer)`. If `procesarYGuardarLote` fails (lock timeout, network error), the cases are already marked ESCALADA. Unlike `_volcarBloque()` in `_procesarCortePendientes()` which was already fixed with the protective try/catch pattern, `admin_desarchivarBiometrias` still uses the old dangerous ordering.

3. **Bug 3 — Dual-Constant Coupling**: `autoAsignarBiometria()` opens `SpreadsheetApp.openById(ID_WAREHOUSE_USUARIOS)` and reads sheet "solicitud". The escalation cycle writes via `procesarYGuardarLote()` which uses `TARGET_SOLICITUDES_SS_ID`. Both constants currently hold `'1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0'` but there is no compile-time or runtime assertion ensuring they stay aligned.

4. **Bug 4 — Off-by-One Boundary Operator**: `_calcularLimiteLiberacionDesaplazamiento()` returns `hoy00` (midnight) for morning sessions or `hoy00 + 12h` (noon) for afternoon sessions. The comparison in `autoAsignarBiometria` and `_recolectarPendientesPrincipal` uses `fechaResultadoCaseMs >= limiteLiberacionDesaplazamiento.getTime()` to filter (exclude) cases. A case with fechaResultado exactly AT the boundary is excluded from both the current session (filtered out) and was already missed by the previous session.

## Correctness Properties

Property 1: Bug Condition — SAI Null Retry Escalation

_For any_ case in WA_ENVIADO phase where `_consultarSaiIndividual()` returns null on N consecutive cortes (configurable, default 3), the fixed `_procesarCortePendientes` function SHALL escalate the case to the assignment queue with a flag indicating SAI did not confirm, incrementing a persisted retry counter on each null response and triggering escalation when the threshold is reached.

**Validates: Requirements 2.1**

Property 2: Bug Condition — Atomic Mark-on-Success in Desarchivar

_For any_ invocation of `admin_desarchivarBiometrias` where `procesarYGuardarLote` throws an error, the fixed function SHALL NOT mark the affected cases as "ESCALADA" in pendiente_biometria; they SHALL remain as "ARCHIVADA" and be available for retry in a future admin invocation.

**Validates: Requirements 2.2**

Property 3: Bug Condition — Unified Constant for Solicitud Sheet

_For any_ read operation in `autoAsignarBiometria` that accesses the "solicitud" sheet, the fixed function SHALL use `TARGET_SOLICITUDES_SS_ID` (the same constant used by `procesarYGuardarLote` in the escalation cycle), eliminating the fragile coupling with `ID_WAREHOUSE_USUARIOS`.

**Validates: Requirements 2.3**

Property 4: Bug Condition — Strictly-Greater Boundary Comparison

_For any_ case whose fechaResultado is exactly at the boundary time (midnight for morning corte, noon for afternoon corte), the fixed filtering logic SHALL use `>` instead of `>=`, so the case IS offered in the current corte rather than being deferred.

**Validates: Requirements 2.4**

Property 5: Preservation — Normal SAI Response Processing

_For any_ case in WA_ENVIADO where `_consultarSaiIndividual()` returns a valid (non-null) response, the fixed code SHALL produce the same escalation or resolution behavior as the original code, preserving immediate processing regardless of the retry counter value.

**Validates: Requirements 3.1, 3.2**

Property 6: Preservation — Successful Desarchivar Write Path

_For any_ invocation of `admin_desarchivarBiometrias` where `procesarYGuardarLote` succeeds, the fixed function SHALL produce the same result as the original — cases marked ESCALADA and admin sees the restoration count.

**Validates: Requirements 3.3**

Property 7: Preservation — Non-Boundary Case Filtering

_For any_ case whose fechaResultado is strictly before or strictly after the boundary time, the fixed filtering logic SHALL produce the same include/exclude decision as the original code, preserving assignment ordering and cupo behavior.

**Validates: Requirements 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `Biometria.js`

**Bug 1 — Retry Counter for SAI Null Responses**

**Function**: `_procesarCortePendientes()`

**Specific Changes**:
1. **Add retry counter column**: Use an unused column in pendiente_biometria (or add column 78) to persist `intentos_sai_null` per case
2. **Increment on null**: When `datosApi` is null, read the current retry count for that case, increment it, and persist the new value
3. **Threshold check**: If the counter reaches the configurable threshold (default: 3, stored in ScriptProperties as `MAX_INTENTOS_SAI_NULL`), escalate the case with a special flag (`SAI_NO_CONFIRMO`) instead of the normal ESCALADA flow
4. **Reset on success**: When `datosApi` is non-null (whether ESCALADA or RESUELTA), reset the counter to 0

**Bug 2 — Atomic Mark-on-Success in Desarchivar**

**Function**: `admin_desarchivarBiometrias()`

**Specific Changes**:
1. **Reorder operations**: Call `procesarYGuardarLote(paraReponer)` FIRST, wrapped in try/catch
2. **Conditional marking**: Only populate and write `filasAActualizar` with fase="ESCALADA" AFTER `procesarYGuardarLote` succeeds
3. **On failure**: Leave failed cases as "ARCHIVADA", log the error, and report partial success to admin (cases whose SAI was already resolved as RESUELTA can still be marked independently since they don't depend on `procesarYGuardarLote`)

**Bug 3 — Unify Constant Reference**

**Function**: `autoAsignarBiometria()`

**Specific Changes**:
1. **Replace constant**: Change `SpreadsheetApp.openById(ID_WAREHOUSE_USUARIOS)` to `SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID)` (or use `_abrirSSCacheado(TARGET_SOLICITUDES_SS_ID)` for consistency with the rest of the codebase)
2. **Add runtime assertion (optional guard)**: At module load or in a health-check function, assert `ID_WAREHOUSE_USUARIOS === TARGET_SOLICITUDES_SS_ID` with a warning log if they diverge
3. **Update comment**: Document that "solicitud" is the single source for both write (escalation) and read (assignment)

**Bug 4 — Boundary Comparison Operator**

**Functions**: `autoAsignarBiometria()`, `_recolectarPendientesPrincipal()`, `_contarYRecolectarPrincipal()`

**Specific Changes**:
1. **Change operator**: Replace `fechaResultadoCaseMs >= limiteLiberacionDesaplazamiento.getTime()` with `fechaResultadoCaseMs > limiteLiberacionDesaplazamiento.getTime()` in all three locations
2. **Verify consistency**: All three functions apply the same boundary rule — the change must be applied in all of them

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write pure-function tests that simulate the bug conditions using the existing test infrastructure (`tests/lib/` and `tests/properties/`). Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Bug 1 — Repeated null SAI**: Simulate 5 consecutive cortes where `_consultarSaiIndividual` returns null for a case. Verify the case is never escalated (will pass on unfixed code, confirming the bug exists)
2. **Bug 2 — Write failure after mark**: Simulate `procesarYGuardarLote` throwing after cases are marked ESCALADA. Verify cases are orphaned (will pass on unfixed code, confirming the bug exists)
3. **Bug 3 — Constant divergence**: Verify that `autoAsignarBiometria` uses `ID_WAREHOUSE_USUARIOS` while `procesarYGuardarLote` uses `TARGET_SOLICITUDES_SS_ID` (static analysis, will confirm on unfixed code)
4. **Bug 4 — Boundary exclusion**: Generate a case with fechaResultado exactly at noon, run the filtering logic. Verify it is excluded (will pass on unfixed code, confirming the bug exists)

**Expected Counterexamples**:
- Bug 1: After N cortes with null SAI, case remains in WA_ENVIADO with no escalation path
- Bug 2: Cases marked ESCALADA are not in "solicitud" after write failure
- Bug 4: Case at exactly noon boundary is filtered out of the current session

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  SWITCH input.bugId:
    CASE 1:
      result := procesarCortePendientes_fixed(input)
      ASSERT retryCounter(input.consecutivo) == previousCount + 1
      IF retryCounter >= threshold THEN ASSERT case IS escalated with SAI_NO_CONFIRMO flag
    CASE 2:
      result := admin_desarchivarBiometrias_fixed(input)
      IF procesarYGuardarLote THROWS THEN ASSERT fase(input.cases) == "ARCHIVADA"
    CASE 3:
      ASSERT constantUsedByAutoAsignar == TARGET_SOLICITUDES_SS_ID
    CASE 4:
      result := filterCandidates_fixed(input)
      ASSERT case with fechaResultado == boundary IS included
  END SWITCH
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (diverse fechaResultado values, various SAI response patterns)
- It catches edge cases that manual unit tests might miss (e.g., fechaResultado one millisecond before/after boundary)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for normal SAI responses, successful desarchivar flows, and non-boundary cases. Then write property-based tests capturing that behavior.

**Test Cases**:
1. **SAI Response Preservation**: For any non-null SAI response, verify escalation/resolution decision is identical before and after fix
2. **Successful Desarchivar Preservation**: For any `procesarYGuardarLote` that succeeds, verify cases are marked ESCALADA and admin message is identical
3. **Non-Boundary Filtering Preservation**: For any fechaResultado that is NOT exactly at midnight/noon, verify the include/exclude decision is identical before and after fix
4. **Assignment Queue Reading Preservation**: Verify that with unified constant, the same data is read and assignment ordering is unchanged

### Unit Tests

- Test retry counter increment on null SAI response
- Test retry counter reset on valid SAI response
- Test escalation trigger at exactly N=3 consecutive nulls
- Test `admin_desarchivarBiometrias` with simulated `procesarYGuardarLote` failure — cases remain ARCHIVADA
- Test `admin_desarchivarBiometrias` with successful write — cases become ESCALADA
- Test boundary comparison with fechaResultado at exactly midnight (morning corte)
- Test boundary comparison with fechaResultado at exactly noon (afternoon corte)
- Test boundary comparison 1ms before and 1ms after boundary

### Property-Based Tests

- Generate random sequences of null/non-null SAI responses and verify retry counter state machine is correct
- Generate random `procesarYGuardarLote` success/failure scenarios and verify atomicity of fase updates
- Generate random fechaResultado timestamps across the full day and verify the `>` operator produces correct include/exclude decisions for all times
- Generate random game states (varying number of pending cases, cupos, ordering) and verify assignment behavior is preserved for non-boundary cases

### Integration Tests

- Test full cicloBiometriaPendiente flow with a case that gets null SAI 3 times then escalates
- Test admin_desarchivarBiometrias end-to-end with lock contention simulated
- Test autoAsignarBiometria reading from the unified constant after escalation writes
- Test that cases at exactly noon boundary are assigned in the same afternoon corte
