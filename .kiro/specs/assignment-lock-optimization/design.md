# Design: Assignment Lock Optimization

## Technical Context

- **Runtime:** Google Apps Script V8
- **Lock mechanism:** `LockService.getScriptLock()` — project-wide, one single lock for all functions
- **Affected functions:** `RequestLeadUnificado` (MotorAsignacion.js) and `autoAsignarBiometria` (Biometria.js)
- **Target sheet:** "solicitud" (main assignment queue, ~70 rows typical)
- **Re-verification tool:** `TextFinder` API — allows reading a single cell value by content search without loading the entire sheet

## Architecture: Two-Phase Lock Pattern

Both functions follow the same anti-pattern (lock → read everything → compute → write → release).
The fix applies the same two-phase pattern to both:

```
Phase 1 (NO LOCK): Read all data, validate user, compute candidates, sort/select
Phase 2 (WITH LOCK): Re-verify selected candidate is available → write → flush → release
```

This reduces lock hold time from ~3-7s to <1s (only the verification + write operations).

---

## 1. RequestLeadUnificado — Redesigned Flow

### FUERA del lock (Phase 1 — reads + computation)

```pseudocode
FUNCTION RequestLeadUnificado(equipoIdOverride)

  // ─── PHASE 1: ALL READS — NO LOCK ───────────────────────────────

  // 1. Open spreadsheets
  ss ← SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID)
  ssReestudios ← SpreadsheetApp.openById(ID_REEST)

  // 2. Validate user: email, estado, turno, permisos
  userEmail ← Session.getActiveUser().getEmail()
  dataUsuarios ← _getDataUsuarios()
  usuarioInfo ← find user in dataUsuarios
  IF NOT valid (not found, not ACTIVO, no turno, has permiso)
    RETURN error (no lock needed)

  // 3. Resolve equipo, cupos
  equipo ← resolverEquipoDesdeEspecialidad(...)
  cuotas ← obtenerCuposEfectivos(...)

  // 4. Count today's assignments (from principal + reestudios + contadores)
  conteoHoyTotal ← count from all sources
  capacidadDisponible ← capTotal - capPendienteReal
  IF capacidadDisponible < 1
    RETURN error (no lock needed)

  // 5. Collect pending cases from both sheets
  pendientes ← _recolectarPendientesPrincipal(...) + _recolectarPendientesReestudios(...)
  IF pendientes is empty
    RETURN error (no lock needed)

  // 6. Sort and select candidates (pure logic, produces ORDERED list)
  resultadoSeleccion ← _ordenarYSeleccionarCandidatos(...)
  seleccionados ← resultadoSeleccion.seleccionados  // ordered array of candidates
  IF seleccionados is empty
    RETURN error (no lock needed)
```

### DENTRO del lock (Phase 2 — verify + write)

