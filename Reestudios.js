/**
 * ====================================================
 * MÓDULO REESTUDIOS - Backend para VistaUnificada.html (modal #modalReestudio)
 * ====================================================
 * Funciones: getReestudiosData, guardarGestionReestudio
 *
 * El motor de asignación (RequestLeadUnificado) está en MotorAsignacion.js
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
          fechaRadicacion: String(fila[0]).trim(),
          observacionesOrigen: String(fila[13]).trim()
        });
      }
    }

    // --- Casos asignados ya movidos a Historico_Gestiones (MotorAsignacion los mueve al asignar) ---
    try {
      const hojaHistR = ssReestudios.getSheetByName('Historico_Gestiones');
      if (hojaHistR && hojaHistR.getLastRow() > 1) {
        const lastRowH = hojaHistR.getLastRow();
        const dataH = hojaHistR.getRange(2, 1, lastRowH - 1, 14).getDisplayValues();
        for (let i = 0; i < dataH.length; i++) {
          const fila = dataH[i];
          const asignado = String(fila[6]).trim().toLowerCase();
          const fechaAsignacion = String(fila[8]).trim();
          const fechaFin = String(fila[9]).trim();

          if (asignado !== userEmail) continue;
          if (fechaAsignacion === '') continue;

          if (fechaFin !== '') {
            if (fechaFin.includes(hoyStr)) conteoHoy++;
            continue;
          }

          listaPendientes.push({
            fuente: 'REESTUDIO',
            filaReal: i + 2,
            solicitud: String(fila[1]).trim(),
            linkDrive: String(fila[2]).trim(),
            origen: String(fila[3]).trim(),
            tipoProceso: String(fila[4]).trim(),
            claseSolicitud: String(fila[5]).trim(),
            fechaAsignacion: fechaAsignacion,
            fechaRadicacion: String(fila[0]).trim(),
            observacionesOrigen: String(fila[13]).trim()
          });
        }
      }
    } catch (eHistR) {
      Logger.log('getReestudiosData - Error leyendo Historico_Gestiones reestudios: ' + eHistR.toString());
    }

    // --- Lookup score/inmobiliaria para casos DIGITAL ---
    const mapaScoreR = new Map();
    const mapaInmobiliariaR = new Map();
    try {
      const ssScore = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
      const hojaScore = ssScore.getSheetByName("score");
      if (hojaScore) {
        const dataScore = hojaScore.getDataRange().getDisplayValues();
        for (let s = 1; s < dataScore.length; s++) {
          let pol = String(dataScore[s][0]).trim();
          let polNorm = pol.replace(/\D/g, '').replace(/^0+/, '');
          let categoria = String(dataScore[s][2] || "").trim().toUpperCase();
          let inmobiliaria = String(dataScore[s][3] || "").trim();
          if (pol) { mapaScoreR.set(pol, categoria); mapaInmobiliariaR.set(pol, inmobiliaria); }
          if (polNorm) { mapaScoreR.set(polNorm, categoria); mapaInmobiliariaR.set(polNorm, inmobiliaria); }
        }
      }
    } catch (eScore) {
      Logger.log('getReestudiosData - Error leyendo score: ' + eScore.toString());
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

            var polD = String(fila[1]).trim();
            var polDNorm = polD.replace(/\D/g, '').replace(/^0+/, '');
            listaPendientes.push({
              fuente: 'DIGITAL',
              origen: 'DIGITAL',
              tipoProceso: String(fila[20]).trim(),
              claseSolicitud: String(fila[4]).trim(),
              solicitud: String(fila[0]).trim(),
              poliza: polD,
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
              fechaAsignacion: fechaAsig,
              categoriaScore: mapaScoreR.get(polD) || mapaScoreR.get(polDNorm) || '',
              inmobiliaria: mapaInmobiliariaR.get(polD) || mapaInmobiliariaR.get(polDNorm) || ''
            });
          }
        }
      }
    } catch (eDigital) {
      Logger.log('getReestudiosData - Error leyendo digitales: ' + eDigital.toString());
    }

    // --- Historico_Gestiones principal (casos movidos al asignar desde solicitud) ---
    try {
      const ssPrincipal = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
      const hojaHistPrincipal = ssPrincipal.getSheetByName('Historico_Gestiones');
      if (hojaHistPrincipal && hojaHistPrincipal.getLastRow() > 1) {
        const lastRowHP = hojaHistPrincipal.getLastRow();
        const colsHP = Math.max(61, hojaHistPrincipal.getLastColumn());
        const dataHP = hojaHistPrincipal.getRange(2, 1, lastRowHP - 1, colsHP).getDisplayValues();
        for (let i = 0; i < dataHP.length; i++) {
          const fila = dataHP[i];
          const asignado = String(fila[25]).trim().toLowerCase();
          const fechaAsig = String(fila[24]).trim();
          const fechaFin  = String(fila[26]).trim();

          if (asignado !== userEmail) continue;
          if (fechaAsig === '') continue;

          if (fechaFin !== '') {
            if (fechaFin.includes(hoyStr)) conteoHoy++;
            continue;
          }

          var polHP = String(fila[1]).trim();
          var polHPNorm = polHP.replace(/\D/g, '').replace(/^0+/, '');
          listaPendientes.push({
            fuente: 'DIGITAL',
            origen: 'DIGITAL',
            tipoProceso: String(fila[20]).trim(),
            claseSolicitud: String(fila[4]).trim(),
            solicitud: String(fila[0]).trim(),
            poliza: polHP,
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
            biometriaActual: String(fila[22]).trim(),
            fechaAsignacion: fechaAsig,
            categoriaScore: mapaScoreR.get(polHP) || mapaScoreR.get(polHPNorm) || '',
            inmobiliaria: mapaInmobiliariaR.get(polHP) || mapaInmobiliariaR.get(polHPNorm) || ''
          });
        }
      }
    } catch (eHistPrincipal) {
      Logger.log('getReestudiosData - Error leyendo Historico_Gestiones principal: ' + eHistPrincipal.toString());
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
 * Después de guardar, intenta auto-asignar un nuevo caso (via MotorAsignacion.js).
 * 
 * @param {Object} datos - { filaReal, estadoGestion, motivoAplazamiento, motivoNegacion, observaciones }
 */
