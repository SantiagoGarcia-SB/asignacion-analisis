# Requirements Document

## Introduction

Optimización del flujo "analista se activa y recibe un caso asignado" que actualmente tarda ~18 segundos end-to-end. El cuello de botella se concentra en dos funciones: `actualizarEstadoPropio` (4.35s, con 1.82s dentro del ScriptLock) y `_actualizarFaseBiometriaPendiente` (~6s post-asignación). El objetivo es reducir el flujo total a ~10-12 segundos sin alterar la semántica funcional ni la integridad de los datos de trazabilidad.

## Glossary

- **Sistema_Activación**: Conjunto de funciones del backend de Google Apps Script que procesan el cambio de estado de un analista a "ACTIVO" y la asignación posterior de un caso.
- **CacheService**: API de Google Apps Script para almacenamiento temporal de valores clave-valor entre ejecuciones (máximo 100KB por key, TTL configurable).
- **ScriptLock**: Mecanismo de exclusión mutua provisto por LockService de Google Apps Script para serializar acceso concurrente a recursos compartidos.
- **Historico_Estados**: Hoja de la spreadsheet principal que registra cada transición de estado de un analista con timestamps de inicio y fin (datos de auditoría).
- **Analistas_Turnos**: Hoja que asocia analistas con sus turnos activos y rangos de fecha de vigencia.
- **Turnos**: Hoja que define horarios (inicio/fin) por día de la semana para cada turno.
- **verificarTurnoActivo**: Función que valida si un analista tiene un turno vigente para el momento actual, leyendo Analistas_Turnos y Turnos.
- **_actualizarFaseBiometriaPendiente**: Función de trazabilidad que actualiza la fase de solicitudes en una spreadsheet externa de biometría pendiente.
- **_abrirSSCacheado**: Función existente de memoización de ejecución que evita múltiples `SpreadsheetApp.openById()` con el mismo ID dentro de una misma invocación.
- **Escrituras_Batch**: Patrón de usar `setValues()` sobre un rango contiguo en lugar de múltiples llamadas individuales a `setValue()`.
- **TTL**: Time To Live — duración en segundos que un valor permanece válido en caché.

## Requirements

### Requirement 1: Cache de datos de turnos con CacheService

**User Story:** Como analista, quiero que la verificación de mi turno activo sea rápida, para que al activarme no tenga que esperar ~2.4 segundos solo en la validación de horarios.

#### Acceptance Criteria

1. WHEN `verificarTurnoActivo` is invoked, THE Sistema_Activación SHALL attempt to read Analistas_Turnos and Turnos data from CacheService before reading from Google Sheets.
2. IF a valid cache entry exists for Analistas_Turnos and Turnos data, THEN THE Sistema_Activación SHALL use the cached data without reading the sheets from Google Sheets.
3. IF no valid cache entry exists, THEN THE Sistema_Activación SHALL read both sheets from Google Sheets, store the data in CacheService with a TTL of 60 seconds, and proceed with the verification.
4. WHEN the cached turnos data exceeds the 100KB limit per CacheService key, THE Sistema_Activación SHALL partition the data across multiple keys using the same chunking pattern as `_getDataUsuarios`.
5. THE Sistema_Activación SHALL produce identical turno validation results regardless of whether data is read from cache or from sheets.
6. WHEN turnos data is read from cache, THE Sistema_Activación SHALL complete `verificarTurnoActivo` in less than 200ms (compared to current ~2400ms from sheets).

### Requirement 2: Escrituras batch en actualizarEstadoPropio

**User Story:** Como analista, quiero que la actualización de mi estado en la hoja Usuarios sea lo más rápida posible, para reducir el tiempo que el ScriptLock permanece ocupado y evitar contención con otros analistas.

#### Acceptance Criteria

1. WHEN `actualizarEstadoPropio` updates the Usuarios sheet, THE Sistema_Activación SHALL write both columns (estado and historial JSON) in a single `setValues()` call instead of two separate `setValue()` calls.
2. THE Sistema_Activación SHALL reduce write operations inside the ScriptLock from 2 individual `setValue()` calls to 1 batched `setValues()` call for the Usuarios sheet.
3. THE Sistema_Activación SHALL maintain the same data written to both the estado column (column F) and the historial column (column L) as the current implementation.
4. WHEN the batched write is performed, THE Sistema_Activación SHALL complete the Usuarios sheet write in less than 300ms (compared to current ~478ms for 2 individual calls).

### Requirement 3: Mover Historico_Estados fuera del ScriptLock

**User Story:** Como equipo de desarrollo, queremos que las operaciones de auditoría en Historico_Estados no mantengan el ScriptLock ocupado innecesariamente, para que otros analistas no esperen por operaciones que no requieren exclusión mutua.

#### Acceptance Criteria

1. WHEN `actualizarEstadoPropio` completes the state update in the Usuarios sheet, THE Sistema_Activación SHALL release the ScriptLock before writing to Historico_Estados.
2. THE Sistema_Activación SHALL write to Historico_Estados (close previous record and append new record) after releasing the lock, outside the critical section.
3. IF the Historico_Estados write fails after the lock is released, THEN THE Sistema_Activación SHALL log the error and still return success to the analyst (the state change itself already succeeded).
4. THE Sistema_Activación SHALL preserve the same data written to Historico_Estados: closing the previous record with timestamp and duration, and appending the new record with "EN CURSO" status.
5. WHEN Historico_Estados operations run outside the lock, THE Sistema_Activación SHALL reduce the time spent inside the ScriptLock by at least 700ms (the current Historico_Estados scan+appendRow cost).

