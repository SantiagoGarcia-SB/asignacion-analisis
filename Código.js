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
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hoja = ss.getSheetByName("Usuarios");
  if (!hoja) return null;

  const datos = hoja.getDataRange().getValues();
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
    // Fallback hardcoded para compatibilidad si la hoja Equipos no existe aún
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
  try {
    const hojaHist = ss.getSheetByName("Historico_Gestiones");
    if (hojaHist && hojaHist.getLastRow() > 1) {
      const dataH = hojaHist.getRange(2, 1, hojaHist.getLastRow() - 1, Math.max(numCols, 60)).getDisplayValues();
      agregarDesdeRegistros(dataH, 'HISTORICO');
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
  try {
    const ssReestH = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hojaHistReest = ssReestH.getSheetByName("Historico_Gestiones");
    if (hojaHistReest && hojaHistReest.getLastRow() > 1) {
      const dataHistReest = hojaHistReest.getRange(2, 1, hojaHistReest.getLastRow() - 1, 18).getDisplayValues();
      for (let i = 0; i < dataHistReest.length; i++) {
        const asignado = String(dataHistReest[i][6]).trim().toLowerCase();
        if (asignado !== userEmail) continue;
        const fechaFinR = String(dataHistReest[i][9]).trim();
        const fechaAsigR = String(dataHistReest[i][8]).trim();

        if (fechaFinR !== "") {
          if (fechaFinR.includes(hoyStr)) gestionadasHoy++;
          gestionadasTotal++;
          continue;
        }
        if (fechaAsigR === "") continue;

        const tipoProc = String(dataHistReest[i][4]).trim();
        const claseR = String(dataHistReest[i][5]).trim();
        let filaAdaptada = new Array(numCols).fill("");
        filaAdaptada[0] = String(dataHistReest[i][1]).trim();
        filaAdaptada[1] = String(dataHistReest[i][3]).trim();
        filaAdaptada[2] = String(dataHistReest[i][2]).trim();
        filaAdaptada[3] = String(dataHistReest[i][3]).trim();
        filaAdaptada[4] = tipoProc;
        filaAdaptada[5] = claseR;
        filaAdaptada[8] = fechaAsigR;
        filaAdaptada[16] = "__REESTUDIO__";
        filaAdaptada[17] = String(dataHistReest[i][0]).trim();
        filaAdaptada[20] = tipoProc || claseR;
        filaAdaptada[26] = fechaAsigR;
        filaAdaptada[27] = asignado;
        filaAdaptada[28] = "";
        filaAdaptada[30] = String(dataHistReest[i][7]).trim();
        filaAdaptada.push("");
        misFilasPendientes.push(filaAdaptada);
      }
    }
  } catch(e) {
    Logger.log("Error incluyendo reestudios historico en getTableData: " + e.message);
  }

  // Detectar reasignaciones recientes por admin (últimos 30 min)
  var reasignaciones = [];
  try {
    var ahora = new Date();
    var hace30 = new Date(ahora.getTime() - 30 * 60 * 1000);
    // Principal: col 38 (idx 37)
    var hojaHistCheck = ss.getSheetByName("Historico_Gestiones");
    if (hojaHistCheck && hojaHistCheck.getLastRow() > 1) {
      var lastCol = Math.max(38, hojaHistCheck.getLastColumn());
      var dataCheck = hojaHistCheck.getRange(2, 1, hojaHistCheck.getLastRow() - 1, lastCol).getDisplayValues();
      for (var c = 0; c < dataCheck.length; c++) {
        var asig = String(dataCheck[c][25]).trim().toLowerCase();
        if (asig !== userEmail) continue;
        var marca = String(dataCheck[c][37] || "").trim();
        if (!marca.startsWith("ADMIN:")) continue;
        var partes = marca.split("|");
        if (partes.length >= 2) {
          var fechaMarca = new Date(partes[1].trim());
          if (!isNaN(fechaMarca.getTime()) && fechaMarca >= hace30) {
            reasignaciones.push({ solicitud: String(dataCheck[c][0]).trim(), admin: partes[0].replace("ADMIN:","") });
          }
        }
      }
    }
    // Reestudios: col 15 (idx 14)
    var ssReestCheck = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    var hojaHistRCheck = ssReestCheck.getSheetByName("Historico_Gestiones");
    if (hojaHistRCheck && hojaHistRCheck.getLastRow() > 1) {
      var dataRCheck = hojaHistRCheck.getRange(2, 1, hojaHistRCheck.getLastRow() - 1, 20).getDisplayValues();
      for (var r = 0; r < dataRCheck.length; r++) {
        var asigR = String(dataRCheck[r][6]).trim().toLowerCase();
        if (asigR !== userEmail) continue;
        var marcaR = String(dataRCheck[r][19] || "").trim();
        if (!marcaR.startsWith("ADMIN:")) continue;
        var partesR = marcaR.split("|");
        if (partesR.length >= 2) {
          var fechaMarcaR = new Date(partesR[1].trim());
          if (!isNaN(fechaMarcaR.getTime()) && fechaMarcaR >= hace30) {
            reasignaciones.push({ solicitud: String(dataRCheck[r][1]).trim(), admin: partesR[0].replace("ADMIN:","") });
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

function actualizarSolicitudesNuevasAPI() {
  Logger.log("Iniciando ejecución");
  const hoy = new Date();
  const horaActual = hoy.getHours(); 
  if (horaActual < 8 || horaActual >= 18) {
    Logger.log("Fuera de horario de operación (8am - 6pm). Terminando script.");
    return;
  }

  const props = PropertiesService.getScriptProperties();
  const keyFull = getKeyFull();
  const endpointBase = props.getProperty('endPointSaiNewApiDate');

  if (!keyFull || !endpointBase) {
    Logger.log("❌ Error: Faltan credenciales o endpointBase en PropertiesService.");
    return;
  }

  let paginaActual = 1;
  let totalPaginas = 1;

  const fechaInicio = new Date();
  fechaInicio.setDate(hoy.getDate() - 3); 

  const sIni = formatDateCustom(fechaInicio);
  const sFin = formatDateCustom(hoy);
  const ESTADOS_EXCLUIR = new Set(["RECHAZADO", "APROBADO","CODEUDORES_REQUERIDOS"]);
  const TIPOS_EXCLUIR   = new Set(["AC"]); 

  Logger.log(`Rango de consulta: Desde ${sIni} hasta ${sFin}`);
  
  const solicitudesHomologadas = [];
  const idsFinalizadas = new Set();
  const solicitudesCodeudorPendiente = [];
  const mapaTipos = {
    "TS":  "NUEVA",
    "AD": "ADICIONAL",
    "RSD": "REESTUDIO",
    "RE":  "REESTUDIO",
    "RC":  "REESTUDIO",
    "IND": "INDUCCION"
  };
  
  try {
    do {
      const url = `${endpointBase}?startDate=${sIni}&endDate=${sFin}&page=${paginaActual}&size=200`;
      Logger.log(`[Petición ${paginaActual}] Consultando endpoint`);
      
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

        Logger.log(`Página ${paginaActual} de ${totalPaginas} descargada exitosamente. Registros: ${contenido.length}`);

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
        
        Logger.log(`Registros extraídos: ${guardadosEnPagina}`);
        paginaActual++;
        
        if (paginaActual <= totalPaginas) {
          Utilities.sleep(2000);
        }

      } else {
        const errorDetail = response.getContentText();
        Logger.log(`FALLO CRÍTICO en página ${paginaActual}. Código HTTP: ${code}. Detalle: ${errorDetail}`);
        throw new Error(`La API falló con código ${code}: ${errorDetail}`);
      }

    } while (paginaActual <= totalPaginas);

  } catch (e) {
    Logger.log("❌ Ejecución cancelada: " + e.message);
    return;
  }

  if (solicitudesHomologadas.length > 0) {
    Logger.log(`Ejecutando guardado final: ${solicitudesHomologadas.length} solicitudes válidas encontradas.`);
    procesarYGuardarLote(solicitudesHomologadas);
    Logger.log("Proceso completado exitosamente.");
  } else {
    Logger.log("Proceso finalizado. No hay solicitudes útiles en este periodo.");
  }

  if (idsFinalizadas.size > 0) {
    eliminarSolicitudesFinalizadas(idsFinalizadas);
  }

  if (solicitudesCodeudorPendiente.length > 0) {
    moverAListaEsperaCodeudor(solicitudesCodeudorPendiente);
  }
}

function eliminarSolicitudesFinalizadas(idsAEliminar) {
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

    const ids = hoja.getRange(2, 1, lastRow - 1, 1).getValues();
    let eliminadas = 0;

    for (let i = ids.length - 1; i >= 0; i--) {
      if (idsAEliminar.has(String(ids[i][0]).trim())) {
        hoja.deleteRow(i + 2);
        eliminadas++;
      }
    }

    if (eliminadas > 0) {
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

// Trigger periódico (independiente del sync de 10 min): purga expiradas (>3 meses) y reactiva las que ya salieron de CODEUDORES_REQUERIDOS.
function revisarEnEsperaCodeudor() {
  const keyFull = getKeyFull();
  const endpointBase = PropertiesService.getScriptProperties().getProperty('endpointSaiNewApi');
  if (!keyFull || !endpointBase) {
    Logger.log("❌ revisarEnEsperaCodeudor: faltan credenciales.");
    return;
  }

  let reactivadas = [];
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log("❌ Lock no disponible para revisar pendiente_codeudor: " + e.message);
    return;
  }

  try {
    const ss = SpreadsheetApp.openById(ID_SHEET_GESTION_DIRECTA);
    const hoja = ss.getSheetByName(NOMBRE_HOJA_PENDIENTE_CODEUDOR);
    if (!hoja || hoja.getLastRow() < 2) return;

    const lastRow = hoja.getLastRow();
    const datos = hoja.getRange(2, 1, lastRow - 1, 5).getValues();
    const ahora = new Date();
    const TRES_MESES_MS = 90 * 24 * 60 * 60 * 1000;
    const filasAEliminar = [];

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
          hoja.getRange(i + 2, 4).setValue(Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd HH:mm:ss"));
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
        item.codeudores = (data.codebtors || []).slice(0, 3).map(c => ({
          nombre: c.name || "",
          documento: c.document || "",
          tipoDoc: c.documentType || "",
          email: c.email || "",
          telefono: c.phone || "",
          estado: c.studyStatus || "",
          resultado: c.resultDescription || ""
        }));

        reactivadas.push(item);
        filasAEliminar.push(i);

      } catch (e) {
        Logger.log(`❌ Error verificando solicitud ${solicitud} en pendiente_codeudor: ${e.message}`);
      }
    }

    for (let i = filasAEliminar.length - 1; i >= 0; i--) {
      hoja.deleteRow(filasAEliminar[i] + 2);
    }
    if (filasAEliminar.length > 0) SpreadsheetApp.flush();

  } catch (err) {
    Logger.log("❌ Error en revisarEnEsperaCodeudor: " + err.message);
  } finally {
    lock.releaseLock();
  }

  if (reactivadas.length > 0) {
    procesarYGuardarLote(reactivadas);
    Logger.log(`✅ ${reactivadas.length} solicitudes reactivadas desde pendiente_codeudor hacia Solicitudes.`);
  }
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
        let valor = String(f || "").trim();
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
          } catch(e) {
            Logger.log(`Advertencia: No se pudo parsear la fecha ${valor}.`);
          }
        }
        fila[17 + idx] = resultado; 
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

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch(e) {
    return { success: false, message: "El sistema está muy ocupado guardando gestiones. Por favor, dale a 'Guardar' nuevamente en unos segundos." };
  }

  let disparaAsignacion = false;
  let usuarioActual = (Session.getActiveUser().getEmail() || "Email No Detectado").toLowerCase();
  let mensajeAdicional = "";

  try {
    const ssOrigen = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);

    const ssReestudios = SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty('ID_HOJA_REESTUDIOS') || ID_HOJA_REESTUDIOS
    );

    const ahora = new Date();
    const fechaSoloDia = Utilities.formatDate(ahora, "GMT-5", 'dd/MM/yyyy');
    
    const esEstadoCierre = estado_q.includes("APROB") || estado_q.includes("NEGAD") || estado_q.includes("RECHAZ");
    disparaAsignacion = esEstadoCierre || estado_q.includes("APLAZ");

    // 1. Buscar en Historico_Gestiones
    const hojaHistorico = ssOrigen.getSheetByName("Historico_Gestiones");
    let targetRow = -1;

    // Los reestudios viven en ssReestudios, no en el warehouse — saltar RUTA A
    if (data.tipoSolicitudActual !== 'reestudio' && hojaHistorico && hojaHistorico.getLastRow() > 1) {
      const lastRowH = hojaHistorico.getLastRow();
      const dataH = hojaHistorico.getRange(2, 1, lastRowH - 1, 27).getValues();
      for (let i = 0; i < dataH.length; i++) {
        const idMatch  = String(dataH[i][0]).trim() === String(data.solicitudId).trim();
        const fechaFin = String(dataH[i][26]).trim(); // col 27 = fechaFin
        if (idMatch && fechaFin === '') {
          targetRow = i + 2;
          break;
        }
      }
    }

    if (targetRow !== -1) {
      // 🟢 RUTA A: SOLICITUD DE LA BASE PRINCIPAL (Historico_Gestiones)
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

      SpreadsheetApp.flush();

      const fechaDiligenciada = (data.tipoSolicitudActual === 'desaplazamiento' || data.tipoSolicitudActual === 'induccion')
        ? (tAsiParsed || '')
        : (data.fecha_radicacion_sai || '');
      hojaHistorico.getRange(targetRow, 34).setValue(fechaDiligenciada);
      if (fechaDiligenciada instanceof Date) hojaHistorico.getRange(targetRow, 34).setNumberFormat("dd/MM/yyyy HH:mm:ss");
      hojaHistorico.getRange(targetRow, 35, 1, 3).setValues([[tiempos.minutos_cola, tiempos.minutos_gestion, tiempos.minutos_general]]);
      hojaHistorico.getRange(targetRow, 35, 1, 3).setNumberFormat("0.00");

      SpreadsheetApp.flush();

    } else {
      // 🔵 RUTA B: REESTUDIO — buscar en Historico_Gestiones de ssReestudios
      const hojaHistoricoR = ssReestudios.getSheetByName("Historico_Gestiones");
      let targetRowReest = -1;

      if (hojaHistoricoR && hojaHistoricoR.getLastRow() > 1) {
        const lastRowHR = hojaHistoricoR.getLastRow();
        const dataHR = hojaHistoricoR.getRange(2, 2, lastRowHR - 1, 9).getValues(); // cols B–J
        for (let i = 0; i < dataHR.length; i++) {
          const idMatch  = String(dataHR[i][0]).trim() === String(data.solicitudId).trim();
          const fechaFin = String(dataHR[i][8]).trim(); // col J = fechaFinGestion
          if (idMatch && fechaFin === '') {
            targetRowReest = i + 2;
            break;
          }
        }
      }

      if (targetRowReest === -1) {
        return { success: false, message: `Solicitud ${data.solicitudId} no encontrada en ninguna base central.` };
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

      SpreadsheetApp.flush();
    }

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
  const props = PropertiesService.getScriptProperties();
  const TARGET_SS_ID = props.getProperty('TARGET_SOLICITUDES_SS_ID') || TARGET_SOLICITUDES_SS_ID;
  const REEST_SS_ID  = props.getProperty('ID_HOJA_REESTUDIOS') || ID_HOJA_REESTUDIOS;
  const resultado = [];

  // Digital: Historico_Gestiones principal
  try {
    const hoja = SpreadsheetApp.openById(TARGET_SS_ID).getSheetByName('Historico_Gestiones');
    if (hoja && hoja.getLastRow() > 1) {
      const ncols = Math.max(60, hoja.getLastColumn());
      const data  = hoja.getRange(2, 1, hoja.getLastRow() - 1, ncols).getDisplayValues();
      for (let i = 0; i < data.length; i++) {
        const h       = data[i];
        const email   = String(h[25]).toLowerCase().trim();  // col 26 = email analista
        const estadoQ = String(h[16]).trim().toUpperCase(); // col 17 = estado_q
        if (email !== userEmail) continue;
        if (!ESTADOS_PEND.includes(estadoQ)) continue;
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

  // Reestudio: Historico_Gestiones de la hoja de reestudios
  try {
    const hojaR = SpreadsheetApp.openById(REEST_SS_ID).getSheetByName('Historico_Gestiones');
    if (hojaR && hojaR.getLastRow() > 1) {
      const data = hojaR.getRange(2, 1, hojaR.getLastRow() - 1, 18).getDisplayValues();
      for (let i = 0; i < data.length; i++) {
        const fila    = data[i];
        const email   = String(fila[6]).toLowerCase().trim();  // col 7
        const estadoQ = String(fila[10]).trim().toUpperCase(); // col 11
        if (email !== userEmail) continue;
        if (!ESTADOS_PEND.includes(estadoQ)) continue;
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
    const hojaHist = SpreadsheetApp.openById("1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0")
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
    const hojaHistR = SpreadsheetApp.openById("1slgykTgjoAtCd6KmlG7Lqiuw-nM1hSguQbi0XqeLu7U")
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

    // 1. Buscar turno vigente del analista
    const hojaAT = ss.getSheetByName('Analistas_Turnos');
    if (!hojaAT || hojaAT.getLastRow() <= 1) return { ok: true };

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
    if (!idTurnoActivo) return { ok: true };

    // 2. Leer definición del turno
    const hojaTurnos = ss.getSheetByName('Turnos');
    if (!hojaTurnos || hojaTurnos.getLastRow() <= 1) return { ok: true };

    const dataTurnos = hojaTurnos.getDataRange().getValues();
    const dispTurnos = hojaTurnos.getDataRange().getDisplayValues();
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
          message: '⏰ Tu turno (' + (nombreTurno || idTurnoActivo) + ') no aplica hoy. No puedes recibir casos.'
        };
      }
      horaIniStr = String(dispTurnos[i][iniCol] || '').trim().replace(/(:\d{2}):\d{2}$/, '$1');
      horaFinStr = String(dispTurnos[i][finCol] || '').trim().replace(/(:\d{2}):\d{2}$/, '$1');
      break;
    }
    if (!horaFinStr) return { ok: true };

    let minIni = parseMin(horaIniStr);
    let minFin = parseMin(horaFinStr);
    if (minFin === null) return { ok: true };

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
    const hojaUsuarios = ss.getSheetByName("Usuarios");
    const dataUsuarios = hojaUsuarios.getDataRange().getValues();

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

    // También contar desde Historico_Gestiones (casos asignados movidos al asignar)
    try {
      const hojaHistV = ss.getSheetByName("Historico_Gestiones");
      if (hojaHistV && hojaHistV.getLastRow() > 1) {
        const colsHistV = Math.max(61, hojaHistV.getLastColumn());
        const dataHistV = hojaHistV.getRange(2, 1, hojaHistV.getLastRow() - 1, colsHistV).getValues();
        for (let i = 0; i < dataHistV.length; i++) {
          const asignado = String(dataHistV[i][25]).trim().toLowerCase();
          if (asignado !== userEmail) continue;
          const fechaAsig = dataHistV[i][24];
          const fechaFin  = dataHistV[i][26];
          if (!esHoy(fechaAsig) && !esHoy(fechaFin)) continue;
          let tipo = String(dataHistV[i][60] || '').trim();
          if (!tipo || !conteoHoy.hasOwnProperty(tipo)) {
            const claseNorm  = String(dataHistV[i][20]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
            const estadoNorm = String(dataHistV[i][16]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
            const estadoSinGuion = estadoNorm.replace(/_/g, ' ');
            tipo = 'digital';
            if (estadoSinGuion === 'APROBADO PENDIENTE BIOMETRIA' || estadoNorm === 'APROBADO_PENDIENTE_BIOMETRIA') tipo = 'desaplazamiento';
            else if (claseNorm === "INDUCCION") tipo = 'induccion';
          }
          conteoHoy[tipo]++;
        }
      }
    } catch(e) {}

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
            const tipoPNorm = String(dataReest[i][4]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
            let tipo = null;
            if (tipoPNorm.includes("BIOMETRIA FALLIDA")) tipo = 'biometriaFallida';
            else if (origenR === "CORREO" && tipoPNorm === "NUEVA") tipo = 'nuevaUar';
            else if (origenR === "CORREO" && tipoPNorm === "ADICIONAL") tipo = 'deudorUar';
            else if (tipoPNorm === "REESTUDIO") tipo = 'reestudio';
            if (tipo) conteoHoy[tipo]++;
          }
        }
      }
    } catch(e) {}

    // Contar desde Historico_Gestiones de reestudios (casos movidos al asignar)
    try {
      const ssReestH = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
      const hojaHistReestC = ssReestH.getSheetByName("Historico_Gestiones");
      if (hojaHistReestC && hojaHistReestC.getLastRow() > 1) {
        const colsHRC = Math.max(19, hojaHistReestC.getLastColumn());
        const dataHistReestC = hojaHistReestC.getRange(2, 1, hojaHistReestC.getLastRow() - 1, colsHRC).getValues();
        for (let i = 0; i < dataHistReestC.length; i++) {
          const asignado = String(dataHistReestC[i][6]).trim().toLowerCase();
          if (asignado !== userEmail) continue;
          const fechaAsig = dataHistReestC[i][8];
          const fechaFin = dataHistReestC[i][9];
          if (!esHoy(fechaAsig) && !esHoy(fechaFin)) continue;
          let tipo = String(dataHistReestC[i][18] || '').trim();
          if (!tipo || !conteoHoy.hasOwnProperty(tipo)) {
            const origenR = String(dataHistReestC[i][3]).toUpperCase().trim();
            const tipoPNorm = String(dataHistReestC[i][4]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
            tipo = null;
            if (tipoPNorm.includes("BIOMETRIA FALLIDA")) tipo = 'biometriaFallida';
            else if (origenR === "CORREO" && tipoPNorm === "NUEVA") tipo = 'nuevaUar';
            else if (origenR === "CORREO" && tipoPNorm === "ADICIONAL") tipo = 'deudorUar';
            else if (tipoPNorm === "REESTUDIO") tipo = 'reestudio';
          }
          if (tipo) conteoHoy[tipo]++;
        }
      }
    } catch(e) {}

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
  
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hojaUsuarios = ss.getSheetByName("Usuarios");
  const datos = hojaUsuarios.getDataRange().getValues();
  
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
    return { success: true, message: 'Tu solicitud de ' + tipo + ' fue enviada. El administrador la revisará pronto.' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function verificarPermisoVigenteHoy() {
  try {
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
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

function obtenerGestionesHoyCruzadas() {
  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, "dd/MM/yyyy");

    let conteoDigital = 0;
    let conteoReestudios = 0;

    // 1. Contar desde Historico_Gestiones del warehouse (digitales, biometría, inducciones)
    try {
      const hojaHistG = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID)
                          .getSheetByName("Historico_Gestiones");
      if (hojaHistG && hojaHistG.getLastRow() > 1) {
        const dataHistG = hojaHistG.getRange(2, 26, hojaHistG.getLastRow() - 1, 2).getDisplayValues(); // cols 26-27
        for (let i = 0; i < dataHistG.length; i++) {
          const asignado = String(dataHistG[i][0]).trim().toLowerCase(); // col 26
          const fechaFin = String(dataHistG[i][1]).trim();               // col 27
          if (asignado === userEmail && fechaFin.includes(hoyStr)) conteoDigital++;
        }
      }
    } catch(e) { Logger.log("obtenerGestionesHoyCruzadas Hist: " + e.message); }

    // 2. Contar desde Historico_Gestiones de ssReestudios
    try {
      const hojaHistReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS)
                              .getSheetByName("Historico_Gestiones");
      if (hojaHistReest && hojaHistReest.getLastRow() > 1) {
        const dataReest = hojaHistReest.getRange(2, 7, hojaHistReest.getLastRow() - 1, 4).getDisplayValues(); // cols G(7)..J(10)
        for (let i = 0; i < dataReest.length; i++) {
          const asignado = String(dataReest[i][0]).trim().toLowerCase(); // col G
          const fechaFin = String(dataReest[i][3]).trim();               // col J
          if (asignado === userEmail && fechaFin.includes(hoyStr)) conteoReestudios++;
        }
      }
    } catch (e) {
      Logger.log("obtenerGestionesHoyCruzadas Reest: " + e.message);
    }

    return {
      hoyTotal: conteoDigital + conteoReestudios,
      detalle: {
        digital: conteoDigital,
        reestudios: conteoReestudios
      }
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
