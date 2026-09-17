# Archive Queue Reactivation Fix Bugfix Design

## Overview

La reactivación manual de biometrías archivadas debe recibir exclusivamente el contrato `{ fechaConsultaSai, cantidad }`. El backend valida el objeto completo antes de cualquier efecto lateral: no admite claves inesperadas, la fecha debe ser una fecha de calendario válida y no futura en la zona operativa, y `cantidad` debe ser un entero decimal estricto de 1 a 100, sin coerción. El máximo de 100 es estricto: una cantidad mayor responde de forma determinista sin consultar SAI, tomar locks ni escribir.

Con una solicitud aceptada, el backend selecciona únicamente filas físicas de `pendiente_biometria` en fase `ARCHIVADA`, con ID no vacío y `fecha_consulta_sai` en columna 60 (índice 59) normalizada exactamente a la fecha solicitada. Se preserva el orden físico de la hoja y se aplica `cantidad` solamente después del filtrado. Cada candidata física aceptada recibe exactamente una consulta individual a SAI, manteniendo una pausa de al menos un segundo entre intentos consecutivos. SAI solo permite persistencia cuando cumple el predicado exacto de admisión; la persistencia existente sigue siendo responsable de confirmar las fases finales.

La UI informa y restringe el máximo de 100, pero el backend permanece como autoridad. La configuración **Orden Biometría** (`ORDEN_DESAPLAZAMIENTO`) queda estrictamente separada: no participa en selección, límite, SAI, persistencia ni respuesta de reactivación. Solo la asignación posterior, después de una persistencia confirmada en `solicitud`, conserva su lectura vigente de la propiedad y su orden por `fechaResultado`. No se implementa código en esta fase.

## Glossary

- **Bug_Condition (C)**: Condición en la que una petición inválida produce efectos, se supera el máximo de 100, se selecciona una fila fuera de `ARCHIVADA` + ID + fecha índice 59, se rompe el orden físico/cap posterior al filtro, se omite la cadencia SAI, o se mezcla Orden Biometría con la reactivación.
- **Property (P)**: Comportamiento correcto para C: rechazo sin efectos cuando la petición no es válida; selección física exacta y limitada; una consulta SAI por candidata con cadencia mínima; y persistencia solo con el resultado SAI admisible.
- **Preservation**: Comportamientos existentes que no cambian: cero coincidencias exitoso, criterio exacto SAI=`500`, reintentos por SAI no disponible, deduplicación/persistencia protegida y Orden Biometría aplicado únicamente en la asignación posterior.
- **Contrato de reactivación**: Objeto plano con exactamente dos claves propias, `{ fechaConsultaSai, cantidad }`; no admite claves adicionales, arreglos, valores ausentes ni coerciones.
- **Fecha de consulta SAI**: Campo `fecha_consulta_sai` de `pendiente_biometria`, columna 60/índice 59. Es la única fecha de selección para desarchivado.
- **Clave de fecha operativa**: Fecha canónica `YYYY-MM-DD`, completa y existente, interpretada en la zona horaria operativa; no representa un instante ni una hora.
- **Cantidad aceptada**: Valor numérico entero, seguro y decimal entre 1 y 100. Textos, booleanos, `null`, valores no finitos, fracciones, signos, valores parciales y valores fuera del intervalo se rechazan sin conversión.
- **Candidata física**: Una fila individual que cumple fase `ARCHIVADA`, ID no vacío y coincidencia exacta de fecha índice 59. IDs repetidos siguen siendo filas físicas distintas para filtro, orden, límite y consulta SAI.
- **Intento SAI**: Una llamada individual para una candidata física seleccionada. Intentos consecutivos se separan por al menos 1.000 ms, aun si el anterior no resulta elegible.
- **Persistencia confirmada**: Resultado existente que confirma inserción en `solicitud` o presencia previa en la cola. Es la frontera para cambiar fases finales y para la posterior asignación.
- **`fechaResultado`**: Campo SAI de índice 18, prohibido para selección, límite, orden, desempate, validación o decisión de reactivación. La asignación posterior existente lo conserva para ordenar casos ya presentes en `solicitud`.
- **Orden Biometría / `ORDEN_DESAPLAZAMIENTO`**: Política independiente de asignación posterior. Ausente/vacía equivale a `RECIENTE_PRIMERO`; los demás valores mantienen la interpretación existente de antiguo primero. La reactivación no la lee, valida, corrige, transporta ni escribe.