### Requirement 4: Usar _abrirSSCacheado para spreadsheet de biometría pendiente

**User Story:** Como analista, quiero que la función de actualización de fase de biometría no pague ~2-3 segundos abriendo una spreadsheet que ya podría estar memoizada, para reducir el tiempo total del flujo.

#### Acceptance Criteria

1. WHEN `_actualizarFaseBiometriaPendiente` needs to access the biometría pendiente spreadsheet, THE Sistema_Activación SHALL use `_abrirSSCacheado(ID_SHEET_BIOMETRIA_PENDIENTE)` instead of `SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE)`.
2. IF the spreadsheet is already memoized from a previous call in the same execution, THEN THE Sistema_Activación SHALL reuse the memoized object without a new network round-trip.
3. THE Sistema_Activación SHALL produce the same functional behavior (updating phase column and date column for matching rows) regardless of whether the spreadsheet was opened fresh or reused from memo.

### Requirement 5: Escrituras batch en _actualizarFaseBiometriaPendiente

**User Story:** Como analista, quiero que la actualización de fase en la hoja de biometría pendiente sea eficiente, para que las escrituras fila por fila no agreguen latencia innecesaria.

#### Acceptance Criteria

1. WHEN `_actualizarFaseBiometriaPendiente` needs to update multiple rows, THE Sistema_Activación SHALL collect all row updates and apply them using batch operations (`setValues()` or `getRangeList().setValues()`) instead of individual `setValue()` calls per row.
2. WHEN only a single row needs updating, THE Sistema_Activación SHALL use a single `setValue()` call (no unnecessary overhead from batching).
3. THE Sistema_Activación SHALL update both the phase column (column 76) and the date column (COL_FECHA_ACTUALIZACION_FASE) for each matching row in a single batch flush.
4. THE Sistema_Activación SHALL skip rows whose phase is already in a terminal state (RESUELTA, RESUELTA_EN_COLA, ASIGNADA, ARCHIVADA) without modification, preserving the current guard logic.
5. WHEN batch writes are used for N rows, THE Sistema_Activación SHALL complete in O(1) Google Sheets API calls instead of O(N) individual setValue calls.

### Requirement 6: Ejecución no-bloqueante de _actualizarFaseBiometriaPendiente

**User Story:** Como analista, quiero que la actualización de trazabilidad en biometría pendiente no me haga esperar después de que mi caso ya fue asignado, para que pueda ver mi tabla de trabajo actualizada de inmediato.

#### Acceptance Criteria

1. WHEN the case assignment is complete and `SpreadsheetApp.flush()` has confirmed the assignment writes, THE Sistema_Activación SHALL return the success response to the analyst without executing `_actualizarFaseBiometriaPendiente` in the same server call.
2. WHEN the analyst receives the assignment response, THE Sistema_Activación SHALL trigger `_actualizarFaseBiometriaPendiente` in a separate server invocation initiated from the client side (e.g., via `google.script.run` without a blocking success handler) so that the traceability update runs independently of the response already delivered.
3. IF `_actualizarFaseBiometriaPendiente` fails during the deferred separate invocation, THEN THE Sistema_Activación SHALL log the error with the consecutivo IDs and the target phase, without altering or rolling back the already-confirmed assignment result visible to the analyst.
4. THE Sistema_Activación SHALL implement the deferred pattern using only mechanisms available in Google Apps Script's synchronous execution model (no native async/await, no Web Workers, no Promises on the server side), relying on client-initiated secondary calls or time-driven triggers.
5. WHEN the deferred pattern is applied, THE Sistema_Activación SHALL reduce the analyst-perceived wait time of the activation flow by at least 4 seconds (removing the `_actualizarFaseBiometriaPendiente` execution from the critical response path).
6. WHEN `_actualizarFaseBiometriaPendiente` is moved outside the main assignment call, THE Sistema_Activación SHALL also release the ScriptLock before the deferred execution runs, so that the biometría traceability update does not hold the lock and does not cause contention for other analysts.

### Requirement 7: Objetivo de latencia end-to-end del flujo de activación

**User Story:** Como analista, quiero que el flujo completo desde que hago clic en "ACTIVO" hasta que veo mi caso en la tabla se complete en máximo 12 segundos, para mejorar mi productividad y experiencia de uso.

#### Acceptance Criteria

1. WHEN an analyst clicks "ACTIVO" and the full flow (state change + assignment + panel refresh) completes, THE Sistema_Activación SHALL deliver the complete response in 12 seconds or less under normal conditions (no lock contention with other analysts).
2. WHILE the ScriptLock is held by `actualizarEstadoPropio`, THE Sistema_Activación SHALL keep the critical section duration under 800ms (reduced from current ~1820ms).
3. THE Sistema_Activación SHALL not degrade correctness of state transitions, turno validation, assignment logic, or audit records to achieve the latency target.
4. IF lock contention exists (another analyst is holding the lock), THEN THE Sistema_Activación SHALL wait up to 25 seconds for the lock (preserving current timeout behavior) without counting contention wait time against the 12-second target.
