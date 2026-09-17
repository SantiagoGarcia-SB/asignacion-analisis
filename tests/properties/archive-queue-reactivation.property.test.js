/**
 * Exploración de condición de bug — contrato estricto de reactivación (sin fix).
 *
 * Estas propiedades describen el contrato diseñado y DEBEN fallar frente al
 * adaptador de la implementación actual. No llaman servicios de Apps Script.
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 2.9, 2.10, 2.12,
 * 2.13, 2.14, 2.15, 2.17, 2.18
 */
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  candidatosEsperados,
  crearEntornoExploracion,
  ejecutarReactivacionActual,
  expectedBehavior,
  isBugCondition,
} from '../lib/archive-queue-reactivation-puro.js';

const HOY = '2026-04-19';
const RESPUESTA_ELEGIBLE = {
  resultCode: '500', studyStatus: 'APROBADO_PENDIENTE_BIOMETRIA',
  mainResultCode: '2', requestType: 'TS',
};

const arbFilaCoincidente = fc.integer({ min: 1, max: 999999 }).map((numero) => ({
  phase: 'ARCHIVADA',
  solicitudId: `SOL-${numero}`,
  fechaConsultaSai: '2026-04-19',
  fechaActualizacionFase: '2026-04-01T00:00:00.000Z',
  fechaResultado: '2026-01-01',
}));

function ejecutar(request, rows, saiPorSolicitud = {}) {
  const entorno = crearEntornoExploracion({ rows, saiPorSolicitud, hoy: HOY });
  const response = ejecutarReactivacionActual(request, entorno);
  return { response, metricas: entorno.metricas };
}

function sinEfectos(metricas) {
  expect(metricas.saiCalls).toEqual([]);
  expect(metricas.lockAttempts).toBe(0);
  expect(metricas.queueWrites).toBe(0);
  expect(metricas.persistenceCalls).toBe(0);
  expect(metricas.phaseWrites).toBe(0);
  expect(metricas.sheetMutations).toBe(0);
}

