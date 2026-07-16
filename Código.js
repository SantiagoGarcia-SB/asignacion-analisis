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
// Si algo se desincroniza (edición manual, error), admin_recalcularContadores()
// (Admin.js) los reconstruye desde cero escaneando el histórico una sola vez.

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
  estado.datos[key] = Math.max(0, (estado.datos[key] || 0) - 1);
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
  datos[email] = Math.max(0, (datos[email] || 0) + delta);
  _guardarCargaPendienteTodos(datos);
}

function _obtenerCargaPendienteAnalista(userEmail) {
  var email = String(userEmail).toLowerCase().trim();
  var datos = _leerCargaPendienteTodos();
  return datos[email] || 0;
}

// Se llama justo al asignar un caso nuevo (MotorAsignacion.js).
function _registrarAsignacionContador(userEmail, tipo, solicitudId) {
  _incrementarContadorCupo(userEmail, tipo);
  _ajustarCargaPendiente(userEmail, 1);
  if (solicitudId) _agregarCasoAbierto(userEmail, solicitudId);
}

// Se llama al cerrar un caso (las 3 funciones de "guardar gestión").
// fechaAsignacionOriginal es la fecha que ya tenía el caso antes de cerrarlo.
// Optimizado: usa getProperties/setProperties batch para minimizar roundtrips.
function _registrarCierreContador(userEmail, tipo, fechaAsignacionOriginal, solicitudId) {
  var email = String(userEmail).toLowerCase().trim();
  if (!email) return;

  // Remover del índice de casos abiertos
  if (solicitudId) _removerCasoAbierto(email, solicitudId);

  var props = PropertiesService.getScriptProperties();
  // 1 sola lectura batch en vez de 2 getProperty individuales
  var allProps = props.getProperties();
  var hoy = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');

  // --- Ajustar carga pendiente (-1) ---
  var cargaRaw = allProps[_PROP_CARGA_PENDIENTE];
  var cargaDatos;
  try { cargaDatos = cargaRaw ? JSON.parse(cargaRaw) : {}; } catch (e) { cargaDatos = {}; }
  cargaDatos[email] = Math.max(0, (cargaDatos[email] || 0) - 1);

  // --- Incrementar cupo si la asignación NO fue hoy ---
  var cupoRaw = allProps[_PROP_CONTADORES_CUPO];
  var cupoEstado;
  try { cupoEstado = cupoRaw ? JSON.parse(cupoRaw) : { fecha: hoy, datos: {} }; } catch (e) { cupoEstado = { fecha: hoy, datos: {} }; }
  if (cupoEstado.fecha !== hoy) cupoEstado = { fecha: hoy, datos: {} };

  if (tipo && !_fechaEsHoyYMD(fechaAsignacionOriginal)) {
    var key = email + '|' + tipo;
    cupoEstado.datos[key] = (cupoEstado.datos[key] || 0) + 1;
  }

  // 1 sola escritura batch en vez de 2 setProperty individuales
  props.setProperties({
    [_PROP_CARGA_PENDIENTE]: JSON.stringify(cargaDatos),
    [_PROP_CONTADORES_CUPO]: JSON.stringify(cupoEstado)
  });
}

function _derivarTipoReestudio(origenNorm, tipoPNorm) {
  if (tipoPNorm.indexOf("BIOMETRIA FALLIDA") !== -1) return 'biometriaFallida';
  if (origenNorm === "CORREO" && tipoPNorm === "NUEVA") return 'nuevaUar';
  if (origenNorm === "CORREO" && tipoPNorm === "ADICIONAL") return 'deudorUar';
  // "Asegurada" se cuenta como nuevaUar (misma cola/cupo), sin perder el rastro: el texto
  // original queda intacto en claseDeSolicitud, solo el bucket de cupo es nuevaUar.
  if (origenNorm === "CORREO" && tipoPNorm === "ASEGURADA") return 'nuevaUar';
  if (tipoPNorm === "REESTUDIO") return 'reestudio';
  return null;
}

// ============================================================
// ÍNDICE DE CASOS ABIERTOS (evita leer Historico_Gestiones al cargar panel)
// ============================================================
// JSON en PropertiesService con los IDs de solicitudes abiertas por analista.
// Se actualiza en los mismos puntos que los contadores (asignar, cerrar, desasignar).
// Si se desincroniza: admin_recalcularContadores() lo reconstruye desde cero.

const _PROP_CASOS_ABIERTOS = 'CASOS_ABIERTOS';

function _leerCasosAbiertos() {
  var raw = PropertiesService.getScriptProperties().getProperty(_PROP_CASOS_ABIERTOS);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) {}
  }
  return {};
}

function _guardarCasosAbiertos(obj) {
  PropertiesService.getScriptProperties().setProperty(_PROP_CASOS_ABIERTOS, JSON.stringify(obj));
}

function _agregarCasoAbierto(userEmail, solicitudId) {
  var email = String(userEmail).toLowerCase().trim();
  var id = String(solicitudId).trim();
  if (!email || !id) return;
  var datos = _leerCasosAbiertos();
  if (!datos[email]) datos[email] = [];
  if (datos[email].indexOf(id) === -1) datos[email].push(id);
  _guardarCasosAbiertos(datos);
}

function _removerCasoAbierto(userEmail, solicitudId) {
  var email = String(userEmail).toLowerCase().trim();
  var id = String(solicitudId).trim();
  if (!email || !id) return;
  var datos = _leerCasosAbiertos();
  if (!datos[email]) return;
  datos[email] = datos[email].filter(function(x) { return x !== id; });
  if (datos[email].length === 0) delete datos[email];
  _guardarCasosAbiertos(datos);
}

function _moverCasoAbierto(emailOrigen, emailDestino, solicitudId) {
  var id = String(solicitudId).trim();
  if (!id) return;
  var datos = _leerCasosAbiertos();
  var origen = String(emailOrigen).toLowerCase().trim();
  var destino = String(emailDestino).toLowerCase().trim();
  if (datos[origen]) {
    datos[origen] = datos[origen].filter(function(x) { return x !== id; });
    if (datos[origen].length === 0) delete datos[origen];
  }
  if (destino) {
    if (!datos[destino]) datos[destino] = [];
    if (datos[destino].indexOf(id) === -1) datos[destino].push(id);
  }
  _guardarCasosAbiertos(datos);
}

