# Implementation Plan

- [x] 1. Write bug-condition exploration properties for the strict 100-candidate reactivation contract (BEFORE implementing the fix)
  - **Property 1: Bug Condition** - Rechazo estricto, selección física y cadencia SAI acotada
  - **CRITICAL**: Write and run these property-based tests against the unfixed implementation before changing production code. Failures are expected and must be retained as counterexamples; do not weaken the assertions or alter production code in this task.
  - Create isolated adapters under `tests/lib/` and Vitest/fast-check properties under `tests/properties/`, following the existing `*-puro.js` and `*.property.test.js` conventions. Mock Sheets, SAI, persistence, ScriptLock, Script Properties, and time; never call live services.
  - Encode `isBugCondition(input)` and `expectedBehavior(input)` from the design. Instrument SAI calls, lock attempts, queue/persistence writes, phase writes, physical-row accesses, property accesses, and a fake monotonic clock.
  - Generate exact plain-object request cases. Accept only own-key-equivalent `{ fechaConsultaSai, cantidad }`; reject arrays, `null`, missing keys, extra keys, malformed/impossible/future dates, strings, booleans, `null`, `NaN`, infinities, fractions, signed/partial values, zero, negatives, and all other coercible quantities before any side effect.
  - Cover boundaries explicitly: valid numeric safe integers `1` and `100`; `101` and higher return exactly `{ success:false, errorCode:'CANTIDAD_MAXIMA_EXCEDIDA', maxCantidad:100, message:<nonempty> }`; all rejected cases—including `101`—make zero SAI calls, lock attempts, persistence/queue writes, phase writes, or other sheet mutations.
  - Generate physical rows with divergent phase, blank/duplicate IDs, valid/invalid/mismatched column-60/index-59 `fecha_consulta_sai`, `fechaResultado`, and `fecha_actualizacion_fase`. Assert the operation filters first by exactly `ARCHIVADA` + nonblank ID + valid exact normalized index-59 date, retains physical-sheet order, then caps at `cantidad`, never above 100.
  - Add a filter-before-cap fixture with more than 100 matching physical rows after leading nonmatches. Assert the first 100 *matching physical* rows are selected, while all nonmatches and rows after the cap get no SAI attempt or state change.
  - Use a fake clock/scheduler to assert exactly one individual SAI attempt per selected physical candidate, no attempt for unselected rows, and every consecutive attempt—including failed or ineligible responses—is separated by at least 1,000 ms without real test sleeping.
  - Mock the exact SAI decision matrix: only `500 + APROBADO_PENDIENTE_BIOMETRIA + 2 + requestType not in {AC, AV}` reaches existing persistence; `503` and every other available ineligible response bypass persistence and targets protected `RESUELTA`; unavailable/noninterpretable responses stay `ARCHIVADA` and retryable.
  - Add fail-fast traps proving reactivation never reads/uses `fechaResultado`, `fecha_actualizacion_fase`, or `ORDEN_DESAPLAZAMIENTO`, and never accesses Script Properties. Verify policy values cannot affect candidate selection, cap, SAI, persistence, phases, or response.
  - Assert all response observability is aggregate and non-PII: result/validity, valid requested quantity, filtered/selected candidate counts, SAI attempts, eligible/resolved/retryable and persistence outcome counts, SAI wait duration, total duration, and budget status; reject IDs, raw SAI payloads, tokens, exception details, or row-level data.
  - Run the properties on unfixed code. **EXPECTED OUTCOME: fail** for the defective cases. Record the exact counterexamples and seeds, especially for `101`, coercible quantity, extra key, effects before rejection, cap-before-filter, and sub-second cadence.
  - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 2.9, 2.10, 2.12, 2.13, 2.14, 2.15, 2.17, 2.18_

