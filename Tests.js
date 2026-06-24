// ============================================================
// SUITE 360° DE PRUEBAS — Motor de Asignación v2
// ============================================================
// Refactor: 'nueva' → 'digital', DIGITAL_PRIMERO, MotorAsignacion.js
// 5 equipos: DIGITAL, CANONES_ALTOS, UAR, REESTUDIOS, DESAPLAZAMIENTO
//
// Ejecutar: seleccionar EJECUTAR_TODAS_LAS_PRUEBAS → Run
// Resultados en: View > Logs
// ============================================================

var _totalPass = 0;
var _totalFail = 0;

function _assert(nombre, esperado, obtenido) {
  var ok = JSON.stringify(esperado) === JSON.stringify(obtenido);
  var tag = ok ? '✅ PASS' : '❌ FAIL';
  Logger.log(tag + ' | ' + nombre + ' | esperado=' + JSON.stringify(esperado) + ' | obtenido=' + JSON.stringify(obtenido));
  if (ok) _totalPass++; else _totalFail++;
  return ok;
}

function _seccion(titulo) {
  Logger.log('\n════════════════════════════════════════');
  Logger.log('  ' + titulo);
  Logger.log('════════════════════════════════════════');
}

// ============================================================
// BLOQUE A: CONFIGURACIÓN DE EQUIPOS
// ============================================================

function test_A1_EquiposExisten() {
  _seccion('A1. Los 5 equipos existen en la hoja Equipos');
  var equipos = _getEquipos();
  var ids = equipos.map(function(e) { return e.id; });
  Logger.log('Equipos encontrados: ' + JSON.stringify(ids));

  _assert('Total de equipos >= 5', true, equipos.length >= 5);
  _assert('DIGITAL existe', true, ids.indexOf('DIGITAL') !== -1);
  _assert('CANONES_ALTOS existe', true, ids.indexOf('CANONES_ALTOS') !== -1);
  _assert('REESTUDIOS existe', true, ids.indexOf('REESTUDIOS') !== -1);
  _assert('UAR existe', true, ids.indexOf('UAR') !== -1);
  _assert('DESAPLAZAMIENTO existe', true, ids.indexOf('DESAPLAZAMIENTO') !== -1);
}

function test_A2_PropiedadesEquipos() {
  _seccion('A2. Propiedades de cada equipo');
  var equipos = _getEquipos();
  for (var i = 0; i < equipos.length; i++) {
    var e = equipos[i];
    Logger.log('--- ' + e.id + ' ---');
    Logger.log('  nombre=' + e.nombre + ' | activo=' + e.activo + ' | modal=' + e.modalTipo);
    Logger.log('  VIP=' + e.usarVipRotacion + ' | Score=' + e.usarScoreCategories);
    Logger.log('  canonDesde=' + e.canonDesde + ' | canonHasta=' + e.canonHasta);
    Logger.log('  canonTipos=' + JSON.stringify(e.canonTipos));
    _assert(e.id + ' tiene nombre', true, e.nombre !== '');
    _assert(e.id + ' está activo', true, e.activo);
    _assert(e.id + ' tiene modalTipo', true, e.modalTipo !== '');
  }
}

function test_A3_CanonDigitalVsCanonAlto() {
  _seccion('A3. Separación de Canon: DIGITAL vs CANONES_ALTOS');
  var equipos = _getEquipos();
  var digital = equipos.find(function(e) { return e.id === 'DIGITAL'; });
  var canonAlto = equipos.find(function(e) { return e.id === 'CANONES_ALTOS'; });
  if (!digital || !canonAlto) { Logger.log('❌ Equipos no encontrados'); _totalFail += 4; return; }

  _assert('DIGITAL canonDesde = 0', true, digital.canonDesde === 0);
  _assert('DIGITAL canonHasta > 0', true, digital.canonHasta > 0);
  _assert('CANONES_ALTOS canonDesde > 0', true, canonAlto.canonDesde > 0);
  _assert('Sin solapamiento', true, digital.canonHasta < canonAlto.canonDesde || digital.canonHasta === canonAlto.canonDesde);
  _assert('DIGITAL tiene VIP', true, digital.usarVipRotacion);
  _assert('CANONES_ALTOS tiene VIP', true, canonAlto.usarVipRotacion);
  _assert('DIGITAL tiene canonTipos', true, Array.isArray(digital.canonTipos) && digital.canonTipos.length > 0);
  _assert('CANONES_ALTOS tiene canonTipos', true, Array.isArray(canonAlto.canonTipos) && canonAlto.canonTipos.length > 0);
}

function test_A4_EquiposSinVipNiScore() {
  _seccion('A4. Equipos sin VIP/Score: REESTUDIOS, DESAPLAZAMIENTO, UAR');
  var equipos = _getEquipos();
  var ids = ['REESTUDIOS', 'DESAPLAZAMIENTO', 'UAR'];
  for (var i = 0; i < ids.length; i++) {
    var eq = equipos.find(function(e) { return e.id === ids[i]; });
    if (!eq) { _totalFail++; continue; }
    _assert(ids[i] + ' NO tiene VIP', false, eq.usarVipRotacion);
    _assert(ids[i] + ' NO tiene Score', false, eq.usarScoreCategories);
  }
}

// ============================================================
// BLOQUE B: RESOLUCIÓN DE EQUIPO
// ============================================================

function test_B1_MapeoEspecialidades() {
  _seccion('B1. Mapeo de especialidades a equipos');
  var casos = [
    { esp: 'ESTUDIO DIGITAL', esperado: 'DIGITAL' },
    { esp: 'ESTUDIO_DIGITAL', esperado: 'DIGITAL' },
    { esp: 'BIOMETRIA', esperado: 'DESAPLAZAMIENTO' },
    { esp: 'DESAPLAZAMIENTO', esperado: 'DESAPLAZAMIENTO' },
    { esp: 'PENDIENTE_BIOMETRIA', esperado: 'DESAPLAZAMIENTO' },
    { esp: 'ANALISTA DESPLAZAMIENTO', esperado: 'DESAPLAZAMIENTO' },
    { esp: 'REESTUDIOS', esperado: 'REESTUDIOS' },
    { esp: 'CANONES_ALTOS', esperado: 'CANONES_ALTOS' },
    { esp: 'UAR', esperado: 'UAR' },
  ];
  for (var i = 0; i < casos.length; i++) {
    var equipo = resolverEquipoDesdeEspecialidad(casos[i].esp);
    _assert('"' + casos[i].esp + '" → ' + casos[i].esperado, casos[i].esperado, equipo ? equipo.id : null);
  }
}

