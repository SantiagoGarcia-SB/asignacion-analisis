/**
 * Contrato del modal de reactivación administrativa.
 *
 * Validates: Requirements 2.1, 2.14, 2.15, 2.16, 3.7, 3.8
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const vistaAdmin = readFileSync(resolve(process.cwd(), 'VistaAdmin.html'), 'utf8');
const inicioModal = vistaAdmin.indexOf('function abrirDesarchivarBiometrias()');
const finModal = vistaAdmin.indexOf('function cargarOrdenDesaplazamientoActual()', inicioModal);
const modalReactivacion = vistaAdmin.slice(inicioModal, finModal);

describe('abrirDesarchivarBiometrias', () => {
  it('muestra fecha SAI y restringe localmente la cantidad a 1..100', () => {
    expect(modalReactivacion).toContain('Fecha de consulta SAI');
    expect(modalReactivacion).toContain('Hoy (');
    expect(modalReactivacion).toContain('Ayer (');
    expect(modalReactivacion).toContain('Anteayer (');
    expect(modalReactivacion).toContain('Otra fecha');
    expect(modalReactivacion).toContain('Máximo 100 por operación.');
    expect(modalReactivacion).toContain('type="number" min="1" max="100" step="1"');
    expect(modalReactivacion).toContain('cantidad < 1 || cantidad > 100');
  });

  it('envía exclusivamente fechaConsultaSai y cantidad sin mezclar Orden Biometría', () => {
    expect(modalReactivacion).toContain('return { fechaConsultaSai: fechaConsultaSai, cantidad: cantidad };');
    expect(modalReactivacion).toMatch(/var solicitudReactivacion = \{\s+fechaConsultaSai: result\.value\.fechaConsultaSai,\s+cantidad: result\.value\.cantidad\s+\};/);
    expect(modalReactivacion).toContain('.admin_desarchivarBiometrias(solicitudReactivacion);');
    expect(modalReactivacion).not.toContain('ORDEN_DESAPLAZAMIENTO');
    expect(modalReactivacion).not.toContain('ordenDesplazamiento');
  });

  it('muestra como autoritativa la respuesta de máximo del backend sin reintentar', () => {
    expect(modalReactivacion).toContain("resDes.errorCode === 'CANTIDAD_MAXIMA_EXCEDIDA'");
    expect(modalReactivacion).toContain('resDes.message');
    expect(modalReactivacion).toContain('resDes.maxCantidad');
    expect(modalReactivacion.match(/admin_desarchivarBiometrias\(/g)).toHaveLength(1);
  });
});