describe('Bug Condition: contrato estricto de cien candidatas', () => {
  it('101 devuelve el error máximo exacto y no produce efectos', () => {
    fc.assert(
      fc.property(fc.array(arbFilaCoincidente, { minLength: 1, maxLength: 8 }), (rows) => {
        const request = { fechaConsultaSai: '2026-04-19', cantidad: 101 };
        const saiPorSolicitud = Object.fromEntries(rows.map((row) => [row.solicitudId, RESPUESTA_ELEGIBLE]));
        const { response, metricas } = ejecutar(request, rows, saiPorSolicitud);

        expect(response).toMatchObject({
          success: false,
          errorCode: 'CANTIDAD_MAXIMA_EXCEDIDA',
          maxCantidad: 100,
        });
        expect(response.message).toEqual(expect.any(String));
        expect(response.message.length).toBeGreaterThan(0);
        sinEfectos(metricas);
        expect(isBugCondition({ request, rows, response, metricas, hoy: HOY })).toBe(false);
      }),
      { numRuns: 25, seed: 20260419 }
    );
  });

  it('toda forma o cantidad inválida se rechaza antes de efectos y sin coerción', () => {
    const invalidRequests = [
      { fechaConsultaSai: '2026-04-19', cantidad: '1' },
      { fechaConsultaSai: '2026-04-19', cantidad: 1.5 },
      { fechaConsultaSai: '2026-04-19', cantidad: 0 },
      { fechaConsultaSai: '2026-02-30', cantidad: 1 },
      { fechaConsultaSai: '2026-04-20', cantidad: 1 },
      { fechaConsultaSai: '2026-04-19', cantidad: 1, ordenDesplazamiento: 'ANTIGUO_PRIMERO' },
      { fechaConsultaSai: '2026-04-19' },
      null,
      [],
    ];
    fc.assert(
      fc.property(fc.constantFrom(...invalidRequests), arbFilaCoincidente, (request, row) => {
        const { response, metricas } = ejecutar(request, [row], { [row.solicitudId]: RESPUESTA_ELEGIBLE });
        expect(response.success).toBe(false);
        sinEfectos(metricas);
        expect(isBugCondition({ request, rows: [row], response, metricas, hoy: HOY })).toBe(false);
      }),
      { numRuns: 30, seed: 20260420 }
    );
  });

  it('filtra por índice 59, conserva orden físico y aplica el cap después del filtro', () => {
    const leadingNonmatches = Array.from({ length: 5 }, (_, index) => ({
      phase: 'ARCHIVADA', solicitudId: `LEADING-${index}`,
      fechaConsultaSai: '2026-04-18', fechaActualizacionFase: '2026-04-30T00:00:00.000Z',
      fechaResultado: '1999-01-01',
    }));
    const matches = Array.from({ length: 105 }, (_, index) => ({
      phase: 'ARCHIVADA', solicitudId: `MATCH-${index}`,
      fechaConsultaSai: '2026-04-19', fechaActualizacionFase: '2026-01-01T00:00:00.000Z',
      fechaResultado: `2026-03-${String((index % 28) + 1).padStart(2, '0')}`,
    }));
    const rows = leadingNonmatches.concat(matches);
    const request = { fechaConsultaSai: '2026-04-19', cantidad: 100 };
    const saiPorSolicitud = Object.fromEntries(rows.map((row) => [row.solicitudId, RESPUESTA_ELEGIBLE]));
    const candidatasEsperadas = candidatosEsperados(request, rows, HOY).map((row) => row.solicitudId);
    const { response, metricas } = ejecutar(request, rows, saiPorSolicitud);

    expect(metricas.saiCalls.map((call) => call.solicitud)).toEqual(candidatasEsperadas);
    expect(metricas.saiCalls).toHaveLength(100);
    expect(metricas.saiCalls.some((call) => call.solicitud.startsWith('LEADING-'))).toBe(false);
    expect(isBugCondition({ request, rows, response, metricas, hoy: HOY })).toBe(false);
  });

  it('cada candidata seleccionada se consulta una vez con pausa mínima, incluso tras respuesta no disponible', () => {
    const rows = [
      { phase: 'ARCHIVADA', solicitudId: 'SIN_RESPUESTA', fechaConsultaSai: HOY, fechaActualizacionFase: '2026-01-01', fechaResultado: '2025-01-01' },
      { phase: 'ARCHIVADA', solicitudId: 'ELEGIBLE', fechaConsultaSai: HOY, fechaActualizacionFase: '2026-01-01', fechaResultado: '2025-02-01' },
    ];
    const request = { fechaConsultaSai: HOY, cantidad: 2 };
    const { response, metricas } = ejecutar(request, rows, { ELEGIBLE: RESPUESTA_ELEGIBLE });

    expect(metricas.saiCalls).toHaveLength(2);
    expect(metricas.saiCalls[1].timestampMs - metricas.saiCalls[0].timestampMs).toBeGreaterThanOrEqual(1000);
    expect(isBugCondition({ request, rows, response, metricas, hoy: HOY })).toBe(false);
  });

  it('solo la conjunción exacta SAI=500 puede persistir; 503 debe quedar RESUELTA', () => {
    const row = {
      phase: 'ARCHIVADA', solicitudId: 'CODIGO-503', fechaConsultaSai: HOY,
      fechaActualizacionFase: '2026-01-01', fechaResultado: '2025-01-01',
    };
    const request = { fechaConsultaSai: HOY, cantidad: 1 };
    const { metricas } = ejecutar(request, [row], {
      'CODIGO-503': { ...RESPUESTA_ELEGIBLE, resultCode: '503' },
    });

    expect(metricas.persistenceCalls).toBe(0);
    expect(metricas.queueWrites).toBe(0);
    expect(row.phase).toBe('RESUELTA');
  });

  it('la reactivación no lee fechas prohibidas ni usa propiedades de Orden Biometría', () => {
    fc.assert(
      fc.property(arbFilaCoincidente, (row) => {
        const request = { fechaConsultaSai: HOY, cantidad: 1 };
        const { response, metricas } = ejecutar(request, [row], { [row.solicitudId]: RESPUESTA_ELEGIBLE });
        expect(metricas.forbiddenAccesses).toEqual([]);
        expect(metricas.propertyAccesses).toEqual([]);
        expect(expectedBehavior({ request, rows: [row], hoy: HOY }).success).toBe(true);
        expect(isBugCondition({ request, rows: [row], response, metricas, hoy: HOY })).toBe(false);
      }),
      { numRuns: 10, seed: 20260421 }
    );
  });
});