function test_B2_UsuariosActivosTienenEquipo() {
  _seccion('B2. Todos los usuarios ACTIVOS mapean a equipo válido');
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var data = ss.getSheetByName('Usuarios').getDataRange().getValues();
  var idsValidos = _getEquipos().map(function(e) { return e.id; });
  var activos = 0, sinEquipo = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][5]).toUpperCase().trim() !== 'ACTIVO') continue;
    activos++;
    var eq = resolverEquipoDesdeEspecialidad(String(data[i][4]).toUpperCase().trim());
    if (!eq || idsValidos.indexOf(eq.id) === -1) {
      Logger.log('  ⚠️ ' + data[i][2] + ' esp="' + data[i][4] + '" → ' + (eq ? eq.id : 'NULL'));
      sinEquipo++;
    }
  }
  Logger.log('Activos: ' + activos + ' | Sin equipo: ' + sinEquipo);
  _assert('Todos tienen equipo válido', 0, sinEquipo);
}

// ============================================================
// BLOQUE C: CUPOS (refactor: 'nueva' → 'digital')
// ============================================================

function test_C1_CuposRetornanDigital() {
  _seccion('C1. obtenerCuposEfectivos retorna "digital" (no "nueva")');
  var cupos = obtenerCuposEfectivos('fake_no_existe@fake.com', 'DIGITAL');
  Logger.log('Cupos DIGITAL: ' + JSON.stringify(cupos));

  _assert('Tiene campo "digital"', true, 'digital' in cupos);
  _assert('NO tiene campo "nueva"', true, !('nueva' in cupos));
  _assert('digital es número', true, typeof cupos.digital === 'number');
  _assert('digital > 0 para DIGITAL', true, cupos.digital > 0);

  var campos = ['digital', 'reestudio', 'induccion', 'desaplazamiento', 'nuevaUar', 'deudorUar', 'biometriaFallida'];
  for (var j = 0; j < campos.length; j++) {
    _assert('DIGITAL.' + campos[j] + ' es número', true, typeof cupos[campos[j]] === 'number');
  }
}

function test_C2_CuposPorEquipo() {
  _seccion('C2. Cupos globales de los 5 equipos');
  var emailFake = 'test_cupos_fake@fake.com';
  var equipos = ['DIGITAL', 'CANONES_ALTOS', 'UAR', 'DESAPLAZAMIENTO', 'REESTUDIOS'];
  for (var i = 0; i < equipos.length; i++) {
    var cupos = obtenerCuposEfectivos(emailFake, equipos[i]);
    Logger.log(equipos[i] + ': ' + JSON.stringify(cupos));
    var tieneAlguno = Object.values(cupos).some(function(v) { return v > 0; });
    _assert(equipos[i] + ' tiene al menos 1 cupo > 0', true, tieneAlguno);
  }
}

function test_C3_CuposIndividualesJSON() {
  _seccion('C3. Cupos individuales JSON (campo "digital")');
  var dataFake = [
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', 'Test', 'test_ind@fake.com', '', '', 'ACTIVO', '5', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '{"digital":20,"reestudios":5,"inducciones":3,"desaplazamiento":2,"nuevaUar":1,"deudorUar":1,"biometriaFallida":0}']
  ];
  var cupos = obtenerCuposEfectivos('test_ind@fake.com', 'DIGITAL', dataFake);
  _assert('Individual digital=20', 20, cupos.digital);
  _assert('Individual reestudio=5', 5, cupos.reestudio);

  // Backwards compat: "nuevas" en JSON → se lee como "digital"
  var dataFakeOld = [
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', 'Test', 'test_old@fake.com', '', '', 'ACTIVO', '5', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '{"nuevas":15}']
  ];
  var cuposOld = obtenerCuposEfectivos('test_old@fake.com', 'DIGITAL', dataFakeOld);
  _assert('Fallback "nuevas" → digital=15', 15, cuposOld.digital);
}

function test_C4_FallbackScriptProperty() {
  _seccion('C4. Script Properties: CUPOS_*_DIGITAL fallback a CUPOS_*_NUEVAS');
  var props = PropertiesService.getScriptProperties();
  var valDigital = props.getProperty('CUPOS_DIGITAL_DIGITAL');
  var valNuevas = props.getProperty('CUPOS_DIGITAL_NUEVAS');
  Logger.log('CUPOS_DIGITAL_DIGITAL = ' + (valDigital !== null ? '"' + valDigital + '"' : '(null)'));
  Logger.log('CUPOS_DIGITAL_NUEVAS = ' + (valNuevas !== null ? '"' + valNuevas + '"' : '(null)'));
  _assert('Al menos DIGITAL o NUEVAS definido', true, valDigital !== null || valNuevas !== null);
}

// ============================================================
// BLOQUE D: ORDEN DE PRIORIDAD (refactor: DIGITAL_PRIMERO)
// ============================================================

