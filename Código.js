const WAREHOUSE_ID = '1V2GTI4IOPUEsC67SPIGey3LM3OxFCt-8HlFbX95R_fs'; 
const TARGET_SOLICITUDES_SS_ID = '1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0'; 


const Consulta_Especial = 'Consulta_especial';

const SHEET_NAME_POLIZAS = 'Hoja 1';
const SHEET_NAME_SOLICITUDES = 'solicitud';


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
    if (info.especialidad === "PENDIENTE_BIOMETRIA") {
      return HtmlService.createTemplateFromFile('VistaBiometria')
          .evaluate()
          .setTitle('Gestión de Biometría')
          .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } else if(info.especialidad === 'REESTUDIOS'){
        return HtmlService.createTemplateFromFile('VistaReestudios')
        .evaluate()
        .setTitle('Gestión de Reestudios')
        .addMetaTag('viewport','width=device-width, initial-scale=1');
    } else {
      return HtmlService.createTemplateFromFile('index')
          .evaluate()
          .setTitle('Gestión de Solicitudes - Asesor')
          .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
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
  if (hojaScore) {
    const dataScore = hojaScore.getDataRange().getDisplayValues();
    for (let i = 1; i < dataScore.length; i++) {
      let pol = String(dataScore[i][0]).trim(); 
      let polNorm = pol.replace(/\D/g, '').replace(/^0+/, '');
      let categoria = String(dataScore[i][2] || "").trim().toUpperCase(); 
      
      if (pol) mapaScore.set(pol, categoria);
      if (polNorm) mapaScore.set(polNorm, categoria);
    }
  }
  headers.push("CategoriaScore"); 

  const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, "dd/MM/yyyy");
  
  let gestionadasHoy = 0;
  let gestionadasTotal = 0;

  const misFilasPendientes = registros.filter(fila => {
    const asignadoA = String(fila[27]).trim().toLowerCase();
    const fechaFin = String(fila[28]).trim();
    const fechaAsignacion = String(fila[26].trim())
    
    if (asignadoA === userEmail && fechaFin !== "") {
      gestionadasTotal++;
      if (fechaFin.includes(hoyStr)) {
        gestionadasHoy++;
      }
    }
    return asignadoA === userEmail && fechaFin === "" && fechaAsignacion !== "" ; 
  }).map(fila => {
    let poliza = String(fila[1]).trim();
    let polNorm = poliza.replace(/\D/g, '').replace(/^0+/, '');
    
    let categoria = mapaScore.get(poliza) || mapaScore.get(polNorm) || "";
    fila.push(categoria); 
    return fila;
  });

  return {
    tabla: [headers, ...misFilasPendientes],
    stats: {
      hoy: gestionadasHoy,
      total: gestionadasTotal
    }
  };
}