```pseudocode
  // ─── PHASE 2: LOCK — VERIFY + WRITE ─────────────────────────────

  lock ← LockService.getScriptLock()
  TRY lock.waitLock(25000)
  CATCH → RETURN "Sistema ocupado"

  TRY
    asignados ← []
    maxRetries ← 3
    retriesUsed ← 0
    candidateIndex ← 0

    WHILE asignados.length < cupoDisponible
      AND candidateIndex < seleccionados.length
      AND retriesUsed < maxRetries DO

      candidate ← seleccionados[candidateIndex]
      candidateIndex ← candidateIndex + 1

      // ─── RE-VERIFICATION (TextFinder) ─────────────
      IF candidate.base = 'PRINCIPAL' THEN
        hoja ← ss.getSheetByName("solicitud")
        // Check: row still has same solicitudId AND col 28 (assignedEmail) is empty
        match ← hoja.getRange(candidate.rowIndex, 1)
                     .createTextFinder(candidate.solicitudId)
                     .matchEntireCell(true)
                     .findNext()
        IF match IS NULL THEN
          // Row was deleted/moved — case no longer at this position
          retriesUsed ← retriesUsed + 1
          CONTINUE
        END IF
        // Verify the row at that position still has empty assignment (col 28)
        assignedEmail ← hoja.getRange(match.getRow(), 28).getValue()
        IF assignedEmail ≠ "" THEN
          // Already taken by another analyst
          retriesUsed ← retriesUsed + 1
          CONTINUE
        END IF

        // ─── CUPO RE-CHECK (PropertiesService, <50ms) ────
        conteoActualizado ← _obtenerConteoHoyAnalista(userEmail)
        IF conteoActualizado[candidate.tipo] >= cuotas[candidate.tipo] THEN
          // Cupo for this type was filled by another analyst between Phase 1 and now
          retriesUsed ← retriesUsed + 1
          CONTINUE
        END IF

        // Update candidate rowIndex in case it shifted
        candidate.rowIndex ← match.getRow()

      ELSE  // REESTUDIOS
        hojaR ← ssReestudios.getSheetByName("ORIGEN")
        match ← hojaR.getRange(candidate.rowIndex, 1)
                      .createTextFinder(candidate.solicitudId)
                      .matchEntireCell(true)
                      .findNext()
        IF match IS NULL THEN
          retriesUsed ← retriesUsed + 1
          CONTINUE
        END IF
        assignedEmail ← hojaR.getRange(match.getRow(), 7).getValue()
        IF assignedEmail ≠ "" THEN
          retriesUsed ← retriesUsed + 1
          CONTINUE
        END IF

        // ─── CUPO RE-CHECK ────────────────────────────────
        conteoActualizado ← _obtenerConteoHoyAnalista(userEmail)
        IF conteoActualizado[candidate.tipo] >= cuotas[candidate.tipo] THEN
          retriesUsed ← retriesUsed + 1
          CONTINUE
        END IF

        candidate.rowIndex ← match.getRow()
      END IF

      // ─── WRITE ASSIGNMENT ──────────────────────────
      asignados.push(candidate)
    END WHILE

    IF asignados is empty THEN
      RETURN { success: false, message: "Casos tomados por otros. Reintenta." }
    END IF

    // ─── EXECUTE WRITES (same logic as current) ──────
    principales ← asignados filtered by base='PRINCIPAL', sorted desc by rowIndex
    reestudios ← asignados filtered by base≠'PRINCIPAL', sorted desc by rowIndex

    FOR EACH lead IN principales DO
      _asignarCasoPrincipal(lead, userEmail, nombreUsuario, fechaHora, hoja, ss)
    END FOR

    FOR EACH lead IN reestudios DO
      _asignarCasoReestudios(lead, userEmail, nombreUsuario, fechaHora, hojaR, ssReestudios)
    END FOR

    SpreadsheetApp.flush()

  FINALLY
    lock.releaseLock()
  END TRY

  // ─── POST-LOCK (non-critical) ───────────────────────────────────
  // Biometria pendiente registration (idempotent, non-critical)
  IF any assigned are desaplazamiento THEN
    _actualizarFaseBiometriaPendiente(ids, "ASIGNADA")
  END IF

  RETURN { success: true, message: ... }
END FUNCTION
```

---

## 2. autoAsignarBiometria — Redesigned Flow

### FUERA del lock (Phase 1 — reads + computation)

```pseudocode
FUNCTION autoAsignarBiometria()

  // ─── PHASE 1: ALL READS — NO LOCK ───────────────────────────────

  // 1. Open spreadsheet, validate user
  ssWarehouse ← SpreadsheetApp.openById(ID_WAREHOUSE_USUARIOS)
  userEmail ← Session.getActiveUser().getEmail()
  dataUsuarios ← hojaUsuarios.getDataRange().getValues()
  usuario ← find user
  IF NOT valid (not found, not ACTIVO, has permiso, capTotal <= 0)
    RETURN error

  // 2. Read Historico_Gestiones, compute cargaActual + conteoHoyBio + idsEnGestion
  hojaHist ← ssWarehouse.getSheetByName("Historico_Gestiones")
  dataHist ← hojaHist.getRange(...).getValues()
  // ... iterate to build cargaActual, conteoHoyBio, idsEnGestion

  cupoDisponible ← min(capTotal - cargaActual, cupoBioDiario - conteoHoyBio)
  IF cupoDisponible <= 0
    RETURN error

  // 3. Read "solicitud" sheet, collect eligible candidates
  hojaSolicitud ← ssWarehouse.getSheetByName("solicitud")
  datosSol ← hojaSolicitud.getRange(...).getValues()
  candidatosElegibles ← filter and sort candidates
  IF candidatosElegibles is empty
    RETURN error

  // 4. Pre-select top candidates (more than needed, as buffer for retries)
  candidatosPreSeleccionados ← candidatosElegibles.slice(0, cupoDisponible + 3)
```

### DENTRO del lock (Phase 2 — verify + write)