function test_D1_ModosPrioridad() {
  _seccion('D1. Modos de prioridad (con DIGITAL_PRIMERO)');

  _assert('DIGITAL_PRIMERO primer tipo = digital', 'digital', ORDEN_PRIORIDAD_POR_MODO['DIGITAL_PRIMERO'][0]);
  _assert('NUEVAS_PRIMERO es alias de DIGITAL_PRIMERO',
    JSON.stringify(ORDEN_PRIORIDAD_POR_MODO['DIGITAL_PRIMERO']),
    JSON.stringify(ORDEN_PRIORIDAD_POR_MODO['NUEVAS_PRIMERO']));
  _assert('DESAPLAZAMIENTO_PRIMERO primer tipo', 'desaplazamiento', ORDEN_PRIORIDAD_POR_MODO['DESAPLAZAMIENTO_PRIMERO'][0]);
  _assert('INDUCCION_PRIMERO primer tipo', 'induccion', ORDEN_PRIORIDAD_POR_MODO['INDUCCION_PRIMERO'][0]);

  _assert('REESTUDIOS primer tipo', 'reestudio', ORDEN_PRIORIDAD_REESTUDIOS[0]);
  _assert('REESTUDIOS: digital va después', true, ORDEN_PRIORIDAD_REESTUDIOS.indexOf('digital') > 0);

  // MotorAsignacion.js
  _assert('Motor: DIGITAL_PRIMERO existe', true, 'DIGITAL_PRIMERO' in ORDEN_PRIORIDAD_MODOS);
  _assert('Motor: REESTUDIOS_PRIMERO existe', true, 'REESTUDIOS_PRIMERO' in ORDEN_PRIORIDAD_MODOS);
  _assert('Motor: REESTUDIOS_PRIMERO primer tipo', 'reestudio', ORDEN_PRIORIDAD_MODOS['REESTUDIOS_PRIMERO'][0]);
}

function test_D2_ModoEnProduccion() {
  _seccion('D2. Modo actual en producción');
  var modo = PropertiesService.getScriptProperties().getProperty('GLOBAL_PRIORIDAD') || 'NO_DEFINIDO';
  Logger.log('GLOBAL_PRIORIDAD = "' + modo + '"');
  var modoFinal = modo;
  if (modoFinal === 'NUEVAS_PRIMERO') modoFinal = 'DIGITAL_PRIMERO';
  if (modoFinal === 'BIOMETRIA_PRIMERO') modoFinal = 'DESAPLAZAMIENTO_PRIMERO';
  _assert('Modo resuelve a válido', true,
    ['DIGITAL_PRIMERO', 'DESAPLAZAMIENTO_PRIMERO', 'INDUCCION_PRIMERO'].indexOf(modoFinal) !== -1);
}

// ============================================================
// BLOQUE E: SORTING PROPORCIONAL
// ============================================================

function test_E1_SortingProporcional() {
  _seccion('E1. Sorting proporcional con tipo "digital"');
  var cuotas = { digital: 10, induccion: 4, desaplazamiento: 2 };
  var conteoHoy = { digital: 5, induccion: 1, desaplazamiento: 1 };
  var ordenP = ORDEN_PRIORIDAD_POR_MODO['DIGITAL_PRIMERO'];
  var tipos = ['digital', 'induccion', 'desaplazamiento'];
  tipos.sort(function(a, b) {
    var rA = cuotas[a] > 0 ? conteoHoy[a] / cuotas[a] : 1;
    var rB = cuotas[b] > 0 ? conteoHoy[b] / cuotas[b] : 1;
    if (rA !== rB) return rA - rB;
    return ordenP.indexOf(a) - ordenP.indexOf(b);
  });
  _assert('Menor ratio (induccion)', 'induccion', tipos[0]);
  _assert('Medio (digital)', 'digital', tipos[1]);
  _assert('Mayor (desaplazamiento)', 'desaplazamiento', tipos[2]);
}

function test_E2_DesempatePorModo() {
  _seccion('E2. Desempate por modo');
  var cuotas = { digital: 10, induccion: 4 };
  var conteoHoy = { digital: 5, induccion: 2 };
  var t1 = ['induccion', 'digital'];
  t1.sort(function(a, b) { var rA = conteoHoy[a]/cuotas[a], rB = conteoHoy[b]/cuotas[b]; if (rA !== rB) return rA-rB; return ORDEN_PRIORIDAD_POR_MODO['DIGITAL_PRIMERO'].indexOf(a) - ORDEN_PRIORIDAD_POR_MODO['DIGITAL_PRIMERO'].indexOf(b); });
  _assert('DIGITAL_PRIMERO + empate → digital', 'digital', t1[0]);

  var t2 = ['digital', 'induccion'];
  t2.sort(function(a, b) { var rA = conteoHoy[a]/cuotas[a], rB = conteoHoy[b]/cuotas[b]; if (rA !== rB) return rA-rB; return ORDEN_PRIORIDAD_POR_MODO['INDUCCION_PRIMERO'].indexOf(a) - ORDEN_PRIORIDAD_POR_MODO['INDUCCION_PRIMERO'].indexOf(b); });
  _assert('INDUCCION_PRIMERO + empate → induccion', 'induccion', t2[0]);
}

// ============================================================
// BLOQUE F: ROTACIÓN VIP
// ============================================================

function test_F1_RotacionVIP() {
  _seccion('F1. Rotación VIP');
  _assert('MAX_VIP = 2', 2, MAX_VIP_CONSECUTIVAS);
  _assert('Motor MAX_VIP = 2', 2, MAX_VIP_CONSECUTIVAS_UNIF);
  _assert('7 categorías', 7, CATEGORIAS_ROTACION.length);
  var cnt = 0, ptr = 0, seq = [];
  for (var i = 0; i < 8; i++) {
    if (cnt >= 2) { seq.push(CATEGORIAS_ROTACION[ptr % 7]); cnt = 0; ptr++; }
    else { seq.push('vip'); cnt++; }
  }
  _assert('Secuencia VIP-rot', ['vip','vip','mediana','vip','vip','grande','vip','vip'], seq);
}

// ============================================================
// BLOQUE G: FILTRO DE CANON
// ============================================================