function guardarGestionReestudio(datos) {
  if (datos && datos.solicitudId && !datos.solicitud) datos.solicitud = datos.solicitudId;
  if (!datos || (!datos.filaReal && !datos.solicitud)) {
    return { success: false, message: "Identificador del caso no proporcionado." };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "Sistema ocupado, reintenta en unos segundos." };
  }

  try {
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);

    // Buscar caso: primero en Historico_Gestiones (nueva lógica), luego en ORIGEN (legados)
    let hojaHistorico = ssReestudios.getSheetByName("Historico_Gestiones");
    let targetRow = -1;
    let fuenteRuta = '';

    if (hojaHistorico && hojaHistorico.getLastRow() > 1) {
      const lastRowH = hojaHistorico.getLastRow();
      const dataH = hojaHistorico.getRange(2, 2, lastRowH - 1, 9).getValues(); // cols B–J
      const targetId = String(datos.solicitud || datos.filaReal).trim();
      for (let i = 0; i < dataH.length; i++) {
        const idMatch  = String(dataH[i][0]).trim() === targetId;
        const fechaFin = String(dataH[i][8]).trim(); // col J = fechaFinGestion
        if (idMatch && fechaFin === '') {
          targetRow = i + 2; fuenteRuta = 'HISTORICO'; break;
        }
      }
    }

    const hojaOrigen = ssReestudios.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (targetRow === -1 && hojaOrigen) {
      // Fallback por filaReal (fila en ORIGEN)
      targetRow = parseInt(datos.filaReal);
      fuenteRuta = 'ORIGEN';
    }

    const hojaActiva = fuenteRuta === 'HISTORICO' ? hojaHistorico : hojaOrigen;
    if (!hojaActiva) return { success: false, message: "No se encontró la hoja." };

    // Verificar que no haya sido gestionada ya
    const fechaFinExistente = String(hojaActiva.getRange(targetRow, 10).getDisplayValue()).trim();
    if (fechaFinExistente !== "") {
      return { success: false, message: "Este caso ya fue gestionado." };
    }

    const ahora = new Date();
    const filaBase        = hojaActiva.getRange(targetRow, 1, 1, 18).getValues()[0];
    const fechaRadicacion = filaBase[0];
    const fechaAsignacion = filaBase[8];
    const emailAnalista   = String(filaBase[6] || '').toLowerCase().trim();

    const tRadCola = _parseFechaGAS(datos.fecha_radicacion_sai) || _parseFechaGAS(fechaRadicacion);
    const tiempos = calcularTiemposCaso(
      tRadCola,
      _parseFechaGAS(fechaAsignacion),
      ahora,
      emailAnalista
    );

    // Escribir gestión en columnas J(10) a R(18)
    hojaActiva.getRange(targetRow, 10, 1, 9).setValues([[
      ahora,
      datos.estadoGestion || "",
      datos.motivoAplazamiento || "",
      datos.motivoNegacion || "",
      datos.observaciones || "",
      tiempos.minutos_cola,
      tiempos.minutos_gestion,
      tiempos.minutos_general,
      datos.poliza || ""
    ]]);
    hojaActiva.getRange(targetRow, 10).setNumberFormat("dd/mm/yyyy HH:mm:ss");
    hojaActiva.getRange(targetRow, 15, 1, 3).setNumberFormat("0.00");

    SpreadsheetApp.flush();

    if (fuenteRuta === 'ORIGEN') {
      // Caso legado en ORIGEN: mover a Historico y eliminar del activo
      const filaFinal = hojaOrigen.getRange(targetRow, 1, 1, 18).getValues()[0];
      if (!hojaHistorico) hojaHistorico = ssReestudios.insertSheet("Historico_Gestiones");
      hojaHistorico.appendRow(filaFinal);
      hojaOrigen.deleteRow(targetRow);
    }

    return { success: true, message: "Gestión guardada correctamente.", disparaAsignacion: true };

  } catch (error) {
    return { success: false, message: "Error al guardar: " + error.toString() };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

