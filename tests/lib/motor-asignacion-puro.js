/**
 * ============================================================
 * Motor de Asignación — Funciones Puras (exportables para testing)
 * ============================================================
 *
 * Mirror fiel de las funciones puras que viven en MotorAsignacion.js del
 * proyecto GAS (RequestLeadUnificado y sus helpers). Cada función aquí debe
 * mantenerse en sync carácter por carácter con su equivalente real — cuando
 * se cambie la lógica de conteo/recolección/parsing en MotorAsignacion.js,
 * este archivo debe actualizarse en el mismo commit.
 *
 * Únicas desviaciones deliberadas frente al original (documentadas donde
 * aparecen): _buildFechaHoyFormats acepta un parámetro `fecha` opcional para
 * poder fijar "hoy" en los tests (el real siempre usa `new Date()`).
 */

// ============================================================
// HELPERS (mirror exacto de MotorAsignacion.js)
// ============================================================

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
      d + '/' + m + '/' + y,           // DD/MM/YYYY
      y + '-' + m + '-' + d,           // YYYY-MM-DD
      d_s + '/' + m_s + '/' + y,       // D/M/YYYY
      m_s + '/' + d_s + '/' + y,       // M/D/YYYY
      m + '/' + d + '/' + y            // MM/DD/YYYY
    ]
  };
}

function _cumpleHoyUnif(val, ctx) {
  if (!val) return false;
  if (val instanceof Date) {
    return val.getFullYear() === ctx.y && val.getMonth() === (ctx.m_s - 1) && val.getDate() === ctx.d_s;
  }
  var texto = String(val);
  for (var i = 0; i < ctx.fmts.length; i++) {
    if (texto.indexOf(ctx.fmts[i]) !== -1) return true;
  }
  return false;
}

function _normalizarClaveUnif(valor) {
  if (!valor) return "";
  var digits = valor.toString().split(/[.,]/)[0].replace(/\D/g, '');
  return digits.replace(/^0+/, '') || "0";
}

function _parseDateUnif(dateStr) {
  if (!dateStr || String(dateStr).trim() === "") return 9999999999999;
  if (dateStr instanceof Date) return dateStr.getTime();
  try {
    var str = String(dateStr).trim();
    var partes = str.split(' ');
    var dateParts = partes[0].split(/[\/\-]/);
    var horas = 0, mins = 0, segs = 0;
    if (partes.length > 1) {
      var timeParts = partes[1].split(':');
      horas = parseInt(timeParts[0]) || 0;
      mins = parseInt(timeParts[1]) || 0;
      segs = parseInt(timeParts[2]) || 0;
    }
    if (dateParts.length === 3) {
      if (dateParts[0].length === 4) {
        return new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), horas, mins, segs).getTime();
      }
      return new Date(parseInt(dateParts[2]), parseInt(dateParts[1]) - 1, parseInt(dateParts[0]), horas, mins, segs).getTime();
    }
    var fallback = new Date(dateStr).getTime();
    return isNaN(fallback) ? 9999999999999 : fallback;
  } catch (e) {
    return 9999999999999;
  }
}

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

// Mirror de _calcularLimiteLiberacionDesaplazamiento (Biometria.js) — pura,
// solo aritmética de fechas, sin I/O. Ver comentario original: antes de las
// 12m solo libera lo de ANTES de hoy; desde las 12m libera también hoy 00:00-11:59am.
function _calcularLimiteLiberacionDesaplazamiento(ahora) {
  var hoy00 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (ahora.getHours() < 12) return hoy00;
  return new Date(hoy00.getTime() + 12 * 60 * 60 * 1000);
}

// ============================================================
// FUNCIONES FUSIONADAS (conteo + recolección en 1 pasada)
// Mirror exacto de MotorAsignacion.js — ver ese archivo para comentarios
// de diseño completos.
// ============================================================

