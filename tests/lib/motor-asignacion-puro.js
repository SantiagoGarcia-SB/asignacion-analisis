/**
 * ============================================================
 * Motor de Asignación — Funciones Puras (exportables para testing)
 * ============================================================
 *
 * Este módulo contiene las implementaciones PURAS (sin I/O, sin SpreadsheetApp)
 * de las funciones del motor de asignación, diseñadas para ser testeadas con
 * fast-check via Vitest en Node.js.
 *
 * Las funciones aquí son equivalentes a las que viven en MotorAsignacion.js y
 * Código.js del proyecto GAS, pero exportadas como módulos ES para testing.
 *
 * NOTA: Las implementaciones completas se llenarán en los tasks 1.1 y 1.2.
 * Por ahora se exponen placeholders con la interfaz correcta.
 */

// ============================================================
// HELPERS (replicados del GAS para que las funciones puras sean autocontenidas)
// ============================================================

/**
 * Verifica si un valor de fecha corresponde al día de hoy según el contexto `ctx`.
 * @param {*} val - Valor de fecha (Date, string, number)
 * @param {Object} ctx - Contexto de fecha generado por _buildFechaHoyFormats
 * @returns {boolean}
 */
function _cumpleHoyUnif(val, ctx) {
  if (!val) return false;
  if (val instanceof Date) {
    return val.getFullYear() === ctx.y &&
           (val.getMonth() + 1) === ctx.m_s &&
           val.getDate() === ctx.d_s;
  }
  var s = String(val).trim();
  if (s === '') return false;
  for (var i = 0; i < ctx.fmts.length; i++) {
    if (s.indexOf(ctx.fmts[i]) === 0) return true;
  }
  return false;
}

/**
 * Normaliza una clave (póliza) para comparación.
 * @param {*} valor
 * @returns {string}
 */
function _normalizarClaveUnif(valor) {
  return String(valor || '').trim().toLowerCase();
}

/**
 * Parsea una fecha a timestamp (ms). Retorna 9999999999999 si no puede parsear.
 * @param {*} dateStr
 * @returns {number}
 */
function _parseDateUnif(dateStr) {
  if (dateStr instanceof Date) return dateStr.getTime();
  var s = String(dateStr || '').trim();
  if (!s) return 9999999999999;
  var ts = Date.parse(s);
  if (!isNaN(ts)) return ts;
  // Intentar DD/MM/YYYY
  var parts = s.split('/');
  if (parts.length === 3) {
    var d = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var y = parseInt(parts[2], 10);
    if (d > 0 && m > 0 && y > 0) {
      var dt = new Date(y, m - 1, d);
      if (!isNaN(dt.getTime())) return dt.getTime();
    }
  }
  return 9999999999999;
}

/**
 * Parsea valores en formato colombiano (miles con punto, decimales con coma).
 * @param {*} valor
 * @returns {number}
 */
function _parseCanonColombiano(valor) {
  var s = String(valor || '').trim().replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    var puntos = (s.match(/\./g) || []).length;
    if (puntos > 1) {
      s = s.replace(/\./g, '');
    } else if (puntos === 1) {
      var partes = s.split('.');
      if (partes[1] && partes[1].length === 3) {
        s = partes.join('');
      }
    }
  }
  return parseFloat(s) || 0;
}

/**
 * Genera el contexto de fecha para "hoy".
 * @param {Date} [fecha] - Fecha a usar como "hoy" (para testing). Default: new Date()
 * @returns {Object} ctx con propiedades: hoy, y, m_s, d_s, fmts
 */
function _buildFechaHoyFormats(fecha) {
  var hoy = fecha || new Date();
  var d = String(hoy.getDate()).padStart(2, '0');
  var m = String(hoy.getMonth() + 1).padStart(2, '0');
  var y = hoy.getFullYear();
  var d_s = hoy.getDate();
  var m_s = hoy.getMonth() + 1;
  return {
    hoy: hoy, y: y, m_s: m_s, d_s: d_s,
    fmts: [
      d + '/' + m + '/' + y,
      y + '-' + m + '-' + d,
      d_s + '/' + m_s + '/' + y,
      m_s + '/' + d_s + '/' + y
    ]
  };
}

