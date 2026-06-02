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
  const dataSol = hojaSol.getDataRange().getValues();

  let totalPendientes = dataSol.length > 1 ? dataSol.length - 1 : 0;
  let res = {
    pendientesNube: totalPendientes, 
    activos: 0,
    inactivos: 0,
    listaGestion: []
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
    if (!estado.includes("APROB") && !estado.includes("NEGAD") && dataSol[i][0] !== "") {
      res.listaGestion.push({
        id: dataSol[i][0],
        poliza: dataSol[i][1],
        estado: estado,
        correo: dataSol[i][27] || "Sin analista",
        asesor: dataSol[i][30] || "N/A",
        estClase: estado.includes("NUBE") ? "bg-nube" : "bg-gestion"
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

      return {
        nombreComercial: fila[1], 
        correo: fila[2],          
        capacidad: fila[6],       
        especialidad: fila[4],    
        estado: fila[5],          
        desde: horaInicio,        
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