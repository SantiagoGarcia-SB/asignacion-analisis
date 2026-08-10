/**
 * ============================================================
 * WA Biometría Config — Lógica Pura (exportable para testing)
 * ============================================================
 *
 * Este módulo contiene la implementación PURA (sin I/O, sin PropertiesService,
 * sin SpreadsheetApp) de la lógica de configuración de horarios de envío
 * WA Biometría, diseñada para ser testeada con fast-check via Vitest en Node.js.
 *
 * Patrón equivalente al de tests/lib/guardar-y-asignar-puro.js
 */

// ============================================================
// CONSTANTES
// ============================================================

/** Nombres de días en orden (índice 0 = domingo, 1 = lunes ... 6 = sábado) */
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/** Días de la semana válidos como claves del objeto config.dias */
const DIAS_VALIDOS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

/** Valores por defecto: L-V 7-19, Sáb 8-15, Dom deshabilitado, ventanaHoras 4 */
const CONFIG_WA_BIOMETRIA_DEFAULTS = {
  dias: {
    lunes:     { habilitado: true,  horaInicio: "07:00", horaFin: "19:00" },
    martes:    { habilitado: true,  horaInicio: "07:00", horaFin: "19:00" },
    miercoles: { habilitado: true,  horaInicio: "07:00", horaFin: "19:00" },
    jueves:    { habilitado: true,  horaInicio: "07:00", horaFin: "19:00" },
    viernes:   { habilitado: true,  horaInicio: "07:00", horaFin: "19:00" },
    sabado:    { habilitado: true,  horaInicio: "08:00", horaFin: "15:00" },
    domingo:   { habilitado: false, horaInicio: "08:00", horaFin: "12:00" }
  },
  ventanaHoras: 4
};

/** Límites de referencia Ley 2300 de 2023 */
const LIMITES_LEY_2300 = {
  weekday: { horaInicio: "07:00", horaFin: "19:00" },
  sabado:  { horaInicio: "08:00", horaFin: "15:00" },
  domingo: { habilitado: false }
};

// ============================================================
// UTILIDADES INTERNAS
// ============================================================

/**
 * Convierte "HH:MM" a número decimal (ej: "08:30" → 8.5).
 * @param {string} horaStr
 * @returns {number}
 */
function _horaANumero(horaStr) {
  var partes = horaStr.split(':');
  return parseInt(partes[0], 10) + parseInt(partes[1], 10) / 60;
}

/**
 * Verifica si un string tiene formato válido HH:MM (00:00 a 23:30, incrementos 30 min).
 * @param {string} str
 * @returns {boolean}
 */
function _esFormatoHoraValido(str) {
  if (typeof str !== 'string') return false;
  var match = str.match(/^([01]\d|2[0-3]):(00|30)$/);
  return match !== null;
}

// ============================================================
// FUNCIONES PRINCIPALES
// ============================================================

/**
 * Verifica que un objeto JSON parseado tenga la estructura esperada de ConfigWaBiometria.
 * No valida reglas de negocio (como horaFin > horaInicio), solo estructura y tipos.
 *
 * @param {*} obj - Objeto a validar
 * @returns {boolean} true si la estructura es válida
 */
function validarEstructuraConfig(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (!obj.dias || typeof obj.dias !== 'object') return false;

  // Verificar ventanaHoras: entero entre 1 y 48
  if (typeof obj.ventanaHoras !== 'number') return false;
  if (!Number.isInteger(obj.ventanaHoras)) return false;
  if (obj.ventanaHoras < 1 || obj.ventanaHoras > 48) return false;

  // Verificar que existan exactamente los 7 días esperados
  for (var i = 0; i < DIAS_VALIDOS.length; i++) {
    var dia = DIAS_VALIDOS[i];
    var diaConfig = obj.dias[dia];
    if (!diaConfig || typeof diaConfig !== 'object') return false;
    if (typeof diaConfig.habilitado !== 'boolean') return false;
    if (typeof diaConfig.horaInicio !== 'string') return false;
    if (typeof diaConfig.horaFin !== 'string') return false;
    // Verificar formato HH:MM válido
    if (!_esFormatoHoraValido(diaConfig.horaInicio)) return false;
    if (!_esFormatoHoraValido(diaConfig.horaFin)) return false;
  }

  return true;
}

