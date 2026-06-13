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
 * Obtiene todos los casos asignados al analista: reestudios + digitales/bio/inducción.
 * La fuente de cada caso queda en item.fuente = 'REESTUDIO' | 'DIGITAL'.
 */
function getReestudiosData() {
  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const hoyStr = Utilities.formatDate(new Date(), "GMT-5", "dd/MM/yyyy");

    let conteoHoy = 0;
    let listaPendientes = [];

    // --- Hoja de Reestudios ---
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hoja = ssReestudios.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (!hoja) return { success: false, message: "No se encontró la hoja de reestudios." };

    const lastRow = hoja.getLastRow();
    if (lastRow >= 2) {
      const data = hoja.getRange(2, 1, lastRow - 1, 14).getDisplayValues();
      for (let i = 0; i < data.length; i++) {
        const fila = data[i];
        const asignado = String(fila[6]).trim().toLowerCase();
        const fechaFin = String(fila[9]).trim();
        const fechaAsignacion = String(fila[8]).trim();

        if (asignado !== userEmail) continue;

        if (fechaFin !== "") {
          if (fechaFin.includes(hoyStr)) conteoHoy++;
          continue;
        }
        if (fechaAsignacion === "") continue;

        listaPendientes.push({
          fuente: 'REESTUDIO',
          filaReal: i + 2,
          solicitud: String(fila[1]).trim(),
          linkDrive: String(fila[2]).trim(),
          origen: String(fila[3]).trim(),
          tipoProceso: String(fila[4]).trim(),
          claseSolicitud: String(fila[5]).trim(),
          fechaAsignacion: fechaAsignacion,
          fechaRadicacion: String(fila[0]).trim()
        });
      }
    }

    // --- Hoja principal (digitales, biometría, inducciones) ---
    try {
      const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
      const hojaDigital = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
      if (hojaDigital) {
        const lastRowD = hojaDigital.getLastRow();
        if (lastRowD >= 2) {
          // Leemos hasta col AE (31 columnas) para cubrir nombreAnalista
          const dataD = hojaDigital.getRange(2, 1, lastRowD - 1, 31).getDisplayValues();
          for (let i = 0; i < dataD.length; i++) {
            const fila = dataD[i];
            const asignado = String(fila[27]).trim().toLowerCase(); // col AB
            const fechaAsig = String(fila[26]).trim();              // col AA
            const fechaFin  = String(fila[28]).trim();              // col AC

            if (asignado !== userEmail) continue;
            if (fechaAsig === "") continue;

            if (fechaFin !== "") {
              if (fechaFin.includes(hoyStr)) conteoHoy++;
              continue;
            }

            listaPendientes.push({
              fuente: 'DIGITAL',
              // Campos para la tabla
              origen: 'DIGITAL',
              tipoProceso: String(fila[20]).trim(),
              claseSolicitud: String(fila[4]).trim(),
              // Identificación y datos básicos
              solicitud: String(fila[0]).trim(),
              poliza: String(fila[1]).trim(),
              identificacion: String(fila[2]).trim(),
              tipoIdentificacion: String(fila[3]).trim(),
              nombreInquilino: String(fila[4]).trim(),
              correoInquilino: String(fila[5]).trim(),
              telefonoInquilino: String(fila[6]).trim(),
              ingresos: String(fila[7]).trim(),
              fechaExpedicion: String(fila[8]).trim(),
              canon: String(fila[9]).trim(),
              cuota: String(fila[10]).trim(),
              direccionInmueble: String(fila[11]).trim(),
              destinoInmueble: String(fila[12]).trim(),
              ciudadInmueble: String(fila[13]).trim(),
              nombreAsesor: String(fila[14]).trim(),
              correoAsesor: String(fila[15]).trim(),
              estadoGeneral: String(fila[16]).trim(),
              fechaRadicacion: String(fila[17]).trim(),
              fechaResultado: String(fila[18]).trim(),
              clase: String(fila[20]).trim(),
              biometriaActual: String(fila[23]).trim(),
              fechaAsignacion: fechaAsig
            });
          }
        }
      }
    } catch (eDigital) {
      Logger.log('getReestudiosData - Error leyendo digitales: ' + eDigital.toString());
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

    // Calcular tiempos (minutos decimales)
    let tiempoTotalResolucion = 0;
    let tiempoGestion = 0;

    if (fechaRadicacionRaw instanceof Date && !isNaN(fechaRadicacionRaw.getTime())) {
      const diffMs = ahora.getTime() - fechaRadicacionRaw.getTime();
      tiempoTotalResolucion = Number((diffMs / 60000).toFixed(2));
    }
    if (fechaAsignacionRaw instanceof Date && !isNaN(fechaAsignacionRaw.getTime())) {
      const diffMs = ahora.getTime() - fechaAsignacionRaw.getTime();
      tiempoGestion = Number((diffMs / 60000).toFixed(2));
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

    // Escribir póliza en columna Q (17)
    if (datos.poliza) {
      hoja.getRange(targetRow, 17).setValue(Number(datos.poliza));
    }

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
 * Wrapper de RequestLead() que devuelve el mismo formato de objeto
 * que espera VistaReestudios.html ({ success, nueva, message }).
 */
function RequestLeadUnificado() {
  try {
    const result = RequestLead();
    const isSuccess = typeof result === 'string' && result.includes('✅');
    return { success: isSuccess, nueva: isSuccess, message: result || '' };
  } catch (e) {
    return { success: false, nueva: false, message: e.toString() };
  }
}

/**
 * Retorna el email del usuario actual.
 */
function getEmailUsuarioReestudios() {
  return Session.getActiveUser().getEmail();
}
