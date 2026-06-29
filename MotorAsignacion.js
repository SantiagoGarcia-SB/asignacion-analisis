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

function _contarDesdeHojaPrincipal(userEmail, ss, ctx) {
  var conteoHoy = { digital: 0, desaplazamiento: 0, induccion: 0, reestudio: 0, nuevaUar: 0, deudorUar: 0, biometriaFallida: 0 };
  var cargaPendiente = 0;

  var hoja = ss.getSheetByName("solicitud");
  if (!hoja || hoja.getLastRow() < 2) return { conteoHoy: conteoHoy, cargaPendiente: cargaPendiente };

  var data = hoja.getRange("A1:BG" + hoja.getLastRow()).getValues();
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

  // Historico_Gestiones (principal)
  try {
    var hojaHist = ss.getSheetByName("Historico_Gestiones");
    if (hojaHist && hojaHist.getLastRow() > 1) {
      var colsHist = Math.max(61, hojaHist.getLastColumn());
      var dataHist = hojaHist.getRange(2, 1, hojaHist.getLastRow() - 1, colsHist).getValues();
      for (var j = 0; j < dataHist.length; j++) {
        var rh = dataHist[j];
        var asigH = String(rh[25]).trim().toLowerCase();
        if (asigH !== userEmail) continue;
        var tipoH = String(rh[60] || '').trim();
        if (!tipoH || !conteoHoy.hasOwnProperty(tipoH)) {
          var claseH = String(rh[20]).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
          var estadoH = String(rh[16]).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
          var estadoHSinGuion = estadoH.replace(/_/g, ' ');
          tipoH = 'digital';
          if (estadoHSinGuion === 'APROBADO PENDIENTE BIOMETRIA' || estadoH === 'APROBADO_PENDIENTE_BIOMETRIA') tipoH = 'desaplazamiento';
          else if (claseH === "INDUCCION") tipoH = 'induccion';
        }
        if (_cumpleHoyUnif(rh[24], ctx) || _cumpleHoyUnif(rh[26], ctx)) conteoHoy[tipoH]++;
        var tieneAsigH = rh[24] instanceof Date || String(rh[24]).trim() !== "";
        var tieneFinH = rh[26] instanceof Date || String(rh[26]).trim() !== "";
        if (tieneAsigH && !tieneFinH) cargaPendiente++;
      }
    }
  } catch (e) { Logger.log("_contarDesdeHojaPrincipal Hist: " + e.message); }

  return { conteoHoy: conteoHoy, cargaPendiente: cargaPendiente, hojaRef: hoja, dataSolicitudes: data };
}

