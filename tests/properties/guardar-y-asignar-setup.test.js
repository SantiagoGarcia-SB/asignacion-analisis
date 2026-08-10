/**
 * Smoke test — verifica que guardar-y-asignar-puro.js se importa correctamente
 * y que la función guardarYAsignarLogica tiene el comportamiento básico esperado.
 */
import { describe, it, expect } from 'vitest';
import { guardarYAsignarLogica, PANEL_DEFAULTS } from '../lib/guardar-y-asignar-puro.js';

describe('guardar-y-asignar-puro module verification', () => {
  it('exports are importable', () => {
    expect(typeof guardarYAsignarLogica).toBe('function');
    expect(typeof PANEL_DEFAULTS).toBe('object');
    expect(PANEL_DEFAULTS.tabla).toBeNull();
    expect(PANEL_DEFAULTS.cupos).toBeNull();
    expect(PANEL_DEFAULTS.pendientesValidacion).toEqual([]);
    expect(PANEL_DEFAULTS.gestionesHoyCruzadas).toBeNull();
  });

  it('returns correct structure on save success + assignment + panel', () => {
    const result = guardarYAsignarLogica({
      guardarFn: () => ({ success: true, message: 'ok', disparaAsignacion: true }),
      asignarFn: () => ({ success: true, message: 'Asignado', nueva: true, idsAsignados: ['123'], faseTarget: 'ASIGNADA' }),
      panelFn: () => ({ tabla: {}, cupos: {}, pendientesValidacion: [], gestionesHoyCruzadas: {} }),
      deadline: Date.now() + 300000,
      data: { solicitudId: 'SOL-1' },
    });

    expect(result).toHaveProperty('guardado');
    expect(result).toHaveProperty('asignacion');
    expect(result).toHaveProperty('panel');
    expect(result.guardado.success).toBe(true);
    expect(result.asignacion.success).toBe(true);
    expect(result.asignacion.idsAsignados).toEqual(['123']);
    expect(result.asignacion.faseTarget).toBe('ASIGNADA');
    expect(result.panel.tabla).toEqual({});
  });

  it('early-exit on save failure: asignacion=null, panel=null', () => {
    let asignarCalled = false;
    let panelCalled = false;

    const result = guardarYAsignarLogica({
      guardarFn: () => ({ success: false, message: 'Solicitud no encontrada', disparaAsignacion: false }),
      asignarFn: () => { asignarCalled = true; return {}; },
      panelFn: () => { panelCalled = true; return {}; },
      deadline: Date.now() + 300000,
      data: {},
    });

    expect(result.guardado.success).toBe(false);
    expect(result.asignacion).toBeNull();
    expect(result.panel).toBeNull();
    expect(asignarCalled).toBe(false);
    expect(panelCalled).toBe(false);
  });

  it('no assignment when disparaAsignacion=false, but panel loads', () => {
    let asignarCalled = false;

    const result = guardarYAsignarLogica({
      guardarFn: () => ({ success: true, message: 'ok', disparaAsignacion: false }),
      asignarFn: () => { asignarCalled = true; return {}; },
      panelFn: () => ({ tabla: { data: 'test' }, cupos: {}, pendientesValidacion: [], gestionesHoyCruzadas: null }),
      deadline: Date.now() + 300000,
      data: {},
    });

    expect(result.guardado.success).toBe(true);
    expect(result.asignacion).toBeNull();
    expect(asignarCalled).toBe(false);
    expect(result.panel).not.toBeNull();
    expect(result.panel.tabla).toEqual({ data: 'test' });
  });

  it('assignment exception captured, panel still loads', () => {
    const result = guardarYAsignarLogica({
      guardarFn: () => ({ success: true, message: 'ok', disparaAsignacion: true }),
      asignarFn: () => { throw new Error('Lock timeout'); },
      panelFn: () => ({ tabla: {}, cupos: {}, pendientesValidacion: ['item1'], gestionesHoyCruzadas: null }),
      deadline: Date.now() + 300000,
      data: {},
    });

    expect(result.asignacion).not.toBeNull();
    expect(result.asignacion.success).toBe(false);
    expect(result.asignacion.message).toBe('Lock timeout');
    expect(result.asignacion.idsAsignados).toEqual([]);
    expect(result.asignacion.faseTarget).toBeNull();
    expect(result.panel).not.toBeNull();
    expect(result.panel.pendientesValidacion).toEqual(['item1']);
  });

  it('panel exception returns defaults with _error', () => {
    const result = guardarYAsignarLogica({
      guardarFn: () => ({ success: true, message: 'ok', disparaAsignacion: false }),
      asignarFn: () => ({}),
      panelFn: () => { throw new Error('Sheet not found'); },
      deadline: Date.now() + 300000,
      data: {},
    });

    expect(result.panel).not.toBeNull();
    expect(result.panel._error).toBe('Sheet not found');
    expect(result.panel.tabla).toBeNull();
    expect(result.panel.cupos).toBeNull();
    expect(result.panel.pendientesValidacion).toEqual([]);
    expect(result.panel.gestionesHoyCruzadas).toBeNull();
  });

  it('deadline exceeded before assignment returns partial result', () => {
    let currentTime = 1000;
    const deadline = 2000;

    const result = guardarYAsignarLogica({
      guardarFn: () => {
        currentTime = 2500; // Simula que el guardado consume tiempo y supera deadline
        return { success: true, message: 'ok', disparaAsignacion: true };
      },
      asignarFn: () => ({ success: true, message: 'Asignado', idsAsignados: ['x'], faseTarget: 'ASIGNADA' }),
      panelFn: () => ({ tabla: {}, cupos: {}, pendientesValidacion: [], gestionesHoyCruzadas: null }),
      deadline: deadline,
      data: {},
      nowFn: () => currentTime,
    });

    // Guardado exitoso, pero deadline superado antes de asignar
    expect(result.guardado.success).toBe(true);
    expect(result.asignacion).toBeNull();
    expect(result.panel).toBeNull();
  });

  it('deadline exceeded before panel returns partial with assignment', () => {
    let currentTime = 1000;
    const deadline = 3000;

    const result = guardarYAsignarLogica({
      guardarFn: () => {
        currentTime = 1500;
        return { success: true, message: 'ok', disparaAsignacion: true };
      },
      asignarFn: () => {
        currentTime = 3500; // Supera deadline después de asignar
        return { success: true, message: 'Caso asignado', idsAsignados: ['456'], faseTarget: 'ASIGNADA' };
      },
      panelFn: () => ({ tabla: {}, cupos: {}, pendientesValidacion: [], gestionesHoyCruzadas: null }),
      deadline: deadline,
      data: {},
      nowFn: () => currentTime,
    });

    // Guardado y asignación exitosos, pero deadline superado antes de panel
    expect(result.guardado.success).toBe(true);
    expect(result.asignacion).not.toBeNull();
    expect(result.asignacion.success).toBe(true);
    expect(result.asignacion.idsAsignados).toEqual(['456']);
    expect(result.panel).toBeNull();
  });

  it('normalizes idsAsignados to empty array when missing', () => {
    const result = guardarYAsignarLogica({
      guardarFn: () => ({ success: true, message: 'ok', disparaAsignacion: true }),
      asignarFn: () => ({ success: true, message: 'Sin desaplazamientos' }), // no idsAsignados
      panelFn: () => ({ tabla: null, cupos: null, pendientesValidacion: [], gestionesHoyCruzadas: null }),
      deadline: Date.now() + 300000,
      data: {},
    });

    expect(result.asignacion.idsAsignados).toEqual([]);
    expect(result.asignacion.faseTarget).toBeNull();
  });
});
