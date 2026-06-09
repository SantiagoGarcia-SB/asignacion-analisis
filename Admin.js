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

function obtenerDatosDashboard() {
  verificarPermisoAdmin();
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hojaSol = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  const dataSol = hojaSol.getDataRange().getDisplayValues();
  const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, "dd/MM/yyyy");

  let res = {
    sinAsignar: 0,
    aplazadas: 0,
    gestionadasHoyEquipo: 0,
    activos: 0,
    inactivos: 0,
    listaGestion: [],
    listaSinAsignar: [],
    listaAplazadas: [],
    listaGestionadasHoy: []
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

    // Determinar tipo visual
    let tipoVisual = 'digital';
    if (estado.includes('BIOMETRIA')) tipoVisual = 'biometria';
    else if (tipo.includes('INDUCCI') || tipo === 'IND') tipoVisual = 'induccion';

    // Contar gestionadas hoy por todo el equipo
    if (fechaFin !== "" && fechaFin.includes(hoyStr)) {
      res.gestionadasHoyEquipo++;
      res.listaGestionadasHoy.push({ id: solicitudId, poliza: poliza, estado: estado, asesor: asesorNombre, tipo: tipoVisual });
    }

    // Sin asignar = no tiene analista y no tiene fecha fin
    if (asignado === "" && fechaFin === "") {
      res.sinAsignar++;
      if (res.listaSinAsignar.length < 50) {
        res.listaSinAsignar.push({ id: solicitudId, poliza: poliza, tipo: tipoVisual });
      }
    }

    // Aplazadas = tiene estado APLAZADA y no tiene fecha fin
    if (estado.includes("APLAZ") && fechaFin === "") {
      res.aplazadas++;
      res.listaAplazadas.push({ id: solicitudId, poliza: poliza, asesor: asesorNombre, tipo: tipoVisual });
    }

    // Lista de monitoreo: solicitudes asignadas sin terminar
    if (!estado.includes("APROB") && !estado.includes("NEGAD") && asignado !== "" && fechaFin === "") {
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
  return res;
}

function admin_obtenerUsuariosGestion() {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName("Usuarios");
    if (!hoja) return [];
    
    const datos = hoja.getDataRange().getValues();
    datos.shift(); 

    // Count current load per analyst from solicitudes
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

        if (typeof admin_sincronizarEstado === "function") {
          admin_sincronizarEstado(correoBuscado, estadoUpper);
        }

        return { success: true, message: "Usuario actualizado correctamente" };
      }
    }
    return { success: false, message: "No se encontró el usuario" };
  } catch (e) { return { success: false, message: e.message }; }
}

function admin_limpiarDuplicadosSistema() {
  verificarPermisoAdmin();
  const idsHojas = [TARGET_SOLICITUDES_SS_ID, ID_SS_APROBADAS, ID_SS_NEGADAS];
  
  idsHojas.forEach(id => {
    try {
      const ss = SpreadsheetApp.openById(id);
      const sheet = ss.getSheets()[0];
      const data = sheet.getDataRange().getValues();
      if (data.length < 2) return;
      
      const idsVistos = new Set();
      for (let i = data.length - 1; i >= 1; i--) {
        const idSolicitud = String(data[i][0]).trim();
        if (idsVistos.has(idSolicitud) || idSolicitud === "") {
          sheet.deleteRow(i + 1);
        } else {
          idsVistos.add(idSolicitud);
        }
      }
    } catch(e) { console.warn("Error limpiando ID: " + id); }
  });
  return "Limpieza completa finalizada.";
}

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

function getHojaSolicitudes_() {
  return SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID).getSheetByName(SHEET_NAME_SOLICITUDES);
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


// ===================================================================
// MÓDULO DE MÉTRICAS - Backend
// ===================================================================

/**
 * Convierte string "dd/MM/yyyy" a objeto Date.
 * Retorna null si el formato es inválido.
 */
function parseFechaDDMMYYYY(fechaStr) {
  if (!fechaStr || typeof fechaStr !== 'string') return null;
  const partes = fechaStr.trim().split('/');
  if (partes.length !== 3) return null;
  const dia = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10) - 1;
  const anio = parseInt(partes[2], 10);
  if (isNaN(dia) || isNaN(mes) || isNaN(anio)) return null;
  const fecha = new Date(anio, mes, dia);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes || fecha.getDate() !== dia) return null;
  return fecha;
}

/**
 * Obtiene todas las métricas agregadas para el rango de fechas dado.
 * @param {string} fechaDesde - "dd/MM/yyyy"
 * @param {string} fechaHasta - "dd/MM/yyyy"
 * @returns {Object} Objeto con métricas consolidadas
 */
