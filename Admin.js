/**
 * Verifica si el usuario activo tiene rol de administrador en la base de datos.
 * @throws {Error} Si el usuario no tiene permisos o no existe.
 */
function verificarPermisoAdmin() {
  const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hojaUser = ss.getSheetByName("Usuarios");
  const dataUser = hojaUser.getDataRange().getValues();
  const usuario = dataUser.find(f => String(f[2]).toLowerCase().trim() === userEmail);
  
  if (!usuario || String(usuario[23]).toUpperCase().trim() !== "ADMIN") {
    throw new Error("Acceso Denegado: Se requieren permisos de Administrador.");
  }
}

/**
 * Obtiene el email del usuario logueado.
 * @returns {string} Email del usuario.
 */
function getEmailUsuario() {
  return Session.getActiveUser().getEmail();
}

/**
 * Genera y sirve la interfaz del Panel de Control Principal.
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('AdminPanel')
    .evaluate()
    .setTitle('Panel de Control - Administración')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Recopila los datos operativos en tiempo real para el Dashboard principal.
 * @returns {Object} Datos consolidados del dashboard.
 */
function obtenerDatosDashboard() {
  verificarPermisoAdmin();
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hojaSol = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  const dataSol = hojaSol.getDataRange().getDisplayValues();
  const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, "dd/MM/yyyy");
  
  let res = {
    sinAsignar: 0,
    gestionadasHoyEquipo: 0,
    activos: 0,
    inactivos: 0,
    listaGestion: [],
    listaSinAsignar: [],
    listaGestionadasHoy: [],
    desglose: {
      sinAsignar: { digital: 0, biometria: 0, induccion: 0, uar: 0, reestudios: 0 },
      enGestion: { digital: 0, biometria: 0, induccion: 0, uar: 0, reestudios: 0 },
      gestionadasHoy: { digital: 0, biometria: 0, induccion: 0, uar: 0, reestudios: 0 }
    },
    reestudios: {
      sinAsignar: 0,
      pendientes: 0,
      gestionadasHoy: 0,
      listaGestionadasHoy: [],
      listaPendientes: [],
      listaSinAsignar: []
    }
  };
  
  const hojaUser = ss.getSheetByName("Usuarios");
  const dataUser = hojaUser.getDataRange().getValues();
  for (let j = 1; j < dataUser.length; j++) {
    const estadoUser = String(dataUser[j][5] || "").toUpperCase().trim();
    if (estadoUser === "ACTIVO" || estadoUser === "DISPONIBLE") {
      res.activos++;
    } else {
      res.inactivos++;
    }
  }
  
  for (let i = 1; i < dataSol.length; i++) {
    const estado = String(dataSol[i][16] || "").toUpperCase();
    const asignado = String(dataSol[i][27] || "").trim();
    const fechaFin = String(dataSol[i][28] || "").trim();
    const tipo = String(dataSol[i][20] || "").toUpperCase();
    const solicitudId = String(dataSol[i][0] || "").trim();
    const poliza = String(dataSol[i][1] || "");
    const asesorNombre = String(dataSol[i][30] || "N/A");
    
    if (solicitudId === "") continue;
    let tipoVisual = 'digital';
    if (estado.includes('BIOMETRIA')) tipoVisual = 'biometria';
    else if (tipo === 'INDUCCION') tipoVisual = 'induccion';
    
    if (fechaFin !== "" && fechaFin.includes(hoyStr)) {
      res.gestionadasHoyEquipo++;
      res.desglose.gestionadasHoy[tipoVisual]++;
      res.listaGestionadasHoy.push({ id: solicitudId, poliza: poliza, estado: estado, asesor: asesorNombre, tipo: tipoVisual });
    }
    if (asignado === "" && fechaFin === "") {
      res.sinAsignar++;
      res.desglose.sinAsignar[tipoVisual]++;
      if (res.listaSinAsignar.length < 50) {
        res.listaSinAsignar.push({ id: solicitudId, poliza: poliza, tipo: tipoVisual });
      }
    }
    if (!estado.includes("APROB") && !estado.includes("NEGAD") && asignado !== "" && fechaFin === "") {
      res.desglose.enGestion[tipoVisual]++;
      res.listaGestion.push({
        id: solicitudId,
        poliza: poliza,
        estado: estado,
        correo: asignado,
        asesor: asesorNombre,
        tipo: tipoVisual
      });
    }
  }
  
  try {
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hojaReest = ssReestudios.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (hojaReest) {
      const lastRowR = hojaReest.getLastRow();
      if (lastRowR > 1) {
        const dataReest = hojaReest.getRange(2, 1, lastRowR - 1, 14).getDisplayValues();
        for (let i = 0; i < dataReest.length; i++) {
          const solicitud = String(dataReest[i][1]).trim();
          const origen = String(dataReest[i][3]).trim();
          const tipoProceso = String(dataReest[i][4]).trim();
          const analistaEmail = String(dataReest[i][6]).trim();
          const nombreAnalista = String(dataReest[i][7]).trim();
          const fechaAsignacion = String(dataReest[i][8]).trim();
          const fechaFin = String(dataReest[i][9]).trim();
          const estadoGestion = String(dataReest[i][10]).trim();
          
          if (solicitud === "") continue;
          const origenUpper = origen.toUpperCase();
          const tipoUpper = tipoProceso.toUpperCase();
          const esUarReest = origenUpper === "CORREO" && (tipoUpper.includes("ADICIONAL") || tipoUpper.includes("NUEVA"));
          const tipoDesglose = esUarReest ? 'uar' : 'reestudios';
          
          if (analistaEmail === "" && fechaFin === "") {
            res.reestudios.sinAsignar++;
            res.sinAsignar++;
            res.desglose.sinAsignar[tipoDesglose]++;
            if (res.reestudios.listaSinAsignar.length < 50) {
              res.reestudios.listaSinAsignar.push({ id: solicitud, origen: origen, tipo: tipoProceso });
            }
          }
          if (analistaEmail !== "" && fechaAsignacion !== "" && fechaFin === "") {
            res.reestudios.pendientes++;
            res.desglose.enGestion[tipoDesglose]++;
            if (res.reestudios.listaPendientes.length < 50) {
              res.reestudios.listaPendientes.push({ id: solicitud, origen: origen, tipo: tipoProceso, asesor: nombreAnalista });
            }
            res.listaGestion.push({
              id: solicitud,
              poliza: origen,
              estado: "EN GESTIÓN",
              correo: analistaEmail,
              asesor: nombreAnalista,
              tipo: 'reestudio'
            });
          }
          if (fechaFin !== "" && fechaFin.includes(hoyStr)) {
            res.reestudios.gestionadasHoy++;
            res.gestionadasHoyEquipo++;
            res.desglose.gestionadasHoy[tipoDesglose]++;
            res.reestudios.listaGestionadasHoy.push({ id: solicitud, origen: origen, estado: estadoGestion, asesor: nombreAnalista });
            res.listaGestionadasHoy.push({ id: solicitud, poliza: origen, estado: estadoGestion, asesor: nombreAnalista, tipo: 'reestudio' });
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Aviso: No se pudo leer hoja de reestudios para dashboard: " + e.message);
  }
  return res;
}

/**
 * Obtiene la lista de analistas y calcula sus cargas de trabajo operativas actuales.
 */
function admin_obtenerUsuariosGestion() {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName("Usuarios");
    if (!hoja) return [];
    
    const datos = hoja.getDataRange().getValues();
    datos.shift(); 
    const hojaSol = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
    const dataSol = hojaSol.getDataRange().getValues();
    const cargaPorAnalista = {};
    
    for (let i = 1; i < dataSol.length; i++) {
      const asignado = String(dataSol[i][27] || "").toLowerCase().trim();
      const fechaFin = String(dataSol[i][28] || "").trim();
      if (asignado && fechaFin === "") {
        cargaPorAnalista[asignado] = (cargaPorAnalista[asignado] || 0) + 1;
      }
    }
    try {
      const ssReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
      const hojaReest = ssReest.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
      if (hojaReest) {
        const lastRowR = hojaReest.getLastRow();
        if (lastRowR > 1) {
          const dataReest = hojaReest.getRange(2, 7, lastRowR - 1, 4).getValues();
          for (let i = 0; i < dataReest.length; i++) {
            const asignado = String(dataReest[i][0]).toLowerCase().trim();
            const fechaFin = String(dataReest[i][3]).trim();
            if (asignado && fechaFin === "") {
              cargaPorAnalista[asignado] = (cargaPorAnalista[asignado] || 0) + 1;
            }
          }
        }
      }
    } catch (e) {
      Logger.log("Aviso: No se pudo contar carga de reestudios: " + e.message);
    }
    
    return datos.map((fila, index) => {
      let horaInicio = "---";
      try {
        const historialRaw = fila[11]; 
        if (historialRaw && String(historialRaw).startsWith('[')) {
          const historial = JSON.parse(historialRaw);
          if (historial.length > 0) {
            const ultimo = historial[historial.length - 1];
            horaInicio = ultimo.inicio ? ultimo.inicio.split(" ")[1] : "---";
          }
        }
      } catch (e) { horaInicio = "Error"; }
      
      const correoLower = String(fila[2]).toLowerCase().trim();
      const cargaActual = cargaPorAnalista[correoLower] || 0;
      return {
        nombreComercial: fila[1], 
        correo: fila[2],          
        capacidad: fila[6],       
        especialidad: fila[4],    
        estado: fila[5],          
        desde: horaInicio,        
        cargaActual: cargaActual,
        pendientes: fila[7] || 0, 
        rol: fila[23] || "ASESOR", 
        row: index + 2
      };
    });
  } catch (e) { throw new Error(e.message); }
}

/**
 * Actualiza los parámetros de un analista desde la sección de CRUD.
 */
function admin_actualizarAnalista(correo, datos) {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName("Usuarios");
    const data = hoja.getRange("C:C").getValues(); 
    const correoBuscado = correo.toLowerCase().trim();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase().trim() === correoBuscado) {
        const fila = i + 1;
        const especialidadUpper = String(datos.especialidad || "").toUpperCase().trim();
        const estadoUpper = String(datos.estado || "").toUpperCase().trim();
        const rolUpper = String(datos.rol || "ASESOR").toUpperCase().trim();
        const capacidadNum = Number(datos.capacidad) || 0;
        
        hoja.getRange(fila, 5).setValue(especialidadUpper); 
        hoja.getRange(fila, 6).setValue(estadoUpper);      
        hoja.getRange(fila, 7).setValue(capacidadNum);      
        hoja.getRange(fila, 24).setValue(rolUpper);         
        return { success: true, message: "Usuario actualizado correctamente" };
      }
    }
    return { success: false, message: "No se encontró el usuario" };
  } catch (e) { return { success: false, message: e.message }; }
}

