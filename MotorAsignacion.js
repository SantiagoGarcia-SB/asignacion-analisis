/**
 * ====================================================
 * MOTOR DE ASIGNACIÓN GENÉRICO (UNIFICADO)
 * ====================================================
 * Combina las capacidades de RequestLead (VIP, score, prioridad)
 * y RequestLeadReestudios (FIFO) en un motor configurable.
 *
 * Cada equipo define en la hoja "Equipos":
 *  - usarVipRotacion: activa rotación VIP + score categories
 *  - usarScoreCategories: activa buckets por categoría de póliza
 *  - maxAsignarPorLlamada: cuántos casos asignar por invocación
 *  - ordenPrioridad: orden personalizado de tipos de caso
 *  - fuentesDatos: desde qué spreadsheets/hojas buscar casos
 */

const MAX_VIP_CONSECUTIVAS_UNIF = 2;
const CATEGORIAS_ROTACION_UNIF = ['mediana', 'grande', 'pequena', 'gen', 'dev', 'rev', 'otros'];

const ETIQUETAS_TIPO = {
  digital: 'Digital', desaplazamiento: 'Desaplazamiento', induccion: 'Inducción',
  reestudio: 'Reestudios', nuevaUar: 'Nueva UAR', deudorUar: 'Deudor UAR',
  biometriaFallida: 'Biometría Fallida'
};

const ORDEN_PRIORIDAD_MODOS = {
  DIGITAL_PRIMERO:          ['digital', 'desaplazamiento', 'induccion', 'biometriaFallida', 'reestudio', 'nuevaUar', 'deudorUar'],
  NUEVAS_PRIMERO:           ['digital', 'desaplazamiento', 'induccion', 'biometriaFallida', 'reestudio', 'nuevaUar', 'deudorUar'],
  DESAPLAZAMIENTO_PRIMERO:  ['desaplazamiento', 'digital', 'induccion', 'biometriaFallida', 'reestudio', 'nuevaUar', 'deudorUar'],
  INDUCCION_PRIMERO:        ['induccion', 'digital', 'desaplazamiento', 'biometriaFallida', 'reestudio', 'nuevaUar', 'deudorUar'],
  REESTUDIOS_PRIMERO:       ['reestudio', 'nuevaUar', 'deudorUar', 'biometriaFallida', 'digital', 'desaplazamiento', 'induccion']
};

// ============================================================
// HELPERS DE FECHA (extraídos de RequestLead)
// ============================================================

function _buildFechaHoyFormats() {
  var hoy = new Date();
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

// ============================================================
// CONTEO DE CARGA Y CUPOS USADOS HOY
// ============================================================

function _contarDesdeHojaPrincipal(userEmail, ss, ctx, dataPrecargada) {
  var conteoHoy = { digital: 0, desaplazamiento: 0, induccion: 0, reestudio: 0, nuevaUar: 0, deudorUar: 0, biometriaFallida: 0 };
  var cargaPendiente = 0;

  var hoja = ss.getSheetByName("solicitud");
  if (!dataPrecargada && (!hoja || hoja.getLastRow() < 2)) return { conteoHoy: conteoHoy, cargaPendiente: cargaPendiente };

  var data = dataPrecargada || hoja.getRange("A1:BG" + hoja.getLastRow()).getValues();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var asignado = String(row[27]).trim().toLowerCase();
    if (asignado !== userEmail) continue;

    var fechaAsig = row[26];
    var fechaFin = row[28];
    var claseNorm = String(row[20]).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    var estadoNorm = String(row[16]).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    var estadoSinGuion = estadoNorm.replace(/_/g, ' ');

    var tipo = 'digital';
    if (estadoSinGuion === 'APROBADO PENDIENTE BIOMETRIA' || estadoNorm === 'APROBADO_PENDIENTE_BIOMETRIA') tipo = 'desaplazamiento';
    else if (claseNorm === "INDUCCION") tipo = 'induccion';

    if (_cumpleHoyUnif(fechaAsig, ctx) || _cumpleHoyUnif(fechaFin, ctx)) conteoHoy[tipo]++;
    var tieneAsig = fechaAsig instanceof Date || String(fechaAsig).trim() !== "";
    var tieneFin = fechaFin instanceof Date || String(fechaFin).trim() !== "";
    if (tieneAsig && !tieneFin) cargaPendiente++;
  }

  // Nota: lo que antes vivía en Historico_Gestiones (que solo crece y nunca se
  // archiva) ya no se escanea aquí en cada asignación — se lee de contadores
  // incrementales (_obtenerConteoHoyAnalista / _obtenerCargaPendienteAnalista,
  // Código.js), sumados en RequestLeadUnificado. Ver admin_recalcularContadores()
  // en Admin.js si alguna vez hace falta reconstruirlos desde cero.

  return { conteoHoy: conteoHoy, cargaPendiente: cargaPendiente, hojaRef: hoja, dataSolicitudes: data };
}

function _contarDesdeHojaReestudios(userEmail, ssReestudios, ctx, dataPrecargada) {
  var conteoHoy = { reestudio: 0, nuevaUar: 0, deudorUar: 0, biometriaFallida: 0 };
  var cargaPendiente = 0;

  var hoja = ssReestudios.getSheetByName("ORIGEN");
  if (!dataPrecargada && (!hoja || hoja.getLastRow() < 2)) return { conteoHoy: conteoHoy, cargaPendiente: cargaPendiente };

  var data = dataPrecargada || hoja.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var asignado = String(row[6]).trim().toLowerCase();
    if (asignado !== userEmail) continue;

    var origenR = String(row[3]).toUpperCase().trim();
    var tipoPNorm = String(row[4]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
    var tipo = null;
    if (tipoPNorm.indexOf("BIOMETRIA FALLIDA") !== -1) tipo = 'biometriaFallida';
    else if (origenR === "CORREO" && tipoPNorm === "NUEVA") tipo = 'nuevaUar';
    else if (origenR === "CORREO" && tipoPNorm === "ADICIONAL") tipo = 'deudorUar';
    else if (tipoPNorm === "REESTUDIO") tipo = 'reestudio';

    if (!tipo) continue;
    if (_cumpleHoyUnif(row[8], ctx) || _cumpleHoyUnif(row[9], ctx)) conteoHoy[tipo]++;
    var tieneAsig = row[8] instanceof Date ? true : String(row[8]).trim() !== "";
    var tieneFin = row[9] instanceof Date ? true : String(row[9]).trim() !== "";
    if (tieneAsig && !tieneFin) cargaPendiente++;
  }

  // Nota: igual que en _contarDesdeHojaPrincipal, el escaneo de Historico_Gestiones
  // de reestudios se reemplazó por los contadores incrementales (ver Código.js).

  return { conteoHoy: conteoHoy, cargaPendiente: cargaPendiente, hojaRef: hoja, dataReestudios: data };
}