/**
 * Valida estructura, tipos y reglas de negocio de un objeto ConfigWaBiometria.
 * Regla principal: horaFin > horaInicio para días habilitados.
 * ventanaHoras debe ser entero entre 1 y 48.
 *
 * @param {*} config - Objeto de configuración a validar
 * @returns {{ok: boolean, config?: Object, error?: string}}
 */
function validarConfigWaBiometria(config) {
  // Validar estructura base
  if (!config || typeof config !== 'object') {
    return { ok: false, error: "La configuración no tiene el formato esperado." };
  }

  if (!config.dias || typeof config.dias !== 'object') {
    return { ok: false, error: "La configuración debe incluir la propiedad 'dias'." };
  }

  // Validar ventanaHoras
  if (typeof config.ventanaHoras !== 'number' || !Number.isInteger(config.ventanaHoras)) {
    return { ok: false, error: "La ventana de horas debe ser un número entero." };
  }
  if (config.ventanaHoras < 1 || config.ventanaHoras > 48) {
    return { ok: false, error: "La ventana de horas debe estar entre 1 y 48." };
  }

  // Validar cada día
  for (var i = 0; i < DIAS_VALIDOS.length; i++) {
    var dia = DIAS_VALIDOS[i];
    var diaConfig = config.dias[dia];

    if (!diaConfig || typeof diaConfig !== 'object') {
      return { ok: false, error: "Falta la configuración para el día '" + dia + "'." };
    }
    if (typeof diaConfig.habilitado !== 'boolean') {
      return { ok: false, error: "El campo 'habilitado' del día '" + dia + "' debe ser booleano." };
    }
    if (!_esFormatoHoraValido(diaConfig.horaInicio)) {
      return { ok: false, error: "La hora de inicio del día '" + dia + "' no tiene formato válido (HH:00 o HH:30)." };
    }
    if (!_esFormatoHoraValido(diaConfig.horaFin)) {
      return { ok: false, error: "La hora de fin del día '" + dia + "' no tiene formato válido (HH:00 o HH:30)." };
    }

    // Regla de negocio: horaFin > horaInicio para días habilitados
    if (diaConfig.habilitado) {
      var inicio = _horaANumero(diaConfig.horaInicio);
      var fin = _horaANumero(diaConfig.horaFin);
      if (fin <= inicio) {
        return { ok: false, error: "La hora de fin debe ser posterior a la hora de inicio para " + dia + "." };
      }
    }
  }

  // Sanitizar y retornar config válida
  var sanitized = {
    dias: {},
    ventanaHoras: config.ventanaHoras
  };
  for (var j = 0; j < DIAS_VALIDOS.length; j++) {
    var d = DIAS_VALIDOS[j];
    sanitized.dias[d] = {
      habilitado: config.dias[d].habilitado,
      horaInicio: config.dias[d].horaInicio,
      horaFin: config.dias[d].horaFin
    };
  }

  return { ok: true, config: sanitized };
}

/**
 * Evalúa desviaciones contra los límites de referencia de la Ley 2300 de 2023.
 * Retorna un array de strings describiendo cada desviación detectada.
 *
 * Condiciones de desviación:
 * - Weekday (L-V): horaInicio < "07:00" o horaFin > "19:00"
 * - Sábado: horaInicio < "08:00" o horaFin > "15:00"
 * - Domingo: habilitado = true
 *
 * @param {Object} config - ConfigWaBiometria válida
 * @returns {string[]} Array de desviaciones (vacío si cumple Ley 2300)
 */
