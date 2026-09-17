/**
 * Selección física y cadencia de SAI para reactivación de biometrías.
 * Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.10, 2.12, 2.13, 2.17, 2.18
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

const biometriaSource = readFileSync(resolve(process.cwd(), 'Biometria.js'), 'utf8');
const FECHA_SOLICITADA = '2026-04-19';

function crearSelector() {
  const Utilities = {
    formatDate() { return FECHA_SOLICITADA; },
  };
  const factory = new Function(
    'Utilities',
    `${biometriaSource}\nreturn _seleccionarCandidatasDesarchivarBiometrias;`
  );
  return factory(Utilities);
}

function crearProgramador(relojInicial) {
  let reloj = relojInicial;
  function FechaFalsa() {
    return { getTime: () => reloj };
  }
  const Utilities = {
    sleep(ms) { reloj += ms; },
    formatDate() { return FECHA_SOLICITADA; },
  };
  const factory = new Function(
    'Utilities',
    'Date',
    `${biometriaSource}\nreturn _esperarCadenciaSai;`
  );
  return {
    marcarIntento: factory(Utilities, FechaFalsa),
    avanzar: (ms) => { reloj += ms; },
  };
}

function comoColumnas(filas) {
  return {
    ids: filas.map((fila) => [fila.id]),
    fases: filas.map((fila) => [fila.fase]),
    fechas: filas.map((fila) => [fila.fechaConsultaSai]),
  };
}

const arbFilaFisica = fc.record({
  fase: fc.constantFrom('ARCHIVADA', 'ESCALADA', 'RESUELTA', ' archivada '),
  id: fc.constantFrom('', 'SOL-001', 'SOL-002', 'SOL-DUP'),
  fechaConsultaSai: fc.constantFrom(FECHA_SOLICITADA, '2026-04-18', 'fecha-invalida', ''),
});

describe('admin_desarchivarBiometrias candidate selection', () => {
  it('filters physical rows before capping, retains order, and preserves duplicate IDs', () => {
    const seleccionar = crearSelector();
    const filas = [
      { fase: 'ARCHIVADA', id: 'NO-COINCIDE', fechaConsultaSai: '2026-04-18' },
      { fase: 'ESCALADA', id: 'NO-ARCHIVADA', fechaConsultaSai: FECHA_SOLICITADA },
      { fase: 'ARCHIVADA', id: 'DUPLICADA', fechaConsultaSai: FECHA_SOLICITADA },
      { fase: 'ARCHIVADA', id: 'DUPLICADA', fechaConsultaSai: FECHA_SOLICITADA },
      { fase: 'ARCHIVADA', id: 'DESPUES', fechaConsultaSai: FECHA_SOLICITADA },
    ];
    const { ids, fases, fechas } = comoColumnas(filas);

    expect(seleccionar(ids, fases, fechas, FECHA_SOLICITADA, 2)).toEqual([
      { fila: 4, solicitud: 'DUPLICADA' },
      { fila: 5, solicitud: 'DUPLICADA' },
    ]);
  });

  it('selects only exact index-59 matches in physical order for every accepted quantity', () => {
    const seleccionar = crearSelector();
    fc.assert(
      fc.property(
        fc.array(arbFilaFisica, { minLength: 0, maxLength: 160 }),
        fc.integer({ min: 1, max: 100 }),
        (filas, cantidad) => {
          const { ids, fases, fechas } = comoColumnas(filas);
          const esperado = filas
            .map((fila, indice) => ({ fila, indice }))
            .filter(({ fila }) => (
              String(fila.fase).trim().toUpperCase() === 'ARCHIVADA'
              && fila.id !== ''
              && fila.fechaConsultaSai === FECHA_SOLICITADA
            ))
            .slice(0, cantidad)
            .map(({ fila, indice }) => ({ fila: indice + 2, solicitud: fila.id }));

          expect(seleccionar(ids, fases, fechas, FECHA_SOLICITADA, cantidad)).toEqual(esperado);
        }
      ),
      { numRuns: 100, seed: 20260424 }
    );
  });

  it('returns no candidates when no physical row has the requested SAI consultation day', () => {
    const seleccionar = crearSelector();
    const filas = [
      { fase: 'ARCHIVADA', id: 'OTRA-FECHA', fechaConsultaSai: '2026-04-18' },
      { fase: 'ARCHIVADA', id: '', fechaConsultaSai: FECHA_SOLICITADA },
    ];
    const { ids, fases, fechas } = comoColumnas(filas);

    expect(seleccionar(ids, fases, fechas, FECHA_SOLICITADA, 100)).toEqual([]);
  });

  it('spaces every consecutive SAI attempt by at least one second', () => {
    const programador = crearProgramador(0);
    const primerIntento = programador.marcarIntento(null);
    programador.avanzar(250);
    const segundoIntento = programador.marcarIntento(primerIntento);
    programador.avanzar(1500);
    const tercerIntento = programador.marcarIntento(segundoIntento);

    expect(segundoIntento - primerIntento).toBeGreaterThanOrEqual(1000);
    expect(tercerIntento - segundoIntento).toBeGreaterThanOrEqual(1000);
  });
});
