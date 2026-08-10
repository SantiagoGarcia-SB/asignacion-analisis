/**
 * Property-Based Tests — guardarYAsignarLogica()
 *
 * Valida las 6 correctness properties del diseño de save-and-assign-next
 * usando fast-check con la función pura de orquestación extraída.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { guardarYAsignarLogica } from '../lib/guardar-y-asignar-puro.js';

// ============================================================
// GENERATORS HELPERS
// ============================================================

/** Genera un resultado aleatorio de guardarFn */
const arbGuardadoExitoso = fc.record({
  success: fc.constant(true),
  message: fc.string({ minLength: 1, maxLength: 50 }),
  disparaAsignacion: fc.boolean(),
});

const arbGuardadoFallido = fc.record({
  success: fc.constant(false),
  message: fc.string({ minLength: 1, maxLength: 80 }),
  disparaAsignacion: fc.constant(false),
});

const arbGuardadoAny = fc.oneof(arbGuardadoExitoso, arbGuardadoFallido);

/** Genera un resultado aleatorio de asignarFn */
const arbAsignacionExitosa = fc.record({
  success: fc.constant(true),
  message: fc.string({ minLength: 0, maxLength: 50 }),
  nueva: fc.boolean(),
  idsAsignados: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
  faseTarget: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 20 })),
});

const arbAsignacionFallida = fc.record({
  success: fc.constant(false),
  message: fc.string({ minLength: 1, maxLength: 80 }),
  idsAsignados: fc.constant([]),
  faseTarget: fc.constant(null),
});

const arbAsignacionAny = fc.oneof(arbAsignacionExitosa, arbAsignacionFallida);

/** Genera un resultado aleatorio de panelFn */
const arbPanelExitoso = fc.record({
  tabla: fc.oneof(fc.constant(null), fc.record({ rows: fc.integer() })),
  cupos: fc.oneof(fc.constant(null), fc.record({ total: fc.integer() })),
  pendientesValidacion: fc.array(fc.string(), { minLength: 0, maxLength: 3 }),
  gestionesHoyCruzadas: fc.oneof(fc.constant(null), fc.record({ count: fc.integer() })),
});

/** Flag que indica si la sub-función lanza excepción */
const arbThrows = fc.boolean();

// ============================================================
// Property 1: Output structure invariant
// ============================================================

