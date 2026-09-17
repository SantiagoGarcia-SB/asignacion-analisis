/**
 * Preservation properties for archive queue reactivation.
 *
 * Observations before the fix (seed 20260419):
 * - No archived candidates returns success without SAI, lock, persistence, phase writes, or flush.
 * - A null SAI response leaves the physical row ARCHIVADA; exact 500 + pending status follows
 *   procesarYGuardarLote and only a confirmed persistence outcome changes its phase.
 * - Later assignment alone reads ORDEN_DESAPLAZAMIENTO and sorts fechaResultado with _parseDateUnif.
 *
 * The current 503 admission is intentionally excluded: it is a documented bug-condition path,
 * not an established behavior to preserve.
 *
 * Validates: Requirements 2.6, 2.11, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13
 */
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  FECHA_NO_INTERPRETABLE,
  FASE_ARCHIVADA,
  FASE_ASIGNADA,
  FASE_ESCALADA,
  FASE_RESUELTA,
  ejecutarReactivacionPreservada,
  normalizarFechaResultado,
  ordenarAsignacionPosterior,
} from '../lib/archive-queue-reactivation-preservation-puro.js';

const PROPERTY_RUN_OPTIONS = { numRuns: 100, seed: 20260419 };
const RESPUESTA_ELEGIBLE = {
  resultCode: '500',
  studyStatus: 'APROBADO_PENDIENTE_BIOMETRIA',
  mainResultCode: '2',
  requestType: 'TS',
};
const RESPUESTA_NO_ELEGIBLE = {
  resultCode: '500',
  studyStatus: 'RECHAZADO',
  mainResultCode: '2',
  requestType: 'TS',
};

/**
 * Crea adaptadores instrumentados sin llamar servicios de Apps Script.
 * @param {(ids: string[]) => {idsInsertados?: string[], idsYaEnSolicitud?: string[], idsYaEnHistorico?: string[]}} resolverPersistencia Resultado confirmado de procesarYGuardarLote.
 * @param {(id: string) => unknown} resolverSai Respuesta individual por ID.
 * @returns {object} Adaptadores y trazas para la observación.
 */
function crearAdaptadores(resolverPersistencia, resolverSai) {
  const trazas = { bloqueos: 0, liberaciones: 0, escrituras: [], flushes: 0 };
  return {
    trazas,
    adaptadores: {
      consultarSai: resolverSai,
      persistir: resolverPersistencia,
      releerFase: () => FASE_ARCHIVADA,
      escribirFase: (fila, fase, marcaTiempo) => trazas.escrituras.push({ fila, fase, marcaTiempo }),
      tomarLock: () => { trazas.bloqueos += 1; },
      liberarLock: () => { trazas.liberaciones += 1; },
      flush: () => { trazas.flushes += 1; },
      ahora: () => '2026-04-19 12:00:00',
    },
  };
}

const arbId = fc.stringMatching(/^[A-Z0-9]{8}$/);
const arbCandidata = arbId.map((id, indice) => ({ id, fila: indice + 2, fase: FASE_ARCHIVADA }));

function candidatosFisicos(ids) {
  return ids.map((id, indice) => ({ id, fila: indice + 2, fase: FASE_ARCHIVADA }));
}