```pseudocode
  // ─── PHASE 2: LOCK — VERIFY + WRITE ─────────────────────────────

  lock ← LockService.getScriptLock()
  TRY lock.waitLock(10000)
  CATCH → RETURN "Sistema ocupado"

  TRY
    candidatosParaAsignar ← []
    maxRetries ← 3
    retriesUsed ← 0
    idx ← 0

    WHILE candidatosParaAsignar.length < cupoDisponible
      AND idx < candidatosPreSeleccionados.length
      AND retriesUsed < maxRetries DO

      candidato ← candidatosPreSeleccionados[idx]
      idx ← idx + 1

      // ─── RE-VERIFICATION ───────────────────────────
      // Verify: solicitudId still exists at that row, estado still APROBADO_PENDIENTE_BIOMETRIA,
      // and col 28 (assigned) still empty
      match ← hojaSolicitud.getRange(candidato.sheetRowIndex, 1)
                            .createTextFinder(candidato.solicitudId)
                            .matchEntireCell(true)
                            .findNext()
      IF match IS NULL THEN
        retriesUsed ← retriesUsed + 1
        CONTINUE
      END IF

      rowActual ← match.getRow()
      asignado ← hojaSolicitud.getRange(rowActual, 28).getValue()
      IF asignado ≠ "" THEN
        retriesUsed ← retriesUsed + 1
        CONTINUE
      END IF

      // ─── CUPO RE-CHECK (PropertiesService, <50ms) ────
      conteoActualizado ← _obtenerConteoHoyAnalista(userEmail)
      IF conteoActualizado.desaplazamiento >= cupoBioDiario THEN
        // Cupo was filled by concurrent assignment
        retriesUsed ← retriesUsed + 1
        CONTINUE
      END IF

      candidato.sheetRowIndex ← rowActual
      candidatosParaAsignar.push(candidato)
    END WHILE

    IF candidatosParaAsignar is empty THEN
      RETURN { success: false, message: "Casos tomados por otros. Reintenta." }
    END IF

    // ─── WRITE: build history rows + delete from solicitud ────────
    filasHist ← build history rows from candidatosParaAsignar
    hojaHist.getRange(...).setValues(filasHist)

    // Delete in reverse order to not invalidate indices
    filasAEliminar ← candidatosParaAsignar.map(c → c.sheetRowIndex).sort(desc)
    FOR EACH fila IN filasAEliminar DO
      hojaSolicitud.deleteRow(fila)
    END FOR

    SpreadsheetApp.flush()

  FINALLY
    lock.releaseLock()
  END TRY

  // ─── POST-LOCK ──────────────────────────────────────────────────
  _actualizarFaseBiometriaPendiente(idsAsignadas, "ASIGNADA")
  RETURN { success: true, ... }
END FUNCTION
```

---

## 3. Re-Verification Strategy Details

### What cell to read inside the lock

| Function | Sheet | Verification check |
|----------|-------|-------------------|
| RequestLeadUnificado (principal) | "solicitud" | Col A (1) = solicitudId AND Col AB (28) = empty |
| RequestLeadUnificado (reestudios) | "ORIGEN" | Col A (1) = solicitudId AND Col G (7) = empty |
| autoAsignarBiometria | "solicitud" | Col A (1) = solicitudId AND Col AB (28) = empty |

### Why TextFinder

- `TextFinder` reads ONE cell value with a direct search — no need to load entire sheet
- Handles the case where rows shifted (other process deleted a row above, moving our target down)
- `matchEntireCell(true)` prevents partial matches on similar IDs
- Estimated cost: ~100-200ms per verification

### What happens if re-verification fails

1. **Case taken by another analyst:** Col 28 not empty → skip, try next candidate (retriesUsed++)
2. **Case no longer in sheet:** TextFinder returns null (deleted, moved to Historico) → skip, try next candidate (retriesUsed++)
3. **Max retries (3) exhausted:** Release lock, return "Casos tomados por otros analistas. Reintenta."
4. **All candidates exhausted:** Same as max retries — return message to retry

### Row index drift

Between Phase 1 (reading full sheet) and Phase 2 (inside lock), another process may have deleted rows, shifting indices. TextFinder solves this by searching by content (solicitudId) rather than relying on the pre-computed row index. The verified `match.getRow()` gives the actual current row.

---

## 4. Correctness Properties

### P1: Fix Checking — Lock Duration

```pascal
FOR ALL invocations I of RequestLeadUnificado' DO
  lockAcquireTime ← timestamp when lock.waitLock() returns
  lockReleaseTime ← timestamp when lock.releaseLock() is called
  ASSERT (lockReleaseTime - lockAcquireTime) < 1000ms
END FOR
```

### P2: Fix Checking — Reads Outside Lock

