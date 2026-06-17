/**
 * ====================================================
 * MODELO DE ASIGNACIÓN - REESTUDIOS
 * ====================================================
 * Motor de asignación equitativa para reestudios.
 * Separado del módulo de gestión (Reestudios.js) para mantener
 * la lógica de negocio aislada.
 *
 * Hoja fuente: "ORIGEN" en el spreadsheet ID_HOJA_REESTUDIOS
 *
 * Reglas de asignación:
 *  - FIFO (primera solicitud sin asignar en la hoja)
 *  - 1 caso por invocación
 *  - Respeta capacidad definida en hoja "Usuarios"
 *  - Excluye tipos "NUEVA UAR" y "DEUDOR UAR" (los maneja la API principal)
 *  - Control de concurrencia con LockService
 */

// Máximo de casos a asignar por invocación
const MAX_ASIGNAR_REESTUDIOS = 1;

/**
 * Motor de asignación equitativa para reestudios.
 * Se ejecuta cuando el analista entra a la vista o al guardar gestión.
 * Asigna casos sin asignar al analista actual hasta llenar su capacidad.
 * Respeta los cupos diarios del equipo Reestudios.
 *
 * @returns {Object} { success, nueva?, message }
 */
function RequestLeadReestudios() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "Sistema ocupado. Otro compañero está recibiendo casos. Intenta en unos segundos." };
  }

  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hojaUsuarios = ss.getSheetByName("Usuarios");
    const dataUsuarios = hojaUsuarios.getDataRange().getValues();
    const usuarioInfo = dataUsuarios.find(u => String(u[2]).trim().toLowerCase() === userEmail);

    if (!usuarioInfo) return { success: false, message: "Usuario no registrado en el sistema." };

    const nombreUsuario = String(usuarioInfo[1]).trim();
    const especialidad = String(usuarioInfo[4]).toUpperCase().trim();
    const estadoUsuario = String(usuarioInfo[5]).toUpperCase().trim();
    const capTotal = parseInt(usuarioInfo[6]) || 0;

    if (estadoUsuario !== "ACTIVO") return { success: false, message: "Tu usuario no está Activo." };

    const turnoCheck = verificarTurnoActivo(userEmail, ss);
    if (!turnoCheck.ok) return { success: false, message: turnoCheck.message };

    if (capTotal <= 0) return { success: false, message: "Capacidad en 0." };

    // Validar horario de asignación configurado por el admin
    const horarioCheck = verificarHorarioAsignacion();
    if (!horarioCheck.permitido) return { success: false, message: "⏰ " + horarioCheck.mensaje };

    // Determinar equipo según especialidad para leer cupos correctos
    let equipoCupos = 'REESTUDIOS';
    if (especialidad.includes("ESTUDIO DIGITAL")) equipoCupos = 'DIGITAL';
    else if (especialidad.includes("BIOMETRIA")) equipoCupos = 'BIOMETRIA';

    // Leer cupos del equipo (individuales o globales)
    const cupos = obtenerCuposEfectivos(userEmail, equipoCupos, dataUsuarios);

    // Abrir hoja de reestudios
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hoja = ssReestudios.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (!hoja) return { success: false, message: "No se encontró la hoja de reestudios." };

    const lastRow = hoja.getLastRow();
    if (lastRow < 2) return { success: false, message: "No hay solicitudes en la bandeja." };

    const data = hoja.getRange(2, 1, lastRow - 1, 14).getValues();

    // Calcular fecha hoy en múltiples formatos para comparar
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
      if (val instanceof Date) {
        return val.getDate() === hoy.getDate() && val.getMonth() === hoy.getMonth() && val.getFullYear() === hoy.getFullYear();
      }
      const texto = String(val);
      return texto.includes(hoyFmt1) || texto.includes(hoyFmt2) || texto.includes(hoyFmt3)
          || texto.includes(hoyFmt4) || texto.includes(hoyFmt5);
    }

    // Contar carga actual y cupos usados hoy
    let cargaActual = 0;
    let conteoHoy = { reestudio: 0, nuevaUar: 0, deudorUar: 0, nueva: 0, induccion: 0, biometria: 0 };

    for (const fila of data) {
      const asignado = String(fila[6]).trim().toLowerCase(); // col G
      if (asignado !== userEmail) continue;

      const fechaAsig = fila[8]; // col I
      const fechaFin = fila[9];  // col J
      const origenFila = String(fila[3]).toUpperCase().trim(); // col D
      const tipoProceso = String(fila[4]).toUpperCase().trim(); // col E

      let tipo = 'reestudio';
      if (origenFila === "CORREO" && tipoProceso === "NUEVA") tipo = 'nuevaUar';
      else if (origenFila === "CORREO" && tipoProceso === "ADICIONAL") tipo = 'deudorUar';

      if (esHoy(fechaAsig) || esHoy(fechaFin)) {
        conteoHoy[tipo]++;
      }
      if (String(fechaAsig).trim() !== "" && String(fechaFin).trim() === "") {
        cargaActual++;
      }
    }

    let cupoDisponible = capTotal - cargaActual;
    if (cupoDisponible <= 0) return { success: false, message: "Capacidad llena. Gestiona casos pendientes primero." };

    // También contar desde Historico_Gestiones (casos reestudios movidos al asignar)
    try {
      const hojaHistRR = ssReestudios.getSheetByName("Historico_Gestiones");
      if (hojaHistRR && hojaHistRR.getLastRow() > 1) {
        const dataHistRR = hojaHistRR.getRange(2, 1, hojaHistRR.getLastRow() - 1, 14).getValues();
        for (let i = 0; i < dataHistRR.length; i++) {
          const asignado = String(dataHistRR[i][6]).trim().toLowerCase();
          if (asignado !== userEmail) continue;
          const origenHist = String(dataHistRR[i][3]).toUpperCase().trim();
          const tipoProceso = String(dataHistRR[i][4]).toUpperCase().trim();
          const fechaAsig = dataHistRR[i][8];
          const fechaFin  = dataHistRR[i][9];
          let tipo = 'reestudio';
          if (origenHist === "CORREO" && tipoProceso === "NUEVA") tipo = 'nuevaUar';
          else if (origenHist === "CORREO" && tipoProceso === "ADICIONAL") tipo = 'deudorUar';
          if (esHoy(fechaAsig) || esHoy(fechaFin)) conteoHoy[tipo]++;
          if (String(fechaAsig).trim() !== "" && String(fechaFin).trim() === "") cargaActual++;
        }
      }
    } catch(eH) { Logger.log("RequestLeadReestudios Hist count: " + eH.message); }

    Logger.log('Cupos Reestudios equipo: ' + JSON.stringify(cupos) + ' | Conteo hoy: ' + JSON.stringify(conteoHoy) + ' | capTotal: ' + capTotal + ' | cargaActual: ' + cargaActual);

    // Buscar solicitudes sin asignar, respetando cupos por tipo
    let asignadas = 0;
    let sinAsignarDisponibles = 0;
    let saltadasPorCupo = 0;
    const fechaAsignacion = new Date();

    for (let i = 0; i < data.length; i++) {
      if (asignadas >= MAX_ASIGNAR_REESTUDIOS || cupoDisponible <= 0) break;

      const fila = data[i];
      const analistaAsignado = String(fila[6]).trim(); // col G
      const origenAsig = String(fila[3]).toUpperCase().trim(); // col D
      const tipoProceso = String(fila[4]).toUpperCase().trim(); // col E
      const solicitud = String(fila[1]).trim(); // col B

      // Solo solicitudes sin asignar
      if (analistaAsignado !== "") continue;
      if (solicitud === "") continue;

      sinAsignarDisponibles++;

      // Determinar tipo para validar cupo
      let tipo = 'reestudio';
      if (origenAsig === "CORREO" && tipoProceso === "NUEVA") tipo = 'nuevaUar';
      else if (origenAsig === "CORREO" && tipoProceso === "ADICIONAL") tipo = 'deudorUar';

      // Validar cupo diario del tipo
      if (conteoHoy[tipo] >= cupos[tipo]) { saltadasPorCupo++; continue; }

      // Asignar
      const filaReal = i + 2;
      hoja.getRange(filaReal, 7, 1, 3).setValues([
        [userEmail, nombreUsuario, fechaAsignacion]
      ]);
      hoja.getRange(filaReal, 9).setNumberFormat("dd/MM/yyyy HH:mm:ss");

      // Mover a Historico_Gestiones y eliminar del activo
      const filaCompleta = hoja.getRange(filaReal, 1, 1, 18).getValues()[0];
      const ssH = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
      let hojaHist = ssH.getSheetByName("Historico_Gestiones");
      if (!hojaHist) hojaHist = ssH.insertSheet("Historico_Gestiones");
      hojaHist.appendRow(filaCompleta);
      hoja.deleteRow(filaReal);

      asignadas++;
      cupoDisponible--;
      conteoHoy[tipo]++;
    }

    if (asignadas === 0) {
      Logger.log('Sin asignar para ' + userEmail + ' | capTotal:' + capTotal + ' | cargaActual:' + cargaActual + ' | cupos:' + JSON.stringify(cupos) + ' | conteoHoy:' + JSON.stringify(conteoHoy) + ' | sinAsignarEnCola:' + sinAsignarDisponibles + ' | saltadasPorCupo:' + saltadasPorCupo);
      var motivo = '';
      if (sinAsignarDisponibles === 0) motivo = 'No hay solicitudes en cola.';
      else if (saltadasPorCupo > 0) motivo = 'Cupo diario alcanzado. (Hoy: ' + JSON.stringify(conteoHoy) + ' | Límite: ' + JSON.stringify(cupos) + ')';
      else motivo = 'No hay solicitudes asignables con los cupos actuales.';
      return { success: false, nueva: false, message: motivo };
    }

    SpreadsheetApp.flush();
    return { success: true, nueva: true, message: "Se te asignaron " + asignadas + " caso(s)." };

  } catch (error) {
    return { success: false, message: "Error interno: " + error.toString() };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}