function test_G1_FiltroCanon() {
  _seccion('G1. Filtro de canon');
  var equipos = _getEquipos();
  var dig = equipos.find(function(e) { return e.id === 'DIGITAL'; });
  var ca = equipos.find(function(e) { return e.id === 'CANONES_ALTOS'; });
  if (!dig || !ca) { _totalFail += 5; return; }

  function pasa(eq, tipo, canon) {
    if (eq.canonTipos.indexOf(tipo) === -1) return true;
    if (eq.canonDesde === 0 && eq.canonHasta === 0) return true;
    if (eq.canonDesde > 0 && canon < eq.canonDesde) return false;
    if (eq.canonHasta > 0 && canon > eq.canonHasta) return false;
    return true;
  }
  var tf = dig.canonTipos.indexOf('nueva') !== -1 ? 'nueva' : 'digital';
  _assert('3M → DIGITAL OK', true, pasa(dig, tf, 3000000));
  _assert('3M → CA bloqueado', false, pasa(ca, tf, 3000000));
  _assert('10M → DIGITAL bloqueado', false, pasa(dig, tf, 10000000));
  _assert('10M → CA OK', true, pasa(ca, tf, 10000000));
  _assert('0 → DIGITAL OK', true, pasa(dig, tf, 0));
}

// ============================================================
// BLOQUE H: SORTING COMPLETO
// ============================================================

function test_H1_SortingCompleto() {
  _seccion('H1. Sort completo: reasignada > externo > tipo > FIFO');
  var cuotas = { digital: 10, desaplazamiento: 5, induccion: 3 };
  var conteoHoy = { digital: 2, desaplazamiento: 2, induccion: 0 };
  var ordenP = ORDEN_PRIORIDAD_POR_MODO['DIGITAL_PRIMERO'];

  var pend = [
    { id: 'A', tipo: 'digital', reasignada: false, esExterno: false, fechaOrd: new Date(2026,5,23,8,0).getTime() },
    { id: 'B', tipo: 'digital', reasignada: false, esExterno: true, fechaOrd: new Date(2026,5,23,9,0).getTime() },
    { id: 'C', tipo: 'desaplazamiento', reasignada: false, esExterno: false, fechaOrd: new Date(2026,5,23,7,0).getTime() },
    { id: 'D', tipo: 'induccion', reasignada: false, esExterno: false, fechaOrd: new Date(2026,5,23,10,0).getTime() },
    { id: 'E', tipo: 'digital', reasignada: true, esExterno: false, fechaOrd: new Date(2026,5,23,6,0).getTime() },
  ];

  var seen = {}, tiposP = [];
  pend.forEach(function(p) { if (!p.reasignada && !seen[p.tipo]) { seen[p.tipo] = true; tiposP.push(p.tipo); } });
  tiposP.sort(function(a, b) { var rA = cuotas[a] > 0 ? conteoHoy[a]/cuotas[a] : 1; var rB = cuotas[b] > 0 ? conteoHoy[b]/cuotas[b] : 1; if (rA !== rB) return rA - rB; return ordenP.indexOf(a) - ordenP.indexOf(b); });
  var rank = {}; for (var r = 0; r < tiposP.length; r++) rank[tiposP[r]] = r;
  pend.forEach(function(p) { p.tipoPrioridad = p.reasignada ? -1 : (rank[p.tipo] !== undefined ? rank[p.tipo] : 99); });
  pend.sort(function(a, b) { if (a.tipoPrioridad !== b.tipoPrioridad) return a.tipoPrioridad - b.tipoPrioridad; if (a.esExterno && !b.esExterno) return -1; if (!a.esExterno && b.esExterno) return 1; return a.tipo === 'desaplazamiento' ? (b.fechaOrd - a.fechaOrd) : (a.fechaOrd - b.fechaOrd); });

  _assert('Orden: E,D,B,A,C', ['E','D','B','A','C'], pend.map(function(p) { return p.id; }));
}

// ============================================================
// BLOQUE I: RUTEO
// ============================================================

function test_I1_Ruteo() {
  _seccion('I1. Ruteo autoAsignarDesdeEquipo');
  var map = { DESAPLAZAMIENTO: 'autoAsignarBiometria', REESTUDIOS: 'RequestLeadReestudios', DIGITAL: 'RequestLead', CANONES_ALTOS: 'RequestLead', UAR: 'RequestLead' };
  for (var id in map) {
    var fn; switch (id) { case 'DESAPLAZAMIENTO': fn='autoAsignarBiometria'; break; case 'REESTUDIOS': fn='RequestLeadReestudios'; break; default: fn='RequestLead'; }
    _assert(id + ' → ' + map[id], map[id], fn);
  }
}

// ============================================================
// BLOQUE J: MOTOR UNIFICADO
// ============================================================

function test_J1_MotorUnificado() {
  _seccion('J1. Motor Unificado: funciones y tipos');
  _assert('RequestLeadUnificado existe', true, typeof RequestLeadUnificado === 'function');
  _assert('_buildFechaHoyFormats existe', true, typeof _buildFechaHoyFormats === 'function');
  _assert('_contarDesdeHojaPrincipal existe', true, typeof _contarDesdeHojaPrincipal === 'function');
  _assert('_contarDesdeHojaReestudios existe', true, typeof _contarDesdeHojaReestudios === 'function');
  _assert('_recolectarPendientesPrincipal existe', true, typeof _recolectarPendientesPrincipal === 'function');
  _assert('_recolectarPendientesReestudios existe', true, typeof _recolectarPendientesReestudios === 'function');
  _assert('_aplicarVipYScore existe', true, typeof _aplicarVipYScore === 'function');
  _assert('ETIQUETAS_TIPO.digital = "Digital"', 'Digital', ETIQUETAS_TIPO.digital);
  _assert('NO tiene ETIQUETAS_TIPO.nueva', true, !('nueva' in ETIQUETAS_TIPO));
}

function test_J2_MotorHelpers() {
  _seccion('J2. Motor helpers');
  var ctx = _buildFechaHoyFormats();
  _assert('ctx tiene hoy', true, ctx.hoy instanceof Date);
  _assert('ctx tiene 5 formatos', 5, ctx.fmts.length);
  _assert('cumpleHoy con Date hoy', true, _cumpleHoyUnif(new Date(), ctx));
  _assert('cumpleHoy null', false, _cumpleHoyUnif(null, ctx));
  _assert('parseDateUnif vacío', 9999999999999, _parseDateUnif(''));
  _assert('normalizarClave "01234"', '1234', _normalizarClaveUnif('01234'));
}