// ============================================================
// RECOLECCIÓN DE PENDIENTES
// ============================================================

// Parsea un canon que puede venir como número plano (54000000) o con formato
// colombiano (miles con punto, decimales con coma: "8.500.000,00" o "8.500").
// Un replace ingenuo de la coma por punto no basta: deja los puntos de miles
// intactos y parseFloat corta en el segundo punto ("8.500.000" -> 8.5).
function _parseCanonColombiano(valor) {
  var s = String(valor || '').trim().replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  if (s.indexOf(',') !== -1) {
    // Coma presente: es el separador decimal, los puntos son de miles.
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    var puntos = (s.match(/\./g) || []).length;
    if (puntos > 1) {
      // Más de un punto sin coma: todos son separadores de miles.
      s = s.replace(/\./g, '');
    } else if (puntos === 1) {
      var partes = s.split('.');
      if (partes[1] && partes[1].length === 3) {
        // Un solo punto con 3 dígitos detrás ("8.500") es separador de miles
        // en formato colombiano, no decimal.
        s = partes.join('');
      }
    }
  }
  return parseFloat(s) || 0;
}

function _recolectarPendientesPrincipal(dataSolicitudes, cuotas, conteoHoy, canonDesde, canonHasta, canonTipos) {
  var pendientes = [];
  // Límite superior sobre fechaResultado para desaplazamiento/biometría, según la regla
  // real de operación (ver _calcularLimiteLiberacionDesaplazamiento en Biometria.js): un
  // caso "de esta tarde" no se ofrece hasta la sesión de mañana del siguiente día hábil,
  // aunque ya esté escalado en la cola.
  var limiteLiberacionDesaplazamiento = _calcularLimiteLiberacionDesaplazamiento(new Date());
  for (var i = 1; i < dataSolicitudes.length; i++) {
    var row = dataSolicitudes[i];
    var asignado = String(row[27]).trim();
    var estadoNorm = String(row[16]).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    var claseNorm = String(row[20]).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    var estadoSinGuion = estadoNorm.replace(/_/g, ' ');

    if (asignado !== "") continue;
    if (estadoNorm === "") continue;

    var esDesaplazamiento = estadoSinGuion === 'APROBADO PENDIENTE BIOMETRIA' || estadoNorm === 'APROBADO_PENDIENTE_BIOMETRIA';
    if ((estadoNorm.indexOf("APROB") !== -1 && !esDesaplazamiento) || estadoNorm.indexOf("NEGAD") !== -1 || estadoNorm.indexOf("RECHAZ") !== -1 || estadoNorm.indexOf("APLAZ") !== -1) continue;

    var esInduccion = claseNorm === "INDUCCION";
    var esNueva = estadoNorm === 'EN_ESTUDIO' || estadoSinGuion === 'EN ESTUDIO';

    if (!esNueva && !esDesaplazamiento && !esInduccion) continue;

    var tipo = 'digital';
    if (esDesaplazamiento) tipo = 'desaplazamiento';
    else if (esInduccion) tipo = 'induccion';

    if (canonTipos && canonTipos.indexOf(tipo) !== -1 && (canonDesde > 0 || canonHasta > 0)) {
      var canonValor = _parseCanonColombiano(row[9]);
      if (canonDesde > 0 && canonValor < canonDesde) continue;
      if (canonHasta > 0 && canonValor > canonHasta) continue;
    }

    var reasignada = row.length > 58 && String(row[58]).trim().toUpperCase() === "REASIGNADA";
    if (!reasignada && conteoHoy[tipo] >= (cuotas[tipo] || 0)) continue;

    if (esDesaplazamiento && !reasignada) {
      // _parseDateUnif devuelve un NÚMERO (ms desde epoch), no un Date — y 9999999999999
      // si no pudo parsear fecha (fechaResultado vacía). No se filtra ese caso: bloquearlo
      // para siempre sería peor que la prioridad baja que ya le daba el orden existente.
      var fechaResultadoCaseMs = _parseDateUnif(row[18]);
      if (fechaResultadoCaseMs !== 9999999999999 && fechaResultadoCaseMs > limiteLiberacionDesaplazamiento.getTime()) continue;
    }

    var canalNorm = String(row[36] || "").toUpperCase().trim().replace(/\s+/g, '_');
    var esExterno = canalNorm !== '' && canalNorm !== 'EL_LIBERTADOR';

    pendientes.push({
      base: 'PRINCIPAL',
      rowIndex: i + 1,
      rowData: row,
      tipo: tipo,
      reasignada: reasignada,
      esExterno: esExterno,
      polizaKey: _normalizarClaveUnif(row[1]),
      // desaplazamiento se ordena por fechaResultado (última actualización de SAI), no por fechaRadicacion
      fechaOrd: _parseDateUnif(tipo === 'desaplazamiento' ? row[18] : row[17])
    });
  }
  return pendientes;
}

