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

function crearAgrupador() {
  const factory = new Function(
    `${biometriaSource}\nreturn _agruparArchivadasPorFechaConsultaSai;`
  );
  return factory();
}

function crearNormalizador() {
  const Utilities = {
    // Día operativo "de hoy" fijo y bien futuro para que ninguna fecha de prueba sea futura.
    formatDate() { return '2030-01-01'; },
  };
  const factory = new Function(
    'Utilities',
    `${biometriaSource}\nreturn _normalizarFechaConsultaSaiCandidata;`
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

// Normaliza igual que _normalizarFechaConsultaSaiCandidata para strings (día = primeros 10):
// el formato real de la columna 60 lleva hora ("yyyy-MM-dd HH:mm:ss").
function diaEsperado(valor) {
  return String(valor).trim().slice(0, 10);
}

const arbFilaFisica = fc.record({
  fase: fc.constantFrom('ARCHIVADA', 'ESCALADA', 'RESUELTA', ' archivada '),
  id: fc.constantFrom('', 'SOL-001', 'SOL-002', 'SOL-DUP'),
  fechaConsultaSai: fc.constantFrom(
    FECHA_SOLICITADA,
    FECHA_SOLICITADA + ' 07:24:58',
    '2026-04-18',
    '2026-04-18 23:59:59',
    'fecha-invalida',
    ''
  ),
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
              && diaEsperado(fila.fechaConsultaSai) === FECHA_SOLICITADA
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

describe('_normalizarFechaConsultaSaiCandidata', () => {
  it('extrae el día de un texto "yyyy-MM-dd HH:mm:ss" (formato real de la columna 60)', () => {
    const normalizar = crearNormalizador();
    // Formato exacto con que se persiste fila[59] = ahora en _guardarLoteBiometriaPendiente.
    expect(normalizar('2026-07-01 07:24:58')).toBe('2026-07-01');
    expect(normalizar('  2026-07-01 07:24:58  ')).toBe('2026-07-01');
  });

  it('sigue aceptando un día puro yyyy-MM-dd', () => {
    const normalizar = crearNormalizador();
    expect(normalizar('2026-07-01')).toBe('2026-07-01');
  });

  it('devuelve null para valores no interpretables', () => {
    const normalizar = crearNormalizador();
    expect(normalizar('')).toBeNull();
    expect(normalizar('fecha-invalida')).toBeNull();
    expect(normalizar('2026-02-30 10:00:00')).toBeNull();
    expect(normalizar(null)).toBeNull();
    expect(normalizar(12345)).toBeNull();
  });

  it('normaliza un objeto Date al día GMT-5', () => {
    const normalizar = crearNormalizador();
    // El mock de Utilities.formatDate devuelve el día fijo para cualquier Date válido.
    expect(normalizar(new Date('2026-07-01T12:00:00Z'))).toBe('2030-01-01');
    expect(normalizar(new Date('invalid'))).toBeNull();
  });
});

describe('_agruparArchivadasPorFechaConsultaSai', () => {
  it('agrupa por día, cuenta el total real y ordena de más reciente a más antigua', () => {
    const agrupar = crearAgrupador();
    const resultado = agrupar([
      { fechaConsultaSai: '2026-04-18' },
      { fechaConsultaSai: '2026-04-19' },
      { fechaConsultaSai: '2026-04-18' },
      { fechaConsultaSai: '2026-04-18' },
    ]);
    expect(resultado).toEqual([
      { fecha: '2026-04-19', total: 1 },
      { fecha: '2026-04-18', total: 3 },
    ]);
  });

  it('excluye candidatas sin fecha de consulta SAI interpretable', () => {
    const agrupar = crearAgrupador();
    const resultado = agrupar([
      { fechaConsultaSai: null },
      { fechaConsultaSai: '' },
      { fechaConsultaSai: '2026-04-19' },
    ]);
    expect(resultado).toEqual([{ fecha: '2026-04-19', total: 1 }]);
  });

  it('el total agrupado nunca excede la cantidad de candidatas con fecha', () => {
    const agrupar = crearAgrupador();
    const arbCandidata = fc.record({
      fechaConsultaSai: fc.constantFrom('2026-04-19', '2026-04-18', '2026-04-17', null, ''),
    });
    fc.assert(
      fc.property(fc.array(arbCandidata, { maxLength: 200 }), (candidatas) => {
        const grupos = agrupar(candidatas);
        const sumaGrupos = grupos.reduce((acc, g) => acc + g.total, 0);
        const conFecha = candidatas.filter((c) => c.fechaConsultaSai).length;
        expect(sumaGrupos).toBe(conFecha);
        // Orden estrictamente descendente por fecha.
        for (let i = 1; i < grupos.length; i++) {
          expect(grupos[i - 1].fecha > grupos[i].fecha).toBe(true);
        }
      }),
      { numRuns: 100, seed: 20260928 }
    );
  });
});
