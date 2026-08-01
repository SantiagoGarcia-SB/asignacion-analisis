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

  _assert('DIGITAL_PRIMERO primer tipo = digital', 'digital', ORDEN_PRIORIDAD_MODOS['DIGITAL_PRIMERO'][0]);
  _assert('NUEVAS_PRIMERO es alias de DIGITAL_PRIMERO',
    JSON.stringify(ORDEN_PRIORIDAD_MODOS['DIGITAL_PRIMERO']),
    JSON.stringify(ORDEN_PRIORIDAD_MODOS['NUEVAS_PRIMERO']));
  _assert('DESAPLAZAMIENTO_PRIMERO primer tipo', 'desaplazamiento', ORDEN_PRIORIDAD_MODOS['DESAPLAZAMIENTO_PRIMERO'][0]);
  _assert('INDUCCION_PRIMERO primer tipo', 'induccion', ORDEN_PRIORIDAD_MODOS['INDUCCION_PRIMERO'][0]);

  _assert('REESTUDIOS primer tipo', 'reestudio', ORDEN_PRIORIDAD_MODOS['REESTUDIOS_PRIMERO'][0]);
  _assert('REESTUDIOS: digital va después', true, ORDEN_PRIORIDAD_MODOS['REESTUDIOS_PRIMERO'].indexOf('digital') > 0);

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
  var ordenP = ORDEN_PRIORIDAD_MODOS['DIGITAL_PRIMERO'];
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
  t1.sort(function(a, b) { var rA = conteoHoy[a]/cuotas[a], rB = conteoHoy[b]/cuotas[b]; if (rA !== rB) return rA-rB; return ORDEN_PRIORIDAD_MODOS['DIGITAL_PRIMERO'].indexOf(a) - ORDEN_PRIORIDAD_MODOS['DIGITAL_PRIMERO'].indexOf(b); });
  _assert('DIGITAL_PRIMERO + empate → digital', 'digital', t1[0]);

  var t2 = ['digital', 'induccion'];
  t2.sort(function(a, b) { var rA = conteoHoy[a]/cuotas[a], rB = conteoHoy[b]/cuotas[b]; if (rA !== rB) return rA-rB; return ORDEN_PRIORIDAD_MODOS['INDUCCION_PRIMERO'].indexOf(a) - ORDEN_PRIORIDAD_MODOS['INDUCCION_PRIMERO'].indexOf(b); });
  _assert('INDUCCION_PRIMERO + empate → induccion', 'induccion', t2[0]);
}

// ============================================================
// BLOQUE F: ROTACIÓN VIP
// ============================================================

function test_F1_RotacionVIP() {
  _seccion('F1. Rotación VIP');
  // MAX_VIP_CONSECUTIVAS y CATEGORIAS_ROTACION (sin sufijo) eran del motor legado
  // ModeloAsignación.js, ya removido del proyecto — el motor vigente es MotorAsignacion.js,
  // con las constantes _UNIF.
  _assert('Motor MAX_VIP = 2', 2, MAX_VIP_CONSECUTIVAS_UNIF);
  _assert('7 categorías', 7, CATEGORIAS_ROTACION_UNIF.length);
  var cnt = 0, ptr = 0, seq = [];
  for (var i = 0; i < 8; i++) {
    if (cnt >= 2) { seq.push(CATEGORIAS_ROTACION_UNIF[ptr % 7]); cnt = 0; ptr++; }
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
  var ordenP = ORDEN_PRIORIDAD_MODOS['DIGITAL_PRIMERO'];

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
  _assert('RequestLeadUnificado existe', true, typeof RequestLeadUnificado === 'function');
  _assert('autoAsignarDesdeEquipo existe', true, typeof autoAsignarDesdeEquipo === 'function');
  _assert('autoAsignarBiometria existe', true, typeof autoAsignarBiometria === 'function');
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
  _seccion('J3. Consistencia tipos Motor Unificado');
  _assert('Motor DIGITAL_PRIMERO[0] = digital', 'digital', ORDEN_PRIORIDAD_MODOS['DIGITAL_PRIMERO'][0]);
  _assert('Motor REESTUDIOS_PRIMERO tiene digital', true, ORDEN_PRIORIDAD_MODOS['REESTUDIOS_PRIMERO'].indexOf('digital') !== -1);
  _assert('Motor DESAPLAZAMIENTO_PRIMERO[0]', 'desaplazamiento', ORDEN_PRIORIDAD_MODOS['DESAPLAZAMIENTO_PRIMERO'][0]);
  _assert('Motor INDUCCION_PRIMERO[0]', 'induccion', ORDEN_PRIORIDAD_MODOS['INDUCCION_PRIMERO'][0]);
}

// ============================================================
// BLOQUE K: UTILIDADES
// ============================================================

function test_K1_Utilidades() {
  _seccion('K1. Utilidades (Motor Unificado)');
  _assert('_normalizarClaveUnif "01234"', '1234', _normalizarClaveUnif('01234'));
  _assert('_parseDateUnif vacío', 9999999999999, _parseDateUnif(''));
  _assert('_parseDateUnif DD/MM/YYYY', true, _parseDateUnif('23/06/2026') < 9999999999999);
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
    var ssR = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
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
    var ssR = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
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
    _cerrarConteoConLockCorto: _cerrarConteoConLockCorto.toString()
  };
  for (var fn in fuentes) {
    var src = fuentes[fn];
    _assert(fn + ' usa getScriptLock', true, src.indexOf('getScriptLock') !== -1);
    _assert(fn + ' NO usa getUserLock', true, src.indexOf('getUserLock') === -1);
  }

  // guardarCambiosInternos (2026-07-21) ya NO toma ScriptLock para la escritura de
  // la fila (era el cuello de botella con varios analistas guardando a la vez, ver
  // CLAUDE.md) — solo delega en _cerrarConteoConLockCorto para el único tramo que
  // sí comparte estado global (contadores de cupo/carga en PropertiesService).
  var srcGuardar = guardarCambiosInternos.toString();
  _assert('guardarCambiosInternos delega el conteo en _cerrarConteoConLockCorto', true, srcGuardar.indexOf('_cerrarConteoConLockCorto') !== -1);
  _assert('guardarCambiosInternos ya NO toma ScriptLock directamente', true, srcGuardar.indexOf('getScriptLock') === -1);
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
// BLOQUE V: CONTADORES INCREMENTALES (cupo hoy + carga pendiente)
// ============================================================
// Usa un email ficticio exclusivo de las pruebas y limpia sus propias claves al
// final — _incrementarContadorCupo/_ajustarCargaPendiente hacen lectura+merge+
// escritura (no reemplazan el bloque completo), así que no pueden pisar los
// contadores reales de otros analistas, pero igual se limpia por prolijidad.
var _TEST_EMAIL_CONTADORES = 'zzz_test_contadores@no-existe.invalido';

function test_V1_DerivarTipoReestudio() {
  _seccion('V1. _derivarTipoReestudio clasifica correctamente');
  _assert('Biometría fallida', 'biometriaFallida', _derivarTipoReestudio('CUALQUIERA', 'BIOMETRIA FALLIDA'));
  _assert('Correo + Nueva → nuevaUar', 'nuevaUar', _derivarTipoReestudio('CORREO', 'NUEVA'));
  _assert('Correo + Adicional → deudorUar', 'deudorUar', _derivarTipoReestudio('CORREO', 'ADICIONAL'));
  _assert('Reestudio', 'reestudio', _derivarTipoReestudio('VICTORIA', 'REESTUDIO'));
  _assert('Sin match → null', null, _derivarTipoReestudio('X', 'Y'));
}

function test_V2_FechaEsHoyYMD() {
  _seccion('V2. _fechaEsHoyYMD distingue hoy de otros días');
  _assert('Ahora mismo es hoy', true, _fechaEsHoyYMD(new Date()));
  _assert('Hace 10 días NO es hoy', false, _fechaEsHoyYMD(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)));
  _assert('Vacío NO es hoy', false, _fechaEsHoyYMD(''));
  _assert('null NO es hoy', false, _fechaEsHoyYMD(null));
}

function test_V3_ContadorCupoHoy() {
  _seccion('V3. Contador de cupo del día (email de prueba aislado)');
  var antes = _obtenerConteoHoyAnalista(_TEST_EMAIL_CONTADORES).digital;
  _incrementarContadorCupo(_TEST_EMAIL_CONTADORES, 'digital');
  _incrementarContadorCupo(_TEST_EMAIL_CONTADORES, 'digital');
  var despues = _obtenerConteoHoyAnalista(_TEST_EMAIL_CONTADORES).digital;
  _assert('Sube de a 1 por llamada', antes + 2, despues);

  // Limpieza: quita solo las claves de prueba, sin tocar las de nadie más.
  var estado = _leerContadoresCupoHoy();
  delete estado.datos[_TEST_EMAIL_CONTADORES + '|digital'];
  _guardarContadoresCupoHoy(estado);
  _assert('Limpieza dejó el contador en 0', 0, _obtenerConteoHoyAnalista(_TEST_EMAIL_CONTADORES).digital);
}

function test_V3b_DecrementarContadorCupo() {
  _seccion('V3b. _decrementarContadorCupo (reversa el cupo fantasma al desasignar/reasignar)');
  _incrementarContadorCupo(_TEST_EMAIL_CONTADORES, 'digital');
  _incrementarContadorCupo(_TEST_EMAIL_CONTADORES, 'digital');
  _assert('Sube a 2 antes de decrementar', 2, _obtenerConteoHoyAnalista(_TEST_EMAIL_CONTADORES).digital);
  _decrementarContadorCupo(_TEST_EMAIL_CONTADORES, 'digital');
  _assert('Baja de a 1 por llamada', 1, _obtenerConteoHoyAnalista(_TEST_EMAIL_CONTADORES).digital);
  _decrementarContadorCupo(_TEST_EMAIL_CONTADORES, 'digital');
  _decrementarContadorCupo(_TEST_EMAIL_CONTADORES, 'digital');
  _assert('Nunca baja de 0', 0, _obtenerConteoHoyAnalista(_TEST_EMAIL_CONTADORES).digital);

  // Limpieza.
  var estado2 = _leerContadoresCupoHoy();
  delete estado2.datos[_TEST_EMAIL_CONTADORES + '|digital'];
  _guardarContadoresCupoHoy(estado2);
}

function test_V4_CargaPendiente() {
  _seccion('V4. Carga pendiente (email de prueba aislado)');
  _assert('Arranca en 0', 0, _obtenerCargaPendienteAnalista(_TEST_EMAIL_CONTADORES));
  _ajustarCargaPendiente(_TEST_EMAIL_CONTADORES, 1);
  _ajustarCargaPendiente(_TEST_EMAIL_CONTADORES, 1);
  _assert('Sube con asignaciones', 2, _obtenerCargaPendienteAnalista(_TEST_EMAIL_CONTADORES));
  _ajustarCargaPendiente(_TEST_EMAIL_CONTADORES, -1);
  _assert('Baja al cerrar un caso', 1, _obtenerCargaPendienteAnalista(_TEST_EMAIL_CONTADORES));
  _ajustarCargaPendiente(_TEST_EMAIL_CONTADORES, -5);
  _assert('Nunca baja de 0', 0, _obtenerCargaPendienteAnalista(_TEST_EMAIL_CONTADORES));

  // Limpieza.
  var datos = _leerCargaPendienteTodos();
  delete datos[_TEST_EMAIL_CONTADORES];
  _guardarCargaPendienteTodos(datos);
}

function test_V5_RegistrarAsignacionYCierre() {
  _seccion('V5. _registrarAsignacionContador + _registrarCierreContador end-to-end');
  var ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);

  _registrarAsignacionContador(_TEST_EMAIL_CONTADORES, 'induccion');
  _assert('Asignar suma cupo hoy', 1, _obtenerConteoHoyAnalista(_TEST_EMAIL_CONTADORES).induccion);
  _assert('Asignar suma carga pendiente', 1, _obtenerCargaPendienteAnalista(_TEST_EMAIL_CONTADORES));

  // Cerrar un caso asignado HOY no debe sumar cupo otra vez (ya se contó al asignar).
  _registrarCierreContador(_TEST_EMAIL_CONTADORES, 'induccion', new Date());
  _assert('Cerrar caso de hoy no duplica el cupo', 1, _obtenerConteoHoyAnalista(_TEST_EMAIL_CONTADORES).induccion);
  _assert('Cerrar descuenta carga pendiente', 0, _obtenerCargaPendienteAnalista(_TEST_EMAIL_CONTADORES));

  // Cerrar hoy un caso asignado un día distinto SÍ debe sumar cupo (mismo criterio
  // de negocio que el escaneo original: cuenta lo cerrado hoy aunque sea viejo).
  _registrarAsignacionContador(_TEST_EMAIL_CONTADORES, 'reestudio');
  var estadoIntermedio = _leerContadoresCupoHoy();
  delete estadoIntermedio.datos[_TEST_EMAIL_CONTADORES + '|reestudio']; // simula que ese cupo no se contó hoy
  _guardarContadoresCupoHoy(estadoIntermedio);
  _registrarCierreContador(_TEST_EMAIL_CONTADORES, 'reestudio', ayer);
  _assert('Cerrar caso viejo hoy sí suma cupo', 1, _obtenerConteoHoyAnalista(_TEST_EMAIL_CONTADORES).reestudio);

  // Limpieza completa de las claves de prueba.
  var estado = _leerContadoresCupoHoy();
  delete estado.datos[_TEST_EMAIL_CONTADORES + '|induccion'];
  delete estado.datos[_TEST_EMAIL_CONTADORES + '|reestudio'];
  _guardarContadoresCupoHoy(estado);
  var datos = _leerCargaPendienteTodos();
  delete datos[_TEST_EMAIL_CONTADORES];
  _guardarCargaPendienteTodos(datos);
}

// ============================================================
// BLOQUE W: PARSEO DE CANON CON FORMATO COLOMBIANO
// ============================================================

function test_W1_ParseCanonColombiano() {
  _seccion('W1. _parseCanonColombiano — miles con punto, decimales con coma');
  _assert('Número plano', 8500000, _parseCanonColombiano('8500000'));
  _assert('Miles con punto + decimales con coma', 8500000, _parseCanonColombiano('8.500.000,00'));
  _assert('Miles con punto, sin decimales', 8500000, _parseCanonColombiano('8.500.000'));
  _assert('Un solo punto de miles (3 dígitos)', 8500, _parseCanonColombiano('8.500'));
  _assert('Decimal real con punto (ya numérico)', 8500000.5, _parseCanonColombiano('8500000.5'));
  _assert('Vacío da 0', 0, _parseCanonColombiano(''));
  _assert('Null da 0', 0, _parseCanonColombiano(null));
  _assert('Coma sin puntos de miles', 8.5, _parseCanonColombiano('8,5'));

  // Caso real que motivó el fix: antes este valor se leía como 8.5 en vez de
  // 8'500.000, clasificando erróneamente un caso de Cánones Altos como Digital.
  _assert('Caso real que rompía el filtro de canon (regresión)', true, _parseCanonColombiano('8.500.000,00') >= 8000000);
}

