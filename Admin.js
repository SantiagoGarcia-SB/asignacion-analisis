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
      sinAsignar: { digital: 0, biometria: 0, induccion: 0, nuevaUar: 0, deudorUar: 0, reestudios: 0 },
      enGestion: { digital: 0, biometria: 0, induccion: 0, nuevaUar: 0, deudorUar: 0, reestudios: 0 },
      gestionadasHoy: { digital: 0, biometria: 0, induccion: 0, nuevaUar: 0, deudorUar: 0, reestudios: 0 }
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
          const tipoUpper = tipoProceso.toUpperCase();
          const claseUpper = String(dataReest[i][5]).toUpperCase().trim();
          let tipoDesglose = 'reestudios';
          if (tipoUpper.includes("NUEVA UAR") || claseUpper.includes("NUEVA UAR")) tipoDesglose = 'nuevaUar';
          else if (tipoUpper.includes("DEUDOR UAR") || claseUpper.includes("DEUDOR UAR")) tipoDesglose = 'deudorUar';
          
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
    let filaCompleta = new Array(25).fill(""); 
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
 * Remueve la asignación de una solicitud de REESTUDIOS para que vuelva a estar disponible en cola.
 * Limpia columnas G(7), H(8), I(9) en la hoja de reestudios.
 */
function desasignarSolicitudReestudio(idSolicitud) {
  try {
    verificarPermisoAdmin();
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hoja = ssReestudios.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (!hoja) return { success: false, message: "No se encontró la hoja de reestudios." };

    const lastRow = hoja.getLastRow();
    if (lastRow < 2) return { success: false, message: "No hay datos en la hoja." };

    const data = hoja.getRange(2, 2, lastRow - 1, 1).getValues(); // col B = solicitud

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(idSolicitud).trim()) {
        const fila = i + 2;
        // Limpiar: G(7)=analistaAsignado, H(8)=nombreAnalista, I(9)=fechaAsignacion
        hoja.getRange(fila, 7).clearContent();
        hoja.getRange(fila, 8).clearContent();
        hoja.getRange(fila, 9).clearContent();
        return { success: true, message: "Solicitud de reestudio desasignada correctamente." };
      }
    }
    return { success: false, message: "Solicitud no encontrada en reestudios." };
  } catch (e) {
    return { success: false, message: e.message };
  }
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

  function getVal(key, def) {
    const v = props.getProperty(key);
    if (v === null || v === '') return def;
    const p = parseInt(v, 10);
    return isNaN(p) ? def : p;
  }

  return {
    digital: {
      total: getVal('CUPOS_DIGITAL_TOTAL', 90),
      nuevas: getVal('CUPOS_DIGITAL_NUEVAS', 70),
      reestudios: getVal('CUPOS_DIGITAL_REESTUDIOS', 10),
      inducciones: getVal('CUPOS_DIGITAL_INDUCCIONES', 8),
      biometria: getVal('CUPOS_DIGITAL_BIOMETRIA', 0),
      nuevaUar: getVal('CUPOS_DIGITAL_NUEVA_UAR', 2),
      deudorUar: getVal('CUPOS_DIGITAL_DEUDOR_UAR', 2)
    },
    biometria: {
      total: getVal('CUPOS_BIOMETRIA_TOTAL', 10),
      nuevas: getVal('CUPOS_BIOMETRIA_NUEVAS', 0),
      reestudios: getVal('CUPOS_BIOMETRIA_REESTUDIOS', 0),
      inducciones: getVal('CUPOS_BIOMETRIA_INDUCCIONES', 0),
      biometria: getVal('CUPOS_BIOMETRIA_BIOMETRIA', 8),
      nuevaUar: getVal('CUPOS_BIOMETRIA_NUEVA_UAR', 0),
      deudorUar: getVal('CUPOS_BIOMETRIA_DEUDOR_UAR', 0)
    },
    reestudios: {
      total: getVal('CUPOS_REESTUDIOS_TOTAL', 15),
      nuevas: getVal('CUPOS_REESTUDIOS_NUEVAS', 0),
      reestudios: getVal('CUPOS_REESTUDIOS_REESTUDIOS', 10),
      inducciones: getVal('CUPOS_REESTUDIOS_INDUCCIONES', 2),
      biometria: getVal('CUPOS_REESTUDIOS_BIOMETRIA', 0),
      nuevaUar: getVal('CUPOS_REESTUDIOS_NUEVA_UAR', 3),
      deudorUar: getVal('CUPOS_REESTUDIOS_DEUDOR_UAR', 2)
    }
  };
}