## Bug Details

### Bug Condition

El defecto aparece si una petición con forma, fecha o cantidad inválida llega a SAI, locks o escrituras; si un valor `cantidad > 100` no devuelve el error contractual; si se selecciona usando otra fecha, se aplica el máximo antes de filtrar o se altera el orden físico; si se omite la espera mínima entre llamadas SAI; o si se acopla Orden Biometría a la reactivación. También aparece si una respuesta SAI disponible que no cumple todos los criterios vigentes puede reincorporar una fila.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ReactivationRequestAndExecutionContext
  OUTPUT: boolean

  validKeys := isPlainObject(input.request)
               AND ownKeys(input.request) = ["fechaConsultaSai", "cantidad"]
  validDate := isStrictExistingOperatingDate(input.request.fechaConsultaSai)
               AND NOT isFutureInOperatingTimeZone(input.request.fechaConsultaSai)
  validQuantity := isStrictDecimalSafeInteger(input.request.cantidad)
                   AND input.request.cantidad >= 1
                   AND input.request.cantidad <= 100
  requestInvalid := NOT (validKeys AND validDate AND validQuantity)
  exceedsMaximum := validKeys AND validDate
                    AND isStrictDecimalSafeInteger(input.request.cantidad)
                    AND input.request.cantidad > 100

  requestedDay := normalizeToOperatingDateKey(input.request.fechaConsultaSai)
  rowMatches := normalize(input.row.phase) = "ARCHIVADA"
                AND trim(input.row.solicitudId) != ""
                AND isValidOperatingDate(input.row.fechaConsultaSaiAtIndex59)
                AND normalizeToOperatingDateKey(input.row.fechaConsultaSaiAtIndex59)
                    = requestedDay
  selectionWrong := input.row.wasSelected AND NOT rowMatches
                    OR input.execution.capAppliedBeforeFiltering
                    OR NOT isPhysicalSheetOrder(input.execution.selectedRows)
                    OR count(input.execution.selectedRows) > input.request.cantidad
                    OR count(input.execution.selectedRows) > 100

  pacingWrong := hasConsecutiveSaiAttempts(input.execution)
                 AND minGapMilliseconds(input.execution.saiAttempts) < 1000
  forbiddenCoupling := input.execution.readsFechaResultado
                       OR input.execution.readsFechaActualizacionFase
                       OR input.execution.readsOrdenDesaplazamiento
                       OR input.execution.writesOrdenDesaplazamiento
                       OR input.execution.usesForbiddenValueForSelectionLimitOrderTieBreakValidationDecisionOrMutation

  saiEligible := isInterpretableSaiPayload(input.sai)
                 AND trim(String(input.sai.resultCode)) = "500"
                 AND normalize(input.sai.studyStatus) = "APROBADO_PENDIENTE_BIOMETRIA"
                 AND trim(String(input.sai.mainResultCode)) = "2"
                 AND normalize(input.sai.requestType) NOT IN ["AC", "AV"]
  persistedWhenIneligible := input.row.wasSelected
                             AND isInterpretableSaiPayload(input.sai)
                             AND NOT saiEligible
                             AND input.row.wasQueued

  invalidRequestHadEffects := requestInvalid
                              AND (input.effects.saiCalls > 0
                                   OR input.effects.lockAttempts > 0
                                   OR input.effects.queueWrites > 0
                                   OR input.effects.phaseWrites > 0)
  maximumResponseWrong := exceedsMaximum
                          AND NOT equals(input.response, {
                            success: false,
                            errorCode: "CANTIDAD_MAXIMA_EXCEDIDA",
                            maxCantidad: 100,
                            message: anyNonEmptyMessage
                          })

  RETURN invalidRequestHadEffects
         OR maximumResponseWrong
         OR selectionWrong
         OR pacingWrong
         OR forbiddenCoupling
         OR persistedWhenIneligible