describe('Preservation: archive queue reactivation', () => {
  it('keeps a valid zero-match operation successful and effect-free', () => {
    fc.assert(
      fc.property(fc.constant([]), (sinCoincidencias) => {
        const { adaptadores, trazas } = crearAdaptadores(
          () => { throw new Error('No persistence is allowed for zero matches'); },
          () => { throw new Error('SAI must not be called for zero matches'); }
        );

        const resultado = ejecutarReactivacionPreservada(sinCoincidencias, adaptadores);

        expect(resultado.success).toBe(true);
        expect(resultado.message).toBe('No hay biometrías archivadas para recuperar.');
        expect(resultado.restauradas).toBe(0);
        expect(resultado.yaResueltas).toBe(0);
        expect(resultado.sinRespuestaSai).toBe(0);
        expect(resultado.efectos.saiCalls).toEqual([]);
        expect(resultado.efectos.persistencias).toEqual([]);
        expect(resultado.efectos.lockAttempts).toBe(0);
        expect(resultado.efectos.escrituras).toEqual([]);
        expect(resultado.efectos.flushes).toBe(0);
        expect(trazas).toEqual({ bloqueos: 0, liberaciones: 0, escrituras: [], flushes: 0 });
      }),
      PROPERTY_RUN_OPTIONS
    );
  });

  it('preserves SAI and confirmed-persistence phase outcomes', () => {
    fc.assert(
      fc.property(
        arbId,
        fc.constantFrom('insertada', 'existente', 'historica', 'sinConfirmacion', 'sinRespuesta', 'resuelta'),
        (id, resultadoEsperado) => {
          const candidata = [{ id, fila: 2, fase: FASE_ARCHIVADA }];
          const { adaptadores } = crearAdaptadores(
            () => ({
              idsInsertados: resultadoEsperado === 'insertada' ? [id] : [],
              idsYaEnSolicitud: resultadoEsperado === 'existente' ? [id] : [],
              idsYaEnHistorico: resultadoEsperado === 'historica' ? [id] : [],
            }),
            () => {
              if (resultadoEsperado === 'sinRespuesta') return null;
              if (resultadoEsperado === 'resuelta') return RESPUESTA_NO_ELEGIBLE;
              return RESPUESTA_ELEGIBLE;
            }
          );

          const resultado = ejecutarReactivacionPreservada(candidata, adaptadores);
          const faseFinal = resultado.fasesFinales.get(2);

          expect(resultado.efectos.saiCalls).toEqual([id]);
          if (resultadoEsperado === 'sinRespuesta') {
            expect(faseFinal).toBe(FASE_ARCHIVADA);
            expect(resultado.sinRespuestaSai).toBe(1);
            expect(resultado.efectos.persistencias).toEqual([]);
            expect(resultado.efectos.lockAttempts).toBe(0);
          } else if (resultadoEsperado === 'resuelta') {
            expect(faseFinal).toBe(FASE_RESUELTA);
            expect(resultado.yaResueltas).toBe(1);
            expect(resultado.efectos.persistencias).toEqual([]);
          } else if (resultadoEsperado === 'historica') {
            expect(faseFinal).toBe(FASE_ASIGNADA);
          } else if (resultadoEsperado === 'sinConfirmacion') {
            expect(faseFinal).toBe(FASE_ARCHIVADA);
            expect(resultado.efectos.escrituras).toEqual([]);
          } else {
            expect(faseFinal).toBe(FASE_ESCALADA);
            expect(resultado.restauradas).toBe(1);
          }
        }
      ),
      PROPERTY_RUN_OPTIONS
    );
  });

  it('preserves duplicate physical candidate calls while persistence inserts each ID once', () => {
    fc.assert(
      fc.property(arbId, fc.integer({ min: 2, max: 8 }), (id, repeticiones) => {
        const candidatas = candidatosFisicos(Array.from({ length: repeticiones }, () => id));
        const { adaptadores } = crearAdaptadores(
          (ids) => ({ idsInsertados: [...new Set(ids)] }),
          () => RESPUESTA_ELEGIBLE
        );

        const resultado = ejecutarReactivacionPreservada(candidatas, adaptadores);

        expect(resultado.efectos.saiCalls).toEqual(Array(repeticiones).fill(id));
        expect(resultado.efectos.persistencias).toEqual([Array(repeticiones).fill(id)]);
        expect(resultado.restauradas).toBe(repeticiones);
        expect([...resultado.fasesFinales.values()]).toEqual(Array(repeticiones).fill(FASE_ESCALADA));
      }),
      PROPERTY_RUN_OPTIONS
    );
  });

  it('preserves lock, re-read, timestamp, flush, and write-first safeguards', () => {
    fc.assert(
      fc.property(fc.array(arbId, { minLength: 1, maxLength: 12 }), (ids) => {
        const candidatas = candidatosFisicos(ids);
        const { adaptadores, trazas } = crearAdaptadores(
          (idsParaPersistir) => ({ idsInsertados: [...new Set(idsParaPersistir)] }),
          () => RESPUESTA_ELEGIBLE
        );

        const resultado = ejecutarReactivacionPreservada(candidatas, adaptadores);

        expect(resultado.efectos.persistencias).toEqual([ids]);
        expect(resultado.efectos.lockAttempts).toBe(1);
        expect(resultado.efectos.relecturas).toEqual(candidatas.map((candidata) => candidata.fila));
        expect(resultado.efectos.escrituras).toHaveLength(candidatas.length);
        expect(resultado.efectos.escrituras.every((escritura) => (
          escritura.fase === FASE_ESCALADA && escritura.marcaTiempo === '2026-04-19 12:00:00'
        ))).toBe(true);
        expect(resultado.efectos.flushes).toBe(1);
        expect(trazas.bloqueos).toBe(1);
        expect(trazas.liberaciones).toBe(1);
        expect(trazas.flushes).toBe(1);
      }),
      PROPERTY_RUN_OPTIONS
    );
  });

  it('keeps policy handling in later assignment, including blank and malformed result dates', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1_600_000_000_000, max: 1_800_000_000_000 }), { minLength: 2, maxLength: 16 }),
        (marcasTiempo) => {
          const casosConfirmados = marcasTiempo.map((marcaTiempo, indice) => ({
            id: `ID${indice}`,
            fechaResultado: new Date(marcaTiempo),
          }));
          casosConfirmados.push({ id: 'VACIA', fechaResultado: '' });
          casosConfirmados.push({ id: 'MALFORMADA', fechaResultado: 'fecha-invalida' });

          const recientePredeterminado = ordenarAsignacionPosterior(casosConfirmados, undefined);
          const recienteExplicito = ordenarAsignacionPosterior(casosConfirmados, 'RECIENTE_PRIMERO');
          const antiguo = ordenarAsignacionPosterior(casosConfirmados, 'ANTIGUO_PRIMERO');
          const valorAlterado = ordenarAsignacionPosterior(casosConfirmados, 'VALOR_ALTERADO');

          expect(recientePredeterminado).toEqual(recienteExplicito);
          expect(valorAlterado).toEqual(antiguo);
          expect(recientePredeterminado.map((caso) => caso.fechaOrden)).toEqual(
            recientePredeterminado.map((caso) => caso.fechaOrden).slice().sort((a, b) => b - a)
          );
          expect(antiguo.map((caso) => caso.fechaOrden)).toEqual(
            antiguo.map((caso) => caso.fechaOrden).slice().sort((a, b) => a - b)
          );
          expect(normalizarFechaResultado('')).toBe(FECHA_NO_INTERPRETABLE);
          expect(normalizarFechaResultado('fecha-invalida')).toBe(FECHA_NO_INTERPRETABLE);
        }
      ),
      PROPERTY_RUN_OPTIONS
    );
  });
});