function obtenerDatosMetricas(fechaDesde, fechaHasta) {
  verificarPermisoAdmin();

  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hoja = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  if (!hoja) throw new Error("No se pudo acceder a la hoja de solicitudes.");

  const data = hoja.getDataRange().getDisplayValues();
  
  const desde = parseFechaDDMMYYYY(fechaDesde);
  const hasta = parseFechaDDMMYYYY(fechaHasta);
  if (!desde || !hasta) throw new Error("Formato de fecha inválido. Use dd/MM/yyyy.");

  // Normalizar 'hasta' al final del día
  hasta.setHours(23, 59, 59, 999);

  // Acumuladores
  let totalGestionadas = 0;
  let sumaTiempos = 0;
  let countTiempos = 0;
  let aprobadas = 0;
  let negadas = 0;
  let aplazadas = 0;
  let fueraDeSLA = 0;

  const produccionMap = {};  // fecha -> cantidad
  const slaMap = {};         // fecha -> { dentro, fuera }
  const analistaMap = {};    // nombre -> { total, aprobadas, negadas, aplazadas, sumaTiempo, countTiempo, fueraSLA }

  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const fechaGestionStr = String(fila[33] || "").trim();  // col AH (índice 33)
    
    if (!fechaGestionStr) continue;
    
    const fechaGestion = parseFechaDDMMYYYY(fechaGestionStr);
    if (!fechaGestion) continue;

    // Filtrar por rango
    if (fechaGestion < desde || fechaGestion > hasta) continue;

    totalGestionadas++;

    const estado = String(fila[16] || "").toUpperCase().trim();
    const nombre = String(fila[30] || "Sin nombre").trim();
    const tiempoGestionRaw = String(fila[34] || "").trim();
    const slaHorasRaw = String(fila[29] || "").trim();

    // Estado
    if (estado.includes("APROB")) aprobadas++;
    else if (estado.includes("NEGAD") || estado.includes("RECHAZ")) negadas++;
    else if (estado.includes("APLAZ")) aplazadas++;

    // Tiempo de gestión
    const tiempoGestion = parseFloat(tiempoGestionRaw);
    if (!isNaN(tiempoGestion) && tiempoGestion >= 0) {
      sumaTiempos += tiempoGestion;
      countTiempos++;
    }

    // SLA
    const slaHoras = parseFloat(slaHorasRaw.replace(',', '.'));
    if (!isNaN(slaHoras)) {
      if (slaHoras > 4) fueraDeSLA++;
    }

    // Producción diaria
    if (!produccionMap[fechaGestionStr]) produccionMap[fechaGestionStr] = 0;
    produccionMap[fechaGestionStr]++;

    // SLA diario
    if (!slaMap[fechaGestionStr]) slaMap[fechaGestionStr] = { dentroSLA: 0, fueraSLA: 0 };
    if (!isNaN(slaHoras)) {
      if (slaHoras <= 4) slaMap[fechaGestionStr].dentroSLA++;
      else slaMap[fechaGestionStr].fueraSLA++;
    }

    // Por analista
    if (!analistaMap[nombre]) {
      analistaMap[nombre] = { total: 0, aprobadas: 0, negadas: 0, aplazadas: 0, sumaTiempo: 0, countTiempo: 0, fueraSLA: 0 };
    }
    const a = analistaMap[nombre];
    a.total++;
    if (estado.includes("APROB")) a.aprobadas++;
    else if (estado.includes("NEGAD") || estado.includes("RECHAZ")) a.negadas++;
    else if (estado.includes("APLAZ")) a.aplazadas++;
    if (!isNaN(tiempoGestion) && tiempoGestion >= 0) { a.sumaTiempo += tiempoGestion; a.countTiempo++; }
    if (!isNaN(slaHoras) && slaHoras > 4) a.fueraSLA++;
  }

  // Calcular métricas finales
  const tiempoPromedioMinutos = countTiempos > 0 ? Math.round((sumaTiempos / countTiempos) * 10) / 10 : 0;
  const tasaAprobacion = totalGestionadas > 0 ? Math.round((aprobadas / totalGestionadas) * 1000) / 10 : 0;

  // Producción diaria ordenada cronológicamente
  const produccionDiaria = Object.keys(produccionMap)
    .sort((a, b) => parseFechaDDMMYYYY(a) - parseFechaDDMMYYYY(b))
    .map(fecha => ({ fecha: fecha, cantidad: produccionMap[fecha] }));

  // SLA diario ordenado cronológicamente
  const slaDiario = Object.keys(slaMap)
    .sort((a, b) => parseFechaDDMMYYYY(a) - parseFechaDDMMYYYY(b))
    .map(fecha => ({ fecha: fecha, dentroSLA: slaMap[fecha].dentroSLA, fueraSLA: slaMap[fecha].fueraSLA }));

  // Por analista ordenado por total desc
  const porAnalista = Object.keys(analistaMap)
    .map(nombre => {
      const a = analistaMap[nombre];
      return {
        nombre: nombre,
        total: a.total,
        aprobadas: a.aprobadas,
        negadas: a.negadas,
        aplazadas: a.aplazadas,
        tiempoPromedio: a.countTiempo > 0 ? Math.round((a.sumaTiempo / a.countTiempo) * 10) / 10 : 0,
        fueraSLA: a.fueraSLA
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    totalGestionadas: totalGestionadas,
    tiempoPromedioMinutos: tiempoPromedioMinutos,
    tasaAprobacion: tasaAprobacion,
    fueraDeSLA: fueraDeSLA,
    produccionDiaria: produccionDiaria,
    distribucionEstados: { aprobadas: aprobadas, negadas: negadas, aplazadas: aplazadas },
    porAnalista: porAnalista,
    slaDiario: slaDiario
  };
}
