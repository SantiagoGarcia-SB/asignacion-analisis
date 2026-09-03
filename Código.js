const WAREHOUSE_ID = '1V2GTI4IOPUEsC67SPIGey3LM3OxFCt-8HlFbX95R_fs';
const TARGET_SOLICITUDES_SS_ID = '1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0';
const ID_SHEET_GESTION_DIRECTA = '1VCcd2_QglH-71-WnyPoBfDAyf05HAd51mbjVJtBXyyM';


const Consulta_Especial = 'Consulta_especial';

const SHEET_NAME_POLIZAS = 'Hoja 1';
const SHEET_NAME_SOLICITUDES = 'solicitud';
const NOMBRE_HOJA_PENDIENTE_CODEUDOR = 'pendiente_codeudor';


const DIAS_TOTAL = 45;              
const RANGO_DIAS = 15;              
       

const SLEEP_MS_BETWEEN_CHUNKS = 800;
const TIMEZONE = "GMT-5";
const LIMITE_PRUEBA = 0; 
       

const HEADER_SOLICITUDES = [
  "solicitud", "póliza", "identificaciónInquilino", "tipoIdentificacion", "nombreInquilino",
  "correoInquilino", "teléfonoInquilino", "ingresos", "fechaExpedición", "canon", "cuota",
  "direcciónInmueble", "destinoInmueble", "ciudadInmueble", "nombreAsesor", "correoAsesor",
  "estadoGeneral", "fechaRadicación", "fechaResultado", "listodescripcionResultado",
  "clase", "uar", "tiempoderespuestafinaldelasolicitud", "biometría", "observaciones", 
  "tracking", "fecha asignación", "asignacion", "fecha fin gestión", "tiempo total de resolución de la solicitud",
  "Nombre", "Motivo de aplazamiento", "Motivo de negación", "fecha de gestion", "Tiempo de gestion",
  "Canal", "Tiempo general (radicación)"
];

const props = PropertiesService.getScriptProperties();

function getKeyFull() { return props.getProperty('KeyEndPointSaiFullProd'); }
function getEndPointFull() { return props.getProperty('endPointSaiFullStageProd'); }


/**
 * Obtiene los cupos efectivos para un analista (individuales si existen, o globales del equipo).
 * @param {string} userEmail - Email del analista
 * @param {string} equipo - 'DIGITAL', 'DESAPLAZAMIENTO' o 'REESTUDIOS'
 * @param {Array} [dataUsuarios] - Datos de la hoja Usuarios (opcional, para evitar releerla)
 * @returns {Object} { digital, reestudio, induccion, desaplazamiento, nuevaUar, deudorUar, biometriaFallida }
 */
function obtenerCuposEfectivos(userEmail, equipo, dataUsuarios) {
  if (dataUsuarios) {
    for (let i = 1; i < dataUsuarios.length; i++) {
      if (String(dataUsuarios[i][2]).toLowerCase().trim() === userEmail) {
        if (dataUsuarios[i].length > 24) {
          const cuposRaw = String(dataUsuarios[i][24] || '').trim();
          if (cuposRaw && cuposRaw.startsWith('{')) {
            try {
              const c = JSON.parse(cuposRaw);
              return {
                digital: parseInt(c.digital || c.nuevas) || 0,
                reestudio: parseInt(c.reestudio || c.reestudios) || 0,
                induccion: parseInt(c.induccion || c.inducciones) || 0,
                desaplazamiento: parseInt(c.desaplazamiento || c.biometria) || 0,
                nuevaUar: parseInt(c.nuevaUar) || 0,
                deudorUar: parseInt(c.deudorUar) || 0,
                biometriaFallida: parseInt(c.biometriaFallida) || 0
              };
            } catch (e) { /* JSON inválido, usar globales */ }
          }
        }
        break;
      }
    }
  }

  const props2 = PropertiesService.getScriptProperties();
  var equipoNorm = equipo.toUpperCase();
  if (equipoNorm === 'BIOMETRIA') equipoNorm = 'DESAPLAZAMIENTO';
  const prefix = 'CUPOS_' + equipoNorm + '_';
  function getP(key, def) {
    const v = props2.getProperty(key);
    if (v === null || v === '') return def;
    const p = parseInt(v, 10);
    return isNaN(p) ? def : p;
  }
  function getPWithFallback(newKey, oldKey, def) {
    var v = props2.getProperty(newKey);
    if (v !== null && v !== '') { var p = parseInt(v, 10); return isNaN(p) ? def : p; }
    v = props2.getProperty(oldKey);
    if (v !== null && v !== '') { var p2 = parseInt(v, 10); return isNaN(p2) ? def : p2; }
    return def;
  }

  // Red de seguridad para los 5 equipos actuales: si un equipo no tiene Script
  // Properties de cupos configuradas, cae aquí en vez de fallar. Un equipo nuevo
  // agregado solo en la hoja Equipos (sin tocar código) que tampoco tenga sus
  // propiedades de cupos configuradas caerá en defaults.DIGITAL — revisar esta
  // tabla al agregar un 6º equipo si sus cupos por defecto deberían ser otros.
  const defaults = {
    DIGITAL: { digital: 70, reestudio: 10, induccion: 8, desaplazamiento: 0, nuevaUar: 2, deudorUar: 2, biometriaFallida: 0 },
    CANONES_ALTOS: { digital: 70, reestudio: 10, induccion: 8, desaplazamiento: 0, nuevaUar: 2, deudorUar: 2, biometriaFallida: 0 },
    DESAPLAZAMIENTO: { digital: 0, reestudio: 0, induccion: 0, desaplazamiento: 8, nuevaUar: 0, deudorUar: 0, biometriaFallida: 0 },
    REESTUDIOS: { digital: 0, reestudio: 10, induccion: 2, desaplazamiento: 0, nuevaUar: 3, deudorUar: 2, biometriaFallida: 0 },
    UAR: { digital: 0, reestudio: 3, induccion: 0, desaplazamiento: 0, nuevaUar: 5, deudorUar: 5, biometriaFallida: 0 }
  };
  const def = defaults[equipoNorm] || defaults.DIGITAL;

  return {
    digital: getPWithFallback(prefix + 'DIGITAL', prefix + 'NUEVAS', def.digital),
    reestudio: getP(prefix + 'REESTUDIOS', def.reestudio),
    induccion: getP(prefix + 'INDUCCIONES', def.induccion),
    desaplazamiento: getPWithFallback(prefix + 'DESAPLAZAMIENTO', 'CUPOS_' + equipoNorm + '_BIOMETRIA', def.desaplazamiento),
    nuevaUar: getP(prefix + 'NUEVA_UAR', def.nuevaUar),
    deudorUar: getP(prefix + 'DEUDOR_UAR', def.deudorUar),
    biometriaFallida: getP(prefix + 'BIOMETRIA_FALLIDA', def.biometriaFallida)
  };
}

// ============================================================
// CONTADORES INCREMENTALES DE CUPO Y CARGA
// ============================================================
// En vez de recontar Historico_Gestiones completo (hoja que solo crece) en
// cada asignación, se mantienen dos valores que se actualizan en el instante
// exacto en que cambian:
//  - Cupo del día (analista+tipo): +1 al asignar un caso. Si un caso se cierra
//    un día distinto al que fue asignado, +1 también al cerrarlo — mismo
//    criterio que el escaneo original (cuenta lo asignado HOY y lo cerrado HOY).
//  - Carga pendiente (analista): +1 al asignar, -1 al cerrar/desasignar/reasignar.
//    No se reinicia por día — mide casos abiertos ahora mismo.
// Si algo se desincroniza (edición manual, error, fallo al cerrar un caso),
// admin_recalcularContadores() (Admin.js) los reconstruye desde cero escaneando el
// histórico — debe correr por trigger nocturno (trigger_recalcularContadores, programado
// a mano en el editor de Apps Script, ver README/CLAUDE.md). Además, un fallo puntual al
// cerrar un caso se autocorrige antes: ver _encolarAjustePendiente/_drenarAjustesPendientesContador
// más abajo, que aplican el ajuste perdido en el próximo cierre exitoso de cualquier analista.

const _PROP_CONTADORES_CUPO = 'CONTADORES_CUPO_HOY';
const _PROP_CARGA_PENDIENTE = 'CARGA_PENDIENTE_ANALISTA';

function _hoyYMD() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

function _fechaEsHoyYMD(fecha) {
  if (!fecha) return false;
  var d = (fecha instanceof Date) ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return false;
  return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd') === _hoyYMD();
}

function _leerContadoresCupoHoy() {
  var raw = PropertiesService.getScriptProperties().getProperty(_PROP_CONTADORES_CUPO);
  var hoy = _hoyYMD();
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      if (parsed.fecha === hoy) return parsed;
    } catch (e) {}
  }
  return { fecha: hoy, datos: {} };
}

function _guardarContadoresCupoHoy(obj) {
  PropertiesService.getScriptProperties().setProperty(_PROP_CONTADORES_CUPO, JSON.stringify(obj));
}

function _incrementarContadorCupo(userEmail, tipo) {
  if (!tipo) return;
  var email = String(userEmail).toLowerCase().trim();
  if (!email) return;
  var estado = _leerContadoresCupoHoy();
  var key = email + '|' + tipo;
  estado.datos[key] = (estado.datos[key] || 0) + 1;
  _guardarContadoresCupoHoy(estado);
}

// Reversa el +1 de _incrementarContadorCupo. Solo debe llamarse cuando el
// caso que se está desasignando fue asignado HOY (si fue de un día anterior,
// su +1 quedó en el contador de aquel día, que ya no existe/importa).
function _decrementarContadorCupo(userEmail, tipo) {
  if (!tipo) return;
  var email = String(userEmail).toLowerCase().trim();
  if (!email) return;
  var estado = _leerContadoresCupoHoy();
  var key = email + '|' + tipo;
  var nuevo = (estado.datos[key] || 0) - 1;
  if (nuevo < 0) {
    Logger.log("⚠️ Contador de cupo '" + key + "' iba a quedar en " + nuevo + " — posible descuadre (se deja en 0).");
    nuevo = 0;
  }
  estado.datos[key] = nuevo;
  _guardarContadoresCupoHoy(estado);
}

function _obtenerConteoHoyAnalista(userEmail) {
  var email = String(userEmail).toLowerCase().trim();
  var estado = _leerContadoresCupoHoy();
  var conteo = { digital: 0, desaplazamiento: 0, induccion: 0, reestudio: 0, nuevaUar: 0, deudorUar: 0, biometriaFallida: 0 };
  for (var tipo in conteo) {
    conteo[tipo] = estado.datos[email + '|' + tipo] || 0;
  }
  return conteo;
}

function _leerCargaPendienteTodos() {
  var raw = PropertiesService.getScriptProperties().getProperty(_PROP_CARGA_PENDIENTE);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) {}
  }
  return {};
}

function _guardarCargaPendienteTodos(obj) {
  PropertiesService.getScriptProperties().setProperty(_PROP_CARGA_PENDIENTE, JSON.stringify(obj));
}

function _ajustarCargaPendiente(userEmail, delta) {
  var email = String(userEmail).toLowerCase().trim();
  if (!email) return;
  var datos = _leerCargaPendienteTodos();
  var nuevo = (datos[email] || 0) + delta;
  if (nuevo < 0) {
    Logger.log("⚠️ Carga pendiente de '" + email + "' iba a quedar en " + nuevo + " — posible descuadre (se deja en 0).");
    nuevo = 0;
  }
  datos[email] = nuevo;
  _guardarCargaPendienteTodos(datos);
}

function _obtenerCargaPendienteAnalista(userEmail) {
  var email = String(userEmail).toLowerCase().trim();
  var datos = _leerCargaPendienteTodos();
  return datos[email] || 0;
}

// Se llama justo al asignar un caso nuevo (MotorAsignacion.js).
function _registrarAsignacionContador(userEmail, tipo) {
  _incrementarContadorCupo(userEmail, tipo);
  _ajustarCargaPendiente(userEmail, 1);
}

// Se llama al cerrar un caso (las 3 funciones de "guardar gestión").
// fechaAsignacionOriginal es la fecha que ya tenía el caso antes de cerrarlo.
function _registrarCierreContador(userEmail, tipo, fechaAsignacionOriginal) {
  _ajustarCargaPendiente(userEmail, -1);
  if (!_fechaEsHoyYMD(fechaAsignacionOriginal)) {
    _incrementarContadorCupo(userEmail, tipo);
  }
}

// ============================================================
// COLA CORTA DE AJUSTES PENDIENTES (autocorrección oportunista)
// ============================================================
// Si _cerrarConteoConLockCorto no consigue el candado corto (otro cierre lo tiene en
// ese instante), el ajuste de contador de ESE cierre no se pierde: se encola aquí y se
// aplica en el próximo cierre exitoso de CUALQUIER analista (que de todos modos ya va a
// tomar el mismo candado). No depende de un trigger nuevo ni de esperar al recálculo
// nocturno — con 30-40 analistas cerrando casos durante el día, el drenaje ocurre en
// segundos/minutos, no en horas. El recálculo nocturno (trigger_recalcularContadores,
// Admin.js) sigue siendo la red de seguridad final para lo que igual se le escape a esto
// (ej. el último cierre del día, sin ningún cierre posterior que lo drene).
const _PROP_AJUSTES_PENDIENTES_CONTADOR = 'AJUSTES_PENDIENTES_CONTADOR';
const _MAX_AJUSTES_PENDIENTES_EN_COLA = 200; // margen amplio; si se llena, el recálculo nocturno lo absorbe igual

function _encolarAjustePendiente(userEmail, tipo, fechaAsignacionOriginal) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(_PROP_AJUSTES_PENDIENTES_CONTADOR);
  var cola = [];
  if (raw) {
    try { cola = JSON.parse(raw); } catch (e) {}
  }
  if (cola.length >= _MAX_AJUSTES_PENDIENTES_EN_COLA) {
    Logger.log("⚠️ Cola de ajustes pendientes llena (" + _MAX_AJUSTES_PENDIENTES_EN_COLA + ") — este ajuste queda solo para el recálculo nocturno.");
    return;
  }
  cola.push({
    email: userEmail,
    tipo: tipo,
    fechaAsignacionOriginal: fechaAsignacionOriginal instanceof Date ? fechaAsignacionOriginal.toISOString() : fechaAsignacionOriginal
  });
  props.setProperty(_PROP_AJUSTES_PENDIENTES_CONTADOR, JSON.stringify(cola));
}

// Aplica y vacía la cola. Debe llamarse solo mientras ya se tiene el ScriptLock corto
// (dentro de _cerrarConteoConLockCorto), para que aplicar la cola + el ajuste actual quede
// serializado con cualquier otro cierre concurrente.
function _drenarAjustesPendientesContador() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(_PROP_AJUSTES_PENDIENTES_CONTADOR);
  if (!raw) return;
  var cola = [];
  try { cola = JSON.parse(raw); } catch (e) {}
  if (!cola || cola.length === 0) return;
  props.deleteProperty(_PROP_AJUSTES_PENDIENTES_CONTADOR);
  cola.forEach(function(item) {
    _registrarCierreContador(item.email, item.tipo, item.fechaAsignacionOriginal ? new Date(item.fechaAsignacionOriginal) : null);
  });
  Logger.log("✅ Drenados " + cola.length + " ajuste(s) de contador que habían quedado pendientes.");
}

// Ubica en una hoja tipo Historico_Gestiones (crece sin límite, nunca se archiva)
// las filas de un analista que cumplen un filtro, sin traer la fila completa de
// cada coincidencia histórica que TextFinder encuentra por email. Primero
// descarta con una sola lectura en bloque de una columna de control (fechaFin,
// estado, marca de reasignación...) sobre el rango de coincidencias; solo trae
// la fila completa de las que sí cumplen (normalmente 0-2, nunca todo el
// historial del analista). Reemplaza "TextFinder + un getRange por cada match",
// que escalaba con el total de casos del analista en vez de con su carga
// realmente abierta — con analistas de cientos/miles de casos, esa cadena de
// lecturas individuales podía tardar tanto que Apps Script la cortaba a mitad
// de camino, dejando la pantalla del analista vacía sin avisar del error.
// Devuelve [{fila: <número de fila real en la hoja>, valores: <fila completa>}].

// Memoización de TextFinder (por ejecución): el mismo email sobre la misma
// hoja+columna se busca hasta 3 veces dentro de cargarPanelAnalista
// (getTableData, obtenerCasosPendientesAnalista, detección reasignaciones).
// Cachear los números de fila devueltos por findAll() ahorra ~800-1500ms
// por invocación repetida (el TextFinder es el paso más caro).
var _textFinderCache = {};
function _getFilasAnalista(hoja, colEmail, userEmail) {
  var hojaName = hoja.getName();
  var ssId = hoja.getParent().getId();
  var key = ssId + '|' + hojaName + '|' + colEmail + '|' + userEmail;
  if (_textFinderCache[key] !== undefined) return _textFinderCache[key];
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) { _textFinderCache[key] = []; return []; }
  var colAsignado = hoja.getRange(2, colEmail, lastRow - 1, 1);
  var matches = colAsignado.createTextFinder(userEmail).matchEntireCell(true).matchCase(false).findAll();
  var filas = matches.map(function(m) { return m.getRow(); });
  _textFinderCache[key] = filas;
  return filas;
}

function _filasFiltradasPorAnalista(hoja, colEmail, colFiltro, predicadoFiltro, userEmail, numColsCompletas) {
  var filas = _getFilasAnalista(hoja, colEmail, userEmail);
  if (filas.length === 0) return [];

  var filaMin = Math.min.apply(null, filas);
  var filaMax = Math.max.apply(null, filas);
  var bloqueFiltro = hoja.getRange(filaMin, colFiltro, filaMax - filaMin + 1, 1).getDisplayValues();

  var filasQueCoinciden = filas.filter(function(fila) {
    return predicadoFiltro(String(bloqueFiltro[fila - filaMin][0]));
  });
  if (filasQueCoinciden.length === 0) return [];

  return filasQueCoinciden.map(function(fila) {
    return { fila: fila, valores: hoja.getRange(fila, 1, 1, numColsCompletas).getDisplayValues()[0] };
  });
}

/**
 * Lee un bloque contiguo [filaMin:filaMax] de una hoja y devuelve solo las
 * filas cuyos índices están en `filasDeseadas`.
 *
 * Reduce N viajes de red (uno por fila) a 1 solo getRange del bloque completo.
 * Las filas intermedias que no están en `filasDeseadas` se descartan en memoria.
 *
 * @param {Sheet} hoja - Referencia a la hoja de Google Sheets
 * @param {Array<number>} filasDeseadas - Números de fila (1-indexed) a extraer
 * @param {number} numCols - Cantidad de columnas a leer
 * @returns {Array<Array>} Datos de las filas solicitadas, en el mismo orden que filasDeseadas
 */
function _leerBloqueCasosAbiertos(hoja, filasDeseadas, numCols) {
  if (!filasDeseadas || filasDeseadas.length === 0) return [];

  var filaMin = Math.min.apply(null, filasDeseadas);
  var filaMax = Math.max.apply(null, filasDeseadas);
  var bloque = hoja.getRange(filaMin, 1, filaMax - filaMin + 1, numCols).getDisplayValues();

  return filasDeseadas.map(function(f) {
    return bloque[f - filaMin];
  });
}

function _derivarTipoReestudio(origenNorm, tipoPNorm) {
  if (tipoPNorm.indexOf("BIOMETRIA FALLIDA") !== -1) return 'biometriaFallida';
  if (origenNorm === "CORREO" && tipoPNorm === "NUEVA") return 'nuevaUar';
  if (origenNorm === "CORREO" && tipoPNorm === "ADICIONAL") return 'deudorUar';
  if (tipoPNorm === "REESTUDIO") return 'reestudio';
  return null;
}

// ============================================================
// MEMOIZACIÓN DE APERTURA DE SPREADSHEET (por ejecución, no entre ejecuciones)
// ============================================================
// SpreadsheetApp.openById() es un viaje de red aparte cada vez que se llama,
// incluso para el mismo ID — no GAS-cachea esto por su cuenta. cargarPanelAnalista()
// llama a 4 funciones (getUnifiedTableData, verificarMisCupos, obtenerCasosPendientesAnalista,
// obtenerGestionesHoyCruzadas) que cada una abría TARGET_SOLICITUDES_SS_ID y/o
// ID_HOJA_REESTUDIOS por su cuenta — hasta 6-7 aperturas del mismo libro en una
// sola carga de panel. _abrirSSCacheado() memoiza el objeto Spreadsheet en una
// variable de módulo: como todas esas funciones corren dentro de la MISMA
// ejecución (una sola invocación de cargarPanelAnalista en el servidor), se
// reutiliza el mismo objeto sin volver a abrirlo. No es un caché entre
// ejecuciones (no usa CacheService/PropertiesService) — se reinicia solo en
// cada nueva invocación, así que no hay riesgo de datos desactualizados.
var _ssAbiertosCache = {};
function _abrirSSCacheado(id) {
  if (!_ssAbiertosCache[id]) _ssAbiertosCache[id] = SpreadsheetApp.openById(id);
  return _ssAbiertosCache[id];
}

// ============================================================
// CACHÉ CORTA DE USUARIOS (evita releer la hoja completa en cada acción)
// ============================================================
// TTL de 30s: si un admin cambia equipo/estado/cupos de un analista, el
// cambio tarda como máximo 30s en reflejarse (además se invalida al instante
// desde admin_actualizarAnalista / admin_crearUsuario en Admin.js).

// Mismo patrón de particionado que _getScoreMapCacheado (ver comentario ahí):
// la columna de historial de estados (col L) guarda un JSON por analista con
// cada cambio de estado del día, así que "Usuarios" completa serializada puede
// superar fácilmente el límite de 100KB por key de CacheService con ~40+
// analistas activos. Particionar es seguro aunque el payload SÍ quepa en una
// sola key (queda como una "partición" de 1).
const _USUARIOS_CACHE_PREFIX = 'USUARIOS_DATA_V2_';
const _USUARIOS_CACHE_TAM_CHUNK = 90000;

// Memoización de ejecución (además del caché de CacheService de arriba): CacheService
// es "best-effort" — Google no garantiza que una entrada sobreviva todo su TTL bajo
// carga concurrente, y en la práctica se confirmó una entrada fallando 2s después de
// haber pegado, dentro de la MISMA ejecución de cargarPanelAnalista (que llama a
// _getDataUsuarios() dos veces: una vía getRolUsuario, otra vía verificarMisCupos).
// Guardar el resultado en una variable de módulo garantiza que dentro de una sola
// ejecución nunca se vuelva a pagar el costo — ni el de CacheService.get() ni,
// en el peor caso, el de releer la hoja completa.
var _datosUsuariosMemo = null;

function _getDataUsuarios(forzarRelectura) {
  if (!forzarRelectura && _datosUsuariosMemo) return _datosUsuariosMemo;
  const _tUsr0 = Date.now();
  var cache = CacheService.getScriptCache();
  if (!forzarRelectura) {
    try {
      var countStr = cache.get(_USUARIOS_CACHE_PREFIX + 'COUNT');
      if (countStr) {
        var count = parseInt(countStr, 10);
        var keys = [];
        for (var i = 0; i < count; i++) keys.push(_USUARIOS_CACHE_PREFIX + i);
        var partes = cache.getAll(keys);
        var json = '';
        var completo = true;
        for (var j = 0; j < count; j++) {
          var parte = partes[_USUARIOS_CACHE_PREFIX + j];
          if (parte === null || parte === undefined) { completo = false; break; }
          json += parte;
        }
        if (completo) {
          Logger.log('⏱ SPERF _getDataUsuarios: cache hit (' + count + ' partes) = ' + (Date.now() - _tUsr0) + 'ms');
          _datosUsuariosMemo = JSON.parse(json);
          return _datosUsuariosMemo;
        }
      }
    } catch (e) {}
  }
  Logger.log('⏱ SPERF _getDataUsuarios: CACHE MISS o forzarRelectura — leyendo hoja "Usuarios" completa');
  var ss = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName("Usuarios");
  var _tUsrRead0 = Date.now();
  var datos = hoja ? hoja.getDataRange().getDisplayValues() : [];
  Logger.log('⏱ SPERF _getDataUsuarios: hoja "Usuarios" tiene ' + datos.length + ' filas, lectura = ' + (Date.now() - _tUsrRead0) + 'ms');
  try {
    var jsonOut = JSON.stringify(datos);
    var partesGuardar = {};
    var n = 0;
    for (var k = 0; k < jsonOut.length; k += _USUARIOS_CACHE_TAM_CHUNK) {
      partesGuardar[_USUARIOS_CACHE_PREFIX + n] = jsonOut.substring(k, k + _USUARIOS_CACHE_TAM_CHUNK);
      n++;
    }
    partesGuardar[_USUARIOS_CACHE_PREFIX + 'COUNT'] = String(n);
    cache.putAll(partesGuardar, 30);
    Logger.log('⏱ SPERF _getDataUsuarios: cache.putAll OK (' + n + ' partes, ' + jsonOut.length + ' chars)');
  } catch (e) {
    Logger.log('⏱ SPERF _getDataUsuarios: cache.putAll falló (' + e.message + ')');
  }
  Logger.log('⏱ SPERF _getDataUsuarios: total (cache miss) = ' + (Date.now() - _tUsr0) + 'ms');
  _datosUsuariosMemo = datos;
  return datos;
}

function _invalidarCacheUsuarios() {
  _datosUsuariosMemo = null;
  try {
    var cache = CacheService.getScriptCache();
    var countStr = cache.get(_USUARIOS_CACHE_PREFIX + 'COUNT');
    if (countStr) {
      var count = parseInt(countStr, 10);
      var keys = [_USUARIOS_CACHE_PREFIX + 'COUNT'];
      for (var i = 0; i < count; i++) keys.push(_USUARIOS_CACHE_PREFIX + i);
      cache.removeAll(keys);
    }
  } catch (e) {}
}

// ============================================================
// CACHÉ CORTA DE TURNOS (evita releer Analistas_Turnos + Turnos en cada activación)
// ============================================================
// TTL de 60s: los turnos cambian raramente (solo cuando un admin los configura).
// Mismo patrón de particionado que _getDataUsuarios: CacheService tiene un límite
// de 100KB por key, y aunque con ~40 analistas y ~10 turnos el payload típico es
// ~15-30KB, el chunking es defensivo para crecimiento futuro.

const _TURNOS_CACHE_PREFIX = 'TURNOS_DATA_V1_';
// 30 min — turnos cambian rara vez y solo un admin puede hacerlo, y cuando lo hace
// ya invalida la caché al instante (_invalidarCacheTurnos, llamada desde
// admin_guardarTurno/admin_desactivarTurno/admin_asignarTurnoAnalista). El TTL aquí
// es solo un respaldo, no la vía real de actualización — se puede alargar sin riesgo
// de mostrar datos desactualizados tras un cambio real. Antes en 5 min, el cache miss
// costaba ~2.6-2.8s (medido en producción) cada vez que expiraba sin que nadie lo
// hubiera invalidado antes.
const _TURNOS_CACHE_TTL = 1800; // segundos (30 min)
const _TURNOS_CACHE_TAM_CHUNK = 90000; // bytes por chunk

// Memoización de ejecución (igual que _datosUsuariosMemo para Usuarios):
// garantiza que dentro de una sola ejecución nunca se vuelva a pagar el costo
// de CacheService.get() ni el de releer las hojas completas.
var _datosTurnosMemo = null;

/**
 * Lee datos de Analistas_Turnos y Turnos desde CacheService o, en caso de miss,
 * desde las hojas del spreadsheet. Almacena en caché con TTL=60s.
 * Usa chunking si el payload excede 90KB por chunk (igual que _getDataUsuarios).
 *
 * @param {Spreadsheet} ss - Spreadsheet ya abierta (TARGET_SOLICITUDES_SS_ID)
 * @returns {{ dataAT: Array, dataTurnos: Array, dispTurnos: Array }}
 */