function _contarDesdeHojaReestudios(userEmail, ssReestudios, ctx) {
  var conteoHoy = { reestudio: 0, nuevaUar: 0, deudorUar: 0, biometriaFallida: 0 };
  var cargaPendiente = 0;

  var hoja = ssReestudios.getSheetByName("ORIGEN");
  if (!hoja || hoja.getLastRow() < 2) return { conteoHoy: conteoHoy, cargaPendiente: cargaPendiente };

  var data = hoja.getDataRange().getValues();
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

  // Historico_Gestiones (reestudios)
  try {
    var hojaHistR = ssReestudios.getSheetByName("Historico_Gestiones");
    if (hojaHistR && hojaHistR.getLastRow() > 1) {
      var colsHistR = Math.max(19, hojaHistR.getLastColumn());
      var dataHistR = hojaHistR.getRange(2, 1, hojaHistR.getLastRow() - 1, colsHistR).getValues();
      for (var j = 0; j < dataHistR.length; j++) {
        var rr = dataHistR[j];
        var asigHR = String(rr[6]).trim().toLowerCase();
        if (asigHR !== userEmail) continue;
        var tipoHR = String(rr[18] || '').trim();
        if (!tipoHR || !conteoHoy.hasOwnProperty(tipoHR)) {
          var origenHR = String(rr[3]).toUpperCase().trim();
          var tipoPHRNorm = String(rr[4]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
          tipoHR = null;
          if (tipoPHRNorm.indexOf("BIOMETRIA FALLIDA") !== -1) tipoHR = 'biometriaFallida';
          else if (origenHR === "CORREO" && tipoPHRNorm === "NUEVA") tipoHR = 'nuevaUar';
          else if (origenHR === "CORREO" && tipoPHRNorm === "ADICIONAL") tipoHR = 'deudorUar';
          else if (tipoPHRNorm === "REESTUDIO") tipoHR = 'reestudio';
        }
        if (!tipoHR) continue;
        if (_cumpleHoyUnif(rr[8], ctx) || _cumpleHoyUnif(rr[9], ctx)) conteoHoy[tipoHR]++;
        var tieneAsigHR = rr[8] instanceof Date ? true : String(rr[8]).trim() !== "";
        var tieneFinHR = rr[9] instanceof Date ? true : String(rr[9]).trim() !== "";
        if (tieneAsigHR && !tieneFinHR) cargaPendiente++;
      }
    }
  } catch (e) { Logger.log("_contarDesdeHojaReestudios Hist: " + e.message); }

  return { conteoHoy: conteoHoy, cargaPendiente: cargaPendiente, hojaRef: hoja, dataReestudios: data };
}

// ============================================================
// RECOLECCIÓN DE PENDIENTES
// ============================================================

function _recolectarPendientesPrincipal(dataSolicitudes, cuotas, conteoHoy, canonDesde, canonHasta, canonTipos) {
  var pendientes = [];
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
      var canonValor = parseFloat(String(row[9]).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
      if (canonDesde > 0 && canonValor < canonDesde) continue;
      if (canonHasta > 0 && canonValor > canonHasta) continue;
    }

    if (conteoHoy[tipo] >= (cuotas[tipo] || 0)) continue;

    var reasignada = row.length > 58 && String(row[58]).trim().toUpperCase() === "REASIGNADA";
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
      fechaOrd: _parseDateUnif(row[17])
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
// VIP ROTATION & SCORE CATEGORIES
// ============================================================

function _aplicarVipYScore(candidatos, scoreSheet, userEmail, propsRef) {
  var dataScore = scoreSheet.getDataRange().getDisplayValues();
  var buckets = { vip: new Set(), grande: new Set(), mediana: new Set(), pequena: new Set(), gen: new Set(), dev: new Set(), rev: new Set(), otros: new Set() };

  for (var i = 1; i < dataScore.length; i++) {
    var key = _normalizarClaveUnif(dataScore[i][0]);
    if (!key || key === "0") continue;
    var cat = dataScore[i][1].toString().toLowerCase().trim();
    if (cat.indexOf("vip") !== -1) buckets.vip.add(key);
    else if (cat.indexOf("grande") !== -1) buckets.grande.add(key);
    else if (cat.indexOf("mediana") !== -1) buckets.mediana.add(key);
    else if (cat.indexOf("peque") !== -1) buckets.pequena.add(key);
    else if (cat.indexOf("generica") !== -1) buckets.gen.add(key);
    else if (cat.indexOf("en desarrollo") !== -1) buckets.dev.add(key);
    else if (cat.indexOf("revisar") !== -1) buckets.rev.add(key);
    else buckets.otros.add(key);
  }

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
// ASIGNACIÓN: escribir en la hoja y mover a histórico
// ============================================================

function _asignarCasoPrincipal(lead, userEmail, nombreUsuario, fechaHora, solicitudesSheet, ss) {
  solicitudesSheet.getRange(lead.rowIndex, 27, 1, 5).setValues([[fechaHora, userEmail, "", "", nombreUsuario]]);
  solicitudesSheet.getRange(lead.rowIndex, 27).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  solicitudesSheet.getRange(lead.rowIndex, 59).clearContent();
  SpreadsheetApp.flush();

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
  SpreadsheetApp.flush();
}

function _asignarCasoReestudios(lead, userEmail, nombreUsuario, fechaHora, reestudiosSheet, ssReestudios) {
  reestudiosSheet.getRange(lead.rowIndex, 7, 1, 3).setValues([[userEmail, nombreUsuario, fechaHora]]);
  reestudiosSheet.getRange(lead.rowIndex, 9).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  SpreadsheetApp.flush();

  var filaCompleta = reestudiosSheet.getRange(lead.rowIndex, 1, 1, 18).getValues()[0];
  filaCompleta.push(lead.tipo);
  var hojaHistR = ssReestudios.getSheetByName("Historico_Gestiones");
  if (!hojaHistR) hojaHistR = ssReestudios.insertSheet("Historico_Gestiones");
  hojaHistR.appendRow(filaCompleta);
  reestudiosSheet.deleteRow(lead.rowIndex);
  SpreadsheetApp.flush();
}

// ============================================================
// MOTOR PRINCIPAL: RequestLeadUnificado
// ============================================================

function RequestLeadUnificado(equipoIdOverride) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "Sistema ocupado. Otro compañero está recibiendo casos. Intenta en unos segundos." };
  }

  try {
    var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    var usuariosSheet = ss.getSheetByName("Usuarios");
    var userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    var dataUsuarios = usuariosSheet.getDataRange().getDisplayValues();
    var usuarioInfo = dataUsuarios.find(function(u) { return u[2].trim().toLowerCase() === userEmail; });

    if (!usuarioInfo) return { success: false, message: "❌ Usuario no registrado en el sistema." };

    var nombreUsuario = usuarioInfo[1];
    var especialidad = usuarioInfo[4];
    var estadoUsuario = usuarioInfo[5].toString().trim().toUpperCase();
    var capTotal = parseInt(usuarioInfo[6]) || 0;

    if (estadoUsuario !== "ACTIVO") return { success: false, message: "❌ Tu usuario no está Activo." };

    var turnoCheck = verificarTurnoActivo(userEmail, ss);
    if (!turnoCheck.ok) return { success: false, message: turnoCheck.message };

    var permisoCheck = verificarPermisoVigenteHoy();
    if (permisoCheck.tienePermiso) return { success: false, message: "⛔ Tienes un permiso vigente (" + permisoCheck.tipo + "). No puedes recibir casos hoy." };

    // Resolver equipo
    var equipo;
    if (equipoIdOverride) {
      equipo = _getEquipos().find(function(e) { return e.id === equipoIdOverride; });
      if (!equipo) equipo = resolverEquipoDesdeEspecialidad(especialidad);
    } else {
      equipo = resolverEquipoDesdeEspecialidad(especialidad);
    }
    var equipoId = equipo.id;

    var propsLocal = PropertiesService.getScriptProperties();
    var cuotas = obtenerCuposEfectivos(userEmail, equipoId, dataUsuarios);

    var ctx = _buildFechaHoyFormats();

    // === CONTEO ===
    var conteoHoyTotal = { digital: 0, desaplazamiento: 0, induccion: 0, reestudio: 0, nuevaUar: 0, deudorUar: 0, biometriaFallida: 0 };
    var capPendienteReal = 0;

    var refPrincipal = null;
    var refReestudios = null;

    // Contar desde hoja principal (siempre se necesita para cualquier equipo)
    var cPrincipal = _contarDesdeHojaPrincipal(userEmail, ss, ctx);
    for (var k in cPrincipal.conteoHoy) { conteoHoyTotal[k] = (conteoHoyTotal[k] || 0) + cPrincipal.conteoHoy[k]; }
    capPendienteReal += cPrincipal.cargaPendiente;
    refPrincipal = { hoja: cPrincipal.hojaRef, data: cPrincipal.dataSolicitudes };

    // Contar desde hoja reestudios
    var ID_REEST = PropertiesService.getScriptProperties().getProperty('ID_HOJA_REESTUDIOS') || '1slgykTgjoAtCd6KmlG7Lqiuw-nM1hSguQbi0XqeLu7U';
    var ssReestudios = SpreadsheetApp.openById(ID_REEST);
    var cReestudios = _contarDesdeHojaReestudios(userEmail, ssReestudios, ctx);
    for (var k2 in cReestudios.conteoHoy) { conteoHoyTotal[k2] = (conteoHoyTotal[k2] || 0) + cReestudios.conteoHoy[k2]; }
    capPendienteReal += cReestudios.cargaPendiente;
    refReestudios = { hoja: cReestudios.hojaRef, data: cReestudios.dataReestudios };

    Logger.log("Motor Unificado [" + equipoId + "] | Analista: " + userEmail + " | Cupos: " + JSON.stringify(cuotas) + " | Conteo: " + JSON.stringify(conteoHoyTotal));

    var capacidadDisponible = capTotal - capPendienteReal;
    if (capacidadDisponible < 1) return { success: false, message: "No tienes capacidad disponible. Termina casos pendientes primero." };

    // === RECOLECTAR PENDIENTES ===
    var pendientes = [];

    if (refPrincipal && refPrincipal.data) {
      var pPrincipal = _recolectarPendientesPrincipal(refPrincipal.data, cuotas, conteoHoyTotal, equipo.canonDesde || 0, equipo.canonHasta || 0, equipo.canonTipos || []);
      pendientes = pendientes.concat(pPrincipal);
    }

    if (refReestudios && refReestudios.data) {
      var pReestudios = _recolectarPendientesReestudios(refReestudios.data, cuotas, conteoHoyTotal);
      pendientes = pendientes.concat(pReestudios);
    }

    var cuposLlenosHoy = Object.entries(cuotas)
      .filter(function(e) { return e[1] > 0 && conteoHoyTotal[e[0]] >= e[1]; })
      .map(function(e) { return (ETIQUETAS_TIPO[e[0]] || e[0]) + " (" + conteoHoyTotal[e[0]] + "/" + e[1] + ")"; });

    if (pendientes.length === 0) {
      if (cuposLlenosHoy.length > 0) {
        return { success: false, message: "⚠️ Sin casos disponibles. Cupos del día completados: " + cuposLlenosHoy.join(', ') + "." };
      }
      return { success: false, message: "⚠️ No hay casos en bandeja para tus subcategorías disponibles." };
    }

    // === ORDENAR ===
    var ordenPrioridad;
    if (equipo.ordenPrioridad && equipo.ordenPrioridad.length > 0) {
      ordenPrioridad = equipo.ordenPrioridad;
    } else if (equipoId === 'REESTUDIOS') {
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

    pendientes.sort(function(a, b) {
      if (a.tipoPrioridad !== b.tipoPrioridad) return a.tipoPrioridad - b.tipoPrioridad;
      if (a.tipo !== 'desaplazamiento' && b.tipo !== 'desaplazamiento') {
        if (a.esExterno && !b.esExterno) return -1;
        if (!a.esExterno && b.esExterno) return 1;
      }
      return a.tipo === 'desaplazamiento' ? (b.fechaOrd - a.fechaOrd) : (a.fechaOrd - b.fechaOrd);
    });

    // === SELECCIONAR CANDIDATO ===
    var prioridadActual = pendientes[0].tipoPrioridad;
    var candidatos = pendientes.filter(function(p) { return p.tipoPrioridad === prioridadActual; });

    var leadSeleccionado;

    if (equipo.usarVipRotacion && equipo.usarScoreCategories) {
      var scoreSheet = ss.getSheetByName("score");
      if (scoreSheet) {
        leadSeleccionado = _aplicarVipYScore(candidatos, scoreSheet, userEmail, propsLocal);
      } else {
        leadSeleccionado = candidatos[0];
      }
    } else {
      leadSeleccionado = candidatos[0];
    }

    if (!leadSeleccionado) {
      return { success: false, message: "⚠️ Error interno: no se pudo seleccionar un caso." };
    }

    // LOG DIAGNÓSTICO
    var _reasCount = pendientes.filter(function(p){ return p.reasignada; }).length;
    var _tiposPend = {};
    pendientes.forEach(function(p){ _tiposPend[p.tipo] = (_tiposPend[p.tipo]||0)+1; });
    Logger.log("DIAGNÓSTICO | Conteo: " + JSON.stringify(conteoHoyTotal) + " | Cuotas: " + JSON.stringify(cuotas) + " | Pendientes por tipo: " + JSON.stringify(_tiposPend) + " | Reasignadas: " + _reasCount + " | Seleccionado: " + leadSeleccionado.tipo + " (reasig=" + leadSeleccionado.reasignada + ") | Orden tipos: " + JSON.stringify(_tiposConPendientes));

    // === ASIGNAR ===
    var fechaHora = new Date();
    var maxAsignar = equipo.maxAsignarPorLlamada || 1;
    var asignados = 0;

    if (leadSeleccionado.base === 'PRINCIPAL') {
      _asignarCasoPrincipal(leadSeleccionado, userEmail, nombreUsuario, fechaHora, refPrincipal.hoja, ss);
    } else {
      _asignarCasoReestudios(leadSeleccionado, userEmail, nombreUsuario, fechaHora, refReestudios.hoja, ssReestudios);
    }
    asignados++;

    var msgAsignacion = "✅ Asignado: " + asignados + " caso de " + (ETIQUETAS_TIPO[leadSeleccionado.tipo] || leadSeleccionado.tipo.toUpperCase()) + ".";
    if (cuposLlenosHoy.length > 0) {
      msgAsignacion += "\n⚠️ Cupos del día completados: " + cuposLlenosHoy.join(', ');
    }

    return { success: true, nueva: true, message: msgAsignacion };

  } catch (err) {
    Logger.log("❌ Error crítico en RequestLeadUnificado: " + err.message);
    return { success: false, message: "Error interno: " + err.message };
  } finally {
    lock.releaseLock();
  }
}
