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

/**
 * Obtiene los cupos efectivos para un analista (individuales si existen, o globales del equipo).
 * @param {string} userEmail - Email del analista
 * @param {string} equipo - 'DIGITAL', 'BIOMETRIA' o 'REESTUDIOS'
 * @param {Array} [dataUsuarios] - Datos de la hoja Usuarios (opcional, para evitar releerla)
 * @returns {Object} { nueva, reestudio, induccion, biometria, uar }
 */
function obtenerCuposEfectivos(userEmail, equipo, dataUsuarios) {
  // Intentar leer cupos individuales de col Y (índice 24)
  if (dataUsuarios) {
    for (let i = 1; i < dataUsuarios.length; i++) {
      if (String(dataUsuarios[i][2]).toLowerCase().trim() === userEmail) {
        // getDataRange puede no incluir col Y si está vacía; verificar longitud
        if (dataUsuarios[i].length > 24) {
          const cuposRaw = String(dataUsuarios[i][24] || '').trim();
          if (cuposRaw && cuposRaw.startsWith('{')) {
            try {
              const c = JSON.parse(cuposRaw);
              return {
                nueva: parseInt(c.nuevas) || 0,
                reestudio: parseInt(c.reestudios) || 0,
                induccion: parseInt(c.inducciones) || 0,
                biometria: parseInt(c.biometria) || 0,
                nuevaUar: parseInt(c.nuevaUar) || 0,
                deudorUar: parseInt(c.deudorUar) || 0
              };
            } catch (e) { /* JSON inválido, usar globales */ }
          }
        }
        break;
      }
    }
  }

  // Fallback: cupos globales del equipo
  const props2 = PropertiesService.getScriptProperties();
  const prefix = 'CUPOS_' + equipo.toUpperCase() + '_';
  function getP(key, def) {
    const v = props2.getProperty(key);
    if (v === null || v === '') return def;
    const p = parseInt(v, 10);
    return isNaN(p) ? def : p;
  }

  const defaults = {
    DIGITAL: { nueva: 70, reestudio: 10, induccion: 8, biometria: 0, nuevaUar: 2, deudorUar: 2 },
    BIOMETRIA: { nueva: 0, reestudio: 0, induccion: 0, biometria: 8, nuevaUar: 0, deudorUar: 0 },
    REESTUDIOS: { nueva: 0, reestudio: 10, induccion: 2, biometria: 0, nuevaUar: 3, deudorUar: 2 }
  };
  const def = defaults[equipo.toUpperCase()] || defaults.DIGITAL;

  return {
    nueva: getP(prefix + 'NUEVAS', def.nueva),
    reestudio: getP(prefix + 'REESTUDIOS', def.reestudio),
    induccion: getP(prefix + 'INDUCCIONES', def.induccion),
    biometria: getP(prefix + 'BIOMETRIA', def.biometria),
    nuevaUar: getP(prefix + 'NUEVA_UAR', def.nuevaUar),
    deudorUar: getP(prefix + 'DEUDOR_UAR', def.deudorUar)
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
          .setTitle('Gestión de Solicitudes - Analista')
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

  // Casos del analista: leer de Historico_Gestiones (nuevos) + solicitud (legados sin migrar)
  const misFilasPendientes = [];

  // Convierte fila de Historico_Gestiones (37 cols) a formato solicitud (37 cols)
  // para que el frontend no necesite saber de la estructura del Historico
  function histToSol(h) {
    const s = new Array(37).fill('');
    for (let i = 0; i <= 21; i++) s[i] = h[i]; // cols 1-22 iguales
    s[23] = h[22]; s[24] = h[23];               // biometría, observaciones
    s[26] = h[24]; s[27] = h[25]; s[28] = h[26]; // fechaAsig, asignacion, fechaFin
    s[30] = h[27]; s[31] = h[28]; s[32] = h[29]; s[33] = h[30]; // Nombre, motivos, fechaGest
    s[35] = h[31]; s[36] = h[32];               // Poliza, Canal
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
      misFilasPendientes.push([...fila, cat]);
    }
  }

  // 1. Historico_Gestiones — casos ya movidos al asignar (nueva lógica)
  try {
    const hojaHist = ss.getSheetByName("Historico_Gestiones");
    if (hojaHist && hojaHist.getLastRow() > 1) {
      const dataH = hojaHist.getRange(2, 1, hojaHist.getLastRow() - 1, Math.max(numCols, 37)).getDisplayValues();
      agregarDesdeRegistros(dataH, 'HISTORICO');
    }
  } catch(e) { Logger.log("getTableData Historico: " + e.message); }

  // 2. solicitud — casos legados aún no migrados
  agregarDesdeRegistros(registros, 'SOLICITUD');

  // 3. Reestudios: Historico_Gestiones (nueva lógica) + ORIGEN (legados)
  try {
    const ssReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);

    function adaptarReestudio(row) {
      const asignado  = String(row[6]).trim().toLowerCase();
      const fechaFinR = String(row[9]).trim();
      const fechaAsigR = String(row[8]).trim();
      if (asignado !== userEmail) return;
      if (fechaFinR !== "") {
        if (fechaFinR.includes(hoyStr)) gestionadasHoy++;
        gestionadasTotal++;
        return;
      }
      if (fechaAsigR === "") return;
      const tipoProc = String(row[4]).trim();
      const claseR   = String(row[5]).trim();
      let fa = new Array(numCols).fill("");
      fa[0]  = String(row[1]).trim();
      fa[1]  = String(row[3]).trim();
      fa[2]  = String(row[2]).trim();
      fa[16] = "__REESTUDIO__";
      fa[17] = String(row[0]).trim();
      fa[20] = tipoProc || claseR;
      fa[26] = fechaAsigR;
      fa[27] = asignado;
      fa[28] = "";
      fa[30] = String(row[7]).trim();
      fa.push("");
      misFilasPendientes.push(fa);
    }

    const hojaHistR = ssReest.getSheetByName("Historico_Gestiones");
    if (hojaHistR && hojaHistR.getLastRow() > 1) {
      hojaHistR.getRange(2, 1, hojaHistR.getLastRow() - 1, 18).getDisplayValues().forEach(adaptarReestudio);
    }
    const hojaOrigen = ssReest.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (hojaOrigen && hojaOrigen.getLastRow() > 1) {
      hojaOrigen.getRange(2, 1, hojaOrigen.getLastRow() - 1, 14).getDisplayValues().forEach(adaptarReestudio);
    }
  } catch(e) { Logger.log("getTableData Reestudios: " + e.message); }

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

  const lock = LockService.getUserLock();
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

    const ID_HOJA_REESTUDIOS_API = '1slgykTgjoAtCd6KmlG7Lqiuw-nM1hSguQbi0XqeLu7U';
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS_API);

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
      const fechaRadicacion = filaBase[17]; // col 18
      const fechaAsignacion = filaBase[24]; // col 25
      const emailAnalista   = String(filaBase[25] || usuarioActual).toLowerCase().trim(); // col 26
      let valorClaseActual  = filaBase[20]; // col 21

      if (data.tipoSolicitudActual === 'biometria') valorClaseActual = 'BIOMETRIA';
      else if (data.tipoSolicitudActual === 'induccion') valorClaseActual = 'INDUCCION';

      const tRadCola = _parseFechaGAS(data.fecha_radicacion_sai) || _parseFechaGAS(fechaRadicacion);
      const tiempos = calcularTiemposCaso(
        tRadCola,
        _parseFechaGAS(fechaAsignacion),
        ahora,
        emailAnalista
      );

      hojaHistorico.getRange(targetRow, 17).setValue(estado_q);
      hojaHistorico.getRange(targetRow, 21).setValue(valorClaseActual);
      hojaHistorico.getRange(targetRow, 23).setValue(data.biometria || '');
      hojaHistorico.getRange(targetRow, 24).setValue(data.comentarios_gestion || '');
      hojaHistorico.getRange(targetRow, 27).setValue(ahora).setNumberFormat("dd/mm/yyyy HH:mm:ss");
      hojaHistorico.getRange(targetRow, 29, 1, 2).setValues([[motivo_aplazamiento, motivo_negacion]]);
      hojaHistorico.getRange(targetRow, 31).setValue(fechaSoloDia);

      SpreadsheetApp.flush();

      hojaHistorico.getRange(targetRow, 34).setValue(data.fecha_radicacion_sai || '');
      hojaHistorico.getRange(targetRow, 35, 1, 3).setValues([[tiempos.minutos_cola, tiempos.minutos_gestion, tiempos.minutos_general]]);
      hojaHistorico.getRange(targetRow, 35, 1, 3).setNumberFormat("0.00");

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

    // Auto-detectar equipo si no se pasa, basado en especialidad
    let equipoFinal = equipo;
    if (!equipoFinal) {
      const usuario = dataUsuarios.find(u => String(u[2]).toLowerCase().trim() === userEmail);
      if (usuario) {
        const esp = String(usuario[4]).toUpperCase().trim();
        if (esp.includes("REESTUDIO")) equipoFinal = 'REESTUDIOS';
        else if (esp.includes("BIOMETRIA")) equipoFinal = 'BIOMETRIA';
        else equipoFinal = 'DIGITAL';
      } else {
        equipoFinal = 'DIGITAL';
      }
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

    let conteoHoy = { nueva: 0, reestudio: 0, induccion: 0, biometria: 0, nuevaUar: 0, deudorUar: 0 };

    // Contar desde hoja solicitudes (Digital + Biometría + Inducciones)
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
          const claseNorm = String(dataSol[i][20]).toUpperCase().trim();
          const estadoNorm = String(dataSol[i][16]).toUpperCase().trim();
          let tipo = 'nueva';
          if (estadoNorm.includes("BIOMETRIA") || claseNorm.includes("BIOMETRIA")) tipo = 'biometria';
          else if (claseNorm.includes("INDUCCI") || claseNorm === "IND") tipo = 'induccion';
          conteoHoy[tipo]++;
        }
      }
    }

    // También contar desde Historico_Gestiones (casos asignados movidos al asignar)
    try {
      const hojaHistV = ss.getSheetByName("Historico_Gestiones");
      if (hojaHistV && hojaHistV.getLastRow() > 1) {
        const dataHistV = hojaHistV.getRange(2, 1, hojaHistV.getLastRow() - 1, 37).getValues();
        for (let i = 0; i < dataHistV.length; i++) {
          const asignado = String(dataHistV[i][25]).trim().toLowerCase(); // hist col 26
          if (asignado !== userEmail) continue;
          const fechaAsig = dataHistV[i][24]; // hist col 25
          const fechaFin  = dataHistV[i][26]; // hist col 27
          if (!esHoy(fechaAsig) && !esHoy(fechaFin)) continue;
          const claseNorm  = String(dataHistV[i][20]).toUpperCase().trim();
          const estadoNorm = String(dataHistV[i][16]).toUpperCase().trim();
          let tipo = 'nueva';
          if (estadoNorm.includes("BIOMETRIA") || claseNorm.includes("BIOMETRIA")) tipo = 'biometria';
          else if (claseNorm.includes("INDUCCI") || claseNorm === "IND") tipo = 'induccion';
          conteoHoy[tipo]++;
        }
      }
    } catch(e) {}

    // Contar desde hoja reestudios (Reestudios + Nueva UAR + Deudor UAR)
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
            const tipoP = String(dataReest[i][4]).toUpperCase().trim();
            let tipo = 'reestudio';
            if (origenR === "CORREO" && tipoP === "NUEVA") tipo = 'nuevaUar';
            else if (origenR === "CORREO" && tipoP === "ADICIONAL") tipo = 'deudorUar';
            conteoHoy[tipo]++;
          }
        }
      }
    } catch(e) {}

    // Comparar con cupos
    const resumen = [
      { tipo: 'Nuevas', usado: conteoHoy.nueva, limite: cupos.nueva },
      { tipo: 'Reestudios', usado: conteoHoy.reestudio, limite: cupos.reestudio },
      { tipo: 'Inducciones', usado: conteoHoy.induccion, limite: cupos.induccion },
      { tipo: 'Biometría', usado: conteoHoy.biometria, limite: cupos.biometria },
      { tipo: 'Nueva UAR', usado: conteoHoy.nuevaUar, limite: cupos.nuevaUar },
      { tipo: 'Deudor UAR', usado: conteoHoy.deudorUar, limite: cupos.deudorUar }
    ];

    // Verificar si todos los cupos con límite > 0 están llenos
    const cuposActivos = resumen.filter(r => r.limite > 0);
    const todosCumplidos = cuposActivos.length > 0 && cuposActivos.every(r => r.usado >= r.limite);
    const totalUsado = resumen.reduce((s, r) => s + r.usado, 0);
    const totalLimite = resumen.reduce((s, r) => s + r.limite, 0);

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
  const lock = LockService.getUserLock();
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
      const fechaDiaHoy = Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd");
      const fechaHoraActual = Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd HH:mm:ss");

      // Cerrar el registro anterior en Historico_Estados (buscar la última fila de este analista con fin "EN CURSO")
      if (hojaHistorico) {
        const lastRowH = hojaHistorico.getLastRow();
        if (lastRowH > 1) {
          // Buscar de abajo hacia arriba para eficiencia
          const rango = Math.min(lastRowH - 1, 200); // revisar últimas 200 filas
          const dataH = hojaHistorico.getRange(lastRowH - rango + 1, 1, rango, 6).getDisplayValues();
          for (let j = dataH.length - 1; j >= 0; j--) {
            const correoH = String(dataH[j][1]).trim().toLowerCase();
            const finH = String(dataH[j][4]).trim();
            if (correoH === correoAnalista.toLowerCase().trim() && finH === "EN CURSO") {
              const filaH = (lastRowH - rango + 1) + j;
              const inicioH = String(dataH[j][3]).trim();
              // Calcular duración en minutos
              let duracion = 0;
              try {
                const inicioDate = new Date(inicioH.replace(' ', 'T'));
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
    const fechaDiaHoy = Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd");
    const fechaHoraActual = Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd HH:mm:ss");

    // Cerrar registro anterior en Historico_Estados
    if (hojaHistorico) {
      const lastRowH = hojaHistorico.getLastRow();
      if (lastRowH > 1) {
        const rango = Math.min(lastRowH - 1, 200);
        const dataH = hojaHistorico.getRange(lastRowH - rango + 1, 1, rango, 6).getDisplayValues();
        for (let j = dataH.length - 1; j >= 0; j--) {
          const correoH = String(dataH[j][1]).trim().toLowerCase();
          const finH = String(dataH[j][4]).trim();
          if (correoH === correoAsesor.toLowerCase().trim() && finH === "EN CURSO") {
            const filaH = (lastRowH - rango + 1) + j;
            const inicioH = String(dataH[j][3]).trim();
            let duracion = 0;
            try {
              const inicioDate = new Date(inicioH.replace(' ', 'T'));
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

      // Escribir nuevo registro
      hojaHistorico.appendRow([
        fechaDiaHoy,
        correoAsesor,
        estadoTextoPlano,
        fechaHoraActual,
        "EN CURSO",
        0
      ]);
    }

    // Actualizar estado en Usuarios
    hojaUsuarios.getRange(filaEncontrada, columnaEstado + 1).setValue(estadoTextoPlano);

    // Actualizar JSON local para UI
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
    return true;
  }
  return false;
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
        const dataHDet = hojaHistDet.getRange(2, 1, hojaHistDet.getLastRow() - 1, 27).getDisplayValues();
        for (let i = 0; i < dataHDet.length; i++) {
          const asignado = String(dataHDet[i][25]).trim().toLowerCase(); // col 26
          const fechaFin = String(dataHDet[i][26]).trim();               // col 27
          if (asignado === userEmail && fechaFin.includes(hoyStr)) {
            const partes = fechaFin.split(' ');
            const clH = String(dataHDet[i][20]).toUpperCase().trim();
            listado.push({
              solicitud: String(dataHDet[i][0]).trim(),
              tipo: clH.includes('BIOMETRIA') ? 'Biometría'
                  : (clH.includes('INDUCCI') || clH === 'IND') ? 'Inducción'
                  : 'Digital',
              horaGestion: partes.length > 1 ? partes[1].substring(0, 5) : '',
              fuente: 'DIGITAL'
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
        const data = hojaHistReest.getRange(2, 1, hojaHistReest.getLastRow() - 1, 10).getDisplayValues();
        for (let i = 0; i < data.length; i++) {
          const asignado = String(data[i][6]).trim().toLowerCase(); // col G
          const fechaFin = String(data[i][9]).trim();               // col J
          if (asignado === userEmail && fechaFin.includes(hoyStr)) {
            const partes = fechaFin.split(' ');
            listado.push({
              solicitud: String(data[i][1]).trim(),
              tipo: String(data[i][4]).trim() || 'Reestudio',
              horaGestion: partes.length > 1 ? partes[1].substring(0, 5) : '',
              fuente: 'REESTUDIO'
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

// ===================================================================
// PERMISOS E INCAPACIDADES
// ===================================================================

function _obtenerHojaPermisos_(ss) {
  let hoja = ss.getSheetByName('Permisos_Incapacidades');
  if (!hoja) {
    hoja = ss.insertSheet('Permisos_Incapacidades');
    hoja.appendRow(['ID','Fecha_Solicitud','Correo_Analista','Nombre_Analista','Tipo_Novedad',
      'Fecha_Inicio','Fecha_Fin','Observacion_Analista','Estado','Fecha_Revision','Correo_Admin','Observacion_Admin']);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function solicitarPermiso(tipoNovedad, fechaInicio, fechaFin, observacion) {
  const lock = LockService.getUserLock();
  try { lock.waitLock(10000); } catch(e) { return { success: false, message: 'Servidor ocupado, reintenta.' }; }
  try {
    const correoAnalista = Session.getActiveUser().getEmail().toLowerCase().trim();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const datosU = ss.getSheetByName('Usuarios').getDataRange().getValues();
    let nombreAnalista = correoAnalista;
    const admins = [];
    for (let i = 1; i < datosU.length; i++) {
      const correoFila = String(datosU[i][2]).toLowerCase().trim();
      if (correoFila === correoAnalista) nombreAnalista = String(datosU[i][1]).trim();
      if (String(datosU[i][23]).toUpperCase().trim() === 'ADMIN' && correoFila) admins.push(correoFila);
    }
    const ahora = new Date();
    const id = 'PI-' + Utilities.formatDate(ahora, TIMEZONE, 'yyyyMMddHHmmss');
    const fechaSolicitud = Utilities.formatDate(ahora, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    _obtenerHojaPermisos_(ss).appendRow([
      id, fechaSolicitud, correoAnalista, nombreAnalista,
      tipoNovedad.toUpperCase(), fechaInicio, fechaFin, observacion || '',
      'PENDIENTE', '', '', ''
    ]);
    SpreadsheetApp.flush();
    if (admins.length > 0) {
      const asunto = '[Permiso Pendiente] ' + tipoNovedad + ' — ' + nombreAnalista;
      const cuerpo = 'El analista ' + nombreAnalista + ' (' + correoAnalista + ') solicita:\n\n'
        + 'Tipo: ' + tipoNovedad + '\nFecha inicio: ' + fechaInicio + '\nFecha fin: ' + fechaFin
        + '\nObservación: ' + (observacion || '—')
        + '\n\nIngresa al Panel Admin → Novedades → Solicitudes de Permisos para aprobar o rechazar.';
      try { MailApp.sendEmail(admins.join(','), asunto, cuerpo); } catch(eM) { Logger.log('Email error: ' + eM.message); }
    }
    return { success: true, message: 'Solicitud enviada. El administrador revisará tu permiso.' };
  } catch(e) {
    return { success: false, message: 'Error: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function verificarPermisoVigenteHoy() {
  try {
    const correoAnalista = Session.getActiveUser().getEmail().toLowerCase().trim();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName('Permisos_Incapacidades');
    if (!hoja || hoja.getLastRow() < 2) return { tienePermiso: false };
    const hoy = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
    const data = hoja.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]).toLowerCase().trim() !== correoAnalista) continue;
      if (String(data[i][8]).toUpperCase() !== 'APROBADO') continue;
      const fi = String(data[i][5]).trim();
      const ff = String(data[i][6]).trim();
      if (hoy >= fi && hoy <= ff) {
        return { tienePermiso: true, tipo: String(data[i][4]).trim(), fechaInicio: fi, fechaFin: ff };
      }
    }
    return { tienePermiso: false };
  } catch(e) {
    return { tienePermiso: false };
  }
}
