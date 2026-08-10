/**
 * Property-Based Tests — Biometria Cycle Integrity Bugs (Exploration)
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 *
 * These tests encode the EXPECTED (correct) behavior. They are designed to
 * FAIL on unfixed code, surfacing counterexamples that prove the four bugs exist.
 *
 * Bug 1: SAI Null Stuck — cases never escalate after repeated null responses
 * Bug 2: Orphan Desarchivar — cases marked ESCALADA even when write fails
 * Bug 3: Dual-Constant — autoAsignarBiometria uses wrong constant name
 * Bug 4: Boundary Off-by-One — cases at exact boundary excluded by >=
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  procesarCasoSaiNull_actual,
  procesarCasoSaiNull_esperado,
  desarchivarBiometrias_actual,
  desarchivarBiometrias_esperado,
  verificarConstanteSolicitud_actual,
  CONSTANTE_USADA_POR_AUTOASIGNAR,
  CONSTANTE_USADA_POR_ESCRIBIR,
  calcularLimiteLiberacion,
  filtrarCandidato_actual,
  filtrarCandidato_esperado,
  procesarCasoSaiNonNull_preservacion,
  desarchivarBiometriasExitoso_preservacion,
  filtrarNoBoundary_preservacion,
  volcarBloque_preservacion,
  asignarConOrden_preservacion,
} from '../lib/biometria-cycle-integrity-puro.js';

// ============================================================
// GENERATORS
// ============================================================

/** Genera un consecutivo válido (8 dígitos) */
const arbConsecutivo = fc.stringMatching(/^[0-9]{8}$/);

/** Genera un threshold de retry (1-10, default en prod: 3) */
const arbThreshold = fc.integer({ min: 1, max: 10 });

/** Genera intentos previos que están POR DEBAJO del threshold */
const arbIntentosBajoThreshold = (threshold) =>
  fc.integer({ min: 0, max: Math.max(0, threshold - 2) });

/** Genera una cantidad de casos para desarchivar (1-20) */
const arbCantidadCasos = fc.integer({ min: 1, max: 20 });

/** Genera un mensaje de error para procesarYGuardarLote */
const arbErrorMessage = fc.oneof(
  fc.constant('Lock timeout'),
  fc.constant('Network error'),
  fc.constant('Quota exceeded'),
  fc.string({ minLength: 1, maxLength: 50 })
);

/** Genera una fecha a cualquier hora del día */
const arbFechaEnDia = fc.record({
  year: fc.integer({ min: 2024, max: 2027 }),
  month: fc.integer({ min: 0, max: 11 }),
  day: fc.integer({ min: 1, max: 28 }),
  hour: fc.integer({ min: 0, max: 23 }),
  minute: fc.integer({ min: 0, max: 59 }),
});

// ============================================================
// Property 1: Bug Condition — SAI Null Stuck
// Validates: Requirement 1.1
// ============================================================

