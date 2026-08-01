# Bugfix Requirements Document

## Introduction

`RequestLeadUnificado` (MotorAsignacion.js, línea 519) adquiere el `ScriptLock` al inicio de la función y lo mantiene durante toda su ejecución (~3-7 segundos), bloqueando a todos los demás analistas. Con 40 analistas activos simultáneamente, esto genera retrasos en cascada donde cada analista espera detrás de los anteriores (waitLock 25s). El lock solo debería mantenerse durante la sección crítica: la escritura de la asignación y verificación de disponibilidad.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `RequestLeadUnificado` is invoked THEN the system acquires ScriptLock before performing any read operations (openById, getValues, conteo, recolección de pendientes, ordenamiento) holding it for ~3-7 seconds total

1.2 WHEN multiple analysts (N>1) invoke `RequestLeadUnificado` concurrently THEN analysts 2 through N wait sequentially in queue (waitLock 25s), experiencing cumulative delays of up to N × 3-7 seconds before their request is processed

1.3 WHEN more than ~4-7 analysts are queued simultaneously THEN later analysts exceed the 25-second waitLock timeout and receive "Sistema ocupado" errors despite the system being functionally available (projected from code analysis: 25s timeout ÷ 3-7s per invocation = 3-8 concurrent analysts max before timeouts occur; frontend adaptive backoff for "ocupado" confirms this occurs in production)

1.4 WHEN automated triggers (limpiarBiometriasResueltas, eliminarSolicitudesFinalizadas, _enviarPrimerContactoBiometria) acquire the same ScriptLock during business hours THEN they add 5-30 seconds of additional contention on top of analyst-to-analyst queuing, because GAS only provides one project-wide lock

1.5 WHEN `autoAsignarBiometria` is invoked (same entry point as RequestLeadUnificado, from the biometría analyst frontend) THEN it exhibits the same anti-pattern: lock acquired before all reads, held 3-7s during openById + getDataRange + iteration + SAI-independent computation

### Expected Behavior (Correct)

2.1 WHEN `RequestLeadUnificado` is invoked THEN the system SHALL perform all read operations (openById, getValues, conteo, recolección de pendientes, ordenamiento y selección de candidatos) WITHOUT holding the ScriptLock

2.2 WHEN the system is ready to write an assignment THEN it SHALL acquire the ScriptLock, re-verify that the selected case is still available, write the assignment, flush, and release the lock in less than ~1 second

2.3 WHEN re-verification inside the lock finds the selected case is no longer available (already assigned by another analyst) THEN the system SHALL retry with the next candidate from the pre-computed sorted list without releasing and re-acquiring the lock, up to a maximum of 3 retry attempts

2.4 WHEN all pre-computed candidates have been consumed by other analysts during re-verification OR the maximum retry count (3) is exhausted THEN the system SHALL release the lock and return a message indicating no cases are currently available, prompting the analyst to retry

2.5 WHEN multiple analysts invoke `RequestLeadUnificado` concurrently THEN the lock contention window SHALL be reduced to <1 second per analyst, allowing significantly more analysts to be served within the 25-second waitLock window

### Unchanged Behavior (Regression Prevention)

3.1 WHEN two analysts request cases concurrently and both pre-read the same pending case THEN the system SHALL CONTINUE TO guarantee that only one analyst is assigned that case (mutual exclusion via lock + re-verification)

3.2 WHEN a case is assigned to an analyst THEN the system SHALL CONTINUE TO perform the assignment atomically: the case is either fully assigned (row updated, moved to Historico_Gestiones, flush completed) or not assigned at all

3.3 WHEN an analyst has reached their cupo limit for a given type THEN the system SHALL CONTINUE TO prevent additional assignments of that type, respecting daily quotas

3.4 WHEN pending cases are evaluated for assignment THEN the system SHALL CONTINUE TO apply the same sorting/priority logic (_ordenarYSeleccionarCandidatos) producing identical candidate ordering

3.5 WHEN an analyst's estado is not ACTIVO, turno is not active, or has a permiso vigente THEN the system SHALL CONTINUE TO reject the request before any assignment attempt

3.6 WHEN a biometría (desaplazamiento) case is assigned THEN the system SHALL CONTINUE TO register it in pendiente_biometria with status "ASIGNADA"

---

## Bug Condition (Formal)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type RequestLeadInvocation
  OUTPUT: boolean
  
  // The bug manifests whenever the lock is acquired before read operations,
  // which is EVERY invocation in the current code
  RETURN X.concurrentAnalysts > 0
END FUNCTION
```

The bug condition is effectively always true — every invocation holds the lock during reads. The severity scales with concurrency: the more analysts active simultaneously, the worse the cascading delay.

```pascal
// Property: Fix Checking - Lock Duration Reduction
FOR ALL X WHERE isBugCondition(X) DO
  result ← RequestLeadUnificado'(X)
  ASSERT lockHeldDuration(result) < 1s
  AND readOperationsPerformedOutsideLock(result) = true
  AND assignmentIsAtomic(result) = true
END FOR
```

```pascal
// Property: Preservation Checking - Mutual Exclusion
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT RequestLeadUnificado(X) = RequestLeadUnificado'(X)
END FOR

// Additional Preservation: Race Condition Safety
FOR ALL (A, B) WHERE A.selectedCase = B.selectedCase DO
  result_A ← RequestLeadUnificado'(A)
  result_B ← RequestLeadUnificado'(B)
  ASSERT NOT (result_A.assignedCase = result_B.assignedCase)
  // Only one analyst gets assigned the disputed case
END FOR
```