- [x] 2. Write preservation properties for existing SAI persistence and later assignment (BEFORE implementing the fix)
  - **Property 2: Preservation** - Persistencia SAI, cero coincidencias y Orden Biometría posterior
  - **IMPORTANT**: Follow observation-first methodology. Run non-buggy paths on the unfixed implementation with mocks, document observed outputs/seeds, and express only those established behaviors as properties. These tests must pass before the fix begins.
  - Observe a valid request with zero exact physical index-59 matches. Assert its existing successful informative response has zero filtered/selected candidates, zero SAI calls, zero lock attempts, and zero queue/phase writes.
  - Observe and preserve the SAI/persistence decision paths: unavailable/noninterpretable SAI remains `ARCHIVADA` and retryable; exact SAI=`500` conjunction uses `procesarYGuardarLote`; confirmed insert or existing `solicitud` presence produces `ESCALADA`; historical duplicate produces `ASIGNADA`; failed/unconfirmed persistence stays `ARCHIVADA`; available but ineligible SAI produces protected `RESUELTA`.
  - Generate duplicate matching physical IDs. Preserve that each row occupies its own physical position, cap slot, SAI call, and individual confirmed phase result, while existing persistence prevents more than one `solicitud` insertion per ID.
  - Preserve final-transition safeguards: `ScriptLock`, physical-row phase re-read, timestamp update, flush, write-first/mark-on-success, and no final phase change without the existing confirmation.
  - Exercise later assignment independently using confirmed `solicitud` cases. Preserve the current `ORDEN_DESAPLAZAMIENTO` behavior: absent/empty and `RECIENTE_PRIMERO` use the existing recent-first path; `ANTIGUO_PRIMERO` and altered non-recent values use its existing old-first path and `fechaResultado` comparator, including its established malformed/blank-date behavior.
  - Verify changing `ORDEN_DESAPLAZAMIENTO` after confirmed persistence and before a separate assignment run affects only that later assignment. Reactivation must neither cache nor transport policy state.
  - Run these preservation properties on unfixed code. **EXPECTED OUTCOME: pass.** Keep observations, property seeds, and the no-live-service harness for reruns after the fix.
  - _Requirements: 2.6, 2.11, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13_