function _getTurnosDataCacheado(ss) {
  // 1. Memoización de ejecución (más rápido que CacheService)
  if (_datosTurnosMemo) return _datosTurnosMemo;

  var _tTurnos0 = Date.now();
  var cache = CacheService.getScriptCache();

  // 2. Intentar leer desde CacheService (chunked)
  try {
    var countStr = cache.get(_TURNOS_CACHE_PREFIX + 'COUNT');
    if (countStr) {
      var count = parseInt(countStr, 10);
      var keys = [];
      for (var i = 0; i < count; i++) keys.push(_TURNOS_CACHE_PREFIX + i);
      var partes = cache.getAll(keys);
      var json = '';
      var completo = true;
      for (var j = 0; j < count; j++) {
        var parte = partes[_TURNOS_CACHE_PREFIX + j];
        if (parte === null || parte === undefined) { completo = false; break; }
        json += parte;
      }
      if (completo) {
        Logger.log('⏱ SPERF _getTurnosDataCacheado: cache hit (' + count + ' partes) = ' + (Date.now() - _tTurnos0) + 'ms');
        // Reviver: JSON.stringify convierte los Date (desde/hasta de Analistas_Turnos)
        // en strings ISO; sin esto, `instanceof Date` en _verificarTurnoActivoReal falla
        // en cada cache hit y descarta al analista como si no tuviera turno vigente.
        _datosTurnosMemo = JSON.parse(json, function(key, value) {
          if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
            return new Date(value);
          }
          return value;
        });
        return _datosTurnosMemo;
      }
    }
  } catch (e) {}

  // 3. Cache miss: leer hojas Analistas_Turnos y Turnos desde el spreadsheet
  Logger.log('⏱ SPERF _getTurnosDataCacheado: CACHE MISS — leyendo hojas Analistas_Turnos y Turnos');
  var _tRead0 = Date.now();

  var hojaAT = ss.getSheetByName('Analistas_Turnos');
  var dataAT = (hojaAT && hojaAT.getLastRow() > 1) ? hojaAT.getDataRange().getValues() : [];

  var hojaTurnos = ss.getSheetByName('Turnos');
  var dataTurnos = (hojaTurnos && hojaTurnos.getLastRow() > 1) ? hojaTurnos.getDataRange().getValues() : [];
  var dispTurnos = (hojaTurnos && hojaTurnos.getLastRow() > 1) ? hojaTurnos.getDataRange().getDisplayValues() : [];

  Logger.log('⏱ SPERF _getTurnosDataCacheado: lectura hojas (AT=' + dataAT.length + ' filas, Turnos=' + dataTurnos.length + ' filas) = ' + (Date.now() - _tRead0) + 'ms');

  var datos = { dataAT: dataAT, dataTurnos: dataTurnos, dispTurnos: dispTurnos };

  // 4. Serializar y guardar en CacheService con chunking
  try {
    var jsonOut = JSON.stringify(datos);
    var partesGuardar = {};
    var n = 0;
    for (var k = 0; k < jsonOut.length; k += _TURNOS_CACHE_TAM_CHUNK) {
      partesGuardar[_TURNOS_CACHE_PREFIX + n] = jsonOut.substring(k, k + _TURNOS_CACHE_TAM_CHUNK);
      n++;
    }
    partesGuardar[_TURNOS_CACHE_PREFIX + 'COUNT'] = String(n);
    cache.putAll(partesGuardar, _TURNOS_CACHE_TTL);
    Logger.log('⏱ SPERF _getTurnosDataCacheado: cache.putAll OK (' + n + ' partes, ' + jsonOut.length + ' chars)');
  } catch (e) {
    Logger.log('⏱ SPERF _getTurnosDataCacheado: cache.putAll falló (' + e.message + ')');
  }

  Logger.log('⏱ SPERF _getTurnosDataCacheado: total (cache miss) = ' + (Date.now() - _tTurnos0) + 'ms');
  _datosTurnosMemo = datos;
  return datos;
}

/**
 * Invalida el caché de turnos (CacheService + memoización de ejecución).
 * Se invoca desde funciones admin que modifican la configuración de turnos
 * (admin_guardarTurno, admin_desactivarTurno, admin_asignarTurnoAnalista).
 */
function _invalidarCacheTurnos() {
  _datosTurnosMemo = null;
  try {
    var cache = CacheService.getScriptCache();
    var countStr = cache.get(_TURNOS_CACHE_PREFIX + 'COUNT');
    if (countStr) {
      var count = parseInt(countStr, 10);
      var keys = [_TURNOS_CACHE_PREFIX + 'COUNT'];
      for (var i = 0; i < count; i++) keys.push(_TURNOS_CACHE_PREFIX + i);
      cache.removeAll(keys);
    }
  } catch (e) {
    Logger.log('_invalidarCacheTurnos: error al eliminar cache (' + e.message + ')');
  }
}

// ============================================================
// MEMOIZACIÓN DE HISTORICO_GESTIONES (por ejecución)
// ============================================================
// Mismo patrón que _datosTurnosMemo y _datosUsuariosMemo: se llena en la
// primera lectura dentro de cargarPanelAnalista() y se reutiliza por todas
// las sub-funciones que necesitan datos de Historico_Gestiones. Se resetea
// automáticamente al finalizar la ejecución del servidor.

/** @type {Array<Array<string>>|null} Todas las filas (row 2..lastRow) × todas las columnas de Historico_Gestiones principal */
var _histGestionesPrincipalMemo = null;

/** @type {Array<Array<string>>|null} Todas las filas (row 2..lastRow) × todas las columnas de Historico_Gestiones reestudios */
var _histGestionesReestMemo = null;

/**
 * Obtiene los datos de Historico_Gestiones del spreadsheet principal.
 * Primera llamada: lee toda la hoja (row 2 .. lastRow, col 1 .. lastCol) con getDisplayValues().
 * Llamadas posteriores: devuelve el memo sin network round-trip.
 *
 * @returns {Array<Array<string>>} 2D array con todas las filas (sin header) y columnas, o [] si falla.
 */
function _getHistGestionesPrincipal() {
  if (_histGestionesPrincipalMemo !== null) {
    if (!Array.isArray(_histGestionesPrincipalMemo)) {
      Logger.log('⏱ SPERF _getHistGestionesPrincipal: memo inválido (no es Array) — descartando');
      _histGestionesPrincipalMemo = null;
    } else {
      Logger.log('⏱ SPERF _getHistGestionesPrincipal: memo hit (' + _histGestionesPrincipalMemo.length + ' filas)');
      return _histGestionesPrincipalMemo;
    }
  }

  var _t0 = Date.now();
  try {
    var hoja = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID).getSheetByName("Historico_Gestiones");
    if (!hoja || hoja.getLastRow() < 2) {
      _histGestionesPrincipalMemo = [];
      Logger.log('⏱ SPERF _getHistGestionesPrincipal: hoja vacía o no encontrada — memo = []');
      return _histGestionesPrincipalMemo;
    }
    var lastRow = hoja.getLastRow();
    var lastCol = Math.max(hoja.getLastColumn(), 61);
    _histGestionesPrincipalMemo = hoja.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
    Logger.log('⏱ SPERF _getHistGestionesPrincipal: fresh read = ' + (Date.now() - _t0) + 'ms (' + _histGestionesPrincipalMemo.length + ' filas × ' + lastCol + ' cols)');
  } catch (e) {
    Logger.log('⏱ SPERF _getHistGestionesPrincipal: primer intento falló (' + e.message + ') — reintentando');
    try {
      var hoja2 = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID).getSheetByName("Historico_Gestiones");
      if (hoja2 && hoja2.getLastRow() >= 2) {
        var lastRow2 = hoja2.getLastRow();
        var lastCol2 = Math.max(hoja2.getLastColumn(), 61);
        _histGestionesPrincipalMemo = hoja2.getRange(2, 1, lastRow2 - 1, lastCol2).getDisplayValues();
        Logger.log('⏱ SPERF _getHistGestionesPrincipal: retry OK = ' + (Date.now() - _t0) + 'ms');
      } else {
        _histGestionesPrincipalMemo = [];
      }
    } catch (e2) {
      Logger.log('⏱ SPERF _getHistGestionesPrincipal: retry TAMBIÉN falló (' + e2.message + ') — devolviendo []');
      _histGestionesPrincipalMemo = null;
      return [];
    }
  }
  return _histGestionesPrincipalMemo || [];
}

/**
 * Obtiene los datos de Historico_Gestiones del spreadsheet de reestudios.
 * Primera llamada: lee toda la hoja (row 2 .. lastRow, col 1 .. lastCol) con getDisplayValues().
 * Llamadas posteriores: devuelve el memo sin network round-trip.
 *
 * @returns {Array<Array<string>>} 2D array con todas las filas (sin header) y columnas, o [] si falla.
 */
function _getHistGestionesReest() {
  if (_histGestionesReestMemo !== null) {
    if (!Array.isArray(_histGestionesReestMemo)) {
      Logger.log('⏱ SPERF _getHistGestionesReest: memo inválido (no es Array) — descartando');
      _histGestionesReestMemo = null;
    } else {
      Logger.log('⏱ SPERF _getHistGestionesReest: memo hit (' + _histGestionesReestMemo.length + ' filas)');
      return _histGestionesReestMemo;
    }
  }

  var _t0 = Date.now();
  try {
    var hoja = _abrirSSCacheado(ID_HOJA_REESTUDIOS).getSheetByName("Historico_Gestiones");
    if (!hoja || hoja.getLastRow() < 2) {
      _histGestionesReestMemo = [];
      Logger.log('⏱ SPERF _getHistGestionesReest: hoja vacía o no encontrada — memo = []');
      return _histGestionesReestMemo;
    }
    var lastRow = hoja.getLastRow();
    var lastCol = Math.max(hoja.getLastColumn(), 14);
    _histGestionesReestMemo = hoja.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
    Logger.log('⏱ SPERF _getHistGestionesReest: fresh read = ' + (Date.now() - _t0) + 'ms (' + _histGestionesReestMemo.length + ' filas × ' + lastCol + ' cols)');
  } catch (e) {
    Logger.log('⏱ SPERF _getHistGestionesReest: primer intento falló (' + e.message + ') — reintentando');
    try {
      var hoja2 = _abrirSSCacheado(ID_HOJA_REESTUDIOS).getSheetByName("Historico_Gestiones");
      if (hoja2 && hoja2.getLastRow() >= 2) {
        var lastRow2 = hoja2.getLastRow();
        var lastCol2 = Math.max(hoja2.getLastColumn(), 14);
        _histGestionesReestMemo = hoja2.getRange(2, 1, lastRow2 - 1, lastCol2).getDisplayValues();
        Logger.log('⏱ SPERF _getHistGestionesReest: retry OK = ' + (Date.now() - _t0) + 'ms');
      } else {
        _histGestionesReestMemo = [];
      }
    } catch (e2) {
      Logger.log('⏱ SPERF _getHistGestionesReest: retry TAMBIÉN falló (' + e2.message + ') — devolviendo []');
      _histGestionesReestMemo = null;
      return [];
    }
  }
  return _histGestionesReestMemo || [];
}

/** Invalida el memo de Historico_Gestiones principal. Mismo patrón que _invalidarCacheTurnos(). */
function _invalidarMemoHistPrincipal() {
  _histGestionesPrincipalMemo = null;
}

/** Invalida el memo de Historico_Gestiones reestudios. */
function _invalidarMemoHistReest() {
  _histGestionesReestMemo = null;
}

/** Invalida ambos memos de Historico_Gestiones. */
function _invalidarMemoHistGestiones() {
  _histGestionesPrincipalMemo = null;
  _histGestionesReestMemo = null;
}

