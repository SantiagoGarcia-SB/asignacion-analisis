/**
 * ====================================================
 * MÓDULO REESTUDIOS - Backend para VistaReestudios.html
 * ====================================================
 * Funciones: getReestudiosData, guardarGestionReestudio, getEmailUsuarioReestudios
 * 
 * El motor de asignación (RequestLeadReestudios) está en ModeloReestudios.js
 * 
 * Hoja fuente: "Solicitudes_Asignacion_Reestudios_UAR" en el spreadsheet ID_HOJA_REESTUDIOS
 * 
 * Columnas (1-indexed):
 *  A(1): fechaRadicacion
 *  B(2): solicitud
 *  C(3): linkDrive
 *  D(4): origen (VICTORIA / CORREO)
 *  E(5): tipoDeProceso
 *  F(6): claseDeSolicitud
 *  G(7): analistaAsignado (email)
 *  H(8): nombreAnalista
 *  I(9): fechaAsignacion
 *  J(10): fechaFinGestion
 *  K(11): estadoGestion
 *  L(12): motivoAplazamiento
 *  M(13): motivoNegacion
 *  N(14): observaciones
 */

const ID_HOJA_REESTUDIOS = '1slgykTgjoAtCd6KmlG7Lqiuw-nM1hSguQbi0XqeLu7U';
const NOMBRE_PESTANA_REESTUDIOS = 'ORIGEN';

/**
 * Obtiene los casos de reestudios asignados al analista actual.
 * Retorna pendientes + estadísticas.
 */
function getReestudiosData() {
  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hoja = ssReestudios.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);

    if (!hoja) return { success: false, message: "No se encontró la hoja de reestudios." };

    const lastRow = hoja.getLastRow();
    if (lastRow < 2) return { success: true, solicitudes: [], stats: { hoy: 0, pendientes: 0 } };

    const data = hoja.getRange(2, 1, lastRow - 1, 14).getDisplayValues();
    const hoyStr = Utilities.formatDate(new Date(), "GMT-5", "dd/MM/yyyy");

    let conteoHoy = 0;
    let listaPendientes = [];

    for (let i = 0; i < data.length; i++) {
      const fila = data[i];
      const asignado = String(fila[6]).trim().toLowerCase(); // col G
      const fechaFin = String(fila[9]).trim(); // col J
      const fechaAsignacion = String(fila[8]).trim(); // col I

      if (asignado !== userEmail) continue;

      // Contar gestionadas hoy
      if (fechaFin !== "") {
        if (fechaFin.includes(hoyStr)) {
          conteoHoy++;
        }
        continue; // Ya gestionada
      }

      // Es pendiente si tiene fecha de asignación pero no fecha fin
      if (fechaAsignacion === "") continue;

      listaPendientes.push({
        filaReal: i + 2,
        solicitud: String(fila[1]).trim(),        // col B
        linkDrive: String(fila[2]).trim(),         // col C
        origen: String(fila[3]).trim(),            // col D
        tipoProceso: String(fila[4]).trim(),       // col E
        claseSolicitud: String(fila[5]).trim(),    // col F
        fechaAsignacion: fechaAsignacion,          // col I
        fechaRadicacion: String(fila[0]).trim()    // col A
      });
    }

    return {
      success: true,
      solicitudes: listaPendientes,
      stats: { hoy: conteoHoy, pendientes: listaPendientes.length }
    };

  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

/**
 * Guarda la gestión de un caso de reestudio.
 * Después de guardar, intenta auto-asignar un nuevo caso (via ModeloReestudios.js).
 * 
 * @param {Object} datos - { filaReal, estadoGestion, motivoAplazamiento, motivoNegacion, observaciones }
 */
function guardarGestionReestudio(datos) {
  if (!datos || !datos.filaReal) {
    return { success: false, message: "Fila de destino no proporcionada." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "Sistema ocupado, reintenta en unos segundos." };
  }

  try {
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hoja = ssReestudios.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    const targetRow = parseInt(datos.filaReal);

    if (!hoja) return { success: false, message: "No se encontró la hoja." };

    // Verificar que no haya sido gestionada ya
    const fechaFinExistente = String(hoja.getRange(targetRow, 10).getDisplayValue()).trim();
    if (fechaFinExistente !== "") {
      return { success: false, message: "Este caso ya fue gestionado." };
    }

    const ahora = new Date();

    // Leer fechaRadicacion (col A) y fechaAsignacion (col I) para cálculos de tiempo
    const fechaRadicacionRaw = hoja.getRange(targetRow, 1).getValue();
    const fechaAsignacionRaw = hoja.getRange(targetRow, 9).getValue();

    // Calcular tiempos
    let tiempoTotalResolucion = "";
    let tiempoGestion = "";

    if (fechaRadicacionRaw instanceof Date && !isNaN(fechaRadicacionRaw.getTime())) {
      const diffMs = ahora.getTime() - fechaRadicacionRaw.getTime();
      tiempoTotalResolucion = Math.round(diffMs / 60000); // en minutos
    }
    if (fechaAsignacionRaw instanceof Date && !isNaN(fechaAsignacionRaw.getTime())) {
      const diffMs = ahora.getTime() - fechaAsignacionRaw.getTime();
      tiempoGestion = Math.round(diffMs / 60000); // en minutos
    }

    // Escribir gestión en columnas J-N
    hoja.getRange(targetRow, 10, 1, 5).setValues([[
      ahora,                              // J: fechaFinGestion
      datos.estadoGestion || "",          // K: estadoGestion
      datos.motivoAplazamiento || "",     // L: motivoAplazamiento
      datos.motivoNegacion || "",         // M: motivoNegacion
      datos.observaciones || ""           // N: observaciones
    ]]);

    // Escribir tiempos en columnas O-P
    hoja.getRange(targetRow, 15, 1, 2).setValues([[
      tiempoTotalResolucion,              // O: tiempo total resolución (radicación → fin)
      tiempoGestion                       // P: tiempo de gestión (asignación → fin)
    ]]);

    // Formatear fecha
    hoja.getRange(targetRow, 10).setNumberFormat("dd/mm/yyyy HH:mm:ss");

    SpreadsheetApp.flush();

    // Intentar auto-asignar un nuevo caso (función en ModeloReestudios.js)
    let mensajeExtra = "";
    try {
      const autoResult = RequestLeadReestudios();
      if (autoResult.success && autoResult.nueva) {
        mensajeExtra = "\n📌 " + autoResult.message;
      }
    } catch (e) {
      // No bloquear si falla la auto-asignación
    }

    return { success: true, message: "Gestión guardada correctamente." + mensajeExtra };

  } catch (error) {
    return { success: false, message: "Error al guardar: " + error.toString() };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/**
 * Retorna el email del usuario actual.
 */
function getEmailUsuarioReestudios() {
  return Session.getActiveUser().getEmail();
}
