# Bugfix Requirements Document

## Introduction

Multiple related bugs in the biometry assignment cycle prevent cases from completing their full lifecycle. These defects cause cases to get stuck indefinitely (Bug 1), create orphan records (Bug 2), use inconsistent spreadsheet references (Bug 3), and incorrectly exclude cases at time boundaries (Bug 4). Together, they degrade the reliability of the biometry escalation and assignment pipeline, requiring manual intervention to resolve cases that should flow through automatically.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `_consultarSaiIndividual()` returns null for a case in WA_ENVIADO phase during `_procesarCortePendientes()` THEN the system skips the case with `continue` and no retry counter is incremented, leaving it stuck in WA_ENVIADO indefinitely across all future cortes without escalation or archival

1.2 WHEN `admin_desarchivarBiometrias()` calls `procesarYGuardarLote(paraReponer)` and the function fails (throws, skips as duplicate, or returns without writing) THEN the system has already marked the cases as "ESCALADA" in pendiente_biometria (via `filasAActualizar`) regardless of write success, creating orphan cases that are marked ESCALADA but not present in the "solicitud" queue

1.3 WHEN `autoAsignarBiometria()` reads pending biometry cases THEN the system opens `ID_WAREHOUSE_USUARIOS` and looks for sheet "solicitud" there, while the escalation cycle (`_procesarCortePendientes → procesarYGuardarLote`) writes to `TARGET_SOLICITUDES_SS_ID`, creating a fragile coupling where both constants must always point to the same spreadsheet without any compile-time or runtime verification

1.4 WHEN a case has fechaResultado exactly at 12:00:00.000 today and the afternoon corte runs THEN the system filters it out (fechaResultadoCaseMs >= limiteLiberacionDesaplazamiento where limite = hoy 12:00:00.000) AND during the morning corte the same case was NOT filtered (fechaResultadoCaseMs >= hoy 00:00:00.000 is true, so it IS filtered), resulting in the case not being offered until the next day's morning session — losing approximately 12-24 hours

### Expected Behavior (Correct)

2.1 WHEN `_consultarSaiIndividual()` returns null for a case in WA_ENVIADO phase during `_procesarCortePendientes()` THEN the system SHALL increment a per-case retry counter (persisted in pendiente_biometria), and after N consecutive failed SAI attempts (configurable, default: 3 cortes ≈ 36h) the system SHALL escalate the case to the assignment queue anyway with a flag indicating SAI did not confirm, rather than leaving it stuck in WA_ENVIADO forever

2.2 WHEN `admin_desarchivarBiometrias()` calls `procesarYGuardarLote(paraReponer)` THEN the system SHALL wrap the call in try/catch and SHALL only mark cases as "ESCALADA" if the write to "solicitud" succeeded; if the write fails, the cases SHALL remain as "ARCHIVADA" in pendiente_biometria (available for retry in a future admin invocation)

2.3 WHEN `autoAsignarBiometria()` reads pending biometry cases THEN the system SHALL read from `TARGET_SOLICITUDES_SS_ID` (the same constant used by the escalation cycle) to guarantee that escalated cases are always visible to the assignment function, eliminating the fragile two-constant coupling

2.4 WHEN a case has fechaResultado exactly at the boundary time (midnight or noon) THEN the system SHALL use a strictly-greater-than comparison (>) instead of greater-than-or-equal (>=) so that the case IS offered in that corte rather than being deferred to the next session

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `_consultarSaiIndividual()` returns a valid response for a case in WA_ENVIADO phase THEN the system SHALL CONTINUE TO escalate it (if still APROBADO_PENDIENTE_BIOMETRIA) or resolve it (if status changed) in the same corte, without being affected by the retry counter logic

3.2 WHEN `_procesarCortePendientes()` encounters a case in WA_ENVIADO whose SAI response returns a non-biometria status THEN the system SHALL CONTINUE TO mark the case as "RESUELTA" in the same corte (unchanged path for resolved cases)

3.3 WHEN `admin_desarchivarBiometrias()` calls `procesarYGuardarLote(paraReponer)` and the write succeeds THEN the system SHALL CONTINUE TO mark those cases as "ESCALADA" and report the count of restored cases to the admin (same behavior as today on success)

3.4 WHEN `autoAsignarBiometria()` successfully reads from the spreadsheet and finds eligible APROBADO_PENDIENTE_BIOMETRIA cases THEN the system SHALL CONTINUE TO assign them respecting cupo limits, ordering by fechaResultado, and filtering by limiteLiberacionDesaplazamiento

3.5 WHEN a case has fechaResultado earlier than the boundary time (e.g., 11:59:59 for the noon boundary) THEN the system SHALL CONTINUE TO offer it in the current corte (no change in behavior for non-boundary cases)

3.6 WHEN a case has fechaResultado later than the boundary time (e.g., 12:00:01 for the noon boundary) THEN the system SHALL CONTINUE TO filter it from the current corte and defer it to the next session

3.7 WHEN `_volcarBloque()` inside `_procesarCortePendientes()` processes cases for escalation THEN the system SHALL CONTINUE TO use the existing protective pattern (try/catch around procesarYGuardarLote, only mark ESCALADA on success)