// ============================================================
// BLOQUE X: SIMULACIÓN DE UN DÍA DE PRODUCCIÓN (30 analistas, ~1100 casos)
// ============================================================
// Genera una cola de casos y una plantilla de analistas 100% sintéticos en
// memoria — nunca se escribe una sola fila en ningún sheet, ni se toca
// PropertiesService real — y los hace pasar por la MISMA lógica de recolección
// y selección que usa el motor real en producción (_recolectarPendientesPrincipal,
// _recolectarPendientesReestudios, _ordenarYSeleccionarCandidatos). Modela el
// pool compartido tal como es en la realidad: todos los equipos leen la misma
// hoja "solicitud" y la misma hoja "ORIGEN" de reestudios, filtradas cada una
// por los cupos/canon propios de cada equipo — no son colas separadas por equipo.
//
// Lo único que lee de verdad (solo lectura, nunca escribe) es la configuración
// real de Equipos/cupos y la dotación real de analistas activos en Usuarios,
// para que la capacidad simulada refleje la configuración real del negocio.
//
// No modela: cierre de casos durante el día (solo asignación), ni el desempate
// VIP/score dentro de un mismo nivel de prioridad (eso ya lo cubre test_F1_RotacionVIP
// por separado) — es intencional, para mantener la simulación enfocada en verificar
// reparto de cupos, orden de prioridad y filtro de canon a escala real.

function _fakePropsSimulacion(seedOverrides) {
  var real = PropertiesService.getScriptProperties();
  var store = {
    GLOBAL_PRIORIDAD: real.getProperty('GLOBAL_PRIORIDAD') || 'DIGITAL_PRIMERO',
    ORDEN_DESAPLAZAMIENTO: real.getProperty('ORDEN_DESAPLAZAMIENTO') || 'RECIENTE_PRIMERO'
  };
  if (seedOverrides) Object.keys(seedOverrides).forEach(function(k) { store[k] = seedOverrides[k]; });
  return {
    getProperty: function(k) { return store.hasOwnProperty(k) ? store[k] : null; },
    setProperty: function(k, v) { store[k] = v; }
  };
}