```pascal
FOR ALL invocations I of RequestLeadUnificado' DO
  ASSERT openById() calls happen BEFORE lock.waitLock()
  ASSERT getValues() calls for counting/collecting happen BEFORE lock.waitLock()
  ASSERT _ordenarYSeleccionarCandidatos() is called BEFORE lock.waitLock()
END FOR
```

### P3: Preservation — Mutual Exclusion (No Duplicate Assignment)

```pascal
FOR ALL concurrent invocations (A, B) targeting the same solicitudId DO
  IF both pass Phase 1 with same candidate THEN
    // Inside lock (sequential):
    ASSERT only ONE of (A, B) finds col 28 empty during re-verification
    ASSERT the other finds col 28 non-empty and retries with next candidate
  END IF
END FOR
```

### P4: Preservation — Atomicity

```pascal
FOR ALL invocations I that enter Phase 2 DO
  IF I successfully writes assignment THEN
    ASSERT row is removed from "solicitud" in same transaction
    ASSERT row is appended to "Historico_Gestiones" in same transaction
    ASSERT SpreadsheetApp.flush() is called before lock.releaseLock()
  ELSE
    ASSERT no partial writes exist (lock released without flush on error)
  END IF
END FOR
```

### P5: Preservation — Cupo Limits (Strict Guarantee)

```pascal
FOR ALL invocations I DO
  // Inside Phase 2, before each candidate assignment:
  conteoActualizado ← _obtenerConteoHoyAnalista(userEmail)  // re-read from PropertiesService
  cuotasTipo ← configured limits
  ASSERT conteoActualizado[candidate.tipo] < cuotasTipo[candidate.tipo]
  // If violated → skip candidate, retry with next (counts against maxRetries)
  // This guarantees NO overrun: the cupo check is performed atomically
  // inside the lock, same serialization as the current code provides.
END FOR
```

### P6: Preservation — Sorting/Priority Unchanged

```pascal
FOR ALL invocations I DO
  candidates_old ← _ordenarYSeleccionarCandidatos(pendientes, cuotas, conteo, equipo, props, cupo, scoreFn)
  candidates_new ← same call with same inputs
  ASSERT candidates_old.order = candidates_new.order
  // The sorting function is pure (no side effects) — called identically in both versions
END FOR
```

---

## 5. Edge Cases and Error Handling

| Scenario | Behavior |
|----------|----------|
| All 3 retry attempts fail (cases taken) | Return user-friendly message, no assignment |
| Lock not acquired (waitLock timeout) | Return "Sistema ocupado" — same as current |
| Error during write inside lock | `finally` block ensures lock.releaseLock() — no dangling locks |
| Sheet reference becomes stale between phases | TextFinder re-locates by content, handles row drift |
| Concurrent deleteRow shifts multiple rows | Each candidate verified independently by ID, not position |
| Another trigger holds lock when analyst arrives | Reduced contention: analyst waits for trigger's write phase only (<5s) instead of trigger's full read+write (~30s) |

---

## 6. Phase 2 — Future Work (Out of Scope)

The following functions retain the ScriptLock for extended periods but are **not addressed in this spec**. They should be evaluated after measuring the impact of this optimization:

| Function | Current lock duration | Optimization opportunity |
|----------|---------------------|--------------------------|
| `limpiarBiometriasResueltas` | Up to 30s (SAI queries + rewrite) | Already does reads before lock; lock phase is the rewrite — could batch smaller |
| `eliminarSolicitudesFinalizadas` | Variable (rewrite) | Called from actualizarSolicitudesNuevasAPI every 5-10 min; could pre-filter outside lock |
| `_enviarPrimerContactoBiometria` | 5-30s (writes pendiente_biometria) | Writes to a DIFFERENT spreadsheet — in an ideal world wouldn't need the same lock, but GAS limitation |
| `moverAListaEsperaCodeudor` | Variable | Writes to "solicitud" — needs lock, but already does read + filter outside |

**Measurement plan:** After deploying the RequestLeadUnificado + autoAsignarBiometria optimization, instrument both functions with persistent telemetry:

### Persistent Telemetry Design

```pseudocode
// At lock.waitLock() success:
lockAcquiredAt ← Date.now()

// At lock.releaseLock():
lockDurationMs ← Date.now() - lockAcquiredAt

// Persist to ScriptProperties (append to JSON array, capped at last 100 entries):
_registrarTelemetriaLock(functionName, lockDurationMs, retriesUsed, success)
```

