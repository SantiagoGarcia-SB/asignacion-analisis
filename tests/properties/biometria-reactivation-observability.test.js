/**
 * Clasificación SAI y telemetría agregada para el desarchivado manual.
 * Validates: Requirements 2.7, 2.8, 2.9, 2.13, 2.17, 2.18, 3.1, 3.2, 3.3, 3.4, 3.5, 3.10
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

const biometriaSource = readFileSync(resolve(process.cwd(), 'Biometria.js'), 'utf8');

function cargarAyudantesReactivacion() {
  const factory = new Function(
    `${biometriaSource}\nreturn { _clasificarRespuestaSaiDesarchivarBiometrias, _crearMetricasDesarchivarBiometrias, _finalizarMetricasDesarchivarBiometrias };`
  );
  return factory();
}

const RESPUESTA_ELEGIBLE = {
  resultCode: '500',
  studyStatus: 'APROBADO_PENDIENTE_BIOMETRIA',
  mainResultCode: '2',
  requestType: 'TS',
};

function clasificacionEsperada(respuesta) {
  if (!respuesta || typeof respuesta !== 'object' || Array.isArray(respuesta)) return 'REINTENTABLE';
  if (respuesta.resultCode === undefined || respuesta.studyStatus === undefined
    || respuesta.mainResultCode === undefined || respuesta.requestType === undefined) return 'REINTENTABLE';
  return String(respuesta.resultCode).trim() === '500'
    && String(respuesta.studyStatus).trim().toUpperCase() === 'APROBADO_PENDIENTE_BIOMETRIA'
    && String(respuesta.mainResultCode).trim() === '2'
    && !['AC', 'AV'].includes(String(respuesta.requestType).trim().toUpperCase())
    ? 'ELEGIBLE'
    : 'RESUELTA';
}

describe('admin_desarchivarBiometrias protected SAI and observability', () => {
  it('classifies unavailable payloads as retryable and every available nonexact response as resolved', () => {
    const { _clasificarRespuestaSaiDesarchivarBiometrias: clasificar } = cargarAyudantesReactivacion();

    expect(clasificar(null)).toBe('REINTENTABLE');
    expect(clasificar([])).toBe('REINTENTABLE');
    expect(clasificar({ resultCode: '500' })).toBe('REINTENTABLE');
    expect(clasificar(RESPUESTA_ELEGIBLE)).toBe('ELEGIBLE');
    expect(clasificar({ ...RESPUESTA_ELEGIBLE, resultCode: '503' })).toBe('RESUELTA');
    expect(clasificar({ ...RESPUESTA_ELEGIBLE, mainResultCode: '3' })).toBe('RESUELTA');
    expect(clasificar({ ...RESPUESTA_ELEGIBLE, requestType: 'AC' })).toBe('RESUELTA');
    expect(clasificar({ ...RESPUESTA_ELEGIBLE, requestType: 'AV' })).toBe('RESUELTA');
  });

  it('admits only the exact SAI conjunction for all interpretable payload combinations', () => {
    const { _clasificarRespuestaSaiDesarchivarBiometrias: clasificar } = cargarAyudantesReactivacion();
    const respuestaArbitraria = fc.record({
      resultCode: fc.constantFrom('500', '503', '200', ' 500 '),
      studyStatus: fc.constantFrom('APROBADO_PENDIENTE_BIOMETRIA', 'RECHAZADO', ' aprobado_pendiente_biometria '),
      mainResultCode: fc.constantFrom('2', '3', ' 2 '),
      requestType: fc.constantFrom('TS', 'AC', 'AV', ' ts '),
    });

    fc.assert(
      fc.property(respuestaArbitraria, (respuesta) => {
        expect(clasificar(respuesta)).toBe(clasificacionEsperada(respuesta));
      }),
      { numRuns: 100, seed: 20260425 }
    );
  });

  it('exposes only bounded aggregate metrics and budget status', () => {
    const {
      _crearMetricasDesarchivarBiometrias: crearMetricas,
      _finalizarMetricasDesarchivarBiometrias: finalizarMetricas,
    } = cargarAyudantesReactivacion();

    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (cantidad) => {
        const metricas = crearMetricas(cantidad);
        metricas.candidatasFiltradas = cantidad + 2;
        metricas.candidatasSeleccionadas = cantidad;
        metricas.intentosSai = cantidad;
        metricas.elegibles = cantidad - 1;
        metricas.resueltas = 1;
        metricas.esperaSaiMs = Math.max(0, cantidad - 1) * 1000;
        const finalizadas = finalizarMetricas(metricas, Date.now(), 'COMPLETADA');

        expect(Object.keys(finalizadas).sort()).toEqual([
          'candidatasFiltradas', 'candidatasSeleccionadas', 'cantidadSolicitada', 'duracionMs',
          'elegibles', 'esperaSaiMs', 'estadoPresupuesto', 'intentosSai', 'persistencia',
          'reintentables', 'resueltas', 'resultCode', 'solicitudValida',
        ]);
        expect(Object.keys(finalizadas.persistencia).sort()).toEqual([
          'insertadas', 'invalidas', 'noConfirmadas', 'yaEnHistorico', 'yaEnSolicitud',
        ]);
        expect(finalizadas.candidatasSeleccionadas).toBeLessThanOrEqual(100);
        expect(finalizadas.intentosSai).toBeLessThanOrEqual(finalizadas.candidatasSeleccionadas);
        expect(finalizadas.estadoPresupuesto).toBe('DENTRO_DEL_LIMITE');
        expect(finalizadas.resultCode).toBe('COMPLETADA');
        expect(JSON.stringify(finalizadas)).not.toContain('datosApi');
        expect(JSON.stringify(finalizadas)).not.toContain('token');
        expect(JSON.stringify(finalizadas)).not.toContain('exception');
      }),
      { numRuns: 100, seed: 20260426 }
    );
  });
});