function admin_setCuotasGlobales(cupos) {
  verificarPermisoAdmin();
  const props = PropertiesService.getScriptProperties();
  const equipos = ['digital', 'biometria', 'reestudios'];
  const campos = ['total', 'nuevas', 'reestudios', 'inducciones', 'biometria', 'nuevaUar', 'deudorUar'];

  for (const equipo of equipos) {
    if (!cupos[equipo]) return { success: false, message: "Datos incompletos para equipo: " + equipo };
    const data = cupos[equipo];
    const suma = (parseInt(data.nuevas) || 0) + (parseInt(data.reestudios) || 0) +
                 (parseInt(data.inducciones) || 0) + (parseInt(data.biometria) || 0) +
                 (parseInt(data.nuevaUar) || 0) + (parseInt(data.deudorUar) || 0);
    if (suma > (parseInt(data.total) || 0)) {
      return { success: false, message: "La suma de subcategorías excede el total en equipo: " + equipo + " (" + suma + " > " + data.total + ")" };
    }
    const keyMap = { total: 'TOTAL', nuevas: 'NUEVAS', reestudios: 'REESTUDIOS', inducciones: 'INDUCCIONES', biometria: 'BIOMETRIA', nuevaUar: 'NUEVA_UAR', deudorUar: 'DEUDOR_UAR' };
    for (const campo of campos) {
      const key = 'CUPOS_' + equipo.toUpperCase() + '_' + keyMap[campo];
      props.setProperty(key, String(parseInt(data[campo]) || 0));
    }
  }

  // Registrar en histórico
  const adminEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  const ahora = new Date();
  for (const equipo of equipos) {
    const d = cupos[equipo];
    registrarHistoricoCupos_('GENERAL', equipo.toUpperCase(), '', '', d, adminEmail, ahora);
  }

  return { success: true, message: "Cupos actualizados correctamente para los 3 equipos." };
}

/**
 * Busca analistas por nombre o email para el buscador de cupos individuales.
 */
function admin_buscarAnalistasCupos(termino) {
  verificarPermisoAdmin();
  termino = String(termino || '').toLowerCase().trim();
  if (termino.length < 2) return [];

  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hoja = ss.getSheetByName("Usuarios");
  const datos = hoja.getDataRange().getValues();
  const resultados = [];

  for (let i = 1; i < datos.length; i++) {
    const nombre = String(datos[i][1]).trim();
    const correo = String(datos[i][2]).trim().toLowerCase();
    const especialidad = String(datos[i][4]).trim();

    if (nombre.toLowerCase().includes(termino)) {
      resultados.push({
        nombre: nombre,
        correo: correo,
        especialidad: especialidad,
        capacidad: parseInt(datos[i][6]) || 0,
        row: i + 1
      });
    }
    if (resultados.length >= 10) break;
  }
  return resultados;
}

/**
 * Obtiene los cupos individuales de un analista.
 * Retorna null si usa los globales, o el objeto de cupos si tiene personalizados.
 */
function admin_getCuposIndividual(correoAnalista) {
  verificarPermisoAdmin();
  correoAnalista = String(correoAnalista).toLowerCase().trim();

  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hoja = ss.getSheetByName("Usuarios");
  const datos = hoja.getDataRange().getValues();

  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][2]).toLowerCase().trim() === correoAnalista) {
      const cuposRaw = String(datos[i][24] || '').trim();
      if (!cuposRaw || cuposRaw === '') {
        return { personalizado: false, cupos: null, especialidad: String(datos[i][4]).trim() };
      }
      try {
        const cupos = JSON.parse(cuposRaw);
        return { personalizado: true, cupos: cupos, especialidad: String(datos[i][4]).trim() };
      } catch (e) {
        return { personalizado: false, cupos: null, especialidad: String(datos[i][4]).trim() };
      }
    }
  }
  return { personalizado: false, cupos: null, especialidad: '' };
}