END FUNCTION
```

### Frontend–Backend Contract and Candidate Selection

| Element | Design contract |
|---|---|
| Request | `admin_desarchivarBiometrias(request)` receives exactly `{ fechaConsultaSai, cantidad }`. No client-provided IDs, dates auxiliares, policy values or additional keys are accepted. |
| Object validation | Before side effects, backend verifies an object non-null/non-array with exactly the allowlisted keys, both present. Any unexpected key invalidates the request; it is not ignored. |
| Date validation | `fechaConsultaSai` must be a strict existing `YYYY-MM-DD` calendar date, normalized in the operating zone and not after today in that zone. Missing, malformed, impossible and future dates reject before SAI, locks or writes. |
| Quantity validation | `cantidad` is accepted only as a numeric safe integer without coercion, from 1 through 100 inclusive. Strings, booleans, null, non-finite numbers, fractions, negative/zero values and out-of-range values reject before effects. |
| Maximum response | If an otherwise shaped request has a strict integer `cantidad > 100`, return `{ success:false, errorCode:'CANTIDAD_MAXIMA_EXCEDIDA', maxCantidad:100, message }`. `message` states that the maximum per operation is 100. No SAI call, lock, queue write, phase change or other sheet write occurs. |
| Frontend control | The modal displays “Máximo 100 por operación”, uses a numeric control constrained to `min=1`, `max=100`, `step=1`, and blocks local submission outside that range. It does not treat those controls as authorization: it renders the backend maximum-error message as authoritative and does not retry SAI or the operation on its own. |
| Selection source | Candidate discovery uses only physical row order, phase, ID and index-59 `fecha_consulta_sai`. It excludes blank IDs, malformed/mismatched index-59 dates and non-`ARCHIVADA` rows. |
| Cap and ordering | Filter all physical rows first, retain their physical-sheet order, then select at most accepted `cantidad` rows. Never sort, deduplicate or cap before filtering; never use `fechaResultado`, `fecha_actualizacion_fase`, ID ordering or administrative priority. |
| Zero matches | A valid request with zero matches returns a successful informative response with zero work: no SAI, lock, queue write, phase write or row mutation. |
| SAI cadence | For every selected physical candidate, perform one individual SAI query. Insert a delay of at least 1.000 ms between consecutive attempts; rows beyond the cap have no attempt or state change. |
| SAI decision | Only an interpretable response satisfying `resultCode=500`, `studyStatus=APROBADO_PENDIENTE_BIOMETRIA`, `mainResultCode=2`, and `requestType ∉ {AC, AV}` reaches existing persistence. Any other available response targets protected `RESUELTA`; unavailable/noninterpretable SAI remains `ARCHIVADA`. |
| Persistence and handoff | Existing write-first/mark-on-success, history/queue deduplication, lock, phase re-read, timestamp, flush and per-row confirmation remain authoritative. Only confirmed `solicitud` presence exposes a case to later assignment. |
| Orden Biometría | Reactivation has no Script Properties access for `ORDEN_DESAPLAZAMIENTO`. The later assignment routine alone reads its then-current value and applies its existing `fechaResultado` comparator. |

### Examples

- A request `{ fechaConsultaSai: '2026-04-19', cantidad: 100 }` is accepted. From 132 physical rows, only 104 match `ARCHIVADA` + nonblank ID + exact valid index-59 date; the first 100 in sheet order are selected. None of the remaining four or 28 nonmatches receives SAI.
- A request with `cantidad: 101` returns `success:false`, `errorCode:'CANTIDAD_MAXIMA_EXCEDIDA'`, `maxCantidad:100` and the maximum message. It creates zero SAI attempts, lock attempts, queue writes and phase writes.
- `{ fechaConsultaSai: '2026-02-30', cantidad: 1 }`, `{ fechaConsultaSai: futureDate, cantidad: 1 }`, `{ fechaConsultaSai: '2026-04-19', cantidad: '1' }`, and an object containing `ordenDesplazamiento` are invalid. Each is rejected before any side effect.
- Rows 20, 24, 29 and 32 are exact matches for the requested index-59 day with quantity 3. Rows 20, 24 and 29 are selected in that order even if row 32 has an older `fechaResultado`, a newer phase timestamp or a different administrative order configuration.
- Two selected physical rows share ID `ABC-123`. Both consume cap positions and each receives its own SAI attempt at least one second apart. Existing persistence deduplicates queue insertion, and each physical row transitions only after its own confirmed outcome.
- A selected row gets `503 + APROBADO_PENDIENTE_BIOMETRIA + 2 + TS`: it is available but ineligible, so it follows protected `RESUELTA`, not queue persistence. A row with the exact `500` conjunction may proceed to persistence.
- A valid date with zero matches returns success and metrics with `candidatasFiltradas:0`, `candidatasSeleccionadas:0`, `intentosSai:0`; it does not invoke SAI or take a lock.
- Changing `ORDEN_DESAPLAZAMIENTO` before or during reactivation changes neither candidates, cap, timing, SAI nor phases. Changing it before a later assignment run affects only that later run's existing ordering by `fechaResultado`.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Cero coincidencias para una fecha válida sigue siendo exitoso, informativo y sin consultas SAI, locks ni escrituras.
- SAI no disponible, excepción o payload no interpretable conserva la candidata seleccionada en `ARCHIVADA` y disponible para reintento.
- El criterio SAI vigente se conserva: solo la conjunción exacta `500 + APROBADO_PENDIENTE_BIOMETRIA + 2 + requestType no excluido` habilita la persistencia; las respuestas disponibles no elegibles siguen `RESUELTA`.
- `procesarYGuardarLote` continúa como ruta de inserción/deduplicación. Inserción confirmada o presencia previa puede producir `ESCALADA`; duplicado histórico, `ASIGNADA`; persistencia fallida/no confirmada, `ARCHIVADA` reintentable.
- Las transiciones finales continúan protegidas por `ScriptLock`, relectura de fase `ARCHIVADA`, timestamp y flush. El nuevo límite se valida antes de alcanzar esas protecciones, no las sustituye.
- Las filas físicas con IDs duplicados conservan su candidatura, orden y resultado individual; se preserva a lo sumo una inserción por ID en `solicitud`.
- Orden Biometría y su setter permanecen separados. La asignación posterior conserva la lectura actual de `ORDEN_DESAPLAZAMIENTO` y su comparador existente de `fechaResultado`, incluidos valores ausentes, alterados, vacíos o malformados.

**Scope:**
Fuera del contrato aceptado no hay efectos. Para una solicitud aceptada, filas no `ARCHIVADA`, sin ID, con fecha índice 59 inválida/no coincidente o después del cap siguen sin SAI ni cambios. El ajuste no modifica automatización de archivado, esquemas de hojas, UI/setter de Orden Biometría, `fechaResultado` ni la asignación posterior. No se añaden reintentos automáticos de SAI desde el frontend.

## Hypothesized Root Cause

1. **Límite solo implícito o de UI**: el flujo puede aceptar cantidades no acotadas o convertir entradas ambiguas si no valida forma, tipo e intervalo en backend antes de sus efectos.
2. **Selección con preocupaciones mezcladas**: la cantidad se puede aplicar antes del predicado físico exacto o la selección puede depender de `fechaResultado`, marcas de fase u orden administrativo en vez de índice 59.
3. **Cadencia no contractual**: sin una regla explícita entre intentos, un lote manual puede concentrar llamadas SAI y exceder el presupuesto operativo por latencia variable.
4. **Admisión SAI incompleta**: verificaciones amplias de estado pendiente pueden admitir `503` o payloads incompletos en vez del `resultCode=500` exacto y demás criterios.
5. **Fuga de política de asignación**: leer, cachear o escribir `ORDEN_DESAPLAZAMIENTO` durante reactivación puede alterar un flujo que debe evaluarse solo cuando la asignación posterior se ejecute.

## Correctness Properties

Property 1: Bug Condition - Límite estricto y rechazo sin efectos

_For any_ request whose object shape is not exactly `{ fechaConsultaSai, cantidad }`, whose date is missing, invalid or future, or whose quantity is not a strict integer in `1..100`, the fixed function SHALL reject before SAI calls, lock attempts, queue writes or phase writes. _For any_ strict integer quantity greater than 100, it SHALL return `success:false`, `errorCode:'CANTIDAD_MAXIMA_EXCEDIDA'`, `maxCantidad:100` and a nonempty maximum message with those same zero side effects.

**Validates: Requirements 2.2, 2.14, 2.15**

Property 2: Bug Condition - Selección física acotada y cadencia SAI

_For any_ accepted request and sequence of physical rows, the fixed function SHALL filter exactly `ARCHIVADA` + nonblank ID + valid exact index-59 `fecha_consulta_sai` matches, preserve their physical order, and only then cap the sequence at `cantidad` (never above 100). _For any_ selected physical candidate, it SHALL make exactly one individual SAI attempt, and every two consecutive attempts SHALL be separated by at least 1.000 ms.

**Validates: Requirements 2.3, 2.4, 2.5, 2.10, 2.12, 2.13, 2.17, 2.18**

Property 3: Bug Condition - SAI autoritativo y persistencia protegida

_For any_ selected physical candidate with an interpretable SAI response, the fixed function SHALL permit queue persistence only for `500 + APROBADO_PENDIENTE_BIOMETRIA + 2 + requestType not in {AC, AV}`; every other available response SHALL bypass persistence and target protected `RESUELTA`. _For any_ unavailable or noninterpretable response, it SHALL leave the row `ARCHIVADA` and retryable.

**Validates: Requirements 2.7, 2.8, 2.9, 3.1, 3.2, 3.3, 3.4, 3.5**

Property 4: Preservation - Cero coincidencias, deduplicación y frontera de asignación

_For any_ valid date with no exact physical candidates, the fixed function SHALL return success with zero work and no SAI, locks or writes. _For any_ selected duplicate physical IDs, it SHALL preserve their individual cap participation and SAI outcomes while the existing persistence mechanism prevents duplicate queue insertion. _For any_ value of `ORDEN_DESAPLAZAMIENTO`, reactivation results SHALL be invariant and not mutate or access that property; only a later assignment run SHALL consume its then-current value with the established `fechaResultado` behavior.

**Validates: Requirements 2.6, 2.11, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13**

**Formal Property Specification:**
```
FUNCTION expectedBehavior(input)
  INPUT: input of type ReactivationRequestAndCandidateContext
  OUTPUT: ReactivationDecision

  IF NOT isExactAllowedRequest(input.request) THEN
    IF isStrictDecimalSafeInteger(input.request.cantidad)
       AND input.request.cantidad > 100 THEN
      RETURN { success: false, errorCode: "CANTIDAD_MAXIMA_EXCEDIDA",
               maxCantidad: 100, message: maximumMessage,
               saiAttempts: 0, lockAttempts: 0, writes: 0 }
    END IF
    RETURN { success: false, errorCode: "SOLICITUD_INVALIDA",
             saiAttempts: 0, lockAttempts: 0, writes: 0 }
  END IF

  matches := physicalRowsWhere(
    phase = "ARCHIVADA"
    AND nonBlank(solicitudId)
    AND validOperatingDate(fechaConsultaSaiAtIndex59)
    AND operatingDateKey(fechaConsultaSaiAtIndex59) = operatingDateKey(input.request.fechaConsultaSai)
  )
  selected := takeInPhysicalOrder(matches, input.request.cantidad)

  IF count(selected) = 0 THEN
    RETURN { success: true, zeroMatches: true, selected: [], saiAttempts: 0,
             lockAttempts: 0, writes: 0 }
  END IF

  FOR EACH candidate IN selected DO
    waitUntilAtLeastOneSecondSincePreviousSaiAttempt()
    sai := querySaiOnce(candidate.solicitudId)
    IF NOT isInterpretableSaiPayload(sai) THEN
      preserveArchived(candidate)
    ELSE IF isExactSaiAdmission(sai) THEN
      useExistingConfirmedPersistence(candidate)
    ELSE
      useExistingProtectedResolvedTransition(candidate)
    END IF
  END FOR