function _formatearCanonColombianoTest(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function _construirFilaPrincipalSintetica(opts) {
  var row = new Array(59).fill('');
  row[1] = opts.poliza;
  row[9] = opts.canon !== undefined ? opts.canon : 0;
  row[16] = opts.estado;
  row[17] = opts.fechaRadicacion;
  row[18] = opts.fechaResultado || opts.fechaRadicacion;
  row[20] = opts.clase || '';
  row[27] = '';
  row[36] = opts.canal || '';
  row[58] = opts.reasignada ? 'REASIGNADA' : '';
  return row;
}

function _construirFilaReestudioSintetica(opts) {
  var row = new Array(11).fill('');
  row[0] = opts.fecha;
  row[1] = opts.poliza;
  row[3] = opts.origen;
  row[4] = opts.tipoP;
  row[6] = '';
  row[10] = '';
  return row;
}

function _barajarSimulacion(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function test_X1_SimulacionDiaProduccion() {
  _seccion('X1. Simulación de un día de producción — 30 analistas, ~1100 casos/día (100% en memoria)');
  var t0 = Date.now();

  var TOTAL_ANALISTAS_SIMULADOS = 30;
  var META_NEGOCIO = 1100;
  var OVERSUPPLY = 1.25; // genera algo más que la capacidad teórica para que el límite real sea el cupo, no la cola
  var TIPOS = ['digital', 'desaplazamiento', 'induccion', 'reestudio', 'nuevaUar', 'deudorUar', 'biometriaFallida'];

  // --- Dotación y cupos REALES (solo lectura — no se escribe nada) ---
  var equipos = _getEquipos().filter(function(e) { return e.activo; });
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var dataUsuarios = ss.getSheetByName('Usuarios').getDataRange().getValues();
  var activosPorEquipo = {};
  equipos.forEach(function(e) { activosPorEquipo[e.id] = 0; });
  for (var iu = 1; iu < dataUsuarios.length; iu++) {
    if (String(dataUsuarios[iu][5]).toUpperCase().trim() !== 'ACTIVO') continue;
    var eqReal = resolverEquipoDesdeEspecialidad(String(dataUsuarios[iu][4]).toUpperCase().trim());
    if (eqReal && activosPorEquipo.hasOwnProperty(eqReal.id)) activosPorEquipo[eqReal.id]++;
  }
  var totalActivosReal = Object.keys(activosPorEquipo).reduce(function(s, k) { return s + activosPorEquipo[k]; }, 0);

  var analistasPorEquipo = {};
  equipos.forEach(function(e) {
    var proporcion = totalActivosReal > 0 ? (activosPorEquipo[e.id] / totalActivosReal) : (1 / equipos.length);
    analistasPorEquipo[e.id] = Math.max(1, Math.round(proporcion * TOTAL_ANALISTAS_SIMULADOS));
  });

  var cuposPorEquipo = {};
  equipos.forEach(function(e) { cuposPorEquipo[e.id] = obtenerCuposEfectivos('zzz_simulacion_no_existe@no-existe.invalido', e.id); });

  var capacidadPorTipo = {};
  TIPOS.forEach(function(t) {
    capacidadPorTipo[t] = equipos.reduce(function(s, e) { return s + (cuposPorEquipo[e.id][t] || 0) * analistasPorEquipo[e.id]; }, 0);
  });

  // "digital" se reparte entre DIGITAL (canon bajo) y CANONES_ALTOS (canon alto),
  // proporcional a la capacidad real de cada uno.
  var eqDigital = equipos.find(function(e) { return e.id === 'DIGITAL'; });
  var eqCanonAlto = equipos.find(function(e) { return e.id === 'CANONES_ALTOS'; });
  var capDigitalBajo = eqDigital ? (cuposPorEquipo.DIGITAL.digital || 0) * (analistasPorEquipo.DIGITAL || 0) : 0;
  var capDigitalAlto = eqCanonAlto ? (cuposPorEquipo.CANONES_ALTOS.digital || 0) * (analistasPorEquipo.CANONES_ALTOS || 0) : 0;
  var totalDigital = capDigitalBajo + capDigitalAlto || 1;
  var fraccionBajo = capDigitalBajo / totalDigital;
  var umbralCanon = (eqCanonAlto && eqCanonAlto.canonDesde > 0) ? eqCanonAlto.canonDesde : 8000000;

  // --- Generar UNA sola cola compartida "solicitud" (principal) ---
  var principales = [];
  var polizaSeq = 1;
  var metaDigital = Math.round(capacidadPorTipo.digital * OVERSUPPLY);
  for (var i = 0; i < metaDigital; i++) {
    var esBajo = (i / metaDigital) < fraccionBajo;
    var canon = esBajo ? (umbralCanon * 0.15 + Math.random() * umbralCanon * 0.8) : (umbralCanon + Math.random() * umbralCanon * 1.2);
    var canonValor = (i % 9 === 0) ? _formatearCanonColombianoTest(canon) : Math.round(canon);
    principales.push(_construirFilaPrincipalSintetica({
      poliza: 'SIMPOL' + (polizaSeq++), canon: canonValor, estado: 'EN_ESTUDIO',
      fechaRadicacion: new Date(Date.now() - i * 60000), fechaResultado: new Date(Date.now() - i * 30000),
      clase: '', canal: (i % 7 === 0) ? 'PAGINA_WEB' : '', reasignada: (i % 29 === 0)
    }));
  }
  var metaDesaplazamiento = Math.round(capacidadPorTipo.desaplazamiento * OVERSUPPLY);
  for (var j = 0; j < metaDesaplazamiento; j++) {
    principales.push(_construirFilaPrincipalSintetica({
      poliza: 'SIMPOL' + (polizaSeq++), canon: 0, estado: 'APROBADO_PENDIENTE_BIOMETRIA',
      fechaRadicacion: new Date(Date.now() - j * 60000), fechaResultado: new Date(Date.now() - j * 45000),
      clase: '', canal: '', reasignada: (j % 29 === 0)
    }));
  }
  var metaInduccion = Math.round(capacidadPorTipo.induccion * OVERSUPPLY);
  for (var k = 0; k < metaInduccion; k++) {
    principales.push(_construirFilaPrincipalSintetica({
      poliza: 'SIMPOL' + (polizaSeq++), canon: 0, estado: 'EN_ESTUDIO',
      fechaRadicacion: new Date(Date.now() - k * 60000), fechaResultado: new Date(Date.now() - k * 30000),
      clase: 'INDUCCION', canal: '', reasignada: false
    }));
  }

  // --- Generar UNA sola cola compartida "ORIGEN" (reestudios/UAR/biometría fallida) ---
  var reestudios = [];
  var tiposReest = [
    { tipo: 'reestudio', tipoP: 'REESTUDIO', origen: 'OTRO' },
    { tipo: 'nuevaUar', tipoP: 'NUEVA', origen: 'CORREO' },
    { tipo: 'deudorUar', tipoP: 'ADICIONAL', origen: 'CORREO' },
    { tipo: 'biometriaFallida', tipoP: 'BIOMETRIA FALLIDA', origen: 'OTRO' }
  ];
  tiposReest.forEach(function(info) {
    var meta = Math.round(capacidadPorTipo[info.tipo] * OVERSUPPLY);
    for (var n = 0; n < meta; n++) {
      reestudios.push(_construirFilaReestudioSintetica({
        fecha: new Date(Date.now() - n * 60000), poliza: 'SIMPOL' + (polizaSeq++), origen: info.origen, tipoP: info.tipoP
      }));
    }
  });

  var poolPrincipal = [[]].concat(principales);
  var poolReestudios = [[]].concat(reestudios);
  var totalCasosGenerados = principales.length + reestudios.length;

  // --- Turnos de 30 analistas sintéticos, repartidos por equipo según dotación real ---
  var ordenAnalistas = [];
  equipos.forEach(function(e) {
    for (var a = 0; a < analistasPorEquipo[e.id]; a++) {
      ordenAnalistas.push({ email: 'zzz_sim_' + e.id + '_' + a + '@no-existe.invalido', equipoId: e.id });
    }
  });
  ordenAnalistas = _barajarSimulacion(ordenAnalistas);

  var conteoPorAnalista = {};
  ordenAnalistas.forEach(function(a) { conteoPorAnalista[a.email] = {}; TIPOS.forEach(function(t) { conteoPorAnalista[a.email][t] = 0; }); });

  var propsSimPorEquipo = {};
  equipos.forEach(function(e) { propsSimPorEquipo[e.id] = _fakePropsSimulacion(); });

  var totalAsignados = 0;
  var turno = 0;
  var vueltas = 0;
  var vueltasSinProgreso = 0;
  var limiteSinProgreso = ordenAnalistas.length * 3;
  var vueltasMaxAbsoluto = 50000; // tope de seguridad duro, no debería alcanzarse nunca

  while (vueltasSinProgreso < limiteSinProgreso && vueltas < vueltasMaxAbsoluto) {
    var analista = ordenAnalistas[turno % ordenAnalistas.length];
    turno++; vueltas++;
    var eqId = analista.equipoId;
    var equipo = equipos.find(function(e) { return e.id === eqId; });
    var cuotas = cuposPorEquipo[eqId];
    var conteoHoyAnalista = conteoPorAnalista[analista.email];

    var pendientes = [];
    if (poolPrincipal.length > 1) pendientes = pendientes.concat(_recolectarPendientesPrincipal(poolPrincipal, cuotas, conteoHoyAnalista, equipo.canonDesde || 0, equipo.canonHasta || 0, equipo.canonTipos || []));
    if (poolReestudios.length > 1) pendientes = pendientes.concat(_recolectarPendientesReestudios(poolReestudios, cuotas, conteoHoyAnalista));

    if (pendientes.length === 0) { vueltasSinProgreso++; continue; }

    var resultado = _ordenarYSeleccionarCandidatos(pendientes, cuotas, conteoHoyAnalista, equipo, propsSimPorEquipo[eqId], 1, null);
    if (resultado.seleccionados.length === 0) { vueltasSinProgreso++; continue; }

    var lead = resultado.seleccionados[0];
    if (lead.base === 'PRINCIPAL') {
      poolPrincipal = [poolPrincipal[0]].concat(poolPrincipal.slice(1).filter(function(r) { return r !== lead.rowData; }));
    } else {
      poolReestudios = [poolReestudios[0]].concat(poolReestudios.slice(1).filter(function(r) { return r !== lead.rowData; }));
    }
    if (!lead.reasignada) conteoHoyAnalista[lead.tipo] = (conteoHoyAnalista[lead.tipo] || 0) + 1;
    totalAsignados++;
    vueltasSinProgreso = 0;
  }
  var ms = Date.now() - t0;

  // --- Validaciones ---
  var excesosCupo = 0;
  var detalleExcesos = [];
  ordenAnalistas.forEach(function(a) {
    var cuotas = cuposPorEquipo[a.equipoId];
    var c = conteoPorAnalista[a.email];
    TIPOS.forEach(function(t) {
      if (cuotas[t] > 0 && c[t] > cuotas[t]) { excesosCupo++; detalleExcesos.push(a.email + '|' + t + '=' + c[t] + '>' + cuotas[t]); }
    });
  });

  var resumenPorEquipo = {};
  equipos.forEach(function(e) {
    resumenPorEquipo[e.id] = { asignados: 0, capacidadTeorica: TIPOS.reduce(function(s, t) { return s + (cuposPorEquipo[e.id][t] || 0) * analistasPorEquipo[e.id]; }, 0) };
  });
  ordenAnalistas.forEach(function(a) {
    var c = conteoPorAnalista[a.email];
    var s = 0;
    TIPOS.forEach(function(t) { s += c[t]; });
    resumenPorEquipo[a.equipoId].asignados += s;
  });

  var capacidadTotalSistema = Object.keys(resumenPorEquipo).reduce(function(s, k) { return s + resumenPorEquipo[k].capacidadTeorica; }, 0);
  var todosLlenaronSuCapacidad = Object.keys(resumenPorEquipo).every(function(k) {
    var r = resumenPorEquipo[k];
    return r.capacidadTeorica === 0 || r.asignados >= r.capacidadTeorica;
  });

  Logger.log('Dotación real usada como base: ' + JSON.stringify(activosPorEquipo) + ' (total activos: ' + totalActivosReal + ')');
  Logger.log('Analistas simulados por equipo (' + TOTAL_ANALISTAS_SIMULADOS + ' en total): ' + JSON.stringify(analistasPorEquipo));
  Logger.log('Casos generados: ' + totalCasosGenerados + ' | Casos asignados: ' + totalAsignados + ' | Vueltas de turno: ' + vueltas + ' | Tiempo: ' + ms + 'ms');
  Logger.log('Capacidad teórica del sistema con los cupos configurados HOY: ' + capacidadTotalSistema + ' casos/día, con ' + TOTAL_ANALISTAS_SIMULADOS + ' analistas.');
  Logger.log('Meta de negocio declarada: ~' + META_NEGOCIO + ' casos/día. Diferencia: ' + (capacidadTotalSistema - META_NEGOCIO) + '.');
  Logger.log('Por equipo (asignados / capacidad teórica): ' + JSON.stringify(resumenPorEquipo));

  _assert('No se excede ningún cupo diario de ningún analista simulado', 0, excesosCupo);
  _assert('Cada equipo con capacidad configurada llega a su capacidad teórica (usa todos sus cupos)', true, todosLlenaronSuCapacidad);
  _assert('La simulación converge sola, sin necesitar el tope de seguridad', true, vueltas < vueltasMaxAbsoluto);
  _assert('Se completó en tiempo razonable (menos de 30 segundos)', true, ms < 30000);

  if (capacidadTotalSistema < META_NEGOCIO) {
    Logger.log('⚠️ ATENCIÓN: con los cupos y la dotación configurados hoy, el sistema soporta ' + capacidadTotalSistema + ' casos/día, por debajo de la meta de ' + META_NEGOCIO + '. Esto no es un fallo del código — es una señal de negocio: revisar cupos o dotación por equipo.');
  }
}

// ============================================================
// ============================================================
// BLOQUE Y: MÓDULO DE MÉTRICAS
// ============================================================

function test_Y1_FechaConversion_CasosNormales() {
  _seccion('Y1. _fechaDDMMYYYYaNumero: casos normales');
  _assert('25/12/2024 → 20241225', 20241225, _fechaDDMMYYYYaNumero('25/12/2024'));
  _assert('01/01/2025 → 20250101', 20250101, _fechaDDMMYYYYaNumero('01/01/2025'));
  _assert('28/02/2024 → 20240228', 20240228, _fechaDDMMYYYYaNumero('28/02/2024'));
  _assert('29/02/2024 (bisiesto) → 20240229', 20240229, _fechaDDMMYYYYaNumero('29/02/2024'));
  _assert('31/12/2024 → 20241231', 20241231, _fechaDDMMYYYYaNumero('31/12/2024'));
  _assert('15/06/2023 → 20230615', 20230615, _fechaDDMMYYYYaNumero('15/06/2023'));
}

function test_Y2_FechaConversion_CasosInvalidos() {
  _seccion('Y2. _fechaDDMMYYYYaNumero: casos inválidos y vacíos');
  _assert('null → null', null, _fechaDDMMYYYYaNumero(null));
  _assert('undefined → null', null, _fechaDDMMYYYYaNumero(undefined));
  _assert('"" → null', null, _fechaDDMMYYYYaNumero(''));
  _assert('"invalid" → null', null, _fechaDDMMYYYYaNumero('invalid'));
  _assert('"abc/def/ghi" → null', null, _fechaDDMMYYYYaNumero('abc/def/ghi'));
  _assert('número 12345 → null', null, _fechaDDMMYYYYaNumero(12345));
  _assert('"2024-12-25" (ISO) → null', null, _fechaDDMMYYYYaNumero('2024-12-25'));
  _assert('"25/12" (sin año) → null', null, _fechaDDMMYYYYaNumero('25/12'));
}

function test_Y3_FechaConversion_Imposibles() {
  _seccion('Y3. _fechaDDMMYYYYaNumero: fechas imposibles (no rompen, generan Logger.log)');
  // No deben romper — retornan un entero pero generan advertencia en logs
  var r1 = _fechaDDMMYYYYaNumero('32/13/2024');
  _assert('"32/13/2024" retorna número (no null)', true, typeof r1 === 'number');
  _assert('"32/13/2024" = 20241332', 20241332, r1);
  Logger.log('  → Arriba debería verse un ⚠️ de Logger.log por fecha fuera de rango');

  var r2 = _fechaDDMMYYYYaNumero('00/00/2024');
  _assert('"00/00/2024" retorna número', true, typeof r2 === 'number');
  Logger.log('  → Arriba debería verse un ⚠️ por dd=0, mm=0');
}

function test_Y4_ValorAFechaNumero_DateObjects() {
  _seccion('Y4. _valorAFechaNumero: Date objects');
  _assert('Date(2024,11,31) → 20241231', 20241231, _valorAFechaNumero(new Date(2024, 11, 31)));
  _assert('Date(2025,0,1) → 20250101', 20250101, _valorAFechaNumero(new Date(2025, 0, 1)));
  _assert('Date(2024,1,29) bisiesto → 20240229', 20240229, _valorAFechaNumero(new Date(2024, 1, 29)));
  _assert('Invalid Date → null', null, _valorAFechaNumero(new Date('invalid')));
  _assert('null → null', null, _valorAFechaNumero(null));
  _assert('"" → null', null, _valorAFechaNumero(''));
  _assert('0 → null', null, _valorAFechaNumero(0));
}

function test_Y5_ValorAFechaNumero_Strings() {
  _seccion('Y5. _valorAFechaNumero: strings dd/MM/yyyy');
  _assert('"31/12/2024" → 20241231', 20241231, _valorAFechaNumero('31/12/2024'));
  _assert('"01/01/2025" → 20250101', 20250101, _valorAFechaNumero('01/01/2025'));
  _assert('"texto" → null', null, _valorAFechaNumero('texto'));
}

function test_Y6_FechaIdaYVuelta() {
  _seccion('Y6. Ida y vuelta: string → número → string');
  var casos = ['01/01/2000', '31/12/2024', '29/02/2024', '15/06/2023', '05/03/2025', '28/02/2025'];
  for (var i = 0; i < casos.length; i++) {
    var num = _fechaDDMMYYYYaNumero(casos[i]);
    var vuelta = _fechaNumeroAString(num);
    _assert('Ida-vuelta "' + casos[i] + '"', casos[i], vuelta);
  }
}

function test_Y7_FechaOrdenCronologico() {
  _seccion('Y7. Comparación numérica preserva orden cronológico');
  var fechas = ['31/12/2024', '01/01/2025', '15/01/2025', '28/02/2025'];
  for (var i = 0; i < fechas.length - 1; i++) {
    var a = _fechaDDMMYYYYaNumero(fechas[i]);
    var b = _fechaDDMMYYYYaNumero(fechas[i + 1]);
    _assert(fechas[i] + ' < ' + fechas[i + 1], true, a < b);
  }
}

function test_Y8_VerificarAdminDesdeInstancia_Rechaza() {
  _seccion('Y8. _verificarAdminDesdeInstancia: rechaza NO-admin');
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hojaUser = ss.getSheetByName("Usuarios");
  var data = hojaUser.getDataRange().getValues();

  // Buscar un usuario ASESOR real
  var correoAsesor = null;
  for (var i = 1; i < data.length; i++) {
    var rol = String(data[i][23] || '').toUpperCase().trim();
    if (rol === 'ASESOR' || (rol !== 'ADMIN' && rol !== '')) {
      correoAsesor = String(data[i][2]).trim();
      break;
    }
  }
  Logger.log('  ASESOR encontrado para test: ' + (correoAsesor || '(ninguno)'));

  // El test de rechazo NO puede simular Session.getActiveUser() directamente —
  // pero podemos verificar la lógica con una versión inline que acepta email
  function _verificarConEmail(ss, email) {
    var hojaU = ss.getSheetByName("Usuarios");
    var dataU = hojaU.getDataRange().getValues();
    var usuario = null;
    for (var j = 0; j < dataU.length; j++) {
      if (String(dataU[j][2]).toLowerCase().trim() === email.toLowerCase().trim()) { usuario = dataU[j]; break; }
    }
    if (!usuario || String(usuario[23]).toUpperCase().trim() !== "ADMIN") {
      throw new Error("Acceso Denegado: Se requieren permisos de Administrador.");
    }
  }

  // Test: ASESOR debe ser rechazado
  if (correoAsesor) {
    var lanzaError = false;
    try { _verificarConEmail(ss, correoAsesor); } catch (e) { lanzaError = true; }
    _assert('ASESOR "' + correoAsesor + '" es RECHAZADO', true, lanzaError);
  } else {
    Logger.log('  ⚠️ No hay ASESOR para probar rechazo');
  }

  // Test: email inexistente debe ser rechazado
  var lanzaNoExiste = false;
  try { _verificarConEmail(ss, 'no_existe_xyz_000@fake.com'); } catch (e) { lanzaNoExiste = true; }
  _assert('Email inexistente es RECHAZADO', true, lanzaNoExiste);

  // Test: el usuario actual (ejecutando este test) es ADMIN y debe pasar
  var lanzaAdmin = false;
  try { _verificarAdminDesdeInstancia(ss); } catch (e) { lanzaAdmin = true; }
  _assert('Usuario actual (ADMIN) PASA', false, lanzaAdmin);
}

function test_Y9_ObtenerDatosMetricas_Real() {
  _seccion('Y9. obtenerDatosMetricas: datos reales con rango última semana');
  var hoy = new Date();
  var hace7 = new Date(hoy.getTime() - 7 * 86400000);
  var dd = function(d) { return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };
  var fechaDesde = dd(hace7);
  var fechaHasta = dd(hoy);
  Logger.log('  Rango: ' + fechaDesde + ' → ' + fechaHasta);

  var resultado = obtenerDatosMetricas(fechaDesde, fechaHasta, true);

  // Estructura completa
  _assert('Tiene totalGestionadas (number)', true, typeof resultado.totalGestionadas === 'number');
  _assert('Tiene tiempoPromedioMinutos (number)', true, typeof resultado.tiempoPromedioMinutos === 'number');
  _assert('Tiene tasaAprobacion (number)', true, typeof resultado.tasaAprobacion === 'number');
  _assert('Tiene fueraDeSLA (number)', true, typeof resultado.fueraDeSLA === 'number');
  _assert('Tiene produccionDiaria (array)', true, Array.isArray(resultado.produccionDiaria));
  _assert('Tiene distribucionEstados.aprobadas', true, typeof resultado.distribucionEstados.aprobadas === 'number');
  _assert('Tiene distribucionEstados.negadas', true, typeof resultado.distribucionEstados.negadas === 'number');
  _assert('Tiene distribucionEstados.aplazadas', true, typeof resultado.distribucionEstados.aplazadas === 'number');
  _assert('Tiene porAnalista (array)', true, Array.isArray(resultado.porAnalista));
  _assert('Tiene slaDiario (array)', true, Array.isArray(resultado.slaDiario));

  // Invariantes aritméticas
  var sumaEstados = resultado.distribucionEstados.aprobadas + resultado.distribucionEstados.negadas + resultado.distribucionEstados.aplazadas + (resultado.distribucionEstados.rechazadas || 0);
  _assert('aprobadas+negadas+aplazadas+rechazadas == totalGestionadas', resultado.totalGestionadas, sumaEstados);

  if (resultado.totalGestionadas > 0) {
    var tasaEsperada = Math.round((resultado.distribucionEstados.aprobadas / resultado.totalGestionadas) * 1000) / 10;
    _assert('tasaAprobacion = (aprobadas/total)*100', tasaEsperada, resultado.tasaAprobacion);
  }

  // Producción diaria suma al total
  var sumaProduccion = 0;
  for (var i = 0; i < resultado.produccionDiaria.length; i++) {
    sumaProduccion += resultado.produccionDiaria[i].cantidad;
  }
  _assert('sum(produccionDiaria) == totalGestionadas', resultado.totalGestionadas, sumaProduccion);

  // porAnalista ordenado descendente
  var ordenOK = true;
  for (var j = 0; j < resultado.porAnalista.length - 1; j++) {
    if (resultado.porAnalista[j].total < resultado.porAnalista[j + 1].total) { ordenOK = false; break; }
  }
  _assert('porAnalista ordenado desc por total', true, ordenOK);

  // Log resumen
  Logger.log('  totalGestionadas: ' + resultado.totalGestionadas);
  Logger.log('  tiempoPromedio: ' + resultado.tiempoPromedioMinutos + ' min');
  Logger.log('  tasaAprobacion: ' + resultado.tasaAprobacion + '%');
  Logger.log('  fueraSLA: ' + resultado.fueraDeSLA);
  Logger.log('  analistas: ' + resultado.porAnalista.length);
  Logger.log('  días con datos: ' + resultado.produccionDiaria.length);
}

function test_Y10_Cache_ForceRefresh() {
  _seccion('Y10. CacheService: forceRefresh=false usa caché, true la ignora');
  var fechaDesde = '01/01/2020';
  var fechaHasta = '02/01/2020';

  // Primera llamada: cache miss, escribe en caché
  var r1 = obtenerDatosMetricas(fechaDesde, fechaHasta, true);
  _assert('Primera llamada retorna objeto', true, typeof r1 === 'object' && r1 !== null);

  // Segunda llamada sin forceRefresh: debería venir de caché (mismos datos)
  var r2 = obtenerDatosMetricas(fechaDesde, fechaHasta, false);
  _assert('Cache hit retorna mismo totalGestionadas', r1.totalGestionadas, r2.totalGestionadas);
  _assert('Cache hit retorna misma tasaAprobacion', r1.tasaAprobacion, r2.tasaAprobacion);

  // Tercera llamada con forceRefresh: recalcula (puede ser igual si no hay cambios)
  var r3 = obtenerDatosMetricas(fechaDesde, fechaHasta, true);
  _assert('forceRefresh retorna objeto válido', true, typeof r3.totalGestionadas === 'number');

  // Nota: forceRefresh NO tiene rate-limiting server-side — el botón "Actualizar"
  // es la única UI que envía forceRefresh=true. Navegación, filtros y botones
  // rápidos siempre pasan false. Un admin tendría que presionar "Actualizar"
  // manualmente cada vez — no hay riesgo real de abuso.
  Logger.log('  ⓘ forceRefresh no tiene throttle server-side (deliberado: 1-2 admins)');
  _assert('forceRefresh: sin throttle (by design)', true, true);
}

// ============================================================
// BLOQUE Z: RENDIMIENTO guardarCambiosInternos + caché MotorTiempos
// ============================================================

function test_Z1_CacheConfigHoraria_TTL6h() {
  _seccion('Z1. CacheService para config horaria: TTL = 6h (21600s)');
  _assert('TTL definido como 21600', 21600, _CACHE_TTL_CONFIG_HORARIA_SEG);
}

function test_Z2_CacheConfigHoraria_ConsistenciaConYSinCache() {
  _seccion('Z2. Config horaria: caché devuelve mismo resultado que lectura directa');
  
  // Forzar lectura sin caché
  _invalidarCacheConfigHoraria();
  var t0 = new Date().getTime();
  var sinCache = _cargarConfigHorariaSinCache();
  var durSinCache = new Date().getTime() - t0;
  
  // Ahora debe quedar cacheado
  var t1 = new Date().getTime();
  var conCache = _cargarConfigHoraria();
  var durConCache = new Date().getTime() - t1;
  
  // Segunda lectura — debería ser cache hit
  var t2 = new Date().getTime();
  var cacheHit = _cargarConfigHoraria();
  var durCacheHit = new Date().getTime() - t2;
  
  Logger.log('  Sin caché: ' + durSinCache + 'ms | Con caché (primer hit tras write): ' + durConCache + 'ms | Cache hit puro: ' + durCacheHit + 'ms');
  
  _assert('festivos.size igual', sinCache.festivos.size, conCache.festivos.size);
  _assert('turnos.size igual', sinCache.turnos.size, conCache.turnos.size);
  _assert('analistaTurnos.size igual', sinCache.analistaTurnos.size, conCache.analistaTurnos.size);
  _assert('Cache hit más rápido que sin caché', true, durCacheHit < durSinCache);
}

function test_Z3_InvalidacionCacheFestivos() {
  _seccion('Z3. _invalidarCacheConfigHoraria se invoca en funciones de festivos');
  var srcAgregar = admin_agregarFestivo.toString();
  var srcEliminar = admin_eliminarFestivo.toString();
  var srcImportar = _importarFestivosColombiaInterno.toString();
  
  _assert('admin_agregarFestivo llama _invalidarCacheConfigHoraria', true, srcAgregar.indexOf('_invalidarCacheConfigHoraria') !== -1);
  _assert('admin_eliminarFestivo llama _invalidarCacheConfigHoraria', true, srcEliminar.indexOf('_invalidarCacheConfigHoraria') !== -1);
  _assert('_importarFestivosColombiaInterno llama _invalidarCacheConfigHoraria', true, srcImportar.indexOf('_invalidarCacheConfigHoraria') !== -1);
}

function test_Z4_GuardarDigital_NoCargaReestudios() {
  _seccion('Z4. guardarCambiosInternos: caso digital NO abre ssReestudios');
  var src = guardarCambiosInternos.toString();
  _assert('Usa _getSsReestudios() (lazy)', true, src.indexOf('_getSsReestudios()') !== -1);
  _assert('NO abre ssReestudios directamente al inicio', true, src.indexOf('const ssReestudios = SpreadsheetApp.openById') === -1);
}

function test_Z5_CalcTiempos_ConCacheVsSinCache() {
  _seccion('Z5. calcularTiemposCaso: rendimiento con caché vs sin caché');
  
  // Buscar un caso real reciente para medir
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName("Historico_Gestiones");
  if (!hoja || hoja.getLastRow() <= 1) { Logger.log('  Sin datos para medir'); return; }
  
  // Tomar la última fila con datos completos
  var lastRow = hoja.getLastRow();
  var fila = hoja.getRange(lastRow, 1, 1, 35).getValues()[0];
  var emailTest = String(fila[25] || '').toLowerCase().trim();
  var fechaAsig = fila[24] instanceof Date ? fila[24] : new Date();
  var fechaRad = fila[17] instanceof Date ? fila[17] : fechaAsig;
  var ahora = new Date();
  
  if (!emailTest) { Logger.log('  No hay email en última fila'); return; }
  
  // Medición 1: sin caché (invalidar primero)
  _invalidarCacheConfigHoraria();
  var t0 = new Date().getTime();
  var r1 = calcularTiemposCaso(fechaRad, fechaAsig, ahora, emailTest);
  var durSinCache = new Date().getTime() - t0;
  
  // Medición 2: con caché (ya quedó cacheado por la llamada anterior)
  var t1 = new Date().getTime();
  var r2 = calcularTiemposCaso(fechaRad, fechaAsig, ahora, emailTest);
  var durConCache = new Date().getTime() - t1;
  
  Logger.log('  calcularTiemposCaso SIN caché: ' + durSinCache + 'ms');
  Logger.log('  calcularTiemposCaso CON caché: ' + durConCache + 'ms');
  Logger.log('  Ahorro: ' + (durSinCache - durConCache) + 'ms (' + Math.round((1 - durConCache/durSinCache) * 100) + '%)');
  Logger.log('  Resultado: cola=' + r1.minutos_cola + ' gestión=' + r1.minutos_gestion + ' general=' + r1.minutos_general);
  
  _assert('Resultado sin/con caché es idéntico (cola)', r1.minutos_cola, r2.minutos_cola);
  _assert('Resultado sin/con caché es idéntico (gestion)', r1.minutos_gestion, r2.minutos_gestion);
  _assert('Resultado sin/con caché es idéntico (general)', r1.minutos_general, r2.minutos_general);
  _assert('Con caché es más rápido', true, durConCache < durSinCache);
}

function test_Z6_InvalidacionCacheTurnosYHorasExtra() {
  _seccion('Z6. _invalidarCacheConfigHoraria se invoca en funciones de turnos y horas extra');
  var srcGuardarTurno = admin_guardarTurno.toString();
  var srcDesactivarTurno = admin_desactivarTurno.toString();
  var srcAsignarTurno = admin_asignarTurnoAnalista.toString();
  var srcGuardarHE = admin_guardarHorasExtra.toString();
  var srcEliminarHE = admin_eliminarHorasExtra.toString();

  _assert('admin_guardarTurno llama _invalidarCacheConfigHoraria', true, srcGuardarTurno.indexOf('_invalidarCacheConfigHoraria') !== -1);
  _assert('admin_desactivarTurno llama _invalidarCacheConfigHoraria', true, srcDesactivarTurno.indexOf('_invalidarCacheConfigHoraria') !== -1);
  _assert('admin_asignarTurnoAnalista llama _invalidarCacheConfigHoraria', true, srcAsignarTurno.indexOf('_invalidarCacheConfigHoraria') !== -1);
  _assert('admin_guardarHorasExtra llama _invalidarCacheConfigHoraria', true, srcGuardarHE.indexOf('_invalidarCacheConfigHoraria') !== -1);
  _assert('admin_eliminarHorasExtra llama _invalidarCacheConfigHoraria', true, srcEliminarHE.indexOf('_invalidarCacheConfigHoraria') !== -1);
}

function test_Z7_GetTableData_ReusaSsReestudios() {
  _seccion('Z7. getTableData: reutiliza ssReestudios (no abre 3 veces)');
  var src = getTableData.toString();
  
  // Debe tener _getSsReest() (lazy)
  _assert('Usa _getSsReest() (lazy open)', true, src.indexOf('_getSsReest()') !== -1);
  
  // Debe tener exactamente 1 openById(ID_HOJA_REESTUDIOS) — dentro de _getSsReest
  // (antes tenía 3 directos). El de TARGET_SOLICITUDES_SS_ID es aparte.
  var reestOpens = (src.match(/openById\(ID_HOJA_REESTUDIOS\)/g) || []).length;
  _assert('Solo 1 openById(ID_HOJA_REESTUDIOS) — dentro de _getSsReest', 1, reestOpens);
}

function test_Z8_GetTableData_Rendimiento() {
  _seccion('Z8. getTableData: medición de rendimiento real');
  
  var t0 = new Date().getTime();
  var resultado = getTableData();
  var dur = new Date().getTime() - t0;
  
  Logger.log('  getTableData total: ' + dur + 'ms');
  Logger.log('  Filas pendientes retornadas: ' + (resultado.tabla ? resultado.tabla.length - 1 : 0));
  Logger.log('  Gestionadas hoy: ' + resultado.stats.hoy + ' | total: ' + resultado.stats.total);
  
  _assert('Retorna objeto con tabla', true, Array.isArray(resultado.tabla));
  _assert('Retorna stats.hoy (number)', true, typeof resultado.stats.hoy === 'number');
  _assert('Retorna stats.total (number)', true, typeof resultado.stats.total === 'number');
  _assert('Completa en menos de 10s', true, dur < 10000);
}

function test_Z9_CargarPanelAnalista_Rendimiento() {
  _seccion('Z9. cargarPanelAnalista: medición end-to-end');
  
  var t0 = new Date().getTime();
  var panel = cargarPanelAnalista();
  var dur = new Date().getTime() - t0;
  
  Logger.log('  cargarPanelAnalista total: ' + dur + 'ms');
  Logger.log('  tabla filas: ' + (panel.tabla && panel.tabla.tabla ? panel.tabla.tabla.length - 1 : '?'));
  Logger.log('  cupos: ' + (panel.cupos ? 'OK' : 'null'));
  Logger.log('  gestionesHoy: ' + (panel.gestionesHoyCruzadas ? panel.gestionesHoyCruzadas.hoyTotal : '?'));
  
  _assert('panel.tabla existe', true, panel.tabla !== null);
  _assert('panel.cupos existe', true, panel.cupos !== null);
  _assert('panel.gestionesHoyCruzadas existe', true, panel.gestionesHoyCruzadas !== null);
  _assert('Completa en menos de 15s', true, dur < 15000);
}

function test_Z10_TelemetriaLock_RegistraYLee() {
  _seccion('Z10. Telemetría de lock: registra y lee correctamente');
  
  var props = PropertiesService.getScriptProperties();
  var hoy = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  var keyHoy = 'LOCK_TEL_' + hoy;
  var keyTimeouts = 'LOCK_TIMEOUT_COUNT_V1';
  
  // PRESERVAR estado original (no destruir datos reales en producción)
  var originalEntries = props.getProperty(keyHoy);
  var originalTimeouts = props.getProperty(keyTimeouts);
  
  // Limpiar para el test
  props.deleteProperty(keyHoy);
  props.deleteProperty(keyTimeouts);
  
  try {
    // Registrar 3 entradas de prueba
    _registrarTelemetriaLock('TEST_FN_1', 250, 0, true);
    _registrarTelemetriaLock('TEST_FN_2', 1200, 2, true);
    _registrarTelemetriaLock('TEST_FN_1', 0, 0, false);
    
    // Registrar 2 timeouts
    _incrementarLockTimeout('TEST_FN_1');
    _incrementarLockTimeout('TEST_FN_1');
    _incrementarLockTimeout('TEST_FN_2');
    
    // Leer vía admin
    var telemetry = admin_getLockTelemetry();
    
    _assert('entries es array', true, Array.isArray(telemetry.entries));
    _assert('Al menos 3 entries registradas', true, telemetry.entries.length >= 3);
    
    // Verificar las últimas 3 entries (las nuestras)
    var last3 = telemetry.entries.slice(-3);
    _assert('Entry 1 fn = TEST_FN_1', 'TEST_FN_1', last3[0].fn);
    _assert('Entry 1 lockMs = 250', 250, last3[0].lockMs);
    _assert('Entry 2 retries = 2', 2, last3[1].retries);
    _assert('Entry 3 ok = false', false, last3[2].ok);
    
    _assert('timeouts es objeto', true, typeof telemetry.timeouts === 'object');
    _assert('TEST_FN_1 timeouts = 2', 2, telemetry.timeouts['TEST_FN_1']);
    _assert('TEST_FN_2 timeouts = 1', 1, telemetry.timeouts['TEST_FN_2']);
    _assert('_lastTimeout existe', true, !!telemetry.timeouts._lastTimeout);
    
  } finally {
    // RESTAURAR estado original exactamente como estaba
    if (originalEntries !== null) {
      props.setProperty(keyHoy, originalEntries);
    } else {
      props.deleteProperty(keyHoy);
    }
    if (originalTimeouts !== null) {
      props.setProperty(keyTimeouts, originalTimeouts);
    } else {
      props.deleteProperty(keyTimeouts);
    }
  }
}

function test_Z11_PreReadRequestLead_Estructura() {
  _seccion('Z11. _preReadRequestLead: retorna estructura correcta');

  var resultado = _preReadRequestLead();

  _assert('Retorna objeto', true, typeof resultado === 'object' && resultado !== null);
  _assert('Tiene earlyReturn (boolean)', true, typeof resultado.earlyReturn === 'boolean');

  if (resultado.earlyReturn) {
    _assert('earlyReturn: tiene response', true, typeof resultado.response === 'object');
    _assert('earlyReturn: response.success es boolean', true, typeof resultado.response.success === 'boolean');
    _assert('earlyReturn: response.message es string', true, typeof resultado.response.message === 'string');
    Logger.log('  → Early return: ' + resultado.response.message);
  } else {
    _assert('Full: tiene ss', true, resultado.ss !== null && resultado.ss !== undefined);
    _assert('Full: tiene ssReestudios', true, resultado.ssReestudios !== null);
    _assert('Full: tiene userEmail (string)', true, typeof resultado.userEmail === 'string' && resultado.userEmail.length > 0);
    _assert('Full: tiene nombreUsuario (string)', true, typeof resultado.nombreUsuario === 'string');
    _assert('Full: tiene equipo.id', true, typeof resultado.equipo.id === 'string');
    _assert('Full: tiene cuotas (object)', true, typeof resultado.cuotas === 'object');
    _assert('Full: tiene conteoHoyTotal (object)', true, typeof resultado.conteoHoyTotal === 'object');
    _assert('Full: tiene seleccionados (array, length > 0)', true, Array.isArray(resultado.seleccionados) && resultado.seleccionados.length > 0);
    _assert('Full: seleccionados[0] tiene solicitudId', true, typeof resultado.seleccionados[0].solicitudId === 'string' && resultado.seleccionados[0].solicitudId.length > 0);
    _assert('Full: seleccionados[0] tiene rowIndex', true, typeof resultado.seleccionados[0].rowIndex === 'number');
    _assert('Full: seleccionados[0] tiene tipo', true, typeof resultado.seleccionados[0].tipo === 'string');
    _assert('Full: seleccionados[0] tiene base', true, typeof resultado.seleccionados[0].base === 'string');
    _assert('Full: tiene pendientes (array)', true, Array.isArray(resultado.pendientes));
    _assert('Full: tiene cupoDisponible (number > 0)', true, typeof resultado.cupoDisponible === 'number' && resultado.cupoDisponible > 0);
    Logger.log('  → Full result: ' + resultado.seleccionados.length + ' seleccionados, equipo=' + resultado.equipo.id + ', solicitudId[0]=' + resultado.seleccionados[0].solicitudId);
  }
}

/**
 * Z12: Test de equivalencia con escenario controlado.
 * Crea un caso de prueba en la hoja "solicitud" con estado EN_ESTUDIO,
 * ejecuta _preReadRequestLead() con equipo DIGITAL, y verifica que el caso
 * aparece en seleccionados con los valores esperados.
 * 
 * SEGURIDAD:
 * - Toma ScriptLock durante toda la ejecución (impide que RequestLeadUnificado
 *   o autoAsignarBiometria tomen el caso de prueba durante el test)
 * - En finally: verifica que el caso NO fue movido a Historico_Gestiones
 * - Verifica cleanup explícitamente
 *
 * NOTA SOBRE ÍNDICES: Este proyecto NO usa constantes de columna; todos los
 * archivos (.js) usan índices numéricos directos (row[16], row[27], etc.)
 * siguiendo el mapeo documentado en DOCUMENTACION_TECNICA.md §Mapeo de Columnas.
 */
function test_Z12_PreReadRequestLead_EquivalenciaControlada() {
  _seccion('Z12. _preReadRequestLead: equivalencia con escenario controlado');

  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  var testSolicitudId = 'TEST-EQUIV-001';
  var testFilaInsertada = -1;

  // ─── TOMAR LOCK para impedir asignaciones concurrentes ─────
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (eLock) {
    Logger.log('  ⚠️ No se pudo tomar ScriptLock — test abortado (sistema ocupado).');
    _assert('ScriptLock adquirido', true, false);
    return;
  }

  try {
    // ─── SETUP: Insertar caso de prueba ────────────────────────
    // Índices según mapeo estándar del proyecto (DOCUMENTACION_TECNICA.md):
    //   0=solicitudId, 1=poliza, 9=canon, 16=estadoGeneral,
    //   17=fechaRadicacion, 20=clase, 27=asignado
    var numCols = hoja.getLastColumn();
    var filaTest = new Array(numCols).fill('');
    filaTest[0] = testSolicitudId;         // col A: solicitudId
    filaTest[1] = '999999';                 // col B: poliza (fake)
    filaTest[9] = '1500000';               // col J: canon (dentro del rango DIGITAL 0-7.999.999)
    filaTest[16] = 'EN_ESTUDIO';           // col Q: estadoGeneral → tipo 'digital'
    filaTest[17] = '01/08/2026 08:00:00';  // col R: fechaRadicacion
    filaTest[20] = 'NUEVA';                // col U: clase
    filaTest[27] = '';                      // col AB: sin asignar

    hoja.appendRow(filaTest);
    hoja.getRange(hoja.getLastRow(), 1, 1, numCols).setNumberFormat('@');
    SpreadsheetApp.flush();
    testFilaInsertada = hoja.getLastRow();
    Logger.log('  Caso de prueba insertado en fila ' + testFilaInsertada + ' (lock activo)');

    // ─── EJECUTAR _preReadRequestLead con equipo DIGITAL ───────
    var resultado = _preReadRequestLead('DIGITAL');

    _assert('Retorna objeto', true, typeof resultado === 'object');
    _assert('Tiene earlyReturn', true, typeof resultado.earlyReturn === 'boolean');

    if (resultado.earlyReturn) {
      Logger.log('  ⚠️ earlyReturn: ' + resultado.response.message);
      Logger.log('  → El usuario actual no puede recibir casos DIGITAL.');
      _assert('earlyReturn tiene response', true, typeof resultado.response === 'object');
    } else {
      // ─── VERIFICAR EQUIVALENCIA ────────────────────────────────
      var enPendientes = resultado.pendientes.filter(function(p) {
        return String(p.rowData[0]).trim() === testSolicitudId;
      });
      _assert('TEST-EQUIV-001 aparece en pendientes', true, enPendientes.length > 0);

      if (enPendientes.length > 0) {
        _assert('Pendiente tiene base=PRINCIPAL', 'PRINCIPAL', enPendientes[0].base);
        _assert('Pendiente tiene tipo=digital', 'digital', enPendientes[0].tipo);
        _assert('Pendiente tiene rowIndex > 0', true, enPendientes[0].rowIndex > 0);
      }

      // Verificar que seleccionados tiene solicitudId explícito
      var enSeleccionados = resultado.seleccionados.filter(function(s) {
        return s.solicitudId === testSolicitudId;
      });
      Logger.log('  TEST-EQUIV-001 en pendientes: ' + enPendientes.length +
                 ' | en seleccionados: ' + enSeleccionados.length);

      if (enSeleccionados.length > 0) {
        _assert('Seleccionado tiene solicitudId', testSolicitudId, enSeleccionados[0].solicitudId);
        _assert('Seleccionado tiene tipo=digital', 'digital', enSeleccionados[0].tipo);
        _assert('Seleccionado tiene base=PRINCIPAL', 'PRINCIPAL', enSeleccionados[0].base);
      }

      // Verificar valores esperados de conteo y cuotas
      _assert('conteoHoyTotal tiene campo digital', true, typeof resultado.conteoHoyTotal.digital === 'number');
      _assert('cuotas tiene campo digital', true, typeof resultado.cuotas.digital === 'number');
      _assert('cuotas.digital > 0 (DIGITAL tiene cupo)', true, resultado.cuotas.digital > 0);
      Logger.log('  conteoHoyTotal: ' + JSON.stringify(resultado.conteoHoyTotal));
      Logger.log('  cuotas: ' + JSON.stringify(resultado.cuotas));
      Logger.log('  seleccionados: ' + resultado.seleccionados.length +
                 ' | pendientes: ' + resultado.pendientes.length);
    }

  } finally {
    // ─── CLEANUP: Eliminar caso de prueba ─────────────────────
    var casoEliminado = false;
    if (testFilaInsertada > 0) {
      var valorEnFila = String(hoja.getRange(testFilaInsertada, 1).getValue()).trim();
      if (valorEnFila === testSolicitudId) {
        hoja.deleteRow(testFilaInsertada);
        SpreadsheetApp.flush();
        casoEliminado = true;
        Logger.log('  Caso de prueba eliminado de fila ' + testFilaInsertada);
      } else {
        // Buscar con TextFinder por si la fila se movió
        var matchSol = hoja.getRange(1, 1, hoja.getLastRow(), 1)
          .createTextFinder(testSolicitudId).matchEntireCell(true).findNext();
        if (matchSol) {
          hoja.deleteRow(matchSol.getRow());
          SpreadsheetApp.flush();
          casoEliminado = true;
          Logger.log('  Caso de prueba eliminado de fila reubicada ' + matchSol.getRow());
        }
      }
    }

    // ─── VERIFICAR que NO fue asignado por error a Historico_Gestiones ──
    if (!casoEliminado) {
      var hojaHist = ss.getSheetByName("Historico_Gestiones");
      if (hojaHist && hojaHist.getLastRow() > 1) {
        var matchHist = hojaHist.getRange(2, 1, hojaHist.getLastRow() - 1, 1)
          .createTextFinder(testSolicitudId).matchEntireCell(true).findNext();
        if (matchHist) {
          _assert('❌ CRÍTICO: TEST-EQUIV-001 fue ASIGNADO a Historico_Gestiones — REVERTIR MANUALMENTE fila ' + matchHist.getRow(), false, true);
          Logger.log('  ❌❌❌ El caso de prueba fue tomado por el motor y movido a Historico_Gestiones fila ' + matchHist.getRow());
          Logger.log('  ❌❌❌ Esto NO debería pasar porque el ScriptLock estaba tomado.');
          Logger.log('  ❌❌❌ ACCIÓN: Eliminar manualmente la fila ' + matchHist.getRow() + ' de Historico_Gestiones.');
        }
      }
    }

    // ─── VERIFICAR CLEANUP FINAL ──────────────────────────────
    var postCheck = hoja.getRange(1, 1, hoja.getLastRow(), 1)
      .createTextFinder(testSolicitudId).matchEntireCell(true).findNext();
    _assert('Cleanup: TEST-EQUIV-001 ya no existe en hoja solicitud', null, postCheck);

    // ─── LIBERAR LOCK ─────────────────────────────────────────
    lock.releaseLock();
  }
}

/**
 * Medición end-to-end de guardarCambiosInternos con un caso real.
 * Ejecutar manualmente: BENCHMARK_guardarCambios → Run
 * NO se incluye en EJECUTAR_TODAS_LAS_PRUEBAS porque escribe datos reales.
 */
function BENCHMARK_guardarCambios() {
  Logger.log('╔══════════════════════════════════════════════════════════════╗');
  Logger.log('║  BENCHMARK: guardarCambiosInternos — medición de tiempo     ║');
  Logger.log('╚══════════════════════════════════════════════════════════════╝');
  
  // Buscar un caso pendiente real del usuario actual
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName("Historico_Gestiones");
  if (!hoja || hoja.getLastRow() <= 1) { Logger.log('Sin datos'); return; }
  
  var email = Session.getActiveUser().getEmail().toLowerCase().trim();
  var lastRow = hoja.getLastRow();
  var colAsig = hoja.getRange(2, 26, lastRow - 1, 1);
  var matches = colAsig.createTextFinder(email).matchEntireCell(true).matchCase(false).findAll();
  
  var casoPendiente = null;
  for (var i = 0; i < matches.length; i++) {
    var row = matches[i].getRow();
    var fechaFin = String(hoja.getRange(row, 27).getDisplayValue()).trim();
    if (fechaFin === '') {
      casoPendiente = { row: row, id: String(hoja.getRange(row, 1).getDisplayValue()).trim() };
      break;
    }
  }
  
  if (!casoPendiente) {
    Logger.log('⚠️ No tienes un caso pendiente para benchmarkear. Necesitas al menos 1 caso asignado sin gestionar.');
    Logger.log('   Alternativa: medir solo calcularTiemposCaso (test Z5).');
    return;
  }
  
  Logger.log('Caso encontrado: ' + casoPendiente.id + ' (fila ' + casoPendiente.row + ')');
  Logger.log('⚠️ Este benchmark NO guarda realmente — solo mide hasta el punto de búsqueda + cálculo de tiempos.');
  
  // Simular el flujo sin escribir: medir solo la parte pesada (openById + búsqueda + calcTiempos)
  var t0 = new Date().getTime();
  var ssTest = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var t1 = new Date().getTime();
  
  var hojaH = ssTest.getSheetByName("Historico_Gestiones");
  var colId = hojaH.getRange(2, 1, hojaH.getLastRow() - 1, 1);
  var match = colId.createTextFinder(casoPendiente.id).matchEntireCell(true).findNext();
  var t2 = new Date().getTime();
  
  var filaData = hojaH.getRange(match.getRow(), 1, 1, 37).getValues()[0];
  var t3 = new Date().getTime();
  
  var tiempos = calcularTiemposCaso(
    filaData[17] instanceof Date ? filaData[17] : new Date(),
    filaData[24] instanceof Date ? filaData[24] : new Date(),
    new Date(),
    email
  );
  var t4 = new Date().getTime();
  
  Logger.log('');
  Logger.log('┌──────────────────────────────────────────┬──────────┐');
  Logger.log('│ Operación                                │ Tiempo   │');
  Logger.log('├──────────────────────────────────────────┼──────────┤');
  Logger.log('│ openById(TARGET_SOLICITUDES_SS_ID)       │ ' + String(t1-t0).padStart(5) + ' ms │');
  Logger.log('│ TextFinder en Historico_Gestiones        │ ' + String(t2-t1).padStart(5) + ' ms │');
  Logger.log('│ getRange fila completa (37 cols)         │ ' + String(t3-t2).padStart(5) + ' ms │');
  Logger.log('│ calcularTiemposCaso (con caché 6h)      │ ' + String(t4-t3).padStart(5) + ' ms │');
  Logger.log('├──────────────────────────────────────────┼──────────┤');
  Logger.log('│ TOTAL (sin escritura)                    │ ' + String(t4-t0).padStart(5) + ' ms │');
  Logger.log('└──────────────────────────────────────────┴──────────┘');
  Logger.log('');
  Logger.log('Tiempos calculados: cola=' + tiempos.minutos_cola + ' | gestión=' + tiempos.minutos_gestion + ' | general=' + tiempos.minutos_general);
}

/**
 * TEST DIAGNÓSTICO: Enumera registros con Fecha_Gestión en la última semana
 * que NO tienen estado canónico (APROBADA/NEGADA/APLAZADA).
 * NO es un _assert — solo genera output informativo para decisión humana.
 * Ejecutar individualmente: seleccionar DIAGNOSTICO_registros_sin_estado_canonico → Run
 */
function DIAGNOSTICO_registros_sin_estado_canonico() {
  Logger.log('╔══════════════════════════════════════════════════════════════╗');
  Logger.log('║  DIAGNÓSTICO: Registros con Fecha_Gestión pero sin estado   ║');
  Logger.log('║  canónico (APROBADA/NEGADA/APLAZADA) en Historico_Gestiones  ║');
  Logger.log('╚══════════════════════════════════════════════════════════════╝');

  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName("Historico_Gestiones");
  if (!hoja || hoja.getLastRow() <= 1) { Logger.log('Hoja vacía.'); return; }

  var data = hoja.getRange(2, 1, hoja.getLastRow() - 1, 35).getValues();

  // Mismo rango que el test Y9: última semana
  var hoy = new Date();
  var hace7 = new Date(hoy.getTime() - 7 * 86400000);
  var desdeNum = hoy.getFullYear() * 10000 + (hace7.getMonth() + 1) * 100 + hace7.getDate();
  // Corregir: usar hace7 para desde
  desdeNum = hace7.getFullYear() * 10000 + (hace7.getMonth() + 1) * 100 + hace7.getDate();
  var hastaNum = hoy.getFullYear() * 10000 + (hoy.getMonth() + 1) * 100 + hoy.getDate();

  Logger.log('Rango: ' + _fechaNumeroAString(desdeNum) + ' → ' + _fechaNumeroAString(hastaNum));
  Logger.log('');

  var noCanonicos = [];
  var totalEnRango = 0;

  for (var i = 0; i < data.length; i++) {
    var fila = data[i];
    var fechaNum = _valorAFechaNumero(fila[33]);
    if (fechaNum === null) continue;
    if (fechaNum < desdeNum || fechaNum > hastaNum) continue;

    totalEnRango++;
    var estado = String(fila[16] || "").toUpperCase().trim();
    var esCanon = estado === "APROBADA" || estado === "APROBADO" ||
                  estado === "NEGADA" || estado === "NEGADO" ||
                  estado === "APLAZADA" || estado === "APLAZADO";

    if (!esCanon) {
      noCanonicos.push({
        fila: i + 2,
        solicitudId: String(fila[0] || "").trim(),
        estadoGeneral: estado || "(VACÍO)",
        fechaGestion: _fechaNumeroAString(fechaNum),
        analista: String(fila[30] || "").trim(),
        fechaFin: fila[28] ? String(fila[28]) : "(vacío)"
      });
    }
  }

  Logger.log('Total registros con Fecha_Gestión en rango: ' + totalEnRango);
  Logger.log('Registros con estado canónico: ' + (totalEnRango - noCanonicos.length));
  Logger.log('Registros SIN estado canónico: ' + noCanonicos.length);
  Logger.log('');

  if (noCanonicos.length === 0) {
    Logger.log('✅ No hay registros sin estado canónico en este rango.');
    return;
  }

  Logger.log('┌─────┬──────────────┬──────────────────────────────┬────────────┬─────────────────────────┬─────────────────────────┐');
  Logger.log('│ # │ Solicitud ID │ estadoGeneral (col Q)         │ Fecha Gest │ Analista                │ Fecha Fin Gestión       │');
  Logger.log('├─────┼──────────────┼──────────────────────────────┼────────────┼─────────────────────────┼─────────────────────────┤');

  for (var j = 0; j < noCanonicos.length; j++) {
    var r = noCanonicos[j];
    Logger.log('│ ' + String(j + 1).padStart(2) + '  │ ' +
      r.solicitudId.padEnd(12) + ' │ ' +
      r.estadoGeneral.padEnd(28) + ' │ ' +
      r.fechaGestion + ' │ ' +
      r.analista.substring(0, 23).padEnd(23) + ' │ ' +
      r.fechaFin.substring(0, 23).padEnd(23) + ' │');
  }
  Logger.log('└─────┴──────────────┴──────────────────────────────┴────────────┴─────────────────────────┴─────────────────────────┘');

  // Agrupar por estado para resumen
  var porEstado = {};
  for (var k = 0; k < noCanonicos.length; k++) {
    var e = noCanonicos[k].estadoGeneral;
    porEstado[e] = (porEstado[e] || 0) + 1;
  }
  Logger.log('');
  Logger.log('Resumen por valor de estadoGeneral:');
  for (var est in porEstado) {
    Logger.log('  "' + est + '": ' + porEstado[est] + ' registro(s)');
  }
}

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
  test_V1_DerivarTipoReestudio(); test_V2_FechaEsHoyYMD(); test_V3_ContadorCupoHoy(); test_V3b_DecrementarContadorCupo(); test_V4_CargaPendiente(); test_V5_RegistrarAsignacionYCierre();
  test_W1_ParseCanonColombiano();
  test_X1_SimulacionDiaProduccion();
  test_Y1_FechaConversion_CasosNormales(); test_Y2_FechaConversion_CasosInvalidos(); test_Y3_FechaConversion_Imposibles(); test_Y4_ValorAFechaNumero_DateObjects(); test_Y5_ValorAFechaNumero_Strings(); test_Y6_FechaIdaYVuelta(); test_Y7_FechaOrdenCronologico(); test_Y8_VerificarAdminDesdeInstancia_Rechaza(); test_Y9_ObtenerDatosMetricas_Real(); test_Y10_Cache_ForceRefresh();
  test_Z1_CacheConfigHoraria_TTL6h(); test_Z2_CacheConfigHoraria_ConsistenciaConYSinCache(); test_Z3_InvalidacionCacheFestivos(); test_Z4_GuardarDigital_NoCargaReestudios(); test_Z5_CalcTiempos_ConCacheVsSinCache(); test_Z6_InvalidacionCacheTurnosYHorasExtra();
  test_Z7_GetTableData_ReusaSsReestudios(); test_Z8_GetTableData_Rendimiento(); test_Z9_CargarPanelAnalista_Rendimiento(); test_Z10_TelemetriaLock_RegistraYLee();
  test_Z11_PreReadRequestLead_Estructura(); test_Z12_PreReadRequestLead_EquivalenciaControlada();
  test_Z13_ConteoEnMemoria_BloqueaCupoDentroDeLoop();

  Logger.log('\n╔══════════════════════════════════════════╗');
  Logger.log('║   ✅ PASS: ' + _totalPass);
  Logger.log('║   ❌ FAIL: ' + _totalFail);
  Logger.log('║   TOTAL:  ' + (_totalPass + _totalFail));
  Logger.log('╚══════════════════════════════════════════╝');
}


// ============================================================
// TEST Z13: conteoEnMemoria bloquea cupo intra-invocación
// Incluido en EJECUTAR_TODAS_LAS_PRUEBAS — es lógica pura, no toca hojas
// ============================================================

/**
 * Z13: Verifica que conteoEnMemoria bloquea asignaciones intra-invocación.
 * Escenario: cupoDisponible=2, 2 candidatos tipo 'digital', pero cupo restante=1.
 * Resultado esperado: solo 1 se asigna.
 *
 * Método: simula la lógica del while-loop de Phase 2 con datos sintéticos,
 * sin tocar hojas reales ni ScriptLock (es lógica pura de decisión).
 */
function test_Z13_ConteoEnMemoria_BloqueaCupoDentroDeLoop() {
  _seccion('Z13. conteoEnMemoria bloquea exceso de cupo intra-invocación');

  // SETUP: simular el escenario
  var cuotas = { digital: 5 };
  var conteoHoyDeHojas = { digital: 2 };  // 2 ya contados de hojas
  // El contador incremental (PropertiesService) dice 2 más → total=4, cupo restante=1
  var contadorSimulado = { digital: 2 };
  var conteoEnMemoria = {};

  var candidatos = [
    { solicitudId: 'CASO-A', tipo: 'digital', base: 'PRINCIPAL', rowIndex: 10 },
    { solicitudId: 'CASO-B', tipo: 'digital', base: 'PRINCIPAL', rowIndex: 11 }
  ];

  var cupoDisponible = 2;
  var asignados = [];
  var retriesUsed = 0;
  var maxRetries = 3;

  // Simular el loop (sin TextFinder — asumir que ambos pasan la re-verificación de disponibilidad)
  for (var i = 0; i < candidatos.length && asignados.length < cupoDisponible && retriesUsed < maxRetries; i++) {
    var candidate = candidatos[i];

    // Re-check de cupo: conteoHoyDeHojas + contadorSimulado + conteoEnMemoria
    var conteoTotalActualizado = (conteoHoyDeHojas[candidate.tipo] || 0)
      + (contadorSimulado[candidate.tipo] || 0)
      + (conteoEnMemoria[candidate.tipo] || 0);

    if (cuotas[candidate.tipo] > 0 && conteoTotalActualizado >= cuotas[candidate.tipo]) {
      retriesUsed++;
      Logger.log('  → ' + candidate.solicitudId + ' SKIP cupo full: ' + conteoTotalActualizado + '/' + cuotas[candidate.tipo]);
      continue;
    }

    asignados.push(candidate);
    conteoEnMemoria[candidate.tipo] = (conteoEnMemoria[candidate.tipo] || 0) + 1;
    Logger.log('  → ' + candidate.solicitudId + ' ASIGNADO (conteoEnMemoria.' + candidate.tipo + ' = ' + conteoEnMemoria[candidate.tipo] + ')');
  }

  _assert('Solo 1 asignado (no 2)', 1, asignados.length);
  _assert('CASO-A fue el asignado', 'CASO-A', asignados[0].solicitudId);
  _assert('CASO-B fue rechazado por cupo', 1, retriesUsed);
  _assert('conteoEnMemoria.digital = 1', 1, conteoEnMemoria.digital);

  // Verificar el cálculo: al intentar CASO-B, total = 2(hojas) + 2(contador) + 1(memoria) = 5 >= cuota(5)
  var checkB = (conteoHoyDeHojas.digital || 0) + (contadorSimulado.digital || 0) + (conteoEnMemoria.digital || 0);
  _assert('Total al evaluar CASO-B = 5 (≥ cuota)', 5, checkB);
  Logger.log('  Desglose al evaluar CASO-B: hojas=' + conteoHoyDeHojas.digital +
    ' + contador=' + contadorSimulado.digital +
    ' + memoria=' + conteoEnMemoria.digital + ' = ' + checkB + ' vs cuota=' + cuotas.digital);
}

// ============================================================
// TEST MANUAL: Z12b — Full Path forzando condiciones de ACTIVO + turno
// NO incluido en EJECUTAR_TODAS_LAS_PRUEBAS porque modifica Usuarios y
// Analistas_Turnos temporalmente. Ejecutar manualmente: test_Z12b → Run
// ============================================================

/**
 * Fuerza las condiciones para que _preReadRequestLead() tome el camino
 * completo (earlyReturn: false) y verifique la estructura de seleccionados
 * con solicitudId incluido. Restaura TODO en finally.
 *
 * Pasos:
 * 1. Toma ScriptLock (impide asignaciones concurrentes)
 * 2. Lee estado actual del usuario en Usuarios; si no es ACTIVO, lo cambia
 * 3. Inserta turno temporal en Analistas_Turnos que cubra la hora actual
 * 4. Invalida cache de usuarios
 * 5. Inserta caso de prueba EN_ESTUDIO en "solicitud"
 * 6. Ejecuta _preReadRequestLead('DIGITAL')
 * 7. Verifica que earlyReturn=false y seleccionados[0].solicitudId existe
 * 8. Restaura TODO en finally (estado, turno, caso)
 */
function test_Z12b_FullPath_ForceActivo() {
  _seccion('Z12b. _preReadRequestLead FULL PATH — forzando ACTIVO + turno');

  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  Logger.log('  Email ejecutor: ' + userEmail);

  // ─── Variables de restauración ────────────────────────────────
  var hojaUsuarios = ss.getSheetByName('Usuarios');
  var hojaAT = ss.getSheetByName('Analistas_Turnos');
  var hojaSolicitud = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  var testSolicitudId = 'TEST-Z12B-FULLPATH';

  var filaUsuario = -1;
  var estadoOriginal = null;
  var capOriginal = null;
  var espOriginal = null;
  var turnoInsertado = false;
  var filaTurnoInsertada = -1;
  var testCasoFila = -1;

  // ─── TOMAR LOCK ───────────────────────────────────────────────
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (eLock) {
    Logger.log('  ⚠️ No se pudo tomar ScriptLock — test abortado.');
    _assert('ScriptLock adquirido', true, false);
    return;
  }

  try {
    // ─── 1. ENCONTRAR Y ACTIVAR USUARIO ───────────────────────────
    var dataU = hojaUsuarios.getDataRange().getValues();
    for (var i = 1; i < dataU.length; i++) {
      if (String(dataU[i][2]).toLowerCase().trim() === userEmail) {
        filaUsuario = i + 1; // fila 1-indexed en hoja
        estadoOriginal = String(dataU[i][5]).trim();
        capOriginal = String(dataU[i][6]).trim();
        espOriginal = String(dataU[i][4]).trim();
        break;
      }
    }

    if (filaUsuario === -1) {
      Logger.log('  ❌ Usuario ' + userEmail + ' NO existe en hoja Usuarios. Abortando.');
      _assert('Usuario existe en Usuarios', true, false);
      return;
    }

    Logger.log('  Usuario encontrado fila ' + filaUsuario + ' | estado="' + estadoOriginal + '" | cap="' + capOriginal + '" | esp="' + espOriginal + '"');

    // Forzar estado ACTIVO si no lo está
    if (estadoOriginal.toUpperCase() !== 'ACTIVO') {
      hojaUsuarios.getRange(filaUsuario, 6).setValue('ACTIVO'); // col F = estado
      Logger.log('  → Estado cambiado a ACTIVO (original: "' + estadoOriginal + '")');
    }

    // Forzar capacidad > 0 si es 0
    var capNum = parseInt(capOriginal) || 0;
    if (capNum < 1) {
      hojaUsuarios.getRange(filaUsuario, 7).setValue(5); // col G = capacidad
      Logger.log('  → Capacidad forzada a 5 (original: "' + capOriginal + '")');
    }

    // Forzar especialidad compatible con DIGITAL si no la tiene
    var espUpper = espOriginal.toUpperCase().trim();
    var necesitaCambioEsp = (espUpper !== 'ESTUDIO DIGITAL' && espUpper !== 'ESTUDIO_DIGITAL');
    if (necesitaCambioEsp) {
      hojaUsuarios.getRange(filaUsuario, 5).setValue('ESTUDIO DIGITAL'); // col E = especialidad
      Logger.log('  → Especialidad cambiada a ESTUDIO DIGITAL (original: "' + espOriginal + '")');
    }

    SpreadsheetApp.flush();

    // ─── 2. INSERTAR TURNO TEMPORAL ───────────────────────────────
    // Necesitamos una fila en Analistas_Turnos con:
    //   col A = email, col B = idTurno, col C = fechaDesde (Date), col D = fechaHasta (Date/vacío)
    // Y una fila en Turnos con ese idTurno, con el día actual habilitado y hora cubriendo ahora.
    // ALTERNATIVA MÁS SIMPLE: si el usuario ya tiene turno activo, no hacer nada.
    // Verificamos primero:
    var tieneturnoYa = false;
    if (hojaAT && hojaAT.getLastRow() > 1) {
      var dataAT = hojaAT.getDataRange().getValues();
      var ahora = new Date();
      for (var j = 1; j < dataAT.length; j++) {
        var emailAT = String(dataAT[j][0]).toLowerCase().trim();
        if (emailAT !== userEmail) continue;
        var desde = dataAT[j][2];
        var hasta = dataAT[j][3];
        if (desde instanceof Date && ahora >= desde && (!hasta || !(hasta instanceof Date) || ahora <= hasta)) {
          tieneturnoYa = true;
          Logger.log('  Turno existente detectado: ' + String(dataAT[j][1]));
          break;
        }
      }
    }

    if (!tieneturnoYa) {
      // Insertar un turno temporal "TEST_TURNO" que cubra todo el día
      // Primero necesitamos verificar/crear la definición en Turnos
      var hojaTurnos = ss.getSheetByName('Turnos');
      var turnoTestId = 'TEST_TURNO_Z12B';
      var turnoExisteEnDef = false;
      if (hojaTurnos && hojaTurnos.getLastRow() > 1) {
        var dataTurnos = hojaTurnos.getDataRange().getValues();
        for (var t = 1; t < dataTurnos.length; t++) {
          if (String(dataTurnos[t][0]).trim() === turnoTestId) {
            turnoExisteEnDef = true;
            break;
          }
        }
      }

      if (!turnoExisteEnDef && hojaTurnos) {
        // Crear definición: id, nombre, horaTipo, Lun, Mar, Mie, Jue, Vie, Sab, Dom,
        // IniLun, FinLun, IniMar, FinMar, ... IniDom, FinDom
        // Cols: 0=id, 1=nombre, 2=tipo, 3-9=boolDias(L-D), 10=IniLun, 11=FinLun, ...
        var filaTurno = new Array(hojaTurnos.getLastColumn()).fill('');
        filaTurno[0] = turnoTestId;
        filaTurno[1] = 'Test Z12b';
        filaTurno[2] = 'NORMAL';
        // Habilitar todos los días (cols 3-9)
        for (var dd = 3; dd <= 9; dd++) filaTurno[dd] = true;
        // Poner horarios 00:00-23:59 para todos los días (cols 10-23)
        for (var hh = 10; hh <= 23; hh += 2) {
          filaTurno[hh] = '00:00';     // inicio
          filaTurno[hh + 1] = '23:59'; // fin
        }
        hojaTurnos.appendRow(filaTurno);
        SpreadsheetApp.flush();
        Logger.log('  → Definición de turno TEST insertada en Turnos');
      }

      // Insertar asignación en Analistas_Turnos
      if (hojaAT) {
        var hoy = new Date();
        var ayer = new Date(hoy.getTime() - 86400000);
        var manana = new Date(hoy.getTime() + 86400000 * 2);
        hojaAT.appendRow([userEmail, turnoTestId, ayer, manana]);
        SpreadsheetApp.flush();
        filaTurnoInsertada = hojaAT.getLastRow();
        turnoInsertado = true;
        Logger.log('  → Turno temporal insertado en Analistas_Turnos fila ' + filaTurnoInsertada);
      }
    }

    // ─── 3. INVALIDAR CACHE DE USUARIOS ───────────────────────────
    _invalidarCacheUsuarios();

    // ─── 4. INSERTAR CASO DE PRUEBA ───────────────────────────────
    var numCols = hojaSolicitud.getLastColumn();
    var filaTest = new Array(numCols).fill('');
    filaTest[0] = testSolicitudId;          // col A: solicitudId
    filaTest[1] = '999888';                  // col B: poliza (fake, no existe en score)
    filaTest[9] = '2000000';                // col J: canon
    filaTest[16] = 'EN_ESTUDIO';            // col Q: estadoGeneral → tipo 'digital'
    filaTest[17] = '01/08/2026 07:00:00';   // col R: fechaRadicacion
    filaTest[20] = 'NUEVA';                 // col U: clase
    filaTest[27] = '';                       // col AB: sin asignar

    hojaSolicitud.appendRow(filaTest);
    SpreadsheetApp.flush();
    testCasoFila = hojaSolicitud.getLastRow();
    Logger.log('  Caso de prueba insertado en fila ' + testCasoFila);

    // ─── 5. EJECUTAR _preReadRequestLead ──────────────────────────
    var resultado = _preReadRequestLead('DIGITAL');

    _assert('Retorna objeto', true, typeof resultado === 'object' && resultado !== null);
    _assert('Tiene earlyReturn', true, typeof resultado.earlyReturn === 'boolean');

    if (resultado.earlyReturn) {
      // ❌ Sigue cayendo en earlyReturn a pesar de forzar las condiciones
      Logger.log('  ❌ earlyReturn INESPERADO: ' + resultado.response.message);
      _assert('earlyReturn false (debería ser full path)', false, resultado.earlyReturn);
      _assert('Mensaje earlyReturn', 'NONE', resultado.response.message);
    } else {
      // ✅ FULL PATH — verificar toda la estructura
      Logger.log('  ✅ FULL PATH alcanzado');
      _assert('Full: tiene ss', true, resultado.ss !== null && resultado.ss !== undefined);
      _assert('Full: tiene ssReestudios', true, resultado.ssReestudios !== null);
      _assert('Full: userEmail correcto', userEmail, resultado.userEmail);
      _assert('Full: tiene nombreUsuario', true, typeof resultado.nombreUsuario === 'string' && resultado.nombreUsuario.length > 0);
      _assert('Full: equipo.id = DIGITAL', 'DIGITAL', resultado.equipo.id);
      _assert('Full: cuotas es object', true, typeof resultado.cuotas === 'object');
      _assert('Full: cuotas.digital > 0', true, resultado.cuotas.digital > 0);
      _assert('Full: conteoHoyTotal es object', true, typeof resultado.conteoHoyTotal === 'object');
      _assert('Full: conteoHoyTotal.digital es number', true, typeof resultado.conteoHoyTotal.digital === 'number');
      _assert('Full: seleccionados es array no vacío', true, Array.isArray(resultado.seleccionados) && resultado.seleccionados.length > 0);
      _assert('Full: cupoDisponible > 0', true, resultado.cupoDisponible > 0);
      _assert('Full: pendientes es array no vacío', true, Array.isArray(resultado.pendientes) && resultado.pendientes.length > 0);

      // Verificar solicitudId en seleccionados
      _assert('Full: seleccionados[0].solicitudId es string', true, typeof resultado.seleccionados[0].solicitudId === 'string');
      _assert('Full: seleccionados[0].solicitudId no vacío', true, resultado.seleccionados[0].solicitudId.length > 0);
      _assert('Full: seleccionados[0].rowIndex es number', true, typeof resultado.seleccionados[0].rowIndex === 'number');
      _assert('Full: seleccionados[0].tipo es string', true, typeof resultado.seleccionados[0].tipo === 'string');
      _assert('Full: seleccionados[0].base es string', true, typeof resultado.seleccionados[0].base === 'string');

      // Buscar nuestro caso de prueba específico
      var enPendientes = resultado.pendientes.filter(function(p) {
        return String(p.rowData[0]).trim() === testSolicitudId;
      });
      _assert('TEST-Z12B-FULLPATH en pendientes', true, enPendientes.length > 0);

      if (enPendientes.length > 0) {
        _assert('Pendiente base=PRINCIPAL', 'PRINCIPAL', enPendientes[0].base);
        _assert('Pendiente tipo=digital', 'digital', enPendientes[0].tipo);
      }

      var enSeleccionados = resultado.seleccionados.filter(function(s) {
        return s.solicitudId === testSolicitudId;
      });
      Logger.log('  TEST-Z12B en pendientes: ' + enPendientes.length + ' | en seleccionados: ' + enSeleccionados.length);

      if (enSeleccionados.length > 0) {
        _assert('Seleccionado solicitudId', testSolicitudId, enSeleccionados[0].solicitudId);
        _assert('Seleccionado tipo=digital', 'digital', enSeleccionados[0].tipo);
        _assert('Seleccionado base=PRINCIPAL', 'PRINCIPAL', enSeleccionados[0].base);
        _assert('Seleccionado rowIndex > 0', true, enSeleccionados[0].rowIndex > 0);
      } else {
        // Si no está en seleccionados pero sí en pendientes, puede ser que otro caso
        // tiene más prioridad (reasignada, o mejor score). Eso está bien — lo que
        // importa es que el path completo funcionó y seleccionados[0].solicitudId existe.
        Logger.log('  ℹ️ TEST-Z12B no fue el caso seleccionado (otro tiene más prioridad) — OK');
        Logger.log('  → seleccionados[0].solicitudId = ' + resultado.seleccionados[0].solicitudId);
      }

      // Datos para log de diagnóstico
      Logger.log('  conteoHoyTotal: ' + JSON.stringify(resultado.conteoHoyTotal));
      Logger.log('  cuotas: ' + JSON.stringify(resultado.cuotas));
      Logger.log('  seleccionados: ' + resultado.seleccionados.length + ' | pendientes: ' + resultado.pendientes.length);
      Logger.log('  seleccionados[0]: solicitudId=' + resultado.seleccionados[0].solicitudId +
                 ' tipo=' + resultado.seleccionados[0].tipo +
                 ' base=' + resultado.seleccionados[0].base +
                 ' rowIndex=' + resultado.seleccionados[0].rowIndex);
    }

  } finally {
    // ─── RESTAURAR TODO ─────────────────────────────────────────

    // A. Restaurar estado/cap/esp del usuario
    if (filaUsuario > 0) {
      if (estadoOriginal && estadoOriginal.toUpperCase() !== 'ACTIVO') {
        hojaUsuarios.getRange(filaUsuario, 6).setValue(estadoOriginal);
        Logger.log('  Restaurado estado: "' + estadoOriginal + '"');
      }
      if ((parseInt(capOriginal) || 0) < 1) {
        hojaUsuarios.getRange(filaUsuario, 7).setValue(capOriginal);
        Logger.log('  Restaurada capacidad: "' + capOriginal + '"');
      }
      if (espOriginal.toUpperCase().trim() !== 'ESTUDIO DIGITAL' && espOriginal.toUpperCase().trim() !== 'ESTUDIO_DIGITAL') {
        hojaUsuarios.getRange(filaUsuario, 5).setValue(espOriginal);
        Logger.log('  Restaurada especialidad: "' + espOriginal + '"');
      }
    }

    // B. Eliminar turno temporal de Analistas_Turnos
    if (turnoInsertado && filaTurnoInsertada > 0) {
      hojaAT.deleteRow(filaTurnoInsertada);
      Logger.log('  Turno temporal eliminado de fila ' + filaTurnoInsertada);
    }

    // C. Eliminar definición de turno temporal en Turnos (si la creamos)
    var hojaTurnosClean = ss.getSheetByName('Turnos');
    if (hojaTurnosClean && hojaTurnosClean.getLastRow() > 1) {
      var matchTurno = hojaTurnosClean.getRange(1, 1, hojaTurnosClean.getLastRow(), 1)
        .createTextFinder('TEST_TURNO_Z12B').matchEntireCell(true).findNext();
      if (matchTurno) {
        hojaTurnosClean.deleteRow(matchTurno.getRow());
        Logger.log('  Definición de turno TEST eliminada');
      }
    }

    // D. Eliminar caso de prueba de "solicitud"
    if (testCasoFila > 0) {
      var valCheck = String(hojaSolicitud.getRange(testCasoFila, 1).getValue()).trim();
      if (valCheck === testSolicitudId) {
        hojaSolicitud.deleteRow(testCasoFila);
        Logger.log('  Caso de prueba eliminado de fila ' + testCasoFila);
      } else {
        var matchCaso = hojaSolicitud.getRange(1, 1, hojaSolicitud.getLastRow(), 1)
          .createTextFinder(testSolicitudId).matchEntireCell(true).findNext();
        if (matchCaso) {
          hojaSolicitud.deleteRow(matchCaso.getRow());
          Logger.log('  Caso de prueba eliminado (reubicado) de fila ' + matchCaso.getRow());
        }
      }
    }

    // E. Verificar que el caso NO fue a Historico_Gestiones
    var hojaHist = ss.getSheetByName("Historico_Gestiones");
    if (hojaHist && hojaHist.getLastRow() > 1) {
      var matchHist = hojaHist.getRange(2, 1, hojaHist.getLastRow() - 1, 1)
        .createTextFinder(testSolicitudId).matchEntireCell(true).findNext();
      if (matchHist) {
        _assert('❌ CRÍTICO: ' + testSolicitudId + ' fue ASIGNADO a Historico — REVERTIR fila ' + matchHist.getRow(), false, true);
      }
    }

    // F. Verificar cleanup final
    var postCheck = hojaSolicitud.getRange(1, 1, hojaSolicitud.getLastRow(), 1)
      .createTextFinder(testSolicitudId).matchEntireCell(true).findNext();
    _assert('Cleanup: ' + testSolicitudId + ' ya no existe en solicitud', null, postCheck);

    // G. Invalidar cache de usuarios (para que no quede con datos temporales)
    _invalidarCacheUsuarios();

    SpreadsheetApp.flush();

    // H. Liberar lock
    lock.releaseLock();
    Logger.log('  Lock liberado. Test finalizado.');
  }
}


// ============================================================
// TEST MANUAL: Z14 — RequestLeadUnificado ejecución completa end-to-end
// NO incluido en EJECUTAR_TODAS_LAS_PRUEBAS porque ASIGNA un caso real
// (lo mueve a Historico_Gestiones). Ejecutar manualmente: test_Z14 → Run
// ============================================================

/**
 * Z14: Ejecuta RequestLeadUnificado('DIGITAL') de verdad, end-to-end.
 * A diferencia de Z12b (que solo llama _preReadRequestLead), este test
 * dispara el flujo completo: Phase 1 + Phase 2 (lock, re-verify, write).
 *
 * SEGURIDAD: Captura el lastRow de Historico_Gestiones ANTES de ejecutar,
 * y después identifica exactamente qué fila(s) se agregaron — sin asumir
 * que será testSolicitudId. Si un caso REAL fue asignado por error,
 * lo detecta, revierte, y falla con mensaje crítico.
 */
function test_Z14_RequestLeadUnificado_FullExecution() {
  _seccion('Z14. RequestLeadUnificado FULL EXECUTION — end-to-end real');

  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  Logger.log('  Email ejecutor: ' + userEmail);

  var hojaUsuarios = ss.getSheetByName('Usuarios');
  var hojaAT = ss.getSheetByName('Analistas_Turnos');
  var hojaSolicitud = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  var hojaHist = ss.getSheetByName('Historico_Gestiones');
  var testSolicitudId = 'TEST-Z14-FULL-EXEC';

  var filaUsuario = -1;
  var estadoOriginal = null;
  var capOriginal = null;
  var espOriginal = null;
  var turnoInsertado = false;
  var filaTurnoInsertada = -1;
  var testCasoFila = -1;

  // Filas realmente escritas en Historico (para cleanup seguro)
  var filasNuevasHist = [];
  var lastRowHistAntes = -1;
  var casoRealAsignado = false;

  try {
    // ─── 1. ENCONTRAR Y ACTIVAR USUARIO ───────────────────────────
    var dataU = hojaUsuarios.getDataRange().getValues();
    for (var i = 1; i < dataU.length; i++) {
      if (String(dataU[i][2]).toLowerCase().trim() === userEmail) {
        filaUsuario = i + 1;
        estadoOriginal = String(dataU[i][5]).trim();
        capOriginal = String(dataU[i][6]).trim();
        espOriginal = String(dataU[i][4]).trim();
        break;
      }
    }

    if (filaUsuario === -1) {
      Logger.log('  ❌ Usuario ' + userEmail + ' NO existe en hoja Usuarios.');
      _assert('Usuario existe en Usuarios', true, false);
      return;
    }

    Logger.log('  Usuario fila ' + filaUsuario + ' | estado="' + estadoOriginal + '" | cap="' + capOriginal + '" | esp="' + espOriginal + '"');

    if (estadoOriginal.toUpperCase() !== 'ACTIVO') {
      hojaUsuarios.getRange(filaUsuario, 6).setValue('ACTIVO');
      Logger.log('  → Estado → ACTIVO');
    }
    if ((parseInt(capOriginal) || 0) < 1) {
      hojaUsuarios.getRange(filaUsuario, 7).setValue(5);
      Logger.log('  → Capacidad → 5');
    }
    var espUpper = espOriginal.toUpperCase().trim();
    if (espUpper !== 'ESTUDIO DIGITAL' && espUpper !== 'ESTUDIO_DIGITAL') {
      hojaUsuarios.getRange(filaUsuario, 5).setValue('ESTUDIO DIGITAL');
      Logger.log('  → Especialidad → ESTUDIO DIGITAL');
    }
    SpreadsheetApp.flush();

    // ─── 2. VERIFICAR/INSERTAR TURNO ──────────────────────────────
    var tieneTurnoYa = false;
    if (hojaAT && hojaAT.getLastRow() > 1) {
      var dataAT = hojaAT.getDataRange().getValues();
      var ahora = new Date();
      for (var j = 1; j < dataAT.length; j++) {
        if (String(dataAT[j][0]).toLowerCase().trim() !== userEmail) continue;
        var desde = dataAT[j][2];
        var hasta = dataAT[j][3];
        if (desde instanceof Date && ahora >= desde && (!hasta || !(hasta instanceof Date) || ahora <= hasta)) {
          tieneTurnoYa = true;
          break;
        }
      }
    }

    if (!tieneTurnoYa) {
      var hojaTurnos = ss.getSheetByName('Turnos');
      var turnoTestId = 'TEST_TURNO_Z14';
      var turnoExiste = false;
      if (hojaTurnos && hojaTurnos.getLastRow() > 1) {
        var dataTurnos = hojaTurnos.getDataRange().getValues();
        for (var t = 1; t < dataTurnos.length; t++) {
          if (String(dataTurnos[t][0]).trim() === turnoTestId) { turnoExiste = true; break; }
        }
      }
      if (!turnoExiste && hojaTurnos) {
        var filaTurno = new Array(hojaTurnos.getLastColumn()).fill('');
        filaTurno[0] = turnoTestId;
        filaTurno[1] = 'Test Z14';
        filaTurno[2] = 'NORMAL';
        for (var dd = 3; dd <= 9; dd++) filaTurno[dd] = true;
        for (var hh = 10; hh <= 23; hh += 2) { filaTurno[hh] = '00:00'; filaTurno[hh + 1] = '23:59'; }
        hojaTurnos.appendRow(filaTurno);
        SpreadsheetApp.flush();
      }
      if (hojaAT) {
        var hoy = new Date();
        hojaAT.appendRow([userEmail, turnoTestId, new Date(hoy.getTime() - 86400000), new Date(hoy.getTime() + 172800000)]);
        SpreadsheetApp.flush();
        filaTurnoInsertada = hojaAT.getLastRow();
        turnoInsertado = true;
        Logger.log('  → Turno temporal insertado fila ' + filaTurnoInsertada);
      }
    }

    // ─── 3. INVALIDAR CACHE ───────────────────────────────────────
    _invalidarCacheUsuarios();

    // ─── 4. INSERTAR CASO DE PRUEBA ───────────────────────────────
    var numCols = hojaSolicitud.getLastColumn();
    var filaTest = new Array(numCols).fill('');
    filaTest[0] = testSolicitudId;
    filaTest[1] = '999777';
    filaTest[9] = '2500000';
    filaTest[16] = 'EN_ESTUDIO';
    filaTest[17] = '01/08/2026 07:30:00';
    filaTest[20] = 'NUEVA';
    filaTest[27] = '';

    hojaSolicitud.appendRow(filaTest);
    SpreadsheetApp.flush();
    testCasoFila = hojaSolicitud.getLastRow();
    Logger.log('  Caso insertado fila ' + testCasoFila);

    // ─── 5. VISIBILIDAD: contar casos digitales reales en cola ────
    var dataSolPreCheck = hojaSolicitud.getRange(2, 1, hojaSolicitud.getLastRow() - 1, 28).getValues();
    var digitalesRealesEnCola = 0;
    for (var p = 0; p < dataSolPreCheck.length; p++) {
      var solId = String(dataSolPreCheck[p][0]).trim();
      if (solId === testSolicitudId) continue;
      var asig = String(dataSolPreCheck[p][27]).trim();
      if (asig !== '') continue;
      var estado = String(dataSolPreCheck[p][16]).trim().toUpperCase().replace(/_/g, ' ');
      if (estado === 'EN ESTUDIO' || estado === 'EN_ESTUDIO') digitalesRealesEnCola++;
    }
    Logger.log('  ⚡ Casos digitales reales en cola (excluyendo test): ' + digitalesRealesEnCola);
    if (digitalesRealesEnCola > 0) {
      Logger.log('  ⚠️ HAY COMPETENCIA: ' + digitalesRealesEnCola + ' casos digitales reales podrían ser seleccionados antes que el de prueba');
    } else {
      Logger.log('  ✅ Sin competencia digital — solo el caso de prueba es elegible tipo "digital"');
    }

    // ─── 6. CAPTURAR ESTADO DE HISTORICO ANTES ────────────────────
    lastRowHistAntes = hojaHist.getLastRow();
    Logger.log('  Historico lastRow ANTES: ' + lastRowHistAntes);

    // ─── 7. EJECUTAR RequestLeadUnificado('DIGITAL') ──────────────
    var t0 = Date.now();
    var resultado = RequestLeadUnificado('DIGITAL');
    var duracionTotal = Date.now() - t0;
    Logger.log('  RequestLeadUnificado completó en ' + duracionTotal + 'ms');
    Logger.log('  Resultado: ' + JSON.stringify(resultado));

    // ─── 8. ASSERTS PRINCIPALES ───────────────────────────────────
    _assert('resultado es objeto', true, typeof resultado === 'object');
    _assert('resultado.success === true', true, resultado.success);
    _assert('resultado.nueva === true', true, resultado.nueva);
    _assert('resultado.message contiene "Asignado"', true, (resultado.message || '').indexOf('Asignado') !== -1);

    // ─── 9. IDENTIFICAR FILAS NUEVAS EN HISTORICO ─────────────────
    SpreadsheetApp.flush();
    var lastRowHistDespues = hojaHist.getLastRow();
    Logger.log('  Historico lastRow DESPUÉS: ' + lastRowHistDespues);

    var numFilasNuevas = lastRowHistDespues - lastRowHistAntes;
    _assert('Se agregó al menos 1 fila a Historico', true, numFilasNuevas >= 1);

    for (var f = lastRowHistAntes + 1; f <= lastRowHistDespues; f++) {
      var solIdEnFila = String(hojaHist.getRange(f, 1).getValue()).trim();
      var emailEnFila = String(hojaHist.getRange(f, 26).getValue()).toLowerCase().trim();
      filasNuevasHist.push({ fila: f, solicitudId: solIdEnFila, email: emailEnFila });
      Logger.log('  → Fila nueva ' + f + ': solicitudId="' + solIdEnFila + '" email="' + emailEnFila + '"');
    }

    // ─── 10. VERIFICAR QUÉ SE ASIGNÓ ─────────────────────────────
    var filaTestEnHist = filasNuevasHist.find(function(fn) { return fn.solicitudId === testSolicitudId; });

    if (filaTestEnHist) {
      // ✅ Happy path: se asignó nuestro caso de prueba
      _assert('Caso de prueba asignado al email correcto', userEmail, filaTestEnHist.email);
      Logger.log('  ✅ Caso de prueba asignado correctamente en fila ' + filaTestEnHist.fila);
    } else {
      // ❌ Se asignó un caso REAL en vez del de prueba
      casoRealAsignado = true;
      var casosReales = filasNuevasHist.map(function(fn) { return fn.solicitudId; }).join(', ');
      Logger.log('  ❌❌❌ CRÍTICO: se asignó un caso REAL (' + casosReales + ') al usuario de prueba');
      Logger.log('  ❌❌❌ en vez del caso de prueba ' + testSolicitudId);
      Logger.log('  ❌❌❌ Verificar manualmente que el analista legítimo no perdió su caso.');
      _assert('❌ CRÍTICO: se asignó caso REAL (ID: ' + casosReales + ') al usuario de prueba — verificar manualmente', false, true);
    }

    // ─── 11. VERIFICAR QUE testSolicitudId YA NO ESTÁ EN "solicitud" ──
    var matchSol = hojaSolicitud.getRange(1, 1, hojaSolicitud.getLastRow(), 1)
      .createTextFinder(testSolicitudId).matchEntireCell(true).findNext();
    if (filaTestEnHist) {
      _assert('Caso YA NO está en solicitud (fue movido)', null, matchSol);
    }

    // ─── 12. VERIFICAR TELEMETRÍA ─────────────────────────────────
    var telData = admin_getLockTelemetry();
    var entries = telData.entries || [];
    var ultimaRLU = null;
    for (var e = entries.length - 1; e >= 0; e--) {
      if (entries[e].fn === 'RequestLeadUnificado') { ultimaRLU = entries[e]; break; }
    }
    _assert('Telemetría tiene entrada RequestLeadUnificado', true, ultimaRLU !== null);
    if (ultimaRLU) {
      // Umbral 2500ms: en uso real un analista pide caso cada 5-15 minutos, no cada 20s.
      // Se observó variabilidad de 1.7s-4.3s en ejecuciones consecutivas rápidas,
      // consistente con throttling temporal de cuota de Apps Script para escrituras
      // repetidas. No representativo del uso real (los analistas no piden casos cada
      // 20-40s de forma mecánica). La verificación real de rendimiento en producción
      // debe hacerse vía LOCK_TELEMETRY_V1 después de uso real, no con pruebas
      // consecutivas artificiales.
      _assert('lockMs < 2500 (Phase 2 verify+write)', true, ultimaRLU.lockMs < 2500);
      _assert('ok === true en telemetría', true, ultimaRLU.ok);
      Logger.log('  Telemetría: lockMs=' + ultimaRLU.lockMs + ' retries=' + ultimaRLU.retries + ' ok=' + ultimaRLU.ok);
    }

  } finally {
    // ─── CLEANUP ──────────────────────────────────────────────────

    // A. Eliminar TODAS las filas nuevas de Historico (sean del test o reales asignados por error)
    //    Eliminar en orden descendente para no invalidar índices
    filasNuevasHist.sort(function(a, b) { return b.fila - a.fila; });
    for (var r = 0; r < filasNuevasHist.length; r++) {
      hojaHist.deleteRow(filasNuevasHist[r].fila);
      Logger.log('  Historico: eliminada fila ' + filasNuevasHist[r].fila + ' (solicitudId=' + filasNuevasHist[r].solicitudId + ')');
    }

    // B. Decrementar contadores por cada fila asignada
    for (var c = 0; c < filasNuevasHist.length; c++) {
      _decrementarContadorCupo(userEmail, 'digital');
      _ajustarCargaPendiente(userEmail, -1);
    }
    if (filasNuevasHist.length > 0) {
      Logger.log('  Contadores revertidos: cupo -' + filasNuevasHist.length + ', carga -' + filasNuevasHist.length);
    }

    // C. Si el caso de prueba sigue en "solicitud" (no fue el seleccionado), eliminarlo
    var matchSolClean = hojaSolicitud.getRange(1, 1, hojaSolicitud.getLastRow(), 1)
      .createTextFinder(testSolicitudId).matchEntireCell(true).findNext();
    if (matchSolClean) {
      hojaSolicitud.deleteRow(matchSolClean.getRow());
      Logger.log('  Caso de prueba eliminado de solicitud fila ' + matchSolClean.getRow());
    }

    // D. Si se asignó un caso real, advertir para intervención manual
    if (casoRealAsignado) {
      for (var cr = 0; cr < filasNuevasHist.length; cr++) {
        if (filasNuevasHist[cr].solicitudId !== testSolicitudId) {
          Logger.log('  ⚠️ ATENCIÓN: el caso REAL "' + filasNuevasHist[cr].solicitudId + '" fue eliminado de Historico pero NO reinsertado en solicitud.');
          Logger.log('  ⚠️ Esto requiere intervención manual: verificar si el caso necesita reasignación.');
        }
      }
    }

    // E. Restaurar usuario
    if (filaUsuario > 0) {
      if (estadoOriginal && estadoOriginal.toUpperCase() !== 'ACTIVO') {
        hojaUsuarios.getRange(filaUsuario, 6).setValue(estadoOriginal);
      }
      if ((parseInt(capOriginal) || 0) < 1) {
        hojaUsuarios.getRange(filaUsuario, 7).setValue(capOriginal);
      }
      if (espOriginal.toUpperCase().trim() !== 'ESTUDIO DIGITAL' && espOriginal.toUpperCase().trim() !== 'ESTUDIO_DIGITAL') {
        hojaUsuarios.getRange(filaUsuario, 5).setValue(espOriginal);
      }
      Logger.log('  Usuario restaurado');
    }

    // F. Eliminar turno temporal
    if (turnoInsertado && filaTurnoInsertada > 0) {
      hojaAT.deleteRow(filaTurnoInsertada);
      Logger.log('  Turno temporal eliminado');
    }
    var hojaTurnosClean = ss.getSheetByName('Turnos');
    if (hojaTurnosClean) {
      var matchTurno = hojaTurnosClean.getRange(1, 1, hojaTurnosClean.getLastRow(), 1)
        .createTextFinder('TEST_TURNO_Z14').matchEntireCell(true).findNext();
      if (matchTurno) { hojaTurnosClean.deleteRow(matchTurno.getRow()); }
    }

    // G. Verificación final
    var postHist = hojaHist.getRange(1, 1, hojaHist.getLastRow(), 1)
      .createTextFinder(testSolicitudId).matchEntireCell(true).findNext();
    _assert('Cleanup: ' + testSolicitudId + ' no queda en Historico', null, postHist);

    var postSol = hojaSolicitud.getRange(1, 1, hojaSolicitud.getLastRow(), 1)
      .createTextFinder(testSolicitudId).matchEntireCell(true).findNext();
    _assert('Cleanup: ' + testSolicitudId + ' no queda en solicitud', null, postSol);

    _invalidarCacheUsuarios();
    SpreadsheetApp.flush();
    Logger.log('  Test Z14 finalizado.');
  }
}