/**
 * Guarda cupos individuales para un analista específico.
 * Si cupos es null o vacío, elimina los cupos personalizados (vuelve a globales).
 */
function admin_setCuposIndividual(correoAnalista, cupos) {
  verificarPermisoAdmin();
  correoAnalista = String(correoAnalista).toLowerCase().trim();
  if (!correoAnalista) return { success: false, message: "Correo de analista requerido." };

  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hoja = ss.getSheetByName("Usuarios");
  const datos = hoja.getDataRange().getValues();

  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][2]).toLowerCase().trim() === correoAnalista) {
      const row = i + 1;
      const nombreAnalista = String(datos[i][1]).trim();
      const especialidad = String(datos[i][4]).trim();

      if (!cupos || cupos === null) {
        // Eliminar cupos personalizados
        hoja.getRange(row, 25).clearContent(); // col Y (index 24)
        const adminEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
        registrarHistoricoCupos_('INDIVIDUAL_RESET', especialidad, correoAnalista, nombreAnalista, { total: 0, nuevas: 0, reestudios: 0, inducciones: 0, biometria: 0, uar: 0 }, adminEmail, new Date());
        return { success: true, message: "Cupos personalizados eliminados. " + nombreAnalista + " usará los cupos globales del equipo." };
      }

      // Validar
      const suma = (parseInt(cupos.nuevas) || 0) + (parseInt(cupos.reestudios) || 0) +
                   (parseInt(cupos.inducciones) || 0) + (parseInt(cupos.biometria) || 0) +
                   (parseInt(cupos.nuevaUar) || 0) + (parseInt(cupos.deudorUar) || 0);
      if (suma > (parseInt(cupos.total) || 0)) {
        return { success: false, message: "La suma de subcategorías (" + suma + ") excede el total (" + cupos.total + ")." };
      }

      const cuposObj = {
        total: parseInt(cupos.total) || 0,
        nuevas: parseInt(cupos.nuevas) || 0,
        reestudios: parseInt(cupos.reestudios) || 0,
        inducciones: parseInt(cupos.inducciones) || 0,
        biometria: parseInt(cupos.biometria) || 0,
        nuevaUar: parseInt(cupos.nuevaUar) || 0,
        deudorUar: parseInt(cupos.deudorUar) || 0
      };

      hoja.getRange(row, 25).setValue(JSON.stringify(cuposObj)); // col Y (index 24)
      hoja.getRange(row, 7).setValue(cuposObj.total);           // col G = capTotal (leída por RequestLead)

      const adminEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
      registrarHistoricoCupos_('INDIVIDUAL', especialidad, correoAnalista, nombreAnalista, cuposObj, adminEmail, new Date());

      return { success: true, message: "Cupos personalizados guardados para " + nombreAnalista + "." };
    }
  }
  return { success: false, message: "Analista no encontrado." };
}

/**
 * Registra un cambio de cupos en la hoja historico_cupos.
 * Columnas: fecha | tipo | equipo | analista_email | analista_nombre | total | nuevas | reestudios | inducciones | biometria | uar | modificado_por
 * @private
 */
function registrarHistoricoCupos_(tipo, equipo, analistaEmail, analistaNombre, cupos, adminEmail, fecha) {
  try {
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    let hoja = ss.getSheetByName("historico_cupos");
    if (!hoja) {
      hoja = ss.insertSheet("historico_cupos");
      hoja.appendRow(['Fecha', 'Tipo', 'Equipo', 'Analista Email', 'Analista Nombre', 'Total', 'Nuevas', 'Reestudios', 'Inducciones', 'Biometría', 'Nueva UAR', 'Deudor UAR', 'Modificado Por']);
      hoja.getRange(1, 1, 1, 13).setFontWeight('bold');
    }
    hoja.appendRow([
      fecha,
      tipo,
      equipo,
      analistaEmail || '',
      analistaNombre || '',
      parseInt(cupos.total) || 0,
      parseInt(cupos.nuevas) || 0,
      parseInt(cupos.reestudios) || 0,
      parseInt(cupos.inducciones) || 0,
      parseInt(cupos.biometria) || 0,
      parseInt(cupos.nuevaUar) || 0,
      parseInt(cupos.deudorUar) || 0,
      adminEmail
    ]);
  } catch (e) {
    Logger.log("Error al registrar histórico de cupos: " + e.message);
  }
}