function _obtenerCasosAbiertosAnalista(userEmail) {
  var email = String(userEmail).toLowerCase().trim();
  var datos = _leerCasosAbiertos();
  return datos[email] || [];
}
// CACHÉ CORTA DE USUARIOS (evita releer la hoja completa en cada acción)
// ============================================================
// TTL de 30s: si un admin cambia equipo/estado/cupos de un analista, el
// cambio tarda como máximo 30s en reflejarse (además se invalida al instante
// desde admin_actualizarAnalista / admin_crearUsuario en Admin.js).

function _getDataUsuarios(forzarRelectura) {
  var cache = CacheService.getScriptCache();
  if (!forzarRelectura) {
    try {
      var cached = cache.get('USUARIOS_DATA');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
  }
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName("Usuarios");
  var datos = hoja ? hoja.getDataRange().getDisplayValues() : [];
  try { cache.put('USUARIOS_DATA', JSON.stringify(datos), 30); } catch (e) {}
  return datos;
}

function _invalidarCacheUsuarios() {
  try { CacheService.getScriptCache().remove('USUARIOS_DATA'); } catch (e) {}
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
  var userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  var info = getRolUsuario(userEmail);
  if (!info) return { tabla: [], stats: { hoy: 0, pendientes: 0 }, equipoId: '', equipoNombre: '' };

  var equipo = resolverEquipoDesdeEspecialidad(info.especialidad);
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
      tipoVista: 'REESTUDIOS'
    };
  }

  // Digital, Biometría, Inducción y cualquier otro equipo
  var data = getTableData();
  return {
    tabla: data.tabla || [],
    stats: data.stats || { hoy: 0, pendientes: 0 },
    reasignaciones: data.reasignaciones || [],
    equipoId: equipo.id,
    equipoNombre: equipo.nombre,
    tipoVista: 'DIGITAL'
  };
}

// Junta en una sola llamada al servidor lo que antes eran 4 llamadas separadas
// desde cargarDatos() (main.js.html): tabla, cupos, pendientes de validación y
// conteo cruzado del día. Cada pieza queda en su propio try/catch para que si
// una falla, no tumbe a las demás — el cliente revisa response.tabla.error,
// etc., igual que revisaba cada respuesta individual antes.
function cargarPanelAnalista() {
  var resultado = { tabla: null, cupos: null, pendientesValidacion: [], gestionesHoyCruzadas: null };

  try {
    resultado.tabla = getUnifiedTableData();
  } catch (e) {
    resultado.tabla = { error: e.message, tabla: [] };
  }

  try {
    resultado.cupos = verificarMisCupos();
  } catch (e) {
    resultado.cupos = { cumplido: false, totalUsado: 0, totalLimite: 0, resumen: [], mensaje: '' };
  }

  try {
    resultado.pendientesValidacion = obtenerCasosPendientesAnalista();
  } catch (e) {
    resultado.pendientesValidacion = [];
  }

  try {
    resultado.gestionesHoyCruzadas = obtenerGestionesHoyCruzadas();
  } catch (e) {
    resultado.gestionesHoyCruzadas = { hoyTotal: 0, detalle: { digital: 0, reestudios: 0 } };
  }

  return resultado;
}

function autoAsignarDesdeEquipo() {
  var userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  var info = getRolUsuario(userEmail);
  if (!info) return { success: false, message: "Usuario no registrado." };

  var equipo = resolverEquipoDesdeEspecialidad(info.especialidad);

  return RequestLeadUnificado(equipo.id);
}

function getEquipoDelUsuario() {
  var userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  var info = getRolUsuario(userEmail);
  if (!info) return null;
  return resolverEquipoDesdeEspecialidad(info.especialidad);
}