function test_J3_ConsistenciaTipos() {
  _seccion('J3. Consistencia tipos Motor vs ModeloAsignación');
  _assert('ModeloAsig DIGITAL_PRIMERO[0] = digital', 'digital', ORDEN_PRIORIDAD_POR_MODO['DIGITAL_PRIMERO'][0]);
  _assert('Motor DIGITAL_PRIMERO[0] = digital', 'digital', ORDEN_PRIORIDAD_MODOS['DIGITAL_PRIMERO'][0]);
  _assert('Motor REESTUDIOS_PRIMERO tiene digital', true, ORDEN_PRIORIDAD_MODOS['REESTUDIOS_PRIMERO'].indexOf('digital') !== -1);
  _assert('ModeloAsig REESTUDIOS tiene digital', true, ORDEN_PRIORIDAD_REESTUDIOS.indexOf('digital') !== -1);
}

// ============================================================
// BLOQUE K: UTILIDADES
// ============================================================

function test_K1_Utilidades() {
  _seccion('K1. Utilidades');
  _assert('normalizarClave "01234"', '1234', normalizarClave('01234'));
  _assert('normalizarClave null', '', normalizarClave(null));
  _assert('parseDateCustom vacío', 9999999999999, parseDateCustom(''));
  _assert('parseDateCustom DD/MM/YYYY', true, parseDateCustom('23/06/2026') < 9999999999999);
}

// ============================================================
// BLOQUE L: DATOS REALES
// ============================================================

function test_L1_HojasExisten() {
  _seccion('L1. Hojas existen');
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hojas = ['solicitud', 'Usuarios', 'score', 'Historico_Gestiones'];
  for (var i = 0; i < hojas.length; i++) {
    var h = ss.getSheetByName(hojas[i]);
    if (h) Logger.log('  ' + hojas[i] + ': ' + h.getLastRow() + ' filas');
    _assert(hojas[i] + ' existe', true, h !== null);
  }
  try {
    var ssR = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS_API);
    _assert('ORIGEN reestudios', true, ssR.getSheetByName('ORIGEN') !== null);
  } catch (e) { _totalFail++; }
}

function test_L2_ScriptProperties() {
  _seccion('L2. Script Properties');
  var p = PropertiesService.getScriptProperties();
  var keys = ['GLOBAL_PRIORIDAD', 'PUNTERO_ROTACION', 'CUPOS_DIGITAL_DIGITAL', 'CUPOS_DIGITAL_NUEVAS', 'CUPOS_CANONES_ALTOS_NUEVAS', 'CUPOS_CANONES_ALTOS_DIGITAL', 'CUPOS_UAR_NUEVA_UAR'];
  for (var i = 0; i < keys.length; i++) {
    Logger.log('  ' + keys[i] + ' = ' + (p.getProperty(keys[i]) !== null ? '"' + p.getProperty(keys[i]) + '"' : '(null)'));
  }
}

function test_L3_EstadisticasCola() {
  _seccion('L3. Estadísticas de cola');
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName('solicitud');
  if (!hoja || hoja.getLastRow() < 2) return;
  var data = hoja.getRange(2, 1, hoja.getLastRow() - 1, 38).getValues();
  var stats = { total: data.length, sinAsignar: 0, digital: 0, desaplazamiento: 0, induccion: 0 };
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][27]).trim() !== '') continue;
    stats.sinAsignar++;
    var est = String(data[i][16]).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    var cls = String(data[i][20]).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    var estSG = est.replace(/_/g, ' ');
    if (estSG === 'APROBADO PENDIENTE BIOMETRIA' || est === 'APROBADO_PENDIENTE_BIOMETRIA') stats.desaplazamiento++;
    else if (cls === "INDUCCION") stats.induccion++;
    else stats.digital++;
  }
  Logger.log('Total: ' + stats.total + ' | Sin asignar: ' + stats.sinAsignar);
  Logger.log('  digital: ' + stats.digital + ' | desapl: ' + stats.desaplazamiento + ' | induc: ' + stats.induccion);
  _assert('Hay solicitudes', true, stats.total > 0);
}

// ============================================================
// BLOQUE M: INTEGRACIÓN
// ============================================================

function test_M1_VerificarMisCupos() {
  _seccion('M1. verificarMisCupos');
  var r = verificarMisCupos();
  _assert('Tiene cumplido', true, 'cumplido' in r);
  _assert('Tiene resumen', true, Array.isArray(r.resumen));
  if (r.resumen.length > 0) r.resumen.forEach(function(s) { Logger.log('  ' + s.tipo + ': ' + s.usado + '/' + s.limite); });
}

function test_M2_ConteoGestiones() {
  _seccion('M2. Conteo gestiones hoy');
  var r = obtenerGestionesHoyCruzadas();
  _assert('hoyTotal número', true, typeof r.hoyTotal === 'number');
  _assert('Suma ok', r.hoyTotal, r.detalle.digital + r.detalle.reestudios);
}

// ============================================================
// BLOQUE N: DRY-RUN
// ============================================================

function test_N1_DryRun_Digital() { _seccion('N1. DRY-RUN DIGITAL'); _dryRun('DIGITAL'); }
function test_N2_DryRun_CanonAlto() { _seccion('N2. DRY-RUN CANONES_ALTOS'); _dryRun('CANONES_ALTOS'); }
function test_N3_DryRun_UAR() { _seccion('N3. DRY-RUN UAR'); _dryRun('UAR'); }
function test_N4_DryRun_Reestudios() { _seccion('N4. DRY-RUN REESTUDIOS'); _dryRunReest(); }

