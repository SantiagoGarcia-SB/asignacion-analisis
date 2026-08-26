/**
 * Smoke test — verifica que el entorno de testing (vitest + fast-check) está
 * correctamente configurado y que el módulo de funciones puras se importa sin errores.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  _leerBloqueCasosAbiertos,
  _buildFechaHoyFormats,
  _cumpleHoyUnif,
  _parseDateUnif,
  _parseCanonColombiano,
  _normalizarClaveUnif,
} from '../lib/motor-asignacion-puro.js';

describe('Setup verification', () => {
  it('fast-check is available and runs a trivial property', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return typeof n === 'number';
      }),
      { numRuns: 10 }
    );
  });

  it('motor-asignacion-puro module exports are importable', () => {
    expect(typeof _leerBloqueCasosAbiertos).toBe('function');
    expect(typeof _buildFechaHoyFormats).toBe('function');
    expect(typeof _cumpleHoyUnif).toBe('function');
    expect(typeof _parseDateUnif).toBe('function');
    expect(typeof _parseCanonColombiano).toBe('function');
    expect(typeof _normalizarClaveUnif).toBe('function');
  });

  it('_buildFechaHoyFormats returns correct shape', () => {
    const ctx = _buildFechaHoyFormats(new Date(2024, 5, 15)); // June 15 2024
    expect(ctx.y).toBe(2024);
    expect(ctx.m_s).toBe(6);
    expect(ctx.d_s).toBe(15);
    // Mirror real de MotorAsignacion.js: 5 formatos (DD/MM/YYYY, YYYY-MM-DD,
    // D/M/YYYY, M/D/YYYY, MM/DD/YYYY) — no 4, el placeholder anterior omitía MM/DD/YYYY.
    expect(ctx.fmts).toHaveLength(5);
    expect(ctx.fmts).toContain('15/06/2024');
    expect(ctx.fmts).toContain('2024-06-15');
    expect(ctx.fmts).toContain('06/15/2024');
  });

  it('_leerBloqueCasosAbiertos returns correct rows from block', () => {
    const bloque = [
      ['row5-col1', 'row5-col2'],
      ['row6-col1', 'row6-col2'],
      ['row7-col1', 'row7-col2'],
      ['row8-col1', 'row8-col2'],
    ];
    const filaMin = 5;
    const filasDeseadas = [5, 7];
    const result = _leerBloqueCasosAbiertos(bloque, filasDeseadas, filaMin);
    expect(result).toEqual([
      ['row5-col1', 'row5-col2'],
      ['row7-col1', 'row7-col2'],
    ]);
  });

  it('_leerBloqueCasosAbiertos returns empty array for empty input', () => {
    const result = _leerBloqueCasosAbiertos([], [], 1);
    expect(result).toEqual([]);
  });

  it('_parseCanonColombiano handles Colombian number format', () => {
    expect(_parseCanonColombiano('8.500.000')).toBe(8500000);
    expect(_parseCanonColombiano('8.500.000,50')).toBe(8500000.5);
    expect(_parseCanonColombiano('54000000')).toBe(54000000);
    expect(_parseCanonColombiano('')).toBe(0);
  });
});