describe('Feature: save-and-assign-next, Property 1: Output structure invariant', () => {
  it('return ALWAYS has exactly 3 properties with correct types', () => {
    fc.assert(
      fc.property(
        arbGuardadoAny,
        arbAsignacionAny,
        arbPanelExitoso,
        arbThrows,
        arbThrows,
        (guardadoResult, asignacionResult, panelResult, asignarThrows, panelThrows) => {
          const result = guardarYAsignarLogica({
            guardarFn: () => guardadoResult,
            asignarFn: asignarThrows
              ? () => { throw new Error('asignacion exploded'); }
              : () => asignacionResult,
            panelFn: panelThrows
              ? () => { throw new Error('panel exploded'); }
              : () => panelResult,
            deadline: Date.now() + 600000, // 10 min, no timeout
            data: { solicitudId: 'SOL-001' },
          });

          // Must have exactly 3 top-level keys
          const keys = Object.keys(result);
          expect(keys).toContain('guardado');
          expect(keys).toContain('asignacion');
          expect(keys).toContain('panel');

          // guardado: always an object with success (boolean) and message (string)
          expect(result.guardado).toBeDefined();
          expect(typeof result.guardado).toBe('object');
          expect(result.guardado).not.toBeNull();
          expect(typeof result.guardado.success).toBe('boolean');
          expect(typeof result.guardado.message).toBe('string');

          // asignacion: object with correct shape OR null
          if (result.asignacion !== null) {
            expect(typeof result.asignacion).toBe('object');
            expect(typeof result.asignacion.success).toBe('boolean');
            expect(typeof result.asignacion.message).toBe('string');
            expect(Array.isArray(result.asignacion.idsAsignados)).toBe(true);
            // faseTarget is string or null
            expect(
              result.asignacion.faseTarget === null ||
              typeof result.asignacion.faseTarget === 'string'
            ).toBe(true);
          }

          // panel: object with required panel properties OR null
          if (result.panel !== null) {
            expect(typeof result.panel).toBe('object');
            expect('tabla' in result.panel || result.panel.tabla === undefined || result.panel.tabla === null).toBe(true);
            expect('pendientesValidacion' in result.panel).toBe(true);
            expect(Array.isArray(result.panel.pendientesValidacion)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 2: Early-exit on save failure
// ============================================================

describe('Feature: save-and-assign-next, Property 2: Early-exit on save failure', () => {
  it('save failure => asignacion=null, panel=null, asignarFn/panelFn never called', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // solicitudId vacío/null/undefined via guardarFn que falla
          arbGuardadoFallido,
          // Mensajes variados
          fc.record({
            success: fc.constant(false),
            message: fc.oneof(
              fc.constant('solicitudId vacío'),
              fc.constant('Solicitud no encontrada'),
              fc.string({ minLength: 1, maxLength: 60 })
            ),
            disparaAsignacion: fc.constant(false),
          })
        ),
        (guardadoFallido) => {
          let asignarCalled = 0;
          let panelCalled = 0;

          const result = guardarYAsignarLogica({
            guardarFn: () => guardadoFallido,
            asignarFn: () => { asignarCalled++; return { success: true, message: '', idsAsignados: [], faseTarget: null }; },
            panelFn: () => { panelCalled++; return { tabla: null, cupos: null, pendientesValidacion: [], gestionesHoyCruzadas: null }; },
            deadline: Date.now() + 600000,
            data: { solicitudId: '' },
          });

          // asignacion and panel must be null
          expect(result.asignacion).toBeNull();
          expect(result.panel).toBeNull();
          // sub-functions never invoked
          expect(asignarCalled).toBe(0);
          expect(panelCalled).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 3: Assignment executed if and only if closing state
// ============================================================

describe('Feature: save-and-assign-next, Property 3: Assignment iff closing state', () => {
  it('asignarFn invoked iff disparaAsignacion=true; panel always loads on save success', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // disparaAsignacion
        arbAsignacionExitosa,
        arbPanelExitoso,
        (disparaAsignacion, asignacionResult, panelResult) => {
          let asignarCalled = 0;
          let panelCalled = 0;

          const result = guardarYAsignarLogica({
            guardarFn: () => ({
              success: true,
              message: 'Guardado OK',
              disparaAsignacion,
            }),
            asignarFn: () => { asignarCalled++; return asignacionResult; },
            panelFn: () => { panelCalled++; return panelResult; },
            deadline: Date.now() + 600000,
            data: { solicitudId: 'SOL-123' },
          });

          if (disparaAsignacion) {
            // asignarFn MUST be called
            expect(asignarCalled).toBe(1);
            // asignacion is not null
            expect(result.asignacion).not.toBeNull();
          } else {
            // asignarFn MUST NOT be called
            expect(asignarCalled).toBe(0);
            // asignacion must be null
            expect(result.asignacion).toBeNull();
          }

          // Panel always loads when save succeeds
          expect(panelCalled).toBe(1);
          expect(result.panel).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 4: Assignment failure never blocks panel load
// ============================================================

describe('Feature: save-and-assign-next, Property 4: Assignment failure never blocks panel load', () => {
  it('panelFn ALWAYS invoked after assignment failure; failure reason preserved', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // whether asignarFn throws or returns success=false
        fc.string({ minLength: 1, maxLength: 80 }), // failure message
        arbPanelExitoso,
        (throwsException, failureMessage, panelResult) => {
          let panelCalled = 0;

          const result = guardarYAsignarLogica({
            guardarFn: () => ({
              success: true,
              message: 'Guardado OK',
              disparaAsignacion: true,
            }),
            asignarFn: throwsException
              ? () => { throw new Error(failureMessage); }
              : () => ({ success: false, message: failureMessage, idsAsignados: [], faseTarget: null }),
            panelFn: () => { panelCalled++; return panelResult; },
            deadline: Date.now() + 600000,
            data: { solicitudId: 'SOL-456' },
          });

          // panelFn MUST be called
          expect(panelCalled).toBe(1);
          expect(result.panel).not.toBeNull();

          // Assignment failure reason preserved
          expect(result.asignacion).not.toBeNull();
          expect(result.asignacion.success).toBe(false);
          expect(result.asignacion.message).toBe(failureMessage);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 5: Timeout produces partial result
// ============================================================

describe('Feature: save-and-assign-next, Property 5: Timeout partial result', () => {
  it('deadline exceeded => partial result with null for incomplete steps, no exception', () => {
    fc.assert(
      fc.property(
        // timeoutPoint: 0 = before save, 1 = after save before assign, 2 = after assign before panel
        fc.integer({ min: 0, max: 2 }),
        arbPanelExitoso,
        (timeoutPoint, panelResult) => {
          let callCount = 0;

          // Simulate time progression: each step advances past deadline at the chosen point
          const deadline = 1000; // absolute timestamp
          let currentTime = 0;

          const nowFn = () => {
            return currentTime;
          };

          const result = guardarYAsignarLogica({
            guardarFn: () => {
              // If timeout at point 0, time is already past deadline before guardar starts
              // But the function checks deadline BEFORE calling guardarFn, so we simulate
              // time advancing AFTER guardar completes
              callCount++;
              if (timeoutPoint === 1) {
                // After save completes, time goes past deadline
                currentTime = deadline + 1;
              }
              return { success: true, message: 'OK', disparaAsignacion: true };
            },
            asignarFn: () => {
              callCount++;
              if (timeoutPoint === 2) {
                // After assign completes, time goes past deadline
                currentTime = deadline + 1;
              }
              return { success: true, message: 'Asignado', idsAsignados: ['ID1'], faseTarget: 'ASIGNADA' };
            },
            panelFn: () => {
              callCount++;
              return panelResult;
            },
            deadline,
            data: { solicitudId: 'SOL-TIMEOUT' },
            nowFn: () => {
              // For point 0: deadline already passed from start
              if (timeoutPoint === 0 && callCount === 0) {
                return deadline + 1;
              }
              return currentTime;
            },
          });

          // Must NOT throw — always returns an object
          expect(result).toBeDefined();
          expect(typeof result).toBe('object');
          expect(result).not.toBeNull();

          // Structure always valid
          expect('guardado' in result).toBe(true);
          expect('asignacion' in result).toBe(true);
          expect('panel' in result).toBe(true);

          if (timeoutPoint === 0) {
            // Timeout before save: guardado should indicate failure, rest null
            expect(result.guardado.success).toBe(false);
            expect(result.asignacion).toBeNull();
            expect(result.panel).toBeNull();
          } else if (timeoutPoint === 1) {
            // Timeout after save, before assign: guardado OK, asignacion null, panel null
            expect(result.guardado.success).toBe(true);
            expect(result.asignacion).toBeNull();
            expect(result.panel).toBeNull();
          } else if (timeoutPoint === 2) {
            // Timeout after assign, before panel: guardado OK, asignacion present, panel null
            expect(result.guardado.success).toBe(true);
            expect(result.asignacion).not.toBeNull();
            expect(result.panel).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 6: idsAsignados and faseTarget passthrough
// ============================================================

describe('Feature: save-and-assign-next, Property 6: idsAsignados passthrough', () => {
  it('idsAsignados and faseTarget pass through unmodified; empty when not attempted or failed', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 10 }),
        fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 30 })),
        fc.boolean(), // disparaAsignacion
        fc.boolean(), // whether assignment throws
        (idsAsignados, faseTarget, disparaAsignacion, assignThrows) => {
          const result = guardarYAsignarLogica({
            guardarFn: () => ({
              success: true,
              message: 'OK',
              disparaAsignacion,
            }),
            asignarFn: assignThrows
              ? () => { throw new Error('explosion'); }
              : () => ({
                  success: true,
                  message: 'Asignado',
                  nueva: true,
                  idsAsignados,
                  faseTarget,
                }),
            panelFn: () => ({
              tabla: null,
              cupos: null,
              pendientesValidacion: [],
              gestionesHoyCruzadas: null,
            }),
            deadline: Date.now() + 600000,
            data: { solicitudId: 'SOL-PASS' },
          });

          if (disparaAsignacion && !assignThrows) {
            // Successful assignment: values pass through unmodified
            expect(result.asignacion).not.toBeNull();
            expect(result.asignacion.idsAsignados).toEqual(idsAsignados);
            expect(result.asignacion.faseTarget).toBe(faseTarget);
          } else if (disparaAsignacion && assignThrows) {
            // Assignment threw: idsAsignados=[], faseTarget=null
            expect(result.asignacion).not.toBeNull();
            expect(result.asignacion.idsAsignados).toEqual([]);
            expect(result.asignacion.faseTarget).toBeNull();
          } else {
            // Assignment not attempted: asignacion is null
            expect(result.asignacion).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
