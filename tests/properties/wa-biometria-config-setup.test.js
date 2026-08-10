/**
 * Smoke test — verifica que el módulo wa-biometria-config-puro.js
 * se importa correctamente y sus funciones retornan los tipos esperados.
 */
import { describe, it, expect } from 'vitest';
import {
  CONFIG_WA_BIOMETRIA_DEFAULTS,
  DIAS_SEMANA,
  DIAS_VALIDOS,
  LIMITES_LEY_2300,
  validarEstructuraConfig,
  validarConfigWaBiometria,
  evaluarDesviacionesLey2300,
  dentroDeVentana,
  cumpleVentanaHoras,
  getConfigConDefaults,
} from '../lib/wa-biometria-config-puro.js';

describe('wa-biometria-config-puro module verification', () => {

  it('exports all expected constants and functions', () => {
    expect(CONFIG_WA_BIOMETRIA_DEFAULTS).toBeDefined();
    expect(DIAS_SEMANA).toHaveLength(7);
    expect(DIAS_VALIDOS).toHaveLength(7);
    expect(LIMITES_LEY_2300).toBeDefined();
    expect(typeof validarEstructuraConfig).toBe('function');
    expect(typeof validarConfigWaBiometria).toBe('function');
    expect(typeof evaluarDesviacionesLey2300).toBe('function');
    expect(typeof dentroDeVentana).toBe('function');
    expect(typeof cumpleVentanaHoras).toBe('function');
    expect(typeof getConfigConDefaults).toBe('function');
  });

  it('CONFIG_WA_BIOMETRIA_DEFAULTS has correct structure', () => {
    var d = CONFIG_WA_BIOMETRIA_DEFAULTS;
    expect(d.ventanaHoras).toBe(4);
    expect(d.dias.lunes.habilitado).toBe(true);
    expect(d.dias.lunes.horaInicio).toBe("07:00");
    expect(d.dias.lunes.horaFin).toBe("19:00");
    expect(d.dias.sabado.horaInicio).toBe("08:00");
    expect(d.dias.sabado.horaFin).toBe("15:00");
    expect(d.dias.domingo.habilitado).toBe(false);
    expect(d.dias.domingo.horaInicio).toBe("08:00");
    expect(d.dias.domingo.horaFin).toBe("12:00");
  });

  it('validarEstructuraConfig accepts valid defaults', () => {
    expect(validarEstructuraConfig(CONFIG_WA_BIOMETRIA_DEFAULTS)).toBe(true);
  });

  it('validarEstructuraConfig rejects invalid objects', () => {
    expect(validarEstructuraConfig(null)).toBe(false);
    expect(validarEstructuraConfig({})).toBe(false);
    expect(validarEstructuraConfig({ dias: {}, ventanaHoras: 4 })).toBe(false);
    expect(validarEstructuraConfig({ dias: CONFIG_WA_BIOMETRIA_DEFAULTS.dias, ventanaHoras: 0 })).toBe(false);
    expect(validarEstructuraConfig({ dias: CONFIG_WA_BIOMETRIA_DEFAULTS.dias, ventanaHoras: 49 })).toBe(false);
  });

  it('validarConfigWaBiometria returns ok:true for valid config', () => {
    var result = validarConfigWaBiometria(CONFIG_WA_BIOMETRIA_DEFAULTS);
    expect(result.ok).toBe(true);
    expect(result.config).toBeDefined();
  });

  it('validarConfigWaBiometria returns ok:false when horaFin <= horaInicio on enabled day', () => {
    var config = JSON.parse(JSON.stringify(CONFIG_WA_BIOMETRIA_DEFAULTS));
    config.dias.lunes.horaFin = "07:00"; // equal to horaInicio
    var result = validarConfigWaBiometria(config);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('lunes');
  });

  it('evaluarDesviacionesLey2300 returns empty for defaults', () => {
    var result = evaluarDesviacionesLey2300(CONFIG_WA_BIOMETRIA_DEFAULTS);
    expect(result).toEqual([]);
  });

  it('evaluarDesviacionesLey2300 detects weekday before 7:00', () => {
    var config = JSON.parse(JSON.stringify(CONFIG_WA_BIOMETRIA_DEFAULTS));
    config.dias.lunes.horaInicio = "06:00";
    var result = evaluarDesviacionesLey2300(config);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(d => d.includes('lunes'))).toBe(true);
  });

  it('evaluarDesviacionesLey2300 detects domingo habilitado', () => {
    var config = JSON.parse(JSON.stringify(CONFIG_WA_BIOMETRIA_DEFAULTS));
    config.dias.domingo.habilitado = true;
    var result = evaluarDesviacionesLey2300(config);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(d => d.includes('domingo'))).toBe(true);
  });

  it('dentroDeVentana returns true for enabled day within range', () => {
    // Lunes (dow=1), hora 10.0 → dentro de 7-19
    expect(dentroDeVentana(CONFIG_WA_BIOMETRIA_DEFAULTS, 1, 10.0)).toBe(true);
  });

  it('dentroDeVentana returns false for disabled day', () => {
    // Domingo (dow=0), hora 10.0 → domingo deshabilitado
    expect(dentroDeVentana(CONFIG_WA_BIOMETRIA_DEFAULTS, 0, 10.0)).toBe(false);
  });

  it('dentroDeVentana returns false for enabled day outside range', () => {
    // Lunes (dow=1), hora 20.0 → fuera de 7-19
    expect(dentroDeVentana(CONFIG_WA_BIOMETRIA_DEFAULTS, 1, 20.0)).toBe(false);
  });

  it('dentroDeVentana boundary: horaFin is exclusive', () => {
    // Lunes (dow=1), hora exactamente 19.0 → NO incluye fin
    expect(dentroDeVentana(CONFIG_WA_BIOMETRIA_DEFAULTS, 1, 19.0)).toBe(false);
    // Lunes (dow=1), hora exactamente 7.0 → SÍ incluye inicio
    expect(dentroDeVentana(CONFIG_WA_BIOMETRIA_DEFAULTS, 1, 7.0)).toBe(true);
  });

  it('cumpleVentanaHoras returns true when enough hours passed', () => {
    expect(cumpleVentanaHoras(4, 5)).toBe(true);
    expect(cumpleVentanaHoras(4, 4)).toBe(true);
  });

  it('cumpleVentanaHoras returns false when not enough hours passed', () => {
    expect(cumpleVentanaHoras(4, 3.9)).toBe(false);
    expect(cumpleVentanaHoras(4, 0)).toBe(false);
  });

  it('getConfigConDefaults returns defaults for null/empty/invalid', () => {
    expect(getConfigConDefaults(null)).toEqual(CONFIG_WA_BIOMETRIA_DEFAULTS);
    expect(getConfigConDefaults('')).toEqual(CONFIG_WA_BIOMETRIA_DEFAULTS);
    expect(getConfigConDefaults('not json')).toEqual(CONFIG_WA_BIOMETRIA_DEFAULTS);
    expect(getConfigConDefaults(undefined)).toEqual(CONFIG_WA_BIOMETRIA_DEFAULTS);
  });

  it('getConfigConDefaults returns defaults for JSON with bad structure', () => {
    expect(getConfigConDefaults('{"foo":"bar"}')).toEqual(CONFIG_WA_BIOMETRIA_DEFAULTS);
    expect(getConfigConDefaults('{"dias":{},"ventanaHoras":4}')).toEqual(CONFIG_WA_BIOMETRIA_DEFAULTS);
  });

  it('getConfigConDefaults returns parsed config for valid JSON', () => {
    var valid = JSON.stringify(CONFIG_WA_BIOMETRIA_DEFAULTS);
    var result = getConfigConDefaults(valid);
    expect(result).toEqual(CONFIG_WA_BIOMETRIA_DEFAULTS);
  });
});
