/**
 * ============================================================
 * Guardar y Asignar — Lógica Pura de Orquestación (exportable para testing)
 * ============================================================
 *
 * Este módulo contiene la implementación PURA (sin I/O, sin SpreadsheetApp)
 * de la lógica de composición de guardarYAsignarSiguiente(), diseñada para
 * ser testeada con fast-check via Vitest en Node.js.
 *
 * La función recibe dependencias inyectadas (guardarFn, asignarFn, panelFn)
 * y un deadline timestamp, orquestando la ejecución secuencial con manejo
 * de fallos parciales y verificación de timeout.
 *
 * Patrón equivalente al de tests/lib/motor-asignacion-puro.js
 */

// ============================================================
// CONSTANTES
// ============================================================

/** Valores por defecto del panel cuando cargarPanelAnalista falla */
const PANEL_DEFAULTS = {
  tabla: null,
  cupos: null,
  pendientesValidacion: [],
  gestionesHoyCruzadas: null,
};

// ============================================================
// FUNCIÓN PRINCIPAL — LÓGICA PURA DE ORQUESTACIÓN
// ============================================================

/**
 * Orquesta la secuencia: guardar → asignar (si aplica) → cargar panel.
 * Función pura sin dependencias de Google Apps Script.
 *
 * @param {Object} params
 * @param {Function} params.guardarFn - (data) => {success, message, disparaAsignacion, ...}
 * @param {Function} params.asignarFn - () => {success, message, nueva, idsAsignados, faseTarget, ...}
 * @param {Function} params.panelFn - () => {tabla, cupos, pendientesValidacion, gestionesHoyCruzadas, ...}
 * @param {number} params.deadline - Timestamp (ms) límite de ejecución
 * @param {Object} [params.data] - Datos de gestión para guardarFn
 * @param {Function} [params.nowFn] - Función para obtener timestamp actual (default: Date.now)
 * @returns {{guardado: Object, asignacion: Object|null, panel: Object|null}}
 */
function guardarYAsignarLogica({ guardarFn, asignarFn, panelFn, deadline, data, nowFn }) {
  var _now = typeof nowFn === 'function' ? nowFn : Date.now;

  // --- Paso 1: Verificar deadline antes de guardar ---
  if (_now() >= deadline) {
    return {
      guardado: { success: false, message: 'Tiempo límite superado antes de iniciar', disparaAsignacion: false },
      asignacion: null,
      panel: null,
    };
  }

  // --- Paso 2: Ejecutar guardado ---
  var guardado;
  try {
    guardado = guardarFn(data);
  } catch (e) {
    return {
      guardado: { success: false, message: 'Error de servidor: ' + (e && e.message ? e.message : String(e)), disparaAsignacion: false },
      asignacion: null,
      panel: null,
    };
  }

  // Normalizar guardado: garantizar propiedades mínimas
  if (!guardado || typeof guardado !== 'object') {
    guardado = { success: false, message: 'Respuesta de guardado inválida', disparaAsignacion: false };
  }
  if (typeof guardado.success !== 'boolean') {
    guardado.success = false;
  }
  if (typeof guardado.message !== 'string') {
    guardado.message = guardado.message != null ? String(guardado.message) : '';
  }
  if (typeof guardado.disparaAsignacion !== 'boolean') {
    guardado.disparaAsignacion = false;
  }

  // --- Early exit si guardado falla (Req 1.4, 1.6) ---
  if (!guardado.success) {
    return {
      guardado: guardado,
      asignacion: null,
      panel: null,
    };
  }

  // --- Paso 3: Asignación (solo si disparaAsignacion=true) ---
  var asignacion = null;

  if (guardado.disparaAsignacion) {
    // Verificar deadline antes de asignar (Req 5.4)
    if (_now() >= deadline) {
      return {
        guardado: guardado,
        asignacion: null,
        panel: null,
      };
    }

    try {
      var resultadoAsignacion = asignarFn();

      // Normalizar resultado de asignación
      if (resultadoAsignacion && typeof resultadoAsignacion === 'object') {
        asignacion = {
          success: typeof resultadoAsignacion.success === 'boolean' ? resultadoAsignacion.success : false,
          message: typeof resultadoAsignacion.message === 'string' ? resultadoAsignacion.message : String(resultadoAsignacion.message || ''),
          idsAsignados: Array.isArray(resultadoAsignacion.idsAsignados) ? resultadoAsignacion.idsAsignados : [],
          faseTarget: typeof resultadoAsignacion.faseTarget === 'string' ? resultadoAsignacion.faseTarget : null,
        };
        // Preservar 'nueva' si existe
        if (typeof resultadoAsignacion.nueva === 'boolean') {
          asignacion.nueva = resultadoAsignacion.nueva;
        }
      } else {
        asignacion = {
          success: false,
          message: 'Respuesta de asignación inválida',
          idsAsignados: [],
          faseTarget: null,
        };
      }
    } catch (e) {
      // Fallo de asignación: capturar y continuar (Req 2.1-2.4)
      asignacion = {
        success: false,
        message: e && e.message ? e.message : String(e),
        idsAsignados: [],
        faseTarget: null,
      };
    }
  }

  // --- Paso 4: Cargar panel ---
  // Verificar deadline antes de cargar panel (Req 5.4)
  if (_now() >= deadline) {
    return {
      guardado: guardado,
      asignacion: asignacion,
      panel: null,
    };
  }

  var panel = null;
  try {
    var resultadoPanel = panelFn();

    if (resultadoPanel && typeof resultadoPanel === 'object') {
      panel = resultadoPanel;
      // Garantizar propiedades mínimas del panel
      if (!Array.isArray(panel.pendientesValidacion)) {
        panel.pendientesValidacion = [];
      }
    } else {
      panel = Object.assign({}, PANEL_DEFAULTS, { _error: 'Respuesta de panel inválida' });
    }
  } catch (e) {
    // Fallo de panel: retornar defaults con _error (Req 1.5, 2.5)
    panel = Object.assign({}, PANEL_DEFAULTS, {
      _error: e && e.message ? e.message : String(e),
    });
  }

  // --- Retorno final ---
  return {
    guardado: guardado,
    asignacion: asignacion,
    panel: panel,
  };
}

// ============================================================
// EXPORTS
// ============================================================

export { guardarYAsignarLogica, PANEL_DEFAULTS };
