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
  it('puebla las fechas SAI desde porFecha con su conteo real y restringe la cantidad a 1..100', () => {
    expect(modalReactivacion).toContain('Fecha de consulta SAI');
    // Opciones construidas desde res.porFecha (fechas reales), no adivinadas Hoy/Ayer/Anteayer.
    expect(modalReactivacion).toContain('res.porFecha');
    expect(modalReactivacion).toContain('data-total="');
    expect(modalReactivacion).toContain('caso(s)</option>');
    expect(modalReactivacion).not.toContain('Hoy (');
    expect(modalReactivacion).not.toContain('Anteayer (');
    // El tope de cantidad se acota al conteo de la fecha elegida, sin exceder 100.
    expect(modalReactivacion).toContain('Máximo 100 por operación.');
    expect(modalReactivacion).toContain('cantidad < 1 || cantidad > 100');
    expect(modalReactivacion).toContain('cantidad > totalFecha');
  });

  it('avisa cuando ninguna archivada tiene fecha de consulta SAI interpretable', () => {
    expect(modalReactivacion).toContain('Sin fecha de consulta SAI');
    expect(modalReactivacion).toContain('porFecha.length === 0');
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

  it('da feedback honesto por resultado: éxito solo si hubo repuestas', () => {
    expect(modalReactivacion).toContain('mostrarResultadoDesarchivarBiometrias(resDes)');
    expect(modalReactivacion).toContain("restauradas > 0 ? 'success' : 'info'");
    expect(modalReactivacion).toContain('resDes.restauradas');
    expect(modalReactivacion).toContain('resDes.yaResueltas');
    expect(modalReactivacion).toContain('resDes.sinRespuestaSai');
  });
});