/**
 * Crea un nuevo analista en la hoja de control de usuarios.
 */
function admin_crearUsuario(datos) {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName("Usuarios");
    const dataExistente = hoja.getDataRange().getValues();
    let ultimoNumero = 0;
    if (dataExistente.length > 1) {
      const numeros = dataExistente.slice(1).map(f => Number(f[0])).filter(n => !isNaN(n));
      ultimoNumero = numeros.length > 0 ? Math.max(...numeros) : 0;
    }
    const nuevoNumeroAsesor = ultimoNumero + 1;
    let filaCompleta = new Array(24).fill(""); 
    filaCompleta[0]  = nuevoNumeroAsesor;
    filaCompleta[1]  = datos.nombre; 
    filaCompleta[2]  = String(datos.correo).toLowerCase().trim(); 
    filaCompleta[3]  = datos.documento;
    filaCompleta[4]  = String(datos.especialidad || "").toUpperCase().trim(); 
    filaCompleta[5]  = "INACTIVO"; 
    filaCompleta[23] = String(datos.rol || "ASESOR").toUpperCase().trim();   
    filaCompleta[6]  = Number(datos.capacidad) || 10; 
    
    hoja.appendRow(filaCompleta);
    hoja.getRange(hoja.getLastRow(), 7).setNumberFormat("0"); 
    return { success: true, message: "Usuario #" + nuevoNumeroAsesor + " creado." };
  } catch (e) { return { success: false, message: e.message }; }
}