function evaluarDesviacionesLey2300(config) {
  var desviaciones = [];

  if (!config || !config.dias) return desviaciones;

  var diasWeekday = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

  // Evaluar weekdays (L-V)
  for (var i = 0; i < diasWeekday.length; i++) {
    var dia = diasWeekday[i];
    var diaConfig = config.dias[dia];
    if (!diaConfig) continue;

    var inicioNum = _horaANumero(diaConfig.horaInicio);
    var finNum = _horaANumero(diaConfig.horaFin);
    var limInicioNum = _horaANumero(LIMITES_LEY_2300.weekday.horaInicio);
    var limFinNum = _horaANumero(LIMITES_LEY_2300.weekday.horaFin);

    if (inicioNum < limInicioNum) {
      desviaciones.push(dia + ": hora de inicio (" + diaConfig.horaInicio + ") es anterior a 07:00 (Ley 2300).");
    }
    if (finNum > limFinNum) {
      desviaciones.push(dia + ": hora de fin (" + diaConfig.horaFin + ") es posterior a 19:00 (Ley 2300).");
    }
  }

  // Evaluar sábado
  var sabConfig = config.dias.sabado;
  if (sabConfig) {
    var sabInicioNum = _horaANumero(sabConfig.horaInicio);
    var sabFinNum = _horaANumero(sabConfig.horaFin);
    var sabLimInicioNum = _horaANumero(LIMITES_LEY_2300.sabado.horaInicio);
    var sabLimFinNum = _horaANumero(LIMITES_LEY_2300.sabado.horaFin);

    if (sabInicioNum < sabLimInicioNum) {
      desviaciones.push("sabado: hora de inicio (" + sabConfig.horaInicio + ") es anterior a 08:00 (Ley 2300).");
    }
    if (sabFinNum > sabLimFinNum) {
      desviaciones.push("sabado: hora de fin (" + sabConfig.horaFin + ") es posterior a 15:00 (Ley 2300).");
    }
  }

  // Evaluar domingo
  var domConfig = config.dias.domingo;
  if (domConfig && domConfig.habilitado === true) {
    desviaciones.push("domingo: envío habilitado (Ley 2300 no recomienda envíos en domingos y festivos).");
  }

  return desviaciones;
}

/**
 * Evaluación pura de si un instante (dow + horaDecimal) está dentro de la
 * ventana configurada para envío.
 *
 * @param {Object} config - ConfigWaBiometria válida
 * @param {number} dow - Día de la semana (0=domingo, 1=lunes ... 6=sábado)
 * @param {number} horaDecimal - Hora en formato decimal (ej: 8.5 = 08:30)
 * @returns {boolean} true si está dentro de la ventana permitida
 */
function dentroDeVentana(config, dow, horaDecimal) {
  if (!config || !config.dias) return false;

  var nombreDia = DIAS_SEMANA[dow];
  if (!nombreDia) return false;

  var diaConfig = config.dias[nombreDia];
  if (!diaConfig || !diaConfig.habilitado) return false;

  var inicioNum = _horaANumero(diaConfig.horaInicio);
  var finNum = _horaANumero(diaConfig.horaFin);

  return horaDecimal >= inicioNum && horaDecimal < finNum;
}

/**
 * Evaluación de si se cumple la ventana mínima de horas desde resultado.
 * Retorna true si han pasado suficientes horas, false si no.
 *
 * @param {number} ventanaHoras - Horas mínimas requeridas (1-48)
 * @param {number} horasDesdeResultado - Horas transcurridas desde fecha_resultado
 * @returns {boolean} true si horasDesdeResultado >= ventanaHoras (cumple ventana)
 */
function cumpleVentanaHoras(ventanaHoras, horasDesdeResultado) {
  return horasDesdeResultado >= ventanaHoras;
}

/**
 * Parsea un JSON string y retorna la configuración si es válida,
 * o los defaults ante cualquier fallo (JSON inválido, estructura incorrecta,
 * tipos incorrectos, propiedades faltantes).
 *
 * @param {string} rawString - String raw desde Script Properties (puede ser null/undefined)
 * @returns {Object} ConfigWaBiometria válida o CONFIG_WA_BIOMETRIA_DEFAULTS
 */
function getConfigConDefaults(rawString) {
  if (rawString === null || rawString === undefined || typeof rawString !== 'string' || rawString.trim() === '') {
    return deepCopy(CONFIG_WA_BIOMETRIA_DEFAULTS);
  }

  try {
    var parsed = JSON.parse(rawString);
    if (!validarEstructuraConfig(parsed)) {
      return deepCopy(CONFIG_WA_BIOMETRIA_DEFAULTS);
    }
    return parsed;
  } catch (e) {
    return deepCopy(CONFIG_WA_BIOMETRIA_DEFAULTS);
  }
}

/**
 * Deep copy simple para objetos JSON-safe.
 * @param {Object} obj
 * @returns {Object}
 */
function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ============================================================
// EXPORTS
// ============================================================

export {
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
  deepCopy
};