END FUNCTION
```

## Fix Implementation

### Changes Required

Assuming the root-cause analysis is correct, implementation will make these bounded changes only after approval:

**Frontend file**: `VistaAdmin.html`
**Frontend function**: `abrirDesarchivarBiometrias()`

1. Render date selection and quantity with visible “Máximo 100 por operación”, `min=1`, `max=100` and `step=1`; reject invalid local input without replacing server validation.
2. Send only `{ fechaConsultaSai, cantidad }`. On `CANTIDAD_MAXIMA_EXCEDIDA`, display the backend `message` and `maxCantidad` as authoritative; do not call SAI, locally fabricate success, or automatically retry.
3. Preserve the independent Orden Biometría UI and setter without exposing/sending its value in this modal.

**Backend file**: `Biometria.js`
**Backend function**: `admin_desarchivarBiometrias(request)`

4. Validate the request object's exact allowlist, strict operational calendar date and strict 1..100 quantity before SAI, locks, reads that cause mutation, queue writes or phase transitions. Branch `cantidad > 100` to the deterministic maximum response with zero side effects.
5. Read candidate fields only as required for physical row identity, phase, ID and index 59. Filter first, preserve physical order and cap after filtering. Return zero matches before SAI, locks or writes.
6. Execute one SAI call per selected candidate, record the previous-attempt timestamp and wait at least 1.000 ms before each consecutive attempt. Apply the exact SAI predicate and reuse existing protected persistence/transitions.
7. Produce only aggregate, non-PII operational response metrics: request validity/result code, `cantidadSolicitada` when valid, `candidatasFiltradas`, `candidatasSeleccionadas`, `intentosSai`, eligible/resolved/retryable counts, duplicate/persistence outcome counts, `esperaSaiMs`, `duracionMs`, and budget status. Do not return IDs, payloads SAI, raw dates beyond the user-requested date, tokens or exceptions.
8. Do not call `PropertiesService.getScriptProperties()` for `ORDEN_DESAPLAZAMIENTO` in reactivation or its helpers. Do not read/use `fechaResultado` or `fecha_actualizacion_fase` for reactivation. Leave later assignment routines and their existing policy/date comparator unchanged.

### Execution Budget and Response Metrics

- **Hard work bound**: at most 100 accepted physical candidates and therefore at most 100 individual SAI attempts per operation. Invalid, maximum-exceeded and zero-match requests use zero attempts.
- **Pacing allowance**: planning reserves up to 100 seconds of deliberate one-second cadence for a 100-candidate operation (the enforced rule is at least one second between consecutive attempts), before SAI latency and persistence.
- **Operational margin**: this bounded load remains well below the established reference of up to 500 serial SAI checks with a 20-minute operating budget. Runtime remains observable because provider latency can vary; the response reports elapsed and waiting time rather than promising a fixed completion time.
- **Budget guard evidence**: tests assert `intentosSai <= candidatasSeleccionadas <= cantidadSolicitada <= 100`, each observed consecutive gap is `>=1000 ms`, and rejected `101` records zero side effects. If runtime-budget monitoring is added, it must stop before a platform deadline through the established safe-continuation policy, never bypass validation or leave a partial phase transition unconfirmed.
- **Response observability**: successful responses contain only aggregate counters and elapsed/budget metrics. Error responses maintain the required maximum shape for `CANTIDAD_MAXIMA_EXCEDIDA`; validation errors are generic and do not disclose row or SAI details.

## Testing Strategy

### Validation Approach

Testing first produces counterexamples on unfixed behavior, then proves the four properties with mocks for SAI, Sheets, locks, time and persistence. Tests never call live SAI, Sheets, Script Properties or production resources. Clock control must make the one-second cadence deterministic without sleeping in test execution.

### Exploratory Bug Condition Checking

**Goal**: Surface invalid-request side effects, cap/order mistakes, insufficient SAI pacing and policy leakage before implementation.

**Test Plan**: Build side-effect-counting adapters for request validation, candidate discovery, SAI, lock, queue/phase writes and a fake monotonic clock. Make forbidden field/property access fail immediately.

**Test Cases**:
1. **Boundary 100**: exactly 100 accepted physical matches with `cantidad=100` produce no more than 100 individual calls, preserve physical order, and enforce every consecutive gap `>=1000 ms`.
2. **Boundary 101 / deterministic error**: `cantidad=101` returns the exact maximum error shape and asserts zero SAI calls, lock calls, queue writes, phase writes and persistence calls.
3. **Strict request matrix**: unexpected key, absent key, array, `null`, string quantity, decimal quantity, zero, negative, impossible date and future date each reject before side effects.
4. **Filter-before-cap**: a sheet containing leading invalid/nonmatching rows plus more than 100 later matches proves the first 100 *matching physical* rows are chosen, not the first 100 raw rows.
5. **Cadence and SAI criterion**: deterministic timestamps demonstrate one-second spacing for eligible, ineligible and failed attempts; `503` resolves, exact `500` conjunction alone reaches persistence.
6. **Policy isolation and zero matches**: property access traps remain untouched across the policy matrix; a valid no-match request returns success with all work counters zero.

**Expected Counterexamples**:
- `101` starts SAI, acquires a lock or writes a row instead of returning `CANTIDAD_MAXIMA_EXCEDIDA`.
- An unexpected key is ignored, a quantity is coerced, or an invalid/future date causes side effects.
- Raw row order/cap is applied before filtering, a gap is shorter than one second, or a policy/result date changes the candidate set.

### Fix Checking

**Goal**: Verify every C(X) input is rejected safely or produces the exact bounded selection and SAI behavior.

**Pseudocode:**
```
FOR ALL request, physicalRows, saiResponses DO
  result := executeReactivation_fixed(request, physicalRows, saiResponses)
  IF request.cantidad > 100 AND request is otherwise strict THEN
    ASSERT result.errorCode = "CANTIDAD_MAXIMA_EXCEDIDA"
    ASSERT result.maxCantidad = 100
    ASSERT result.sideEffects = 0
  ELSE IF NOT isExactAllowedRequest(request) THEN
    ASSERT result.sideEffects = 0
  ELSE
    ASSERT selected = takeInPhysicalOrder(exactIndex59Matches, request.cantidad)
    ASSERT count(selected) <= 100
    ASSERT saiAttempts = count(selected)
    ASSERT everyConsecutiveSaiGap >= 1000 milliseconds
    ASSERT expectedBehavior(result)
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify ¬C(X) retains current persistence, no-match and later assignment behavior.