describe('Bug Condition Exploration: Bug 1 — SAI Null Stuck', () => {
  it('After N consecutive null SAI responses (N >= threshold), case MUST be escalated', () => {
    /**
     * This property asserts the EXPECTED behavior: when a case has received
     * threshold-or-more consecutive null responses, it should be escalated.
     *
     * On UNFIXED code: procesarCasoSaiNull_actual never escalates on null,
     * so this will FAIL — proving the bug exists.
     */
    fc.assert(
      fc.property(
        arbConsecutivo,
        arbThreshold,
        (consecutivo, threshold) => {
          // Simulate a case that has already accumulated threshold-1 nulls
          // and receives one more null → should escalate
          const intentosPrevios = threshold - 1;

          const resultado = procesarCasoSaiNull_actual({
            consecutivo,
            fase: 'WA_ENVIADO',
            consultarSaiFn: () => null, // SAI retorna null
            intentosPrevios,
            threshold,
          });

          // EXPECTED: after reaching threshold, case MUST be escalated
          expect(resultado.escalado).toBe(true);
          expect(resultado.nuevaFase).toBe('ESCALADA');
          expect(resultado.intentosActuales).toBe(threshold);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 2: Bug Condition — Orphan Desarchivar
// Validates: Requirement 1.2
// ============================================================

describe('Bug Condition Exploration: Bug 2 — Orphan Desarchivar', () => {
  it('When procesarYGuardarLote throws, cases MUST remain ARCHIVADA (not ESCALADA)', () => {
    /**
     * This property asserts the EXPECTED behavior: if the write to "solicitud"
     * fails, cases should stay as ARCHIVADA.
     *
     * On UNFIXED code: desarchivarBiometrias_actual marks ESCALADA BEFORE calling
     * procesarYGuardarLote, so cases are left as ESCALADA orphans. This will FAIL.
     */
    fc.assert(
      fc.property(
        arbCantidadCasos,
        arbErrorMessage,
        (cantidadCasos, errorMessage) => {
          const casos = Array.from({ length: cantidadCasos }, (_, i) => ({
            consecutivo: String(10000000 + i),
            datosApi: { studyStatus: 'APROBADO_PENDIENTE_BIOMETRIA' },
          }));

          const resultado = desarchivarBiometrias_actual({
            casosParaReponer: casos,
            procesarYGuardarLoteFn: () => { throw new Error(errorMessage); },
          });

          // EXPECTED: when write fails, all cases remain ARCHIVADA
          expect(resultado.exito).toBe(false);
          resultado.faseFinal.forEach((fase) => {
            expect(fase).toBe('ARCHIVADA');
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 3: Bug Condition — Dual-Constant Coupling
// Validates: Requirement 1.3
// ============================================================

describe('Bug Condition Exploration: Bug 3 — Dual-Constant Coupling', () => {
  it('autoAsignarBiometria MUST use TARGET_SOLICITUDES_SS_ID (same as write path)', () => {
    /**
     * This property asserts the EXPECTED behavior: the constant NAMES used for
     * reading (autoAsignar) and writing (procesarYGuardarLote) should be the same
     * constant: TARGET_SOLICITUDES_SS_ID.
     *
     * On UNFIXED code: autoAsignarBiometria uses ID_WAREHOUSE_USUARIOS (a
     * different constant name), creating fragile coupling. This will FAIL.
     */
    fc.assert(
      fc.property(
        fc.constant(null), // no variable input needed — this is a static invariant
        () => {
          // The reading function should use the SAME constant as the writing function
          expect(CONSTANTE_USADA_POR_AUTOASIGNAR).toBe(CONSTANTE_USADA_POR_ESCRIBIR);
        }
      ),
      { numRuns: 1 }
    );
  });
});

// ============================================================
// Property 4: Bug Condition — Boundary Off-by-One
// Validates: Requirement 1.4
// ============================================================

describe('Bug Condition Exploration: Bug 4 — Boundary Off-by-One', () => {
  it('Case with fechaResultado exactly at boundary MUST be INCLUDED (offered, not deferred)', () => {
    /**
     * This property asserts the EXPECTED behavior: a case whose fechaResultado
     * is exactly at the boundary timestamp should be INCLUDED in the current corte.
     *
     * On UNFIXED code: filtrarCandidato_actual uses >= which EXCLUDES the case
     * at exactly the boundary. This will FAIL.
     */
    fc.assert(
      fc.property(
        arbFechaEnDia,
        ({ year, month, day, hour, minute }) => {
          const ahora = new Date(year, month, day, hour, minute, 0, 0);
          const limite = calcularLimiteLiberacion(ahora);
          const limiteMs = limite.getTime();

          // Generate a case with fechaResultado EXACTLY at the boundary
          const fechaResultadoMs = limiteMs;

          // EXPECTED: case at boundary IS included (offered)
          const incluido = filtrarCandidato_actual(fechaResultadoMs, limiteMs);
          expect(incluido).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================
// PRESERVATION PROPERTY TESTS
// These tests MUST PASS on unfixed code — they confirm baseline
// behavior that the fix must not break.
// ============================================================

// ============================================================
// Property 5: Preservation — Normal SAI Response Processing
// Validates: Requirements 3.1, 3.2
// ============================================================

describe('Preservation: Property 5 — Normal SAI Response Processing', () => {
  /**
   * Observation on UNFIXED code:
   * When _consultarSaiIndividual() returns non-null, the case is immediately
   * processed: escalated (if APROBADO_PENDIENTE_BIOMETRIA) or resolved (if
   * status changed). This is the correct path that must be preserved.
   */

  /** Genera un studyStatus que ES APROBADO_PENDIENTE_BIOMETRIA (case insensitive, padded) */
  const arbStatusAprobado = fc.constantFrom(
    'APROBADO_PENDIENTE_BIOMETRIA',
    'aprobado_pendiente_biometria',
    ' APROBADO_PENDIENTE_BIOMETRIA ',
    'Aprobado_Pendiente_Biometria'
  );

  /** Genera un studyStatus que NO es APROBADO_PENDIENTE_BIOMETRIA */
  const arbStatusResuelto = fc.constantFrom(
    'APROBADO',
    'RECHAZADO',
    'COMPLETADO',
    'DESISTIDO',
    'EN_PROCESO',
    'CANCELADO',
    ''
  );

  it('Non-null SAI response with APROBADO_PENDIENTE_BIOMETRIA → ESCALADA', () => {
    fc.assert(
      fc.property(
        arbConsecutivo,
        arbStatusAprobado,
        (consecutivo, studyStatus) => {
          const resultado = procesarCasoSaiNonNull_preservacion({
            consecutivo,
            datosApi: { studyStatus },
          });

          // MUST escalate when still pending biometria
          expect(resultado.nuevaFase).toBe('ESCALADA');
          expect(resultado.escalado).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Non-null SAI response with non-biometria status → RESUELTA', () => {
    fc.assert(
      fc.property(
        arbConsecutivo,
        arbStatusResuelto,
        (consecutivo, studyStatus) => {
          const resultado = procesarCasoSaiNonNull_preservacion({
            consecutivo,
            datosApi: { studyStatus },
          });

          // MUST resolve when status changed away from biometria
          expect(resultado.nuevaFase).toBe('RESUELTA');
          expect(resultado.escalado).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 6: Preservation — Successful Desarchivar Write Path
// Validates: Requirements 3.3
// ============================================================

describe('Preservation: Property 6 — Successful Desarchivar Write Path', () => {
  /**
   * Observation on UNFIXED code:
   * When procesarYGuardarLote succeeds, cases are marked ESCALADA and
   * admin sees the restoration count. This is correct and must be preserved.
   */

  it('Successful procesarYGuardarLote → all cases ESCALADA + correct admin message', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        (cantidadCasos) => {
          const casos = Array.from({ length: cantidadCasos }, (_, i) => ({
            consecutivo: String(10000000 + i),
            datosApi: { studyStatus: 'APROBADO_PENDIENTE_BIOMETRIA' },
          }));

          let llamado = false;
          const resultado = desarchivarBiometriasExitoso_preservacion({
            casosParaReponer: casos,
            procesarYGuardarLoteFn: (c) => { llamado = true; },
          });

          // MUST mark all cases as ESCALADA
          expect(resultado.exito).toBe(true);
          expect(resultado.faseFinal.length).toBe(cantidadCasos);
          resultado.faseFinal.forEach((fase) => {
            expect(fase).toBe('ESCALADA');
          });

          // MUST report correct count to admin
          expect(resultado.mensajeAdmin).toBe(
            `Se repusieron ${cantidadCasos} caso(s) en la cola de asignación`
          );

          // MUST have called procesarYGuardarLote
          expect(llamado).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Empty cases list → no operation, success', () => {
    const resultado = desarchivarBiometriasExitoso_preservacion({
      casosParaReponer: [],
      procesarYGuardarLoteFn: () => { throw new Error('Should not be called'); },
    });

    expect(resultado.exito).toBe(true);
    expect(resultado.faseFinal).toEqual([]);
    expect(resultado.mensajeAdmin).toBe('No hay casos para reponer');
  });
});

// ============================================================
// Property 7: Preservation — Non-Boundary Case Filtering
// Validates: Requirements 3.4, 3.5, 3.6
// ============================================================

describe('Preservation: Property 7 — Non-Boundary Case Filtering', () => {
  /**
   * Observation on UNFIXED code:
   * For fechaResultado values NOT exactly at the boundary:
   * - Strictly before boundary → INCLUDED (offered to analyst)
   * - Strictly after boundary → EXCLUDED (deferred to next session)
   *
   * Both >= and > produce the SAME result for non-boundary values.
   * This behavior must be preserved after the fix.
   */

  /** Genera un timestamp estrictamente ANTES del límite (offset negativo de 1ms a 24h) */
  const arbOffsetAntes = fc.integer({ min: 1, max: 24 * 60 * 60 * 1000 });

  /** Genera un timestamp estrictamente DESPUÉS del límite (offset positivo de 1ms a 24h) */
  const arbOffsetDespues = fc.integer({ min: 1, max: 24 * 60 * 60 * 1000 });

  it('fechaResultado strictly BEFORE boundary → both operators agree: INCLUDE', () => {
    fc.assert(
      fc.property(
        arbFechaEnDia,
        arbOffsetAntes,
        ({ year, month, day, hour, minute }, offset) => {
          const ahora = new Date(year, month, day, hour, minute, 0, 0);
          const limite = calcularLimiteLiberacion(ahora);
          const limiteMs = limite.getTime();

          // Strictly before boundary
          const fechaResultadoMs = limiteMs - offset;

          const resultado = filtrarNoBoundary_preservacion(fechaResultadoMs, limiteMs);

          // Both operators MUST include (agree)
          expect(resultado.incluidoConActual).toBe(true);
          expect(resultado.incluidoConFix).toBe(true);
          expect(resultado.coinciden).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('fechaResultado strictly AFTER boundary → both operators agree: EXCLUDE', () => {
    fc.assert(
      fc.property(
        arbFechaEnDia,
        arbOffsetDespues,
        ({ year, month, day, hour, minute }, offset) => {
          const ahora = new Date(year, month, day, hour, minute, 0, 0);
          const limite = calcularLimiteLiberacion(ahora);
          const limiteMs = limite.getTime();

          // Strictly after boundary
          const fechaResultadoMs = limiteMs + offset;

          const resultado = filtrarNoBoundary_preservacion(fechaResultadoMs, limiteMs);

          // Both operators MUST exclude (agree)
          expect(resultado.incluidoConActual).toBe(false);
          expect(resultado.incluidoConFix).toBe(false);
          expect(resultado.coinciden).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ============================================================
// Preservation — _volcarBloque Protective Pattern
// Validates: Requirement 3.7
// ============================================================

describe('Preservation: _volcarBloque Protective Pattern', () => {
  /**
   * Observation on UNFIXED code:
   * _volcarBloque() already has the correct pattern:
   * - try { procesarYGuardarLote(); marca ESCALADA } catch { no marca }
   * This must be preserved.
   */

  it('procesarYGuardarLote success → all cases ESCALADA', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (cantidadCasos) => {
          const bloque = Array.from({ length: cantidadCasos }, (_, i) => ({
            consecutivo: String(20000000 + i),
            faseAnterior: 'WA_ENVIADO',
          }));

          const resultado = volcarBloque_preservacion({
            bloque,
            procesarYGuardarLoteFn: () => {}, // éxito
          });

          expect(resultado.exito).toBe(true);
          expect(resultado.faseFinal.length).toBe(cantidadCasos);
          resultado.faseFinal.forEach((fase) => {
            expect(fase).toBe('ESCALADA');
          });
          expect(resultado.error).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('procesarYGuardarLote failure → cases remain in previous phase', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        arbErrorMessage,
        (cantidadCasos, errorMsg) => {
          const bloque = Array.from({ length: cantidadCasos }, (_, i) => ({
            consecutivo: String(20000000 + i),
            faseAnterior: 'WA_ENVIADO',
          }));

          const resultado = volcarBloque_preservacion({
            bloque,
            procesarYGuardarLoteFn: () => { throw new Error(errorMsg); },
          });

          expect(resultado.exito).toBe(false);
          expect(resultado.faseFinal.length).toBe(cantidadCasos);
          resultado.faseFinal.forEach((fase) => {
            expect(fase).toBe('WA_ENVIADO'); // preserved original phase
          });
          expect(resultado.error).toBe(errorMsg);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Preservation — Assignment Ordering (Cupo + FechaResultado)
// Validates: Requirement 3.4
// ============================================================

describe('Preservation: Assignment Ordering (Cupo + FechaResultado)', () => {
  /**
   * Observation on UNFIXED code:
   * Cases are ordered by fechaResultado ascending (oldest first),
   * limited by cupo, and filtered to only include those strictly
   * before the boundary. This ordering logic is unchanged.
   */

  /** Genera un caso con fechaResultado estrictamente antes del límite */
  const arbCasoAntesDeLimite = (limiteMs) =>
    fc.record({
      consecutivo: arbConsecutivo,
      fechaResultadoMs: fc.integer({
        min: limiteMs - 30 * 24 * 60 * 60 * 1000, // up to 30 days before
        max: limiteMs - 1, // strictly before
      }),
    });

  it('Cases are selected in fechaResultado ascending order, limited by cupo', () => {
    fc.assert(
      fc.property(
        arbFechaEnDia,
        fc.integer({ min: 1, max: 10 }), // cupo
        fc.integer({ min: 2, max: 15 }), // num cases
        ({ year, month, day, hour, minute }, cupo, numCases) => {
          const ahora = new Date(year, month, day, hour, minute, 0, 0);
          const limite = calcularLimiteLiberacion(ahora);
          const limiteMs = limite.getTime();

          // Generate cases all before the boundary with distinct timestamps
          const casosDisponibles = Array.from({ length: numCases }, (_, i) => ({
            consecutivo: String(30000000 + i),
            fechaResultadoMs: limiteMs - (numCases - i) * 60000, // spaced 1 min apart
          }));

          const resultado = asignarConOrden_preservacion({
            casosDisponibles,
            cupoDisponible: cupo,
            limiteMs,
          });

          // MUST respect cupo limit
          expect(resultado.cantidadAsignada).toBeLessThanOrEqual(cupo);

          // MUST be ordered by fechaResultado ascending
          for (let i = 1; i < resultado.casosSeleccionados.length; i++) {
            expect(resultado.casosSeleccionados[i].fechaResultadoMs)
              .toBeGreaterThanOrEqual(resultado.casosSeleccionados[i - 1].fechaResultadoMs);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Cases strictly after boundary are excluded from assignment', () => {
    fc.assert(
      fc.property(
        arbFechaEnDia,
        fc.integer({ min: 1, max: 10 }),
        ({ year, month, day, hour, minute }, cupo) => {
          const ahora = new Date(year, month, day, hour, minute, 0, 0);
          const limite = calcularLimiteLiberacion(ahora);
          const limiteMs = limite.getTime();

          // All cases AFTER boundary
          const casosDisponibles = Array.from({ length: 5 }, (_, i) => ({
            consecutivo: String(40000000 + i),
            fechaResultadoMs: limiteMs + (i + 1) * 60000, // after boundary
          }));

          const resultado = asignarConOrden_preservacion({
            casosDisponibles,
            cupoDisponible: cupo,
            limiteMs,
          });

          // No cases should be selected — all are after boundary
          expect(resultado.cantidadAsignada).toBe(0);
          expect(resultado.casosSeleccionados).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Zero cupo → no cases assigned regardless of availability', () => {
    fc.assert(
      fc.property(
        arbFechaEnDia,
        fc.integer({ min: 1, max: 10 }),
        ({ year, month, day, hour, minute }, numCases) => {
          const ahora = new Date(year, month, day, hour, minute, 0, 0);
          const limite = calcularLimiteLiberacion(ahora);
          const limiteMs = limite.getTime();

          const casosDisponibles = Array.from({ length: numCases }, (_, i) => ({
            consecutivo: String(50000000 + i),
            fechaResultadoMs: limiteMs - (i + 1) * 60000,
          }));

          const resultado = asignarConOrden_preservacion({
            casosDisponibles,
            cupoDisponible: 0,
            limiteMs,
          });

          expect(resultado.cantidadAsignada).toBe(0);
          expect(resultado.casosSeleccionados).toEqual([]);
        }
      ),
      { numRuns: 50 }
    );
  });
});