function _contarYRecolectarPrincipal(dataSolicitudes, userEmail, ctx, cuotas, equipo) {
  var conteoHoy = { digital: 0, desaplazamiento: 0, induccion: 0, reestudio: 0, nuevaUar: 0, deudorUar: 0, biometriaFallida: 0 };
  var cargaPendiente = 0;
  var pendientes = [];

  if (!dataSolicitudes || dataSolicitudes.length < 2) {
    return { conteoHoy: conteoHoy, cargaPendiente: cargaPendiente, pendientes: pendientes };
  }

  var canonDesde = equipo.canonDesde || 0;
  var canonHasta = equipo.canonHasta || 0;
  var canonTipos = equipo.canonTipos || [];

  for (var i = 1; i < dataSolicitudes.length; i++) {
    var row = dataSolicitudes[i];
    var asignado = String(row[27]).trim();

    var estadoNorm = String(row[16]).trim().toUpperCase().normalize("NFD").replace(new RegExp('[\\u0300-\\u036f]', 'g'), "");
    var claseNorm = String(row[20]).trim().toUpperCase().normalize("NFD").replace(new RegExp('[\\u0300-\\u036f]', 'g'), "");
    var estadoSinGuion = estadoNorm.replace(/_/g, ' ');

    var esDesaplazamiento = estadoSinGuion === 'APROBADO PENDIENTE BIOMETRIA' || estadoNorm === 'APROBADO_PENDIENTE_BIOMETRIA';
    var esInduccion = claseNorm === "INDUCCION";

    if (asignado !== "") continue;
    if (estadoNorm === "") continue;

    if ((estadoNorm.indexOf("APROB") !== -1 && !esDesaplazamiento) || estadoNorm.indexOf("NEGAD") !== -1 || estadoNorm.indexOf("RECHAZ") !== -1 || estadoNorm.indexOf("APLAZ") !== -1) continue;

    var esNueva = estadoNorm === 'EN_ESTUDIO' || estadoSinGuion === 'EN ESTUDIO';
    if (!esNueva && !esDesaplazamiento && !esInduccion) continue;

    var tipoPendiente = 'digital';
    if (esDesaplazamiento) tipoPendiente = 'desaplazamiento';
    else if (esInduccion) tipoPendiente = 'induccion';

    if (canonTipos && canonTipos.indexOf(tipoPendiente) !== -1 && (canonDesde > 0 || canonHasta > 0)) {
      var canonValor = _parseCanonColombiano(row[9]);
      if (canonDesde > 0 && canonValor < canonDesde) continue;
      if (canonHasta > 0 && canonValor > canonHasta) continue;
    }

    var reasignada = row.length > 58 && String(row[58]).trim().toUpperCase() === "REASIGNADA";
    if (!reasignada && conteoHoy[tipoPendiente] >= (cuotas[tipoPendiente] || 0)) continue;

    var canalNorm = String(row[36] || "").toUpperCase().trim().replace(/\s+/g, '_');
    var esExterno = canalNorm !== '' && canalNorm !== 'EL_LIBERTADOR';

    pendientes.push({
      base: 'PRINCIPAL',
      rowIndex: i + 1,
      rowData: row,
      tipo: tipoPendiente,
      reasignada: reasignada,
      esExterno: esExterno,
      polizaKey: _normalizarClaveUnif(row[1]),
      fechaOrd: _parseDateUnif(tipoPendiente === 'desaplazamiento' ? row[18] : row[17])
    });
  }

  return { conteoHoy: conteoHoy, cargaPendiente: cargaPendiente, pendientes: pendientes };
}

function _contarYRecolectarReestudios(dataReestudios, userEmail, ctx, cuotas) {
  var conteoHoy = { reestudio: 0, nuevaUar: 0, deudorUar: 0, biometriaFallida: 0 };
  var cargaPendiente = 0;
  var pendientes = [];

  if (!dataReestudios || dataReestudios.length < 2) {
    return { conteoHoy: conteoHoy, cargaPendiente: cargaPendiente, pendientes: pendientes };
  }

  for (var i = 1; i < dataReestudios.length; i++) {
    var row = dataReestudios[i];
    var asignado = String(row[6]).trim();

    var origenR = String(row[3]).toUpperCase().trim();
    var tipoPNorm = String(row[4]).toUpperCase().trim().normalize("NFD").replace(new RegExp('[\\u0300-\\u036f]', 'g'), "");

    var tipo = null;
    if (tipoPNorm.indexOf("BIOMETRIA FALLIDA") !== -1) tipo = 'biometriaFallida';
    else if (origenR === "CORREO" && tipoPNorm === "NUEVA") tipo = 'nuevaUar';
    else if (origenR === "CORREO" && tipoPNorm === "ADICIONAL") tipo = 'deudorUar';
    else if (tipoPNorm === "REESTUDIO") tipo = 'reestudio';

    if (asignado !== "") continue;

    var estadoGest = String(row[10]).trim();
    if (estadoGest !== "") continue;
    if (String(row[1]).trim() === "") continue;
    if (!tipo) continue;
    if (conteoHoy[tipo] >= (cuotas[tipo] || 0)) continue;

    pendientes.push({
      base: 'REESTUDIOS',
      rowIndex: i + 1,
      rowData: row,
      tipo: tipo,
      reasignada: false,
      esExterno: false,
      polizaKey: _normalizarClaveUnif(row[1] || row[3]),
      fechaOrd: _parseDateUnif(row[0])
    });
  }

  return { conteoHoy: conteoHoy, cargaPendiente: cargaPendiente, pendientes: pendientes };
}

/**
 * Lee un bloque contiguo [minRow:maxRow] y devuelve solo las filas cuyos
 * índices están en `filasDeseadas`.
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
  _calcularLimiteLiberacionDesaplazamiento,
  _leerBloqueCasosAbiertos,
  _cumpleHoyUnif,
  _normalizarClaveUnif,
  _parseDateUnif,
  _parseCanonColombiano,
  _buildFechaHoyFormats,
};