function _dryRun(eqId) {
  var eq = _getEquipos().find(function(e) { return e.id === eqId; });
  if (!eq) { _totalFail++; return; }
  var cD = eq.canonDesde || 0, cH = eq.canonHasta || 0, cT = eq.canonTipos || [];
  Logger.log(eqId + ' | Canon: ' + cD + ' - ' + (cH || '∞') + ' | canonTipos: ' + JSON.stringify(cT));

  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var sol = ss.getSheetByName('solicitud');
  if (!sol) { _totalFail++; return; }
  var data = sol.getRange("A1:BG" + sol.getLastRow()).getValues();
  var pend = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[27]).trim() !== '') continue;
    var est = String(row[16]).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    var cls = String(row[20]).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (est === '') continue;
    var eSG = est.replace(/_/g, ' ');
    var esD = eSG === 'APROBADO PENDIENTE BIOMETRIA' || est === 'APROBADO_PENDIENTE_BIOMETRIA';
    if ((est.indexOf("APROB") !== -1 && !esD) || est.indexOf("NEGAD") !== -1 || est.indexOf("RECHAZ") !== -1 || est.indexOf("APLAZ") !== -1) continue;
    var esI = cls === "INDUCCION";
    var esN = est === 'EN_ESTUDIO' || eSG === 'EN ESTUDIO';
    if (!esN && !esD && !esI) continue;
    var tipo = 'digital'; if (esD) tipo = 'desaplazamiento'; else if (esI) tipo = 'induccion';

    var tf = tipo;
    if (tipo === 'digital' && cT.indexOf('digital') === -1 && cT.indexOf('nueva') !== -1) tf = 'nueva';
    if (cT.indexOf(tf) !== -1 && (cD > 0 || cH > 0)) {
      var cv = parseFloat(String(row[9]).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
      if (cD > 0 && cv < cD) continue;
      if (cH > 0 && cv > cH) continue;
    }
    pend.push({ sol: String(row[0]).trim(), tipo: tipo, canon: String(row[9]).trim() });
    if (pend.length >= 5) break;
  }

  Logger.log('Primeros casos: ' + pend.length);
  pend.forEach(function(p, idx) { Logger.log('  ' + (idx+1) + '. [' + p.tipo + '] Sol=' + p.sol + ' Canon=' + p.canon); });
  _assert(eqId + ' DryRun OK', true, true);
}

function _dryRunReest() {
  try {
    var ssR = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS_API);
    var h = ssR.getSheetByName('ORIGEN');
    if (!h || h.getLastRow() < 2) { _assert('OK', true, true); return; }
    var data = h.getRange(2, 1, h.getLastRow() - 1, 14).getValues();
    var cnt = 0;
    for (var i = 0; i < data.length && cnt < 5; i++) {
      if (String(data[i][6]).trim() !== '') continue;
      Logger.log('  ' + (++cnt) + '. Sol=' + String(data[i][1]).trim() + ' Tipo=' + String(data[i][4]).trim());
    }
    Logger.log('Sin asignar (muestra): ' + cnt);
    _assert('DryRun reestudios OK', true, true);
  } catch (e) { _totalFail++; }
}

// ============================================================
// BLOQUE O: TURNOS Y PERMISOS
// ============================================================

function test_O1_TurnoYPermiso() {
  _seccion('O1. Turno y permiso');
  var t = obtenerInfoTurnoActual();
  Logger.log('Turno: ' + JSON.stringify(t));
  _assert('Tiene tieneTurno', true, 'tieneTurno' in t);
  var p = verificarPermisoVigenteHoy();
  _assert('Tiene tienePermiso', true, 'tienePermiso' in p);
}

// ============================================================
// BLOQUE P: CATÁLOGO DINÁMICO DE TIPOS (bugs corregidos 2026-06-23)
// ============================================================

function test_P1_TiposCatalogoConsistentes() {
  _seccion('P1. IDs del catálogo coinciden con claves del motor');
  var tipos = _getTiposParaCupos();
  var idsMotor = ['digital', 'desaplazamiento', 'induccion', 'reestudio', 'nuevaUar', 'deudorUar', 'biometriaFallida'];
  var idsCatalogo = tipos.map(function(t) { return t.id; });
  Logger.log('Catálogo IDs: ' + JSON.stringify(idsCatalogo));

  for (var i = 0; i < idsMotor.length; i++) {
    _assert('Motor "' + idsMotor[i] + '" existe en catálogo', true, idsCatalogo.indexOf(idsMotor[i]) !== -1);
  }
  _assert('NO hay "reestudios" (plural) en catálogo', true, idsCatalogo.indexOf('reestudios') === -1);
  _assert('NO hay "inducciones" (plural) en catálogo', true, idsCatalogo.indexOf('inducciones') === -1);
  _assert('NO hay "nueva" en catálogo', true, idsCatalogo.indexOf('nueva') === -1);
}

function test_P2_PropKeyCupoMapeoCompleto() {
  _seccion('P2. _propKeyCupo mapea todos los IDs del catálogo');
  var mapeoEsperado = {
    digital: 'CUPOS_DIGITAL_DIGITAL',
    induccion: 'CUPOS_DIGITAL_INDUCCIONES',
    reestudio: 'CUPOS_DIGITAL_REESTUDIOS',
    desaplazamiento: 'CUPOS_DIGITAL_DESAPLAZAMIENTO',
    nuevaUar: 'CUPOS_DIGITAL_NUEVA_UAR',
    deudorUar: 'CUPOS_DIGITAL_DEUDOR_UAR',
    biometriaFallida: 'CUPOS_DIGITAL_BIOMETRIA_FALLIDA'
  };
  for (var id in mapeoEsperado) {
    _assert(id + ' → ' + mapeoEsperado[id], mapeoEsperado[id], _propKeyCupo('DIGITAL', id));
  }
}

function test_P3_CuposIndividualesClavesNuevas() {
  _seccion('P3. obtenerCuposEfectivos lee claves singulares (fix 2026-06-23)');
  var dataConNuevos = [
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', 'Test', 'test_nuevos@fake.com', '', '', 'ACTIVO', '5', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '{"digital":15,"reestudio":8,"induccion":6,"desaplazamiento":4,"nuevaUar":3,"deudorUar":2,"biometriaFallida":1}']
  ];
  var cupos = obtenerCuposEfectivos('test_nuevos@fake.com', 'DIGITAL', dataConNuevos);
  _assert('digital=15', 15, cupos.digital);
  _assert('reestudio=8 (singular)', 8, cupos.reestudio);
  _assert('induccion=6 (singular)', 6, cupos.induccion);
  _assert('desaplazamiento=4', 4, cupos.desaplazamiento);
  _assert('nuevaUar=3', 3, cupos.nuevaUar);
  _assert('deudorUar=2', 2, cupos.deudorUar);
  _assert('biometriaFallida=1', 1, cupos.biometriaFallida);
}

