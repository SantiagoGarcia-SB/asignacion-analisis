/**
 * Property-Based Tests — equivalencia getValues() vs getDisplayValues()
 *
 * Contexto: se planea unificar la lectura de las hojas "solicitud"/"ORIGEN" entre
 * RequestLeadUnificado (que hoy lee con .getValues() — tipos nativos: Date, number)
 * y getTableData()/getReestudiosData() (que leen con .getDisplayValues() — todo como
 * texto formateado, necesario para que fechas/moneda se vean bien en la tabla del
 * analista). Antes de compartir una sola lectura entre ambos consumidores, esta
 * property verifica que _contarYRecolectarPrincipal/_contarYRecolectarReestudios
 * (el motor de selección de candidatos) deciden EXACTAMENTE IGUAL sin importar cuál
 * de los dos formatos reciban — es decir, que el cambio de formato de lectura no
 * puede alterar a quién se le asigna un caso ni cuánto cuenta contra su cupo.
 *
 * Los únicos campos que realmente cambian de forma entre getValues()/getDisplayValues()
 * son las fechas (Date objeto vs string "dd/MM/yyyy HH:mm:ss") y el canon (number vs
 * string con formato colombiano) — poliza/estado/clase/canal ya son texto en la hoja
 * en ambos casos (poliza usa formato "@" para preservar ceros a la izquierda, ver
 * CLAUDE.md), así que no hay divergencia real ahí.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  _contarYRecolectarPrincipal,
  _contarYRecolectarReestudios,
  _buildFechaHoyFormats,
} from '../lib/motor-asignacion-puro.js';

// ============================================================
// HELPERS DE FORMATEO (replican lo que Sheets produce en getDisplayValues())
// ============================================================

function _pad2(n) {
  return String(n).padStart(2, '0');
}

// Mismo formato usado en el proyecto real para fechas con hora
// (ver .setNumberFormat("dd/MM/yyyy HH:mm:ss") en MotorAsignacion.js).
function _formatDateDisplay(date) {
  return (
    _pad2(date.getDate()) + '/' + _pad2(date.getMonth() + 1) + '/' + date.getFullYear() +
    ' ' + _pad2(date.getHours()) + ':' + _pad2(date.getMinutes()) + ':' + _pad2(date.getSeconds())
  );
}

// Mismo formato usado en Tests.js (_formatearCanonColombianoTest) para simular
// cómo Sheets mostraría un canon con separador de miles colombiano.
function _formatCanonDisplay(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Construye una fila "solicitud" (59 columnas) con los campos relevantes para
// _contarYRecolectarPrincipal, en su forma NATIVA (Date/number — como getValues()).
function buildRowSolicitudNative(spec) {
  var row = new Array(59).fill('');
  row[1] = spec.poliza;                 // poliza (ya es texto en ambos formatos)
  row[9] = spec.canon;                  // canon: number nativo
  row[16] = spec.estado;                // estadoGeneral (texto en ambos formatos)
  row[17] = spec.fechaRadicacion;       // Date nativo
  row[18] = spec.fechaResultado;        // Date nativo
  row[20] = spec.clase;                 // clase (texto en ambos formatos)
  row[27] = '';                         // asignado vacío (candidato)
  row[36] = spec.canal;                 // canal (texto en ambos formatos)
  row[58] = spec.reasignada ? 'REASIGNADA' : '';
  return row;
}

// Convierte una fila nativa a su equivalente de despliegue (solo cambian
// fechas y canon — el resto de columnas ya es texto en la hoja real).
function toDisplayRowSolicitud(rowNative) {
  var row = rowNative.slice();
  row[9] = _formatCanonDisplay(rowNative[9]);
  row[17] = rowNative[17] instanceof Date ? _formatDateDisplay(rowNative[17]) : rowNative[17];
  row[18] = rowNative[18] instanceof Date ? _formatDateDisplay(rowNative[18]) : rowNative[18];
  return row;
}

// Fila "ORIGEN" (reestudios) — 11+ columnas, campos relevantes para
// _contarYRecolectarReestudios en forma nativa.
function buildRowOrigenNative(spec) {
  var row = new Array(11).fill('');
  row[0] = spec.fecha;        // Date nativo
  row[1] = spec.poliza;       // texto en ambos formatos
  row[3] = spec.origen;       // texto en ambos formatos
  row[4] = spec.tipoP;        // texto en ambos formatos
  row[6] = '';                // asignado vacío (candidato)
  row[10] = '';               // estadoGest vacío (candidato)
  return row;
}

function toDisplayRowOrigen(rowNative) {
  var row = rowNative.slice();
  row[0] = rowNative[0] instanceof Date ? _formatDateDisplay(rowNative[0]) : rowNative[0];
  return row;
}

// Compara dos resultados de _contarYRecolectarPrincipal/_contarYRecolectarReestudios
// ignorando `rowData` (se espera que difiera en representación — Date vs string,
// number vs string — eso es justo lo que se está variando) pero exigiendo que
// TODO lo demás (qué se seleccionó, con qué tipo, en qué orden relativo) sea idéntico.
function expectMismoResultado(resNative, resDisplay) {
  expect(resDisplay.conteoHoy).toEqual(resNative.conteoHoy);
  expect(resDisplay.cargaPendiente).toBe(resNative.cargaPendiente);
  expect(resDisplay.pendientes.length).toBe(resNative.pendientes.length);
  for (let i = 0; i < resNative.pendientes.length; i++) {
    const a = resNative.pendientes[i];
    const b = resDisplay.pendientes[i];
    expect(b.base).toBe(a.base);
    expect(b.rowIndex).toBe(a.rowIndex);
    expect(b.tipo).toBe(a.tipo);
    expect(b.reasignada).toBe(a.reasignada);
    expect(b.esExterno).toBe(a.esExterno);
    expect(b.polizaKey).toBe(a.polizaKey);
    expect(b.fechaOrd).toBe(a.fechaOrd);
  }
}

// ============================================================
// ARBITRARIES
// ============================================================

const arbFecha = fc.date({
  min: new Date(2025, 0, 1),
  max: new Date(2026, 11, 31),
  noInvalidDate: true,
}).map((d) => {
  // Redondear a segundos (getDisplayValues no tiene precisión de milisegundos
  // en un formato "dd/MM/yyyy HH:mm:ss").
  d.setMilliseconds(0);
  return d;
});

const arbEstadoSolicitud = fc.constantFrom(
  'EN_ESTUDIO', 'APROBADO_PENDIENTE_BIOMETRIA', 'APROBADO', 'NEGADO',
  'RECHAZADO', 'APLAZADO', ''
);
const arbClase = fc.constantFrom('INDUCCION', 'NORMAL', '');
const arbCanal = fc.constantFrom('EL_LIBERTADOR', 'CALL_CENTER', 'PAGINA_WEB', '');

const arbFilaSolicitudSpec = fc.record({
  poliza: fc.integer({ min: 100000, max: 999999999 }).map(String),
  canon: fc.integer({ min: 0, max: 50000000 }),
  estado: arbEstadoSolicitud,
  fechaRadicacion: arbFecha,
  fechaResultado: arbFecha,
  clase: arbClase,
  canal: arbCanal,
  reasignada: fc.boolean(),
});

const arbCuotas = fc.record({
  digital: fc.integer({ min: 0, max: 30 }),
  desaplazamiento: fc.integer({ min: 0, max: 30 }),
  induccion: fc.integer({ min: 0, max: 30 }),
});

const arbEquipo = fc.record({
  canonDesde: fc.constantFrom(0, 0, 8000000),
  canonHasta: fc.constant(0),
  canonTipos: fc.constantFrom([], ['digital']),
});

describe('Feature: unificación lectura solicitud/ORIGEN, Property: equivalencia de formato', () => {
  it('_contarYRecolectarPrincipal decide igual con filas nativas (Date/number) que con su equivalente de despliegue (string)', () => {
    fc.assert(
      fc.property(
        fc.array(arbFilaSolicitudSpec, { minLength: 0, maxLength: 12 }),
        arbCuotas,
        arbEquipo,
        (specs, cuotas, equipo) => {
          const ctx = _buildFechaHoyFormats();
          const userEmail = 'analista@test.com';

          const dataNative = [['header']].concat(specs.map((s) => buildRowSolicitudNative(s)));
          const dataDisplay = [['header']].concat(dataNative.slice(1).map(toDisplayRowSolicitud));

          const resNative = _contarYRecolectarPrincipal(dataNative, userEmail, ctx, cuotas, equipo);
          const resDisplay = _contarYRecolectarPrincipal(dataDisplay, userEmail, ctx, cuotas, equipo);

          expectMismoResultado(resNative, resDisplay);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('_contarYRecolectarReestudios decide igual con filas nativas (Date) que con su equivalente de despliegue (string)', () => {
    const arbFilaOrigenSpec = fc.record({
      fecha: arbFecha,
      poliza: fc.integer({ min: 100000, max: 999999999 }).map(String),
      origen: fc.constantFrom('CORREO', 'PORTAL', ''),
      tipoP: fc.constantFrom('NUEVA', 'ADICIONAL', 'REESTUDIO', 'BIOMETRIA FALLIDA', ''),
    });

    fc.assert(
      fc.property(
        fc.array(arbFilaOrigenSpec, { minLength: 0, maxLength: 12 }),
        fc.record({
          reestudio: fc.integer({ min: 0, max: 30 }),
          nuevaUar: fc.integer({ min: 0, max: 30 }),
          deudorUar: fc.integer({ min: 0, max: 30 }),
          biometriaFallida: fc.integer({ min: 0, max: 30 }),
        }),
        (specs, cuotas) => {
          const ctx = _buildFechaHoyFormats();
          const userEmail = 'analista@test.com';

          const dataNative = [['header']].concat(specs.map((s) => buildRowOrigenNative(s)));
          const dataDisplay = [['header']].concat(dataNative.slice(1).map(toDisplayRowOrigen));

          const resNative = _contarYRecolectarReestudios(dataNative, userEmail, ctx, cuotas);
          const resDisplay = _contarYRecolectarReestudios(dataDisplay, userEmail, ctx, cuotas);

          expectMismoResultado(resNative, resDisplay);
        }
      ),
      { numRuns: 200 }
    );
  });
});