- [x] 3. Implement the strict bounded reactivation fix
  - [x] 3.1 Update the reactivation modal contract in `VistaAdmin.html`
    - In `abrirDesarchivarBiometrias()`, visibly render “Máximo 100 por operación” and use a numeric input with `min=1`, `max=100`, and `step=1`.
    - Block local submission outside `1..100`; submit exactly `{ fechaConsultaSai, cantidad }` and no IDs, policy fields, dates auxiliares, or extra keys.
    - Render the backend `CANTIDAD_MAXIMA_EXCEDIDA` message and `maxCantidad` as authoritative; do not invoke/retry SAI from the frontend. Preserve the separate Orden Biometría UI and setter.
    - _Bug_Condition: The UI omits the strict maximum, sends a nonexact request, or treats client constraints as backend authorization._
    - _Expected_Behavior: The UI displays and constrains the 1–100 range while the backend response remains authoritative._
    - _Preservation: Orden Biometría remains a separate later-assignment control._
    - _Requirements: 2.1, 2.14, 2.15, 2.16, 3.7, 3.8_

  - [x] 3.2 Enforce exact validation and zero-effect rejection in `Biometria.js::admin_desarchivarBiometrias(request)`
    - Before SAI, locks, persistence, phase changes, or mutable sheet work, require a non-null, non-array plain object with exactly `fechaConsultaSai` and `cantidad` as own keys.
    - Validate the date as a strict, complete, existing operating-zone `YYYY-MM-DD` calendar day that is not future; validate `cantidad` as a non-coerced numeric safe integer in `1..100`.
    - For an otherwise valid exact request with a strict integer `cantidad > 100`, return the deterministic `CANTIDAD_MAXIMA_EXCEDIDA` response with `maxCantidad:100` and a nonempty maximum message. Perform zero SAI calls, locks, queue/persistence writes, phase writes, or other sheet mutations.
    - For every other invalid request, return a generic validation error without leaking row or SAI details and with the same zero-effect guarantee.
    - _Bug_Condition: Invalid, coercible, extra-key, zero, or over-maximum requests can trigger effects or lack the deterministic maximum response._
    - _Expected_Behavior: `expectedBehavior` rejects every nonexact/out-of-range request before effects and returns the required 101+ shape._
    - _Preservation: Accepted valid requests and existing protected transition mechanisms remain available._
    - _Requirements: 2.2, 2.14, 2.15, 2.16, 2.18_

  - [x] 3.3 Select bounded physical candidates and schedule SAI deterministically
    - Read candidate fields only for physical row identity, phase, ID, and column-60/index-59 `fecha_consulta_sai`. Filter all rows first for `ARCHIVADA` + nonblank ID + valid exact normalized requested day; preserve sheet order; only then take at most accepted `cantidad`, never more than 100.
    - Return a successful informative zero-match result with zero work before SAI, locks, persistence, or phase changes.
    - For every selected physical candidate, issue exactly one individual SAI query. Track attempt time and wait until at least 1,000 ms has elapsed before each consecutive attempt, including after unavailable or ineligible outcomes.
    - Do not read/use/mutate `fechaResultado`, `fecha_actualizacion_fase`, or `ORDEN_DESAPLAZAMIENTO`, and do not access Script Properties in reactivation helpers. Do not sort/deduplicate candidates before SAI; duplicate IDs remain distinct physical candidates.
    - _Bug_Condition: The cap occurs before filtering, a nonmatching row is selected, more than 100 candidates run, a selected row gets zero/multiple SAI calls, cadence is below one second, or assignment policy leaks into reactivation._
    - _Expected_Behavior: `takeInPhysicalOrder(matches, cantidad)` is the sole selection result and every observed consecutive SAI gap is at least 1,000 ms._
    - _Preservation: Duplicate persistence handling and later assignment policy remain unchanged._
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.10, 2.11, 2.12, 2.13, 2.17, 2.18, 3.11, 3.12, 3.13_

  - [x] 3.4 Reuse protected SAI persistence and expose aggregate observability
    - Preserve the exact SAI admission rule and reuse `procesarYGuardarLote` as the only insertion/deduplication route. Only the exact `500` conjunction may continue to confirmed persistence; available ineligible responses use protected `RESUELTA`; unavailable/noninterpretable responses remain retryable `ARCHIVADA`.
    - Retain existing `ScriptLock`, phase re-read, timestamp, flush, write-first/mark-on-success, and per-row confirmation. A phase must not change before its existing persistence/transition result confirms it.
    - Return only aggregate non-PII response metrics: validity/result code, valid `cantidadSolicitada`, `candidatasFiltradas`, `candidatasSeleccionadas`, `intentosSai`, eligible/resolved/retryable counts, duplicate/persistence outcome counts, `esperaSaiMs`, `duracionMs`, and budget status. Never expose IDs, raw SAI payloads, tokens, exception internals, or per-row details.
    - _Bug_Condition: SAI admission is broadened, persistence is bypassed, an unconfirmed row changes phase, or telemetry leaks row-level/PII data._
    - _Expected_Behavior: The exact SAI predicate determines the existing protected outcome while observability stays bounded and aggregate._
    - _Preservation: Existing SAI=500, deduplication, locking, persistence, and later assignment behavior remain intact._
    - _Requirements: 2.7, 2.8, 2.9, 2.13, 2.17, 2.18, 3.1, 3.2, 3.3, 3.4, 3.5, 3.10_

  - [x] 3.5 Verify the exploration properties now pass
    - **Property 1: Expected Behavior** - Rechazo estricto, selección física y cadencia SAI acotada
    - Re-run the exact property suite from task 1; do not write replacement tests. Confirm valid `1` and `100`, deterministic `101+`, coercible-type/extra-key rejection, zero effects, index-59 filter-before-cap, maximum 100 physical candidates, one SAI query per selected row, fake-clock `>=1000 ms` cadence, and aggregate non-PII metrics.
    - Confirm forbidden field/Script Properties traps are untouched throughout reactivation and no candidate outside the filtered/capped sequence changes state.
    - **EXPECTED OUTCOME: pass.**
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 2.9, 2.10, 2.12, 2.13, 2.14, 2.15, 2.17, 2.18_

  - [x] 3.6 Verify the preservation properties still pass
    - **Property 2: Preservation** - Persistencia SAI, cero coincidencias y Orden Biometría posterior
    - Re-run the exact property suite from task 2; do not write replacement tests. Confirm zero-match success and zero work, SAI=`500` admission, unavailable-SAI retry, protected ineligible behavior, persistence/deduplication/locking invariants, and unchanged later Orden Biometría ordering.
    - **EXPECTED OUTCOME: pass.**
    - _Requirements: 2.6, 2.11, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13_

- [x] 4. Checkpoint - Validate bounded reactivation without regressions
  - Run targeted non-watch Vitest unit, property, and mocked integration suites, then the repository test command.
  - Confirm task 1 failed on unfixed code and passes after the fix; task 2 passed on unfixed code and still passes; tests make no live SAI, Sheets, Script Properties, or production calls.
  - Confirm evidence covers: front-end maximum/input attributes; boundaries 1/100/101; coercible types and unexpected keys; deterministic 101+ response and zero effects; index-59 filter-before-cap; maximum 100 physical candidates; exactly one SAI attempt per selected candidate; fake-clock cadence; aggregate non-PII metrics; SAI=`500` persistence; and later Orden Biometría preservation.
  - Ensure all tests pass; ask the user if questions arise.