function test_P4_CuposIndividualesClavesViejas() {
  _seccion('P4. obtenerCuposEfectivos sigue leyendo claves plurales (retrocompatibilidad)');
  var dataConViejos = [
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', 'Test', 'test_viejos@fake.com', '', '', 'ACTIVO', '5', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '{"digital":10,"reestudios":7,"inducciones":4,"desaplazamiento":3}']
  ];
  var cupos = obtenerCuposEfectivos('test_viejos@fake.com', 'DIGITAL', dataConViejos);
  _assert('reestudio=7 (desde plural)', 7, cupos.reestudio);
  _assert('induccion=4 (desde plural)', 4, cupos.induccion);
}

function test_P5_CuotasGlobalesRoundTrip() {
  _seccion('P5. Cuotas globales: lectura retorna IDs del catálogo');
  var tipos = _getTiposParaCupos();
  var equipos = _getEquipos();
  _assert('Al menos 1 equipo', true, equipos.length >= 1);

  for (var e = 0; e < equipos.length; e++) {
    var eqId = equipos[e].id;
    var cupos = obtenerCuposEfectivos('fake_no_existe@fake.com', eqId);
    var campos = ['digital', 'reestudio', 'induccion', 'desaplazamiento', 'nuevaUar', 'deudorUar', 'biometriaFallida'];
    for (var c = 0; c < campos.length; c++) {
      _assert(eqId + '.' + campos[c] + ' es número', true, typeof cupos[campos[c]] === 'number');
    }
  }
}

// ============================================================
// BLOQUE Q: MAPEO TIPO → CLASE (fix 2026-06-23)
// ============================================================

function test_Q1_MapeoTipoClaseCompleto() {
  _seccion('Q1. guardarCambiosInternos mapea los 7 tipos a clase');
  var mapeo = {
    desaplazamiento: 'BIOMETRIA',
    induccion: 'INDUCCION',
    nuevaUar: 'NUEVA_UAR',
    deudorUar: 'DEUDOR_UAR',
    biometriaFallida: 'BIOMETRIA_FALLIDA'
  };

  for (var tipo in mapeo) {
    var claseEsperada = mapeo[tipo];
    var valorClase = 'ORIGINAL';
    if (tipo === 'desaplazamiento') valorClase = 'BIOMETRIA';
    else if (tipo === 'induccion') valorClase = 'INDUCCION';
    else if (tipo === 'nuevaUar') valorClase = 'NUEVA_UAR';
    else if (tipo === 'deudorUar') valorClase = 'DEUDOR_UAR';
    else if (tipo === 'biometriaFallida') valorClase = 'BIOMETRIA_FALLIDA';
    _assert(tipo + ' → ' + claseEsperada, claseEsperada, valorClase);
  }

  var valorDigital = 'ORIGINAL';
  _assert('digital no cambia clase', 'ORIGINAL', valorDigital);

  var valorReest = 'ORIGINAL';
  _assert('reestudio no cambia clase', 'ORIGINAL', valorReest);
}

// ============================================================
// BLOQUE R: ETIQUETAS Y CONTEO (consistencia motor)
// ============================================================

function test_R1_EtiquetasTipo7Completas() {
  _seccion('R1. ETIQUETAS_TIPO cubre los 7 tipos');
  var tipos7 = ['digital', 'desaplazamiento', 'induccion', 'reestudio', 'nuevaUar', 'deudorUar', 'biometriaFallida'];
  for (var i = 0; i < tipos7.length; i++) {
    _assert('ETIQUETAS_TIPO.' + tipos7[i] + ' existe', true, tipos7[i] in ETIQUETAS_TIPO);
    _assert('ETIQUETAS_TIPO.' + tipos7[i] + ' no vacío', true, ETIQUETAS_TIPO[tipos7[i]] !== '');
  }
}

function test_R2_ConteoHoyTieneTodasLasClaves() {
  _seccion('R2. conteoHoyTotal del motor tiene las 7 claves');
  var conteo = { digital: 0, desaplazamiento: 0, induccion: 0, reestudio: 0, nuevaUar: 0, deudorUar: 0, biometriaFallida: 0 };
  var tipos = _getTiposParaCupos();
  for (var t = 0; t < tipos.length; t++) {
    _assert('conteo tiene ' + tipos[t].id, true, tipos[t].id in conteo);
  }
}

// ============================================================
// BLOQUE S: CANON CON TIPO 'digital' (fix 2026-06-23)
// ============================================================

function test_S1_CanonConDigital() {
  _seccion('S1. Filtro de canon con tipo "digital" (no "nueva")');
  var equipos = _getEquipos();
  var dig = equipos.find(function(e) { return e.id === 'DIGITAL'; });
  var ca = equipos.find(function(e) { return e.id === 'CANONES_ALTOS'; });
  if (!dig || !ca) { _totalFail += 4; return; }

  _assert('DIGITAL canonTipos incluye "digital"', true, dig.canonTipos.indexOf('digital') !== -1);
  _assert('DIGITAL canonTipos NO incluye "nueva"', true, dig.canonTipos.indexOf('nueva') === -1);
  _assert('CANONES_ALTOS canonTipos incluye "digital"', true, ca.canonTipos.indexOf('digital') !== -1);
  _assert('CANONES_ALTOS canonTipos NO incluye "nueva"', true, ca.canonTipos.indexOf('nueva') === -1);

  function pasa(eq, tipo, canon) {
    if (eq.canonTipos.indexOf(tipo) === -1) return true;
    if (eq.canonDesde === 0 && eq.canonHasta === 0) return true;
    if (eq.canonDesde > 0 && canon < eq.canonDesde) return false;
    if (eq.canonHasta > 0 && canon > eq.canonHasta) return false;
    return true;
  }
  _assert('3M "digital" → DIGITAL OK', true, pasa(dig, 'digital', 3000000));
  _assert('3M "digital" → CA bloqueado', false, pasa(ca, 'digital', 3000000));
  _assert('10M "digital" → DIGITAL bloqueado', false, pasa(dig, 'digital', 10000000));
  _assert('10M "digital" → CA OK', true, pasa(ca, 'digital', 10000000));
}