function doGet() {
  const userEmail = Session.getActiveUser().getEmail();
  const info = getRolUsuario(userEmail);

  if (!info) {
    return HtmlService.createHtmlOutput("<h2>Acceso Denegado</h2>");
  }

  if (info.rol === "ADMIN") {
    return HtmlService.createTemplateFromFile('VistaAdmin').evaluate().setTitle('Panel Admin');
  }

  if (info.rol === "ASESOR") {
    const equipo = resolverEquipoDesdeEspecialidad(info.especialidad);
    if (!equipo) return HtmlService.createHtmlOutput("<h2>Equipo no configurado para tu especialidad.</h2>");
    const template = HtmlService.createTemplateFromFile('VistaUnificada');
    template.equipoConfig = JSON.stringify(equipo);
    template.userEmail = userEmail;
    return template.evaluate()
      .setTitle('Gestión - ' + equipo.nombre)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  return HtmlService.createHtmlOutput("<h2>Rol no reconocido</h2>");
}

function getRolUsuario(email) {
  const datos = _getDataUsuarios();
  if (!datos || !datos.length) return null;
  email = email.toLowerCase().trim();
  
  for (let i = 1; i < datos.length; i++) {
    const correoHoja = String(datos[i][2]).toLowerCase().trim(); 
    
    if (correoHoja === email) {
      return { 
        rol: String(datos[i][23]).toUpperCase().trim(),
        especialidad: String(datos[i][4]).toUpperCase().trim()
      };
    }
  }
  return null;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================
// RESOLUCIÓN DE EQUIPO Y FUNCIONES UNIFICADAS
// ============================================================

function resolverEquipoDesdeEspecialidad(especialidad) {
  var equipos = _getEquipos();
  var esp = String(especialidad).toUpperCase().trim();
  var mapeo = {
    'ESTUDIO DIGITAL': 'DIGITAL',
    'ESTUDIO_DIGITAL': 'DIGITAL',
    'PENDIENTE_BIOMETRIA': 'DESAPLAZAMIENTO',
    'BIOMETRIA': 'DESAPLAZAMIENTO',
    'DESAPLAZAMIENTO': 'DESAPLAZAMIENTO',
    'ANALISTA DESPLAZAMIENTO': 'DESAPLAZAMIENTO',
    'REESTUDIOS': 'REESTUDIOS',
    'UAR': 'UAR',
    'ANALISTA UAR': 'UAR',
    'CANONES ALTOS': 'CANONES_ALTOS',
    'CANONES_ALTOS': 'CANONES_ALTOS',
    'ESTUDIO CANON ALTO': 'CANONES_ALTOS'
  };
  var equipoId = mapeo[esp] || esp;
  var encontrado = equipos.find(function(e) { return e.id === equipoId; });

  if (!encontrado) {
    // Fallback hardcoded para compatibilidad si la hoja Equipos no existe aún o si
    // el equipo resuelto no está en ella. Cubre solo los 5 equipos actuales — un
    // 6º equipo agregado únicamente en la hoja Equipos, si por algún motivo no se
    // encuentra aquí (p.ej. `equipos` llegó vacío), caerá en defaults['DIGITAL'].
    var defaults = {
      'DIGITAL': { id: 'DIGITAL', nombre: 'Estudios Digitales', icono: 'bi-shield-check', colorHex: '#253150', activo: true, modalTipo: 'DIGITAL_FULL', funcionGuardar: 'guardarCambiosInternos', usarVipRotacion: true, usarScoreCategories: true, maxAsignarPorLlamada: 1, ordenPrioridad: [], fuentesDatos: [], canonDesde: 0, canonHasta: 0, canonTipos: [] },
      'CANONES_ALTOS': { id: 'CANONES_ALTOS', nombre: 'Cánones Altos', icono: 'bi-shield-check', colorHex: '#253150', activo: true, modalTipo: 'DIGITAL_FULL', funcionGuardar: 'guardarCambiosInternos', usarVipRotacion: true, usarScoreCategories: true, maxAsignarPorLlamada: 1, ordenPrioridad: [], fuentesDatos: [], canonDesde: 8000000, canonHasta: 0, canonTipos: ['digital'] },
      'DESAPLAZAMIENTO': { id: 'DESAPLAZAMIENTO', nombre: 'Desaplazamiento', icono: 'bi-fingerprint', colorHex: '#8b0a0e', activo: true, modalTipo: 'BIOMETRIA_TIPIFICACION', funcionGuardar: 'guardarGestionBiometria', usarVipRotacion: false, usarScoreCategories: false, maxAsignarPorLlamada: 99, ordenPrioridad: [], fuentesDatos: [], canonDesde: 0, canonHasta: 0, canonTipos: [] },
      'REESTUDIOS': { id: 'REESTUDIOS', nombre: 'Reestudios', icono: 'bi-arrow-repeat', colorHex: '#198754', activo: true, modalTipo: 'REESTUDIO_SIMPLE', funcionGuardar: 'guardarGestionReestudio', usarVipRotacion: false, usarScoreCategories: false, maxAsignarPorLlamada: 1, ordenPrioridad: [], fuentesDatos: [], canonDesde: 0, canonHasta: 0, canonTipos: [] },
      'UAR': { id: 'UAR', nombre: 'UAR', icono: 'bi-envelope', colorHex: '#6f42c1', activo: true, modalTipo: 'REESTUDIO_SIMPLE', funcionGuardar: 'guardarGestionReestudio', usarVipRotacion: false, usarScoreCategories: false, maxAsignarPorLlamada: 1, ordenPrioridad: [], fuentesDatos: [], canonDesde: 0, canonHasta: 0, canonTipos: [] }
    };
    return defaults[equipoId] || defaults['DIGITAL'];
  }
  return encontrado;
}

function getUnifiedTableData() {
  var _tGUTD0 = Date.now();
  var userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  var info = getRolUsuario(userEmail);
  Logger.log('⏱ SPERF getUnifiedTableData: Session.getActiveUser + getRolUsuario = ' + (Date.now() - _tGUTD0) + 'ms');
  if (!info) return { tabla: [], stats: { hoy: 0, pendientes: 0 }, equipoId: '', equipoNombre: '' };

  var _tEquipo0 = Date.now();
  var equipo = resolverEquipoDesdeEspecialidad(info.especialidad);
  Logger.log('⏱ SPERF getUnifiedTableData: resolverEquipoDesdeEspecialidad = ' + (Date.now() - _tEquipo0) + 'ms');
  Logger.log('getUnifiedTableData: email=' + userEmail + ' especialidad=' + info.especialidad + ' equipo=' + equipo.id);

  // Spreadsheet 1 (TARGET_SOLICITUDES_SS_ID) → "solicitud" + Historico_Gestiones
  //   Contiene: digitales, biometrías, inducciones
  // Spreadsheet 2 (ID_HOJA_REESTUDIOS) → "ORIGEN" + Historico_Gestiones
  //   Contiene: reestudios de Victoria y Correo
  //
  // getTableData() ya incluye ambas fuentes (lee ORIGEN + Historico de reestudios
  // y los marca con __REESTUDIO__). Todos los equipos usan getTableData().

  if (equipo.id === 'REESTUDIOS') {
    var dataRest = getReestudiosData();
    return {
      tabla: dataRest.solicitudes || [],
      stats: dataRest.stats || { hoy: 0, pendientes: 0 },
      equipoId: equipo.id,
      equipoNombre: equipo.nombre,
      tipoVista: 'REESTUDIOS',
      error: dataRest.error || (dataRest.success === false ? dataRest.message : undefined)
    };
  }

  // Digital, Biometría, Inducción y cualquier otro equipo
  var _tGTDcall0 = Date.now();
  var data = getTableData();
  Logger.log('⏱ SPERF getUnifiedTableData: getTableData() (llamada completa) = ' + (Date.now() - _tGTDcall0) + 'ms');
  return {
    tabla: data.tabla || [],
    stats: data.stats || { hoy: 0, pendientes: 0 },
    reasignaciones: data.reasignaciones || [],
    equipoId: equipo.id,
    equipoNombre: equipo.nombre,
    tipoVista: 'DIGITAL',
    error: data.error,
    _rawSolicitud: data._rawSolicitud,
    _rawOrigen: data._rawOrigen
  };
}

// Junta en una sola llamada al servidor lo que antes eran 4 llamadas separadas
// desde cargarDatos() (main.js.html): tabla, cupos, pendientes de validación y
// conteo cruzado del día. Cada pieza queda en su propio try/catch para que si
// una falla, no tumbe a las demás — el cliente revisa response.tabla.error,
// etc., igual que revisaba cada respuesta individual antes.
function cargarPanelAnalista() {
  // SPERF (temporal): desglosa cuál de los 4 sub-llamados realmente consume el
  // tiempo. Ver en el editor de Apps Script: Ejecuciones → abrir la ejecución
  // más reciente de cargarPanelAnalista → Registros. Quitar una vez identificado
  // el cuello de botella real (ver hilo de optimización de performance).
  var _tCargarPanel0 = Date.now();
  var _ultimoMarcador = _tCargarPanel0;
  function _sperfPanel(label) {
    var ahora = Date.now();
    Logger.log('⏱ SPERF cargarPanelAnalista [+' + (ahora - _ultimoMarcador) + 'ms | total ' + (ahora - _tCargarPanel0) + 'ms] ' + label);
    _ultimoMarcador = ahora;
  }

  var resultado = { tabla: null, cupos: null, pendientesValidacion: [], gestionesHoyCruzadas: null };

  // Pre-warm: calentar cache de turnos durante la carga del panel.
  // Si ya está en cache, cuesta ~0ms. Si no, lo llena para que el próximo
  // clic en ACTIVO no pague el cold start de ~2900ms.
  try { _getTurnosDataCacheado(_abrirSSCacheado(TARGET_SOLICITUDES_SS_ID)); } catch(e) {}

  var datosPrefetchCupos = null;
  try {
    resultado.tabla = getUnifiedTableData();
    _sperfPanel('getUnifiedTableData() completado');
    // _rawSolicitud/_rawOrigen viajan agregados al resultado de getUnifiedTableData()
    // solo para reuso interno (ver verificarMisCupos más abajo) — se sacan de
    // resultado.tabla antes de devolver al cliente para no duplicar ese payload
    // en la respuesta JSON.
    if (resultado.tabla && (resultado.tabla._rawSolicitud || resultado.tabla._rawOrigen)) {
      datosPrefetchCupos = { dataSolicitud: resultado.tabla._rawSolicitud, dataOrigen: resultado.tabla._rawOrigen };
      delete resultado.tabla._rawSolicitud;
      delete resultado.tabla._rawOrigen;
    }
  } catch (e) {
    resultado.tabla = { error: e.message, tabla: [] };
    _sperfPanel('getUnifiedTableData() ERROR: ' + e.message);
  }

  try {
    resultado.cupos = verificarMisCupos(undefined, datosPrefetchCupos);
    _sperfPanel('verificarMisCupos() completado');
  } catch (e) {
    resultado.cupos = { cumplido: false, totalUsado: 0, totalLimite: 0, resumen: [], mensaje: '' };
    _sperfPanel('verificarMisCupos() ERROR: ' + e.message);
  }

  try {
    resultado.pendientesValidacion = obtenerCasosPendientesAnalista();
    _sperfPanel('obtenerCasosPendientesAnalista() completado');
  } catch (e) {
    resultado.pendientesValidacion = [];
    _sperfPanel('obtenerCasosPendientesAnalista() ERROR: ' + e.message);
  }

  try {
    resultado.gestionesHoyCruzadas = obtenerGestionesHoyCruzadas();
    _sperfPanel('obtenerGestionesHoyCruzadas() completado');
  } catch (e) {
    resultado.gestionesHoyCruzadas = { hoyTotal: 0, detalle: { digital: 0, reestudios: 0 } };
    _sperfPanel('obtenerGestionesHoyCruzadas() ERROR: ' + e.message);
  }

  // Estado actual del analista — costo ~0ms porque _getDataUsuarios() ya fue
  // memoizado en esta misma ejecución (lo invocó getRolUsuario arriba). Devolver
  // esto junto con el panel le permite al cliente saber el estado sin un viaje
  // separado a obtenerMiEstadoActual(), ahorrando ~1.8s de latencia de red.
  try {
    var _emailPanel = Session.getActiveUser().getEmail().toLowerCase().trim();
    var _datosUsr = _getDataUsuarios();
    for (var _iu = 1; _iu < _datosUsr.length; _iu++) {
      if (String(_datosUsr[_iu][2]).toLowerCase().trim() === _emailPanel) {
        resultado.estadoActual = String(_datosUsr[_iu][5]).toUpperCase().trim();
        break;
      }
    }
  } catch (e) {}

  // Consolidar llamadas que antes eran viajes de red separados en el boot del
  // cliente (cada una con ~2-3s de overhead del iframe). Al incluirlas aquí
  // viajan gratis en la misma respuesta sin costo perceptible de servidor.
  try { resultado.infoTurno = obtenerInfoTurnoActual(); } catch (e) { resultado.infoTurno = { tieneTurno: false }; }
  try { resultado.permisoVigente = verificarPermisoVigenteHoy(); } catch (e) { resultado.permisoVigente = { tienePermiso: false }; }
  try { resultado.yaAlmorzo = yaAlmorzoHoy(); } catch (e) { resultado.yaAlmorzo = false; }
  try { resultado.motivosAplazamiento = getMotivosAplazamiento(); } catch (e) { resultado.motivosAplazamiento = []; }
  try { resultado.motivosNegacion = getMotivosNegacion(); } catch (e) { resultado.motivosNegacion = []; }

  return resultado;
}

function autoAsignarDesdeEquipo() {
  var userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  var info = getRolUsuario(userEmail);
  if (!info) return { success: false, message: "Usuario no registrado." };

  var equipo = resolverEquipoDesdeEspecialidad(info.especialidad);

  var resultado = RequestLeadUnificado(equipo.id);

  // Actualiza pendiente_biometria a fase="ASIGNADA" aquí, en el punto común por el
  // que pasan TODOS los caminos de auto-asignación (activarYAsignar, autoAsignarConPanel,
  // guardarYAsignarSiguiente, autoAsignarAlEntrar, y el intento directo del frontend en
  // _onPanelRecibido) — así ningún camino, presente o futuro, puede olvidarlo. Antes cada
  // llamador debía acordarse de hacerlo por su cuenta con idsAsignados/faseTarget; el
  // camino de autoAsignarAlEntrar() nunca lo hacía, dejando casos de desaplazamiento
  // asignados y cerrados con fase="ESCALADA" atascada para siempre en pendiente_biometria
  // (bug confirmado en producción: casos con días de antigüedad sin pasar a ASIGNADA).
  // Los 3 llamadores que ya lo hacían por su cuenta ahora chequean _biometriaEjecutada
  // antes de repetirlo (ver activarYAsignar/autoAsignarConPanel/guardarYAsignarSiguiente).
  if (resultado && resultado.idsAsignados && resultado.idsAsignados.length > 0) {
    var sincronizacionBiometria = actualizarFaseBiometriaPendienteDeferred(resultado.idsAsignados, resultado.faseTarget);
    resultado._biometriaEjecutada = !!(
      sincronizacionBiometria
      && sincronizacionBiometria.success
      && sincronizacionBiometria.actualizadasIds.length === resultado.idsAsignados.length
    );
    if (!resultado._biometriaEjecutada) {
      Logger.log('⚠ autoAsignarDesdeEquipo: fase ASIGNADA incompleta. ' + JSON.stringify(sincronizacionBiometria));
    }
  } else if (resultado) {
    resultado._biometriaEjecutada = false;
  }

  return resultado;
}

function getEquipoDelUsuario() {
  var userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  var info = getRolUsuario(userEmail);
  if (!info) return null;
  return resolverEquipoDesdeEspecialidad(info.especialidad);
}

// Cacheada (CacheService, 90s) — antes Código.js:getTableData y Reestudios.js:
// getReestudiosData cada una releía la hoja "score" completa por separado en cada carga de
// panel; con 40 analistas refrescando en la misma franja horaria era la misma lectura
// completa repetida una y otra vez. mapaScore: póliza → categoría; mapaInmobiliaria: póliza
// → inmobiliaria. Ambas claves con y sin normalizar (solo dígitos, sin ceros a la izq.).
// CacheService.put() rechaza valores de más de ~100KB ("Argumento demasiado
// grande: value") sin avisar salvo por la excepción — con ~2300 pólizas x 2
// mapas (score + inmobiliaria) x 2 claves cada una (normal y normalizada), el
// JSON serializado superaba ese límite y cache.put() fallaba SIEMPRE, silenciado
// por el try/catch de abajo. Efecto real: el caché de 90s nunca llegó a guardar
// nada desde que se agregó, así que TODAS las cargas de panel releían y
// reprocesaban la hoja "score" completa (~1.4s cada vez, confirmado con SPERF).
// Fix: particionar el JSON en trozos de ≤90KB bajo varias keys (putAll/getAll),
// patrón estándar de Apps Script para valores que exceden el límite por key.
const _SCORE_CACHE_PREFIX = 'SCORE_MAP_V2_';
const _SCORE_CACHE_TAM_CHUNK = 90000;
// Memoización de ejecución — mismo motivo que _datosUsuariosMemo (Código.js):
// CacheService es best-effort y no conviene pagar su costo dos veces en la
// misma ejecución si esta función llega a invocarse más de una vez.
var _scoreMapMemo = null;

function _getScoreMapCacheado() {
  if (_scoreMapMemo) return _scoreMapMemo;
  const _tScore0 = Date.now();
  const cache = CacheService.getScriptCache();
  try {
    const countStr = cache.get(_SCORE_CACHE_PREFIX + 'COUNT');
    if (countStr) {
      const count = parseInt(countStr, 10);
      const keys = [];
      for (let i = 0; i < count; i++) keys.push(_SCORE_CACHE_PREFIX + i);
      const partes = cache.getAll(keys);
      let json = '';
      let completo = true;
      for (let i = 0; i < count; i++) {
        const parte = partes[_SCORE_CACHE_PREFIX + i];
        if (parte === null || parte === undefined) { completo = false; break; }
        json += parte;
      }
      if (completo) {
        const obj = JSON.parse(json);
        Logger.log('⏱ SPERF _getScoreMapCacheado: cache hit (' + count + ' partes) = ' + (Date.now() - _tScore0) + 'ms');
        _scoreMapMemo = { mapaScore: new Map(obj.mapaScore), mapaInmobiliaria: new Map(obj.mapaInmobiliaria) };
        return _scoreMapMemo;
      }
    }
  } catch (e) {}

  Logger.log('⏱ SPERF _getScoreMapCacheado: CACHE MISS — leyendo hoja "score" completa');
  const mapaScore = new Map();
  const mapaInmobiliaria = new Map();
  try {
    const ssScore = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID);
    const hojaScore = ssScore.getSheetByName("score");
    if (hojaScore) {
      Logger.log('⏱ SPERF _getScoreMapCacheado: hoja "score" tiene ' + hojaScore.getLastRow() + ' filas x ' + hojaScore.getLastColumn() + ' cols');
      const _tScoreRead0 = Date.now();
      const dataScore = hojaScore.getDataRange().getDisplayValues();
      Logger.log('⏱ SPERF _getScoreMapCacheado: lectura completa "score" = ' + (Date.now() - _tScoreRead0) + 'ms');
      for (let i = 1; i < dataScore.length; i++) {
        let pol = String(dataScore[i][0]).trim();
        let polNorm = pol.replace(/\D/g, '').replace(/^0+/, '');
        let categoria = String(dataScore[i][2] || "").trim().toUpperCase();
        let inmobiliaria = String(dataScore[i][3] || "").trim();

        if (pol) { mapaScore.set(pol, categoria); mapaInmobiliaria.set(pol, inmobiliaria); }
        if (polNorm) { mapaScore.set(polNorm, categoria); mapaInmobiliaria.set(polNorm, inmobiliaria); }
      }
    } else {
      Logger.log('_getScoreMapCacheado: hoja "score" no encontrada — categoriaScore/inmobiliaria quedarán vacíos para todos los casos.');
    }
  } catch (e) {
    Logger.log('_getScoreMapCacheado: ' + e.message);
  }

  try {
    const json = JSON.stringify({
      mapaScore: Array.from(mapaScore.entries()),
      mapaInmobiliaria: Array.from(mapaInmobiliaria.entries())
    });
    const partesGuardar = {};
    let n = 0;
    for (let i = 0; i < json.length; i += _SCORE_CACHE_TAM_CHUNK) {
      partesGuardar[_SCORE_CACHE_PREFIX + n] = json.substring(i, i + _SCORE_CACHE_TAM_CHUNK);
      n++;
    }
    partesGuardar[_SCORE_CACHE_PREFIX + 'COUNT'] = String(n);
    cache.putAll(partesGuardar, 3600); // 1 hora — score casi nunca cambia
    Logger.log('⏱ SPERF _getScoreMapCacheado: cache.putAll OK (' + n + ' partes, ' + json.length + ' chars)');
  } catch (e) {
    Logger.log('⏱ SPERF _getScoreMapCacheado: cache.putAll falló (' + e.message + ')');
  }

  Logger.log('⏱ SPERF _getScoreMapCacheado: total (cache miss) = ' + (Date.now() - _tScore0) + 'ms');
  _scoreMapMemo = { mapaScore: mapaScore, mapaInmobiliaria: mapaInmobiliaria };
  return _scoreMapMemo;
}

/**
 * Invalida el caché de _getScoreMapCacheado (CacheService + memo de ejecución).
 * Se invoca desde admin_actualizarCategoriaPoliza — antes de esto, un cambio de
 * categoría/VIP hecho por un admin podía tardar hasta 1 hora (el TTL del caché)
 * en reflejarse, porque nada avisaba a esta caché que la hoja "score" cambió.
 * Mismo patrón que _invalidarCacheTurnos().
 */
function _invalidarCacheScoreMap() {
  _scoreMapMemo = null;
  try {
    var cache = CacheService.getScriptCache();
    var countStr = cache.get(_SCORE_CACHE_PREFIX + 'COUNT');
    if (countStr) {
      var count = parseInt(countStr, 10);
      var keys = [_SCORE_CACHE_PREFIX + 'COUNT'];
      for (var i = 0; i < count; i++) keys.push(_SCORE_CACHE_PREFIX + i);
      cache.removeAll(keys);
    }
  } catch (e) {
    Logger.log('_invalidarCacheScoreMap: error al eliminar cache (' + e.message + ')');
  }
}

function getTableData() {
  const _tGTD0 = Date.now();
  const ss = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID);
  Logger.log('⏱ SPERF getTableData: _abrirSSCacheado(TARGET) = ' + (Date.now() - _tGTD0) + 'ms');
  const sheet = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  const userEmail = (Session.getActiveUser().getEmail() || "usuario@prueba.com").toLowerCase();
  // Abierto una sola vez y reutilizado en los 3 bloques de abajo que antes hacían
  // su propio SpreadsheetApp.openById(ID_HOJA_REESTUDIOS) (pendientes, histórico,
  // detección de reasignaciones) — cada openById es un viaje de red aparte.
  const ssReest = _abrirSSCacheado(ID_HOJA_REESTUDIOS);
  // dataReestOrigen queda disponible para que cargarPanelAnalista() se lo pase a
  // verificarMisCupos() y evite releer "ORIGEN" completa una segunda vez (ver
  // parámetro datosPrefetch de verificarMisCupos).
  let dataReestOrigen = null;

  if (!sheet) return { tabla: [], stats: { hoy: 0, total: 0 } };

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return { tabla: [], stats: { hoy: 0, total: 0 } };

  const numCols = sheet.getLastColumn();
  Logger.log('⏱ SPERF getTableData: hoja "solicitud" tiene ' + lastRow + ' filas x ' + numCols + ' cols');
  const _tSolRead0 = Date.now();
  const data = sheet.getRange(1, 1, lastRow, numCols).getDisplayValues();
  Logger.log('⏱ SPERF getTableData: lectura completa "solicitud" = ' + (Date.now() - _tSolRead0) + 'ms');
  const headers = data[0];
  const registros = data.slice(1);

  const scoreMaps = _getScoreMapCacheado();
  const mapaScore = scoreMaps.mapaScore;
  const mapaInmobiliaria = scoreMaps.mapaInmobiliaria;
  headers.push("CategoriaScore");
  headers.push("Inmobiliaria"); 

  const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, "dd/MM/yyyy");
  
  let gestionadasHoy = 0;
  let gestionadasTotal = 0;
  const erroresCarga = [];

  // Casos del analista: leer de Historico_Gestiones (nuevos) + solicitud (legados sin migrar)
  const misFilasPendientes = [];

  // Convierte fila de Historico_Gestiones (37 cols) a formato solicitud (37 cols)
  // para que el frontend no necesite saber de la estructura del Historico
  function histToSol(h) {
    const s = new Array(58).fill('');
    for (let i = 0; i <= 21; i++) s[i] = h[i]; // cols 1-22 iguales
    s[23] = h[22]; s[24] = h[23];               // biometría, observaciones
    s[26] = h[24]; s[27] = h[25]; s[28] = h[26]; // fechaAsig, asignacion, fechaFin
    s[30] = h[27]; s[31] = h[28]; s[32] = h[29]; s[33] = h[30]; // Nombre, motivos, fechaGest
    s[35] = h[31]; s[36] = h[32];               // Poliza, Canal
    for (let i = 0; i < 21; i++) s[37 + i] = h[39 + i] || ''; // codeudores: hist col 40-60 → sol col 38-58
    return s;
  }

  function agregarDesdeRegistros(filas, fuente) {
    for (const filaRaw of filas) {
      const fila = fuente === 'HISTORICO' ? histToSol(filaRaw) : filaRaw;
      const asignadoA = String(fila[27]).trim().toLowerCase();
      const fechaFin  = String(fila[28]).trim();
      const fechaAsig = String(fila[26]).trim();
      if (asignadoA !== userEmail) continue;
      if (fechaFin !== "") {
        gestionadasTotal++;
        if (fechaFin.includes(hoyStr)) gestionadasHoy++;
        continue;
      }
      if (fechaAsig === "") continue;
      const poliza  = String(fila[1]).trim();
      const polNorm = poliza.replace(/\D/g, '').replace(/^0+/, '');
      const cat = mapaScore.get(poliza) || mapaScore.get(polNorm) || "";
      const inmo = mapaInmobiliaria.get(poliza) || mapaInmobiliaria.get(polNorm) || "";
      misFilasPendientes.push([...fila, cat, inmo]);
    }
  }

  // Se lee una sola vez y se reutiliza en los bloques 1 y 4 de abajo (Historico_Gestiones
  // principal y de reestudios) — ambos gatean su lectura completa con este mismo valor,
  // así que declararla aquí evita 2 lecturas de PropertiesService y mantiene el mismo
  // valor coherente entre los dos bloques dentro de una sola ejecución.
  const cargaPendienteUsuario = _obtenerCargaPendienteAnalista(userEmail);

  // 1. Historico_Gestiones — casos ya movidos al asignar (nueva lógica)
  // Usa el memo _getHistGestionesPrincipal() para evitar network round-trips
  // redundantes: filtra en memoria por col 25 (email del analista, 0-indexed para col 26).
  // El gate por cargaPendiente va ANTES de leer (no solo antes de procesar) — medido en
  // producción: esta lectura completa cuesta ~2.1s con ~2657 filas (Historico_Gestiones
  // "solo crece y nunca se archiva"), y para un analista con cargaPendiente=0 ese costo
  // no aportaba nada al resultado. Mismo patrón que ya usa correctamente
  // obtenerCasosPendientesAnalista() (más abajo en este archivo).
  try {
    const _tHist0 = Date.now();
    if (cargaPendienteUsuario > 0) {
      const dataHist = _getHistGestionesPrincipal();
      Logger.log('⏱ SPERF getTableData: Historico_Gestiones principal memo (' + dataHist.length + ' filas), cargaPendiente=' + cargaPendienteUsuario);
      if (dataHist.length > 0) {
        // Filtrar filas del analista in-memory (col 26 = idx 25)
        const filasAbiertas = [];
        for (var i = 0; i < dataHist.length; i++) {
          if (String(dataHist[i][25]).trim().toLowerCase() === userEmail) {
            var fechaFin = String(dataHist[i][26]).trim(); // col 27 = idx 26
            if (fechaFin !== '') {
              gestionadasTotal++;
              if (fechaFin.includes(hoyStr)) gestionadasHoy++;
            } else {
              filasAbiertas.push(dataHist[i]);
            }
          }
        }
        Logger.log('⏱ SPERF getTableData: filtro in-memory Hist principal = ' + (Date.now() - _tHist0) + 'ms (' + filasAbiertas.length + ' abiertas)');
        agregarDesdeRegistros(filasAbiertas, 'HISTORICO');
      }
    } else {
      Logger.log('⏱ SPERF getTableData: Historico_Gestiones principal OMITIDA (cargaPendiente=0)');
    }
    Logger.log('⏱ SPERF getTableData: bloque Historico_Gestiones principal completo = ' + (Date.now() - _tHist0) + 'ms');
  } catch(e) {
    Logger.log("getTableData Historico: " + e.message);
    erroresCarga.push("No se pudieron cargar tus casos pendientes del histórico principal.");
  }

  // 2. solicitud — casos legados aún no migrados
  // Filtrado en memoria: los registros de "solicitud" ya están en el arreglo `registros`,
  // no se usa createTextFinder — se filtra por email vía recorrido JavaScript directo.
  agregarDesdeRegistros(registros, 'SOLICITUD');

  // 3. Reestudios: Historico_Gestiones (nueva lógica) + ORIGEN (legados)
  try {
    const hojaReest = ssReest.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (hojaReest) {
      const lastRowR = hojaReest.getLastRow();
      if (lastRowR > 1) {
        Logger.log('⏱ SPERF getTableData: hoja "ORIGEN" (reestudios) tiene ' + (lastRowR - 1) + ' filas');
        const _tOrigenRead0 = Date.now();
        const dataReest = hojaReest.getRange(2, 1, lastRowR - 1, 14).getDisplayValues();
        Logger.log('⏱ SPERF getTableData: lectura completa "ORIGEN" = ' + (Date.now() - _tOrigenRead0) + 'ms');
        dataReestOrigen = dataReest;
        // Filtrado en memoria: los datos de "ORIGEN" ya están en el arreglo `dataReest`,
        // no se usa createTextFinder — se filtra por email vía recorrido JavaScript directo.
        // createTextFinder se conserva SOLO para Historico_Gestiones (crecimiento ilimitado).
        for (let i = 0; i < dataReest.length; i++) {
          const asignado = String(dataReest[i][6]).trim().toLowerCase();
          if (asignado !== userEmail) continue;
          const fechaFinR = String(dataReest[i][9]).trim();
          const fechaAsigR = String(dataReest[i][8]).trim();
          
          if (fechaFinR !== "") {
            if (fechaFinR.includes(hoyStr)) gestionadasHoy++;
            gestionadasTotal++;
            continue;
          }
          if (fechaAsigR === "") continue;

          const tipoProc = String(dataReest[i][4]).trim();
          const claseR = String(dataReest[i][5]).trim();
          let filaAdaptada = new Array(numCols).fill("");
          filaAdaptada[0] = String(dataReest[i][1]).trim();    // solicitud
          filaAdaptada[1] = String(dataReest[i][3]).trim();    // origen como "poliza"
          filaAdaptada[2] = String(dataReest[i][2]).trim();    // linkDrive
          filaAdaptada[3] = String(dataReest[i][3]).trim();    // origen
          filaAdaptada[4] = tipoProc;                          // tipoProceso
          filaAdaptada[5] = claseR;                            // clase
          filaAdaptada[8] = fechaAsigR;                        // fechaAsig (para modal rst)
          filaAdaptada[16] = "__REESTUDIO__";                  // marcador en estadoGeneral (col 16)
          filaAdaptada[17] = String(dataReest[i][0]).trim();   // fechaRadicacion
          filaAdaptada[20] = tipoProc || claseR;               // tipo proceso real
          filaAdaptada[26] = fechaAsigR;                       // fechaAsignacion
          filaAdaptada[27] = asignado;                         // email asignado
          filaAdaptada[28] = "";                               // fechaFin (vacía = pendiente)
          filaAdaptada[30] = String(dataReest[i][7]).trim();   // nombre analista
          filaAdaptada.push("");                                // CategoriaScore
          misFilasPendientes.push(filaAdaptada);
        }
      }
    }
  } catch(e) {
    Logger.log("Error incluyendo reestudios en getTableData: " + e.message);
  }

  // 4. Historico_Gestiones de reestudios (casos movidos al asignar)
  // Usa _getHistGestionesReest() (memo) + filtro in-memory por col 6 (email).
  // Mismo gate por cargaPendiente ANTES de leer que en el bloque principal de arriba.
  try {
    const _tHistR0 = Date.now();
    if (cargaPendienteUsuario > 0) {
      const dataHistReestMemo = _getHistGestionesReest();
      Logger.log('⏱ SPERF getTableData: _getHistGestionesReest() devolvió ' + dataHistReestMemo.length + ' filas');
      for (var iHR = 0; iHR < dataHistReestMemo.length; iHR++) {
        var asignadoHR = String(dataHistReestMemo[iHR][6]).trim().toLowerCase();
        if (asignadoHR !== userEmail) continue;

        var fechaFinHR = String(dataHistReestMemo[iHR][9]).trim();
        if (fechaFinHR !== '') {
          gestionadasTotal++;
          if (fechaFinHR.includes(hoyStr)) gestionadasHoy++;
          continue;
        }

        var fechaAsigHR = String(dataHistReestMemo[iHR][8]).trim();
        if (fechaAsigHR === "") continue;

        var tipoProcHR = String(dataHistReestMemo[iHR][4]).trim();
        var claseHR = String(dataHistReestMemo[iHR][5]).trim();
        let filaAdaptada = new Array(numCols).fill("");
        filaAdaptada[0] = String(dataHistReestMemo[iHR][1]).trim();
        filaAdaptada[1] = String(dataHistReestMemo[iHR][3]).trim();
        filaAdaptada[2] = String(dataHistReestMemo[iHR][2]).trim();
        filaAdaptada[3] = String(dataHistReestMemo[iHR][3]).trim();
        filaAdaptada[4] = tipoProcHR;
        filaAdaptada[5] = claseHR;
        filaAdaptada[8] = fechaAsigHR;
        filaAdaptada[16] = "__REESTUDIO__";
        filaAdaptada[17] = String(dataHistReestMemo[iHR][0]).trim();
        filaAdaptada[20] = tipoProcHR || claseHR;
        filaAdaptada[26] = fechaAsigHR;
        filaAdaptada[27] = asignadoHR;
        filaAdaptada[28] = "";
        filaAdaptada[30] = String(dataHistReestMemo[iHR][7]).trim();
        filaAdaptada.push("");
        misFilasPendientes.push(filaAdaptada);
      }
    } else {
      Logger.log('⏱ SPERF getTableData: Historico_Gestiones reestudios OMITIDA (cargaPendiente=0)');
    }
    Logger.log('⏱ SPERF getTableData: bloque Historico_Gestiones reestudios completo = ' + (Date.now() - _tHistR0) + 'ms');
  } catch(e) {
    Logger.log("Error incluyendo reestudios historico en getTableData: " + e.message);
    erroresCarga.push("No se pudieron cargar tus casos pendientes de reestudios.");
  }

  // Detectar reasignaciones recientes por admin (últimos 30 min)
  // Usa los memos in-memory para filtrar por email y marca "ADMIN:" sin network round-trip.
  var _tReasig0 = Date.now();
  var reasignaciones = [];
  try {
    var ahora = new Date();
    var hace30 = new Date(ahora.getTime() - 30 * 60 * 1000);
    if (cargaPendienteUsuario > 0) {
      // Principal: col 38 (idx 37) — usa memo para filtrar por email (col 25)
      // y marca "ADMIN:" (col 37) en memoria sin network round-trip adicional.
      var dataHistReasig = _getHistGestionesPrincipal();
      for (var ri = 0; ri < dataHistReasig.length; ri++) {
        if (String(dataHistReasig[ri][25]).trim().toLowerCase() !== userEmail) continue;
        var marca = String(dataHistReasig[ri][37] || "").trim();
        if (!marca.startsWith("ADMIN:")) continue;
        var partes = marca.split("|");
        if (partes.length >= 2) {
          var fechaMarca = new Date(partes[1].trim());
          if (!isNaN(fechaMarca.getTime()) && fechaMarca >= hace30) {
            reasignaciones.push({ solicitud: String(dataHistReasig[ri][0]).trim(), admin: partes[0].replace("ADMIN:","") });
          }
        }
      }
      // Reestudios: col 20 (idx 19) — usa _getHistGestionesReest() + filtro in-memory
      var dataHistReestReasig = _getHistGestionesReest();
      for (var iRR = 0; iRR < dataHistReestReasig.length; iRR++) {
        var asigRR = String(dataHistReestReasig[iRR][6]).trim().toLowerCase();
        if (asigRR !== userEmail) continue;
        var marcaR = String(dataHistReestReasig[iRR][19] || "").trim();
        if (!marcaR.startsWith("ADMIN:")) continue;
        var partesR = marcaR.split("|");
        if (partesR.length >= 2) {
          var fechaMarcaR = new Date(partesR[1].trim());
          if (!isNaN(fechaMarcaR.getTime()) && fechaMarcaR >= hace30) {
            reasignaciones.push({ solicitud: String(dataHistReestReasig[iRR][1]).trim(), admin: partesR[0].replace("ADMIN:","") });
          }
        }
      }
    }
  } catch(eR) { Logger.log("Detección reasignación: " + eR.message); }
  Logger.log('⏱ SPERF getTableData: bloque detección reasignaciones = ' + (Date.now() - _tReasig0) + 'ms');

  return {
    tabla: [headers, ...misFilasPendientes],
    stats: {
      hoy: gestionadasHoy,
      total: gestionadasTotal
    },
    reasignaciones: reasignaciones,
    // Filas crudas de "solicitud" (sin header) y de "ORIGEN" ya leídas arriba —
    // getUnifiedTableData() las reenvía para que verificarMisCupos(), llamada
    // justo después desde cargarPanelAnalista(), no vuelva a leer las mismas
    // dos hojas completas por segunda vez en la misma carga de panel.
    _rawSolicitud: registros,
    _rawOrigen: dataReestOrigen,
    error: erroresCarga.length ? erroresCarga.join(' ') : undefined
  };
}

function getHojaPolizas() {
  return SpreadsheetApp.openById(WAREHOUSE_ID).getSheetByName(SHEET_NAME_POLIZAS);
}

function resetProgress() {
  props.deleteProperty(PROP_BLOCK_INDEX);
  props.deleteProperty(PROP_POL_CHUNK_INDEX);
  props.deleteProperty(PROP_POL_COUNT);
  PropertiesService.getUserProperties().deleteProperty('CHECKPOINT_TRACKING');
  PropertiesService.getUserProperties().deleteProperty('CHECKPOINT_NEGADAS_SIMPLE');
}

function getDataUniqueForSolicitud(solicitud) {
  solicitud = (solicitud || '').toString().trim();
  if (!solicitud) return { success: false, message: 'Solicitud vacía' };

  const keyFull = getKeyFull(); 
  const endpointBase = PropertiesService.getScriptProperties().getProperty('endpointSaiNewApi'); 

  if (!endpointBase) {
    return { success: false, message: 'Falta el endpoint en Script Properties.' };
  }

  try {
    const url = endpointBase + solicitud;
    const options = {
      method: 'get',
      muteHttpExceptions: true
    };
    
    if (keyFull) {
      options.headers = { 'x-api-key': keyFull, 'Accept': 'application/json' };
    }

    const response = UrlFetchApp.fetch(url, options);

    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());

      let resultadosPorTipo = { 
        "INQUILINO PRINCIPAL": [], 
        "CODEUDORES": [] 
      };

      resultadosPorTipo["INQUILINO PRINCIPAL"].push({
        nombre: data.tenantName || 'Sin Nombre',
        identificacion: data.evaluatedDocument || '',
        descripcionResultado: data.resultDescription || 'Sin descripción',
        estadoEstudio: data.studyStatus || 'Sin estado' 
      });

      if (data.codebtors && Array.isArray(data.codebtors) && data.codebtors.length > 0) {
        data.codebtors.forEach(c => {
          resultadosPorTipo["CODEUDORES"].push({
            nombre: c.name || 'Codeudor sin nombre',
            identificacion: c.document || '',
            descripcionResultado: c.resultDescription || 'Sin descripción',
            estadoEstudio: c.studyStatus || 'Sin estado' 
          });
        });
      } else {
        delete resultadosPorTipo["CODEUDORES"];
      }

      return { success: true, resultados: resultadosPorTipo };

    } else {
      return { success: false, message: `Error consultando API. Código: ${response.getResponseCode()}` };
    }

  } catch (e) {
    return { success: false, message: "Fallo de conexión al consultar el detalle en tiempo real." };
  }
}

function construirItemHomologado(item, estadoGeneral, mapaTipos) {
  const tipoOriginal = String(item.requestType || "").toUpperCase().trim();
  let claseNormalizada = mapaTipos[tipoOriginal] || tipoOriginal;
  if (estadoGeneral.includes("EN ESTUDIO") && claseNormalizada === "") {
    claseNormalizada = "NUEVA";
  }

  var codeudores = [];
  if (item.codebtors && Array.isArray(item.codebtors)) {
    for (var ci = 0; ci < Math.min(item.codebtors.length, 3); ci++) {
      var c = item.codebtors[ci];
      codeudores.push({
        nombre: c.name || "",
        documento: c.document || "",
        tipoDoc: c.documentType || "",
        email: c.email || "",
        telefono: c.phone || "",
        estado: c.studyStatus || "",
        resultado: c.resultDescription || ""
      });
    }
  }

  return {
    solicitud: item.consecutive,
    poliza: item.policyNumber,
    identificacionInquilino: item.evaluatedDocument || item.holderDocument,
    tipoIdentificacion: item.evaluatedDocumentType || item.holderDocumentType,
    nombreInquilino: item.tenantName,
    correoInquilino: item.tenantEmail,
    telefonoInquilino: item.tenantPhone,
    ingresos: item.income,
    fechaExpedicion: item.expeditionDate,
    canon: item.monthlyRent,
    cuota: item.managementFee,
    direccionInmueble: item.address,
    destinoInmueble: item.propertyUse,
    ciudadInmueble: item.cityName,
    nombreAsesor: item.executiveName,
    correoAsesor: item.advisorEmail,
    estadoGeneral: item.studyStatus,
    fechaRadicacion: item.registrationDate,
    fechaResultado: item.lastResultDate || item.lastMovementDate,
    clase: claseNormalizada,
    digitalUar: "No",
    canal: String(item.channel || "").trim(),
    codeudores: codeudores
  };
}

// Parsea una fecha proveniente de la API SAI (ISO o "dd/MM/yyyy HH:mm:ss") y la
// devuelve como texto normalizado "yyyy-MM-dd HH:mm:ss" (GMT-5), igual al formato
// que ya se guarda en las columnas fechaRadicacion/fechaResultado. Si no se puede
// parsear, devuelve el valor original tal cual (nunca lanza).
function _normalizarFechaApiComoTexto(valorApi) {
  let valor = String(valorApi || "").trim();
  let resultado = valor;
  if (valor && valor !== "En Proceso" && valor !== "null") {
    try {
      let fObj;
      if (valor.includes("/")) {
        const p = valor.split(/[\/\s:]/);
        fObj = new Date(p[2], p[1] - 1, p[0], p[3] || 0, p[4] || 0, p[5] || 0);
      } else {
        fObj = new Date(valor);
      }
      if (!isNaN(fObj.getTime())) {
        resultado = Utilities.formatDate(fObj, "GMT-5", "yyyy-MM-dd HH:mm:ss");
      }
    } catch (e) {
      Logger.log(`Advertencia: No se pudo parsear la fecha ${valor}.`);
    }
  }
  return resultado;
}