**Storage mechanism:** `PropertiesService.getScriptProperties()` with a key `LOCK_TELEMETRY_V1` storing a JSON array of the last 100 invocations:
```json
[
  {"fn":"RequestLeadUnificado","ts":1750000000,"lockMs":340,"retries":0,"ok":true},
  {"fn":"autoAsignarBiometria","ts":1750000060,"lockMs":520,"retries":1,"ok":true}
]
```

**Admin read-out function:** `admin_getLockTelemetry()` returns the stored entries for the admin panel — allows reviewing lock durations and retry rates over the past week without needing Stackdriver access.

**"Sistema ocupado" counter:** Separate property `LOCK_TIMEOUT_COUNT_V1` (integer) incremented each time `waitLock()` throws. Resettable via admin panel. Provides a single number to compare before/after deployment.

---

## 7. Testing Strategy for Concurrent Exclusion

### Limitation

GAS does not support threads, async, or true parallelism within a single execution. You cannot invoke two `RequestLeadUnificado` calls simultaneously from within a test function.

### Approach: Simulated Race Condition (Unit Test)

The re-verification logic inside the lock is a pure conditional check that can be tested deterministically:

```pseudocode
// TEST: Re-verification finds case already taken
FUNCTION test_ReVerification_CaseTaken()
  // Setup: write a "solicitud" row with solicitudId="TEST-001", col 28 = "otro@email.com"
  // (simulates another analyst having taken it between Phase 1 and Phase 2)
  
  hoja.getRange(testRow, 28).setValue("otro@email.com")
  
  // Act: run the re-verification logic
  match ← hoja.getRange(testRow, 1).createTextFinder("TEST-001").matchEntireCell(true).findNext()
  assignedEmail ← hoja.getRange(match.getRow(), 28).getValue()
  
  // Assert: verification detects the case is taken
  ASSERT assignedEmail ≠ ""  // → should trigger retry with next candidate
  
  // Cleanup
  hoja.deleteRow(testRow)
END FUNCTION
```

```pseudocode
// TEST: Re-verification finds case deleted (row shifted)
FUNCTION test_ReVerification_CaseDeleted()
  // Setup: candidate was at row 5 during Phase 1, but row was deleted before Phase 2
  // TextFinder should return null
  
  match ← hoja.getRange(1, 1, hoja.getLastRow(), 1)
               .createTextFinder("NONEXISTENT-ID")
               .matchEntireCell(true)
               .findNext()
  
  ASSERT match IS NULL  // → should trigger retry
END FUNCTION
```

```pseudocode
// TEST: Re-verification succeeds (happy path)
FUNCTION test_ReVerification_CaseAvailable()
  // Setup: write row with solicitudId="TEST-002", col 28 = "" (unassigned)
  
  match ← hoja.getRange(testRow, 1).createTextFinder("TEST-002").matchEntireCell(true).findNext()
  assignedEmail ← hoja.getRange(match.getRow(), 28).getValue()
  
  ASSERT assignedEmail = ""  // → proceed to assign
  
  // Cleanup
  hoja.deleteRow(testRow)
END FUNCTION
```

```pseudocode
// TEST: Cupo re-check prevents over-assignment
FUNCTION test_CupoReCheck_BlocksWhenFull()
  // Setup: simulate two candidates of type 'digital' with cupo = 1
  // First: set the incremental counter to show digital = 1 (already at limit)
  _setContadorCupoHoyParaTest(userEmail, 'digital', 1)
  cuotas ← { digital: 1 }
  
  // Act: inside-lock cupo re-check for a digital candidate
  conteoActualizado ← _obtenerConteoHoyAnalista(userEmail)
  
  // Assert: candidate should be skipped (cupo full)
  ASSERT conteoActualizado.digital >= cuotas.digital  // → retry with next candidate
  
  // Cleanup
  _setContadorCupoHoyParaTest(userEmail, 'digital', 0)
END FUNCTION
```

### Manual Concurrency Verification

For real concurrency testing (two actual simultaneous invocations hitting the same ScriptLock):

1. **Two browser tabs:** Open the analyst view in two separate incognito windows with two different test accounts, both with empty tables (so both will auto-request a case)
2. **Same pending case:** Ensure only ONE case is in the "solicitud" queue
3. **Expected result:** One analyst gets the case, the other gets "Casos tomados por otros. Reintenta." (not a crash, not a duplicate assignment)
4. **Verify in Historico_Gestiones:** The case appears exactly ONCE with exactly ONE analyst's email

This manual test cannot be automated in GAS but should be performed once before production deployment.
