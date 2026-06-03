/**
 * ====================================================
 * MÓDULO UAR - Backend para VistaUar.html
 * ====================================================
 * Funciones: getUarData, autoAsignarUar, saveUarGestion
 * 
 * Columnas de la hoja "solicitud" (0-indexed):
 *  0: solicitud (ID)
 *  1: póliza
 *  4: nombreInquilino
 *  6: teléfonoInquilino
 *  9: canon
 * 11: direcciónInmueble
 * 13: ciudadInmueble
 * 14: nombreAsesor
 * 15: correoAsesor
 * 16: estadoGeneral
 * 21: uar ("Si"/"No")
 * 26: fecha asignación
 * 27: asignacion (email analista)
 * 28: fecha fin gestión
 * 30: Nombre analista
 * 31: Motivo de aplazamiento
 * 32: Motivo de negación
 * 33: fecha de gestion
 * 34: Tiempo de gestion
 */

/**
 * Obtiene las solicitudes UAR asignadas al analista actual.
 * Retorna la lista de pendientes y estadísticas.
 */
function getUarData() {
  const correoUsuario = Session.getActiveUser().getEmail().toLowerCase().trim();
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hoja = ss.getSheetByName("solicitud");

  if (!hoja) return { solicitudes: [], stats: { hoy: 0, pendientes: 0 } };

  const lastRow = hoja.getLastRow();
  if (lastRow < 2) return { solicitudes: [], stats: { hoy: 0, pendientes: 0 } };

  const data = hoja.getRange(2, 1, lastRow - 1, 37).getDisplayValues();

  // Obtener mapa de inmobiliarias desde score
  const hojaScore = ss.getSheetByName("score");
  const mapaInmobiliarias = new Map();
  if (hojaScore) {
    const dataScore = hojaScore.getDataRange().getValues();
    for (let i = 1; i < dataScore.length; i++) {
      let pol = String(dataScore[i][0]).trim();
      let inmo = String(dataScore[i][3] || "").trim();
      if (pol && inmo) {
        mapaInmobiliarias.set(pol, inmo);
        let polNorm = pol.split(/[.,]/)[0].replace(/\D/g, '').replace(/^0+/, '');
        if (polNorm) mapaInmobiliarias.set(polNorm, inmo);
      }
    }
  }

  const hoyStr = Utilities.formatDate(new Date(), "GMT-5", "dd/MM/yyyy");
  let conteoHoy = 0;
  let listaPendientes = [];

  for (let i = 0; i < data.length; i++) {
    const fila = data[i];
    const asignadoA = String(fila[27]).trim().toLowerCase();
    const esUar = String(fila[21]).trim().toUpperCase() === "SI";
    const fechaAsignacion = String(fila[26]).trim();
    const fechaFinGestion = String(fila[28]).trim();

    if (asignadoA !== correoUsuario || !esUar) continue;

    // Contar gestionadas hoy
    if (fechaFinGestion !== "") {
      if (fechaFinGestion.includes(hoyStr)) {
        conteoHoy++;
      }
      continue; // Ya gestionada, no es pendiente
    }

    // Es pendiente si tiene fecha de asignación pero no fecha fin
    if (fechaAsignacion === "") continue;

    // Obtener inmobiliaria desde score
    let poliza = String(fila[1]).trim();
    let polNorm = poliza.split(/[.,]/)[0].replace(/\D/g, '').replace(/^0+/, '');
    let inmobiliaria = mapaInmobiliarias.get(poliza) || mapaInmobiliarias.get(polNorm) || "";

    listaPendientes.push({
      idSolicitud: String(fila[0]).trim(),
      poliza: poliza,
      inmobiliaria: inmobiliaria,
      ciudad: String(fila[13]).trim(),
      direccion: String(fila[11]).trim(),
      nombreInquilino: String(fila[4]).trim(),
      canon: String(fila[9]).trim(),
      celular: String(fila[6]).trim(),
      fechaAsignacion: fechaAsignacion,
      filaReal: i + 2 // Fila real en la hoja (1-indexed + header)
    });
  }

  return {
    solicitudes: listaPendientes,
    stats: { hoy: conteoHoy, pendientes: listaPendientes.length }
  };
}

/**
 * Auto-asigna solicitudes UAR pendientes al analista actual.
 * Solo asigna si el usuario está ACTIVO y tiene capacidad.
 */