function _recolectarPendientesReestudios(dataReestudios, cuotas, conteoHoy) {
  var pendientes = [];
  for (var i = 1; i < dataReestudios.length; i++) {
    var row = dataReestudios[i];
    var asignado = String(row[6]).trim();
    var estadoGest = String(row[10]).trim();

    if (asignado !== "") continue;
    if (estadoGest !== "") continue;
    if (String(row[1]).trim() === "") continue;

    var origenR = String(row[3]).toUpperCase().trim();
    var tipoPNorm = String(row[4]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");

    var tipo = null;
    if (tipoPNorm.indexOf("BIOMETRIA FALLIDA") !== -1) tipo = 'biometriaFallida';
    else if (origenR === "CORREO" && tipoPNorm === "NUEVA") tipo = 'nuevaUar';
    else if (origenR === "CORREO" && tipoPNorm === "ADICIONAL") tipo = 'deudorUar';
    else if (tipoPNorm === "REESTUDIO") tipo = 'reestudio';

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
  return pendientes;
}

// ============================================================
// FUNCIONES FUSIONADAS (conteo + recolección en 1 pasada)
// ============================================================

/**
 * Fusión de conteo + recolección para hoja principal.
 * FUNCIÓN PURA: no realiza I/O, opera solo sobre el arreglo recibido.
 *
 * Combina la lógica de _contarDesdeHojaPrincipal (conteo de asignaciones del día
 * y carga pendiente para el analista) con _recolectarPendientesPrincipal (recolección
 * de casos disponibles para asignación) en una única iteración sobre dataSolicitudes.
 *
 * @param {Array<Array>} dataSolicitudes - Datos completos de la hoja (con header en [0])
 * @param {string} userEmail - Email del analista normalizado (lowercase, trimmed)
 * @param {Object} ctx - Contexto de fecha (de _buildFechaHoyFormats)
 * @param {Object} cuotas - Cupos efectivos del analista
 * @param {Object} equipo - Configuración del equipo (canonDesde, canonHasta, canonTipos)
 * @returns {{ conteoHoy: Object, cargaPendiente: number, pendientes: Array }}
 */
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

  // Límite de liberación para desaplazamiento (mismo cálculo que _recolectarPendientesPrincipal)
  var limiteLiberacionDesaplazamiento = _calcularLimiteLiberacionDesaplazamiento(new Date());

  for (var i = 1; i < dataSolicitudes.length; i++) {
    var row = dataSolicitudes[i];
    var asignado = String(row[27]).trim();

    // --- Clasificación de tipo (compartida por conteo y recolección) ---
    var estadoNorm = String(row[16]).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    var claseNorm = String(row[20]).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    var estadoSinGuion = estadoNorm.replace(/_/g, ' ');

    var esDesaplazamiento = estadoSinGuion === 'APROBADO PENDIENTE BIOMETRIA' || estadoNorm === 'APROBADO_PENDIENTE_BIOMETRIA';
    var esInduccion = claseNorm === "INDUCCION";

    // Una fila con `asignado` lleno nunca persiste en esta hoja: _asignarCasoPrincipal
    // escribe el email y, en la MISMA llamada, hace deleteRow() y mueve la fila a
    // Historico_Gestiones. Por eso no hay una "rama de conteo" real aquí — conteoHoy/
    // cargaPendiente de esta función quedan siempre en 0 por construcción; el conteo/carga
    // pendiente real vienen exclusivamente de los contadores incrementales
    // (_obtenerConteoHoyAnalista/_obtenerCargaPendienteAnalista, Código.js). No es una
    // segunda fuente de verdad que valide a esos contadores — ver nota en RequestLeadUnificado.
    if (asignado !== "") continue; // Asignada (a este analista o a otro), saltar
    if (estadoNorm === "") continue;

    // Filtros de exclusión por estado
    if ((estadoNorm.indexOf("APROB") !== -1 && !esDesaplazamiento) || estadoNorm.indexOf("NEGAD") !== -1 || estadoNorm.indexOf("RECHAZ") !== -1 || estadoNorm.indexOf("APLAZ") !== -1) continue;

    var esNueva = estadoNorm === 'EN_ESTUDIO' || estadoSinGuion === 'EN ESTUDIO';
    if (!esNueva && !esDesaplazamiento && !esInduccion) continue;

    var tipoPendiente = 'digital';
    if (esDesaplazamiento) tipoPendiente = 'desaplazamiento';
    else if (esInduccion) tipoPendiente = 'induccion';

    // Filtro de canon
    if (canonTipos && canonTipos.indexOf(tipoPendiente) !== -1 && (canonDesde > 0 || canonHasta > 0)) {
      var canonValor = _parseCanonColombiano(row[9]);
      if (canonDesde > 0 && canonValor < canonDesde) continue;
      if (canonHasta > 0 && canonValor > canonHasta) continue;
    }

    // Filtro de cupo (reasignadas bypasean el cupo)
    var reasignada = row.length > 58 && String(row[58]).trim().toUpperCase() === "REASIGNADA";
    if (!reasignada && conteoHoy[tipoPendiente] >= (cuotas[tipoPendiente] || 0)) continue;

    // Filtro de fecha de liberación para desaplazamiento
    if (esDesaplazamiento && !reasignada) {
      var fechaResultadoCaseMs = _parseDateUnif(row[18]);
      if (fechaResultadoCaseMs !== 9999999999999 && fechaResultadoCaseMs > limiteLiberacionDesaplazamiento.getTime()) continue;
    }

    // Detección de canal externo
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

/**
 * Fusión de conteo + recolección para hoja ORIGEN (reestudios).
 * FUNCIÓN PURA: no realiza I/O, opera solo sobre el arreglo recibido.
 *
 * Combina la lógica de _contarDesdeHojaReestudios (conteo de asignaciones
 * del día y carga pendiente del analista) con _recolectarPendientesReestudios
 * (recolección de casos disponibles para asignar) en una única iteración.
 *
 * @param {Array<Array>} dataReestudios - Datos completos de ORIGEN (con header en [0])
 * @param {string} userEmail - Email del analista normalizado (lowercase, trimmed)
 * @param {Object} ctx - Contexto de fecha (de _buildFechaHoyFormats)
 * @param {Object} cuotas - Cupos efectivos del analista
 * @returns {{ conteoHoy: Object, cargaPendiente: number, pendientes: Array }}
 */
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

    // --- Clasificación del tipo (compartida por conteo y recolección) ---
    var origenR = String(row[3]).toUpperCase().trim();
    var tipoPNorm = String(row[4]).toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    var tipo = null;
    if (tipoPNorm.indexOf("BIOMETRIA FALLIDA") !== -1) tipo = 'biometriaFallida';
    else if (origenR === "CORREO" && tipoPNorm === "NUEVA") tipo = 'nuevaUar';
    else if (origenR === "CORREO" && tipoPNorm === "ADICIONAL") tipo = 'deudorUar';
    else if (tipoPNorm === "REESTUDIO") tipo = 'reestudio';

    // Mismo caso que en _contarYRecolectarPrincipal: _asignarCasoReestudios borra la fila
    // de ORIGEN en la misma llamada en que la asigna, así que nunca persiste una fila con
    // `asignado` lleno aquí — conteoHoy/cargaPendiente quedan siempre en 0 por construcción.
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

// ============================================================
// VIP ROTATION & SCORE CATEGORIES
// ============================================================

// Caché de buckets VIP/score (poliza → categoría de rotación), particionado en
// CacheService igual que _getScoreMapCacheado (Código.js) — CacheService no admite
// valores >100KB por key. Antes, _aplicarVipYScore releía la hoja "score" completa
// (sin caché) en CADA asignación de Digital/Cánones Altos, DENTRO del ScriptLock
// global — con ~2286 filas (dotación real, ver .kiro/PROMPT_OPTIMIZACION_LATENCIA.md)
// era el tramo individual más caro retenido bajo el lock. Se llama ahora ANTES de
// tomar el lock (ver RequestLeadUnificado): los buckets son de solo lectura y no
// cambian por asignaciones concurrentes de otros analistas, así que no necesitan
// estar bajo el lock — solo los 2 setProperty de VIP_COUNT/PUNTERO_ROTACION sí.
var _scoreBucketsMemo = null;
const _SCORE_BUCKETS_CACHE_PREFIX = 'SCORE_BUCKETS_V1_';
const _SCORE_BUCKETS_CACHE_CHUNK = 90000;
const _SCORE_BUCKETS_CATEGORIAS = ['vip', 'grande', 'mediana', 'pequena', 'gen', 'dev', 'rev', 'otros'];

function _getScoreBucketsCacheado(ss) {
  if (_scoreBucketsMemo) return _scoreBucketsMemo;
  var _t0 = Date.now();
  var cache = CacheService.getScriptCache();
  try {
    var countStr = cache.get(_SCORE_BUCKETS_CACHE_PREFIX + 'COUNT');
    if (countStr) {
      var count = parseInt(countStr, 10);
      var keys = [];
      for (var i = 0; i < count; i++) keys.push(_SCORE_BUCKETS_CACHE_PREFIX + i);
      var partes = cache.getAll(keys);
      var json = '';
      var completo = true;
      for (var j = 0; j < count; j++) {
        var parte = partes[_SCORE_BUCKETS_CACHE_PREFIX + j];
        if (parte === null || parte === undefined) { completo = false; break; }
        json += parte;
      }
      if (completo) {
        var obj = JSON.parse(json);
        var bucketsHit = {};
        _SCORE_BUCKETS_CATEGORIAS.forEach(function(cat) { bucketsHit[cat] = new Set(obj[cat] || []); });
        Logger.log('⏱ SPERF _getScoreBucketsCacheado: cache hit (' + count + ' partes) = ' + (Date.now() - _t0) + 'ms');
        _scoreBucketsMemo = bucketsHit;
        return _scoreBucketsMemo;
      }
    }
  } catch (e) {}

  Logger.log('⏱ SPERF _getScoreBucketsCacheado: CACHE MISS — leyendo hoja "score" completa');
  var buckets = { vip: new Set(), grande: new Set(), mediana: new Set(), pequena: new Set(), gen: new Set(), dev: new Set(), rev: new Set(), otros: new Set() };
  try {
    var hojaScore = ss.getSheetByName("score");
    if (hojaScore) {
      var _tRead0 = Date.now();
      var dataScore = hojaScore.getDataRange().getDisplayValues();
      Logger.log('⏱ SPERF _getScoreBucketsCacheado: lectura completa "score" (' + dataScore.length + ' filas) = ' + (Date.now() - _tRead0) + 'ms');
      for (var r = 1; r < dataScore.length; r++) {
        var key = _normalizarClaveUnif(dataScore[r][0]);
        if (!key || key === "0") continue;
        var cat = dataScore[r][1].toString().toLowerCase().trim();
        if (cat.indexOf("vip") !== -1) buckets.vip.add(key);
        else if (cat.indexOf("grande") !== -1) buckets.grande.add(key);
        else if (cat.indexOf("mediana") !== -1) buckets.mediana.add(key);
        else if (cat.indexOf("peque") !== -1) buckets.pequena.add(key);
        else if (cat.indexOf("generica") !== -1) buckets.gen.add(key);
        else if (cat.indexOf("en desarrollo") !== -1) buckets.dev.add(key);
        else if (cat.indexOf("revisar") !== -1) buckets.rev.add(key);
        else buckets.otros.add(key);
      }
    }
  } catch (e) {
    Logger.log('_getScoreBucketsCacheado: ' + e.message);
  }

  try {
    var serializable = {};
    _SCORE_BUCKETS_CATEGORIAS.forEach(function(cat) { serializable[cat] = Array.from(buckets[cat]); });
    var json2 = JSON.stringify(serializable);
    var partesGuardar = {};
    var n = 0;
    for (var p = 0; p < json2.length; p += _SCORE_BUCKETS_CACHE_CHUNK) {
      partesGuardar[_SCORE_BUCKETS_CACHE_PREFIX + n] = json2.substring(p, p + _SCORE_BUCKETS_CACHE_CHUNK);
      n++;
    }
    partesGuardar[_SCORE_BUCKETS_CACHE_PREFIX + 'COUNT'] = String(n);
    cache.putAll(partesGuardar, 3600); // 1 hora — igual que _getScoreMapCacheado, la hoja "score" casi nunca cambia
  } catch (e) {
    Logger.log('⏱ SPERF _getScoreBucketsCacheado: cache.putAll falló (' + e.message + ')');
  }

  Logger.log('⏱ SPERF _getScoreBucketsCacheado: total (cache miss) = ' + (Date.now() - _t0) + 'ms');
  _scoreBucketsMemo = buckets;
  return _scoreBucketsMemo;
}

// `buckets` ya viene construido (por _getScoreBucketsCacheado, fuera del lock —
// ver RequestLeadUnificado) — esta función solo hace CPU pura sobre candidatos
// ya en memoria más los 2 setProperty de VIP/rotación, que sí deben serializarse
// bajo el lock por ser estado compartido entre analistas concurrentes.
function _aplicarVipYScore(candidatos, buckets, userEmail, propsRef) {
  var punteroRotacion = parseInt(propsRef.getProperty('PUNTERO_ROTACION')) || 0;
  var contadorVIP = parseInt(propsRef.getProperty('VIP_COUNT_' + userEmail)) || 0;

  var tipoAsignar = 'vip';
  if (contadorVIP >= MAX_VIP_CONSECUTIVAS_UNIF) {
    tipoAsignar = CATEGORIAS_ROTACION_UNIF[punteroRotacion % CATEGORIAS_ROTACION_UNIF.length];
  }

  var leadSeleccionado = candidatos.find(function(item) { return buckets[tipoAsignar] && buckets[tipoAsignar].has(item.polizaKey); });

  if (!leadSeleccionado) {
    var bucketEntries = Object.entries(buckets);
    for (var j = 0; j < bucketEntries.length; j++) {
      leadSeleccionado = candidatos.find(function(item) { return bucketEntries[j][1].has(item.polizaKey); });
      if (leadSeleccionado) { tipoAsignar = bucketEntries[j][0]; break; }
    }
  }

  if (!leadSeleccionado) {
    leadSeleccionado = candidatos[0];
    tipoAsignar = 'otros';
  }

  if (tipoAsignar === 'vip') contadorVIP++;
  else { contadorVIP = 0; punteroRotacion++; }

  propsRef.setProperty('VIP_COUNT_' + userEmail, contadorVIP.toString());
  propsRef.setProperty('PUNTERO_ROTACION', punteroRotacion.toString());

  return leadSeleccionado;
}

// ============================================================
// ORDENAMIENTO Y SELECCIÓN (lógica pura — sin sheets ni PropertiesService reales)
// ============================================================

// Ordena `pendientes` según las 4 reglas del motor (reasignadas primero → menor
// ratio de cupo usado por tipo → prioridad configurada/global → externo primero
// → FIFO/LIFO) y selecciona hasta `cupoDisponible` candidatos, aplicando VIP/score
// vía el callback `aplicarVipYScoreFn` cuando corresponde. Es una función pura de
// decisión: `propsLocal` solo se lee para 2 flags de configuración (GLOBAL_PRIORIDAD,
// ORDEN_DESAPLAZAMIENTO), y el callback de VIP recibe su propia referencia a
// PropertiesService por fuera — así se puede reutilizar con datos y "props" 100%
// sintéticos en una simulación (ver test_X1_SimulacionDiaProduccion en Tests.js)
// sin tocar ninguna hoja real ni PropertiesService real.
function _ordenarYSeleccionarCandidatos(pendientes, cuotas, conteoHoyTotal, equipo, propsLocal, cupoDisponible, aplicarVipYScoreFn) {
  var ordenPrioridad;
  if (equipo.ordenPrioridad && equipo.ordenPrioridad.length > 0) {
    ordenPrioridad = equipo.ordenPrioridad;
  } else if (equipo.id === 'REESTUDIOS') {
    ordenPrioridad = ORDEN_PRIORIDAD_MODOS['REESTUDIOS_PRIMERO'];
  } else {
    var prioridadGlobal = propsLocal.getProperty('GLOBAL_PRIORIDAD') || 'DIGITAL_PRIMERO';
    if (prioridadGlobal === 'BIOMETRIA_PRIMERO') prioridadGlobal = 'DESAPLAZAMIENTO_PRIMERO';
    if (prioridadGlobal === 'NUEVAS_PRIMERO') prioridadGlobal = 'DIGITAL_PRIMERO';
    ordenPrioridad = ORDEN_PRIORIDAD_MODOS[prioridadGlobal] || ORDEN_PRIORIDAD_MODOS['DIGITAL_PRIMERO'];
  }

  var _tiposSeen = {};
  var _tiposConPendientes = [];
  pendientes.forEach(function(p) {
    if (!p.reasignada && !_tiposSeen[p.tipo]) {
      _tiposSeen[p.tipo] = true;
      _tiposConPendientes.push(p.tipo);
    }
  });

  _tiposConPendientes.sort(function(a, b) {
    var ratioA = cuotas[a] > 0 ? conteoHoyTotal[a] / cuotas[a] : 1;
    var ratioB = cuotas[b] > 0 ? conteoHoyTotal[b] / cuotas[b] : 1;
    if (ratioA !== ratioB) return ratioA - ratioB;
    var posA = ordenPrioridad.indexOf(a) !== -1 ? ordenPrioridad.indexOf(a) : 99;
    var posB = ordenPrioridad.indexOf(b) !== -1 ? ordenPrioridad.indexOf(b) : 99;
    return posA - posB;
  });

  var _rankPorTipo = {};
  for (var r = 0; r < _tiposConPendientes.length; r++) {
    _rankPorTipo[_tiposConPendientes[r]] = r;
  }

  pendientes.forEach(function(p) {
    if (p.reasignada) p.tipoPrioridad = -1;
    else {
      p.tipoPrioridad = _rankPorTipo[p.tipo] !== undefined ? _rankPorTipo[p.tipo] : 99;
    }
  });

  // Desaplazamiento/biometría: el admin decide si se llama primero al más reciente
  // (RECIENTE_PRIMERO, valor histórico por defecto) o al más antiguo (ANTIGUO_PRIMERO),
  // siempre según fechaResultado (ver _recolectarPendientesPrincipal).
  var ordenDesaplazamientoReciente = (propsLocal.getProperty('ORDEN_DESAPLAZAMIENTO') || 'RECIENTE_PRIMERO') === 'RECIENTE_PRIMERO';

  pendientes.sort(function(a, b) {
    if (a.tipoPrioridad !== b.tipoPrioridad) return a.tipoPrioridad - b.tipoPrioridad;
    if (a.tipo !== 'desaplazamiento' && b.tipo !== 'desaplazamiento') {
      if (a.esExterno && !b.esExterno) return -1;
      if (!a.esExterno && b.esExterno) return 1;
    }
    if (a.tipo === 'desaplazamiento') return ordenDesaplazamientoReciente ? (b.fechaOrd - a.fechaOrd) : (a.fechaOrd - b.fechaOrd);
    return a.fechaOrd - b.fechaOrd;
  });

  var pool = pendientes.slice();
  var conteoLocal = {};
  for (var kk in conteoHoyTotal) conteoLocal[kk] = conteoHoyTotal[kk];
  var seleccionados = [];

  while (seleccionados.length < cupoDisponible && pool.length > 0) {
    var prioridadActual = pool[0].tipoPrioridad;
    var candidatos = pool.filter(function(p) { return p.tipoPrioridad === prioridadActual; });

    var leadSeleccionado;
    if (aplicarVipYScoreFn) {
      leadSeleccionado = aplicarVipYScoreFn(candidatos);
    } else {
      leadSeleccionado = candidatos[0];
    }
    if (!leadSeleccionado) break;

    seleccionados.push(leadSeleccionado);
    pool = pool.filter(function(p) { return p !== leadSeleccionado; });

    var tipoSel = leadSeleccionado.tipo;
    if (!leadSeleccionado.reasignada) {
      conteoLocal[tipoSel] = (conteoLocal[tipoSel] || 0) + 1;
      if (cuotas[tipoSel] > 0 && conteoLocal[tipoSel] >= cuotas[tipoSel]) {
        // Cupo de este tipo se agotó dentro del mismo lote: descartar el resto (salvo reasignadas)
        pool = pool.filter(function(p) { return p.tipo !== tipoSel || p.reasignada; });
      }
    }
  }

  return { seleccionados: seleccionados, tiposConPendientes: _tiposConPendientes };
}

// ============================================================
// ASIGNACIÓN: escribir en la hoja y mover a histórico
// ============================================================

function _asignarCasoPrincipal(lead, userEmail, nombreUsuario, fechaHora, solicitudesSheet, ss) {
  solicitudesSheet.getRange(lead.rowIndex, 27, 1, 5).setValues([[fechaHora, userEmail, "", "", nombreUsuario]]);
  solicitudesSheet.getRange(lead.rowIndex, 27).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  solicitudesSheet.getRange(lead.rowIndex, 59).clearContent();

  // Dentro de la misma ejecución, las lecturas ya ven las escrituras anteriores
  // sin necesidad de flush() — el flush real se hace una sola vez al final del
  // lote completo, en RequestLeadUnificado (evita decenas de confirmaciones sueltas).
  var s = solicitudesSheet.getRange(lead.rowIndex, 1, 1, 58).getValues()[0];
  var histRow = [
    s[0],s[1],s[2],s[3],s[4],s[5],s[6],s[7],s[8],s[9],s[10],s[11],s[12],s[13],s[14],s[15],
    s[16],s[17],s[18],s[19],s[20],s[21],
    s[23],s[24],
    s[26],s[27],s[28],
    s[30],s[31],s[32],s[33],
    s[35],s[36],
    '',0,0,0,
    '','',
    s[37],s[38],s[39],s[40],s[41],s[42],s[43],
    s[44],s[45],s[46],s[47],s[48],s[49],s[50],
    s[51],s[52],s[53],s[54],s[55],s[56],s[57],
    lead.tipo
  ];
  var hojaHist = ss.getSheetByName("Historico_Gestiones");
  if (!hojaHist) hojaHist = ss.insertSheet("Historico_Gestiones");
  hojaHist.appendRow(histRow);
  hojaHist.getRange(hojaHist.getLastRow(), 35, 1, 3).setNumberFormat("0.00");
  solicitudesSheet.deleteRow(lead.rowIndex);
  _registrarAsignacionContador(userEmail, lead.tipo);
}

function _asignarCasoReestudios(lead, userEmail, nombreUsuario, fechaHora, reestudiosSheet, ssReestudios) {
  reestudiosSheet.getRange(lead.rowIndex, 7, 1, 3).setValues([[userEmail, nombreUsuario, fechaHora]]);
  reestudiosSheet.getRange(lead.rowIndex, 9).setNumberFormat("dd/MM/yyyy HH:mm:ss");

  var filaCompleta = reestudiosSheet.getRange(lead.rowIndex, 1, 1, 18).getValues()[0];
  filaCompleta.push(lead.tipo);
  var hojaHistR = ssReestudios.getSheetByName("Historico_Gestiones");
  if (!hojaHistR) hojaHistR = ssReestudios.insertSheet("Historico_Gestiones");
  hojaHistR.appendRow(filaCompleta);
  reestudiosSheet.deleteRow(lead.rowIndex);
  _registrarAsignacionContador(userEmail, lead.tipo);
}

// ============================================================
// MOTOR PRINCIPAL: RequestLeadUnificado
// ============================================================

function RequestLeadUnificado(equipoIdOverride) {
  // SPERF (temporal): ver instrucciones en cargarPanelAnalista() (Código.js).
  var _tRLU0 = Date.now();
  // === VALIDACIONES PREVIAS AL LOCK ===
  // Usuario/turno/permiso/equipo son datos propios del analista, no dependen de
  // la cola compartida de pendientes — no necesitan el candado global. Antes se
  // evaluaban DESPUÉS de tomar el ScriptLock, así que una solicitud que iba a
  // fallar de todas formas (turno vencido, permiso vigente, usuario inactivo)
  // igual hacía esperar a todos los demás analistas detrás de ella. Moverlas
  // aquí acorta la sección crítica y evita tomar el lock en los casos que de
  // todas formas se van a rechazar.
  var ss = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID);
  var userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  var dataUsuarios = _getDataUsuarios();
  var usuarioInfo = dataUsuarios.find(function(u) { return u[2].trim().toLowerCase() === userEmail; });

  if (!usuarioInfo) return { success: false, message: "Usuario no registrado en el sistema." };

  var nombreUsuario = usuarioInfo[1];
  var especialidad = usuarioInfo[4];
  var estadoUsuario = usuarioInfo[5].toString().trim().toUpperCase();
  var capTotal = parseInt(usuarioInfo[6]) || 0;

  if (estadoUsuario !== "ACTIVO") return { success: false, message: "Tu usuario no está Activo." };

  var turnoCheck = verificarTurnoActivo(userEmail, ss);
  if (!turnoCheck.ok) return { success: false, message: turnoCheck.message };

  var permisoCheck = verificarPermisoVigenteHoy();
  if (permisoCheck.tienePermiso) return { success: false, message: "Tienes un permiso vigente (" + permisoCheck.tipo + "). No puedes recibir casos hoy." };

  // Resolver equipo
  var equipo;
  if (equipoIdOverride) {
    equipo = _getEquipos().find(function(e) { return e.id === equipoIdOverride; });
    if (!equipo) equipo = resolverEquipoDesdeEspecialidad(especialidad);
  } else {
    equipo = resolverEquipoDesdeEspecialidad(especialidad);
  }
  var equipoId = equipo.id;
  Logger.log('⏱ SPERF RequestLeadUnificado: validaciones previas al lock = ' + (Date.now() - _tRLU0) + 'ms');

  // === PRE-LECTURA FUERA DEL LOCK ===
  // Las lecturas completas de hojas se realizan ANTES de adquirir el ScriptLock
  // para reducir la contención entre analistas concurrentes. Dentro del lock solo
  // se usa la data pre-cargada (sin Viajes_Red de lectura masiva).
  var _tPreRead0 = Date.now();

  // Pre-lectura hoja "solicitud" (principal)
  var hojaSolicitud = ss.getSheetByName("solicitud");
  var dataSolicitudes = hojaSolicitud && hojaSolicitud.getLastRow() >= 2
    ? hojaSolicitud.getRange("A1:BG" + hojaSolicitud.getLastRow()).getValues()
    : null;

  // Pre-lectura hoja "ORIGEN" (reestudios)
  var ID_REEST = PropertiesService.getScriptProperties().getProperty('ID_HOJA_REESTUDIOS') || '1slgykTgjoAtCd6KmlG7Lqiuw-nM1hSguQbi0XqeLu7U';
  var ssReestudios = _abrirSSCacheado(ID_REEST);
  var hojaOrigen = ssReestudios.getSheetByName("ORIGEN");
  var dataReestudios = hojaOrigen && hojaOrigen.getLastRow() >= 2
    ? hojaOrigen.getDataRange().getValues()
    : null;

  Logger.log('⏱ SPERF RequestLeadUnificado: PRE-LECTURA fuera del lock (solicitud + ORIGEN) = ' + (Date.now() - _tPreRead0) + 'ms');

  // === PREPARACIÓN FUERA DEL LOCK ===
  // cuotas (config de cupos, no cambia por asignaciones concurrentes), la
  // recolección de pendientes (función pura sobre los arrays ya pre-leídos arriba
  // — su aporte a conteoHoy/cargaPendiente es siempre 0 por construcción, ver
  // comentario dentro de _contarYRecolectarPrincipal) y los buckets de score/VIP
  // (solo lectura, no cambian por asignaciones de otros analistas) no dependen de
  // ningún estado que otro analista concurrente pueda estar modificando ahora
  // mismo — solo los 2 contadores reales (PropertiesService) sí, y esos se leen
  // más abajo, ya bajo el lock.
  var _tPrep0 = Date.now();
  var cuotas = obtenerCuposEfectivos(userEmail, equipoId, dataUsuarios);
  var ctx = _buildFechaHoyFormats();

  var conteoHoyTotal = { digital: 0, desaplazamiento: 0, induccion: 0, reestudio: 0, nuevaUar: 0, deudorUar: 0, biometriaFallida: 0 };
  var pendientes = [];

  if (dataSolicitudes) {
    var resPrincipal = _contarYRecolectarPrincipal(dataSolicitudes, userEmail, ctx, cuotas, equipo);
    for (var k in resPrincipal.conteoHoy) { conteoHoyTotal[k] = (conteoHoyTotal[k] || 0) + resPrincipal.conteoHoy[k]; }
    pendientes = pendientes.concat(resPrincipal.pendientes);
  }
  if (dataReestudios) {
    var resReestudios = _contarYRecolectarReestudios(dataReestudios, userEmail, ctx, cuotas);
    for (var k2 in resReestudios.conteoHoy) { conteoHoyTotal[k2] = (conteoHoyTotal[k2] || 0) + resReestudios.conteoHoy[k2]; }
    pendientes = pendientes.concat(resReestudios.pendientes);
  }

  var scoreBuckets = (equipo.usarVipRotacion && equipo.usarScoreCategories) ? _getScoreBucketsCacheado(ss) : null;

  Logger.log('⏱ SPERF RequestLeadUnificado: preparación fuera del lock (cupos+conteo+score, ' + pendientes.length + ' candidatos) = ' + (Date.now() - _tPrep0) + 'ms');

  // === A partir de aquí sí hace falta el lock: los contadores reales y la
  // selección/escritura deben ejecutarse de forma consistente con cualquier otra
  // asignación corriendo en paralelo (evita que dos analistas se lleven el mismo
  // caso, y que dos analistas gasten el mismo giro de VIP_COUNT/PUNTERO_ROTACION). ===
  var _tLockWait0 = Date.now();
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (e) {
    Logger.log('⏱ SPERF RequestLeadUnificado: NO se pudo tomar el lock tras ' + (Date.now() - _tLockWait0) + 'ms — sistema ocupado');
    return { success: false, message: "Sistema ocupado. Otro compañero está recibiendo casos. Intenta en unos segundos." };
  }
  Logger.log('⏱ SPERF RequestLeadUnificado: ESPERA del lock = ' + (Date.now() - _tLockWait0) + 'ms (contención con otros analistas si esto es alto)');
  var _tEnLock0 = Date.now();

  try {
    // Si el cierre de un caso (guardarCambiosInternos/guardarGestionBiometria/
    // guardarGestionReestudio → _cerrarConteoConLockCorto) no consiguió este mismo
    // candado a tiempo — porque justo lo tenía otra asignación en curso —, su ajuste
    // de contador quedó encolado (_encolarAjustePendiente) en vez de perderse. Como
    // esta ejecución ya tiene el candado tomado, es el punto correcto para drenarlo
    // antes de mirar cuánta capacidad le queda al analista: si no se hace aquí, una
    // asignación que corre justo después del propio cierre del analista puede leer
    // su carga pendiente todavía con el +1 no descontado y rechazarlo con "sin
    // capacidad" en el mismo clic que debía haberle liberado el cupo.
    _drenarAjustesPendientesContador();

    var propsLocal = PropertiesService.getScriptProperties();

    // Los contadores incrementales de PropertiesService son la ÚNICA fuente real de
    // conteoHoy/cargaPendiente (conteoHoyTotal/pendientes ya traen, desde la
    // preparación fuera del lock, el aporte de la recolección fusionada — siempre 0,
    // ver comentario en _contarYRecolectarPrincipal). Estos SÍ deben leerse aquí,
    // bajo el lock, porque reflejan el estado compartido con cualquier otra
    // asignación/cierre concurrente. Si se desincronizan (fallo al cerrar un caso,
    // edición manual), admin_recalcularContadores() (Admin.js) los reconstruye desde
    // cero leyendo Historico_Gestiones — debe correr por trigger nocturno programado
    // en el editor de Apps Script (trigger_recalcularContadores), y además se
    // autocorrigen de forma oportunista en cada cierre exitoso vía
    // _cerrarConteoConLockCorto (Código.js).
    var _tContadores0 = Date.now();
    var conteoHoyContador = _obtenerConteoHoyAnalista(userEmail);
    for (var kc in conteoHoyContador) { conteoHoyTotal[kc] = (conteoHoyTotal[kc] || 0) + conteoHoyContador[kc]; }
    var capPendienteReal = _obtenerCargaPendienteAnalista(userEmail);

    Logger.log('⏱ SPERF RequestLeadUnificado (dentro del lock): contadores reales = ' + (Date.now() - _tContadores0) + 'ms (' + pendientes.length + ' candidatos)');

    // Referencias a hojas — necesarias para _asignarCasoPrincipal / _asignarCasoReestudios
    var refPrincipal = { hoja: hojaSolicitud, data: dataSolicitudes };
    var refReestudios = { hoja: hojaOrigen, data: dataReestudios };

    Logger.log("Motor Unificado [" + equipoId + "] | Analista: " + userEmail + " | Cupos: " + JSON.stringify(cuotas) + " | Conteo: " + JSON.stringify(conteoHoyTotal));

    var capacidadDisponible = capTotal - capPendienteReal;
    if (capacidadDisponible < 1) return { success: false, message: "No tienes capacidad disponible. Termina casos pendientes primero." };

    var cuposLlenosHoy = Object.entries(cuotas)
      .filter(function(e) { return e[1] > 0 && conteoHoyTotal[e[0]] >= e[1]; })
      .map(function(e) { return (ETIQUETAS_TIPO[e[0]] || e[0]) + " (" + conteoHoyTotal[e[0]] + "/" + e[1] + ")"; });

    if (pendientes.length === 0) {
      if (cuposLlenosHoy.length > 0) {
        return { success: false, message: "Sin casos disponibles. Cupos del día completados: " + cuposLlenosHoy.join(', ') + "." };
      }
      return { success: false, message: "No hay casos en bandeja para tus subcategorías disponibles." };
    }

    // === ORDENAR Y SELECCIONAR (lógica pura, ver _ordenarYSeleccionarCandidatos) ===
    var fechaHora = new Date();
    var maxAsignar = Math.max(1, equipo.maxAsignarPorLlamada || 1);
    var cupoDisponible = Math.min(maxAsignar, capacidadDisponible);
    var aplicarVipYScoreFn = scoreBuckets ? function(candidatos) { return _aplicarVipYScore(candidatos, scoreBuckets, userEmail, propsLocal); } : null;

    var _tOrdenar0 = Date.now();
    var resultadoSeleccion = _ordenarYSeleccionarCandidatos(pendientes, cuotas, conteoHoyTotal, equipo, propsLocal, cupoDisponible, aplicarVipYScoreFn);
    var seleccionados = resultadoSeleccion.seleccionados;
    var _tiposConPendientes = resultadoSeleccion.tiposConPendientes;
    Logger.log('⏱ SPERF RequestLeadUnificado (dentro del lock): ordenar+seleccionar (VIP/score usarVipRotacion=' + !!equipo.usarVipRotacion + ') = ' + (Date.now() - _tOrdenar0) + 'ms');

    if (seleccionados.length === 0) {
      return { success: false, message: "Error interno: no se pudo seleccionar un caso." };
    }

    // LOG DIAGNÓSTICO
    var _reasCount = pendientes.filter(function(p){ return p.reasignada; }).length;
    var _tiposPend = {};
    pendientes.forEach(function(p){ _tiposPend[p.tipo] = (_tiposPend[p.tipo]||0)+1; });
    Logger.log("DIAGNÓSTICO | Conteo: " + JSON.stringify(conteoHoyTotal) + " | Cuotas: " + JSON.stringify(cuotas) + " | Pendientes por tipo: " + JSON.stringify(_tiposPend) + " | Reasignadas: " + _reasCount + " | Seleccionados: " + seleccionados.length + " | Orden tipos: " + JSON.stringify(_tiposConPendientes));

    // === RE-VALIDACIÓN: confirmar disponibilidad con lectura mínima de 1 celda por candidato ===
    var _tRevalidar0 = Date.now();
    var seleccionadosValidados = [];
    for (var sv = 0; sv < seleccionados.length; sv++) {
      var candidato = seleccionados[sv];
      var celdaAsignado;
      if (candidato.base === 'PRINCIPAL') {
        celdaAsignado = String(hojaSolicitud.getRange(candidato.rowIndex, 28).getValue()).trim();
      } else {
        celdaAsignado = String(hojaOrigen.getRange(candidato.rowIndex, 7).getValue()).trim();
      }
      if (celdaAsignado === '') {
        // Celda sigue vacía → candidato disponible
        seleccionadosValidados.push(candidato);
      } else {
        // Candidato stale: fue tomado por otro analista entre la pre-lectura y ahora
        Logger.log('Re-validación: candidato stale en fila ' + candidato.rowIndex + ' (base=' + candidato.base + ', asignado=' + celdaAsignado + ')');
      }
    }
    Logger.log('⏱ SPERF RequestLeadUnificado (dentro del lock): re-validación = ' + (Date.now() - _tRevalidar0) + 'ms (' + seleccionados.length + ' candidatos, ' + seleccionadosValidados.length + ' válidos)');

    if (seleccionadosValidados.length === 0) {
      return { success: false, message: "Sin casos disponibles — los candidatos fueron tomados por otros analistas. Intenta de nuevo." };
    }
    seleccionados = seleccionadosValidados;

    // === ASIGNAR (de mayor a menor rowIndex por hoja, para no invalidar filas al borrar) ===
    var _tAsignar0 = Date.now();
    var principales = seleccionados.filter(function(s) { return s.base === 'PRINCIPAL'; }).sort(function(a, b) { return b.rowIndex - a.rowIndex; });
    var reestudios = seleccionados.filter(function(s) { return s.base !== 'PRINCIPAL'; }).sort(function(a, b) { return b.rowIndex - a.rowIndex; });

    principales.forEach(function(lead) {
      _asignarCasoPrincipal(lead, userEmail, nombreUsuario, fechaHora, refPrincipal.hoja, ss);
    });
    reestudios.forEach(function(lead) {
      _asignarCasoReestudios(lead, userEmail, nombreUsuario, fechaHora, refReestudios.hoja, ssReestudios);
    });
    Logger.log('⏱ SPERF RequestLeadUnificado (dentro del lock): escritura asignación (' + seleccionados.length + ' casos) = ' + (Date.now() - _tAsignar0) + 'ms');

    // Una sola confirmación para todo el lote (antes era hasta 2 por caso asignado).
    var _tFlush0 = Date.now();
    SpreadsheetApp.flush();
    Logger.log('⏱ SPERF RequestLeadUnificado (dentro del lock): SpreadsheetApp.flush() = ' + (Date.now() - _tFlush0) + 'ms');
    Logger.log('⏱ SPERF RequestLeadUnificado: TOTAL dentro del lock = ' + (Date.now() - _tEnLock0) + 'ms | TOTAL función = ' + (Date.now() - _tRLU0) + 'ms');

    // Acumular IDs de biometrías asignadas para actualización deferred desde el cliente.
    // Antes se llamaba _actualizarFaseBiometriaPendiente(ids, "ASIGNADA") aquí directamente,
    // bloqueando ~4-6s adicionales. Ahora se retornan los IDs como metadata para que el
    // cliente dispare la actualización de forma no-bloqueante (ver task 7.4).
    var idsAsignados = principales
      .filter(function(lead) { return lead.tipo === 'desaplazamiento'; })
      .map(function(lead) { return String(lead.rowData[0] || '').trim(); })
      .filter(function(id) { return id; });

    var _resumenTipos = {};
    seleccionados.forEach(function(s) { _resumenTipos[s.tipo] = (_resumenTipos[s.tipo] || 0) + 1; });
    var _detalleTipos = Object.entries(_resumenTipos).map(function(e) { return e[1] + " " + (ETIQUETAS_TIPO[e[0]] || e[0].toUpperCase()); }).join(', ');

    var msgAsignacion = seleccionados.length === 1
      ? "Asignado: 1 caso de " + (ETIQUETAS_TIPO[seleccionados[0].tipo] || seleccionados[0].tipo.toUpperCase()) + "."
      : "Asignados: " + seleccionados.length + " casos (" + _detalleTipos + ").";
    if (cuposLlenosHoy.length > 0) {
      msgAsignacion += "\nCupos del día completados: " + cuposLlenosHoy.join(', ');
    }

    return { success: true, nueva: true, message: msgAsignacion, idsAsignados: idsAsignados, faseTarget: "ASIGNADA" };

  } catch (err) {
    Logger.log("❌ Error crítico en RequestLeadUnificado: " + err.message);
    return { success: false, message: "Error interno: " + err.message };
  } finally {
    lock.releaseLock();
  }
}
