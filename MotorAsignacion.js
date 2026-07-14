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

  // Nota: lo que antes vivía en Historico_Gestiones (que solo crece y nunca se
  // archiva) ya no se escanea aquí en cada asignación — se lee de contadores
  // incrementales (_obtenerConteoHoyAnalista / _obtenerCargaPendienteAnalista,
  // Código.js), sumados en RequestLeadUnificado. Ver admin_recalcularContadores()
  // en Admin.js si alguna vez hace falta reconstruirlos desde cero.

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
      if (fechaResultadoCaseMs !== 9999999999999 && fechaResultadoCaseMs >= limiteLiberacionDesaplazamiento.getTime()) continue;
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
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (e) {
    return { success: false, message: "Sistema ocupado. Otro compañero está recibiendo casos. Intenta en unos segundos." };
  }

  try {
    var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
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

    // Suma lo que ya se cerró/asignó hoy vía Historico_Gestiones — de los contadores
    // incrementales, no de un escaneo completo de la hoja (ver Código.js).
    var conteoHoyContador = _obtenerConteoHoyAnalista(userEmail);
    for (var kc in conteoHoyContador) { conteoHoyTotal[kc] = (conteoHoyTotal[kc] || 0) + conteoHoyContador[kc]; }
    capPendienteReal += _obtenerCargaPendienteAnalista(userEmail);

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
        return { success: false, message: "Sin casos disponibles. Cupos del día completados: " + cuposLlenosHoy.join(', ') + "." };
      }
      return { success: false, message: "No hay casos en bandeja para tus subcategorías disponibles." };
    }

    // === ORDENAR Y SELECCIONAR (lógica pura, ver _ordenarYSeleccionarCandidatos) ===
    var fechaHora = new Date();
    var maxAsignar = Math.max(1, equipo.maxAsignarPorLlamada || 1);
    var cupoDisponible = Math.min(maxAsignar, capacidadDisponible);
    var scoreSheet = (equipo.usarVipRotacion && equipo.usarScoreCategories) ? ss.getSheetByName("score") : null;
    var aplicarVipYScoreFn = scoreSheet ? function(candidatos) { return _aplicarVipYScore(candidatos, scoreSheet, userEmail, propsLocal); } : null;

    var resultadoSeleccion = _ordenarYSeleccionarCandidatos(pendientes, cuotas, conteoHoyTotal, equipo, propsLocal, cupoDisponible, aplicarVipYScoreFn);
    var seleccionados = resultadoSeleccion.seleccionados;
    var _tiposConPendientes = resultadoSeleccion.tiposConPendientes;

    if (seleccionados.length === 0) {
      return { success: false, message: "Error interno: no se pudo seleccionar un caso." };
    }

    // LOG DIAGNÓSTICO
    var _reasCount = pendientes.filter(function(p){ return p.reasignada; }).length;
    var _tiposPend = {};
    pendientes.forEach(function(p){ _tiposPend[p.tipo] = (_tiposPend[p.tipo]||0)+1; });
    Logger.log("DIAGNÓSTICO | Conteo: " + JSON.stringify(conteoHoyTotal) + " | Cuotas: " + JSON.stringify(cuotas) + " | Pendientes por tipo: " + JSON.stringify(_tiposPend) + " | Reasignadas: " + _reasCount + " | Seleccionados: " + seleccionados.length + " | Orden tipos: " + JSON.stringify(_tiposConPendientes));

    // === ASIGNAR (de mayor a menor rowIndex por hoja, para no invalidar filas al borrar) ===
    var principales = seleccionados.filter(function(s) { return s.base === 'PRINCIPAL'; }).sort(function(a, b) { return b.rowIndex - a.rowIndex; });
    var reestudios = seleccionados.filter(function(s) { return s.base !== 'PRINCIPAL'; }).sort(function(a, b) { return b.rowIndex - a.rowIndex; });

    principales.forEach(function(lead) {
      _asignarCasoPrincipal(lead, userEmail, nombreUsuario, fechaHora, refPrincipal.hoja, ss);
    });
    reestudios.forEach(function(lead) {
      _asignarCasoReestudios(lead, userEmail, nombreUsuario, fechaHora, refReestudios.hoja, ssReestudios);
    });

    // Una sola confirmación para todo el lote (antes era hasta 2 por caso asignado).
    SpreadsheetApp.flush();

    // Registrar en pendiente_biometria las biometrías asignadas (tipo 'desaplazamiento').
    var idsBioAsignadas = principales
      .filter(function(lead) { return lead.tipo === 'desaplazamiento'; })
      .map(function(lead) { return String(lead.rowData[0] || '').trim(); })
      .filter(function(id) { return id; });
    if (idsBioAsignadas.length > 0) {
      _actualizarFaseBiometriaPendiente(idsBioAsignadas, "ASIGNADA");
    }

    var _resumenTipos = {};
    seleccionados.forEach(function(s) { _resumenTipos[s.tipo] = (_resumenTipos[s.tipo] || 0) + 1; });
    var _detalleTipos = Object.entries(_resumenTipos).map(function(e) { return e[1] + " " + (ETIQUETAS_TIPO[e[0]] || e[0].toUpperCase()); }).join(', ');

    var msgAsignacion = seleccionados.length === 1
      ? "Asignado: 1 caso de " + (ETIQUETAS_TIPO[seleccionados[0].tipo] || seleccionados[0].tipo.toUpperCase()) + "."
      : "Asignados: " + seleccionados.length + " casos (" + _detalleTipos + ").";
    if (cuposLlenosHoy.length > 0) {
      msgAsignacion += "\nCupos del día completados: " + cuposLlenosHoy.join(', ');
    }

    return { success: true, nueva: true, message: msgAsignacion };

  } catch (err) {
    Logger.log("❌ Error crítico en RequestLeadUnificado: " + err.message);
    return { success: false, message: "Error interno: " + err.message };
  } finally {
    lock.releaseLock();
  }
}