function autoAsignarUar() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "Sistema ocupado, reintenta en unos segundos." };
  }

  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hojaUsuarios = ss.getSheetByName("Usuarios");
    const dataUsuarios = hojaUsuarios.getDataRange().getValues();
    const usuario = dataUsuarios.find(u => String(u[2]).trim().toLowerCase() === userEmail);

    if (!usuario) return { success: false, message: "Usuario no registrado." };
    if (String(usuario[5]).toUpperCase().trim() !== "ACTIVO") return { success: false, message: "Usuario no activo." };

    const capTotal = parseInt(usuario[6]) || 0;
    const nombreAnalista = String(usuario[1]).trim();
    if (capTotal <= 0) return { success: false, message: "Capacidad en 0." };

    const hojaSolicitudes = ss.getSheetByName("solicitud");
    const lastRow = hojaSolicitudes.getLastRow();
    if (lastRow < 2) return { success: false, message: "No hay solicitudes." };

    const data = hojaSolicitudes.getRange(2, 1, lastRow - 1, 37).getValues();

    // Contar carga actual del analista (UAR pendientes asignadas)
    let cargaActual = 0;
    for (const fila of data) {
      if (
        String(fila[27]).trim().toLowerCase() === userEmail &&
        String(fila[21]).trim().toUpperCase() === "SI" &&
        String(fila[26]).trim() !== "" &&
        String(fila[28]).trim() === ""
      ) {
        cargaActual++;
      }
    }

    let cupoDisponible = capTotal - cargaActual;
    if (cupoDisponible <= 0) return { success: false, message: "Capacidad llena." };

    // Buscar solicitudes UAR sin asignar
    let asignadas = 0;
    const fechaAsignacion = new Date();

    for (let i = 0; i < data.length; i++) {
      if (cupoDisponible <= 0) break;

      const fila = data[i];
      const esUar = String(fila[21]).trim().toUpperCase() === "SI";
      const fechaAsig = String(fila[26]).trim();
      const estadoGeneral = String(fila[16]).trim().toUpperCase();

      // Solo solicitudes UAR, sin asignar, no cerradas
      if (!esUar) continue;
      if (fechaAsig !== "") continue; // Ya asignada
      if (estadoGeneral.includes("APROB") || estadoGeneral.includes("NEGAD") || estadoGeneral.includes("RECHAZ")) continue;

      // Asignar
      const filaReal = i + 2;
      hojaSolicitudes.getRange(filaReal, 27, 1, 5).setValues([
        [fechaAsignacion, userEmail, "", "", nombreAnalista]
      ]);

      asignadas++;
      cupoDisponible--;
    }

    if (asignadas === 0) {
      return { success: false, nueva: false, message: "No hay solicitudes UAR pendientes." };
    }

    SpreadsheetApp.flush();
    return { success: true, nueva: true, message: `Se te asignaron ${asignadas} solicitud(es) UAR.` };

  } catch (error) {
    return { success: false, message: "Error interno: " + error.toString() };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/**
 * Guarda la gestión UAR realizada por el analista.
 * @param {Object} datos - { idSolicitud, resultado, motivo, observaciones }
 */
function saveUarGestion(datos) {
  if (!datos || !datos.idSolicitud) {
    return { success: false, error: "ID de solicitud no proporcionado." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, error: "Sistema ocupado, reintenta." };
  }

  try {
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName("solicitud");
    const lastRow = hoja.getLastRow();

    if (lastRow < 2) return { success: false, error: "No hay datos en la hoja." };

    // Buscar la fila por ID de solicitud (columna A, índice 0)
    const ids = hoja.getRange(2, 1, lastRow - 1, 1).getValues();
    let filaReal = -1;

    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === String(datos.idSolicitud).trim()) {
        filaReal = i + 2;
        break;
      }
    }

    if (filaReal === -1) {
      return { success: false, error: "Solicitud " + datos.idSolicitud + " no encontrada." };
    }

    const ahora = new Date();
    const fechaTexto = Utilities.formatDate(ahora, "GMT-5", "dd/MM/yyyy HH:mm:ss");
    const fechaSoloDia = Utilities.formatDate(ahora, "GMT-5", "dd/MM/yyyy");

    // Calcular tiempo de gestión
    const fechaAsignacion = hoja.getRange(filaReal, 27).getValue();
    let minutosDeGestion = 0;
    if (fechaAsignacion instanceof Date && !isNaN(fechaAsignacion.getTime())) {
      minutosDeGestion = Math.round((ahora.getTime() - fechaAsignacion.getTime()) / (1000 * 60));
    }

    // Construir observación completa
    let observacionFinal = "UAR: " + datos.resultado;
    if (datos.motivo) observacionFinal += " | Motivo: " + datos.motivo;
    if (datos.observaciones) observacionFinal += " | Obs: " + datos.observaciones;

    // Determinar estado general basado en resultado
    let nuevoEstadoGeneral = "";
    if (datos.resultado === "APROBADO") {
      nuevoEstadoGeneral = "APROBADO";
    } else if (datos.resultado === "NEGADO") {
      nuevoEstadoGeneral = "RECHAZADO";
    } else if (datos.resultado === "DEVUELTO A MESA") {
      nuevoEstadoGeneral = "DEVUELTO A MESA";
    }

    // Guardar en la hoja
    if (nuevoEstadoGeneral) {
      hoja.getRange(filaReal, 17).setValue(nuevoEstadoGeneral); // estadoGeneral (col Q)
    }
    hoja.getRange(filaReal, 25).setValue(observacionFinal); // observaciones (col Y)
    hoja.getRange(filaReal, 29).setValue(ahora).setNumberFormat("dd/mm/yyyy HH:mm:ss"); // fecha fin gestión (col AC)
    hoja.getRange(filaReal, 32).setValue(datos.motivo || ""); // Motivo aplazamiento (col AF)
    hoja.getRange(filaReal, 34).setValue(fechaSoloDia); // fecha de gestion (col AH)
    hoja.getRange(filaReal, 35).setValue(minutosDeGestion); // Tiempo de gestion (col AI)

    SpreadsheetApp.flush();

    // Intentar auto-asignar una nueva
    let mensajeExtra = "";
    try {
      const autoResult = autoAsignarUar();
      if (autoResult.success && autoResult.nueva) {
        mensajeExtra = "\n📌 " + autoResult.message;
      }
    } catch (e) {}

    return { success: true, message: "Gestión UAR guardada correctamente." + mensajeExtra };

  } catch (error) {
    return { success: false, error: "Error al guardar: " + error.toString() };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}