// Consulta paginada a SAI para el rango [sIni, sFin] (formato formatDateCustom),
// clasificando en una sola pasada por página: solicitudes nuevas, biometrías pendientes
// nuevas, finalizadas (RECHAZADO/APROBADO/CODEUDORES_REQUERIDOS) y en espera de
// codeudor. Extraída el 2026-07-13 de actualizarSolicitudesNuevasAPI para poder
// reutilizarse también en sincronizarHistoricoSAI (backfill rotativo hacia atrás,
// ver esa función para el porqué). `etiquetaLog` identifica en los logs cuál de las
// dos llamó, ya que ambas pueden estar corriendo en la misma franja horaria.
function _sincronizarVentanaSAI(sIni, sFin, etiquetaLog) {
  const props = PropertiesService.getScriptProperties();
  const keyFull = getKeyFull();
  const endpointBase = props.getProperty('endPointSaiNewApiDate');

  if (!keyFull || !endpointBase) {
    Logger.log(`❌ [${etiquetaLog}] Faltan credenciales o endpointBase en PropertiesService.`);
    return;
  }

  let paginaActual = 1;
  let totalPaginas = 1;

  const ESTADOS_EXCLUIR = new Set(["RECHAZADO", "APROBADO","CODEUDORES_REQUERIDOS"]);
  const TIPOS_EXCLUIR   = new Set(["AC", "AV"]);

  // Configurable por admin (admin_getConfigSincronizacionSAI/admin_setConfigSincronizacionSAI,
  // Admin.js): si se omite el INGRESO de solicitudes BORRADOR/EN_ESTUDIO a `solicitud`. A
  // propósito NO se fusiona con ESTADOS_EXCLUIR — ese set también alimenta idsFinalizadas
  // (líneas más abajo), que dispara eliminarSolicitudesFinalizadas() y borraría filas ya
  // asignadas/en cola solo por seguir en ese estado. Este set solo bloquea la inserción de
  // casos nuevos, nunca borra nada. Default "incluir" (true) para no cambiar el
  // comportamiento histórico al desplegar.
  const ESTADOS_OMITIR_INGRESO = new Set();
  if (props.getProperty('SAI_INCLUIR_BORRADOR') === 'false') ESTADOS_OMITIR_INGRESO.add('BORRADOR');
  if (props.getProperty('SAI_INCLUIR_EN_ESTUDIO') === 'false') ESTADOS_OMITIR_INGRESO.add('EN_ESTUDIO');

  Logger.log(`[${etiquetaLog}] Rango de consulta: Desde ${sIni} hasta ${sFin}`);

  const solicitudesHomologadas = [];
  const biometriasPendientesNuevas = [];
  const idsFinalizadas = new Set();
  const solicitudesCodeudorPendiente = [];
  const mapaTipos = {
    "TS":  "NUEVA",
    "AD": "ADICIONAL",
    "RSD": "REESTUDIO",
    "RE":  "REESTUDIO",
    "RC":  "REESTUDIO",
    "AV":  "REESTUDIO",
    "IND": "INDUCCION"
  };

  try {
    do {
      const url = `${endpointBase}?startDate=${sIni}&endDate=${sFin}&page=${paginaActual}&size=200`;
      Logger.log(`[${etiquetaLog}] [Petición ${paginaActual}] Consultando endpoint`);

      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: {
          'x-api-key': keyFull,
          'Accept': 'application/json'
        },
        muteHttpExceptions: true
      });

      const code = response.getResponseCode();
      if (code === 200) {
        const json = JSON.parse(response.getContentText());
        totalPaginas = json.totalPages || 1;
        const contenido = json.content || [];

        Logger.log(`[${etiquetaLog}] Página ${paginaActual} de ${totalPaginas} descargada exitosamente. Registros: ${contenido.length}`);

        let guardadosEnPagina = 0;

        contenido.forEach(item => {
          let esUar = (item.uar === true || String(item.uar).toLowerCase() === "true");
          if (esUar) {
            return;
          }

          const estadoGeneral = String(item.studyStatus || "").toUpperCase().trim();
          const tipoSolicitud = String(item.requestType || "").toUpperCase().trim();
          const rc = String(item.resultCode || "").trim();

          const estadoExcluido = ESTADOS_EXCLUIR.has(estadoGeneral);
          const tipoExcluido   = TIPOS_EXCLUIR.has(tipoSolicitud);

          if (ESTADOS_EXCLUIR.has(estadoGeneral)) {
            const solId = String(item.consecutive || "").trim();
            if (solId) idsFinalizadas.add(solId);
            if (solId && estadoGeneral === "CODEUDORES_REQUERIDOS") {
              solicitudesCodeudorPendiente.push({
                solicitud: solId,
                fechaRadicacion: item.registrationDate || "",
                item: construirItemHomologado(item, estadoGeneral, mapaTipos)
              });
            }
          }

          if (estadoGeneral === "APROBADO_PENDIENTE_BIOMETRIA") {
            // Bucket de biometría (antes era la consulta separada _capturarNuevasBiometrias):
            // mismos 3 filtros que tenía esa función, homologación con _homologarDatosApi
            // (no construirItemHomologado — trae resultCode de cada codeudor, que
            // _guardarLoteBiometriaPendiente necesita para elegir destinatarios de WhatsApp).
            if (_esResultCodeBiometriaPendiente(rc) && String(item.mainResultCode) === "2" && !tipoExcluido) {
              biometriasPendientesNuevas.push(_homologarDatosApi(item));
            }
            return;
          }

          if (rc === "501") {
            return;
          }

          if (String(item.mainResultCode) === "2" && !estadoExcluido && !tipoExcluido && !ESTADOS_OMITIR_INGRESO.has(estadoGeneral)) {
            solicitudesHomologadas.push(construirItemHomologado(item, estadoGeneral, mapaTipos));
            guardadosEnPagina++;
          }
        });

        Logger.log(`[${etiquetaLog}] Registros extraídos: ${guardadosEnPagina}`);
        paginaActual++;

        if (paginaActual <= totalPaginas) {
          Utilities.sleep(2000);
        }

      } else {
        const errorDetail = response.getContentText();
        Logger.log(`[${etiquetaLog}] FALLO CRÍTICO en página ${paginaActual}. Código HTTP: ${code}. Detalle: ${errorDetail}`);
        throw new Error(`La API falló con código ${code}: ${errorDetail}`);
      }

    } while (paginaActual <= totalPaginas);

  } catch (e) {
    Logger.log(`❌ [${etiquetaLog}] Ejecución cancelada: ` + e.message);
    return;
  }

  if (solicitudesHomologadas.length > 0) {
    Logger.log(`[${etiquetaLog}] Ejecutando guardado final: ${solicitudesHomologadas.length} solicitudes válidas encontradas.`);
    procesarYGuardarLote(solicitudesHomologadas);
    Logger.log(`[${etiquetaLog}] Proceso completado exitosamente.`);
  } else {
    Logger.log(`[${etiquetaLog}] Proceso finalizado. No hay solicitudes útiles en este periodo.`);
  }

  if (idsFinalizadas.size > 0) {
    eliminarSolicitudesFinalizadas(idsFinalizadas);
  }

  if (solicitudesCodeudorPendiente.length > 0) {
    moverAListaEsperaCodeudor(solicitudesCodeudorPendiente);
  }

  if (biometriasPendientesNuevas.length > 0) {
    Logger.log(`[${etiquetaLog}] ${biometriasPendientesNuevas.length} biometrías pendientes nuevas encontradas en esta misma pasada.`);
    _guardarLoteBiometriaPendiente(biometriasPendientesNuevas);
  }
}

// Trigger cada 5-10 min, 24/7. Cubre "lo recién radicado": últimos 3 días. ÚNICA
// consulta paginada por rango de fechas contra SAI para todo el flujo de "solicitudes
// nuevas": antes había una segunda consulta idéntica en Biometria.js
// (_capturarNuevasBiometrias, fusionada aquí el 2026-07-13) que paginaba el mismo
// endpoint/rango solo para quedarse con el subconjunto complementario
// (APROBADO_PENDIENTE_BIOMETRIA). Ahora se clasifica todo en una sola pasada por página.
// NOTA: esta ventana de 3 días solo detecta cambios de estado (p.ej. a
// CODEUDORES_REQUERIDOS) que ocurren dentro de los primeros 3 días desde la radicación
// — una solicitud radicada hace más de 3 días que cambia de estado después nunca entra
// por aquí. Para eso existe sincronizarHistoricoSAI() (ver abajo).
function actualizarSolicitudesNuevasAPI() {
  Logger.log("Iniciando ejecución");
  const hoy = new Date();
  const fechaInicio = new Date();
  fechaInicio.setDate(hoy.getDate() - 3);
  _sincronizarVentanaSAI(formatDateCustom(fechaInicio), formatDateCustom(hoy), "SYNC-RECIENTE");
}

// SUSPENDIDA (2026-07-14): esta función se creó para resolver un problema real (ver
// caso 12171019, jul-2026: radicada semanas atrás, cambió a CODEUDORES_REQUERIDOS
// después de que su ventana de "recién radicada" de 3 días ya había cerrado, y como
// actualizarSolicitudesNuevasAPI solo mira los últimos 3 días, nunca se detectó — quedó
// invisible para todo el sistema). Pero comparte las mismas reglas de inclusión que el
// sync normal de 3 días (misma _sincronizarVentanaSAI) — y como "EN_ESTUDIO" no está
// excluido, cualquier solicitud vieja (semanas/meses atrás) que sigue en EN_ESTUDIO sin
// ningún cambio real vuelve a insertarse en "solicitud" como si fuera nueva, generando
// fricción para los analistas (casos confirmados: 12139082, 12138904, 12139026 — ninguno
// había cambiado de estado, solo seguían con documentación pendiente desde mayo). Hasta
// que se diseñe una forma de distinguir "cambio real detectado tarde" de "sigue exactamente
// igual, solo se está mirando más atrás", se deja suspendida y el sistema vuelve a
// depender solo de la ventana de 3 días de actualizarSolicitudesNuevasAPI() — con el
// riesgo conocido de que un cambio de estado más allá de esos 3 días puede volver a
// quedar invisible (como pasó con la 12171019) hasta que esto se retome.
const DIAS_POR_TANDA_BACKFILL_SAI = 3;
const VENTANA_MAXIMA_BACKFILL_SAI_DIAS = 90;
function sincronizarHistoricoSAI() {
  Logger.log("sincronizarHistoricoSAI SUSPENDIDA (2026-07-14) — reinsertaba solicitudes viejas sin cambios reales (solo EN_ESTUDIO) en la cola, generando fricción. Ver comentario en el código para retomarla.");
  return;
}

function eliminarSolicitudesFinalizadas(idsAEliminar) {
  let idsEliminadosConfirmados = new Set();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log("❌ Lock no disponible para limpiar finalizadas: " + e.message);
    return;
  }

  try {
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
    if (!hoja) return;

    const lastRow = hoja.getLastRow();
    if (lastRow < 2) return;

    // Ancho dinámico (no fijo a 58): la columna 59 (BG) guarda el flag REASIGNADA
    // (ver desasignarSolicitud en Admin.js y su lectura en MotorAsignacion.js) — un
    // ancho fijo de 58 la deja fuera del recorte/reescritura de abajo y esa columna
    // queda con el valor viejo de esa posición de fila tras el corrimiento,
    // desalineando REASIGNADA entre solicitudes.
    const numCols = hoja.getLastColumn();
    const datos = hoja.getRange(2, 1, lastRow - 1, numCols).getValues();
    // También descarta filas ya completamente vacías (row[0]==="") — un hueco
    // interno deja una fila sin ningún dato (ni siquiera el ID de solicitud),
    // y como idsAEliminar solo contiene IDs reales, ese hueco pasaba el filtro
    // sin cambios y quedaba ahí para siempre, inflando getLastRow() en cada
    // lectura futura de "solicitud" (mismo patrón que Historico_Gestiones
    // "solo crece y nunca se archiva", pero por huecos en vez de crecimiento).
    idsEliminadosConfirmados = new Set(
      datos
        .map(function(row) { return String(row[0]).trim(); })
        .filter(function(id) { return id && idsAEliminar.has(id); })
    );
    const filasFinales = datos.filter(row => {
      const id = String(row[0]).trim();
      return id !== '' && !idsAEliminar.has(id);
    });
    const eliminadas = datos.length - filasFinales.length;

    // Recorte en bloque en vez de deleteRow() por fila: con backlogs grandes, cientos de
    // deleteRow() secuenciales son lentos y mantienen el ScriptLock ocupado más tiempo del
    // necesario, bloqueando a otros procesos (p.ej. guardarGestionBiometria()) que esperan
    // el mismo lock global — mismo problema ya corregido en _archivarColaBiometriaVencida()
    // y limpiarBiometriasResueltas(). En su lugar se reescribe toda la hoja de una sola vez,
    // conservando el orden de las filas que quedan.
    if (eliminadas > 0) {
      hoja.getRange(2, 1, datos.length, numCols).clearContent();
      if (filasFinales.length > 0) {
        hoja.getRange(2, 1, filasFinales.length, numCols).setValues(filasFinales);
      }
      SpreadsheetApp.flush();
      Logger.log(`🧹 ${eliminadas} solicitudes finalizadas eliminadas de la hoja (APROBADO/RECHAZADO/CODEUDORES_REQUERIDOS).`);
    }
  } catch (err) {
    Logger.log("❌ Error eliminando solicitudes finalizadas: " + err.message);
  } finally {
    lock.releaseLock();
  }

  // Se sincronizan únicamente los IDs retirados realmente de solicitud en este recorte.
  if (idsEliminadosConfirmados && idsEliminadosConfirmados.size > 0) {
    var sincronizacionFinalizadas = actualizarFaseBiometriaPendienteDeferred(idsEliminadosConfirmados, "RESUELTA_EN_COLA");
    if (!sincronizacionFinalizadas.success || sincronizacionFinalizadas.actualizadasIds.length !== idsEliminadosConfirmados.size) {
      Logger.log("⚠ eliminarSolicitudesFinalizadas: fase RESUELTA_EN_COLA incompleta. " + JSON.stringify(sincronizacionFinalizadas));
    }
  }
}