// ============================================================
// FUNCIONES FUSIONADAS — PLACEHOLDERS
// (Implementación completa se realiza en tasks 1.1 y 1.2)
// ============================================================

/**
 * Fusión de conteo + recolección para hoja principal (Hoja_Solicitud).
 * FUNCIÓN PURA: no realiza I/O, opera solo sobre el arreglo recibido.
 *
 * @param {Array<Array>} dataSolicitudes - Datos completos de la hoja (con header en [0])
 * @param {string} userEmail - Email del analista normalizado (lowercase, trimmed)
 * @param {Object} ctx - Contexto de fecha (de _buildFechaHoyFormats)
 * @param {Object} cuotas - Cupos efectivos del analista
 * @param {Object} equipo - Configuración del equipo { canonDesde, canonHasta, canonTipos }
 * @returns {{ conteoHoy: Object, cargaPendiente: number, pendientes: Array }}
 */
function _contarYRecolectarPrincipal(dataSolicitudes, userEmail, ctx, cuotas, equipo) {
  // TODO: Implementar en task 1.1
  // Esta función fusionará la lógica de _contarDesdeHojaPrincipal y
  // _recolectarPendientesPrincipal en una única iteración sobre dataSolicitudes.
  throw new Error('_contarYRecolectarPrincipal: pendiente de implementación (task 1.1)');
}

/**
 * Fusión de conteo + recolección para hoja ORIGEN (reestudios).
 * FUNCIÓN PURA: no realiza I/O, opera solo sobre el arreglo recibido.
 *
 * @param {Array<Array>} dataReestudios - Datos completos de ORIGEN (con header en [0])
 * @param {string} userEmail - Email del analista normalizado (lowercase, trimmed)
 * @param {Object} ctx - Contexto de fecha
 * @param {Object} cuotas - Cupos efectivos
 * @returns {{ conteoHoy: Object, cargaPendiente: number, pendientes: Array }}
 */
function _contarYRecolectarReestudios(dataReestudios, userEmail, ctx, cuotas) {
  // TODO: Implementar en task 1.2
  // Esta función fusionará la lógica de _contarDesdeHojaReestudios y
  // _recolectarPendientesReestudios en una única iteración sobre dataReestudios.
  throw new Error('_contarYRecolectarReestudios: pendiente de implementación (task 1.2)');
}

/**
 * Lee un bloque contiguo [minRow:maxRow] y devuelve solo las filas cuyos
 * índices están en `filasDeseadas`.
 *
 * FUNCIÓN PURA para testing: recibe el bloque de datos directamente en lugar
 * de un objeto `hoja`. En producción (GAS), la versión en Código.js hace el
 * getRange; aquí simulamos la lógica de mapeo.
 *
 * @param {Array<Array>} bloqueCompleto - Datos del bloque [filaMin..filaMax] ya leídos
 * @param {Array<number>} filasDeseadas - Números de fila (1-indexed) a extraer
 * @param {number} filaMin - Fila mínima del bloque (1-indexed)
 * @returns {Array<Array>} Datos de las filas solicitadas, en el mismo orden que filasDeseadas
 */
function _leerBloqueCasosAbiertos(bloqueCompleto, filasDeseadas, filaMin) {
  if (!filasDeseadas || filasDeseadas.length === 0) return [];
  return filasDeseadas.map(function (fila) {
    return bloqueCompleto[fila - filaMin];
  });
}

// ============================================================
// EXPORTS
// ============================================================

export {
  _contarYRecolectarPrincipal,
  _contarYRecolectarReestudios,
  _leerBloqueCasosAbiertos,
  // Helpers exportados para uso en generadores y assertions de los tests
  _cumpleHoyUnif,
  _normalizarClaveUnif,
  _parseDateUnif,
  _parseCanonColombiano,
  _buildFechaHoyFormats,
};