**Pseudocode:**
```
FOR ALL accepted request WHERE count(exactIndex59Matches) = 0 DO
  ASSERT fixed(request).success = true
  ASSERT fixed(request).sideEffects = 0
END FOR

FOR ALL selected candidates WHERE NOT isBugCondition(candidate) DO
  ASSERT originalPersistenceAndPhaseOutcome(candidate)
         = fixedPersistenceAndPhaseOutcome(candidate)
END FOR

FOR ALL laterAssignmentCases, currentPolicy DO
  ASSERT originalAssignment(currentPolicy, laterAssignmentCases)
         = fixedAssignment(currentPolicy, laterAssignmentCases)
END FOR
```

**Test Cases**:
1. Preserve successful zero-match response and zero work counters.
2. Preserve unavailable-SAI retry, exact SAI=500 admission, `RESUELTA` for available ineligible responses, confirmed persistence, deduplication, locking/re-read/timestamp/flush.
3. Preserve duplicate physical-row semantics and later assignment using the current policy and existing `fechaResultado` normalizer, including blank/malformed values.
4. Preserve policy independence: no `ORDEN_DESAPLAZAMIENTO` access during reactivation; property changes only affect an assignment run after confirmed persistence.

### Unit Tests

- Exact-object allowlist and strict type/date/quantity validator, including valid 1 and 100, invalid 0 and 101, unexpected keys and no-side-effect result.
- Candidate predicate for `ARCHIVADA` + nonblank ID + valid index-59 exact date; filter-before-cap and physical-order behavior.
- SAI scheduler with fake clock: one call per selected candidate and at least 1.000 ms between attempts.
- Exact SAI classifier, zero-match response metrics and aggregation with no PII.
- Frontend quantity validation (`min=1`, `max=100`, `step=1`) and authoritative rendering of `CANTIDAD_MAXIMA_EXCEDIDA`.