// Archiva CODEUDORES_REQUERIDOS antes de borrarlas, para poder revisarlas luego aunque queden fuera de la ventana de fechas de la API.
function moverAListaEsperaCodeudor(lista) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log("❌ Lock no disponible para escribir en pendiente_codeudor: " + e.message);
    return;
  }

  try {
    const ss = SpreadsheetApp.openById(ID_SHEET_GESTION_DIRECTA);
    let hoja = ss.getSheetByName(NOMBRE_HOJA_PENDIENTE_CODEUDOR);
    if (!hoja) {
      hoja = ss.insertSheet(NOMBRE_HOJA_PENDIENTE_CODEUDOR);
      hoja.appendRow(["Solicitud", "FechaRadicacion", "FechaDeteccion", "UltimaVerificacion", "DatosJSON"]);
    }

    const existentes = getSetDeIds(hoja);
    const ahora = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss");
    const filas = [];

    lista.forEach(entry => {
      if (existentes.has(entry.solicitud)) return;
      filas.push([entry.solicitud, entry.fechaRadicacion || "", ahora, ahora, JSON.stringify(entry.item)]);
    });

    if (filas.length > 0) {
      const rowInicio = hoja.getLastRow() + 1;
      hoja.getRange(rowInicio, 1, filas.length, 5).setValues(filas);
      SpreadsheetApp.flush();
      Logger.log(`✅ ${filas.length} solicitudes movidas a pendiente_codeudor.`);
    }
  } catch (err) {
    Logger.log("❌ Error escribiendo en pendiente_codeudor: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

// Mismo respaldo que MAX_CANDIDATOS_POR_CORTE/TIEMPO_MAXIMO_CONSULTAS_CORTE_MS en
// Biometria.js: sin tope, un backlog grande de consultas SAI (una por fila pendiente) puede
// superar el límite de ejecución de Apps Script y la corrida se corta sin haber escrito
// nada. Más relevante aún porque sincronizarHistoricoSAI() está suspendida — esta es una de
// las pocas vías que le quedan a los casos que cambian de estado tarde.
const MAX_CANDIDATOS_CODEUDOR = 500;
const TIEMPO_MAXIMO_CODEUDOR_MS = 20 * 60 * 1000;

// Trigger periódico (independiente del sync de 10 min): purga expiradas (>3 meses) y reactiva las que ya salieron de CODEUDORES_REQUERIDOS.
function revisarEnEsperaCodeudor() {
  const keyFull = getKeyFull();
  const endpointBase = PropertiesService.getScriptProperties().getProperty('endpointSaiNewApi');
  if (!keyFull || !endpointBase) {
    Logger.log("❌ revisarEnEsperaCodeudor: faltan credenciales.");
    return;
  }

  const ss = SpreadsheetApp.openById(ID_SHEET_GESTION_DIRECTA);
  const hoja = ss.getSheetByName(NOMBRE_HOJA_PENDIENTE_CODEUDOR);
  if (!hoja || hoja.getLastRow() < 2) return;

  const lastRow = hoja.getLastRow();
  const datos = hoja.getRange(2, 1, lastRow - 1, 5).getValues();
  const ahora = new Date();
  const TRES_MESES_MS = 90 * 24 * 60 * 60 * 1000;
  const filasAEliminar = [];
  const actualizacionesFecha = [];
  let reactivadas = [];
  let reactivadasBiometria = [];

  // === FASE 1: consultar SAI para cada solicitud pendiente. Sin candado tomado —
  // esto puede tardar varios segundos y no debe bloquear a los analistas mientras tanto. ===
  const totalPendientesCodeudor = datos.length;
  const limiteFilasCodeudor = Math.min(datos.length, MAX_CANDIDATOS_CODEUDOR);
  const inicioMsCodeudor = Date.now();
  if (totalPendientesCodeudor > limiteFilasCodeudor) {
    Logger.log(`📋 ${totalPendientesCodeudor} solicitudes en pendiente_codeudor; verificando hasta ${limiteFilasCodeudor} en esta corrida (las demás quedan para la próxima).`);
  }
  let dejadasPorTiempoCodeudor = 0;
  let expiradasCodeudor = 0;
  let httpErrorCodeudor = 0;
  let excepcionesCodeudor = 0;
  let siguenRequeridoCodeudor = 0;
  for (let i = 0; i < limiteFilasCodeudor; i++) {
    if (Date.now() - inicioMsCodeudor > TIEMPO_MAXIMO_CODEUDOR_MS) {
      dejadasPorTiempoCodeudor = limiteFilasCodeudor - i;
      Logger.log(`⏱️ Tope de tiempo alcanzado en revisarEnEsperaCodeudor, se dejan ${dejadasPorTiempoCodeudor} para la próxima corrida.`);
      break;
    }
    const solicitud = String(datos[i][0]).trim();
    if (!solicitud) continue;

    const fechaRadicacion = new Date(datos[i][1]);
    if (!isNaN(fechaRadicacion.getTime()) && (ahora - fechaRadicacion) > TRES_MESES_MS) {
      filasAEliminar.push(i);
      expiradasCodeudor++;
      Logger.log(`🧹 Solicitud ${solicitud} expiró en pendiente_codeudor (>3 meses de radicación).`);
      continue;
    }

    try {
      const response = UrlFetchApp.fetch(endpointBase + solicitud, {
        method: 'get',
        headers: { 'x-api-key': keyFull, 'Accept': 'application/json' },
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        httpErrorCodeudor++;
        Logger.log(`⚠️ HTTP ${response.getResponseCode()} verificando solicitud ${solicitud} en pendiente_codeudor.`);
        continue;
      }

      const data = JSON.parse(response.getContentText());
      const estado = String(data.studyStatus || "").toUpperCase().trim();

      if (estado === "CODEUDORES_REQUERIDOS") {
        actualizacionesFecha.push({ fila: i + 2, valor: Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd HH:mm:ss") });
        siguenRequeridoCodeudor++;
        continue;
      }

      if (estado === "RECHAZADO" || estado === "APROBADO") {
        filasAEliminar.push(i);
        continue;
      }

      let item;
      try {
        item = JSON.parse(datos[i][4]);
      } catch (eParse) {
        item = {};
      }
      item.estadoGeneral = data.studyStatus;
      item.resultCode = String(data.resultCode || "").trim();
      item.codeudores = (data.codebtors || []).slice(0, 3).map(c => ({
        nombre: c.name || "",
        documento: c.document || "",
        tipoDoc: c.documentType || "",
        email: c.email || "",
        telefono: c.phone || "",
        estado: c.studyStatus || "",
        resultado: c.resultDescription || "",
        resultCode: String(c.resultCode || "").trim()
      }));

      // Si salió de CODEUDORES_REQUERIDOS directo a pendiente de biometría, debe seguir
      // el mismo camino que cualquier otra biometría (WA + cortes 8am/12pm), no entrar
      // directo a la cola de llamada saltándose ese control. Pero solo si resultCode
      // confirma que hay alguien pendiente de verdad (500/503) — si no, a pendiente_biometria
      // no debe llegar y se descarta (no es biometría real pendiente).
      if (estado === "APROBADO_PENDIENTE_BIOMETRIA" && _esResultCodeBiometriaPendiente(item.resultCode)) {
        reactivadasBiometria.push(item);
      } else if (estado === "APROBADO_PENDIENTE_BIOMETRIA") {
        Logger.log("ℹ️ Solicitud " + solicitud + " tiene estado APROBADO_PENDIENTE_BIOMETRIA pero resultCode " + item.resultCode + " — no es biometría real, se descarta.");
      } else {
        reactivadas.push(item);
      }
      filasAEliminar.push(i);

    } catch (e) {
      excepcionesCodeudor++;
      Logger.log(`❌ Error verificando solicitud ${solicitud} en pendiente_codeudor: ${e.message}`);
    }
  }

  Logger.log(`📊 revisarEnEsperaCodeudor completado: ${expiradasCodeudor} expiradas, ${siguenRequeridoCodeudor} siguen requiriendo codeudor, `
    + `${reactivadas.length} para reactivar en Solicitudes, ${reactivadasBiometria.length} para reactivar en biometría, `
    + `${httpErrorCodeudor} con error HTTP, ${excepcionesCodeudor} con excepción`
    + (dejadasPorTiempoCodeudor > 0 ? `, ${dejadasPorTiempoCodeudor} dejadas por tope de tiempo` : '')
    + (totalPendientesCodeudor > limiteFilasCodeudor ? ` (quedan ${totalPendientesCodeudor - limiteFilasCodeudor} más allá del tope de ${MAX_CANDIDATOS_CODEUDOR})` : '') + '.');

  // === FASE 2: aplicar los cambios a la hoja. Ya no hay llamadas HTTP de por medio,
  // así que el candado dura milisegundos en vez de minutos. ===
  if (actualizacionesFecha.length > 0 || filasAEliminar.length > 0) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      Logger.log("❌ Lock no disponible para actualizar pendiente_codeudor: " + e.message);
      return;
    }
    try {
      actualizacionesFecha.forEach(function(u) { hoja.getRange(u.fila, 4).setValue(u.valor); });
      for (let i = filasAEliminar.length - 1; i >= 0; i--) {
        hoja.deleteRow(filasAEliminar[i] + 2);
      }
      SpreadsheetApp.flush();
    } catch (err) {
      Logger.log("❌ Error en revisarEnEsperaCodeudor (escritura): " + err.message);
    } finally {
      lock.releaseLock();
    }
  }

  // Las filas correspondientes en pendiente_codeudor ya se borraron arriba, así que si
  // alguno de estos dos guardados falla, esos casos se pierden de ambas hojas salvo por
  // este log. Se manejan en try/catch independientes para que una falla en uno no le
  // impida al otro guardar los casos que sí le corresponden (son listas independientes).
  if (reactivadas.length > 0) {
    try {
      procesarYGuardarLote(reactivadas);
      Logger.log(`✅ ${reactivadas.length} solicitudes reactivadas desde pendiente_codeudor hacia Solicitudes.`);
    } catch (e) {
      const ids = reactivadas.map(it => it.solicitud).join(", ");
      Logger.log(`❌ Error guardando ${reactivadas.length} reactivadas en Solicitudes: ${e.message}. IDs a recuperar manualmente: ${ids}`);
    }
  }

  if (reactivadasBiometria.length > 0) {
    try {
      _guardarLoteBiometriaPendiente(reactivadasBiometria);
      Logger.log(`✅ ${reactivadasBiometria.length} solicitudes reactivadas desde pendiente_codeudor hacia pendiente_biometria.`);
    } catch (e) {
      const ids = reactivadasBiometria.map(it => it.solicitud).join(", ");
      Logger.log(`❌ Error guardando ${reactivadasBiometria.length} reactivadas en pendiente_biometria: ${e.message}. IDs a recuperar manualmente: ${ids}`);
    }
  }
}

// DIAGNÓSTICO MANUAL, SOLO LECTURA — correr desde el editor pasando un consecutivo,
// p.ej. diagnosticarSolicitudCodeudor('12171019'), o usar el wrapper de abajo. No
// modifica ninguna hoja. Busca la solicitud en las 4 ubicaciones relevantes al flujo
// de codeudor (pendiente_codeudor, solicitud, Historico_Gestiones principal y de
// reestudios) y consulta su estado real y actual en SAI, para entender en qué punto
// exacto se quedó atascada. Borrar esta función (y su wrapper de test) cuando ya no
// haga falta — es una herramienta puntual de investigación, no parte del flujo normal.
function diagnosticarSolicitudCodeudorTest() {
  diagnosticarSolicitudCodeudor('12171019');
}

function diagnosticarSolicitudCodeudor(consecutivo) {
  var id = String(consecutivo).trim();
  Logger.log("=== DIAGNÓSTICO solicitud " + id + " ===");

  // 1. ¿Está en pendiente_codeudor (esperando que se resuelva el tema del codeudor)?
  try {
    var ssGestion = SpreadsheetApp.openById(ID_SHEET_GESTION_DIRECTA);
    var hojaCodeudor = ssGestion.getSheetByName(NOMBRE_HOJA_PENDIENTE_CODEUDOR);
    if (!hojaCodeudor || hojaCodeudor.getLastRow() < 2) {
      Logger.log("1) pendiente_codeudor: hoja vacía o no encontrada.");
    } else {
      var matchCodeudor = hojaCodeudor.getRange(2, 1, hojaCodeudor.getLastRow() - 1, 1)
        .createTextFinder(id).matchEntireCell(true).findNext();
      if (matchCodeudor) {
        var filaCodeudor = hojaCodeudor.getRange(matchCodeudor.getRow(), 1, 1, 5).getValues()[0];
        Logger.log("1) ✅ SÍ está en pendiente_codeudor — fila " + matchCodeudor.getRow() + ":");
        Logger.log("   FechaRadicacion=" + filaCodeudor[1] + " | FechaDeteccion=" + filaCodeudor[2] + " | UltimaVerificacion=" + filaCodeudor[3]);
        Logger.log("   DatosJSON guardados: " + String(filaCodeudor[4]).substring(0, 300));
      } else {
        Logger.log("1) pendiente_codeudor: NO está ahí.");
      }
    }
  } catch (e) {
    Logger.log("1) ❌ Error revisando pendiente_codeudor: " + e.message);
  }

  // 2. ¿Está en la hoja "solicitud" (cola normal, pendiente de asignar)?
  try {
    var ssSol = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    var hojaSol = ssSol.getSheetByName(SHEET_NAME_SOLICITUDES);
    if (!hojaSol || hojaSol.getLastRow() < 2) {
      Logger.log("2) solicitud: hoja vacía o no encontrada.");
    } else {
      var matchSol = hojaSol.getRange(2, 1, hojaSol.getLastRow() - 1, 1)
        .createTextFinder(id).matchEntireCell(true).findNext();
      if (matchSol) {
        var filaSol = hojaSol.getRange(matchSol.getRow(), 1, 1, 28).getValues()[0];
        Logger.log("2) ✅ SÍ está en 'solicitud' — fila " + matchSol.getRow() + " | estado=" + filaSol[16] + " | asignado=" + (filaSol[27] || "(sin asignar)"));
      } else {
        Logger.log("2) solicitud: NO está ahí.");
      }
    }
  } catch (e) {
    Logger.log("2) ❌ Error revisando 'solicitud': " + e.message);
  }

  // 3. ¿Ya se gestionó (Historico_Gestiones principal)?
  try {
    var hojaHistP = ssSol.getSheetByName("Historico_Gestiones");
    if (!hojaHistP || hojaHistP.getLastRow() < 2) {
      Logger.log("3) Historico_Gestiones (principal): hoja vacía o no encontrada.");
    } else {
      var matchHistP = hojaHistP.getRange(2, 1, hojaHistP.getLastRow() - 1, 1)
        .createTextFinder(id).matchEntireCell(true).findNext();
      if (matchHistP) {
        var filaHistP = hojaHistP.getRange(matchHistP.getRow(), 1, 1, 27).getValues()[0];
        Logger.log("3) ✅ SÍ está en Historico_Gestiones (principal) — fila " + matchHistP.getRow() + " | estado=" + filaHistP[16] + " | analista=" + filaHistP[25] + " | fechaFin=" + (filaHistP[26] || "(en gestión, sin cerrar)"));
      } else {
        Logger.log("3) Historico_Gestiones (principal): NO está ahí.");
      }
    }
  } catch (e) {
    Logger.log("3) ❌ Error revisando Historico_Gestiones principal: " + e.message);
  }

  // 4. ¿Ya se gestionó como reestudio/UAR (Historico_Gestiones de reestudios)?
  try {
    var ssReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    var hojaHistR = ssReest.getSheetByName("Historico_Gestiones");
    if (!hojaHistR || hojaHistR.getLastRow() < 2) {
      Logger.log("4) Historico_Gestiones (reestudios): hoja vacía o no encontrada.");
    } else {
      var matchHistR = hojaHistR.getRange(2, 2, hojaHistR.getLastRow() - 1, 1)
        .createTextFinder(id).matchEntireCell(true).findNext();
      if (matchHistR) {
        var filaHistR = hojaHistR.getRange(matchHistR.getRow(), 1, 1, 11).getValues()[0];
        Logger.log("4) ✅ SÍ está en Historico_Gestiones (reestudios) — fila " + matchHistR.getRow() + " | analista=" + filaHistR[6] + " | estadoGestion=" + (filaHistR[10] || "(en gestión, sin cerrar)"));
      } else {
        Logger.log("4) Historico_Gestiones (reestudios): NO está ahí.");
      }
    }
  } catch (e) {
    Logger.log("4) ❌ Error revisando Historico_Gestiones de reestudios: " + e.message);
  }

  // 5. Estado REAL y ACTUAL según SAI ahora mismo.
  try {
    var datosApi = _consultarSaiIndividual(id);
    if (!datosApi) {
      Logger.log("5) ❌ SAI no respondió (o la solicitud no existe para SAI).");
    } else {
      Logger.log("5) Estado actual en SAI: studyStatus=" + datosApi.studyStatus + " | resultCode=" + datosApi.resultCode + " | mainResultCode=" + datosApi.mainResultCode + " | lastMovementDate=" + datosApi.lastMovementDate + " | lastResultDate=" + datosApi.lastResultDate);
      Logger.log("   Descripción del inquilino: " + (datosApi.resultDescription || "(sin descripción)"));
      if (datosApi.codebtors && datosApi.codebtors.length > 0) {
        datosApi.codebtors.forEach(function(c, idx) {
          Logger.log("   Codeudor " + (idx + 1) + ": " + c.name + " | studyStatus=" + c.studyStatus + " | resultCode=" + c.resultCode + " | descripción=" + (c.resultDescription || "(sin descripción)"));
        });
      } else {
        Logger.log("   Sin codeudores en la respuesta de SAI.");
      }
      Logger.log("5b) Respuesta cruda completa de SAI:");
      Logger.log(JSON.stringify(datosApi, null, 2));
    }
  } catch (e) {
    Logger.log("5) ❌ Error consultando SAI: " + e.message);
  }

  Logger.log("=== FIN DIAGNÓSTICO " + id + " ===");
}

// RECUPERACIÓN MANUAL PUNTUAL — correr desde el editor pasando un consecutivo, p.ej.
// recuperarSolicitudCodeudorManual('12171019'), o usar el wrapper de abajo. Consulta
// SAI en tiempo real; si la solicitud sigue en CODEUDORES_REQUERIDOS, la mueve a
// pendiente_codeudor (mismo camino que si actualizarSolicitudesNuevasAPI la hubiera
// capturado a tiempo) para que revisarEnEsperaCodeudor() la retome en su próxima
// corrida horaria. Si SAI ya no la tiene en ese estado, no hace nada — hay que
// investigar manualmente por qué quedó fuera. Es para recuperar casos puntuales ya
// identificados como perdidos; sincronizarHistoricoSAI() es la que evita que esto
// vuelva a pasar hacia adelante.
function recuperarSolicitudCodeudorManualTest() {
  recuperarSolicitudCodeudorManual('12171019');
}

function recuperarSolicitudCodeudorManual(consecutivo) {
  var id = String(consecutivo).trim();
  var datosApi = _consultarSaiIndividual(id);
  if (!datosApi) {
    Logger.log("❌ SAI no respondió para " + id + " — no se puede recuperar.");
    return;
  }

  var estadoGeneral = String(datosApi.studyStatus || "").toUpperCase().trim();
  if (estadoGeneral !== "CODEUDORES_REQUERIDOS") {
    Logger.log("ℹ️ " + id + " ya NO está en CODEUDORES_REQUERIDOS (estado actual: " + estadoGeneral + "). No se movió a pendiente_codeudor — si debería estar en otro lado, revisa manualmente.");
    return;
  }

  var mapaTipos = {
    "TS": "NUEVA", "AD": "ADICIONAL", "RSD": "REESTUDIO", "RE": "REESTUDIO", "RC": "REESTUDIO", "AV": "REESTUDIO", "IND": "INDUCCION"
  };
  moverAListaEsperaCodeudor([{
    solicitud: id,
    fechaRadicacion: datosApi.registrationDate || "",
    item: construirItemHomologado(datosApi, estadoGeneral, mapaTipos)
  }]);
  Logger.log("✅ " + id + " movida a pendiente_codeudor. revisarEnEsperaCodeudor() la revisará en su próxima corrida horaria.");
}

function formatDateCustom(date) {
  const year = date.getFullYear();
  const month = ("0" + (date.getMonth() + 1)).slice(-2);
  const day = ("0" + date.getDate()).slice(-2);
  return `${year}${month}${day}`;
}


/**
 * Inserta solicitudes nuevas en la cola y reporta el destino real de cada ID.
 * @param {Array<Object>} listaObjetos solicitudes a persistir en "solicitud".
 * @returns {{idsInsertados: string[], idsYaEnSolicitud: string[], idsYaEnHistorico: string[], idsInvalidos: string[]}}
 */
function procesarYGuardarLote(listaObjetos) {
  const resultado = {
    idsInsertados: [],
    idsYaEnSolicitud: [],
    idsYaEnHistorico: [],
    idsInvalidos: []
  };

  if (!listaObjetos || listaObjetos.length === 0) {
    Logger.log("No hay objetos para guardar en este lote.");
    return resultado;
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log("❌ Error de concurrencia: Otro proceso está escribiendo. Abortando para no dañar datos.");
    throw new Error("Lock no disponible: " + e.message);
  }

  try {
    const ssP = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hojaP = ssP.getSheetByName(SHEET_NAME_SOLICITUDES);
    if (!hojaP) throw new Error(`La hoja ${SHEET_NAME_SOLICITUDES} no existe.`);

    const setIdsP = getSetDeIds(hojaP);
    if (!setIdsP) throw new Error("Fallo al obtener los IDs existentes de la base de datos.");
    const setIdsHistRecientes = _getIdsRecientesHistorico(ssP);
    const filasParaInsertar = [];

    listaObjetos.forEach(function(item) {
      const solId = String(item.solicitud || "").trim();
      if (!solId) {
        resultado.idsInvalidos.push(solId);
        return;
      }
      if (setIdsP.has(solId)) {
        resultado.idsYaEnSolicitud.push(solId);
        return;
      }
      if (setIdsHistRecientes.has(solId)) {
        resultado.idsYaEnHistorico.push(solId);
        return;
      }

      const est = String(item.estadoGeneral || "").toUpperCase();
      const fila = new Array(58).fill("");
      fila[0] = solId;
      fila[1] = item.poliza || item._polizaAsociada || "";
      fila[2] = item.identificacionInquilino || "";
      fila[3] = item.tipoIdentificacion || "";
      fila[4] = item.nombreInquilino || "";
      fila[5] = item.correoInquilino || "";
      fila[6] = item.telefonoInquilino || "";
      fila[7] = item.ingresos ?? "";
      fila[8] = item.fechaExpedicion || "";
      fila[9] = item.canon ?? "";
      fila[10] = item.cuota ?? "";
      fila[11] = item.direccionInmueble || "";
      fila[12] = item.destinoInmueble || "";
      fila[13] = item.ciudadInmueble || "";
      fila[14] = item.nombreAsesor || "";
      fila[15] = item.correoAsesor || "";
      fila[16] = est;
      fila[20] = item.clase || "";
      fila[21] = item.digitalUar ?? "";
      fila[36] = item.canal || "";

      if (item.codeudores && item.codeudores.length > 0) {
        for (var ci = 0; ci < Math.min(item.codeudores.length, 3); ci++) {
          var base = 37 + (ci * 7);
          var cod = item.codeudores[ci];
          fila[base] = cod.nombre || "";
          fila[base + 1] = cod.documento || "";
          fila[base + 2] = cod.tipoDoc || "";
          fila[base + 3] = cod.email || "";
          fila[base + 4] = cod.telefono || "";
          fila[base + 5] = cod.estado || "";
          fila[base + 6] = cod.resultado || "";
        }
      }

      [item.fechaRadicacion, item.fechaResultado].forEach(function(fecha, indice) {
        fila[17 + indice] = _normalizarFechaApiComoTexto(fecha);
      });

      filasParaInsertar.push(fila);
      resultado.idsInsertados.push(solId);
      setIdsP.add(solId);
    });

    if (filasParaInsertar.length > 0) {
      const rowInicio = hojaP.getLastRow() + 1;
      const rangoDestino = hojaP.getRange(rowInicio, 1, filasParaInsertar.length, 58);
      rangoDestino.setNumberFormat("@");
      rangoDestino.setValues(filasParaInsertar);
      SpreadsheetApp.flush();
    }

    Logger.log(
      "✅ Cola procesada: " + resultado.idsInsertados.length + " insertadas, "
      + resultado.idsYaEnSolicitud.length + " ya presentes, "
      + resultado.idsYaEnHistorico.length + " ya asignadas, "
      + resultado.idsInvalidos.length + " inválidas."
    );
    return resultado;
  } catch (err) {
    Logger.log("❌ ERROR CRÍTICO ESCRIBIENDO EN EXCEL: " + err.message);
    throw err;
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function getSetDeIds(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Set();
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  return new Set(values.flat().map(String).map(s => s.trim()));
}

// Últimas N filas de Historico_Gestiones (columna de solicitudId). Las asignaciones más
// recientes siempre quedan al final por el appendRow() de _asignarCasoPrincipal, así que
// no hace falta leer la hoja completa (que solo crece y nunca se archiva) para saber qué
// se asignó/cerró recientemente — un solo getRange acotado basta. N=5000 es un margen
// generoso sobre el volumen real de asignaciones en la ventana de 3 días de
// _sincronizarVentanaSAI; si el volumen diario creciera muchísimo, subir este número.
function _getIdsRecientesHistorico(ss) {
  const hoja = ss.getSheetByName("Historico_Gestiones");
  if (!hoja) return new Set();
  const lastRow = hoja.getLastRow();
  if (lastRow < 2) return new Set();
  const N = 5000;
  const filaInicio = Math.max(2, lastRow - N + 1);
  const values = hoja.getRange(filaInicio, 1, lastRow - filaInicio + 1, 1).getValues();
  return new Set(values.flat().map(String).map(s => s.trim()));
}

// ===================================================================
// GUARDADO OMNICANAL DE GESTIONES (VISTA PRINCIPAL)
// ===================================================================

// ===================================================================
// GUARDADO OMNICANAL DE GESTIONES (VISTA PRINCIPAL)
// ===================================================================

// Garantía Req 8: este endpoint NO adquiere ScriptLock ni usa funciones del motor de asignación
// (_contarYRecolectarPrincipal, _contarYRecolectarReestudios, _leerBloqueCasosAbiertos).
function guardarCambiosInternos(data) {
  if (!data || !data.solicitudId) {
    return { success: false, message: "ID de solicitud no proporcionado." };
  }

  const estado_q = String(data.estado_q || "").toUpperCase();
  let motivo_aplazamiento = (data.motivo_aplazamiento || "").trim();
  let motivo_negacion = (data.motivo_negacion || "").trim();

  // Validación de motivos
  if (estado_q.includes("APLAZ")) {
    motivo_negacion = "";
    if (!motivo_aplazamiento) return { success: false, message: "El motivo de aplazamiento es obligatorio." };
  } 
  else if (estado_q.includes("NEGAD") || estado_q.includes("RECHAZ")) {
    motivo_aplazamiento = "";
    if (!motivo_negacion) return { success: false, message: "El motivo de negación es obligatorio." };
  } 
  else {
    motivo_aplazamiento = ""; motivo_negacion = "";
  }

  let disparaAsignacion = false;
  let usuarioActual = (Session.getActiveUser().getEmail() || "Email No Detectado").toLowerCase();
  let mensajeAdicional = "";

  try {
    const ssOrigen = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID);

    const ssReestudios = _abrirSSCacheado(
      PropertiesService.getScriptProperties().getProperty('ID_HOJA_REESTUDIOS') || ID_HOJA_REESTUDIOS
    );

    const ahora = new Date();
    const fechaSoloDia = Utilities.formatDate(ahora, "GMT-5", 'dd/MM/yyyy');

    const esEstadoCierre = estado_q.includes("APROB") || estado_q.includes("NEGAD") || estado_q.includes("RECHAZ");
    disparaAsignacion = esEstadoCierre || estado_q.includes("APLAZ");

    const idBuscado = String(data.solicitudId).trim();

    // 1. Buscar en Historico_Gestiones
    // Antes leía las 27 primeras columnas de toda la hoja para ubicar el ID.
    // Ahora usa TextFinder acotado a la columna del ID (A) — mucho más rápido
    // en una hoja que solo crece.
    const hojaHistorico = ssOrigen.getSheetByName("Historico_Gestiones");
    let targetRow = -1;

    // Los reestudios viven en ssReestudios, no en el warehouse — saltar RUTA A
    if (data.tipoSolicitudActual !== 'reestudio' && hojaHistorico && hojaHistorico.getLastRow() > 1) {
      const lastRowH = hojaHistorico.getLastRow();
      const colIdHist = hojaHistorico.getRange(2, 1, lastRowH - 1, 1);
      const matchesIdHist = colIdHist.createTextFinder(idBuscado).matchEntireCell(true).findAll();
      for (let i = 0; i < matchesIdHist.length; i++) {
        const rowIdHist = matchesIdHist[i].getRow();
        const fechaFin = String(hojaHistorico.getRange(rowIdHist, 27).getDisplayValue()).trim();
        if (fechaFin === '') {
          targetRow = rowIdHist;
          break;
        }
      }
    }

    if (targetRow !== -1) {
      // 🟢 RUTA A: SOLICITUD DE LA BASE PRINCIPAL (Historico_Gestiones)
      //
      // NOTA DE CONCURRENCIA (2026-07-21): esta escritura ya NO usa ScriptLock.
      // Antes se tomaba el candado global desde la búsqueda de la fila hasta el
      // final del guardado, así que con varios analistas guardando a la vez cada
      // uno hacía cola detrás de TODOS los demás (y detrás de RequestLeadUnificado,
      // biometría, admin...), aunque cada uno estuviera editando una fila distinta.
      // ScriptLock es del script completo, no de una fila ni de una hoja — no existe
      // un candado "solo para esta fila". Cada solicitud vive en su propia fila y
      // Sheets resuelve sin problema escrituras concurrentes a filas distintas, así
      // que ya no hace falta serializar esto. Antes de escribir se revalida que la
      // fila localizada arriba siga correspondiendo a este solicitudId (mismo patrón
      // que ya usan _procesarCortePendientes/corregirBiometriasDuplicadasEnCola en
      // Biometria.js): un admin puede haber desasignado/reasignado el caso y movido
      // filas (deleteRow) justo entre la búsqueda de arriba y este punto.
      const idEnFila = String(hojaHistorico.getRange(targetRow, 1).getDisplayValue()).trim();
      if (idEnFila !== idBuscado) {
        const reubicado = hojaHistorico.getRange(2, 1, hojaHistorico.getLastRow() - 1, 1)
          .createTextFinder(idBuscado).matchEntireCell(true).findNext();
        if (!reubicado) {
          return { success: false, message: "La solicitud cambió de estado mientras guardabas. Actualiza la página e intenta de nuevo." };
        }
        targetRow = reubicado.getRow();
      }

      const filaBase        = hojaHistorico.getRange(targetRow, 1, 1, 37).getValues()[0];
      const fechaAsignacion = filaBase[24]; // col 25
      const emailAnalista   = String(filaBase[25] || usuarioActual).toLowerCase().trim(); // col 26
      let valorClaseActual  = filaBase[20]; // col 21

      if (data.tipoSolicitudActual === 'desaplazamiento') valorClaseActual = 'BIOMETRIA';
      else if (data.tipoSolicitudActual === 'induccion') valorClaseActual = 'INDUCCION';
      else if (data.tipoSolicitudActual === 'nuevaUar') valorClaseActual = 'NUEVA_UAR';
      else if (data.tipoSolicitudActual === 'deudorUar') valorClaseActual = 'DEUDOR_UAR';
      else if (data.tipoSolicitudActual === 'biometriaFallida') valorClaseActual = 'BIOMETRIA_FALLIDA';

      const tAsiParsed = _parseFechaGAS(fechaAsignacion);

      let tRadCola;
      if (data.tipoSolicitudActual === 'desaplazamiento' || data.tipoSolicitudActual === 'induccion') {
        tRadCola = tAsiParsed;
      } else {
        tRadCola = _parseFechaGAS(data.fecha_radicacion_sai);
      }

      Logger.log('[guardarCambios] tipo=' + data.tipoSolicitudActual + ' | fechaAsig raw=' + fechaAsignacion + ' | parsed=' + tAsiParsed + ' | tRadCola=' + tRadCola + ' | email=' + emailAnalista);
      const tiempos = calcularTiemposCaso(
        tRadCola,
        tAsiParsed,
        ahora,
        emailAnalista
      );
      Logger.log('[guardarCambios] tiempos=' + JSON.stringify(tiempos));

      hojaHistorico.getRange(targetRow, 17).setValue(estado_q);
      hojaHistorico.getRange(targetRow, 21).setValue(valorClaseActual);
      hojaHistorico.getRange(targetRow, 23).setValue(data.biometria || '');
      hojaHistorico.getRange(targetRow, 24).setValue(data.comentarios_gestion || '');
      hojaHistorico.getRange(targetRow, 27).setValue(ahora).setNumberFormat("dd/mm/yyyy HH:mm:ss");
      hojaHistorico.getRange(targetRow, 29, 1, 2).setValues([[motivo_aplazamiento, motivo_negacion]]);
      hojaHistorico.getRange(targetRow, 31).setValue(fechaSoloDia);

      const fechaDiligenciada = (data.tipoSolicitudActual === 'desaplazamiento' || data.tipoSolicitudActual === 'induccion')
        ? (tAsiParsed || '')
        : (data.fecha_radicacion_sai || '');
      hojaHistorico.getRange(targetRow, 34).setValue(fechaDiligenciada);
      if (fechaDiligenciada instanceof Date) hojaHistorico.getRange(targetRow, 34).setNumberFormat("dd/MM/yyyy HH:mm:ss");
      hojaHistorico.getRange(targetRow, 35, 1, 3).setValues([[tiempos.minutos_cola, tiempos.minutos_gestion, tiempos.minutos_general]]);
      hojaHistorico.getRange(targetRow, 35, 1, 3).setNumberFormat("0.00");
      SpreadsheetApp.flush();

      _cerrarConteoConLockCorto(emailAnalista, (data.tipoSolicitudActual || 'digital'), fechaAsignacion);

    } else {
      // 🔵 RUTA B: REESTUDIO — buscar en Historico_Gestiones de ssReestudios
      const hojaHistoricoR = ssReestudios.getSheetByName("Historico_Gestiones");
      let targetRowReest = -1;

      if (hojaHistoricoR && hojaHistoricoR.getLastRow() > 1) {
        const lastRowHR = hojaHistoricoR.getLastRow();
        const colIdHR = hojaHistoricoR.getRange(2, 2, lastRowHR - 1, 1);
        const matchesIdHR = colIdHR.createTextFinder(idBuscado).matchEntireCell(true).findAll();
        for (let i = 0; i < matchesIdHR.length; i++) {
          const rowIdHR = matchesIdHR[i].getRow();
          const fechaFin = String(hojaHistoricoR.getRange(rowIdHR, 10).getDisplayValue()).trim();
          if (fechaFin === '') {
            targetRowReest = rowIdHR;
            break;
          }
        }
      }

      if (targetRowReest === -1) {
        return { success: false, message: `Solicitud ${data.solicitudId} no encontrada en ninguna base central.` };
      }

      // Misma revalidación que en la Ruta A — ver nota de concurrencia arriba.
      const idEnFilaR = String(hojaHistoricoR.getRange(targetRowReest, 2).getDisplayValue()).trim();
      if (idEnFilaR !== idBuscado) {
        const reubicadoR = hojaHistoricoR.getRange(2, 2, hojaHistoricoR.getLastRow() - 1, 1)
          .createTextFinder(idBuscado).matchEntireCell(true).findNext();
        if (!reubicadoR) {
          return { success: false, message: "La solicitud cambió de estado mientras guardabas. Actualiza la página e intenta de nuevo." };
        }
        targetRowReest = reubicadoR.getRow();
      }

      const filaReest      = hojaHistoricoR.getRange(targetRowReest, 1, 1, 18).getValues()[0];
      const fechaRadR      = filaReest[0];
      const fechaAsiR      = filaReest[8];
      const emailAnalistaR = String(filaReest[6] || usuarioActual).toLowerCase().trim();

      const tRadColaR = _parseFechaGAS(data.fecha_radicacion_sai) || _parseFechaGAS(fechaRadR);
      const tiemposR = calcularTiemposCaso(
        tRadColaR,
        _parseFechaGAS(fechaAsiR),
        ahora,
        emailAnalistaR
      );

      hojaHistoricoR.getRange(targetRowReest, 10, 1, 9).setValues([[
        ahora, estado_q, motivo_aplazamiento, motivo_negacion,
        data.comentarios_gestion || '',
        tiemposR.minutos_cola, tiemposR.minutos_gestion, tiemposR.minutos_general,
        data.poliza || ''
      ]]);
      hojaHistoricoR.getRange(targetRowReest, 10).setNumberFormat("dd/mm/yyyy HH:mm:ss");
      hojaHistoricoR.getRange(targetRowReest, 15, 1, 3).setNumberFormat("0.00");

      var origenNormR = String(filaReest[3]).toUpperCase().trim();
      var tipoPNormR = String(filaReest[4]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
      var tipoCierreR = _derivarTipoReestudio(origenNormR, tipoPNormR) || 'reestudio';
      SpreadsheetApp.flush();

      _cerrarConteoConLockCorto(emailAnalistaR, tipoCierreR, fechaAsiR);
    }

    if (estado_q.includes("APLAZ")) {
      mensajeAdicional = " (La solicitud queda cerrada para tu gestión y guardada en el sistema).";
    }

  } catch (e) {
    return { success: false, message: 'Error de servidor: ' + e.message };
  }

  return {
    success: true,
    message: "Gestión guardada exitosamente" + mensajeAdicional,
    usuario: usuarioActual,
    disparaAsignacion: disparaAsignacion
  };
}

// Única parte de guardarCambiosInternos() que toca estado realmente compartido
// entre TODOS los analistas: los contadores de cupo diario / carga pendiente en
// PropertiesService (lectura-modificación-escritura de un solo blob JSON, que sí
// necesita serializarse o se pierden incrementos). Se aísla en su propio candado,
// corto y exclusivo de esto, para que la escritura de la fila (ya hecha sin lock,
// arriba) no arrastre a nadie en una cola global. Si el candado no se consigue, no
// se hace fallar el guardado del analista — su gestión ya quedó escrita en la hoja
// — solo se pierde el ajuste del contador, que trigger_recalcularContadores() (Admin.js)
// corrige en el recálculo nocturno; el mismo colchón que ya existe para cuando un
// admin borra filas directamente y descuadra estos contadores.
function _cerrarConteoConLockCorto(email, tipo, fechaAsignacionOriginal) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    Logger.log("⚠️ No se pudo actualizar el contador de cupo de " + email + " (" + tipo + "): " + e.message + ". Se encola para el próximo cierre exitoso (o el recálculo nocturno).");
    _encolarAjustePendiente(email, tipo, fechaAsignacionOriginal);
    return;
  }
  try {
    // Antes de aplicar ESTE cierre, drena cualquier ajuste que se haya quedado pendiente
    // de un cierre anterior que no consiguió el candado — mismo candado, así que queda
    // serializado con el resto de la actividad.
    _drenarAjustesPendientesContador();
    _registrarCierreContador(email, tipo, fechaAsignacionOriginal);
  } finally {
    lock.releaseLock();
  }
}

// MIGRACIÓN ÚNICA — correr manualmente una sola vez desde el editor de Apps Script.
// Normaliza filas históricas de Historico_Gestiones que quedaron con el vocabulario
// femenino (APROBADA/APLAZADA/NEGADA/RECHAZADA) de antes de unificar con el vocabulario
// masculino de SAI (APROBADO/APLAZADO/RECHAZADO). No toca la hoja "solicitud" (cola):
// esa hoja solo contiene casos aún no gestionados, por lo que nunca tiene vocabulario viejo.
function migrarVocabularioEstadoHistorico() {
  const MAPA = { 'APROBADA': 'APROBADO', 'APLAZADA': 'APLAZADO', 'NEGADA': 'RECHAZADO', 'RECHAZADA': 'RECHAZADO' };

  function normalizarColumna(hoja, col) {
    const lastRow = hoja.getLastRow();
    if (lastRow < 2) return 0;
    const rango = hoja.getRange(2, col, lastRow - 1, 1);
    const valores = rango.getValues();
    let cambios = 0;
    const nuevos = valores.map(function(fila) {
      const actual = String(fila[0] || '').trim().toUpperCase();
      const nuevo = MAPA[actual];
      if (nuevo && nuevo !== fila[0]) { cambios++; return [nuevo]; }
      return [fila[0]];
    });
    if (cambios > 0) rango.setValues(nuevos);
    return cambios;
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) {
    Logger.log('❌ Lock no disponible para migrar: ' + e.message);
    return;
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const TARGET_SS_ID = props.getProperty('TARGET_SOLICITUDES_SS_ID') || TARGET_SOLICITUDES_SS_ID;
    const REEST_SS_ID  = props.getProperty('ID_HOJA_REESTUDIOS') || ID_HOJA_REESTUDIOS;

    const hojaPrincipal = SpreadsheetApp.openById(TARGET_SS_ID).getSheetByName('Historico_Gestiones');
    const totalPrincipal = hojaPrincipal ? normalizarColumna(hojaPrincipal, 17) : 0;
    SpreadsheetApp.flush();

    const hojaReest = SpreadsheetApp.openById(REEST_SS_ID).getSheetByName('Historico_Gestiones');
    const totalReestudios = hojaReest ? normalizarColumna(hojaReest, 11) : 0;
    SpreadsheetApp.flush();

    Logger.log('✅ Migración de vocabulario completa. Principal: ' + totalPrincipal + ' filas corregidas. Reestudios: ' + totalReestudios + ' filas corregidas.');
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

// ===================================================================
// CASOS PENDIENTES DE VALIDACIÓN / EVIDENTE — RE-GESTIÓN
// ===================================================================

function obtenerFilaCasoPendiente(solicitudId, tipoHoja) {
  const props     = PropertiesService.getScriptProperties();
  const TARGET_SS_ID = props.getProperty('TARGET_SOLICITUDES_SS_ID') || TARGET_SOLICITUDES_SS_ID;
  const REEST_SS_ID  = props.getProperty('ID_HOJA_REESTUDIOS') || ID_HOJA_REESTUDIOS;
  const ESTADOS_PEND = ['PENDIENTE VALIDACIÓN', 'PENDIENTE EVIDENTE'];
  const solId = String(solicitudId).trim();

  if (tipoHoja === 'DIGITAL') {
    const hoja = SpreadsheetApp.openById(TARGET_SS_ID).getSheetByName('Historico_Gestiones');
    if (!hoja || hoja.getLastRow() < 2) return null;
    const ncols = Math.max(60, hoja.getLastColumn());
    const data  = hoja.getRange(2, 1, hoja.getLastRow() - 1, ncols).getDisplayValues();
    for (let i = 0; i < data.length; i++) {
      const h = data[i];
      if (String(h[0]).trim() !== solId) continue;
      if (!ESTADOS_PEND.includes(String(h[16]).trim().toUpperCase())) continue;
      // Mismo mapeo que histToSol en getUnifiedTableData
      const s = new Array(58).fill('');
      for (let j = 0; j <= 21; j++) s[j] = h[j];
      s[23] = h[22]; s[24] = h[23];
      s[26] = h[24]; s[27] = h[25]; s[28] = h[26];
      s[30] = h[27]; s[31] = h[28]; s[32] = h[29]; s[33] = h[30];
      s[35] = h[31]; s[36] = h[32];
      for (let j = 0; j < 21; j++) s[37 + j] = h[39 + j] !== undefined ? h[39 + j] : '';
      s.push(''); // CategoriaScore placeholder
      return s;
    }
  } else {
    const hojaR = SpreadsheetApp.openById(REEST_SS_ID).getSheetByName('Historico_Gestiones');
    if (!hojaR || hojaR.getLastRow() < 2) return null;
    const data = hojaR.getRange(2, 1, hojaR.getLastRow() - 1, 18).getDisplayValues();
    for (let i = 0; i < data.length; i++) {
      const fila = data[i];
      if (String(fila[1]).trim() !== solId) continue;
      if (!ESTADOS_PEND.includes(String(fila[10]).trim().toUpperCase())) continue;
      const tipoProc = String(fila[4]).trim();
      const claseR   = String(fila[5]).trim();
      const fechaAsi = String(fila[8]).trim();
      const asignado = String(fila[6]).trim();
      const filaAd   = new Array(37).fill('');
      filaAd[0]  = String(fila[1]).trim();
      filaAd[2]  = String(fila[2]).trim();
      filaAd[3]  = String(fila[3]).trim();
      filaAd[4]  = tipoProc;
      filaAd[5]  = claseR;
      filaAd[8]  = fechaAsi;
      filaAd[16] = '__REESTUDIO__';
      filaAd[17] = String(fila[0]).trim();
      filaAd[20] = tipoProc || claseR;
      filaAd[26] = fechaAsi;
      filaAd[27] = asignado;
      filaAd[28] = '';
      filaAd[30] = String(fila[7]).trim();
      filaAd.push('');
      return filaAd;
    }
  }
  return null;
}

function obtenerCasosPendientesAnalista() {
  const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  const ESTADOS_PEND = ['PENDIENTE VALIDACIÓN', 'PENDIENTE EVIDENTE'];
  const props = PropertiesService.getScriptProperties();
  const TARGET_SS_ID = props.getProperty('TARGET_SOLICITUDES_SS_ID') || TARGET_SOLICITUDES_SS_ID;
  const REEST_SS_ID  = props.getProperty('ID_HOJA_REESTUDIOS') || ID_HOJA_REESTUDIOS;
  const resultado = [];

  // Mismo guard que getTableData (Código.js): si el contador incremental de carga
  // pendiente dice 0, el analista no tiene nada abierto en ningún lado y no vale la pena
  // escanear ninguna de las dos hojas de Historico_Gestiones.
  if (_obtenerCargaPendienteAnalista(userEmail) === 0) return resultado;

  // Digital: Historico_Gestiones principal — filtro in-memory sobre memo cacheado
  // (reemplaza TextFinder en col 26 por _getHistGestionesPrincipal + filtro en memoria)
  try {
    const _tPend1_0 = Date.now();
    const dataHist = _getHistGestionesPrincipal();
    Logger.log('⏱ SPERF obtenerCasosPendientesAnalista: Historico_Gestiones principal tiene ' + dataHist.length + ' filas (memo)');
    if (dataHist.length > 0) {
      const filasCandidatas = [];
      for (var i = 0; i < dataHist.length; i++) {
        var asignado = String(dataHist[i][25]).trim().toLowerCase();
        var estadoQ = String(dataHist[i][16]).trim().toUpperCase();
        if (asignado === userEmail && ESTADOS_PEND.includes(estadoQ)) {
          filasCandidatas.push({ fila: i + 2, valores: dataHist[i] });
        }
      }
      Logger.log('⏱ SPERF obtenerCasosPendientesAnalista: bloque digital = ' + (Date.now() - _tPend1_0) + 'ms (' + filasCandidatas.length + ' candidatas)');
      for (let m = 0; m < filasCandidatas.length; m++) {
        const h = filasCandidatas[m].valores;
        const estadoQ = String(h[16]).trim().toUpperCase(); // col 17 = estado_q
        // Mapeo histToSol para que poblarModalDig reciba la fila en formato correcto
        const s = new Array(58).fill('');
        for (let j = 0; j <= 21; j++) s[j] = h[j];
        s[23] = h[22]; s[24] = h[23];
        s[26] = h[24]; s[27] = h[25]; s[28] = h[26];
        s[30] = h[27]; s[31] = h[28]; s[32] = h[29]; s[33] = h[30];
        s[35] = h[31]; s[36] = h[32];
        for (let j = 0; j < 21; j++) s[37 + j] = h[39 + j] !== undefined ? h[39 + j] : '';
        s.push('');
        resultado.push({
          solicitudId:        String(h[0]).trim(),
          nombreInquilino:    String(h[4]).trim(),
          canon:              String(h[9]).trim(),
          clase:              String(h[20]).trim(),
          estadoQ:            estadoQ,
          fechaGestion:       String(h[26]).trim(),
          tipoHoja:           'DIGITAL',
          filaCompleta:       s
        });
      }
    }
  } catch(e) { Logger.log('obtenerCasosPendientes digital: ' + e.message); }

  // Reestudio: Historico_Gestiones de la hoja de reestudios — filtro in-memory
  // sobre el memo cacheado (elimina TextFinder / network round-trip redundante).
  try {
    const _tPend2_0 = Date.now();
    const dataReest = _getHistGestionesReest();
    Logger.log('⏱ SPERF obtenerCasosPendientesAnalista: Historico_Gestiones reestudios tiene ' + dataReest.length + ' filas (memo)');
    if (dataReest.length > 0) {
      const filasCandidatasR = [];
      for (var i = 0; i < dataReest.length; i++) {
        var asignado = String(dataReest[i][6]).trim().toLowerCase();
        var estadoQ  = String(dataReest[i][10]).trim().toUpperCase();
        if (asignado === userEmail && ESTADOS_PEND.includes(estadoQ)) {
          filasCandidatasR.push({ fila: i + 2, valores: dataReest[i] });
        }
      }
      Logger.log('⏱ SPERF obtenerCasosPendientesAnalista: bloque reestudio = ' + (Date.now() - _tPend2_0) + 'ms (' + filasCandidatasR.length + ' candidatas)');
      for (let m = 0; m < filasCandidatasR.length; m++) {
        const fila    = filasCandidatasR[m].valores;
        const estadoQ = String(fila[10]).trim().toUpperCase(); // col 11
        const tipoProc = String(fila[4]).trim();
        const claseR   = String(fila[5]).trim();
        const fechaAsi = String(fila[8]).trim();
        const filaAd   = new Array(37).fill('');
        filaAd[0]  = String(fila[1]).trim();
        filaAd[2]  = String(fila[2]).trim();
        filaAd[3]  = String(fila[3]).trim();
        filaAd[4]  = tipoProc;
        filaAd[5]  = claseR;
        filaAd[8]  = fechaAsi;
        filaAd[16] = '__REESTUDIO__';
        filaAd[17] = String(fila[0]).trim();
        filaAd[20] = tipoProc || claseR;
        filaAd[26] = fechaAsi;
        filaAd[27] = String(fila[6]).trim();
        filaAd[28] = '';
        filaAd[30] = String(fila[7]).trim();
        filaAd.push('');
        resultado.push({
          solicitudId:        String(fila[1]).trim(),
          nombreInquilino:    '',
          canon:              '',
          clase:              tipoProc || claseR,
          estadoQ:            estadoQ,
          fechaGestion:       String(fila[9]).trim(),
          tipoHoja:           'REESTUDIO',
          filaCompleta:       filaAd
        });
      }
    }
  } catch(e) { Logger.log('obtenerCasosPendientes reestudio: ' + e.message); }

  return resultado;
}

function regestionarCasoPendiente(data) {
  if (!data || !data.solicitudId) return { success: false, message: 'ID no proporcionado.' };

  const ESTADOS_PEND = ['PENDIENTE VALIDACIÓN', 'PENDIENTE EVIDENTE'];
  const estado_q = String(data.estado_q || '').trim().toUpperCase();
  let motivo_aplazamiento = (data.motivo_aplazamiento || '').trim();
  let motivo_negacion     = (data.motivo_negacion || '').trim();

  if (estado_q.includes('APLAZ')) {
    motivo_negacion = '';
    if (!motivo_aplazamiento) return { success: false, message: 'El motivo de aplazamiento es obligatorio.' };
  } else if (estado_q.includes('NEGAD') || estado_q.includes('RECHAZ')) {
    motivo_aplazamiento = '';
    if (!motivo_negacion) return { success: false, message: 'El motivo de negación es obligatorio.' };
  } else {
    motivo_aplazamiento = ''; motivo_negacion = '';
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch(e) { return { success: false, message: 'Sistema ocupado. Intenta de nuevo.' }; }

  const props      = PropertiesService.getScriptProperties();
  const TARGET_SS_ID = props.getProperty('TARGET_SOLICITUDES_SS_ID') || TARGET_SOLICITUDES_SS_ID;
  const REEST_SS_ID  = props.getProperty('ID_HOJA_REESTUDIOS') || ID_HOJA_REESTUDIOS;

  try {
    const ahora    = new Date();
    const solId    = String(data.solicitudId).trim();
    const tipoHoja = String(data.tipoHoja || 'DIGITAL');
    const esFinal  = !estado_q.includes('PENDIENTE');

    if (tipoHoja === 'DIGITAL') {
      const hoja = SpreadsheetApp.openById(TARGET_SS_ID).getSheetByName('Historico_Gestiones');
      if (!hoja) return { success: false, message: 'Hoja no encontrada.' };

      const dataH = hoja.getRange(2, 1, hoja.getLastRow() - 1, 17).getValues();
      let targetRow = -1;
      for (let i = 0; i < dataH.length; i++) {
        if (String(dataH[i][0]).trim() === solId && ESTADOS_PEND.includes(String(dataH[i][16]).trim().toUpperCase())) {
          targetRow = i + 2; break;
        }
      }
      if (targetRow === -1) return { success: false, message: 'Caso no encontrado en estado pendiente.' };

      hoja.getRange(targetRow, 17).setValue(estado_q);
      hoja.getRange(targetRow, 29, 1, 2).setValues([[motivo_aplazamiento, motivo_negacion]]);
      if (esFinal) hoja.getRange(targetRow, 27).setValue(ahora).setNumberFormat('dd/mm/yyyy HH:mm:ss');
      SpreadsheetApp.flush();

    } else {
      const hojaR = SpreadsheetApp.openById(REEST_SS_ID).getSheetByName('Historico_Gestiones');
      if (!hojaR) return { success: false, message: 'Hoja de reestudios no encontrada.' };

      const dataHR = hojaR.getRange(2, 1, hojaR.getLastRow() - 1, 11).getValues();
      let targetRowR = -1;
      for (let i = 0; i < dataHR.length; i++) {
        if (String(dataHR[i][1]).trim() === solId && ESTADOS_PEND.includes(String(dataHR[i][10]).trim().toUpperCase())) {
          targetRowR = i + 2; break;
        }
      }
      if (targetRowR === -1) return { success: false, message: 'Caso no encontrado en estado pendiente.' };

      hojaR.getRange(targetRowR, 11).setValue(estado_q);
      hojaR.getRange(targetRowR, 12).setValue(motivo_aplazamiento);
      hojaR.getRange(targetRowR, 13).setValue(motivo_negacion);
      if (esFinal) hojaR.getRange(targetRowR, 10).setValue(ahora).setNumberFormat('dd/mm/yyyy HH:mm:ss');
      SpreadsheetApp.flush();
    }

    return { success: true, message: 'Re-gestión guardada exitosamente.' };

  } catch(e) {
    return { success: false, message: 'Error: ' + e.message };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function getEmailUsuario() {
  return Session.getActiveUser().getEmail();
}

function getResumenGestionesHoy() {
  const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  const hoy = Utilities.formatDate(new Date(), "GMT-5", "dd/MM/yyyy");
  const resultado = [];

  // Digital — Historico_Gestiones del warehouse
  try {
    const hojaHist = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID)
                       .getSheetByName("Historico_Gestiones");
    if (hojaHist && hojaHist.getLastRow() > 1) {
      const data = hojaHist.getRange(2, 1, hojaHist.getLastRow() - 1, 30).getValues();
      for (let i = 0; i < data.length; i++) {
        const analista = String(data[i][25]).toLowerCase().trim(); // col 26
        if (analista !== userEmail) continue;
        const fechaFin = data[i][26]; // col 27
        if (!(fechaFin instanceof Date)) continue;
        if (Utilities.formatDate(fechaFin, "GMT-5", "dd/MM/yyyy") !== hoy) continue;
        resultado.push({
          solicitud: String(data[i][0]),
          estado:    String(data[i][16]),
          motivo:    String(data[i][28] || data[i][29] || ''),
          hora:      Utilities.formatDate(fechaFin, "GMT-5", "HH:mm")
        });
      }
    }
  } catch(e) {}

  // Reestudios — Historico_Gestiones de ssReestudios
  try {
    const hojaHistR = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS)
                        .getSheetByName("Historico_Gestiones");
    if (hojaHistR && hojaHistR.getLastRow() > 1) {
      const data = hojaHistR.getRange(2, 1, hojaHistR.getLastRow() - 1, 13).getValues();
      for (let i = 0; i < data.length; i++) {
        const analista = String(data[i][6]).toLowerCase().trim(); // col G
        if (analista !== userEmail) continue;
        const fechaFin = data[i][9]; // col J
        if (!(fechaFin instanceof Date)) continue;
        if (Utilities.formatDate(fechaFin, "GMT-5", "dd/MM/yyyy") !== hoy) continue;
        resultado.push({
          solicitud: String(data[i][1]),
          estado:    String(data[i][10]),
          motivo:    String(data[i][11] || data[i][12] || ''),
          hora:      Utilities.formatDate(fechaFin, "GMT-5", "HH:mm")
        });
      }
    }
  } catch(e) {}

  resultado.sort((a, b) => b.hora.localeCompare(a.hora));
  return resultado;
}

/**
 * Verifica si el analista está dentro de su turno activo.
 * Si no tiene turno configurado, no bloquea (graceful).
 * Respeta Horas_Extra para extender el fin de turno.
 * @param {string} userEmail - email del analista (minúsculas)
 * @param {Spreadsheet} ss - instancia ya abierta de TARGET_SOLICITUDES_SS_ID
 * @returns {{ ok: boolean, message?: string }}
 */
// Memoización de verificarTurnoActivo por ejecución: en activarYAsignar()
// se llama 2 veces (una en actualizarEstadoPropio, otra en RequestLeadUnificado)
// con el mismo email y el mismo minuto — no tiene sentido releer las hojas de
// turnos dos veces (~1.5-3s cada una). Se invalida en cada nueva ejecución.
var _turnoActivoMemo = {};
function verificarTurnoActivo(userEmail, ss) {
  if (_turnoActivoMemo[userEmail] !== undefined) return _turnoActivoMemo[userEmail];
  var resultado = _verificarTurnoActivoReal(userEmail, ss);
  _turnoActivoMemo[userEmail] = resultado;
  return resultado;
}

function _verificarTurnoActivoReal(userEmail, ss) {
  try {
    const now = new Date();
    const nowStr = Utilities.formatDate(now, TIMEZONE, 'HH:mm');
    const hoyStr = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
    const [hNow, mNow] = nowStr.split(':').map(Number);
    const minActual = hNow * 60 + mNow;

    // Helper: convierte un valor de celda de hora a minutos desde medianoche
    function parseMin(v) {
      if (!v && v !== 0) return null;
      if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes();
      if (typeof v === 'number') return Math.round(v * 1440);
      const s = String(v).trim().replace(/(:\d{2}):\d{2}$/, '$1');
      if (!s.includes(':')) return null;
      const [h, m] = s.split(':').map(Number);
      return h * 60 + m;
    }

    // Obtener datos de turnos desde caché (CacheService + memoización de ejecución)
    // en vez de leer las hojas directamente cada vez.
    var turnosData = _getTurnosDataCacheado(ss);
    var dataAT = turnosData.dataAT;
    var dataTurnos = turnosData.dataTurnos;
    var dispTurnos = turnosData.dispTurnos;

    // 1. Buscar turno vigente del analista
    if (!dataAT || dataAT.length <= 1) return { ok: true };

    let idTurnoActivo = null;
    for (let i = 1; i < dataAT.length; i++) {
      const r = dataAT[i];
      const email = String(r[0]).toLowerCase().trim();
      if (email !== userEmail) continue;
      const idT = String(r[1]).trim();
      const desde = r[2] instanceof Date ? r[2] : null;
      const hasta = r[3] instanceof Date ? r[3] : null;
      if (!idT || !desde) continue;
      if (now >= desde && (!hasta || now <= hasta)) {
        idTurnoActivo = idT;
        break;
      }
    }
    if (!idTurnoActivo) {
      return {
        ok: false,
        message: '⏰ No tienes un turno activo asignado para este momento. Contacta a tu administrador para que revise tu horario.'
      };
    }

    // 2. Leer definición del turno (ya obtenida del caché)
    if (!dataTurnos || dataTurnos.length <= 1) {
      return {
        ok: false,
        message: '⏰ Tu turno no está correctamente configurado. Contacta a tu administrador.'
      };
    }

    // Día ISO: 1=Lun…7=Dom → d_idx 0=Lun…6=Dom
    // bool col: 3+d_idx, Fin col (display): 11+d_idx*2
    const diaISO = parseInt(Utilities.formatDate(now, TIMEZONE, 'u'), 10);
    const dIdx = diaISO - 1; // 0=Lun…6=Dom
    const boolCol = 3 + dIdx;
    const finCol  = 11 + dIdx * 2;

    let horaFinStr = null;
    let horaIniStr = null;
    let nombreTurno = '';
    const iniCol = 10 + dIdx * 2;
    for (let i = 1; i < dataTurnos.length; i++) {
      if (String(dataTurnos[i][0]).trim() !== idTurnoActivo) continue;
      nombreTurno = String(dataTurnos[i][1] || '').trim();
      if (!dataTurnos[i][boolCol]) {
        return {
          ok: false,
          message: 'Tu turno (' + (nombreTurno || idTurnoActivo) + ') no aplica hoy. No puedes recibir casos.'
        };
      }
      horaIniStr = String(dispTurnos[i][iniCol] || '').trim().replace(/(:\d{2}):\d{2}$/, '$1');
      horaFinStr = String(dispTurnos[i][finCol] || '').trim().replace(/(:\d{2}):\d{2}$/, '$1');
      break;
    }
    if (!horaFinStr) {
      return {
        ok: false,
        message: 'Tu turno (' + (nombreTurno || idTurnoActivo) + ') no tiene hora de fin configurada. Contacta a tu administrador.'
      };
    }

    let minIni = parseMin(horaIniStr);
    let minFin = parseMin(horaFinStr);
    if (minFin === null) {
      return {
        ok: false,
        message: '⏰ Tu turno (' + (nombreTurno || idTurnoActivo) + ') tiene una hora de fin inválida. Contacta a tu administrador.'
      };
    }

    if (minIni !== null && minActual < minIni) {
      return {
        ok: false,
        message: '⏰ Tu turno (' + (nombreTurno || horaIniStr) + ') inicia a las ' + horaIniStr + '. Aún no puedes recibir casos.'
      };
    }

    if (minActual > minFin) {
      return {
        ok: false,
        message: '⏰ Tu turno (' + (nombreTurno || horaFinStr) + ') finalizó a las ' + horaFinStr + '. No puedes recibir más casos por hoy.'
      };
    }
    return { ok: true };
  } catch (e) {
    Logger.log('verificarTurnoActivo error: ' + e.message);
    return { ok: true };
  }
}

/**
 * Verifica el estado de cupos del analista actual.
 * Retorna cuántos ha usado hoy vs su límite, por cada subcategoría.
 * @param {string} equipo - 'DIGITAL', 'BIOMETRIA' o 'REESTUDIOS'
 * @returns {Object} { cumplido: boolean, resumen: [{tipo, usado, limite}], mensaje }
 */
// datosPrefetch (opcional): { dataSolicitud, dataOrigen } — filas crudas (sin
// header) de "solicitud" y "ORIGEN" ya leídas por getTableData() en la misma
// carga de panel (ver getUnifiedTableData()._rawSolicitud/_rawOrigen). Cuando
// se pasa, esta función NO vuelve a leer esas dos hojas completas — antes
// cargarPanelAnalista() terminaba leyéndolas dos veces (una en getTableData(),
// otra aquí) en la misma llamada al servidor. Sin prefetch (p.ej. desde el
// botón "Ver mis cupos" o desde Tests.js) se comporta exactamente igual que
// antes, leyendo las hojas por su cuenta.
function verificarMisCupos(equipo, datosPrefetch) {
  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const ss = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID);
    const dataUsuarios = _getDataUsuarios();

    // Auto-detectar equipo si no se pasa, usando resolverEquipoDesdeEspecialidad
    let equipoFinal = equipo;
    if (!equipoFinal) {
      const usuario = dataUsuarios.find(u => String(u[2]).toLowerCase().trim() === userEmail);
      const esp = usuario ? String(usuario[4]).toUpperCase().trim() : 'ESTUDIO DIGITAL';
      const equipoObj = resolverEquipoDesdeEspecialidad(esp);
      equipoFinal = equipoObj ? equipoObj.id : 'DIGITAL';
    }

    const cupos = obtenerCuposEfectivos(userEmail, equipoFinal, dataUsuarios);

    // Calcular fecha hoy en múltiples formatos
    const hoy = new Date();
    const d = String(hoy.getDate()).padStart(2, '0');
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const y = hoy.getFullYear();
    const hoyFmt1 = d + '/' + m + '/' + y;
    const hoyFmt2 = y + '-' + m + '-' + d;
    const hoyFmt3 = hoy.getDate() + '/' + (hoy.getMonth() + 1) + '/' + y;

    const hoyFmt4 = (hoy.getMonth() + 1) + '/' + hoy.getDate() + '/' + y;
    const hoyFmt5 = m + '/' + d + '/' + y;

    function esHoy(val) {
      if (!val) return false;
      if (val instanceof Date) return val.getDate() === hoy.getDate() && val.getMonth() === hoy.getMonth() && val.getFullYear() === hoy.getFullYear();
      const texto = String(val);
      return texto.includes(hoyFmt1) || texto.includes(hoyFmt2) || texto.includes(hoyFmt3)
          || texto.includes(hoyFmt4) || texto.includes(hoyFmt5);
    }

    let conteoHoy = { digital: 0, reestudio: 0, induccion: 0, desaplazamiento: 0, nuevaUar: 0, deudorUar: 0, biometriaFallida: 0 };

    // Contar desde hoja solicitudes (Digital + Desaplazamiento + Inducciones)
    let dataSol;
    if (datosPrefetch && datosPrefetch.dataSolicitud) {
      dataSol = datosPrefetch.dataSolicitud;
    } else {
      const hojaSol = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
      dataSol = (hojaSol && hojaSol.getLastRow() > 1)
        ? hojaSol.getRange(2, 1, hojaSol.getLastRow() - 1, 37).getValues()
        : [];
    }
    for (let i = 0; i < dataSol.length; i++) {
      const asignado = String(dataSol[i][27]).trim().toLowerCase();
      if (asignado !== userEmail) continue;
      const fechaAsig = dataSol[i][26];
      const fechaFin = dataSol[i][28];
      if (!esHoy(fechaAsig) && !esHoy(fechaFin)) continue;
      const claseNorm = String(dataSol[i][20]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const estadoNorm = String(dataSol[i][16]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const estadoSinGuion = estadoNorm.replace(/_/g, ' ');
      let tipo = 'digital';
      if (estadoSinGuion === 'APROBADO PENDIENTE BIOMETRIA' || estadoNorm === 'APROBADO_PENDIENTE_BIOMETRIA') tipo = 'desaplazamiento';
      else if (claseNorm === "INDUCCION") tipo = 'induccion';
      conteoHoy[tipo]++;
    }

    // Lo que ya está en Historico_Gestiones (asignado o cerrado hoy) se lee de los
    // contadores incrementales en vez de reescanear la hoja completa (ver Código.js,
    // sección "CONTADORES INCREMENTALES DE CUPO Y CARGA").
    const conteoHoyContadorV = _obtenerConteoHoyAnalista(userEmail);
    for (const kv in conteoHoyContadorV) { conteoHoy[kv] = (conteoHoy[kv] || 0) + conteoHoyContadorV[kv]; }

    // Contar desde hoja reestudios (Reestudios + Nueva UAR + Deudor UAR + Biometría Fallida)
    try {
      let dataReest;
      if (datosPrefetch && datosPrefetch.dataOrigen) {
        dataReest = datosPrefetch.dataOrigen;
      } else {
        const ssReest = _abrirSSCacheado(ID_HOJA_REESTUDIOS);
        const hojaReest = ssReest.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
        dataReest = (hojaReest && hojaReest.getLastRow() > 1)
          ? hojaReest.getRange(2, 1, hojaReest.getLastRow() - 1, 14).getValues()
          : [];
      }
      for (let i = 0; i < dataReest.length; i++) {
        const asignado = String(dataReest[i][6]).trim().toLowerCase();
        if (asignado !== userEmail) continue;
        const fechaAsig = dataReest[i][8];
        const fechaFin = dataReest[i][9];
        if (!esHoy(fechaAsig) && !esHoy(fechaFin)) continue;
        const origenR = String(dataReest[i][3]).toUpperCase().trim();
        const tipoPNorm = String(dataReest[i][4]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
        let tipo = null;
        if (tipoPNorm.includes("BIOMETRIA FALLIDA")) tipo = 'biometriaFallida';
        else if (origenR === "CORREO" && tipoPNorm === "NUEVA") tipo = 'nuevaUar';
        else if (origenR === "CORREO" && tipoPNorm === "ADICIONAL") tipo = 'deudorUar';
        else if (tipoPNorm === "REESTUDIO") tipo = 'reestudio';
        if (tipo) conteoHoy[tipo]++;
      }
    } catch(e) {}

    // El histórico de reestudios también sale de los contadores incrementales
    // (ya sumado arriba junto con el histórico principal).

    // Comparar con cupos
    const resumen = [
      { tipo: 'Digital', usado: conteoHoy.digital, limite: cupos.digital },
      { tipo: 'Reestudios', usado: conteoHoy.reestudio, limite: cupos.reestudio },
      { tipo: 'Inducciones', usado: conteoHoy.induccion, limite: cupos.induccion },
      { tipo: 'Desaplazamiento', usado: conteoHoy.desaplazamiento, limite: cupos.desaplazamiento },
      { tipo: 'Nueva UAR', usado: conteoHoy.nuevaUar, limite: cupos.nuevaUar },
      { tipo: 'Deudor UAR', usado: conteoHoy.deudorUar, limite: cupos.deudorUar },
      { tipo: 'Biometría Fallida', usado: conteoHoy.biometriaFallida, limite: cupos.biometriaFallida }
    ];

    const cuposActivos = resumen.filter(r => r.limite > 0);
    const todosCumplidos = cuposActivos.length > 0 && cuposActivos.every(r => r.usado >= r.limite);
    const totalUsado = cuposActivos.reduce((s, r) => s + r.usado, 0);
    const totalLimite = cuposActivos.reduce((s, r) => s + r.limite, 0);

    return {
      cumplido: todosCumplidos,
      totalUsado: totalUsado,
      totalLimite: totalLimite,
      resumen: resumen,
      mensaje: todosCumplidos ? '¡Felicidades! Has completado todos tus cupos del día.' : ''
    };
  } catch (e) {
    return { cumplido: false, totalUsado: 0, totalLimite: 0, resumen: [], mensaje: '' };
  }
}

function actualizarEstadoPropio(nuevoEstado) {
  // SPERF (temporal): ver instrucciones en cargarPanelAnalista() (Código.js).
  const _tAEP0 = Date.now();

  // Validación de turno ANTES del lock (misma lógica que RequestLeadUnificado):
  // si el analista no está en turno, no necesitamos tomar el lock para rechazarlo.
  // Ahorra ~1.5s de lock ocupado innecesariamente.
  const correoAnalista = Session.getActiveUser().getEmail();
  if (nuevoEstado.toUpperCase() === 'ACTIVO') {
    const _tAbrirPre0 = Date.now();
    const ssPre = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID);
    Logger.log('⏱ SPERF actualizarEstadoPropio: _abrirSSCacheado (primera apertura de la ejecución) = ' + (Date.now() - _tAbrirPre0) + 'ms');
    const turnoCheck = verificarTurnoActivo(correoAnalista.toLowerCase().trim(), ssPre);
    Logger.log('⏱ SPERF actualizarEstadoPropio: verificarTurnoActivo (previo al lock) = ' + (Date.now() - _tAEP0) + 'ms');
    if (!turnoCheck.ok) {
      return { success: false, message: turnoCheck.message };
    }
  }

  const lock = LockService.getScriptLock();
  const _tLockWait0 = Date.now();
  try {
    lock.waitLock(25000);
  } catch (e) {
    Logger.log('⏱ SPERF actualizarEstadoPropio: NO se pudo tomar el lock tras ' + (Date.now() - _tLockWait0) + 'ms — servidor ocupado');
    return { success: false, message: "Servidor ocupado, reintenta." };
  }
  Logger.log('⏱ SPERF actualizarEstadoPropio: ESPERA del lock = ' + (Date.now() - _tLockWait0) + 'ms (contención con otros analistas si esto es alto)');
  const _tEnLockAEP0 = Date.now();

  // Variables que se necesitan fuera del lock para Historico_Estados
  var _estadoTextoPlano = null;
  var _fechaDiaHoy = null;
  var _fechaHoraActual = null;
  var _ahora = null;
  var _lockExitoso = false;

  try {
    const ss = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID);
    const hojaUsuarios = ss.getSheetByName("Usuarios");

    // Antes leía "Usuarios" completa (getDataRange().getValues()) y recorría fila
    // por fila para ubicar al analista. Como esta función escribe (col estado +
    // historial) inmediatamente después, necesita el número de fila real y
    // actualizado — por eso usa TextFinder acotado a la columna de correo (fresco
    // en cada llamada) en vez de reusar el caché de 30s de _getDataUsuarios(),
    // que podría apuntar a una fila desfasada si el admin agregó/quitó un usuario
    // en esa ventana.
    const _tFindUsr0 = Date.now();
    let filaEncontrada = -1;
    const lastRowUsuarios = hojaUsuarios.getLastRow();
    if (lastRowUsuarios > 1) {
      const matchUsuario = hojaUsuarios.getRange(2, 3, lastRowUsuarios - 1, 1)
        .createTextFinder(correoAnalista.trim())
        .matchEntireCell(true).matchCase(false).findNext();
      if (matchUsuario) filaEncontrada = matchUsuario.getRow();
    }
    Logger.log('⏱ SPERF actualizarEstadoPropio (dentro del lock): TextFinder fila usuario = ' + (Date.now() - _tFindUsr0) + 'ms');

    if (filaEncontrada !== -1) {
      _estadoTextoPlano = nuevoEstado.toUpperCase();

      _ahora = new Date();
      _fechaDiaHoy = Utilities.formatDate(_ahora, TIMEZONE, "yyyy-MM-dd");
      _fechaHoraActual = Utilities.formatDate(_ahora, TIMEZONE, "yyyy-MM-dd HH:mm:ss");

      // Batch write: leer rango F:L (7 columnas), modificar F y L, escribir de vuelta
      const _tReadFL0 = Date.now();
      var rangoUsuario = hojaUsuarios.getRange(filaEncontrada, 6, 1, 7); // cols F(6) a L(12)
      var rangoActual = rangoUsuario.getValues(); // [[F, G, H, I, J, K, L]]
      Logger.log('⏱ SPERF actualizarEstadoPropio (dentro del lock): getValues F:L = ' + (Date.now() - _tReadFL0) + 'ms');
      const _tWriteUsr0 = Date.now();

      // Posición [0][0] = col F (estado)
      rangoActual[0][0] = _estadoTextoPlano;

      // Posición [0][6] = col L (historial JSON)
      let historial = [];
      try {
        const contenido = rangoActual[0][6];
        historial = contenido ? JSON.parse(contenido) : [];
      } catch (e) { historial = []; }

      // Si el historial es de otro día, limpiarlo
      if (historial.length > 0) {
        try {
          const primerInicio = historial[0].inicio;
          const fechaPrimer = primerInicio.includes("T") ? primerInicio.split("T")[0] : primerInicio.split(' ')[0];
          if (fechaPrimer !== _fechaDiaHoy) historial = [];
        } catch(e) { historial = []; }
      }

      // Cerrar último estado en JSON local
      if (historial.length > 0) {
        let ultimo = historial[historial.length - 1];
        ultimo.fin = _ahora.toISOString();
        const inicioMs = new Date(ultimo.inicio).getTime();
        if (!isNaN(inicioMs)) ultimo.duracion_min = Math.round((_ahora.getTime() - inicioMs) / 60000);
      }

      historial.push({
        estado: _estadoTextoPlano,
        inicio: _ahora.toISOString(),
        fin: "EN CURSO",
        duracion_min: 0
      });

      rangoActual[0][6] = JSON.stringify(historial);

      // Escritura batch: un solo setValues() en lugar de 2 setValue() individuales
      rangoUsuario.setValues(rangoActual);
      Logger.log('⏱ SPERF actualizarEstadoPropio (dentro del lock): setValues F:L (write) = ' + (Date.now() - _tWriteUsr0) + 'ms');
      const _tFlushAEP0 = Date.now();
      SpreadsheetApp.flush();
      Logger.log('⏱ SPERF actualizarEstadoPropio (dentro del lock): SpreadsheetApp.flush() = ' + (Date.now() - _tFlushAEP0) + 'ms');
      Logger.log('⏱ SPERF actualizarEstadoPropio: TOTAL dentro del lock = ' + (Date.now() - _tEnLockAEP0) + 'ms | TOTAL función (hasta release) = ' + (Date.now() - _tAEP0) + 'ms');
      _lockExitoso = true;

    } else {
      return { success: false, message: "Usuario no encontrado." };
    }
  } catch (e) {
    return { success: false, message: "Error: " + e.toString() };
  } finally {
    lock.releaseLock();
  }

  // ─── Historico_Estados: FUERA del ScriptLock ───────────────────────────────
  // Cada analista escribe su propio registro — no requiere exclusión mutua.
  // Si falla, el estado ya se guardó correctamente en Usuarios; solo se pierde
  // auditoría temporal. Se loguea el error pero se retorna success al analista.
  if (_lockExitoso) {
    try {
      const _tHistEst0 = Date.now();
      const ss = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID);
      const hojaHistorico = ss.getSheetByName("Historico_Estados");

      if (hojaHistorico) {
        const lastRowH = hojaHistorico.getLastRow();
        Logger.log('⏱ SPERF actualizarEstadoPropio (fuera del lock): Historico_Estados tiene ' + (lastRowH - 1) + ' filas');
        if (lastRowH > 1) {
          // Buscar de abajo hacia arriba para eficiencia: cerrar registro anterior
          const rango = Math.min(lastRowH - 1, 200); // revisar últimas 200 filas
          const dataH = hojaHistorico.getRange(lastRowH - rango + 1, 1, rango, 6).getValues();
          for (let j = dataH.length - 1; j >= 0; j--) {
            const correoH = String(dataH[j][1]).trim().toLowerCase();
            const finH = String(dataH[j][4]).trim();
            if (correoH === correoAnalista.toLowerCase().trim() && finH === "EN CURSO") {
              const filaH = (lastRowH - rango + 1) + j;
              const inicioRaw = dataH[j][3];
              let duracion = 0;
              try {
                const inicioDate = inicioRaw instanceof Date ? inicioRaw : new Date(String(inicioRaw).replace(' ', 'T'));
                if (!isNaN(inicioDate.getTime())) {
                  duracion = Math.round((_ahora.getTime() - inicioDate.getTime()) / 60000);
                }
              } catch(e) {}
              hojaHistorico.getRange(filaH, 5).setValue(_fechaHoraActual); // col E = fecha+hora fin
              hojaHistorico.getRange(filaH, 6).setValue(duracion);          // col F = duración min
              break;
            }
          }
        }

        // Escribir nuevo registro en Historico_Estados
        hojaHistorico.appendRow([
          _fechaDiaHoy,
          correoAnalista,
          _estadoTextoPlano,
          _fechaHoraActual,
          "EN CURSO",
          0
        ]);
      }
      Logger.log('⏱ SPERF actualizarEstadoPropio (fuera del lock): bloque Historico_Estados (scan+appendRow) = ' + (Date.now() - _tHistEst0) + 'ms');
    } catch (eHist) {
      // El estado ya fue guardado en Usuarios — la auditoría falla sin afectar al analista
      Logger.log('⚠️ actualizarEstadoPropio: Historico_Estados falló (no afecta resultado): ' + eHist.toString());
    }
  }

  Logger.log('⏱ SPERF actualizarEstadoPropio: TOTAL función completa = ' + (Date.now() - _tAEP0) + 'ms');
  return { success: true, message: "Estado actualizado y sincronizado." };
}

// ============================================================
// ACTIVAR + ASIGNAR + PANEL EN UN SOLO VIAJE (optimización de latencia)
// ============================================================
// Cuando el analista hace clic en "ACTIVO", antes se ejecutaban 3 viajes de red
// en secuencia: actualizarEstadoPropio → cargarDatos → autoAsignarDesdeEquipo → cargarDatos.
// Esta función los consolida en un solo round-trip:
// 1. Cambia estado a ACTIVO (con lock, igual que actualizarEstadoPropio)
// 2. Si la activación fue exitosa, intenta asignar un caso (RequestLeadUnificado)
// 3. Devuelve los datos del panel (cargarPanelAnalista) para que el cliente
//    pueda renderizar inmediatamente sin un viaje adicional.
// Si la activación falla (turno, permiso, etc.), devuelve el error sin intentar
// asignar ni cargar panel — el cliente maneja eso igual que antes.
function activarYAsignar() {
  var _tActivarYAsignar0 = Date.now();
  var _deadline = _tActivarYAsignar0 + 300000; // 300 segundos = safety deadline
  var resultado = { activacion: null, asignacion: null, panel: null };

  // Paso 1: activar (incluye verificarTurnoActivo con cache + ScriptLock + Historico_Estados)
  resultado.activacion = actualizarEstadoPropio('ACTIVO');
  Logger.log('⏱ SPERF activarYAsignar: actualizarEstadoPropio = ' + (Date.now() - _tActivarYAsignar0) + 'ms');
  if (!resultado.activacion || !resultado.activacion.success) {
    Logger.log('⏱ SPERF activarYAsignar: ABORTADO (activación fallida) TOTAL = ' + (Date.now() - _tActivarYAsignar0) + 'ms');
    return resultado;
  }

  // Paso 2: asignar (solo si la activación fue exitosa)
  // La respuesta de autoAsignarDesdeEquipo() (vía RequestLeadUnificado) incluye
  // idsAsignados y faseTarget cuando hay biometrías asignadas.
  // Interfaz esperada: {success, message, nueva, idsAsignados, faseTarget}
  var _tAutoAsignar0 = Date.now();
  try {
    resultado.asignacion = autoAsignarDesdeEquipo();
  } catch (e) {
    resultado.asignacion = { success: false, message: e.message, idsAsignados: [], faseTarget: null };
  }
  Logger.log('⏱ SPERF activarYAsignar: autoAsignarDesdeEquipo = ' + (Date.now() - _tAutoAsignar0) + 'ms');

  // Paso 2.5: biometría deferred server-side (Req 5.6, 5.3, 5.4)
  // Si hay IDs asignados, ejecutar actualización de fase de biometría en esta misma invocación.
  // Esto evita un round-trip adicional desde el cliente.
  // autoAsignarDesdeEquipo() ya lo intenta internamente (_biometriaEjecutada) — este bloque
  // es solo un respaldo por si esa ejecución interna no llegó a marcarlo.
  if (resultado.asignacion && resultado.asignacion._biometriaEjecutada) {
    Logger.log('⏱ SPERF activarYAsignar: biometriaDeferred ya ejecutada dentro de autoAsignarDesdeEquipo(), no se repite');
  } else if (resultado.asignacion && resultado.asignacion.idsAsignados && resultado.asignacion.idsAsignados.length > 0) {
    if (Date.now() < _deadline) {
      var _tBio0 = Date.now();
      try {
        actualizarFaseBiometriaPendienteDeferred(resultado.asignacion.idsAsignados, resultado.asignacion.faseTarget);
        resultado.asignacion._biometriaEjecutada = true;
      } catch (e) {
        Logger.log('⚠ activarYAsignar: biometría deferred falló: ' + e.message);
        resultado.asignacion._biometriaEjecutada = false;
      }
      Logger.log('⏱ SPERF activarYAsignar: biometriaDeferred = ' + (Date.now() - _tBio0) + 'ms');
    } else {
      Logger.log('⏱ SPERF activarYAsignar: DEADLINE pre-biometría, omitida');
      resultado.asignacion._biometriaEjecutada = false;
    }
  } else {
    if (resultado.asignacion) {
      resultado.asignacion._biometriaEjecutada = false;
    }
  }

  // Paso 3: cargar panel (siempre, para que el cliente tenga datos frescos)
  // Verificar deadline antes de cargar panel (Req 5.4)
  if (Date.now() >= _deadline) {
    Logger.log('⏱ SPERF activarYAsignar: DEADLINE pre-panel TOTAL = ' + (Date.now() - _tActivarYAsignar0) + 'ms');
    return resultado; // panel queda null
  }

  var _tCargarPanel0 = Date.now();
  try {
    resultado.panel = cargarPanelAnalista();
  } catch (e) {
    resultado.panel = null;
  }
  Logger.log('⏱ SPERF activarYAsignar: cargarPanelAnalista = ' + (Date.now() - _tCargarPanel0) + 'ms');

  Logger.log('⏱ SPERF activarYAsignar: TOTAL = ' + (Date.now() - _tActivarYAsignar0) + 'ms');
  return resultado;
}

// ============================================================
// AUTO-ASIGNAR + PANEL EN UN SOLO VIAJE (optimización de latencia)
// ============================================================
// Consolida: auto-asignación + biometría deferred + carga de panel.
// Patrón idéntico a activarYAsignar() pero sin el paso de activación
// (actualizarEstadoPropio). Usado por polling y _dispararAutoAsignacion().
// Reutiliza _abrirSSCacheado() automáticamente (misma ejecución = mismo cache).
// Safety deadline de 300s para retornar resultado parcial antes del timeout de GAS (6min).
/**
 * Consolida: auto-asignación + biometría deferred + carga de panel.
 * Patrón idéntico a activarYAsignar() pero sin el paso de activación.
 *
 * @returns {{ asignacion: Object, panel: Object|null }}
 *   asignacion: { success, message, nueva, idsAsignados, faseTarget, _biometriaEjecutada }
 *   panel: resultado de cargarPanelAnalista() o { _error, tabla:null, cupos:null, ... }
 */
function autoAsignarConPanel() {
  var _t0 = Date.now();
  var _deadline = _t0 + 300000; // 300 segundos = safety deadline
  var asignacion = null;

  // --- Paso 1: Auto-asignar ---
  var _tAutoAsignar0 = Date.now();
  try {
    asignacion = autoAsignarDesdeEquipo();
  } catch (e) {
    asignacion = { success: false, message: e.message, nueva: false, idsAsignados: [], faseTarget: null, _biometriaEjecutada: false };
  }
  Logger.log('⏱ SPERF autoAsignarConPanel: autoAsignarDesdeEquipo = ' + (Date.now() - _tAutoAsignar0) + 'ms');

  // --- Paso 1.5: Biometría deferred server-side (Req 5.1, 5.3, 5.4) ---
  // autoAsignarDesdeEquipo() ya lo intenta internamente (_biometriaEjecutada) — este
  // bloque es solo un respaldo por si esa ejecución interna no llegó a marcarlo.
  if (asignacion && asignacion._biometriaEjecutada) {
    Logger.log('⏱ SPERF autoAsignarConPanel: biometriaDeferred ya ejecutada dentro de autoAsignarDesdeEquipo(), no se repite');
  } else if (asignacion && asignacion.idsAsignados && asignacion.idsAsignados.length > 0) {
    if (Date.now() < _deadline) {
      var _tBio0 = Date.now();
      try {
        actualizarFaseBiometriaPendienteDeferred(asignacion.idsAsignados, asignacion.faseTarget);
        asignacion._biometriaEjecutada = true;
      } catch (e) {
        Logger.log('⚠ autoAsignarConPanel: biometría deferred falló: ' + e.message);
        asignacion._biometriaEjecutada = false;
      }
      Logger.log('⏱ SPERF autoAsignarConPanel: biometriaDeferred = ' + (Date.now() - _tBio0) + 'ms');
    } else {
      Logger.log('⏱ SPERF autoAsignarConPanel: DEADLINE pre-biometría, omitida');
      asignacion._biometriaEjecutada = false;
    }
  } else {
    if (asignacion) {
      asignacion._biometriaEjecutada = false;
    }
  }

  // --- Paso 2: Cargar panel ---
  // Verificar deadline (280s) antes de cargar panel para dejar margen de retorno
  if (Date.now() - _t0 >= 280000) {
    Logger.log('⏱ SPERF autoAsignarConPanel: DEADLINE pre-panel (280s) TOTAL = ' + (Date.now() - _t0) + 'ms');
    return { asignacion: asignacion, panel: null };
  }

  var panel = null;
  var _tCargarPanel0 = Date.now();
  try {
    panel = cargarPanelAnalista();
  } catch (e) {
    panel = {
      _error: e.message,
      tabla: null,
      cupos: null,
      pendientesValidacion: [],
      gestionesHoyCruzadas: null
    };
  }
  Logger.log('⏱ SPERF autoAsignarConPanel: cargarPanelAnalista = ' + (Date.now() - _tCargarPanel0) + 'ms');

  Logger.log('⏱ SPERF autoAsignarConPanel: total = ' + (Date.now() - _t0) + 'ms');
  return { asignacion: asignacion, panel: panel };
}

// ============================================================
// GUARDAR + ASIGNAR + PANEL EN UN SOLO VIAJE (optimización de latencia)
// ============================================================
// Cuando el analista guarda una gestión con estado de cierre (APROBADO/NEGADO/
// RECHAZADO/APLAZADO), antes se ejecutaban 3 viajes de red en secuencia:
// guardarCambiosInternos → autoAsignarDesdeEquipo → cargarPanelAnalista.
// Esta función los consolida en un solo round-trip:
// 1. Guarda la gestión (guardarCambiosInternos)
// 2. Si el guardado fue exitoso y disparaAsignacion=true, intenta asignar (autoAsignarDesdeEquipo)
// 3. Devuelve los datos del panel (cargarPanelAnalista) para que el cliente
//    pueda renderizar inmediatamente sin un viaje adicional.
// Si el guardado falla, devuelve el error sin intentar asignar ni cargar panel.
// Safety deadline de 300s para retornar resultado parcial antes del timeout de GAS (6min).
/**
 * Consolida: guardar gestión + auto-asignar siguiente + cargar panel.
 * Patrón idéntico a activarYAsignar() pero reemplazando activación por guardado.
 *
 * @param {Object} data - Mismos datos que recibe guardarCambiosInternos()
 * @param {Object} [resultadoGuardadoPrevio] - Si el llamador YA guardó la gestión
 *   (caso real hoy: los 3 modales llaman directo a guardarCambiosInternos/
 *   guardarGestionBiometria/guardarGestionReestudio antes de llegar aquí), pasar
 *   ese resultado aquí para que el Paso 1 no lo repita. Sin esto, un segundo
 *   guardado siempre falla: la fila ya quedó cerrada (fechaFin puesto) por el
 *   primer guardado, así que la búsqueda de "fila abierta con este ID" no
 *   encuentra nada y devuelve "no encontrada en ninguna base central" — lo que
 *   aborta toda la función antes de asignar el siguiente caso o cargar el panel
 *   (incidente real, 2026-08-21: por esto el auto-siguiente-caso nunca corría).
 * @returns {{guardado: Object, asignacion: Object|null, panel: Object|null}}
 */
function guardarYAsignarSiguiente(data, resultadoGuardadoPrevio) {
  var _tGYA0 = Date.now();
  var _deadline = _tGYA0 + 300000; // 300 segundos = safety deadline
  var resultado = { guardado: null, asignacion: null, panel: null };

  // --- Validación de input: solicitudId requerido ---
  if (!data || !data.solicitudId || String(data.solicitudId).trim() === '') {
    resultado.guardado = { success: false, message: 'ID de solicitud no proporcionado.', disparaAsignacion: false };
    Logger.log('⏱ SPERF guardarYAsignarSiguiente: ABORTADO (solicitudId vacío) TOTAL = ' + (Date.now() - _tGYA0) + 'ms');
    return resultado;
  }

  // --- Paso 1: Guardar gestión (o reutilizar un guardado ya hecho por el llamador) ---
  if (resultadoGuardadoPrevio && typeof resultadoGuardadoPrevio === 'object') {
    resultado.guardado = resultadoGuardadoPrevio;
    Logger.log('⏱ SPERF guardarYAsignarSiguiente: guardado reutilizado (ya lo hizo el llamador), sin repetir = 0ms');
  } else {
    // Verificar deadline antes de guardar
    if (Date.now() >= _deadline) {
      resultado.guardado = { success: false, message: 'Tiempo límite superado antes de iniciar guardado.', disparaAsignacion: false };
      Logger.log('⏱ SPERF guardarYAsignarSiguiente: ABORTADO (deadline pre-guardado) TOTAL = ' + (Date.now() - _tGYA0) + 'ms');
      return resultado;
    }

    try {
      resultado.guardado = guardarCambiosInternos(data);
    } catch (e) {
      resultado.guardado = { success: false, message: 'Error de servidor: ' + e.message, disparaAsignacion: false };
      Logger.log('⏱ SPERF guardarYAsignarSiguiente: EXCEPCIÓN en guardado TOTAL = ' + (Date.now() - _tGYA0) + 'ms');
      return resultado;
    }
    Logger.log('⏱ SPERF guardarYAsignarSiguiente: guardarCambiosInternos = ' + (Date.now() - _tGYA0) + 'ms');
  }

  // Early exit si guardado falla (Req 1.4, 1.6)
  if (!resultado.guardado || !resultado.guardado.success) {
    Logger.log('⏱ SPERF guardarYAsignarSiguiente: ABORTADO (guardado fallido) TOTAL = ' + (Date.now() - _tGYA0) + 'ms');
    return resultado;
  }

  // --- Paso 2: Asignar siguiente caso (solo si disparaAsignacion=true) ---
  // La respuesta de autoAsignarDesdeEquipo() (vía RequestLeadUnificado) incluye
  // idsAsignados y faseTarget cuando hay biometrías asignadas. El cliente usa
  // estos campos para disparar actualizarFaseBiometriaPendienteDeferred() de
  // forma no-bloqueante (fire-and-forget).
  // Interfaz esperada: {success, message, nueva, idsAsignados, faseTarget}
  if (resultado.guardado.disparaAsignacion) {
    // Verificar deadline antes de asignar (Req 5.4)
    if (Date.now() >= _deadline) {
      Logger.log('⏱ SPERF guardarYAsignarSiguiente: DEADLINE pre-asignación TOTAL = ' + (Date.now() - _tGYA0) + 'ms');
      return resultado; // asignacion y panel quedan null
    }

    var _tAutoAsignar0 = Date.now();
    try {
      resultado.asignacion = autoAsignarDesdeEquipo();
    } catch (e) {
      resultado.asignacion = { success: false, message: e.message, idsAsignados: [], faseTarget: null };
    }
    Logger.log('⏱ SPERF guardarYAsignarSiguiente: autoAsignarDesdeEquipo = ' + (Date.now() - _tAutoAsignar0) + 'ms');

    // --- Paso 2.5: Biometría deferred server-side (Req 5.2, 5.3, 5.4) ---
    // autoAsignarDesdeEquipo() ya lo intenta internamente (_biometriaEjecutada) — este
    // bloque es solo un respaldo por si esa ejecución interna no llegó a marcarlo.
    if (resultado.asignacion && resultado.asignacion._biometriaEjecutada) {
      Logger.log('⏱ SPERF guardarYAsignarSiguiente: biometriaDeferred ya ejecutada dentro de autoAsignarDesdeEquipo(), no se repite');
    } else if (resultado.asignacion && resultado.asignacion.idsAsignados && resultado.asignacion.idsAsignados.length > 0) {
      try {
        actualizarFaseBiometriaPendienteDeferred(resultado.asignacion.idsAsignados, resultado.asignacion.faseTarget);
        resultado.asignacion._biometriaEjecutada = true;
      } catch (e) {
        Logger.log('⚠️ guardarYAsignarSiguiente: biometría deferred falló: ' + e.message);
        resultado.asignacion._biometriaEjecutada = false;
      }
    }
  }

  // --- Paso 3: Cargar panel (siempre que el guardado fue exitoso) ---
  // Verificar deadline antes de cargar panel (Req 5.4)
  if (Date.now() >= _deadline) {
    Logger.log('⏱ SPERF guardarYAsignarSiguiente: DEADLINE pre-panel TOTAL = ' + (Date.now() - _tGYA0) + 'ms');
    return resultado; // panel queda null
  }

  var _tCargarPanel0 = Date.now();
  try {
    resultado.panel = cargarPanelAnalista();
  } catch (e) {
    resultado.panel = {
      _error: e.message,
      tabla: null,
      cupos: null,
      pendientesValidacion: [],
      gestionesHoyCruzadas: null
    };
  }
  Logger.log('⏱ SPERF guardarYAsignarSiguiente: cargarPanelAnalista = ' + (Date.now() - _tCargarPanel0) + 'ms');

  Logger.log('⏱ SPERF guardarYAsignarSiguiente: TOTAL = ' + (Date.now() - _tGYA0) + 'ms');
  return resultado;
}

function admin_sincronizarEstado(correoAsesor, nuevoEstado){
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hojaUsuarios = ss.getSheetByName("Usuarios");
    const hojaHistorico = ss.getSheetByName("Historico_Estados");

    const datos = hojaUsuarios.getDataRange().getValues();
    const columnaCorreo = 2;
    const columnaEstado = 5;
    const columnaHistorial = 11;

    let filaEncontrada = -1;
    for(let i = 1; i < datos.length; i++){
      if(datos[i][columnaCorreo] && datos[i][columnaCorreo].toString().toLowerCase().trim() === correoAsesor.toLowerCase().trim()){
        filaEncontrada = i + 1;
        break;
      }
    }
    if(filaEncontrada === -1) return false;

    const estadoTextoPlano = nuevoEstado.toUpperCase();
    const ahora = new Date();
    const fechaDiaHoy = Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd");
    const fechaHoraActual = Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd HH:mm:ss");

    if (hojaHistorico) {
      const lastRowH = hojaHistorico.getLastRow();
      if (lastRowH > 1) {
        const rango = Math.min(lastRowH - 1, 200);
        const dataH = hojaHistorico.getRange(lastRowH - rango + 1, 1, rango, 6).getValues();
        for (let j = dataH.length - 1; j >= 0; j--) {
          const correoH = String(dataH[j][1]).trim().toLowerCase();
          const finH = String(dataH[j][4]).trim();
          if (correoH === correoAsesor.toLowerCase().trim() && finH === "EN CURSO") {
            const filaH = (lastRowH - rango + 1) + j;
            const inicioRaw = dataH[j][3];
            let duracion = 0;
            try {
              const inicioDate = inicioRaw instanceof Date ? inicioRaw : new Date(String(inicioRaw).replace(' ', 'T'));
              if (!isNaN(inicioDate.getTime())) {
                duracion = Math.round((ahora.getTime() - inicioDate.getTime()) / 60000);
              }
            } catch(e) {}
            hojaHistorico.getRange(filaH, 5).setValue(fechaHoraActual);
            hojaHistorico.getRange(filaH, 6).setValue(duracion);
            break;
          }
        }
      }

      hojaHistorico.appendRow([
        fechaDiaHoy,
        correoAsesor,
        estadoTextoPlano,
        fechaHoraActual,
        "EN CURSO",
        0
      ]);
    }

    hojaUsuarios.getRange(filaEncontrada, columnaEstado + 1).setValue(estadoTextoPlano);

    const celdaHistorial = hojaUsuarios.getRange(filaEncontrada, columnaHistorial + 1);
    let historial = [];
    try {
      const contenido = celdaHistorial.getValue();
      historial = contenido ? JSON.parse(contenido) : [];
    } catch(e) { historial = []; }

    if (historial.length > 0) {
      try {
        const primerInicio = historial[0].inicio;
        const fechaPrimer = primerInicio.includes("T") ? primerInicio.split("T")[0] : primerInicio.split(' ')[0];
        if (fechaPrimer !== fechaDiaHoy) historial = [];
      } catch(e) { historial = []; }
    }

    if (historial.length > 0) {
      let ultimo = historial[historial.length - 1];
      ultimo.fin = ahora.toISOString();
      const inicioMs = new Date(ultimo.inicio).getTime();
      if (!isNaN(inicioMs)) ultimo.duracion_min = Math.round((ahora.getTime() - inicioMs) / 60000);
    }

    historial.push({
      estado: estadoTextoPlano,
      inicio: ahora.toISOString(),
      fin: "EN CURSO",
      duracion_min: 0,
      modificadoPor: "ADMIN"
    });
    celdaHistorial.setValue(JSON.stringify(historial));
    SpreadsheetApp.flush();
    return true;
  } finally {
    lock.releaseLock();
  }
}

function autoAsignarAlEntrar() {
  const correo = Session.getActiveUser().getEmail().toLowerCase().trim();

  // Antes releía "Usuarios" completa por su cuenta (getDataRange().getValues()),
  // y autoAsignarDesdeEquipo() (llamada justo abajo) volvía a leerla completa vía
  // _getDataUsuarios() porque esta lectura directa nunca llenó su caché/memo —
  // dos lecturas completas de la misma hoja en la misma ejecución. Usa el mismo
  // caché de 30s que ya usa RequestLeadUnificado para esta misma validación
  // (usuario activo) — misma tolerancia a datos ya aceptada en el motor real.
  const datos = _getDataUsuarios();

  const usuario = datos.find(fila => fila[2].toString().toLowerCase().trim() === correo);
  
  if (!usuario) return { success: false, message: "Usuario no registrado" };
  
  const estadoReal = usuario[5].toString().toUpperCase(); 

  if (estadoReal !== "ACTIVO") {
    return { success: false, message: "Bloqueo de seguridad: El estado en base de datos es " + estadoReal };
  }

  try {
    const resultado = autoAsignarDesdeEquipo();
    SpreadsheetApp.flush();
    return resultado;
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function obtenerMiEstadoActual() {
  try {
    const correoAnalista = Session.getActiveUser().getEmail();
    // Antes releía "Usuarios" completa (getDataRange().getValues()) en cada carga
    // de página. Usa el mismo caché de 30s (CacheService) que ya usan
    // verificarMisCupos/RequestLeadUnificado — este es solo un getter de solo
    // lectura, así que una foto de hasta 30s de antigüedad del estado propio es
    // aceptable (se sincroniza igual en el próximo ciclo de refresco del panel).
    const datos = _getDataUsuarios();
    const columnaCorreo = 2;
    const columnaEstado = 5;

    for (let i = 1; i < datos.length; i++) {
      if (datos[i][columnaCorreo] && datos[i][columnaCorreo].toString().toLowerCase().trim() === correoAnalista.toLowerCase().trim()) {
        return datos[i][columnaEstado].toUpperCase();
      }
    }
    return "INACTIVO";
  } catch (e) {
    return "ERROR";
  }
}

/**
 * Indica si el analista ya registró estado ALMUERZO en algún momento de hoy,
 * para no seguir mostrándole el recordatorio de almuerzo el resto del día.
 */
function yaAlmorzoHoy() {
  try {
    const correoAnalista = Session.getActiveUser().getEmail();
    const datos = _getDataUsuarios();
    const columnaCorreo = 2;
    const columnaHistorial = 11;
    const fechaHoy = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");

    for (let i = 1; i < datos.length; i++) {
      if (datos[i][columnaCorreo] && datos[i][columnaCorreo].toString().toLowerCase().trim() === correoAnalista.toLowerCase().trim()) {
        const contenido = datos[i][columnaHistorial];
        if (!contenido) return false;
        let historial = [];
        try { historial = JSON.parse(contenido); } catch (e) { return false; }
        return historial.some(function(h) {
          if (!h || h.estado !== 'ALMUERZO' || !h.inicio) return false;
          const fechaEntrada = h.inicio.includes('T') ? h.inicio.split('T')[0] : h.inicio.split(' ')[0];
          return fechaEntrada === fechaHoy;
        });
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Devuelve la hora de fin del turno del analista actual (para auto-INACTIVO en frontend).
 * @returns {{ tieneTurno: boolean, horaFinStr?: string, minutosRestantes?: number, nombreTurno?: string }}
 */
function obtenerInfoTurnoActual() {
  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const ss = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID);
    const now = new Date();
    const nowStr = Utilities.formatDate(now, TIMEZONE, 'HH:mm');
    const [hNow, mNow] = nowStr.split(':').map(Number);
    const minActual = hNow * 60 + mNow;

    function parseMin(v) {
      if (!v && v !== 0) return null;
      if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes();
      if (typeof v === 'number') return Math.round(v * 1440);
      const s = String(v).trim().replace(/(:\d{2}):\d{2}$/, '$1');
      if (!s.includes(':')) return null;
      const [h, m] = s.split(':').map(Number);
      return h * 60 + m;
    }

    // Reusa la caché/memo que cargarPanelAnalista() ya calentó unas líneas antes
    // (ver "Pre-warm" en cargarPanelAnalista) — antes esta función releía
    // Analistas_Turnos y Turnos por su cuenta (2 getValues() + 1 getDisplayValues())
    // pese a que esos datos ya estaban en memoria, pagando ~2900ms de más en cada
    // cargarPanelAnalista() (todo ciclo de "guardar y asignar siguiente").
    const _turnosData = _getTurnosDataCacheado(ss);
    const dataAT = _turnosData.dataAT;
    if (!dataAT || dataAT.length <= 1) return { tieneTurno: false };

    let idTurnoActivo = null;
    for (let i = 1; i < dataAT.length; i++) {
      const r = dataAT[i];
      const email = String(r[0]).toLowerCase().trim();
      if (email !== userEmail) continue;
      const idT = String(r[1]).trim();
      const desde = r[2] instanceof Date ? r[2] : null;
      const hasta = r[3] instanceof Date ? r[3] : null;
      if (!idT || !desde) continue;
      if (now >= desde && (!hasta || now <= hasta)) {
        idTurnoActivo = idT;
        break;
      }
    }
    if (!idTurnoActivo) return { tieneTurno: false };

    const dataTurnos = _turnosData.dataTurnos;
    const dispTurnos = _turnosData.dispTurnos;
    if (!dataTurnos || dataTurnos.length <= 1) return { tieneTurno: false };

    const diaISO = parseInt(Utilities.formatDate(now, TIMEZONE, 'u'), 10);
    const dIdx = diaISO - 1;
    const boolCol = 3 + dIdx;
    const finCol  = 11 + dIdx * 2;

    const iniCol = 10 + dIdx * 2;
    for (let i = 1; i < dataTurnos.length; i++) {
      if (String(dataTurnos[i][0]).trim() !== idTurnoActivo) continue;
      const nombreTurno = String(dataTurnos[i][1] || '').trim();

      if (!dataTurnos[i][boolCol]) {
        return { tieneTurno: true, fueraTurno: true, razon: 'NO_APLICA_HOY', nombreTurno: nombreTurno, minutosRestantes: 0 };
      }

      const horaIniStr = String(dispTurnos[i][iniCol] || '').trim().replace(/(:\d{2}):\d{2}$/, '$1');
      const horaFinStr = String(dispTurnos[i][finCol] || '').trim().replace(/(:\d{2}):\d{2}$/, '$1');
      const minIni = parseMin(horaIniStr);
      const minFin = parseMin(horaFinStr);
      if (minFin === null) return { tieneTurno: false };

      if (minIni !== null && minActual < minIni) {
        return { tieneTurno: true, fueraTurno: true, razon: 'ANTES_DE_TURNO', nombreTurno: nombreTurno, horaIniStr: horaIniStr, minutosRestantes: 0 };
      }

      const minutosRestantes = minFin - minActual;
      return {
        tieneTurno: true,
        horaFinStr: horaFinStr,
        minutosRestantes: minutosRestantes,
        nombreTurno: nombreTurno
      };
    }
    return { tieneTurno: false };
  } catch (e) {
    Logger.log('obtenerInfoTurnoActual error: ' + e.message);
    return { tieneTurno: false };
  }
}

function parsearFechaApiSegura(fechaRaw) {
  if (!fechaRaw) return new Date(0);
  if (fechaRaw instanceof Date) return fechaRaw;
  if (String(fechaRaw).includes('/')) {
    const p = fechaRaw.split(/[\/\s:]/);
    return new Date(p[2], p[1] - 1, p[0], p[3]||0, p[4]||0, p[5]||0);
  }
  return new Date(fechaRaw);
}

function calcularMinutosHabilesSLA(desde, hasta, ss) {
  if (!(desde instanceof Date) || isNaN(desde.getTime())) return 0;
  if (!(hasta instanceof Date) || isNaN(hasta.getTime())) return 0;
  if (desde > hasta) return 0;
  const festivosSet = new Set();
  try {
    const hojaFestivos = ss.getSheetByName("Festivos");
    if (hojaFestivos) {
      const valores = hojaFestivos.getDataRange().getValues();
      valores.forEach(fila => {
        const celda = fila[0];
        if (celda instanceof Date) {
          festivosSet.add(Utilities.formatDate(celda, "GMT-5", "yyyy-MM-dd"));
        } else if (celda) {
          const d = new Date(celda);
          if (!isNaN(d.getTime())) {
            festivosSet.add(Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd"));
          }
        }
      });
    }
  } catch (e) {
    Logger.log("Aviso: No se pudo procesar la hoja de Festivos: " + e.message);
  }
  let totalMinutos = 0;
  const HORA_INICIO = 8;
  const HORA_FIN = 18;
  let inicioBucle = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  let finBucle = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  for (let d = new Date(inicioBucle.getTime()); d <= finBucle; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    const fechaStr = Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd");
    if (festivosSet.has(fechaStr)) continue;
    let limiteInicio = new Date(d.getFullYear(), d.getMonth(), d.getDate(), HORA_INICIO, 0, 0);
    let limiteFin    = new Date(d.getFullYear(), d.getMonth(), d.getDate(), HORA_FIN, 0, 0);
    if (d.toDateString() === desde.toDateString()) {
      if (desde > limiteInicio) limiteInicio = desde;
    }
    if (d.toDateString() === hasta.toDateString()) {
      if (hasta < limiteFin) limiteFin = hasta;
    }
    if (limiteInicio < limiteFin) {
      totalMinutos += (limiteFin.getTime() - limiteInicio.getTime()) / (1000 * 60);
    }
  }
  return totalMinutos;
}

function solicitarPermiso(tipo, fechaInicio, fechaFin, observacion) {
  try {
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    let hoja = ss.getSheetByName('Permisos_Incapacidades');
    if (!hoja) {
      hoja = ss.insertSheet('Permisos_Incapacidades');
      hoja.appendRow(['id','fechaSolicitud','correo','nombre','tipo','fechaInicio','fechaFin','observacionAnalista','estado','correoAdmin','fechaRevision','observacionAdmin']);
    }
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const hojaUser = ss.getSheetByName('Usuarios');
    const dataUser = hojaUser.getDataRange().getValues();
    const usuario = dataUser.find(f => String(f[2]).toLowerCase().trim() === userEmail);
    const nombre = usuario ? String(usuario[1]).trim() : userEmail;
    const id = 'PER-' + Date.now();
    const ahora = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    hoja.appendRow([id, ahora, userEmail, nombre, tipo, fechaInicio, fechaFin, observacion || '', 'PENDIENTE', '', '', '']);
    SpreadsheetApp.flush();

    try {
      const correosAdmin = dataUser
        .filter(f => String(f[23]).toUpperCase().trim() === 'ADMIN' && f[2])
        .map(f => String(f[2]).trim());
      if (correosAdmin.length > 0) {
        let urlPanel = '';
        try { urlPanel = ScriptApp.getService().getUrl(); } catch (eUrl) {}
        _enviarCorreoMarca_(
          correosAdmin.join(','),
          'Nueva solicitud de permiso: ' + nombre + ' (' + tipo + ')',
          _construirCorreoNuevoPermiso_(nombre, userEmail, tipo, fechaInicio, fechaFin, observacion, urlPanel)
        );
      }
    } catch (eMail) {
      Logger.log('Error enviando correo de notificación de permiso: ' + eMail.message);
    }

    return { success: true, message: 'Tu solicitud de ' + tipo + ' fue enviada. El administrador la revisará pronto.' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

const REMITENTE_CORREO_MARCA = 'noreply@segurosbolivar.com';
const NOMBRE_CORREO_MARCA = 'Análisis · El Libertador';

// Envío único de correos "de marca" (notificaciones de permisos, etc.). Intenta salir
// como noreply@segurosbolivar.com — eso solo funciona si esa dirección está configurada
// como alias "Enviar correo como" en la cuenta de Gmail/Workspace que corre el script.
// Si no lo está, GmailApp lanza error y hacemos fallback a MailApp (sale desde la cuenta
// real del script, pero conserva el nombre de remitente) para no perder la notificación.
function _enviarCorreoMarca_(destinatarios, asunto, htmlBody) {
  try {
    GmailApp.sendEmail(destinatarios, asunto, '', {
      htmlBody: htmlBody,
      from: REMITENTE_CORREO_MARCA,
      name: NOMBRE_CORREO_MARCA
    });
  } catch (eFrom) {
    Logger.log('No se pudo enviar como ' + REMITENTE_CORREO_MARCA + ' (¿alias no configurado?): ' + eFrom.message + '. Enviando con remitente por defecto.');
    MailApp.sendEmail({ to: destinatarios, subject: asunto, htmlBody: htmlBody, name: NOMBRE_CORREO_MARCA });
  }
}

// Correo de notificación (nueva solicitud de permiso) con la identidad de marca de
// El Libertador. Usa solo estilos inline (sin <style>) porque los clientes de correo
// no soportan hojas de estilo externas ni siempre respetan bloques <style>.
function _construirCorreoNuevoPermiso_(nombre, correo, tipo, fechaInicio, fechaFin, observacion, urlPanel) {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const etiqueta = 'color:#706F6F;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;';
  const valor = 'color:#111827;font-size:14px;font-weight:700;margin:0;';

  const bloqueObservacion = observacion ? `
    <div style="background-color:#f8fafc;border-left:3px solid #253150;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:24px;">
      <p style="${etiqueta}">Observación</p>
      <p style="margin:0;color:#374151;font-size:13px;line-height:1.5;">${esc(observacion)}</p>
    </div>` : '';

  const botonPanel = urlPanel ? `
    <a href="${urlPanel}" style="display:inline-block;background-color:#BD0F14;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:12px 28px;border-radius:10px;">
      Abrir panel de administración &rarr;
    </a>` : '';

  return `
<div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background-color:#F4F5F8;padding:24px;">
  <div style="background-color:#253150;background:linear-gradient(135deg,#161e33 0%,#253150 60%,#3a4d7a 100%);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.5px;">El Libertador</div>
    <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:4px;">Sistema de Asignación de Solicitudes</div>
  </div>
  <div style="background-color:#ffffff;padding:32px;border-radius:0 0 16px 16px;">
    <div style="display:inline-block;background-color:#fef3c7;color:#92400e;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:6px 14px;border-radius:20px;margin-bottom:16px;">
      Nueva solicitud de permiso
    </div>
    <h2 style="margin:0 0 4px;color:#111827;font-size:18px;">${esc(nombre)}</h2>
    <p style="margin:0 0 24px;color:#706F6F;font-size:13px;">${esc(correo)}</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:34%;padding:0 12px 0 0;vertical-align:top;">
          <p style="${etiqueta}">Tipo</p>
          <span style="display:inline-block;background-color:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:700;padding:5px 10px;border-radius:8px;">${esc(tipo)}</span>
        </td>
        <td style="width:33%;padding:0 12px;vertical-align:top;border-left:1px solid #e5e7eb;">
          <p style="${etiqueta}">Desde</p>
          <p style="${valor}">${esc(fechaInicio)}</p>
        </td>
        <td style="width:33%;padding:0 0 0 12px;vertical-align:top;border-left:1px solid #e5e7eb;">
          <p style="${etiqueta}">Hasta</p>
          <p style="${valor}">${esc(fechaFin)}</p>
        </td>
      </tr>
    </table>
    ${bloqueObservacion}
    ${botonPanel}
  </div>
  <div style="text-align:center;padding:16px;color:#A3A2A2;font-size:11px;">
    Notificación automática — Sistema de Asignación El Libertador
  </div>
</div>`;
}

// Correo al analista con la decisión (aprobado/rechazado) de su solicitud de permiso.
// Mismo lenguaje visual que _construirCorreoNuevoPermiso_, pero con tono e íconos
// distintos según la decisión — celebratorio si se aprueba, respetuoso si no.
function _construirCorreoResolucionPermiso_(nombre, tipo, fechaInicio, fechaFin, decision, observacionAdmin) {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const etiqueta = 'color:#706F6F;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;';
  const valor = 'color:#111827;font-size:14px;font-weight:700;margin:0;';
  const esAprobado = decision === 'APROBADO';

  const badge = esAprobado
    ? `<div style="display:inline-block;background-color:#dcfce7;color:#15803d;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:6px 14px;border-radius:20px;margin-bottom:16px;">✓ Permiso aprobado</div>`
    : `<div style="display:inline-block;background-color:#f1f5f9;color:#475569;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:6px 14px;border-radius:20px;margin-bottom:16px;">Solicitud no aprobada</div>`;

  const mensaje = esAprobado
    ? `¡Buenas noticias, <b>${esc(nombre)}</b>! Tu solicitud de <b>${esc(tipo)}</b> fue aprobada.`
    : `Hola <b>${esc(nombre)}</b>, tu solicitud de <b>${esc(tipo)}</b> no fue aprobada en esta ocasión.`;

  const bloqueObservacion = observacionAdmin ? `
    <div style="background-color:#f8fafc;border-left:3px solid ${esAprobado ? '#15803d' : '#253150'};border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:24px;">
      <p style="${etiqueta}">${esAprobado ? 'Nota del administrador' : 'Motivo'}</p>
      <p style="margin:0;color:#374151;font-size:13px;line-height:1.5;">${esc(observacionAdmin)}</p>
    </div>` : '';

  const cierre = esAprobado
    ? 'Recuerda marcar tu estado correspondiente en el sistema cuando inicie tu permiso. ¡Que salga todo bien!'
    : 'Si tienes dudas sobre esta decisión, comunícate con tu coordinador.';

  return `
<div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background-color:#F4F5F8;padding:24px;">
  <div style="background-color:#253150;background:linear-gradient(135deg,#161e33 0%,#253150 60%,#3a4d7a 100%);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.5px;">El Libertador</div>
    <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:4px;">Sistema de Asignación de Solicitudes</div>
  </div>
  <div style="background-color:#ffffff;padding:32px;border-radius:0 0 16px 16px;">
    ${badge}
    <p style="margin:0 0 24px;color:#111827;font-size:14px;line-height:1.6;">${mensaje}</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:34%;padding:0 12px 0 0;vertical-align:top;">
          <p style="${etiqueta}">Tipo</p>
          <span style="display:inline-block;background-color:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:700;padding:5px 10px;border-radius:8px;">${esc(tipo)}</span>
        </td>
        <td style="width:33%;padding:0 12px;vertical-align:top;border-left:1px solid #e5e7eb;">
          <p style="${etiqueta}">Desde</p>
          <p style="${valor}">${esc(fechaInicio)}</p>
        </td>
        <td style="width:33%;padding:0 0 0 12px;vertical-align:top;border-left:1px solid #e5e7eb;">
          <p style="${etiqueta}">Hasta</p>
          <p style="${valor}">${esc(fechaFin)}</p>
        </td>
      </tr>
    </table>
    ${bloqueObservacion}
    <p style="margin:0;color:#706F6F;font-size:13px;line-height:1.5;">${cierre}</p>
  </div>
  <div style="text-align:center;padding:16px;color:#A3A2A2;font-size:11px;">
    Notificación automática — Sistema de Asignación El Libertador
  </div>
</div>`;
}

function verificarPermisoVigenteHoy() {
  try {
    const ss = _abrirSSCacheado(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName('Permisos_Incapacidades');
    if (!hoja || hoja.getLastRow() <= 1) return { tienePermiso: false };
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
    const data = hoja.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][8]).toUpperCase().trim() !== 'APROBADO') continue;
      if (String(data[i][2]).toLowerCase().trim() !== userEmail) continue;
      const fi = data[i][5] instanceof Date ? Utilities.formatDate(data[i][5], TIMEZONE, 'yyyy-MM-dd') : String(data[i][5]).trim().substring(0, 10);
      const ff = data[i][6] instanceof Date ? Utilities.formatDate(data[i][6], TIMEZONE, 'yyyy-MM-dd') : String(data[i][6]).trim().substring(0, 10);
      if (hoyStr >= fi && hoyStr <= ff) {
        return { tienePermiso: true, tipo: String(data[i][4]).trim() };
      }
    }
    return { tienePermiso: false };
  } catch (e) {
    return { tienePermiso: false };
  }
}

// Recorre ambos Historico_Gestiones UNA vez y arma el conteo de "cerradas hoy" de
// TODAS las analistas a la vez (no solo la que llamó) — así una sola pasada sirve
// para cachear y repartir entre todo el equipo en obtenerGestionesHoyCruzadas().
function _calcularGestionesHoyTodos(hoyStr) {
  const totales = {}; // email -> { digital, reestudios }
  function sumar(email, campo) {
    if (!email) return;
    if (!totales[email]) totales[email] = { digital: 0, reestudios: 0 };
    totales[email][campo]++;
  }

  // 1. Contar desde Historico_Gestiones del warehouse (digitales, biometría, inducciones)
  // Usa memo _getHistGestionesPrincipal() — evita network round-trip si ya se leyó
  try {
    const _tScanHistG0 = Date.now();
    const dataHistG = _getHistGestionesPrincipal();
    Logger.log('⏱ SPERF _calcularGestionesHoyTodos: Historico_Gestiones principal (' + dataHistG.length + ' filas) obtenido en ' + (Date.now() - _tScanHistG0) + 'ms');
    for (let i = 0; i < dataHistG.length; i++) {
      const asignado = String(dataHistG[i][25]).trim().toLowerCase(); // col 26 (idx 25)
      const fechaFin = String(dataHistG[i][26]).trim();               // col 27 (idx 26)
      if (fechaFin.includes(hoyStr)) sumar(asignado, 'digital');
    }
  } catch(e) { Logger.log("_calcularGestionesHoyTodos Hist: " + e.message); }

  // 2. Contar desde Historico_Gestiones de ssReestudios
  // Usa memo _getHistGestionesReest() — evita network round-trip si ya se leyó
  try {
    const _tScanHistR0 = Date.now();
    const dataReest = _getHistGestionesReest();
    Logger.log('⏱ SPERF _calcularGestionesHoyTodos: Historico_Gestiones reestudios (' + dataReest.length + ' filas) obtenido en ' + (Date.now() - _tScanHistR0) + 'ms');
    for (let i = 0; i < dataReest.length; i++) {
      const asignado = String(dataReest[i][6]).trim().toLowerCase(); // col G (idx 6)
      const fechaFin = String(dataReest[i][9]).trim();               // col J (idx 9)
      if (fechaFin.includes(hoyStr)) sumar(asignado, 'reestudios');
    }
  } catch (e) {
    Logger.log("_calcularGestionesHoyTodos Reest: " + e.message);
  }

  return totales;
}

// Antes esta función recorría Historico_Gestiones completo (que solo crece y nunca
// se archiva) en CADA login/refresco de CADA analista — con el histórico ya grande
// eso hacía lento el ingreso a la plataforma para todos. Ahora el cálculo (para
// todas las analistas a la vez) se cachea 60s compartido entre todo el equipo
// (mismo patrón de _getDataUsuarios(), Código.js:248): como máximo se recorre el
// histórico una vez por minuto sin importar cuánta gente entre a la vez, y el
// número siempre es el cálculo real (nunca puede desincronizarse) — solo puede
// tardar hasta 60s en reflejar el cierre más reciente.
function obtenerGestionesHoyCruzadas() {
  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, "dd/MM/yyyy");
    const cacheKey = 'GESTIONES_HOY_' + hoyStr;

    let totales = null;
    try {
      const cached = CacheService.getScriptCache().get(cacheKey);
      if (cached) totales = JSON.parse(cached);
    } catch (e) {}

    if (!totales) {
      Logger.log('⏱ SPERF obtenerGestionesHoyCruzadas: CACHE MISS — recalculando desde ambas hojas Historico_Gestiones');
      const _tCalc0 = Date.now();
      totales = _calcularGestionesHoyTodos(hoyStr);
      Logger.log('⏱ SPERF obtenerGestionesHoyCruzadas: _calcularGestionesHoyTodos total = ' + (Date.now() - _tCalc0) + 'ms');
      try {
        CacheService.getScriptCache().put(cacheKey, JSON.stringify(totales), 60);
      } catch (e) {
        Logger.log('⏱ SPERF obtenerGestionesHoyCruzadas: cache.put falló (' + e.message + ') — probablemente supera el límite de 100KB de CacheService, así que NUNCA queda cacheado y cada carga de panel repite el escaneo completo.');
      }
    } else {
      Logger.log('⏱ SPERF obtenerGestionesHoyCruzadas: cache hit');
    }

    const mio = totales[userEmail] || { digital: 0, reestudios: 0 };
    return {
      hoyTotal: mio.digital + mio.reestudios,
      detalle: { digital: mio.digital, reestudios: mio.reestudios }
    };
  } catch (e) {
    Logger.log("Error en obtenerGestionesHoyCruzadas: " + e.message);
    return { hoyTotal: 0, detalle: { digital: 0, reestudios: 0 } };
  }
}

/**
 * Obtiene el detalle completo de las gestiones del día actual para el analista logueado.
 * Consulta ambas fuentes: hoja principal (digitales) y hoja de reestudios.
 *
 * @returns {Object} { success, total, porTipo: [{tipo, cantidad}], listado: [{solicitud, tipo, horaGestion, fuente}] }
 */
function obtenerDetalleGestionesHoy() {
  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, "dd/MM/yyyy");
    const listado = [];

    // 1. Desde Historico_Gestiones del warehouse (digitales, biometría, inducciones)
    try {
      const hojaHistDet = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID)
                            .getSheetByName("Historico_Gestiones");
      if (hojaHistDet && hojaHistDet.getLastRow() > 1) {
        const colsDet = Math.max(61, hojaHistDet.getLastColumn());
        const dataHDet = hojaHistDet.getRange(2, 1, hojaHistDet.getLastRow() - 1, colsDet).getDisplayValues();
        for (let i = 0; i < dataHDet.length; i++) {
          const asignado = String(dataHDet[i][25]).trim().toLowerCase();
          const fechaFin = String(dataHDet[i][26]).trim();
          if (asignado === userEmail && fechaFin.includes(hoyStr)) {
            const partes = fechaFin.split(' ');
            const tipoLabels = { digital: 'Digital', desaplazamiento: 'Desaplazamiento', induccion: 'Inducción' };
            var tipoId = String(dataHDet[i][60] || '').trim();
            if (!tipoId || !tipoLabels[tipoId]) {
              const clH = String(dataHDet[i][20]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
              const estH = String(dataHDet[i][16]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
              const estHSinGuion = estH.replace(/_/g, ' ');
              tipoId = 'digital';
              if (estHSinGuion === 'APROBADO PENDIENTE BIOMETRIA' || estH === 'APROBADO_PENDIENTE_BIOMETRIA') tipoId = 'desaplazamiento';
              else if (clH === 'INDUCCION') tipoId = 'induccion';
            }
            listado.push({
              solicitud: String(dataHDet[i][0]).trim(),
              tipo: tipoLabels[tipoId] || tipoId,
              horaGestion: partes.length > 1 ? partes[1].substring(0, 5) : '',
              fuente: 'DIGITAL',
              resultado: String(dataHDet[i][16] || '').trim(),
              observaciones: String(dataHDet[i][23] || '').trim()
            });
          }
        }
      }
    } catch(e) { Logger.log("obtenerDetalleGestionesHoy Hist: " + e.message); }

    // 2. Reestudios — Historico_Gestiones de ssReestudios (casos movidos al asignar y ya gestionados)
    try {
      const hojaHistReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS)
                              .getSheetByName("Historico_Gestiones");
      if (hojaHistReest && hojaHistReest.getLastRow() > 1) {
        const data = hojaHistReest.getRange(2, 1, hojaHistReest.getLastRow() - 1, 14).getDisplayValues();
        for (let i = 0; i < data.length; i++) {
          const asignado = String(data[i][6]).trim().toLowerCase(); // col G
          const fechaFin = String(data[i][9]).trim();               // col J
          if (asignado === userEmail && fechaFin.includes(hoyStr)) {
            const partes = fechaFin.split(' ');
            const origenR = String(data[i][3]).toUpperCase().trim();
            const tipoPR = String(data[i][4]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
            var tipoLabelR = 'Reestudios';
            if (tipoPR.includes("BIOMETRIA FALLIDA")) tipoLabelR = 'Biometría Fallida';
            else if (origenR === "CORREO" && tipoPR === "NUEVA") tipoLabelR = 'Nueva UAR';
            else if (origenR === "CORREO" && tipoPR === "ADICIONAL") tipoLabelR = 'Deudor UAR';
            else if (tipoPR === "REESTUDIO") tipoLabelR = 'Reestudios';
            listado.push({
              solicitud: String(data[i][1]).trim(),
              tipo: tipoLabelR,
              horaGestion: partes.length > 1 ? partes[1].substring(0, 5) : '',
              fuente: 'REESTUDIO',
              resultado: String(data[i][10] || '').trim(),
              observaciones: String(data[i][13] || '').trim()
            });
          }
        }
      }
    } catch (eReest) {
      Logger.log("obtenerDetalleGestionesHoy - Error en reestudios: " + eReest.message);
    }

    // Agrupar por tipo de proceso
    const mapaT = {};
    listado.forEach(function(item) {
      const k = item.tipo || 'Otro';
      mapaT[k] = (mapaT[k] || 0) + 1;
    });
    const porTipo = Object.keys(mapaT).map(function(k) {
      return { tipo: k, cantidad: mapaT[k] };
    }).sort(function(a, b) { return b.cantidad - a.cantidad; });

    // Ordenar por hora descendente (más reciente primero)
    listado.sort(function(a, b) { return b.horaGestion.localeCompare(a.horaGestion); });

    return { success: true, total: listado.length, porTipo: porTipo, listado: listado };
  } catch (e) {
    Logger.log("Error en obtenerDetalleGestionesHoy: " + e.message);
    return { success: false, total: 0, porTipo: [], listado: [] };
  }
}