function getHojaPolizas() {
  return SpreadsheetApp.openById(WAREHOUSE_ID).getSheetByName(SHEET_NAME_POLIZAS);
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

function resetProgress() {
  props.deleteProperty(PROP_BLOCK_INDEX);
  props.deleteProperty(PROP_POL_CHUNK_INDEX);
  props.deleteProperty(PROP_POL_COUNT);
  PropertiesService.getUserProperties().deleteProperty('CHECKPOINT_TRACKING');
  PropertiesService.getUserProperties().deleteProperty('CHECKPOINT_NEGADAS_SIMPLE');
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

          const estadoExcluido = ESTADOS_EXCLUIR.has(estadoGeneral);
          const tipoExcluido   = TIPOS_EXCLUIR.has(tipoSolicitud);

          if (String(item.mainResultCode) === "2" && !estadoExcluido && !tipoExcluido) {

            const tipoOriginal = String(item.requestType || "").toUpperCase().trim();
            let claseNormalizada = mapaTipos[tipoOriginal] || tipoOriginal;
            if (estadoGeneral.includes("EN ESTUDIO") && claseNormalizada === "") {
              claseNormalizada = "NUEVA";
            }

            solicitudesHomologadas.push({
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
              canal : String(item.channel || "").trim()
            });
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
      const fila = new Array(37).fill(""); 

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
      

      const rangoDestino = hojaP.getRange(rowInicio, 1, filaP.length, 37);
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
    // Definición de las 2 Bases de Datos
    const ID_WAREHOUSE = "1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0";
    const ssOrigen = SpreadsheetApp.openById(ID_WAREHOUSE);
    const sheetOrigen = ssOrigen.getSheetByName("solicitud");
    
    const ID_HOJA_REESTUDIOS_API = '1slgykTgjoAtCd6KmlG7Lqiuw-nM1hSguQbi0XqeLu7U';
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS_API);
    const sheetReestudios = ssReestudios.getSheetByName("ORIGEN");

    const ahora = new Date();
    const fechaSoloDia = Utilities.formatDate(ahora, "GMT-5", 'dd/MM/yyyy');
    const fechaTexto = Utilities.formatDate(ahora, "GMT-5", 'dd/MM/yyyy HH:mm:ss');
    
    const esEstadoCierre = estado_q.includes("APROB") || estado_q.includes("NEGAD") || estado_q.includes("RECHAZ");
    disparaAsignacion = esEstadoCierre || estado_q.includes("APLAZ");

    // 1. BUSCAMOS EN EL EXCEL PRINCIPAL (Estudios, Bio, Inducciones)
    const ids = sheetOrigen.getRange('A:A').getValues(); 
    let targetRow = -1;
    for (let i = 1; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === String(data.solicitudId).trim()) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow !== -1) {
      // 🟢 RUTA A: ES UNA SOLICITUD DE LA BASE PRINCIPAL
      const fechaAsignacion = sheetOrigen.getRange(targetRow, 27).getValue(); 
      const fechaRadicacion = sheetOrigen.getRange(targetRow, 18).getValue();
      let minutosDeGestion = 0;
      if (fechaAsignacion instanceof Date && !isNaN(fechaAsignacion.getTime())) {
        minutosDeGestion = Number(((ahora.getTime() - fechaAsignacion.getTime()) / (1000 * 60)).toFixed(2));
      }
      
      const valorActualW = sheetOrigen.getRange(targetRow, 23).getValue();
      let historialFechasW = !valorActualW ? fechaTexto : fechaTexto + "\n" + valorActualW;

      // 🚀 TALLADO DE CLASE PERMANENTE PARA NO PERDER EL CONTEO
      let valorClaseActual = sheetOrigen.getRange(targetRow, 21).getValue();
      if (data.tipoSolicitudActual === 'biometria') valorClaseActual = 'BIOMETRIA';
      else if (data.tipoSolicitudActual === 'induccion') valorClaseActual = 'INDUCCION';

      const valorUarActual = sheetOrigen.getRange(targetRow, 22).getValue();
      
      let minutosHabilesSLA = 0;
      if (fechaAsignacion instanceof Date && !isNaN(fechaAsignacion.getTime())) {
        minutosHabilesSLA = calcularMinutosHabilesSLA(fechaAsignacion, ahora, ssOrigen);
      }
      let horasHabilesSLA = Number((minutosHabilesSLA / 60).toFixed(2));

      // Guardar en hoja principal
      sheetOrigen.getRange(targetRow, 17).setValue(estado_q); 
      sheetOrigen.getRange(targetRow, 21, 1, 5).setValues([[
        valorClaseActual, valorUarActual, historialFechasW, data.biometria || '', data.comentarios_gestion || ''
      ]]);
      
      sheetOrigen.getRange(targetRow, 32, 1, 2).setValues([[motivo_aplazamiento, motivo_negacion]]);
      sheetOrigen.getRange(targetRow, 29).setValue(ahora).setNumberFormat("dd/mm/yyyy HH:mm:ss"); 
      sheetOrigen.getRange(targetRow, 30).setValue(horasHabilesSLA); 
      sheetOrigen.getRange(targetRow, 34).setValue(fechaSoloDia); 
      sheetOrigen.getRange(targetRow, 35).setValue(minutosDeGestion); 

      // Tiempo general (minutos hábiles desde radicación hasta gestión)
      let minutosHabilesGeneral = 0;
      if (fechaRadicacion instanceof Date && !isNaN(fechaRadicacion.getTime())) {
        minutosHabilesGeneral = calcularMinutosHabilesSLA(fechaRadicacion, ahora, ssOrigen);
      }
      sheetOrigen.getRange(targetRow, 37).setValue(Number(minutosHabilesGeneral.toFixed(2)));

      // Fecha y hora radicación SAI (ingresada manualmente por el analista)
      if (data.fecha_radicacion_sai) {
        sheetOrigen.getRange(targetRow, 38).setValue(data.fecha_radicacion_sai);
      }

      SpreadsheetApp.flush();
      
      // Guardar en Historico principal
      const filaActualizada = sheetOrigen.getRange(targetRow, 1, 1, 38).getValues()[0];
      let hojaHistorico = ssOrigen.getSheetByName("Historico_Gestiones");
      if (!hojaHistorico) hojaHistorico = ssOrigen.insertSheet("Historico_Gestiones");
      hojaHistorico.appendRow(filaActualizada);

    } else {
      // 🔵 RUTA B: NO ESTÁ EN PRINCIPAL, BUSCAMOS EN EXCEL DE REESTUDIOS/UAR
      const idsReest = sheetReestudios.getRange('B:B').getValues(); 
      let targetRowReest = -1;
      for (let i = 1; i < idsReest.length; i++) {
        if (String(idsReest[i][0]).trim() === String(data.solicitudId).trim()) {
          targetRowReest = i + 1;
          break;
        }
      }

      if (targetRowReest === -1) {
        return { success: false, message: `Solicitud ${data.solicitudId} no encontrada en ninguna base central.` };
      }

      // Guardar en hoja secundaria (Reestudios)
      const fechaRadicacionR = sheetReestudios.getRange(targetRowReest, 1).getValue();
      const fechaAsignacionR = sheetReestudios.getRange(targetRowReest, 9).getValue();

      let tiempoTotalResolucion = 0;
      let tiempoGestion = 0;

      if (fechaRadicacionR instanceof Date && !isNaN(fechaRadicacionR.getTime())) {
        tiempoTotalResolucion = Number(calcularMinutosHabilesSLA(fechaRadicacionR, ahora, ssOrigen).toFixed(2));
      }
      if (fechaAsignacionR instanceof Date && !isNaN(fechaAsignacionR.getTime())) {
        tiempoGestion = Number(((ahora.getTime() - fechaAsignacionR.getTime()) / 60000).toFixed(2));
      }

      // Guardar resultados en columnas J hasta P
      sheetReestudios.getRange(targetRowReest, 10, 1, 7).setValues([[
        ahora,                              // J: fechaFinGestion
        estado_q,                           // K: estadoGestion
        motivo_aplazamiento,                // L: motivoAplazamiento
        motivo_negacion,                    // M: motivoNegacion
        data.comentarios_gestion || "",     // N: observaciones
        tiempoTotalResolucion,              // O: tiempo total
        tiempoGestion                       // P: tiempo gestión
      ]]);
      sheetReestudios.getRange(targetRowReest, 10).setNumberFormat("dd/mm/yyyy HH:mm:ss");

      SpreadsheetApp.flush();

      // Guardar en Historico Secundario
      const filaActualizadaR = sheetReestudios.getRange(targetRowReest, 1, 1, 16).getValues()[0];
      let hojaHistoricoR = ssReestudios.getSheetByName("Historico_Gestiones");
      if (!hojaHistoricoR) {
        hojaHistoricoR = ssReestudios.insertSheet("Historico_Gestiones");
      }
      hojaHistoricoR.appendRow(filaActualizadaR);
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

  // Despertar al Motor Omnicanal para traer el siguiente caso
  let mensajeAsignacion = "";
  if (disparaAsignacion) {
    try {
      const resultadoAuto = RequestLead(); 
      mensajeAsignacion = "\n📌 " + (resultadoAuto || "Asignación procesada.");
    } catch (err) {
      mensajeAsignacion = "\n Error en auto-asignación: " + err.toString();
    }
  }

  return { 
    success: true, 
    message: "Gestión guardada exitosamente" + mensajeAdicional + mensajeAsignacion, 
    usuario: usuarioActual 
  };
}
function getEmailUsuario() {
  return Session.getActiveUser().getEmail();
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
      const ahora = new Date();
      const fechaHoraISO = ahora.toISOString();
      const fechaDiaHoy = Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd");

      const celdaHistorial = hojaUsuarios.getRange(filaEncontrada, columnaHistorial + 1);
      let historial = [];
      try {
        const contenido = celdaHistorial.getValue();
        historial = contenido ? JSON.parse(contenido) : [];
      } catch (e) { historial = []; }

      if (historial.length > 0) {
        const primerInicio = historial[0].inicio;
        const fechaPrimerDia = primerInicio.includes("T")
          ? primerInicio.split("T")[0]
          : Utilities.formatDate(new Date(primerInicio), TIMEZONE, "yyyy-MM-dd");

        if (fechaPrimerDia !== fechaDiaHoy && hojaHistorico) {
          historial.forEach(reg => {
            const diaRegistro = reg.inicio.includes("T")
              ? reg.inicio.split("T")[0]
              : reg.inicio.split(' ')[0];
            hojaHistorico.appendRow([
              diaRegistro,
              correoAnalista,
              reg.estado,
              reg.inicio,
              reg.fin,
              reg.duracion_min
            ]);
          });
          historial = [];
        }
      }

      if (historial.length > 0) {
        let ultimo = historial[historial.length - 1];
        ultimo.fin = fechaHoraISO;
        const inicioMs = new Date(ultimo.inicio).getTime();
        if (!isNaN(inicioMs)) {
          ultimo.duracion_min = Math.round((ahora.getTime() - inicioMs) / 60000);
        } else {
          ultimo.duracion_min = 0;
        }
      }

      historial.push({
        estado: estadoTextoPlano,
        inicio: fechaHoraISO,
        fin: "EN CURSO",
        duracion_min: 0
      });

      hojaUsuarios.getRange(filaEncontrada, columnaEstado + 1).setValue(estadoTextoPlano);
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
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID)
  const hojaUsuarios = ss.getSheetByName("Usuarios")
  const hojaHistorico = ss.getSheetByName("Historico_Estados")

  const datos = hojaUsuarios.getDataRange().getValues()
  const columnaCorreo = 2;
  const columnaEstado = 5;
  const columnaHistorial = 11;

  let filaEncontrada = -1;
  for(let i = 1; i <datos.length;i++){
    if(datos[i][columnaCorreo]&&datos[i][columnaCorreo].toString().toLowerCase().trim() === correoAsesor.toLowerCase().trim()){
      filaEncontrada = i + 1;
      break;
    }
  }
  if(filaEncontrada !== -1){
    const estadoTextoPlano = nuevoEstado.toUpperCase();
    const ahora = new Date();
    const fechaHoraISO = ahora.toISOString();
    const celdaHistorial = hojaUsuarios.getRange(filaEncontrada, columnaHistorial +1);

    let historial =[]
    try{
      const contenido = celdaHistorial.getValue();
      historial = contenido ? JSON.parse(contenido) : [];
    } catch(e){
      historial = [];
    }
    if(historial.length > 0){
      let ultimo = historial[historial.length - 1];
      ultimo.fin = fechaHoraISO;
      const inicioMs = new Date(ultimo.inicio).getTime();
      if (!isNaN(inicioMs)) {
        ultimo.duracion_min = Math.round((ahora.getTime() - inicioMs) / 60000);
      } else {
        ultimo.duracion_min = 0;
      }
    }
    historial.push({
      estado: estadoTextoPlano,
      inicio: fechaHoraISO,
      fin: "EN CURSO",
      duracion_min: 0,
      modificadoPor: "ADMIN"
    })
    celdaHistorial.setValue(JSON.stringify(historial))
    return true
  }
  return false
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
    const resultado = RequestLead(); 
    SpreadsheetApp.flush(); 

    if (resultado && !resultado.includes("No hay") && !resultado.includes("error")) {
      return { success: true, nueva: true, message: resultado };
    }
    return { success: false, nueva: false, message: resultado };
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
  // Retorna minutos decimales (ej: 7.10 = 7 min 6 seg)
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
    Logger.log("Aviso: No se pudo procesar la hoja de Festivos, se calculará sin ellos: " + e.message);
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


/**
 * Obtiene el conteo consolidado de gestiones del día actual para el analista logueado.
 * Consulta TODAS las fuentes de datos (solicitud principal + reestudios) para que
 * el analista vea su actividad total sin importar en qué vista esté.
 *
 * @returns {Object} { hoyTotal, detalle: { digital, reestudios } }
 */
function obtenerGestionesHoyCruzadas() {
  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, "dd/MM/yyyy");

    let conteoDigital = 0;
    let conteoReestudios = 0;

    // 1. Contar gestiones hoy en hoja "solicitud" (estudio digital + biometria)
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hojaSol = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
    if (hojaSol) {
      const lastRow = hojaSol.getLastRow();
      if (lastRow > 1) {
        const dataSol = hojaSol.getRange(2, 28, lastRow - 1, 2).getDisplayValues(); // cols AB(28) y AC(29)
        for (let i = 0; i < dataSol.length; i++) {
          const asignado = String(dataSol[i][0]).trim().toLowerCase();
          const fechaFin = String(dataSol[i][1]).trim();
          if (asignado === userEmail && fechaFin.includes(hoyStr)) {
            conteoDigital++;
          }
        }
      }
    }

    // 2. Contar gestiones hoy en hoja de reestudios "ORIGEN"
    try {
      const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
      const hojaReest = ssReestudios.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
      if (hojaReest) {
        const lastRowR = hojaReest.getLastRow();
        if (lastRowR > 1) {
          const dataReest = hojaReest.getRange(2, 7, lastRowR - 1, 4).getDisplayValues(); // cols G(7), H(8), I(9), J(10)
          for (let i = 0; i < dataReest.length; i++) {
            const asignado = String(dataReest[i][0]).trim().toLowerCase();
            const fechaFin = String(dataReest[i][3]).trim(); // col J = fechaFinGestion
            if (asignado === userEmail && fechaFin.includes(hoyStr)) {
              conteoReestudios++;
            }
          }
        }
      }
    } catch (e) {
      Logger.log("Aviso: No se pudo leer hoja de reestudios para conteo cruzado: " + e.message);
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