### Property-Based Tests

- Generate strict and malformed request objects to prove Property 1, including the 100/101 boundary and zero side effects for every rejected input.
- Generate physical rows, duplicate IDs, divergent index-59/result/phase dates and quantities 1..100 to prove Property 2's filter/order/cap invariants.
- Generate SAI payload combinations and deterministic latencies to prove Properties 2 and 3: cadence, exact admission and protected persistence outcomes.
- Generate zero-match sheets, policy values and later assignment cases to prove Property 4 while asserting zero reactivation property access and unchanged subsequent ordering.

### Integration Tests

- Drive the modal through `google.script.run` with 100 and 101; verify the former request shape is exactly `{ fechaConsultaSai, cantidad }`, the latter displays the authoritative backend message, and neither frontend path invokes SAI directly.
- Mock `pendiente_biometria`, SAI, locks and persistence for more than 100 filtered matches, raw nonmatches before matches, duplicates and failures; assert cap-after-filter, physical order, at least-one-second attempts, aggregate metrics and no side effects for invalid/101/zero-match requests.
- Chain confirmed persistence to a later mocked Desaplazamiento/Biometría assignment, change `ORDEN_DESAPLAZAMIENTO` after reactivation, and verify only the later assignment reads its current value and retains existing `fechaResultado` behavior.