/**
 * Obtiene datos de novedades/estados para el panel de control.
 * Lee siempre de Historico_Estados + datos de solicitudes para horas de asignación/cierre.
 * @param {string} [fechaDesde] - Fecha inicio yyyy-MM-dd (default: hoy)
 * @param {string} [fechaHasta] - Fecha fin yyyy-MM-dd (default: igual a fechaDesde)
 */
function admin_obtenerNovedades(fechaDesde, fechaHasta) {
  verificarPermisoAdmin();
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);

  const hoy = new Date();
  const hoyStr = Utilities.formatDate(hoy, TIMEZONE, "yyyy-MM-dd");
  const desde = (fechaDesde && fechaDesde.trim() !== '') ? fechaDesde.trim() : hoyStr;
  const hasta = (fechaHasta && fechaHasta.trim() !== '') ? fechaHasta.trim() : desde;

  // Mapa de analistas
  const hojaUsuarios = ss.getSheetByName("Usuarios");
  const datosUsuarios = hojaUsuarios.getDataRange().getValues();
  const mapaAnalistas = {};
  for (let i = 1; i < datosUsuarios.length; i++) {
    const correo = String(datosUsuarios[i][2]).trim().toLowerCase();
    mapaAnalistas[correo] = {
      nombre: String(datosUsuarios[i][1]).trim(),
      especialidad: String(datosUsuarios[i][4]).trim(),
      estadoActual: String(datosUsuarios[i][5]).trim()
    };
  }

  // Leer Historico_Estados
  const hojaHist = ss.getSheetByName("Historico_Estados");
  if (!hojaHist) return { desde: desde, hasta: hasta, datos: [] };
  const lastRow = hojaHist.getLastRow();
  if (lastRow < 2) return { desde: desde, hasta: hasta, datos: [] };

  const dataHist = hojaHist.getRange(2, 1, lastRow - 1, 6).getDisplayValues();

  // Agrupar por analista
  const agrupado = {};
  for (let i = 0; i < dataHist.length; i++) {
    const fechaReg = String(dataHist[i][0]).trim();
    if (fechaReg < desde || fechaReg > hasta) continue;

    const correo = String(dataHist[i][1]).trim().toLowerCase();
    if (!agrupado[correo]) agrupado[correo] = { estados: {}, registros: [] };

    const estado = String(dataHist[i][2]).trim();
    const horaInicio = String(dataHist[i][3]).trim();
    const horaFin = String(dataHist[i][4]).trim();
    const duracion = parseInt(dataHist[i][5]) || 0;
    const enCurso = (horaFin === 'EN CURSO');

    let durReal = duracion;
    if (enCurso && horaInicio) {
      try {
        const inicioDate = new Date(horaInicio.replace(' ', 'T'));
        if (!isNaN(inicioDate.getTime())) durReal = Math.round((hoy.getTime() - inicioDate.getTime()) / 60000);
      } catch(e) {}
    }

    if (!agrupado[correo].estados[estado]) agrupado[correo].estados[estado] = 0;
    agrupado[correo].estados[estado] += durReal;

    agrupado[correo].registros.push({ estado: estado, horaInicio: horaInicio, horaFin: horaFin, duracion: durReal, enCurso: enCurso });
  }

  // Hora primera asignación y primer cierre (hoja solicitudes + reestudios + biometría)
  const horasSolicitudes = {};

  // Helper para registrar hora
  function registrarHora_(correo, tipo, fecha) {
    if (!correo || !(fecha instanceof Date) || isNaN(fecha.getTime())) return;
    if (!horasSolicitudes[correo]) horasSolicitudes[correo] = { primeraAsignacion: '', ultimoCierre: '' };
    const fechaStr = Utilities.formatDate(fecha, TIMEZONE, "yyyy-MM-dd");
    if (fechaStr < desde || fechaStr > hasta) return;
    const hora = Utilities.formatDate(fecha, TIMEZONE, "HH:mm");
    if (tipo === 'asig') {
      if (!horasSolicitudes[correo].primeraAsignacion || hora < horasSolicitudes[correo].primeraAsignacion) {
        horasSolicitudes[correo].primeraAsignacion = hora;
      }
    } else {
      if (!horasSolicitudes[correo].ultimoCierre || hora > horasSolicitudes[correo].ultimoCierre) {
        horasSolicitudes[correo].ultimoCierre = hora;
      }
    }
  }

  // 1. Hoja solicitudes (Digital): col AA=fechaAsig, AB=email, AC=fechaFin
  try {
    const hojaSol = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
    if (hojaSol) {
      const lastRowS = hojaSol.getLastRow();
      if (lastRowS > 1) {
        const dataSol = hojaSol.getRange(2, 27, lastRowS - 1, 3).getValues();
        for (let i = 0; i < dataSol.length; i++) {
          const asignado = String(dataSol[i][1]).trim().toLowerCase();
          if (!asignado) continue;
          registrarHora_(asignado, 'asig', dataSol[i][0]);
          registrarHora_(asignado, 'cierre', dataSol[i][2]);
        }
      }
    }
  } catch(e) { Logger.log("Error solicitudes novedades: " + e.message); }

  // 2. Hoja Reestudios (ORIGEN): col G(7)=email, col I(9)=fechaAsig, col J(10)=fechaFin
  try {
    const ssReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hojaReest = ssReest.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (hojaReest) {
      const lastRowR = hojaReest.getLastRow();
      if (lastRowR > 1) {
        const dataReest = hojaReest.getRange(2, 7, lastRowR - 1, 4).getValues(); // cols G, H, I, J
        for (let i = 0; i < dataReest.length; i++) {
          const asignado = String(dataReest[i][0]).trim().toLowerCase();
          if (!asignado) continue;
          registrarHora_(asignado, 'asig', dataReest[i][2]);   // col I = fechaAsignacion
          registrarHora_(asignado, 'cierre', dataReest[i][3]); // col J = fechaFinGestion
        }
      }
    }
  } catch(e) { Logger.log("Error reestudios novedades: " + e.message); }

  // 3. (Biometría se registra en la hoja solicitud al gestionar, ya cubierto en paso 1)

  // Construir resultado
  const resultados = [];
  for (const correo in agrupado) {
    const info = mapaAnalistas[correo] || { nombre: correo, especialidad: '', estadoActual: '' };
    const d = agrupado[correo];
    const horas = horasSolicitudes[correo] || { primeraAsignacion: '', ultimoCierre: '' };

    let tiempoEnEstadoActual = 0;
    if (d.registros.length > 0) {
      const ultimo = d.registros[d.registros.length - 1];
      if (ultimo.enCurso) tiempoEnEstadoActual = ultimo.duracion;
    }

    resultados.push({
      nombre: info.nombre,
      correo: correo,
      especialidad: info.especialidad,
      estadoActual: info.estadoActual,
      tiempoEnEstadoActual: tiempoEnEstadoActual,
      estados: d.estados,
      primeraAsignacion: horas.primeraAsignacion,
      ultimoCierre: horas.ultimoCierre
    });
  }

  // Incluir analistas sin actividad
  for (const correo in mapaAnalistas) {
    if (!agrupado[correo]) {
      resultados.push({
        nombre: mapaAnalistas[correo].nombre,
        correo: correo,
        especialidad: mapaAnalistas[correo].especialidad,
        estadoActual: mapaAnalistas[correo].estadoActual,
        tiempoEnEstadoActual: 0,
        estados: {},
        primeraAsignacion: '',
        ultimoCierre: ''
      });
    }
  }

  return { desde: desde, hasta: hasta, datos: resultados };
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