function getTableData() {
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  const userEmail = (Session.getActiveUser().getEmail() || "usuario@prueba.com").toLowerCase();

  if (!sheet) return { tabla: [], stats: { hoy: 0, total: 0 } };
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return { tabla: [], stats: { hoy: 0, total: 0 } };

  const numCols = sheet.getLastColumn();
  const data = sheet.getRange(1, 1, lastRow, numCols).getDisplayValues();
  const headers = data[0];
  const registros = data.slice(1);

  const hojaScore = ss.getSheetByName("score");
  const mapaScore = new Map();
  const mapaInmobiliaria = new Map();
  if (hojaScore) {
    const dataScore = hojaScore.getDataRange().getDisplayValues();
    for (let i = 1; i < dataScore.length; i++) {
      let pol = String(dataScore[i][0]).trim();
      let polNorm = pol.replace(/\D/g, '').replace(/^0+/, '');
      let categoria = String(dataScore[i][2] || "").trim().toUpperCase();
      let inmobiliaria = String(dataScore[i][3] || "").trim();

      if (pol) { mapaScore.set(pol, categoria); mapaInmobiliaria.set(pol, inmobiliaria); }
      if (polNorm) { mapaScore.set(polNorm, categoria); mapaInmobiliaria.set(polNorm, inmobiliaria); }
    }
  }
  headers.push("CategoriaScore");
  headers.push("Inmobiliaria"); 

  const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, "dd/MM/yyyy");
  
  let gestionadasHoy = 0;
  let gestionadasTotal = 0;

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

  // 1. Historico_Gestiones — casos ya movidos al asignar (nueva lógica)
  // Usa el índice de casos abiertos (PropertiesService) para saber CUÁLES IDs buscar,
  // en vez de TextFinder sobre toda la columna de email (que trae 1000+ matches para
  // analistas con historia larga). Solo lee las filas puntuales de los ~3-5 pendientes.
  const idsAbiertos = _obtenerCasosAbiertosAnalista(userEmail);
  try {
    const hojaHist = ss.getSheetByName("Historico_Gestiones");
    const lastRowHist = hojaHist ? hojaHist.getLastRow() : 0;
    if (hojaHist && lastRowHist > 1 && idsAbiertos.length > 0) {
      const colsHist = Math.max(numCols, 60);
      for (var ia = 0; ia < idsAbiertos.length; ia++) {
        var matchId = hojaHist.getRange(2, 1, lastRowHist - 1, 1).createTextFinder(idsAbiertos[ia]).matchEntireCell(true).findNext();
        if (matchId) {
          var filaHist = hojaHist.getRange(matchId.getRow(), 1, 1, colsHist).getDisplayValues()[0];
          agregarDesdeRegistros([filaHist], 'HISTORICO');
        }
      }
    }
  } catch(e) { Logger.log("getTableData Historico: " + e.message); }

  // 2. solicitud — casos legados aún no migrados
  agregarDesdeRegistros(registros, 'SOLICITUD');

  // 3. Reestudios: Historico_Gestiones (nueva lógica) + ORIGEN (legados)
  try {
    const ssReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hojaReest = ssReest.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (hojaReest) {
      const lastRowR = hojaReest.getLastRow();
      if (lastRowR > 1) {
        const dataReest = hojaReest.getRange(2, 1, lastRowR - 1, 14).getDisplayValues();
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
          filaAdaptada[24] = String(dataReest[i][13] || "").trim(); // observaciones (nota del radicador, col N de ORIGEN)
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
  // Usa el índice de casos abiertos: busca por ID puntual en vez de TextFinder
  // sobre toda la columna de email (misma lógica que bloque 1 arriba).
  try {
    const ssReestH = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hojaHistReest = ssReestH.getSheetByName("Historico_Gestiones");
    const lastRowHistReest = hojaHistReest ? hojaHistReest.getLastRow() : 0;
    // Los IDs de reestudios están en el mismo índice (_obtenerCasosAbiertosAnalista).
    // Los que ya se encontraron en el bloque 1 (principal) no van a matchear aquí
    // porque están en spreadsheets distintos — no hay riesgo de duplicado.
    if (hojaHistReest && lastRowHistReest > 1 && idsAbiertos && idsAbiertos.length > 0) {
      for (var ir = 0; ir < idsAbiertos.length; ir++) {
        // En reestudios, el ID de solicitud está en col B (2), no col A (1)
        var matchIdR = hojaHistReest.getRange(2, 2, lastRowHistReest - 1, 1).createTextFinder(idsAbiertos[ir]).matchEntireCell(true).findNext();
        if (!matchIdR) continue;
        var rowHR = matchIdR.getRow();
        var dataHistReest = hojaHistReest.getRange(rowHR, 1, 1, 18).getDisplayValues()[0];
        var asignadoHR = String(dataHistReest[6]).trim().toLowerCase();
        var fechaFinHR = String(dataHistReest[9]).trim();
        var fechaAsigHR = String(dataHistReest[8]).trim();

        if (asignadoHR !== userEmail) continue;
        if (fechaFinHR !== "" || fechaAsigHR === "") continue;

        var tipoProcHR = String(dataHistReest[4]).trim();
        var claseHR = String(dataHistReest[5]).trim();
        var filaAdaptada = new Array(numCols).fill("");
        filaAdaptada[0] = String(dataHistReest[1]).trim();
        filaAdaptada[1] = String(dataHistReest[3]).trim();
        filaAdaptada[2] = String(dataHistReest[2]).trim();
        filaAdaptada[3] = String(dataHistReest[3]).trim();
        filaAdaptada[4] = tipoProcHR;
        filaAdaptada[5] = claseHR;
        filaAdaptada[8] = fechaAsigHR;
        filaAdaptada[16] = "__REESTUDIO__";
        filaAdaptada[17] = String(dataHistReest[0]).trim();
        filaAdaptada[20] = tipoProcHR || claseHR;
        filaAdaptada[24] = String(dataHistReest[13] || "").trim(); // observaciones (nota del radicador, col N)
        filaAdaptada[26] = fechaAsigHR;
        filaAdaptada[27] = asignadoHR;
        filaAdaptada[28] = "";
        filaAdaptada[30] = String(dataHistReest[7]).trim();
        filaAdaptada.push("");
        misFilasPendientes.push(filaAdaptada);
      }
    }
  } catch(e) {
    Logger.log("Error incluyendo reestudios historico en getTableData: " + e.message);
  }

  // Detectar reasignaciones recientes por admin (últimos 30 min)
  // Busca SOLO entre los casos abiertos del analista (idsAbiertos) en vez de
  // hacer findAll() en toda la columna de emails (que puede traer cientos de
  // matches para analistas con historial largo). Mucho más rápido.
  var reasignaciones = [];
  try {
    var ahora = new Date();
    var hace30 = new Date(ahora.getTime() - 30 * 60 * 1000);
    if (idsAbiertos.length > 0) {
      // Principal: col 38 (idx 37) — marca de reasignación admin
      var hojaHistCheck = ss.getSheetByName("Historico_Gestiones");
      var lastRowCheck = hojaHistCheck ? hojaHistCheck.getLastRow() : 0;
      if (hojaHistCheck && lastRowCheck > 1) {
        var lastCol = Math.max(38, hojaHistCheck.getLastColumn());
        for (var ic = 0; ic < idsAbiertos.length; ic++) {
          var matchCheck = hojaHistCheck.getRange(2, 1, lastRowCheck - 1, 1).createTextFinder(idsAbiertos[ic]).matchEntireCell(true).findNext();
          if (!matchCheck) continue;
          var filaCheck = hojaHistCheck.getRange(matchCheck.getRow(), 1, 1, lastCol).getDisplayValues()[0];
          var marca = String(filaCheck[37] || "").trim();
          if (!marca.startsWith("ADMIN:")) continue;
          var partes = marca.split("|");
          if (partes.length >= 2) {
            var fechaMarca = new Date(partes[1].trim());
            if (!isNaN(fechaMarca.getTime()) && fechaMarca >= hace30) {
              reasignaciones.push({ solicitud: String(filaCheck[0]).trim(), admin: partes[0].replace("ADMIN:","") });
            }
          }
        }
      }
      // Reestudios: col 20 (idx 19) — marca de reasignación admin
      var ssReestCheck = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
      var hojaHistRCheck = ssReestCheck.getSheetByName("Historico_Gestiones");
      var lastRowRCheck = hojaHistRCheck ? hojaHistRCheck.getLastRow() : 0;
      if (hojaHistRCheck && lastRowRCheck > 1) {
        for (var irc = 0; irc < idsAbiertos.length; irc++) {
          var matchRCheck = hojaHistRCheck.getRange(2, 2, lastRowRCheck - 1, 1).createTextFinder(idsAbiertos[irc]).matchEntireCell(true).findNext();
          if (!matchRCheck) continue;
          var filaRCheck = hojaHistRCheck.getRange(matchRCheck.getRow(), 1, 1, 20).getDisplayValues()[0];
          var marcaR = String(filaRCheck[19] || "").trim();
          if (!marcaR.startsWith("ADMIN:")) continue;
          var partesR = marcaR.split("|");
          if (partesR.length >= 2) {
            var fechaMarcaR = new Date(partesR[1].trim());
            if (!isNaN(fechaMarcaR.getTime()) && fechaMarcaR >= hace30) {
              reasignaciones.push({ solicitud: String(filaRCheck[1]).trim(), admin: partesR[0].replace("ADMIN:","") });
            }
          }
        }
      }
    }
  } catch(eR) { Logger.log("Detección reasignación: " + eR.message); }

  return {
    tabla: [headers, ...misFilasPendientes],
    stats: {
      hoy: gestionadasHoy,
      total: gestionadasTotal
    },
    reasignaciones: reasignaciones
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
            // Si la solicitud ya existía en la cola "solicitud" con otro estado (p.ej.
            // EN_ESTUDIO), debe eliminarse de ahí para que siga el flujo correcto de
            // biometría (WA → escalación → llamada). Sin esto queda duplicada.
            // NOTA: eliminarSolicitudesFinalizadas() protege las filas que YA tienen
            // APROBADO_PENDIENTE_BIOMETRIA en la hoja (escaladas por _procesarCortePendientes),
            // así que este add() solo surte efecto para filas con otro estado previo.
            const solIdBio = String(item.consecutive || "").trim();
            if (solIdBio) idsFinalizadas.add(solIdBio);
            return;
          }

          if (rc === "501") {
            return;
          }

          if (String(item.mainResultCode) === "2" && !estadoExcluido && !tipoExcluido) {
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
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
  } catch (e) {
    Logger.log("❌ Lock no disponible para limpiar finalizadas (se reintenta en próximo ciclo): " + e.message);
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
    const filasFinales = datos.filter(row => {
      const solId = String(row[0]).trim();
      if (!idsAEliminar.has(solId)) return true; // no está en la lista de borrado, se queda
      // Proteger solicitudes que ya están en cola de asignación con estado
      // APROBADO_PENDIENTE_BIOMETRIA: fueron escaladas por _procesarCortePendientes() para
      // que un analista las llame. El sync de SAI las ve con ese mismo estado y las marca
      // como "finalizada" (porque para el sync NO deben ir a la cola normal "solicitud" con
      // otro estado), pero si ya están ahí con APROBADO_PENDIENTE_BIOMETRIA es porque el
      // flujo de biometría las puso — no se deben borrar.
      var estadoEnHoja = String(row[16]).toUpperCase().trim();
      if (estadoEnHoja === "APROBADO_PENDIENTE_BIOMETRIA") return true; // protegida, se queda
      return false; // otro estado → sí se elimina
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
}

// Archiva CODEUDORES_REQUERIDOS antes de borrarlas, para poder revisarlas luego aunque queden fuera de la ventana de fechas de la API.
function moverAListaEsperaCodeudor(lista) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
  } catch (e) {
    Logger.log("❌ Lock no disponible para escribir en pendiente_codeudor (se reintenta en próximo ciclo): " + e.message);
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
  for (let i = 0; i < datos.length; i++) {
    const solicitud = String(datos[i][0]).trim();
    if (!solicitud) continue;

    const fechaRadicacion = new Date(datos[i][1]);
    if (!isNaN(fechaRadicacion.getTime()) && (ahora - fechaRadicacion) > TRES_MESES_MS) {
      filasAEliminar.push(i);
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
        Logger.log(`⚠️ HTTP ${response.getResponseCode()} verificando solicitud ${solicitud} en pendiente_codeudor.`);
        continue;
      }

      const data = JSON.parse(response.getContentText());
      const estado = String(data.studyStatus || "").toUpperCase().trim();

      if (estado === "CODEUDORES_REQUERIDOS") {
        actualizacionesFecha.push({ fila: i + 2, valor: Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd HH:mm:ss") });
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
      Logger.log(`❌ Error verificando solicitud ${solicitud} en pendiente_codeudor: ${e.message}`);
    }
  }

  // === FASE 2: aplicar los cambios a la hoja. Ya no hay llamadas HTTP de por medio,
  // así que el candado dura milisegundos en vez de minutos. ===
  if (actualizacionesFecha.length > 0 || filasAEliminar.length > 0) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(5000);
    } catch (e) {
      Logger.log("❌ Lock no disponible para actualizar pendiente_codeudor (se reintenta en próximo ciclo): " + e.message);
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


function procesarYGuardarLote(listaObjetos) {
  if (!listaObjetos || listaObjetos.length === 0) {
    Logger.log("No hay objetos para guardar en este lote.");
    return;
  }


  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000); 
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

    const filaP = [];
    let duplicadosEvitados = 0;

    listaObjetos.forEach(item => {
      const solId = String(item.solicitud || "").trim();
      if (!solId) return;

      if (setIdsP.has(solId)) {
        duplicadosEvitados++;
        return; 
      }

      const est = String(item.estadoGeneral || "").toUpperCase();
      const fila = new Array(58).fill("");

      fila[0]  = solId;
      fila[1]  = item.poliza || item._polizaAsociada || "";
      fila[2]  = item.identificacionInquilino || "";
      fila[3]  = item.tipoIdentificacion || "";
      fila[4]  = item.nombreInquilino || "";
      fila[5]  = item.correoInquilino || "";
      fila[6]  = item.telefonoInquilino || "";
      fila[7]  = item.ingresos ?? "";
      fila[8]  = item.fechaExpedicion || "";
      fila[9]  = item.canon ?? "";
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
          fila[base]     = cod.nombre || "";
          fila[base + 1] = cod.documento || "";
          fila[base + 2] = cod.tipoDoc || "";
          fila[base + 3] = cod.email || "";
          fila[base + 4] = cod.telefono || "";
          fila[base + 5] = cod.estado || "";
          fila[base + 6] = cod.resultado || "";
        }
      }


      [item.fechaRadicacion, item.fechaResultado].forEach((f, idx) => {
        fila[17 + idx] = _normalizarFechaApiComoTexto(f);
      });

      filaP.push(fila);
      setIdsP.add(solId); 
    });


    if (filaP.length > 0) {
      const rowInicio = hojaP.getLastRow() + 1;
      

      const rangoDestino = hojaP.getRange(rowInicio, 1, filaP.length, 58);
      rangoDestino.setNumberFormat("@");
      rangoDestino.setValues(filaP);
      
      SpreadsheetApp.flush(); 
      Logger.log(`✅ ÉXITO: ${filaP.length} solicitudes nuevas guardadas. Duplicados ignorados: ${duplicadosEvitados}`);
    } else {
      Logger.log(`No se guardó nada. Todo el lote ya existía en la BD. (Duplicados ignorados: ${duplicadosEvitados})`);
    }

  } catch (err) {
  
    Logger.log("❌ ERROR CRÍTICO ESCRIBIENDO EN EXCEL: " + err.message);
    throw err; 
  } finally {
    
    lock.releaseLock();
  }
}

function getSetDeIds(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Set();
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  return new Set(values.flat().map(String).map(s => s.trim()));
}

// ===================================================================
// GUARDADO OMNICANAL DE GESTIONES (VISTA PRINCIPAL)
// ===================================================================

// ===================================================================
// GUARDADO OMNICANAL DE GESTIONES (VISTA PRINCIPAL)
// ===================================================================

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

  // ── FASE 1: LECTURA (sin lock) ──
  // Buscar la fila y calcular tiempos ANTES de tomar el lock — así el lock
  // solo se retiene para las escrituras (~1-2s en vez de ~5-6s).

  let disparaAsignacion = false;
  let usuarioActual = (Session.getActiveUser().getEmail() || "Email No Detectado").toLowerCase();
  let mensajeAdicional = "";

  const ssOrigen = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const ahora = new Date();
  const fechaSoloDia = Utilities.formatDate(ahora, "GMT-5", 'dd/MM/yyyy');

  const esEstadoCierre = estado_q.includes("APROB") || estado_q.includes("NEGAD") || estado_q.includes("RECHAZ");
  disparaAsignacion = esEstadoCierre || estado_q.includes("APLAZ");

  // Determinar ruta (principal vs reestudio) y ubicar fila objetivo
  let ruta = null; // 'A' = principal, 'B' = reestudio
  let targetRow = -1;
  let hojaHistorico = null;
  let filaBase = null;
  let tiempos = null;
  let fechaAsignacion = null;
  let emailAnalista = null;
  let valorClaseActual = null;
  let fechaDiligenciada = null;

  // Reestudio vars
  let ssReestudios = null;
  let hojaHistoricoR = null;
  let targetRowReest = -1;
  let filaReest = null;
  let tiemposR = null;
  let fechaAsiR = null;
  let emailAnalistaR = null;
  let origenNormR = null;
  let tipoPNormR = null;
  let tipoCierreR = null;

  // Buscar en Historico_Gestiones principal
  hojaHistorico = ssOrigen.getSheetByName("Historico_Gestiones");
  if (data.tipoSolicitudActual !== 'reestudio' && hojaHistorico && hojaHistorico.getLastRow() > 1) {
    const lastRowH = hojaHistorico.getLastRow();
    const colIdHist = hojaHistorico.getRange(2, 1, lastRowH - 1, 1);
    const matchesIdHist = colIdHist.createTextFinder(String(data.solicitudId).trim()).matchEntireCell(true).findAll();
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
    ruta = 'A';
    filaBase = hojaHistorico.getRange(targetRow, 1, 1, 37).getValues()[0];
    fechaAsignacion = filaBase[24];
    emailAnalista = String(filaBase[25] || usuarioActual).toLowerCase().trim();
    valorClaseActual = filaBase[20];

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
    tiempos = calcularTiemposCaso(tRadCola, tAsiParsed, ahora, emailAnalista, ssOrigen);
    Logger.log('[guardarCambios] tiempos=' + JSON.stringify(tiempos));

    fechaDiligenciada = (data.tipoSolicitudActual === 'desaplazamiento' || data.tipoSolicitudActual === 'induccion')
      ? (tAsiParsed || '')
      : (data.fecha_radicacion_sai || '');

  } else {
    // Buscar en reestudios
    ssReestudios = SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty('ID_HOJA_REESTUDIOS') || ID_HOJA_REESTUDIOS
    );
    hojaHistoricoR = ssReestudios.getSheetByName("Historico_Gestiones");

    if (hojaHistoricoR && hojaHistoricoR.getLastRow() > 1) {
      const lastRowHR = hojaHistoricoR.getLastRow();
      const colIdHR = hojaHistoricoR.getRange(2, 2, lastRowHR - 1, 1);
      const matchesIdHR = colIdHR.createTextFinder(String(data.solicitudId).trim()).matchEntireCell(true).findAll();
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

    ruta = 'B';
    filaReest = hojaHistoricoR.getRange(targetRowReest, 1, 1, 18).getValues()[0];
    const fechaRadR = filaReest[0];
    fechaAsiR = filaReest[8];
    emailAnalistaR = String(filaReest[6] || usuarioActual).toLowerCase().trim();

    const tRadColaR = _parseFechaGAS(data.fecha_radicacion_sai) || _parseFechaGAS(fechaRadR);
    tiemposR = calcularTiemposCaso(tRadColaR, _parseFechaGAS(fechaAsiR), ahora, emailAnalistaR, ssOrigen);

    origenNormR = String(filaReest[3]).toUpperCase().trim();
    tipoPNormR = String(filaReest[5]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
    tipoCierreR = _derivarTipoReestudio(origenNormR, tipoPNormR) || 'reestudio';
  }

  // ── FASE 2: ESCRITURA (con lock) ──
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch(e) {
    return { success: false, message: "El sistema está muy ocupado guardando gestiones. Por favor, dale a 'Guardar' nuevamente en unos segundos." };
  }

  try {
    if (ruta === 'A') {
      hojaHistorico.getRange(targetRow, 17).setValue(estado_q);
      hojaHistorico.getRange(targetRow, 21).setValue(valorClaseActual);
      hojaHistorico.getRange(targetRow, 23, 1, 2).setValues([[data.biometria || '', data.comentarios_gestion || '']]);
      hojaHistorico.getRange(targetRow, 27).setValue(ahora);
      hojaHistorico.getRange(targetRow, 27).setNumberFormat("dd/mm/yyyy HH:mm:ss");
      hojaHistorico.getRange(targetRow, 29, 1, 3).setValues([[motivo_aplazamiento, motivo_negacion, fechaSoloDia]]);
      hojaHistorico.getRange(targetRow, 34, 1, 4).setValues([[fechaDiligenciada, tiempos.minutos_cola, tiempos.minutos_gestion, tiempos.minutos_general]]);
      if (fechaDiligenciada instanceof Date) hojaHistorico.getRange(targetRow, 34).setNumberFormat("dd/MM/yyyy HH:mm:ss");
      hojaHistorico.getRange(targetRow, 35, 1, 3).setNumberFormat("0.00");
      _registrarCierreContador(emailAnalista, (data.tipoSolicitudActual || 'digital'), fechaAsignacion, data.solicitudId);
    } else {
      hojaHistoricoR.getRange(targetRowReest, 10, 1, 9).setValues([[
        ahora, estado_q, motivo_aplazamiento, motivo_negacion,
        data.comentarios_gestion || '',
        tiemposR.minutos_cola, tiemposR.minutos_gestion, tiemposR.minutos_general,
        data.poliza || ''
      ]]);
      hojaHistoricoR.getRange(targetRowReest, 10).setNumberFormat("dd/mm/yyyy HH:mm:ss");
      hojaHistoricoR.getRange(targetRowReest, 15, 1, 3).setNumberFormat("0.00");
      _registrarCierreContador(emailAnalistaR, tipoCierreR, fechaAsiR, data.solicitudId);
    }

    SpreadsheetApp.flush();

    if (estado_q.includes("APLAZ")) {
      mensajeAdicional = " (La solicitud queda cerrada para tu gestión y guardada en el sistema).";
    }

  } catch (e) {
    return { success: false, message: 'Error de servidor: ' + e.message };
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }

  return {
    success: true,
    message: "Gestión guardada exitosamente" + mensajeAdicional,
    usuario: usuarioActual,
    disparaAsignacion: disparaAsignacion
  };
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
  const resultado = [];

  // Usa el índice de casos abiertos para buscar SOLO los IDs puntuales del analista
  // en vez de leer toda la hoja Historico_Gestiones (que puede tener miles de filas).
  // Mismo patrón optimizado que getTableData() bloque 1.
  const idsAbiertos = _obtenerCasosAbiertosAnalista(userEmail);
  if (!idsAbiertos || idsAbiertos.length === 0) return resultado;

  // Digital: Historico_Gestiones principal — buscar solo por IDs puntuales
  try {
    const hoja = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID).getSheetByName('Historico_Gestiones');
    const lastRow = hoja ? hoja.getLastRow() : 0;
    if (hoja && lastRow > 1) {
      const ncols = Math.max(60, hoja.getLastColumn());
      for (var i = 0; i < idsAbiertos.length; i++) {
        var match = hoja.getRange(2, 1, lastRow - 1, 1).createTextFinder(idsAbiertos[i]).matchEntireCell(true).findNext();
        if (!match) continue;
        var h = hoja.getRange(match.getRow(), 1, 1, ncols).getDisplayValues()[0];
        var email   = String(h[25]).toLowerCase().trim();
        var estadoQ = String(h[16]).trim().toUpperCase();
        if (email !== userEmail) continue;
        if (!ESTADOS_PEND.includes(estadoQ)) continue;
        // Mapeo histToSol para que poblarModalDig reciba la fila en formato correcto
        var s = new Array(58).fill('');
        for (var j = 0; j <= 21; j++) s[j] = h[j];
        s[23] = h[22]; s[24] = h[23];
        s[26] = h[24]; s[27] = h[25]; s[28] = h[26];
        s[30] = h[27]; s[31] = h[28]; s[32] = h[29]; s[33] = h[30];
        s[35] = h[31]; s[36] = h[32];
        for (var k = 0; k < 21; k++) s[37 + k] = h[39 + k] !== undefined ? h[39 + k] : '';
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

  // Reestudio: Historico_Gestiones — buscar solo por IDs puntuales (col B = col 2)
  try {
    const hojaR = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS).getSheetByName('Historico_Gestiones');
    const lastRowR = hojaR ? hojaR.getLastRow() : 0;
    if (hojaR && lastRowR > 1) {
      for (var ir = 0; ir < idsAbiertos.length; ir++) {
        var matchR = hojaR.getRange(2, 2, lastRowR - 1, 1).createTextFinder(idsAbiertos[ir]).matchEntireCell(true).findNext();
        if (!matchR) continue;
        var fila = hojaR.getRange(matchR.getRow(), 1, 1, 18).getDisplayValues()[0];
        var emailR   = String(fila[6]).toLowerCase().trim();
        var estadoQR = String(fila[10]).trim().toUpperCase();
        if (emailR !== userEmail) continue;
        if (!ESTADOS_PEND.includes(estadoQR)) continue;
        var tipoProc = String(fila[4]).trim();
        var claseR   = String(fila[5]).trim();
        var fechaAsi = String(fila[8]).trim();
        var filaAd   = new Array(37).fill('');
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
          estadoQ:            estadoQR,
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
function verificarTurnoActivo(userEmail, ss) {
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

    // 1. Buscar turno vigente del analista (con caché de 90s — los turnos cambian raramente)
    const cache = CacheService.getScriptCache();
    let dataAT;
    const cachedAT = cache.get('TURNOS_ANALISTAS_DATA');
    if (cachedAT) {
      try { dataAT = JSON.parse(cachedAT); } catch (e) { dataAT = null; }
    }
    if (!dataAT) {
      const hojaAT = ss.getSheetByName('Analistas_Turnos');
      if (!hojaAT || hojaAT.getLastRow() <= 1) return { ok: true };
      dataAT = hojaAT.getDataRange().getValues();
      try { cache.put('TURNOS_ANALISTAS_DATA', JSON.stringify(dataAT), 90); } catch (e) {}
    }

    let idTurnoActivo = null;
    for (let i = 1; i < dataAT.length; i++) {
      const r = dataAT[i];
      const email = String(r[0]).toLowerCase().trim();
      if (email !== userEmail) continue;
      const idT = String(r[1]).trim();
      // Tras JSON roundtrip: Date→string (ISO), Number→number (serial de Sheets).
      // Manejar ambos formatos:
      const desde = r[2] instanceof Date ? r[2]
        : (typeof r[2] === 'string' && r[2] ? new Date(r[2])
        : (typeof r[2] === 'number' ? new Date(Math.round((r[2] - 25569) * 86400000)) : null));
      const hasta = r[3] instanceof Date ? r[3]
        : (typeof r[3] === 'string' && r[3] ? new Date(r[3])
        : (typeof r[3] === 'number' ? new Date(Math.round((r[3] - 25569) * 86400000)) : null));
      if (!idT || !desde || isNaN(desde.getTime())) continue;
      if (now >= desde && (!hasta || isNaN(hasta.getTime()) || now <= hasta)) {
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

    // 2. Leer definición del turno (con caché de 90s)
    let dataTurnos, dispTurnos;
    const cachedT = cache.get('TURNOS_DEF_DATA');
    const cachedTD = cache.get('TURNOS_DEF_DISPLAY');
    if (cachedT && cachedTD) {
      try {
        dataTurnos = JSON.parse(cachedT);
        dispTurnos = JSON.parse(cachedTD);
      } catch (e) { dataTurnos = null; }
    }
    if (!dataTurnos) {
      const hojaTurnos = ss.getSheetByName('Turnos');
      if (!hojaTurnos || hojaTurnos.getLastRow() <= 1) {
        return {
          ok: false,
          message: '⏰ Tu turno no está correctamente configurado. Contacta a tu administrador.'
        };
      }
      dataTurnos = hojaTurnos.getDataRange().getValues();
      dispTurnos = hojaTurnos.getDataRange().getDisplayValues();
      try {
        cache.put('TURNOS_DEF_DATA', JSON.stringify(dataTurnos), 90);
        cache.put('TURNOS_DEF_DISPLAY', JSON.stringify(dispTurnos), 90);
      } catch (e) {}
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
function verificarMisCupos(equipo) {
  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
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
    const hojaSol = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
    if (hojaSol) {
      const lastRowS = hojaSol.getLastRow();
      if (lastRowS > 1) {
        const dataSol = hojaSol.getRange(2, 1, lastRowS - 1, 37).getValues();
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
      }
    }

    // Lo que ya está en Historico_Gestiones (asignado o cerrado hoy) se lee de los
    // contadores incrementales en vez de reescanear la hoja completa (ver Código.js,
    // sección "CONTADORES INCREMENTALES DE CUPO Y CARGA").
    const conteoHoyContadorV = _obtenerConteoHoyAnalista(userEmail);
    for (const kv in conteoHoyContadorV) { conteoHoy[kv] = (conteoHoy[kv] || 0) + conteoHoyContadorV[kv]; }

    // Contar desde hoja reestudios (Reestudios + Nueva UAR + Deudor UAR + Biometría Fallida)
    try {
      const ssReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
      const hojaReest = ssReest.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
      if (hojaReest) {
        const lastRowR = hojaReest.getLastRow();
        if (lastRowR > 1) {
          const dataReest = hojaReest.getRange(2, 1, lastRowR - 1, 14).getValues();
          for (let i = 0; i < dataReest.length; i++) {
            const asignado = String(dataReest[i][6]).trim().toLowerCase();
            if (asignado !== userEmail) continue;
            const fechaAsig = dataReest[i][8];
            const fechaFin = dataReest[i][9];
            if (!esHoy(fechaAsig) && !esHoy(fechaFin)) continue;
            const origenR = String(dataReest[i][3]).toUpperCase().trim();
            const tipoPNorm = String(dataReest[i][5]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
            let tipo = null;
            if (tipoPNorm.includes("BIOMETRIA FALLIDA")) tipo = 'biometriaFallida';
            else if (origenR === "CORREO" && tipoPNorm === "NUEVA") tipo = 'nuevaUar';
            else if (origenR === "CORREO" && tipoPNorm === "ADICIONAL") tipo = 'deudorUar';
            else if (origenR === "CORREO" && tipoPNorm === "ASEGURADA") tipo = 'nuevaUar';
            else if (tipoPNorm === "REESTUDIO") tipo = 'reestudio';
            if (tipo) conteoHoy[tipo]++;
          }
        }
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
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "Servidor ocupado, reintenta." };
  }

  try {
    const correoAnalista = Session.getActiveUser().getEmail();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hojaUsuarios = ss.getSheetByName("Usuarios");
    const hojaHistorico = ss.getSheetByName("Historico_Estados");

    const datos = hojaUsuarios.getDataRange().getValues();
    const columnaCorreo = 2; 
    const columnaEstado = 5; 
    const columnaHistorial = 11; 

    let filaEncontrada = -1;
    for (let i = 1; i < datos.length; i++) {
      if (datos[i][columnaCorreo] && datos[i][columnaCorreo].toString().toLowerCase().trim() === correoAnalista.toLowerCase().trim()) {
        filaEncontrada = i + 1;
        break;
      }
    }

    if (filaEncontrada !== -1) {
      const estadoTextoPlano = nuevoEstado.toUpperCase();

      if (estadoTextoPlano === 'ACTIVO') {
        const turnoCheck = verificarTurnoActivo(correoAnalista.toLowerCase().trim(), ss);
        if (!turnoCheck.ok) {
          return { success: false, message: turnoCheck.message };
        }
      }

      const ahora = new Date();
      const fechaDiaHoy = Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd");
      const fechaHoraActual = Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd HH:mm:ss");

      // Cerrar el registro anterior en Historico_Estados (buscar la última fila de este analista con fin "EN CURSO")
      if (hojaHistorico) {
        const lastRowH = hojaHistorico.getLastRow();
        if (lastRowH > 1) {
          // Buscar de abajo hacia arriba para eficiencia
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
                  duracion = Math.round((ahora.getTime() - inicioDate.getTime()) / 60000);
                }
              } catch(e) {}
              hojaHistorico.getRange(filaH, 5).setValue(fechaHoraActual); // col E = fecha+hora fin
              hojaHistorico.getRange(filaH, 6).setValue(duracion);         // col F = duración min
              break;
            }
          }
        }

        // Escribir nuevo registro directamente en Historico_Estados
        hojaHistorico.appendRow([
          fechaDiaHoy,
          correoAnalista,
          estadoTextoPlano,
          fechaHoraActual,
          "EN CURSO",
          0
        ]);
      }

      // Actualizar estado actual en hoja Usuarios (col F)
      hojaUsuarios.getRange(filaEncontrada, columnaEstado + 1).setValue(estadoTextoPlano);

      // Actualizar col L con JSON mínimo para compatibilidad con UI del analista
      const celdaHistorial = hojaUsuarios.getRange(filaEncontrada, columnaHistorial + 1);
      let historial = [];
      try {
        const contenido = celdaHistorial.getValue();
        historial = contenido ? JSON.parse(contenido) : [];
      } catch (e) { historial = []; }

      // Si el historial es de otro día, limpiarlo
      if (historial.length > 0) {
        try {
          const primerInicio = historial[0].inicio;
          const fechaPrimer = primerInicio.includes("T") ? primerInicio.split("T")[0] : primerInicio.split(' ')[0];
          if (fechaPrimer !== fechaDiaHoy) historial = [];
        } catch(e) { historial = []; }
      }

      // Cerrar último estado en JSON local
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
        duracion_min: 0
      });

      celdaHistorial.setValue(JSON.stringify(historial));
      SpreadsheetApp.flush();
      return { success: true, message: "Estado actualizado y sincronizado." };

    } else {
      return { success: false, message: "Usuario no encontrado." };
    }
  } catch (e) {
    return { success: false, message: "Error: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
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
  
  // Usar _getDataUsuarios (con cache de 30s) en vez de abrir un spreadsheet nuevo
  const datos = _getDataUsuarios();
  const usuario = datos.find(function(fila) { return String(fila[2]).toLowerCase().trim() === correo; });
  
  if (!usuario) return { success: false, message: "Usuario no registrado" };
  
  const estadoReal = String(usuario[5]).toUpperCase().trim();

  if (estadoReal !== "ACTIVO") {
    return { success: false, message: "Bloqueo de seguridad: El estado en base de datos es " + estadoReal };
  }

  try {
    const resultado = autoAsignarDesdeEquipo();
    return resultado;
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function obtenerMiEstadoActual() {
  try {
    const correoAnalista = Session.getActiveUser().getEmail();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hojaUsuarios = ss.getSheetByName("Usuarios");
    const datos = hojaUsuarios.getDataRange().getValues();
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
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hojaUsuarios = ss.getSheetByName("Usuarios");
    const datos = hojaUsuarios.getDataRange().getValues();
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
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
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

    const hojaAT = ss.getSheetByName('Analistas_Turnos');
    if (!hojaAT || hojaAT.getLastRow() <= 1) return { tieneTurno: false };

    const dataAT = hojaAT.getDataRange().getValues();
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

    const hojaTurnos = ss.getSheetByName('Turnos');
    if (!hojaTurnos || hojaTurnos.getLastRow() <= 1) return { tieneTurno: false };

    const dataTurnos = hojaTurnos.getDataRange().getValues();
    const dispTurnos = hojaTurnos.getDataRange().getDisplayValues();
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

function verificarPermisoVigenteHoy(ssOpcional) {
  try {
    const ss = ssOpcional || SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
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
  try {
    const hojaHistG = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID)
                        .getSheetByName("Historico_Gestiones");
    if (hojaHistG && hojaHistG.getLastRow() > 1) {
      const dataHistG = hojaHistG.getRange(2, 26, hojaHistG.getLastRow() - 1, 2).getDisplayValues(); // cols 26-27
      for (let i = 0; i < dataHistG.length; i++) {
        const asignado = String(dataHistG[i][0]).trim().toLowerCase(); // col 26
        const fechaFin = String(dataHistG[i][1]).trim();               // col 27
        if (fechaFin.includes(hoyStr)) sumar(asignado, 'digital');
      }
    }
  } catch(e) { Logger.log("_calcularGestionesHoyTodos Hist: " + e.message); }

  // 2. Contar desde Historico_Gestiones de ssReestudios
  try {
    const hojaHistReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS)
                            .getSheetByName("Historico_Gestiones");
    if (hojaHistReest && hojaHistReest.getLastRow() > 1) {
      const dataReest = hojaHistReest.getRange(2, 7, hojaHistReest.getLastRow() - 1, 4).getDisplayValues(); // cols G(7)..J(10)
      for (let i = 0; i < dataReest.length; i++) {
        const asignado = String(dataReest[i][0]).trim().toLowerCase(); // col G
        const fechaFin = String(dataReest[i][3]).trim();               // col J
        if (fechaFin.includes(hoyStr)) sumar(asignado, 'reestudios');
      }
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
      totales = _calcularGestionesHoyTodos(hoyStr);
      try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(totales), 60); } catch (e) {}
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