/**
 * Remueve la asignación de una solicitud para que vuelva a estar disponible en cola.
 */
function desasignarSolicitud(idSolicitud){
  try{
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const sheet = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
    const data = sheet.getRange("A:A").getValues();
    for(let i = 1; i < data.length; i++){
      if(String(data[i][0]).trim() === String(idSolicitud).trim()){
        const fila = i + 1;
        sheet.getRange(fila, 27).clearContent();
        sheet.getRange(fila, 28).clearContent();
        sheet.getRange(fila, 31).clearContent();
        sheet.getRange(fila, 36).setValue("REASIGNADA");
        return { success: true, message: "Solicitud desasignada." };
      }
    }
    return { success: false, message: "No encontrada." };
  } catch(e){ return { success: false, message: e.message }; }
}

/**
 * Busca una solicitud por ID en las bases de datos para auditar en modal.
 */
function admin_buscarSolicitud(idSolicitud) {
  verificarPermisoAdmin();
  idSolicitud = String(idSolicitud || "").trim();
  if (!idSolicitud) return { success: false, message: "Ingresa un número de solicitud." };
  
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hojaSol = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  if (hojaSol) {
    const lastRow = hojaSol.getLastRow();
    if (lastRow > 1) {
      const colA = hojaSol.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      for (let i = 0; i < colA.length; i++) {
        if (String(colA[i][0]).trim() === idSolicitud) {
          const fila = hojaSol.getRange(i + 2, 1, 1, hojaSol.getLastColumn()).getDisplayValues()[0];
          return {
            success: true,
            fuente: "solicitud",
            datos: {
              solicitud: fila[0] || "",
              poliza: fila[1] || "",
              identificacion: fila[2] || "",
              tipoIdentificacion: fila[3] || "",
              nombreInquilino: fila[4] || "",
              correoInquilino: fila[5] || "",
              telefonoInquilino: fila[6] || "",
              ingresos: fila[7] || "",
              fechaExpedicion: fila[8] || "",
              canon: fila[9] || "",
              cuota: fila[10] || "",
              direccionInmueble: fila[11] || "",
              destinoInmueble: fila[12] || "",
              ciudadInmueble: fila[13] || "",
              nombreAsesor: fila[14] || "",
              correoAsesor: fila[15] || "",
              estadoGeneral: fila[16] || "",
              fechaRadicacion: fila[17] || "",
              fechaResultado: fila[18] || "",
              clase: fila[20] || "",
              uar: fila[21] || "",
              biometria: fila[23] || "",
              observaciones: fila[24] || "",
              fechaAsignacion: fila[26] || "",
              analistaAsignado: fila[27] || "",
              fechaFinGestion: fila[28] || "",
              tiempoResolucion: fila[29] || "",
              nombreAnalista: fila[30] || "",
              motivoAplazamiento: fila[31] || "",
              motivoNegacion: fila[32] || "",
              fechaGestion: fila[33] || "",
              tiempoGestion: fila[34] || "",
              canal: fila[36] || ""
            }
          };
        }
      }
    }
  }
  try {
    const ssReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hojaReest = ssReest.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (hojaReest) {
      const lastRowR = hojaReest.getLastRow();
      if (lastRowR > 1) {
        const colB = hojaReest.getRange(2, 2, lastRowR - 1, 1).getDisplayValues();
        for (let i = 0; i < colB.length; i++) {
          if (String(colB[i][0]).trim() === idSolicitud) {
            const fila = hojaReest.getRange(i + 2, 1, 1, 16).getDisplayValues()[0];
            return {
              success: true,
              fuente: "reestudios",
              datos: {
                fechaRadicacion: fila[0] || "",
                solicitud: fila[1] || "",
                linkDrive: fila[2] || "",
                origen: fila[3] || "",
                tipoDeProceso: fila[4] || "",
                claseDeSolicitud: fila[5] || "",
                analistaAsignado: fila[6] || "",
                nombreAnalista: fila[7] || "",
                fechaAsignacion: fila[8] || "",
                fechaFinGestion: fila[9] || "",
                estadoGestion: fila[10] || "",
                motivoAplazamiento: fila[11] || "",
                motivoNegacion: fila[12] || "",
                observaciones: fila[13] || "",
                tiempoResolucion: fila[14] || "",
                tiempoGestion: fila[15] || ""
              }
            };
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Error buscando en reestudios: " + e.message);
  }
  return { success: false, message: "Solicitud '" + idSolicitud + "' no encontrada." };
}

function admin_getPrioridadGlobal() {
  verificarPermisoAdmin();
  return PropertiesService.getScriptProperties().getProperty('GLOBAL_PRIORIDAD') || 'NUEVAS_PRIMERO';
}

function admin_setPrioridadGlobal(nuevaPrioridad) {
  verificarPermisoAdmin();
  PropertiesService.getScriptProperties().setProperty('GLOBAL_PRIORIDAD', nuevaPrioridad);
  return { success: true, message: "Prioridad actualizada a: " + nuevaPrioridad };
}

function admin_getCuotasGlobales() {
  verificarPermisoAdmin();
  const props = PropertiesService.getScriptProperties();
  return {
    nuevas: parseInt(props.getProperty('CUOTA_NUEVAS')) || 70,
    reestudios: parseInt(props.getProperty('CUOTA_REESTUDIOS')) || 10,
    inducciones: parseInt(props.getProperty('CUOTA_INDUCCIONES')) || 10,
    biometria: parseInt(props.getProperty('CUOTA_BIOMETRIA')) || 8,
    uar: parseInt(props.getProperty('CUOTA_UAR')) || 2
  };
}

function admin_setCuotasGlobales(cuotas) {
  verificarPermisoAdmin();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('CUOTA_NUEVAS', cuotas.nuevas.toString());
  props.setProperty('CUOTA_REESTUDIOS', cuotas.reestudios.toString());
  props.setProperty('CUOTA_INDUCCIONES', cuotas.inducciones.toString());
  props.setProperty('CUOTA_BIOMETRIA', cuotas.biometria.toString());
  props.setProperty('CUOTA_UAR', cuotas.uar.toString());
  return { success: true, message: "Las cuotas diarias por analista han sido actualizadas." };
}

function admin_desactivarTodosAsesores() {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName("Usuarios");
    const lastRow = hoja.getLastRow();
    if (lastRow < 2) return { success: false, message: "No hay usuarios." };
    const rangoEstados = hoja.getRange(2, 6, lastRow - 1, 1);
    const nuevosValores = new Array(lastRow - 1).fill(["INACTIVO"]);
    rangoEstados.setValues(nuevosValores);
    return { success: true, message: "⚠️ Sistema pausado: Todos los analistas han sido pasados a INACTIVO." };
  } catch (e) {
    return { success: false, message: e.message };
  }
}
