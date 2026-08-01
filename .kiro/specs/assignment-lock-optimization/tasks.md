# Tasks: Assignment Lock Optimization

## Task 1: Create telemetry infrastructure

- [ ] 1.1 Create `_registrarTelemetriaLock(functionName, lockDurationMs, retriesUsed, success)` function in Código.js that persists lock metrics to ScriptProperties key `LOCK_TELEMETRY_V1` (JSON array, capped at last 100 entries)
- [ ] 1.2 Create `_incrementarLockTimeout(functionName)` function that increments the `LOCK_TIMEOUT_COUNT_V1` ScriptProperty counter when waitLock() throws
- [ ] 1.3 Create `admin_getLockTelemetry()` function in Admin.js that returns the stored telemetry entries and timeout counter for admin panel review
- [ ] 1.4 Add test `test_TelemetriaLock_RegistraYLee` in Tests.js that verifies writing and reading telemetry entries works correctly

## Task 2: Refactor RequestLeadUnificado — Phase 1 (reads outside lock)

- [ ] 2.1 Extract all read operations (openById, _getDataUsuarios, user validation, turno/permiso checks, equipo resolution, cupos, conteo from all sources, capacity check) into a new helper function `_preReadRequestLead(equipoIdOverride)` that returns all computed state needed for Phase 2, or an early-return error object
- [ ] 2.2 Extract pending case collection and candidate selection into Phase 1 flow: `_recolectarPendientesPrincipal`, `_recolectarPendientesReestudios`, `_ordenarYSeleccionarCandidatos` all run before lock acquisition
- [ ] 2.3 Ensure the `seleccionados` array includes `solicitudId` (col A value) for each candidate, needed for TextFinder re-verification in Phase 2

## Task 3: Refactor RequestLeadUnificado — Phase 2 (lock with re-verification)

- [ ] 3.1 Implement the locked section: acquire ScriptLock, iterate over seleccionados with re-verification loop (TextFinder check for solicitudId existence + col 28 empty for principal / col 7 empty for reestudios)
- [ ] 3.2 Implement cupo re-check inside lock: before confirming each candidate, re-read `_obtenerConteoHoyAnalista(userEmail)` and verify `conteoActualizado[candidate.tipo] < cuotas[candidate.tipo]`; if cupo full, skip candidate and count as retry
- [ ] 3.3 Implement retry logic: up to 3 retries (retriesUsed counter), advancing to next candidate in the pre-sorted list; if all exhausted, return user-friendly message
- [ ] 3.4 Handle row index drift: use `match.getRow()` from TextFinder result as the actual row index for assignment writes (replacing pre-computed rowIndex)
- [ ] 3.5 Execute assignment writes (_asignarCasoPrincipal / _asignarCasoReestudios) using verified row indices, flush, release lock
- [ ] 3.6 Move `_actualizarFaseBiometriaPendiente` call to AFTER lock release (non-critical, idempotent)
- [ ] 3.7 Add telemetry: record lock duration and retry count via `_registrarTelemetriaLock`; on waitLock timeout, call `_incrementarLockTimeout`

## Task 4: Refactor autoAsignarBiometria — Phase 1 (reads outside lock)

- [ ] 4.1 Move all read operations outside the lock: openById, user validation, Historico_Gestiones scan, cupo computation, solicitud sheet reading, candidate filtering and sorting — all before lock acquisition
- [ ] 4.2 Pre-select more candidates than needed (cupoDisponible + 3) as a buffer for potential retries during re-verification

## Task 5: Refactor autoAsignarBiometria — Phase 2 (lock with re-verification)

- [ ] 5.1 Implement the locked section: acquire ScriptLock, iterate over pre-selected candidates with re-verification (TextFinder check for solicitudId + col 28 empty)
- [ ] 5.2 Implement cupo re-check for desaplazamiento: re-read `_obtenerConteoHoyAnalista(userEmail).desaplazamiento` inside lock before each candidate confirmation
- [ ] 5.3 Implement retry logic (max 3), same pattern as RequestLeadUnificado
- [ ] 5.4 Execute writes (appendRow to Historico_Gestiones, deleteRow from solicitud), flush, release lock
- [ ] 5.5 Move `_actualizarFaseBiometriaPendiente` call to AFTER lock release
- [ ] 5.6 Add telemetry recording for autoAsignarBiometria

## Task 6: Unit tests for re-verification logic

- [ ] 6.1 Add test `test_ReVerification_CaseTaken`: setup row with col 28 non-empty, verify TextFinder + getValue correctly detects case as taken
- [ ] 6.2 Add test `test_ReVerification_CaseDeleted`: verify TextFinder returns null for non-existent solicitudId
- [ ] 6.3 Add test `test_ReVerification_CaseAvailable`: setup row with col 28 empty, verify detection of availability
- [ ] 6.4 Add test `test_CupoReCheck_BlocksWhenFull`: set counter to cupo limit, verify re-check correctly identifies cupo as full
- [ ] 6.5 Add test `test_ReVerification_RowDrift`: insert row above candidate, verify TextFinder locates correct row despite index shift
- [ ] 6.6 Update existing test `test_T2_LockServiceEnFunciones` to reflect the new lock pattern (lock is still used, just moved later in the function)

## Task 7: Integration validation and cleanup

- [ ] 7.1 Run existing test suite (Tests.js) and verify all tests pass with the refactored code
- [ ] 7.2 Verify the function still returns correct response structure: `{ success: boolean, message: string, nueva?: boolean }`
- [ ] 7.3 Document the manual concurrency test procedure as a comment block in Tests.js: two browser tabs, two test accounts, one pending case — verify only one gets assigned
- [ ] 7.4 Add Logger.log diagnostic at lock acquire/release for initial deployment monitoring (supplements the persistent telemetry)

## Task 8: Plan de reversión

- [ ] 8.1 Confirmar que existe un commit/versión del código actual en clasp/git ANTES de aplicar cambios a MotorAsignacion.js y Biometria.js (el commit previo al push de Task 2 es el punto de restauración)
- [ ] 8.2 Documentar el procedimiento de reversión: `git checkout <commit-pre-refactor> -- MotorAsignacion.js Biometria.js && clasp push` restaura el comportamiento anterior sin afectar otros archivos
- [ ] 8.3 Definir criterios de reversión en producción:
    - Si más del 20% de las invocaciones de RequestLeadUnificado retornan "Casos tomados por otros. Reintenta." durante la primera hora de uso (verificable vía telemetría Task 1)
    - Si aparecen duplicados en Historico_Gestiones (mismo solicitudId asignado a 2 analistas diferentes con menos de 1 minuto de diferencia)
    - Si el timeout counter (`LOCK_TIMEOUT_COUNT_V1`) aumenta más rápido que antes del deploy (comparar con baseline de la semana anterior)
- [ ] 8.4 Verificar que la telemetría (Task 1) está operativa ANTES de desplegar Tasks 2-5, para tener baseline de métricas pre-cambio
