/**
 * Validación de producción para el contrato inicial de reactivación.
 * Ejecuta Biometria.js con adaptadores que cuentan accesos a Apps Script.
 *
 * Validates: Requirements 2.2, 2.14, 2.15, 2.18
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

const biometriaSource = readFileSync(resolve(process.cwd(), 'Biometria.js'), 'utf8');
const HOY_OPERATIVO = '2026-04-19';

function crearFuncionConEfectosInstrumentados() {
  const efectos = { hojas: 0, locks: 0, escrituras: 0, consultasSai: 0 };
  const Utilities = {
    formatDate() { return HOY_OPERATIVO; },
    sleep() { efectos.consultasSai += 1; },
  };
  const SpreadsheetApp = {
    openById() {
      efectos.hojas += 1;
      return {
        getSheetByName() {
          return {
            getLastRow() { return 1; },
          };
        },
      };
    },
    flush() { efectos.escrituras += 1; },
  };
  const factory = new Function('Utilities', 'SpreadsheetApp', `${biometriaSource}\nreturn admin_desarchivarBiometrias;`);
  return { ejecutar: factory(Utilities, SpreadsheetApp), efectos };
}

function esperarSinEfectos(efectos) {
  expect(efectos).toEqual({ hojas: 0, locks: 0, escrituras: 0, consultasSai: 0 });
}

describe('admin_desarchivarBiometrias validation', () => {
  it('acepta solo un objeto plano exacto y rechaza los tipos y fechas inválidos antes de efectos', () => {
    const solicitudesInvalidas = [
      null,
      [],
      { fechaConsultaSai: '2026-04-19' },
      { fechaConsultaSai: '2026-04-19', cantidad: '1' },
      { fechaConsultaSai: '2026-04-19', cantidad: 1.5 },
      { fechaConsultaSai: '2026-02-30', cantidad: 1 },
      { fechaConsultaSai: '2026-04-20', cantidad: 1 },
      { fechaConsultaSai: '2026-04-19', cantidad: 0 },
      { fechaConsultaSai: '2026-04-19', cantidad: 1, ordenDesplazamiento: 'ANTIGUO_PRIMERO' },
    ];

    solicitudesInvalidas.forEach((request) => {
      const { ejecutar, efectos } = crearFuncionConEfectosInstrumentados();
      expect(ejecutar(request)).toEqual({
        success: false,
        errorCode: 'SOLICITUD_INVALIDA',
        message: 'La solicitud de desarchivado no es válida.',
      });
      esperarSinEfectos(efectos);
    });
  });

  it('retorna CANTIDAD_MAXIMA_EXCEDIDA para cada entero estricto superior a 100 sin efectos', () => {
    fc.assert(
      fc.property(fc.integer({ min: 101, max: 1000000 }), (cantidad) => {
        const { ejecutar, efectos } = crearFuncionConEfectosInstrumentados();
        const response = ejecutar({ fechaConsultaSai: HOY_OPERATIVO, cantidad });

        expect(response).toEqual({
          success: false,
          errorCode: 'CANTIDAD_MAXIMA_EXCEDIDA',
          maxCantidad: 100,
          message: 'El máximo de desarchivado por operación es 100.',
        });
        esperarSinEfectos(efectos);
      }),
      { numRuns: 40, seed: 20260423 }
    );
  });

  it('permite los límites 1 y 100 tras validar el contrato exacto', () => {
    [1, 100].forEach((cantidad) => {
      const { ejecutar, efectos } = crearFuncionConEfectosInstrumentados();
      const response = ejecutar({ fechaConsultaSai: HOY_OPERATIVO, cantidad });

      expect(response.success).toBe(true);
      expect(efectos.hojas).toBe(1);
      expect(efectos.locks).toBe(0);
      expect(efectos.escrituras).toBe(0);
      expect(efectos.consultasSai).toBe(0);
    });
  });
});
