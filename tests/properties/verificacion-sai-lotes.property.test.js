/**
 * Propiedades del cursor de conciliación SAI de biometrías.
 */
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  calcularAvanceLote,
  encontrarIndiceReanudacion,
  ordenarDesdeCursor,
} from '../lib/verificacion-sai-lotes-puro.js';

const arbCandidatos = fc.array(
  fc.stringMatching(/^[0-9]{8}$/),
  { minLength: 1, maxLength: 120 }
).map((solicitudIds) => solicitudIds.map((solicitudId, indice) => ({
  solicitudId,
  filaReal: indice + 2,
})));

const claves = (candidatos) => candidatos.map((candidato) =>
  `${candidato.solicitudId}:${candidato.filaReal}`
);

describe('Cursor de cierre SAI de biometrías', () => {
  it('rota desde el cursor compuesto sin perder ni duplicar candidatos', () => {
    fc.assert(
      fc.property(arbCandidatos, fc.nat(), (candidatos, indice) => {
        const cursor = candidatos[indice % candidatos.length];
        const orden = ordenarDesdeCursor(candidatos, cursor);

        expect(orden).toHaveLength(candidatos.length);
        expect(claves(orden).slice().sort()).toEqual(claves(candidatos).slice().sort());
        expect(orden[0]).toEqual(cursor);
      }),
      { numRuns: 100 }
    );
  });

  it('si el cursor desaparece, continúa desde la primera fila sucesora', () => {
    fc.assert(
      fc.property(arbCandidatos, fc.nat(), (candidatos, indice) => {
        const objetivo = candidatos[indice % candidatos.length];
        const cursorAusente = { solicitudId: '99999999', filaReal: objetivo.filaReal };
        const indiceReanudacion = encontrarIndiceReanudacion(candidatos, cursorAusente);
        const orden = ordenarDesdeCursor(candidatos, cursorAusente);

        expect(indiceReanudacion).toBe(indice % candidatos.length);
        expect(orden[0]).toEqual(objetivo);
      }),
      { numRuns: 100 }
    );
  });

  it('termina la vuelta si el cursor desaparece después de la última fila', () => {
    fc.assert(
      fc.property(arbCandidatos, (candidatos) => {
        const ultimo = candidatos[candidatos.length - 1];
        const cursorAusente = { solicitudId: '99999999', filaReal: ultimo.filaReal + 1 };

        expect(ordenarDesdeCursor(candidatos, cursorAusente)).toEqual([]);
      }),
      { numRuns: 100 }
    );
  });

  it('recorre una vuelta completa en lotes sin reconsultar estados no finales', () => {
    fc.assert(
      fc.property(
        arbCandidatos,
        fc.integer({ min: 1, max: 25 }),
        (candidatos, maximoPorLote) => {
          let cursor = null;
          let limiteCiclo = candidatos[candidatos.length - 1];
          const consultados = [];
          let hasMore = true;
          let proteccion = 0;

          while (hasMore) {
            const resultado = calcularAvanceLote({
              candidatos,
              cursor,
              limiteCiclo,
              maximoPorLote,
              totalIntentados: Math.min(candidatos.length, maximoPorLote),
            });
            const lote = resultado.orden.slice(0, Math.min(maximoPorLote, resultado.cantidadHastaLimite));
            consultados.push(...lote);
            cursor = resultado.siguientePunto;
            limiteCiclo = resultado.limiteCiclo;
            hasMore = resultado.hasMore;
            proteccion += 1;
            expect(proteccion).toBeLessThanOrEqual(candidatos.length + 1);
          }

          expect(consultados).toHaveLength(candidatos.length);
          expect(claves(consultados).slice().sort()).toEqual(claves(candidatos).slice().sort());
        }
      ),
      { numRuns: 100 }
    );
  });
});