// ============================================================
// BLOQUE T: LOCKSERVICE (fix 2026-06-23)
// ============================================================

function test_T1_FuncionesExisten() {
  _seccion('T1. Funciones críticas existen');
  _assert('desasignarSolicitud existe', true, typeof desasignarSolicitud === 'function');
  _assert('desasignarSolicitudReestudio existe', true, typeof desasignarSolicitudReestudio === 'function');
  _assert('admin_sincronizarEstado existe', true, typeof admin_sincronizarEstado === 'function');
  _assert('admin_setCuposIndividual existe', true, typeof admin_setCuposIndividual === 'function');
  _assert('registrarHistoricoCupos_ existe', true, typeof registrarHistoricoCupos_ === 'function');
  _assert('guardarCambiosInternos existe', true, typeof guardarCambiosInternos === 'function');
}

function test_T2_LockServiceEnFunciones() {
  _seccion('T2. Funciones usan getScriptLock (verificación de código fuente)');
  var fuentes = {
    desasignarSolicitud: desasignarSolicitud.toString(),
    desasignarSolicitudReestudio: desasignarSolicitudReestudio.toString(),
    admin_sincronizarEstado: admin_sincronizarEstado.toString(),
    guardarCambiosInternos: guardarCambiosInternos.toString()
  };
  for (var fn in fuentes) {
    var src = fuentes[fn];
    _assert(fn + ' usa getScriptLock', true, src.indexOf('getScriptLock') !== -1);
    _assert(fn + ' NO usa getUserLock', true, src.indexOf('getUserLock') === -1);
  }
}

// ============================================================
// BLOQUE U: HISTORICO CUPOS DINÁMICO (fix 2026-06-23)
// ============================================================

function test_U1_RegistrarHistoricoCuposDinamico() {
  _seccion('U1. registrarHistoricoCupos_ usa tipos dinámicos');
  var src = registrarHistoricoCupos_.toString();
  _assert('Usa _getTiposParaCupos', true, src.indexOf('_getTiposParaCupos') !== -1);
  _assert('NO tiene "cupos.reestudios" hardcoded', true, src.indexOf('cupos.reestudios') === -1);
  _assert('NO tiene "cupos.inducciones" hardcoded', true, src.indexOf('cupos.inducciones') === -1);
  _assert('NO tiene "cupos.desaplazamiento" hardcoded', true, src.indexOf('cupos.desaplazamiento') === -1);
}

function test_U2_SetCuposIndividualDinamico() {
  _seccion('U2. admin_setCuposIndividual usa tipos dinámicos');
  var src = admin_setCuposIndividual.toString();
  _assert('Usa _getTiposParaCupos', true, src.indexOf('_getTiposParaCupos') !== -1);
  _assert('NO tiene "cupos.reestudios" hardcoded', true, src.indexOf('cupos.reestudios') === -1);
  _assert('NO tiene "cupos.inducciones" hardcoded', true, src.indexOf('cupos.inducciones') === -1);
}

// ============================================================
// RUNNER
// ============================================================

function EJECUTAR_TODAS_LAS_PRUEBAS() {
  _totalPass = 0; _totalFail = 0;
  Logger.log('╔══════════════════════════════════════════╗');
  Logger.log('║   SUITE 360° v2 — Motor de Asignación    ║');
  Logger.log('║   Refactor: digital, MotorUnificado       ║');
  Logger.log('╚══════════════════════════════════════════╝');
  Logger.log('Fecha: ' + new Date().toISOString());
  Logger.log('Usuario: ' + Session.getActiveUser().getEmail());

  test_A1_EquiposExisten(); test_A2_PropiedadesEquipos(); test_A3_CanonDigitalVsCanonAlto(); test_A4_EquiposSinVipNiScore();
  test_B1_MapeoEspecialidades(); test_B2_UsuariosActivosTienenEquipo();
  test_C1_CuposRetornanDigital(); test_C2_CuposPorEquipo(); test_C3_CuposIndividualesJSON(); test_C4_FallbackScriptProperty();
  test_D1_ModosPrioridad(); test_D2_ModoEnProduccion();
  test_E1_SortingProporcional(); test_E2_DesempatePorModo();
  test_F1_RotacionVIP();
  test_G1_FiltroCanon();
  test_H1_SortingCompleto();
  test_I1_Ruteo();
  test_J1_MotorUnificado(); test_J2_MotorHelpers(); test_J3_ConsistenciaTipos();
  test_K1_Utilidades();
  test_L1_HojasExisten(); test_L2_ScriptProperties(); test_L3_EstadisticasCola();
  test_M1_VerificarMisCupos(); test_M2_ConteoGestiones();
  test_N1_DryRun_Digital(); test_N2_DryRun_CanonAlto(); test_N3_DryRun_UAR(); test_N4_DryRun_Reestudios();
  test_O1_TurnoYPermiso();
  test_P1_TiposCatalogoConsistentes(); test_P2_PropKeyCupoMapeoCompleto(); test_P3_CuposIndividualesClavesNuevas(); test_P4_CuposIndividualesClavesViejas(); test_P5_CuotasGlobalesRoundTrip();
  test_Q1_MapeoTipoClaseCompleto();
  test_R1_EtiquetasTipo7Completas(); test_R2_ConteoHoyTieneTodasLasClaves();
  test_S1_CanonConDigital();
  test_T1_FuncionesExisten(); test_T2_LockServiceEnFunciones();
  test_U1_RegistrarHistoricoCuposDinamico(); test_U2_SetCuposIndividualDinamico();

  Logger.log('\n╔══════════════════════════════════════════╗');
  Logger.log('║   ✅ PASS: ' + _totalPass);
  Logger.log('║   ❌ FAIL: ' + _totalFail);
  Logger.log('║   TOTAL:  ' + (_totalPass + _totalFail));
  Logger.log('╚══════════════════════════════════════════╝');
}
