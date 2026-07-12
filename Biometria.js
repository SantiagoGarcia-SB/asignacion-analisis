// OBSOLETA: biometrÃ­as ahora se toman de la hoja "solicitud" en ID_WAREHOUSE_USUARIOS
// const ID_SHEET_ORIGEN = '1tmXIxNB65eAUQah8dxvSJSJVKmR25ZiuM59SLX0NYME';
// OBSOLETA: biometrÃ­a ahora usa Historico_Gestiones en ID_WAREHOUSE_USUARIOS
// const ID_SHEET_GESTION = '1lT9BxWAKgo9xed9xaAbbFqna304TWNbzL3v2302ZvOQ';
const ID_WAREHOUSE_USUARIOS = '1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0';
const ID_SHEET_BIOMETRIA_PENDIENTE = '1gHW1RFMVd0h4HZr2xTrFnx-A5Pk_npJs-bAk8GOx2h0';
const NOMBRE_HOJA_PENDIENTE_BIOMETRIA = 'pendiente_biometria';
// OBSOLETA â€” la trazabilidad de archivadas ahora se gestiona directamente en
// pendiente_biometria con fase "ARCHIVADA". La hoja se conserva como registro histÃ³rico.
const NOMBRE_HOJA_BIOMETRIA_ARCHIVADA = 'biometria_cola_archivada';

function getEndPointNewApiDate() { return PropertiesService.getScriptProperties().getProperty('endPointSaiNewApiDate'); }
function getEndPointNewSai() { return PropertiesService.getScriptProperties().getProperty('endpointSaiNewApi'); }

// SUSPENDIDA: biometrÃ­as ahora se toman de la hoja "solicitud" (APROBADO_PENDIENTE_BIOMETRIA)
function descargarBiometriasAPI() {
  Logger.log("descargarBiometriasAPI SUSPENDIDA â€” biometrÃ­as se toman de hoja solicitud");
  return;
}

function eliminarTriggersBio() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'descargarBiometriasAPI') {
      ScriptApp.deleteTrigger(t);
    }
  });
}

function updateBiometriagpt(solicitud) {
  if (!solicitud) return false;
  const baseUrl = getEndPointNewSai();
  const keyFull = getKeyFull();
  if (!baseUrl || !keyFull) return false;
  const url = baseUrl + solicitud;
  const options = {
    method: "GET",
    muteHttpExceptions: true,
    headers: { "x-api-key": keyFull, "Accept": "application/json" }
  };
  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      console.warn("updateBiometriagpt - Error HTTP " + response.getResponseCode() + " para solicitud: " + solicitud);
      return false;
    }
    const parsed = JSON.parse(response.getContentText());
    const status = String(parsed.studyStatus || '').trim().toUpperCase();
    return status === 'APROBADO_PENDIENTE_BIOMETRIA';
  } catch (e) {
    console.error("updateBiometriagpt - ExcepciÃ³n para solicitud " + solicitud + ": " + e.toString());
    return false;
  }
}

function verificarEstadoBiometria(solicitud) {
  if (!solicitud) return "ERROR";
  const baseUrl = getEndPointNewSai();
  const keyFull = getKeyFull();
  if (!baseUrl || !keyFull) return "ERROR";

  const url = baseUrl + solicitud;
  const options = {
    method: "GET",
    muteHttpExceptions: true,
    headers: { "x-api-key": keyFull, "Accept": "application/json" }
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      console.warn("verificarEstadoBiometria - HTTP " + response.getResponseCode() + " para: " + solicitud);
      return "ERROR";
    }
    const parsed = JSON.parse(response.getContentText());
    const status = String(parsed.studyStatus || '').trim().toUpperCase();
    console.log("verificarEstadoBiometria - Solicitud: " + solicitud + " | Status: " + status);

    if (status === 'APROBADO_PENDIENTE_BIOMETRIA') {
      return "PENDIENTE";
    }
    return "YA_NO_PENDIENTE";
  } catch (e) {
    console.error("verificarEstadoBiometria - Error para " + solicitud + ": " + e.toString());
    return "ERROR";
  }
}

// IMPORTANTE: la consulta paginada a SAI (lenta, con pausas de 2s entre pÃ¡ginas) corre
// SIN el ScriptLock â€” igual que se corrigiÃ³ en verificarAprobacionDesaplazamientos/Uar
// (ver commit "Corrige retenciÃ³n de lock durante llamadas a SAI"). El lock solo se toma
// al final, para el borrado, y justo antes se vuelve a leer la hoja para confirmar que
// la fila sigue ahÃ­ con el mismo estado (evita borrar una fila que otro proceso ya moviÃ³
// o reemplazÃ³ mientras se esperaba la respuesta de SAI).
function limpiarBiometriasResueltas() {
  try {
    const ss = SpreadsheetApp.openById(ID_WAREHOUSE_USUARIOS);
    const hoja = ss.getSheetByName("solicitud");
    if (!hoja) { Logger.log("Hoja 'solicitud' no encontrada."); return; }

    const lastRow = hoja.getLastRow();
    if (lastRow < 2) return;

    const datos = hoja.getRange(2, 1, lastRow - 1, 19).getValues();

    const bioIds = [];

    for (let i = 0; i < datos.length; i++) {
      const estado = String(datos[i][16]).toUpperCase().trim();
      if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;

      const solicitud = String(datos[i][0]).trim();
      if (!solicitud) continue;
      bioIds.push(solicitud);
    }

    if (bioIds.length === 0) {
      Logger.log("âœ… No hay biometrÃ­as pendientes para revisar.");
      return;
    }

    Logger.log("ðŸ“‹ " + bioIds.length + " biometrÃ­as pendientes a verificar contra SAI (consulta individual).");

    // Consulta individual por solicitud (mismo patrÃ³n que _procesarCortePendientes()) en vez
    // de la bÃºsqueda paginada por rango de fechas: con la cola tÃ­pica (decenas, no miles de
    // pendientes) es mucho mÃ¡s rÃ¡pido y no depende de que la solicitud se haya radicado
    // dentro de una ventana de dÃ­as â€” antes, una solicitud radicada hace mÃ¡s de 4 dÃ­as
    // quedaba fuera del rango de bÃºsqueda y nunca se revisaba.
    const estadosSai = new Map();
    const fechasSai = new Map();
    for (let i = 0; i < bioIds.length; i++) {
      const datosApi = _consultarSaiIndividual(bioIds[i]);
      if (datosApi) {
        estadosSai.set(bioIds[i], String(datosApi.studyStatus || "").toUpperCase().trim());
        const fechaResultadoApi = datosApi.lastMovementDate || "";
        if (fechaResultadoApi) fechasSai.set(bioIds[i], fechaResultadoApi);
      } else {
        Logger.log("âš ï¸ Sin respuesta API para " + bioIds[i]);
      }
      Utilities.sleep(1000);
    }

    const ESTADOS_CONSERVAR = new Set(["APROBADO_PENDIENTE_BIOMETRIA", "EN_ESTUDIO"]);
    const idsAEliminar = new Set();
    const fechasAActualizar = new Map(); // id â†’ nueva fechaResultado (texto normalizado)

    for (let i = 0; i < datos.length; i++) {
      const estado = String(datos[i][16]).toUpperCase().trim();
      if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;

      const solicitud = String(datos[i][0]).trim();
      if (!solicitud) continue;

      const statusSai = estadosSai.get(solicitud);
      if (statusSai && !ESTADOS_CONSERVAR.has(statusSai)) {
        idsAEliminar.add(solicitud);
        Logger.log("ðŸ—‘ï¸ Solicitud " + solicitud + " cambiÃ³ a " + statusSai);
        continue;
      }

      const fechaApi = fechasSai.get(solicitud);
      if (fechaApi) {
        const fechaNueva = _normalizarFechaApiComoTexto(fechaApi);
        const fechaActual = String(datos[i][18] || "").trim();
        if (fechaNueva && fechaNueva !== fechaActual) {
          fechasAActualizar.set(solicitud, fechaNueva);
        }
      }
    }

    if (idsAEliminar.size === 0 && fechasAActualizar.size === 0) {
      Logger.log("âœ… Ninguna biometrÃ­a cambiÃ³ de estado ni de fechaResultado.");
      return;
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      Logger.log("âŒ Lock no disponible para limpiar biometrÃ­as: " + e.message);
      return;
    }

    try {
      // Re-leer justo antes de actuar: si otro proceso ya asignÃ³/moviÃ³ la fila mientras
      // se esperaba la respuesta de SAI, esta relectura evita tocar la fila equivocada.
      const lastRowActual = hoja.getLastRow();
      if (lastRowActual < 2) return;
      const idsActuales = hoja.getRange(2, 1, lastRowActual - 1, 19).getValues();

      const filasAEliminar = [];
      let actualizadas = 0;
      for (let i = 0; i < idsActuales.length; i++) {
        const solicitud = String(idsActuales[i][0]).trim();
        const estado = String(idsActuales[i][16]).toUpperCase().trim();
        if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;

        if (idsAEliminar.has(solicitud)) {
          filasAEliminar.push(i + 2);
        } else if (fechasAActualizar.has(solicitud)) {
          hoja.getRange(i + 2, 19).setValue(fechasAActualizar.get(solicitud));
          actualizadas++;
        }
      }

      for (let j = filasAEliminar.length - 1; j >= 0; j--) {
        hoja.deleteRow(filasAEliminar[j]);
      }

      if (filasAEliminar.length > 0 || actualizadas > 0) {
        SpreadsheetApp.flush();
        Logger.log("âœ… " + filasAEliminar.length + " biometrÃ­as resueltas eliminadas. " + actualizadas + " fechaResultado actualizadas.");
      } else {
        Logger.log("â„¹ï¸ Las filas candidatas ya no estaban disponibles al momento de actuar (probablemente asignadas mientras tanto).");
      }
    } finally {
      if (lock.hasLock()) lock.releaseLock();
    }

    // Fuera del lock: registrar en pendiente_biometria que estas solicitudes se resolvieron
    // solas mientras estaban en la cola (ningÃºn analista las tomÃ³).
    if (idsAEliminar.size > 0) {
      _actualizarFaseBiometriaPendiente(idsAEliminar, "RESUELTA_EN_COLA");
    }
  } catch (e) {
    Logger.log("âŒ Error en limpiarBiometriasResueltas: " + e.message);
  }
}

function obtenerMapaInmobiliarias(ssWarehouse) {
  const mapa = new Map();
  try {
    const hojaScore = ssWarehouse.getSheetByName("score");
    if (hojaScore) {
      const data = hojaScore.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        let pol = String(data[i][0]).trim();
        let inmo = String(data[i][3]).trim();
        if (pol) {
          mapa.set(pol, inmo);
          let polNorm = pol.split(/[.,]/)[0].replace(/\D/g, '').replace(/^0+/, '');
          if (polNorm) mapa.set(polNorm, inmo);
        }
      }
    }
  } catch (e) {}
  return mapa;
}

function autoAsignarBiometria() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "El sistema estÃ¡ asignando casos a otros compaÃ±eros. Reintenta en unos segundos." };
  }

  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();

    const ssWarehouse = SpreadsheetApp.openById(ID_WAREHOUSE_USUARIOS);
    const hojaUsuarios = ssWarehouse.getSheetByName("Usuarios");
    const dataUsuarios = hojaUsuarios.getDataRange().getValues();
    const usuario = dataUsuarios.find(u => String(u[2]).trim().toLowerCase() === userEmail);

    if (!usuario) return { success: false, message: "Usuario no registrado" };
    if (String(usuario[5]).toUpperCase().trim() !== "ACTIVO") return { success: false, message: "Usuario no estÃ¡ activo" };

    const permisoCheck = verificarPermisoVigenteHoy();
    if (permisoCheck.tienePermiso) return { success: false, message: "â›” Tienes un permiso vigente (" + permisoCheck.tipo + "). No puedes recibir casos hoy." };

    const capTotal = parseInt(usuario[6]) || 0;
    const nombreAnalista = String(usuario[1]).trim();
    if (capTotal <= 0) return { success: false, message: "Capacidad invÃ¡lida o en 0" };

    let hojaHist = ssWarehouse.getSheetByName("Historico_Gestiones");
    if (!hojaHist) hojaHist = ssWarehouse.insertSheet("Historico_Gestiones");
    const lastRowHist = hojaHist.getLastRow();

    let cargaActual = 0;
    let idsEnGestion = new Set();
    let conteoHoyBio = 0;
    const hoy = new Date();

    if (lastRowHist > 1) {
      const dataHist = hojaHist.getRange(2, 1, lastRowHist - 1, 27).getValues();
      dataHist.forEach(f => {
        const estadoH = String(f[16]).toUpperCase().trim();
        if (!estadoH.includes("BIOMETRIA")) return;

        const solId = String(f[0]).trim();
        if (solId) idsEnGestion.add(solId);

        const emailH = String(f[25]).trim().toLowerCase();
        if (emailH !== userEmail) return;

        const fechaFin = f[26];
        const tieneFin = fechaFin instanceof Date || String(fechaFin).trim() !== "";
        if (!tieneFin) cargaActual++;

        const fechaAsig = f[24];
        if (fechaAsig instanceof Date && fechaAsig.getDate() === hoy.getDate() && fechaAsig.getMonth() === hoy.getMonth() && fechaAsig.getFullYear() === hoy.getFullYear()) {
          conteoHoyBio++;
        }
      });
    }

    let cupoDisponible = capTotal - cargaActual;
    if (cupoDisponible <= 0) return { success: false, message: "Capacidad llena" };

    const cuposBio = obtenerCuposEfectivos(userEmail, 'DESAPLAZAMIENTO', dataUsuarios);
    const cupoBioDiario = cuposBio.desaplazamiento;

    if (conteoHoyBio >= cupoBioDiario) return { success: false, message: "Cupo diario de biometrÃ­a alcanzado (" + cupoBioDiario + ")." };
    const cupoRestanteBio = cupoBioDiario - conteoHoyBio;
    if (cupoDisponible > cupoRestanteBio) cupoDisponible = cupoRestanteBio;

    const hojaSolicitud = ssWarehouse.getSheetByName("solicitud");
    if (!hojaSolicitud || hojaSolicitud.getLastRow() < 2) return { success: false, message: "No hay biometrÃ­as pendientes en la base." };

    const lastRowSol = hojaSolicitud.getLastRow();
    const datosSol = hojaSolicitud.getRange(2, 1, lastRowSol - 1, 38).getValues();

    let candidatosElegibles = [];

    for (let i = 0; i < datosSol.length; i++) {
      const row = datosSol[i];
      const id = String(row[0]).trim();
      if (!id) continue;

      const estado = String(row[16]).toUpperCase().trim();
      const asignado = String(row[27]).trim();

      if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;
      if (asignado !== "") continue;
      if (idsEnGestion.has(id)) continue;

      // fechaResultado (col S / Ã­ndice 18): misma columna que usa RequestLeadUnificado
      // para ordenar desaplazamiento, asÃ­ ambas rutas de asignaciÃ³n quedan consistentes.
      candidatosElegibles.push({ row: row, sheetRowIndex: i + 2, fechaOrd: _parseDateUnif(row[18]) });
      idsEnGestion.add(id);
    }

    if (candidatosElegibles.length === 0) {
      return { success: false, message: "No hay biometrÃ­as pendientes validadas." };
    }

    // El admin decide si se llama primero al mÃ¡s reciente o al mÃ¡s antiguo
    // (ver admin_getOrdenDesaplazamiento / admin_setOrdenDesaplazamiento en Admin.js).
    const ordenReciente = (PropertiesService.getScriptProperties().getProperty('ORDEN_DESAPLAZAMIENTO') || 'RECIENTE_PRIMERO') === 'RECIENTE_PRIMERO';
    candidatosElegibles.sort(function(a, b) {
      return ordenReciente ? (b.fechaOrd - a.fechaOrd) : (a.fechaOrd - b.fechaOrd);
    });

    const candidatosParaAsignar = candidatosElegibles.slice(0, cupoDisponible);

    const fechaAsignacion = new Date();
    const filasAEliminar = [];
    const filasHist = [];

    candidatosParaAsignar.forEach(candidato => {
      const row = candidato.row;

      const histRow = new Array(61).fill("");
      for (let c = 0; c < 22; c++) histRow[c] = row[c] !== undefined ? row[c] : "";
      histRow[24] = fechaAsignacion;
      histRow[25] = userEmail;
      histRow[27] = nombreAnalista;
      histRow[32] = row[36] || "";
      histRow[33] = fechaAsignacion;
      histRow[34] = 0;
      histRow[35] = 0;
      histRow[36] = 0;
      histRow[60] = 'desaplazamiento';

      filasHist.push(histRow);
      filasAEliminar.push(candidato.sheetRowIndex);
    });

    hojaHist.getRange(lastRowHist + 1, 1, filasHist.length, 61).setValues(filasHist);

    filasAEliminar.sort((a, b) => b - a).forEach(fila => {
      hojaSolicitud.deleteRow(fila);
    });

    SpreadsheetApp.flush();

    // Registrar en pendiente_biometria que estas solicitudes fueron asignadas a un analista.
    var idsAsignadas = candidatosParaAsignar.map(c => String(c.row[0]).trim()).filter(id => id);
    _actualizarFaseBiometriaPendiente(idsAsignadas, "ASIGNADA");

    return { success: true, message: `Se te asignaron ${filasHist.length} nuevas solicitudes.`, nueva: true };

  } catch (error) {
    return { success: false, message: "Error interno: " + error.toString() };
  } finally {
    if(lock.hasLock()) lock.releaseLock();
  }
}

function guardarGestionBiometria(idSolicitud, datosFormulario) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (e) {
    return { success: false, message: "El sistema estÃ¡ ocupado. Intenta de nuevo." };
  }

  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hojaHist = ss.getSheetByName("Historico_Gestiones");
    if (!hojaHist) return { success: false, message: "Hoja Historico_Gestiones no encontrada." };

    const lastRow = hojaHist.getLastRow();
    if (lastRow < 2) return { success: false, message: "No hay datos en Historico_Gestiones." };
    const matrizDatos = hojaHist.getRange(2, 1, lastRow - 1, 34).getValues();

    for (let i = 0; i < matrizDatos.length; i++) {
      const fila = matrizDatos[i];
      const solId = String(fila[0]).trim();
      const emailH = String(fila[25]).trim().toLowerCase();
      const fechaFin = String(fila[26]).trim();

      if (solId === String(idSolicitud).trim() && emailH === userEmail && fechaFin === '') {
        const filaReal = i + 2;
        const ahora = new Date();
        const fechaSoloDia = Utilities.formatDate(ahora, "GMT-5", "dd/MM/yyyy");
        const resFinal = String(datosFormulario.resFinal || '').toUpperCase();
        const motivoAplaz = resFinal === 'APLAZADO' ? (datosFormulario.motivoAplazamiento || '') : '';
        const motivoNeg = resFinal === 'RECHAZADO' ? (datosFormulario.motivoNegacion || '') : '';

        // Col Q (17): estado â†’ resultado final
        hojaHist.getRange(filaReal, 17).setValue(resFinal);
        // Col U (21): clase â†’ BIOMETRIA
        hojaHist.getRange(filaReal, 21).setValue('BIOMETRIA');
        // Col AM (39): resultado_llamada_desaplazamiento_biometria
        hojaHist.getRange(filaReal, 39).setValue(datosFormulario.resLlamada || '');
        // Col X (24): observaciones â†’ vacÃ­o para biometrÃ­a
        hojaHist.getRange(filaReal, 24).setValue('');
        // Col AA (27): fecha fin gestiÃ³n
        hojaHist.getRange(filaReal, 27).setValue(ahora).setNumberFormat("dd/mm/yyyy HH:mm:ss");
        // Col AC-AD (29-30): motivo aplazamiento, motivo negaciÃ³n
        hojaHist.getRange(filaReal, 29, 1, 2).setValues([[motivoAplaz, motivoNeg]]);
        // Col AE (31): fecha solo dÃ­a
        hojaHist.getRange(filaReal, 31).setValue(fechaSoloDia);

        // Calcular tiempos SLA
        const fechaAsignacion = _parseFechaGAS(fila[24]);
        // Desaplazamiento: fechaDiligenciadaRadicaciÃ³n = fechaAsignaciÃ³n (cola = 0)
        const tRadCola = fechaAsignacion;
        hojaHist.getRange(filaReal, 34).setValue(fechaAsignacion || '');
        if (fechaAsignacion) hojaHist.getRange(filaReal, 34).setNumberFormat("dd/MM/yyyy HH:mm:ss");
        const tiempos = calcularTiemposCaso(tRadCola, fechaAsignacion, ahora, userEmail);
        hojaHist.getRange(filaReal, 35, 1, 3).setValues([[tiempos.minutos_cola, tiempos.minutos_gestion, tiempos.minutos_general]]);
        hojaHist.getRange(filaReal, 35, 1, 3).setNumberFormat("0.00");

        _registrarCierreContador(userEmail, 'desaplazamiento', fechaAsignacion);

        SpreadsheetApp.flush();
        lock.releaseLock();

        return { success: true, message: "GestiÃ³n guardada correctamente.", disparaAsignacion: true };
      }
    }
    return { success: false, message: "Solicitud " + idSolicitud + " no encontrada o ya gestionada." };
  } catch (error) {
    return { success: false, message: error.toString() };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function getDatosBiometria() {
  const correoUsuario = Session.getActiveUser().getEmail().toLowerCase().trim();

  const ssWarehouse = SpreadsheetApp.openById(ID_WAREHOUSE_USUARIOS);
  const hojaHist = ssWarehouse.getSheetByName("Historico_Gestiones");

  if (!hojaHist || hojaHist.getLastRow() <= 1) {
    return { solicitudes: [], stats: { hoy: 0, pendientes: 0 } };
  }

  const lastRow = hojaHist.getLastRow();
  const matrizDatos = hojaHist.getRange(2, 1, lastRow - 1, 28).getValues();

  const mapaInmobiliarias = obtenerMapaInmobiliarias(ssWarehouse);

  let conteoHoy = 0;
  let listaPendientes = [];
  const hoySinHora = new Date().setHours(0, 0, 0, 0);

  for (let i = 0; i < matrizDatos.length; i++) {
    const hist = matrizDatos[i];
    const estadoH = String(hist[16]).toUpperCase().trim();
    if (!estadoH.includes("BIOMETRIA")) continue;

    const emailH = String(hist[25]).trim().toLowerCase();
    if (emailH !== correoUsuario) continue;

    const fechaFin = hist[26];
    const tieneFin = fechaFin instanceof Date || String(fechaFin).trim() !== "";

    if (!tieneFin) {
      let polizaVal = String(hist[1] || "").trim();
      let polNorm = polizaVal.split(/[.,]/)[0].replace(/\D/g, '').replace(/^0+/, '');
      let inmoVal = mapaInmobiliarias.get(polizaVal) || mapaInmobiliarias.get(polNorm) || "";

      let fechaAsigStr = hist[24];
      if (fechaAsigStr instanceof Date) {
        fechaAsigStr = Utilities.formatDate(fechaAsigStr, "GMT-5", "dd/MM/yyyy HH:mm");
      }

      listaPendientes.push([
        fechaAsigStr,           // [0] fechaAsignacion
        String(hist[27] || ""), // [1] nombreAnalista
        "",                     // [2] (vacÃ­o)
        polizaVal,              // [3] poliza
        inmoVal,                // [4] inmobiliaria
        String(hist[13] || ""), // [5] ciudad
        String(hist[0] || ""),  // [6] solicitud
        hist[9] || 0,           // [7] canon
        String(hist[6] || ""),  // [8] celular/telefono
        "",                     // [9] (vacÃ­o)
        String(hist[11] || ""), // [10] direccion
        String(hist[4] || ""),  // [11] nombreInquilino
        "",                     // [12] (vacÃ­o)
        String(hist[16] || ""), // [13] estadoGeneral
        "",                     // [14] (vacÃ­o)
        "PENDIENTE GESTION",    // [15] estado gestion
        "__DESAPLAZAMIENTO__",        // [16] marcador de tipo para detectarTipoCaso()
        String(hist[25] || ""), // [17] emailAsignado
        String(hist[5] || ""),  // [18] correoInquilino
        String(hist[2] || ""),  // [19] identificacion
        String(hist[3] || ""),  // [20] tipoIdentificacion
        String(hist[7] || ""),  // [21] ingresos
        String(hist[14] || ""), // [22] nombreAsesor
        String(hist[15] || "")  // [23] correoAsesor
      ]);
    } else {
      let fechaFinDate = fechaFin instanceof Date ? fechaFin : new Date(fechaFin);
      if (!isNaN(fechaFinDate.getTime()) && fechaFinDate.getTime() >= hoySinHora) {
        conteoHoy++;
      }
    }
  }

  return {
    solicitudes: listaPendientes,
    stats: { hoy: conteoHoy, pendientes: listaPendientes.length }
  };
}


// ===================================================================
// FLUJO BIOMETRÃA: Captura cada 10 min + Primer contacto cada hora + EscalaciÃ³n 8am/12pm
// ===================================================================
// Columna 76 (Ã­ndice 75) de pendiente_biometria: fase_seguimiento_biometria
// "" = aÃºn sin contactar | "WA_ENVIADO" = ya tuvo su oportunidad por WhatsApp
// "ESCALADA" = ya se enviÃ³ a asignaciÃ³n (llamada) | "RESUELTA" = SAI ya no dice pendiente, se cierra sin llamar
// "RESUELTA_EN_COLA" = SAI dejÃ³ de reportar pendiente mientras estaba en cola "solicitud" (sin analista)
// "ASIGNADA" = un analista la tomÃ³ desde la cola | "ARCHIVADA" = se venciÃ³ en cola sin ser asignada
// Columna 77 (Ã­ndice 76): fecha_actualizacion_fase â€” se sobrescribe con la fecha/hora exacta
// cada vez que fase_seguimiento_biometria cambia de valor. Requiere correr una vez
// agregarColumnaFechaActualizacionFase() para crear el encabezado en la hoja.
var COL_FECHA_ACTUALIZACION_FASE = 77;

/**
 * Actualiza la fase final en pendiente_biometria para una lista de consecutivos.
 * Busca cada consecutivo en la hoja y marca la fase indicada + timestamp.
 * Solo actualiza filas cuya fase actual sea "ESCALADA" (las Ãºnicas que deberÃ­an
 * estar en la cola "solicitud"). Si la fase ya es terminal (RESUELTA, RESUELTA_EN_COLA,
 * ASIGNADA, ARCHIVADA), no la sobreescribe â€” protege contra doble ejecuciÃ³n.
 *
 * @param {Set|Array} consecutivos - IDs de solicitud a actualizar
 * @param {string} nuevaFase - "RESUELTA_EN_COLA" | "ASIGNADA" | "ARCHIVADA"
 */
function _actualizarFaseBiometriaPendiente(consecutivos, nuevaFase) {
  if (!consecutivos || (consecutivos instanceof Set ? consecutivos.size === 0 : consecutivos.length === 0)) return;

  var idsSet = consecutivos instanceof Set ? consecutivos : new Set(consecutivos);
  var ahora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");

  try {
    var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
    var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
    if (!hojaBio || hojaBio.getLastRow() < 2) return;

    var lastRow = hojaBio.getLastRow();
    var ids = hojaBio.getRange(2, 1, lastRow - 1, 1).getValues();
    var fases = hojaBio.getRange(2, 76, lastRow - 1, 1).getValues();

    var FASES_TERMINALES = new Set(["RESUELTA", "RESUELTA_EN_COLA", "ASIGNADA", "ARCHIVADA"]);
    var actualizadas = 0;

    for (var i = 0; i < ids.length; i++) {
      var solId = String(ids[i][0]).trim();
      if (!idsSet.has(solId)) continue;

      var faseActual = String(fases[i][0]).trim().toUpperCase();
      if (FASES_TERMINALES.has(faseActual)) continue; // ya cerrada, no sobreescribir

      hojaBio.getRange(i + 2, 76).setValue(nuevaFase);
      hojaBio.getRange(i + 2, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
      actualizadas++;

      idsSet.delete(solId);
      if (idsSet.size === 0) break; // ya encontrÃ³ todas
    }

    if (actualizadas > 0) {
      SpreadsheetApp.flush();
      Logger.log("ðŸ“ pendiente_biometria: " + actualizadas + " filas actualizadas a fase '" + nuevaFase + "'.");
    }
  } catch (e) {
    // No lanzar: esta operaciÃ³n es de trazabilidad, no debe romper el flujo principal.
    Logger.log("âš ï¸ Error actualizando fase en pendiente_biometria (" + nuevaFase + "): " + e.message);
  }
}

// Trigger cada 10 min: captura nuevas biometrÃ­as de SAI
function consultarBiometriasPeriodicaAPI() {
  Logger.log("=== INICIO consultarBiometriasPeriodicaAPI ===");
  _capturarNuevasBiometrias();
  Logger.log("=== FIN consultarBiometriasPeriodicaAPI ===");
}

// Trigger cada hora: primer contacto (fase vacÃ­a) â†’ si ya pasaron >=4h desde fecha_resultado
// (cuando radicaciÃ³n le mandÃ³ su propio WA al aplazar por biometrÃ­a) y SAI sigue diciendo
// pendiente, se envÃ­a WhatsApp y se marca WA_ENVIADO. Corre independiente del corte de
// escalaciÃ³n para que el WA salga apenas se cumple la ventana, sin esperar al corte fijo
// siguiente â€” asÃ­ casos de un dÃ­a quedan con WA_ENVIADO listos para escalar desde el
// primer corte del dÃ­a siguiente (8am).
var VENTANA_HORAS_WA_BIOMETRIA = 4;
function cicloPrimerContactoBiometria() {
  Logger.log("=== INICIO cicloPrimerContactoBiometria ===");
  _enviarPrimerContactoBiometria();
  Logger.log("=== FIN cicloPrimerContactoBiometria ===");
}

// Calcula el inicio de la ventana de ~12h que se abre en el corte actual (8am o 12pm),
// usada por _archivarColaBiometriaVencida() para decidir quÃ© queda fuera de plazo.
// Los triggers reales corren en las ventanas 7-8am y 11-12pm (Apps Script no dispara al
// minuto exacto), asÃ­ que el corte de "12pm" normalmente se ejecuta con hora=11, todavÃ­a
// menor a 12. Por eso el corte se separa en el punto medio entre ambas ventanas (hora < 9),
// no en el mediodÃ­a exacto â€” de lo contrario el corte de 11-12 se clasificaba como si fuera
// el de 8am y usaba el umbral equivocado (mÃ¡s laxo: "ayer 12:00pm" en vez de "hoy 00:00").
// Corte 8am (hora < 9): la ventana que se abre es "ayer 12:00pmâ€“11:59pm" â†’ umbral = ayer 12:00pm.
// Corte 12pm (hora >= 9): la ventana que se abre es "hoy 00:00â€“11:59am" â†’ umbral = hoy 00:00.
// Se deriva de la hora real de ejecuciÃ³n (no de un parÃ¡metro fijo) para poder probarla manualmente.
function _calcularUmbralArchivoColaBiometria(ahora) {
  var base = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (ahora.getHours() < 9) {
    var ayerMediodia = new Date(base.getTime() - 12 * 60 * 60 * 1000);
    return { umbral: ayerMediodia, corteOrigen: "CORTE_8AM" };
  }
  return { umbral: base, corteOrigen: "CORTE_12PM" };
}

// Archiva a biometria_cola_archivada (mismo spreadsheet de pendiente_biometria) las
// solicitudes APROBADO_PENDIENTE_BIOMETRIA sin asignar en "solicitud" cuyo fechaResultado
// (con fallback a fechaRadicacion) sea anterior al umbral del corte actual â€” es decir, que
// tuvieron un ciclo completo de ~12h para ser llamadas y no se lograron asignar.
// Es una bandeja de solo revisiÃ³n manual: no hay reactivaciÃ³n automÃ¡tica.
function _archivarColaBiometriaVencida() {
  Logger.log("--- Archivado de cola de biometrÃ­a vencida ---");

  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  if (!hoja) { Logger.log("Hoja 'solicitud' no encontrada."); return; }

  var lastRow = hoja.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en 'solicitud'."); return; }

  var ahora = new Date();
  var vent = _calcularUmbralArchivoColaBiometria(ahora);

  // Fase 1 â€” sin lock: lectura y decisiÃ³n sobre los datos vigentes en este momento.
  var datos = hoja.getRange(2, 1, lastRow - 1, 58).getValues();
  var idsCandidatos = new Set();

  for (var i = 0; i < datos.length; i++) {
    var row = datos[i];
    var estado = String(row[16]).toUpperCase().trim();
    if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;
    var asignado = String(row[27]).trim();
    if (asignado !== "") continue;

    var solicitud = String(row[0]).trim();
    if (!solicitud) continue;

    var fecha = _parseFechaGAS(row[18]) || _parseFechaGAS(row[17]);
    if (!fecha) {
      Logger.log("âš ï¸ Solicitud " + solicitud + " sin fechaResultado ni fechaRadicacion parseable â€” no se archiva.");
      continue;
    }

    if (fecha.getTime() < vent.umbral.getTime()) {
      idsCandidatos.add(solicitud);
    }
  }

  if (idsCandidatos.size === 0) {
    Logger.log("âœ… No hay solicitudes fuera de ventana (" + vent.corteOrigen + ") para archivar.");
    return;
  }

  Logger.log(idsCandidatos.size + " solicitudes candidatas a archivar (" + vent.corteOrigen + ").");

  // Fase 2 â€” con lock, solo para actuar: re-leer y re-filtrar por si algÃºn analista tomÃ³
  // el caso entre la fase 1 y este punto (mismo patrÃ³n que limpiarBiometriasResueltas()).
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    Logger.log("âŒ Lock no disponible para archivar cola de biometrÃ­a: " + e.message);
    return;
  }

  try {
    var lastRowActual = hoja.getLastRow();
    if (lastRowActual < 2) return;
    var datosActuales = hoja.getRange(2, 1, lastRowActual - 1, 58).getValues();

    var filasAArchivar = [];
    for (var j = 0; j < datosActuales.length; j++) {
      var rowAct = datosActuales[j];
      var estadoAct = String(rowAct[16]).toUpperCase().trim();
      if (estadoAct !== "APROBADO_PENDIENTE_BIOMETRIA") continue;
      var asignadoAct = String(rowAct[27]).trim();
      if (asignadoAct !== "") continue;
      var solicitudAct = String(rowAct[0]).trim();
      if (!solicitudAct || !idsCandidatos.has(solicitudAct)) continue;
      filasAArchivar.push({ fila: j + 2, datosFila: rowAct });
    }

    if (filasAArchivar.length === 0) {
      Logger.log("â„¹ï¸ Las candidatas ya no estaban disponibles al momento de archivar (probablemente asignadas mientras tanto).");
      return;
    }

    var idsAQuitarDeSolicitud = new Set();
    filasAArchivar.forEach(function(item) {
      var solId = String(item.datosFila[0]).trim();
      idsAQuitarDeSolicitud.add(solId);
    });

    // Recorte en bloque en vez de deleteRow() por fila: con backlogs grandes (cientos de
    // filas), cientos de deleteRow() secuenciales son lentos y pueden agotar la cuota de
    // escritura del servicio de Sheets ("Service Spreadsheets failed..."). En su lugar se
    // reescribe toda la hoja de una sola vez, conservando el orden de las filas que quedan.
    var filasRestantes = datosActuales.filter(function(row) {
      return !idsAQuitarDeSolicitud.has(String(row[0]).trim());
    });

    hoja.getRange(2, 1, datosActuales.length, 58).clearContent();
    if (filasRestantes.length > 0) {
      hoja.getRange(2, 1, filasRestantes.length, 58).setValues(filasRestantes);
    }

    SpreadsheetApp.flush();
    Logger.log("âœ… " + idsAQuitarDeSolicitud.size + " solicitudes vencidas eliminadas de cola (" + vent.corteOrigen + ").");

    // Registrar en pendiente_biometria que estas solicitudes se vencieron sin ser asignadas.
    _actualizarFaseBiometriaPendiente(idsAQuitarDeSolicitud, "ARCHIVADA");
  } catch (e) {
    Logger.log("âŒ Error en _archivarColaBiometriaVencida: " + e.message);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

// Trigger 8am y 12pm: escala a la cola de asignaciÃ³n (llamada) los pendientes que ya
// estÃ¡n en fase WA_ENVIADO (segundo contacto) y SAI sigue diciendo pendiente.
// Si SAI ya no dice pendiente, el caso se marca resuelto y no se llama.
// TambiÃ©n, en este mismo corte: refresca fechaResultado contra SAI, archiva lo que agotÃ³
// su ventana de ~12h sin ser asignado, y solo entonces escala los nuevos pendientes.
function cicloBiometriaPendiente() {
  Logger.log("=== INICIO cicloBiometriaPendiente ===");
  limpiarBiometriasResueltas();
  _archivarColaBiometriaVencida();
  _procesarCortePendientes();
  Logger.log("=== FIN cicloBiometriaPendiente ===");
}

// Trigger cada hora: revisa las biometrÃ­as YA escaladas a la cola de asignaciÃ³n
// (solicitud, estado APROBADO_PENDIENTE_BIOMETRIA) contra SAI. Si el estado cambiÃ³ a
// algo distinto de APROBADO_PENDIENTE_BIOMETRIA/EN_ESTUDIO, se bajan de la cola para
// que ningÃºn analista llame a un cliente por un caso que ya se resolviÃ³ por otro lado.
function cicloLimpiezaBiometriaEscalada() {
  Logger.log("=== INICIO cicloLimpiezaBiometriaEscalada ===");
  limpiarBiometriasResueltas();
  Logger.log("=== FIN cicloLimpiezaBiometriaEscalada ===");
}

function enviarBroadcastInfobipConFilas(filasBiometria, hojaBio, filasSheet) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var baseUrl = props.getProperty('INFOBIP_BASE_URL');
  var templateName = props.getProperty('INFOBIP_TEMPLATE_NAME');
  var sender = props.getProperty('INFOBIP_SENDER');
  var headerImageUrl = props.getProperty('INFOBIP_HEADER_IMAGE_URL');

  if (!apiKey || !baseUrl || !templateName || !sender) {
    Logger.log("âš ï¸ Infobip no configurado. Broadcast no enviado.");
    return;
  }

  var url = "https://" + baseUrl + "/whatsapp/1/message/template";
  var enviados = 0;
  var errores = 0;
  var ahora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");

  for (var i = 0; i < filasBiometria.length; i++) {
    var fila = filasBiometria[i];
    var solicitudId = String(fila[0] || "").trim();
    var filaEnvioOk = false;

    for (var d = 0; d < 4; d++) {
      var base = 63 + (d * 3);
      var rol = String(fila[base] || "").trim();
      if (!rol) continue;
      var nombre = String(fila[base + 1] || "").trim();
      var telefono = String(fila[base + 2] || "").trim().replace(/\D/g, "");
      if (!telefono || !nombre) continue;

      if (telefono.length === 10 && telefono.charAt(0) === "3") {
        telefono = "57" + telefono;
      }

      var templateData = {
        body: { placeholders: [nombre, solicitudId] },
        buttons: [{ type: "QUICK_REPLY", parameter: solicitudId }]
      };
      if (headerImageUrl) {
        templateData.header = { type: "IMAGE", mediaUrl: headerImageUrl };
      }

      var payload = {
        messages: [{
          from: sender,
          to: telefono,
          content: {
            templateName: templateName,
            templateData: templateData,
            language: "es_CO"
          }
        }]
      };

      try {
        var response = UrlFetchApp.fetch(url, {
          method: "POST",
          contentType: "application/json",
          headers: { "Authorization": "App " + apiKey },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        var code = response.getResponseCode();
        if (code >= 200 && code < 300) {
          enviados++;
          filaEnvioOk = true;
          Logger.log("âœ… WA enviado â†’ " + rol + ": " + nombre + " | Tel: " + telefono + " | Sol: " + solicitudId);
        } else {
          errores++;
          Logger.log("âŒ WA fallÃ³ â†’ " + telefono + " | HTTP " + code);
        }
      } catch (e) {
        errores++;
        Logger.log("âŒ Error WA â†’ " + telefono + " | " + e.message);
      }

      Utilities.sleep(500);
    }

    var filaSheet = filasSheet[i];
    var estado = filaEnvioOk ? "ENVIADO" : "ERROR";
    hojaBio.getRange(filaSheet, 61).setValue(ahora);
    hojaBio.getRange(filaSheet, 62).setValue(estado);
  }

  SpreadsheetApp.flush();
  Logger.log("ðŸ“± Broadcast finalizado: " + enviados + " enviados, " + errores + " errores.");
}

function _consultarSaiIndividual(consecutivo) {
  const baseUrl = getEndPointNewSai();
  const keyFull_ = getKeyFull();
  if (!baseUrl || !keyFull_) return null;

  try {
    var response = UrlFetchApp.fetch(baseUrl + consecutivo, {
      method: "GET",
      muteHttpExceptions: true,
      headers: { "x-api-key": keyFull_, "Accept": "application/json" }
    });
    if (response.getResponseCode() !== 200) return null;
    return JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log("âš ï¸ Error consultando SAI para " + consecutivo + ": " + e.message);
    return null;
  }
}

// Wrapper sin argumentos: el botÃ³n "Ejecutar" del editor no permite pasar parÃ¡metros,
// asÃ­ que este es el que hay que seleccionar y correr directamente.
function diagnosticarDestinosBiometriaTest() {
  diagnosticarDestinosBiometria('12236327');
}

// DIAGNÃ“STICO MANUAL â€” correr desde el editor pasando un consecutivo, p.ej.
// diagnosticarDestinosBiometria('12236327'). Muestra en el log el resultCode real
// del inquilino y de cada codeudor tal como los devuelve SAI, para entender por quÃ©
// un caso queda sin destinatarios de WhatsApp (bio_destino_1..4 vacÃ­os â†’ estado ERROR).
function diagnosticarDestinosBiometria(consecutivo) {
  var item = _consultarSaiIndividual(String(consecutivo).trim());
  if (!item) {
    Logger.log("âŒ Sin respuesta de SAI para " + consecutivo);
    return;
  }
  Logger.log("studyStatus: " + item.studyStatus + " | mainResultCode: " + item.mainResultCode);
  Logger.log("Inquilino: " + item.tenantName + " | tel: " + item.tenantPhone + " | resultCode: " + item.resultCode);
  var codebtors = item.codebtors || [];
  Logger.log("Total codeudores en payload: " + codebtors.length);
  codebtors.forEach(function(c, i) {
    Logger.log("Codeudor " + (i + 1) + ": " + c.name + " | tel: " + c.phone + " | resultCode: " + c.resultCode);
  });
  Logger.log("JSON completo: " + JSON.stringify(item));
}

function diagnosticarFilaPendienteBiometriaTest() {
  diagnosticarFilaPendienteBiometria('12236327');
}

// DIAGNÃ“STICO MANUAL â€” lee la fila realmente guardada en pendiente_biometria (no lo
// que SAI dice ahora, que ya pudo haber cambiado): estado, fase de seguimiento, cuÃ¡ndo
// se consultÃ³ por Ãºltima vez, y quÃ© quedÃ³ en las columnas bio_destino_1..4.
function diagnosticarFilaPendienteBiometria(consecutivo) {
  var id = String(consecutivo).trim();
  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("Hoja vacÃ­a."); return; }

  var datos = hojaBio.getRange(2, 1, lastRow - 1, 76).getValues();
  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][0]).trim() !== id) continue;
    var row = datos[i];
    Logger.log("Fila " + (i + 2) + " | estadoGeneral: " + row[16] + " | fechaResultado: " + row[18]);
    Logger.log("fecha_consulta_sai: " + row[59] + " | fecha_envio_brodcast: " + row[60] + " | estado_brodcast: " + row[61] + " | nuevo_estado_sai: " + row[62]);
    Logger.log("fase_seguimiento_biometria: " + row[75]);
    for (var d = 0; d < 4; d++) {
      var base = 63 + (d * 3);
      Logger.log("bio_destino_" + (d + 1) + ": rol=" + row[base] + " nombre=" + row[base + 1] + " telefono=" + row[base + 2]);
    }
    return;
  }
  Logger.log("âš ï¸ No se encontrÃ³ la solicitud " + id + " en pendiente_biometria.");
}

function _homologarDatosApi(item) {
  var mapaTipos = { "TS": "NUEVA", "AD": "ADICIONAL", "RSD": "REESTUDIO", "RE": "REESTUDIO", "RC": "REESTUDIO", "IND": "INDUCCION" };
  var tipoOriginal = String(item.requestType || "").toUpperCase().trim();
  var claseNormalizada = mapaTipos[tipoOriginal] || tipoOriginal;
  var estadoGen = String(item.studyStatus || "").toUpperCase().trim();
  if (estadoGen.includes("EN ESTUDIO") && claseNormalizada === "") {
    claseNormalizada = "NUEVA";
  }

  var codeudores = [];
  if (item.codebtors && Array.isArray(item.codebtors)) {
    for (var ci = 0; ci < Math.min(item.codebtors.length, 3); ci++) {
      var c = item.codebtors[ci];
      codeudores.push({
        nombre: c.name || "", documento: c.document || "", tipoDoc: c.documentType || "",
        email: c.email || "", telefono: c.phone || "", estado: c.studyStatus || "",
        resultado: c.resultDescription || "", resultCode: String(c.resultCode || "").trim()
      });
    }
  }

  return {
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
    fechaResultado: item.lastMovementDate,
    clase: claseNormalizada,
    digitalUar: "No",
    canal: String(item.channel || "").trim(),
    codeudores: codeudores,
    resultCode: String(item.resultCode || "").trim()
  };
}

// Ley 2300 de 2023: las comunicaciones de cobranza (incluye WhatsApp) solo se pueden
// enviar lunes a viernes 7:00-19:00 y sÃ¡bados 8:00-15:00. Domingos y festivos, prohibido.
// Se valida aquÃ­ (y no solo confiando en el horario del trigger en GAS) para que el
// envÃ­o quede protegido aunque el trigger quede mal configurado o corra fuera de horario.
function _dentroDeVentanaLey2300() {
  var ahora = new Date();
  var fechaStr = Utilities.formatDate(ahora, "GMT-5", "yyyy-MM-dd");
  var horaStr = Utilities.formatDate(ahora, "GMT-5", "HH:mm");
  var horaNum = parseInt(horaStr.split(':')[0], 10) + parseInt(horaStr.split(':')[1], 10) / 60;

  // MediodÃ­a fijo para hallar el dÃ­a de la semana en zona BogotÃ¡ sin lÃ­os de DST/borde.
  var dow = new Date(fechaStr + "T12:00:00").getDay(); // 0=domingo â€¦ 6=sÃ¡bado
  if (dow === 0) return false;

  try {
    var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    var hojaFestivos = ss.getSheetByName("Festivos");
    if (hojaFestivos) {
      var valores = hojaFestivos.getDataRange().getValues();
      for (var i = 0; i < valores.length; i++) {
        var celda = valores[i][0];
        var fFestivo = celda instanceof Date ? celda : new Date(celda);
        if (!isNaN(fFestivo.getTime()) && Utilities.formatDate(fFestivo, "GMT-5", "yyyy-MM-dd") === fechaStr) {
          return false;
        }
      }
    }
  } catch (e) {
    Logger.log("âš ï¸ No se pudo verificar hoja Festivos para Ley 2300, se asume dÃ­a hÃ¡bil: " + e.message);
  }

  if (dow === 6) return horaNum >= 8 && horaNum < 15;
  return horaNum >= 7 && horaNum < 19;
}

// Primer contacto: evalÃºa pendientes en fase vacÃ­a, envÃ­a WhatsApp a los que ya
// cumplieron la ventana de 4h desde fecha_resultado y siguen pendientes en SAI.
function _enviarPrimerContactoBiometria() {
  Logger.log("--- Primer contacto: evaluaciÃ³n de pendientes en fase vacÃ­a ---");

  if (!_dentroDeVentanaLey2300()) {
    Logger.log("â¸ï¸ Fuera del horario permitido por Ley 2300 (L-V 7:00-19:00, SÃ¡b 8:00-15:00, no domingos/festivos). EnvÃ­o de WA pospuesto al prÃ³ximo corte hÃ¡bil.");
    return;
  }

  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var datos = hojaBio.getRange(2, 1, lastRow - 1, 76).getValues();

  var candidatos = [];
  for (var i = 0; i < datos.length; i++) {
    var fase = String(datos[i][75]).trim();
    if (fase !== "") continue; // solo primer contacto: fase vacÃ­a
    var consecutivo = String(datos[i][0]).trim();
    if (!consecutivo) continue;

    var fechaResultado = _parseFechaGAS(datos[i][18]); // fecha_resultado
    var horasDesdeResultado = fechaResultado ? (Date.now() - fechaResultado.getTime()) / 3600000 : null;
    if (fechaResultado !== null && horasDesdeResultado < VENTANA_HORAS_WA_BIOMETRIA) continue; // aÃºn no cumple ventana

    candidatos.push({ fila: i + 2, consecutivo: consecutivo, datosFila: datos[i] });
  }

  if (candidatos.length === 0) {
    Logger.log("No hay candidatos a primer contacto en esta corrida.");
    return;
  }

  Logger.log(candidatos.length + " candidatos a primer contacto a verificar.");

  var resultados = [];
  for (var p = 0; p < candidatos.length; p++) {
    var datosApi = _consultarSaiIndividual(candidatos[p].consecutivo);
    resultados.push({ item: candidatos[p], datosApi: datosApi });
    Utilities.sleep(1000);
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    Logger.log("âŒ Lock no disponible para primer contacto de biometrÃ­a: " + e.message);
    return;
  }

  try {
    var rowsParaWA = [];
    var filasParaWA = [];
    var ahora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");

    for (var r = 0; r < resultados.length; r++) {
      var item = resultados[r].item;
      var datosApi = resultados[r].datosApi;

      if (!datosApi) {
        Logger.log("âš ï¸ Sin respuesta API para " + item.consecutivo);
        continue;
      }

      var statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();
      hojaBio.getRange(item.fila, 63).setValue(statusActual); // nuevo_estado_sai

      if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA") {
        hojaBio.getRange(item.fila, 76).setValue("RESUELTA");
        hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
        Logger.log("âœ… " + item.consecutivo + " se resolviÃ³ solo (" + statusActual + ") â†’ cerrado, sin llamada.");
        continue;
      }

      rowsParaWA.push(item.datosFila);
      filasParaWA.push(item.fila);
      hojaBio.getRange(item.fila, 76).setValue("WA_ENVIADO");
      hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
      Logger.log("ðŸ“² " + item.consecutivo + " cumple ventana de " + VENTANA_HORAS_WA_BIOMETRIA + "h y sigue pendiente â†’ primer contacto (WhatsApp).");
    }

    SpreadsheetApp.flush();
    lock.releaseLock();

    if (rowsParaWA.length > 0) {
      enviarBroadcastInfobipConFilas(rowsParaWA, hojaBio, filasParaWA);
    }
  } catch (e) {
    Logger.log("âŒ Error en _enviarPrimerContactoBiometria: " + e.message);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

// ===================================================================
// UTILIDAD MANUAL â€” correr a demanda desde el editor de Apps Script cuando se
// necesite destrabar biometrÃ­as 02/500 o 02/503 que estÃ¡n en fase vacÃ­a
// esperando la ventana normal de VENTANA_HORAS_WA_BIOMETRIA horas (p.ej. un
// pico de solicitudes que no puede esperar el ciclo horario normal). EnvÃ­a el
// WhatsApp ya mismo, sin esperar la ventana, y marca WA_ENVIADO. No es un
// trigger automÃ¡tico: alguien tiene que ejecutarla a mano cada vez.
//
// Para escalar a asignaciÃ³n los que YA estaban en WA_ENVIADO antes de correr
// esta funciÃ³n, usa la funciÃ³n existente cicloBiometriaPendiente() (no hace
// falta duplicarla: no tiene espera de horario, solo revisa la fase).
//
// Importante: no correr cicloBiometriaPendiente() inmediatamente despuÃ©s de
// esta funciÃ³n en la misma sesiÃ³n â€” eso escalarÃ­a a llamada los casos reciÃ©n
// contactados por WhatsApp sin darles ni un minuto para responder, que es
// justo lo que la ventana normal evita. Dejar pasar un rato entre una y otra.
function forzarPrimerContactoBiometriaManual() {
  Logger.log("=== INICIO forzarPrimerContactoBiometriaManual ===");

  if (!_dentroDeVentanaLey2300()) {
    Logger.log("â¸ï¸ Fuera del horario permitido por Ley 2300 (L-V 7:00-19:00, SÃ¡b 8:00-15:00, no domingos/festivos). No se envÃ­a, ni siquiera forzado manualmente.");
    return;
  }

  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var datos = hojaBio.getRange(2, 1, lastRow - 1, 76).getValues();

  var candidatos = [];
  for (var i = 0; i < datos.length; i++) {
    var fase = String(datos[i][75]).trim();
    if (fase !== "") continue; // solo primer contacto: fase vacÃ­a
    var consecutivo = String(datos[i][0]).trim();
    if (!consecutivo) continue;
    candidatos.push({ fila: i + 2, consecutivo: consecutivo, datosFila: datos[i] });
  }

  if (candidatos.length === 0) {
    Logger.log("No hay candidatos en fase vacÃ­a para forzar.");
    return;
  }

  Logger.log(candidatos.length + " candidatos a forzar primer contacto (sin esperar ventana de " + VENTANA_HORAS_WA_BIOMETRIA + "h).");

  var resultados = [];
  for (var p = 0; p < candidatos.length; p++) {
    var datosApi = _consultarSaiIndividual(candidatos[p].consecutivo);
    resultados.push({ item: candidatos[p], datosApi: datosApi });
    Utilities.sleep(1000);
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    Logger.log("âŒ Lock no disponible para forzar primer contacto: " + e.message);
    return;
  }

  try {
    var rowsParaWA = [];
    var filasParaWA = [];
    var ahora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");

    for (var r = 0; r < resultados.length; r++) {
      var item = resultados[r].item;
      var datosApi = resultados[r].datosApi;

      if (!datosApi) {
        Logger.log("âš ï¸ Sin respuesta API para " + item.consecutivo);
        continue;
      }

      var statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();
      hojaBio.getRange(item.fila, 63).setValue(statusActual);

      if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA") {
        hojaBio.getRange(item.fila, 76).setValue("RESUELTA");
        hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
        Logger.log("âœ… " + item.consecutivo + " ya no estÃ¡ pendiente (" + statusActual + ") â†’ cerrado sin WA.");
        continue;
      }

      rowsParaWA.push(item.datosFila);
      filasParaWA.push(item.fila);
      hojaBio.getRange(item.fila, 76).setValue("WA_ENVIADO");
      hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
      Logger.log("ðŸ“² " + item.consecutivo + " forzado a WA_ENVIADO (sin esperar ventana).");
    }

    SpreadsheetApp.flush();
    lock.releaseLock();

    if (rowsParaWA.length > 0) {
      enviarBroadcastInfobipConFilas(rowsParaWA, hojaBio, filasParaWA);
    }
  } catch (e) {
    Logger.log("âŒ Error en forzarPrimerContactoBiometriaManual: " + e.message);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }

  Logger.log("=== FIN forzarPrimerContactoBiometriaManual ===");
}

// EscalaciÃ³n: pendientes que ya estÃ¡n en fase WA_ENVIADO (segundo contacto) y siguen
// pendientes en SAI se escalan a la cola de asignaciÃ³n (llamada).
function _procesarCortePendientes() {
  Logger.log("--- Corte de escalaciÃ³n de pendientes de biometrÃ­a ---");

  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var datos = hojaBio.getRange(2, 1, lastRow - 1, 76).getValues();

  var pendientes = [];
  for (var i = 0; i < datos.length; i++) {
    var fase = String(datos[i][75]).trim();
    if (fase !== "WA_ENVIADO") continue; // este corte solo escala casos que ya tuvieron su oportunidad por WhatsApp
    var consecutivo = String(datos[i][0]).trim();
    if (!consecutivo) continue;
    pendientes.push({ fila: i + 2, consecutivo: consecutivo, datosFila: datos[i] });
  }

  if (pendientes.length === 0) {
    Logger.log("No hay pendientes por escalar en este corte.");
    return;
  }

  Logger.log(pendientes.length + " pendientes a escalar en este corte.");

  var resultados = [];
  for (var p = 0; p < pendientes.length; p++) {
    var datosApi = _consultarSaiIndividual(pendientes[p].consecutivo);
    resultados.push({ item: pendientes[p], datosApi: datosApi });
    Utilities.sleep(1000);
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    Logger.log("âŒ Lock no disponible para procesar corte de pendientes: " + e.message);
    return;
  }

  try {
    var solicitudesParaAsignar = [];
    var ahora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");

    for (var r = 0; r < resultados.length; r++) {
      var item = resultados[r].item;
      var datosApi = resultados[r].datosApi;

      if (!datosApi) {
        Logger.log("âš ï¸ Sin respuesta API para " + item.consecutivo);
        continue;
      }

      var statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();
      hojaBio.getRange(item.fila, 63).setValue(statusActual); // nuevo_estado_sai

      if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA") {
        hojaBio.getRange(item.fila, 76).setValue("RESUELTA");
        hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
        Logger.log("âœ… " + item.consecutivo + " se resolviÃ³ solo (" + statusActual + ") â†’ cerrado, sin llamada.");
        continue;
      }

      solicitudesParaAsignar.push(_homologarDatosApi(datosApi));
      hojaBio.getRange(item.fila, 76).setValue("ESCALADA");
      hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
      Logger.log("ðŸ“ž " + item.consecutivo + " sigue pendiente tras WhatsApp â†’ escalado a asignaciÃ³n (llamada).");
    }

    SpreadsheetApp.flush();
    lock.releaseLock();

    if (solicitudesParaAsignar.length > 0) {
      procesarYGuardarLote(solicitudesParaAsignar);
      Logger.log("âœ… " + solicitudesParaAsignar.length + " solicitudes escaladas a la cola de asignaciÃ³n.");
    }

  } catch (e) {
    Logger.log("âŒ Error en _procesarCortePendientes: " + e.message);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}



// CORRECCIÃ“N PUNTUAL â€” correr una sola vez (o cuantas veces haga falta, es idempotente)
// para reparar casos que entraron a "solicitud" directo desde revisarEnEsperaCodeudor()
// (CÃ³digo.js) antes de que esa funciÃ³n enrutara APROBADO_PENDIENTE_BIOMETRIA hacia
// pendiente_biometria. Busca en "solicitud" filas con ese estado que no tengan su
// solicitud en pendiente_biometria, las re-consulta en SAI para reconstruir los datos
// completos, y si SAI confirma que siguen pendientes de biometrÃ­a las mueve a
// pendiente_biometria (fase vacÃ­a, como si hubieran entrado por el camino correcto) y
// las borra de "solicitud". Si SAI ya no dice pendiente, se deja la fila donde estÃ¡ y
// se loguea para revisiÃ³n manual (no se borra nada solo, para no perder el caso).
function corregirBiometriasMalEnrutadas() {
  Logger.log("=== INICIO corregirBiometriasMalEnrutadas ===");

  var ssSol = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hojaSol = ssSol.getSheetByName(SHEET_NAME_SOLICITUDES);
  if (!hojaSol || hojaSol.getLastRow() < 2) { Logger.log("No hay filas en solicitud."); return; }

  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var setIdsBio = getSetDeIds(hojaBio);

  var lastRowSol = hojaSol.getLastRow();
  var datosSol = hojaSol.getRange(2, 1, lastRowSol - 1, 17).getValues();

  var candidatos = [];
  for (var i = 0; i < datosSol.length; i++) {
    var estado = String(datosSol[i][16]).toUpperCase().trim();
    if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;

    var solId = String(datosSol[i][0]).trim();
    if (!solId || setIdsBio.has(solId)) continue; // ya estÃ¡ en pendiente_biometria, no es un caso mal enrutado

    candidatos.push({ fila: i + 2, solicitud: solId });
  }

  if (candidatos.length === 0) {
    Logger.log("âœ… No hay biometrÃ­as mal enrutadas en 'solicitud'.");
    return;
  }

  Logger.log(candidatos.length + " candidatos encontrados en 'solicitud' sin match en pendiente_biometria.");

  var paraMover = [];
  var idsAMover = new Set();
  var yaNoAplica = 0;

  for (var c = 0; c < candidatos.length; c++) {
    var datosApi = _consultarSaiIndividual(candidatos[c].solicitud);
    if (!datosApi) {
      Logger.log("âš ï¸ Sin respuesta API para " + candidatos[c].solicitud + ", se deja como estÃ¡.");
      continue;
    }

    var statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();
    if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA") {
      Logger.log("â„¹ï¸ " + candidatos[c].solicitud + " ya no estÃ¡ pendiente de biometrÃ­a (" + statusActual + "). Se deja en 'solicitud' para revisiÃ³n manual.");
      yaNoAplica++;
      continue;
    }

    if (!_esResultCodeBiometriaPendiente(datosApi.resultCode)) {
      Logger.log("â„¹ï¸ " + candidatos[c].solicitud + " sigue " + statusActual + " pero resultCode=" + datosApi.resultCode + " (no 500/503) â€” no se puede determinar a quiÃ©n contactar. Se deja en 'solicitud' para revisiÃ³n manual.");
      yaNoAplica++;
      continue;
    }

    paraMover.push(_homologarDatosApi(datosApi));
    idsAMover.add(candidatos[c].solicitud);
    Utilities.sleep(1000);
  }

  if (idsAMover.size > 0) {
    var lock = LockService.getScriptLock();
    try { lock.waitLock(30000); } catch (e) {
      Logger.log("âŒ Lock no disponible para mover biometrÃ­as mal enrutadas: " + e.message);
      return;
    }
    var filasBorradas = 0;
    try {
      // Re-leer justo antes de borrar por ID (no por el Ã­ndice capturado antes de las
      // consultas a SAI): entre esas consultas y este punto pudieron pasar varios
      // segundos, tiempo en el que otro proceso (asignaciÃ³n, etc.) pudo mover filas y
      // desfasar los Ã­ndices originales.
      var lastRowActual = hojaSol.getLastRow();
      if (lastRowActual >= 2) {
        var datosActuales = hojaSol.getRange(2, 1, lastRowActual - 1, 17).getValues();
        var filasABorrar = [];
        for (var k = 0; k < datosActuales.length; k++) {
          var idActual = String(datosActuales[k][0]).trim();
          var estadoActual = String(datosActuales[k][16]).toUpperCase().trim();
          if (idsAMover.has(idActual) && estadoActual === "APROBADO_PENDIENTE_BIOMETRIA") {
            filasABorrar.push(k + 2);
          }
        }
        filasABorrar.sort((a, b) => b - a).forEach(function(fila) { hojaSol.deleteRow(fila); });
        filasBorradas = filasABorrar.length;
        SpreadsheetApp.flush();
      }
    } finally {
      if (lock.hasLock()) lock.releaseLock();
    }

    _guardarLoteBiometriaPendiente(paraMover);
    Logger.log("âœ… " + filasBorradas + " biometrÃ­as movidas de 'solicitud' a pendiente_biometria (de " + idsAMover.size + " candidatas confirmadas).");
  }

  Logger.log("Resumen â€” movidas: " + idsAMover.size + " | ya no aplica (dejadas para revisiÃ³n manual): " + yaNoAplica);
  Logger.log("=== FIN corregirBiometriasMalEnrutadas ===");
}

// CORRECCIÃ“N PUNTUAL â€” correr una sola vez (idempotente) para el caso contrario a
// corregirBiometriasMalEnrutadas(): solicitudes que quedaron DUPLICADAS â€” presentes a la
// vez en "solicitud" (ya disponibles para llamar) y en pendiente_biometria con una fase
// que todavÃ­a no deberÃ­a permitir eso ("" = nunca contactado, "WA_ENVIADO" = contactado
// pero sin escalar, "RESUELTA" = ya cerrado en SAI). Solo cuando la fase es "ESCALADA" es
// correcto que coexistan en ambas hojas â€” ese es el estado normal post-escalaciÃ³n.
// Para los demÃ¡s casos, se borra la fila de "solicitud" y se deja pendiente_biometria
// intacta para que el caso siga su curso normal (WA en el prÃ³ximo ciclo horario si aplica,
// escalaciÃ³n en el prÃ³ximo corte 8am/12pm). No se toca nada en pendiente_biometria.
function corregirBiometriasDuplicadasEnCola() {
  Logger.log("=== INICIO corregirBiometriasDuplicadasEnCola ===");

  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRowBio = hojaBio.getLastRow();
  if (lastRowBio < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var fasesPorId = new Map();
  var datosBio = hojaBio.getRange(2, 1, lastRowBio - 1, 76).getValues();
  for (var b = 0; b < datosBio.length; b++) {
    var idBio = String(datosBio[b][0]).trim();
    if (!idBio) continue;
    fasesPorId.set(idBio, String(datosBio[b][75]).trim());
  }

  var ssSol = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hojaSol = ssSol.getSheetByName(SHEET_NAME_SOLICITUDES);
  if (!hojaSol || hojaSol.getLastRow() < 2) { Logger.log("No hay filas en solicitud."); return; }

  var lastRowSol = hojaSol.getLastRow();
  var datosSol = hojaSol.getRange(2, 1, lastRowSol - 1, 17).getValues();

  var idsABorrar = new Set();
  var detalle = [];

  for (var i = 0; i < datosSol.length; i++) {
    var estado = String(datosSol[i][16]).toUpperCase().trim();
    if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;

    var solId = String(datosSol[i][0]).trim();
    if (!solId || !fasesPorId.has(solId)) continue; // sin match en pendiente_biometria: eso lo cubre corregirBiometriasMalEnrutadas()

    var fase = fasesPorId.get(solId);
    if (fase === "ESCALADA") continue; // coexistencia correcta, no tocar

    idsABorrar.add(solId);
    detalle.push(solId + " (fase: " + (fase || "vacÃ­a") + ")");
  }

  if (idsABorrar.size === 0) {
    Logger.log("âœ… No hay duplicados indebidos entre 'solicitud' y pendiente_biometria.");
    return;
  }

  Logger.log(idsABorrar.size + " duplicados encontrados: " + detalle.join(", "));

  var lock = LockService.getScriptLock();
  try { lock.waitLock(60000); } catch (e) {
    Logger.log("âŒ Lock no disponible para limpiar duplicados: " + e.message + " â€” vuelve a correrla en un momento con menos actividad.");
    return;
  }
  try {
    // Re-leer justo antes de borrar (por ID, no por el Ã­ndice calculado arriba): la
    // espera del lock (hasta 60s bajo contenciÃ³n) es tiempo suficiente para que otro
    // proceso mueva filas y desfase los Ã­ndices originales. TambiÃ©n se vuelve a
    // consultar la fase en pendiente_biometria por si cambiÃ³ a ESCALADA mientras se
    // esperaba, en cuyo caso la coexistencia ya serÃ­a correcta y no hay que borrar.
    var lastRowBioActual = hojaBio.getLastRow();
    var fasesActuales = new Map();
    if (lastRowBioActual >= 2) {
      var datosBioActuales = hojaBio.getRange(2, 1, lastRowBioActual - 1, 76).getValues();
      for (var b2 = 0; b2 < datosBioActuales.length; b2++) {
        var idBio2 = String(datosBioActuales[b2][0]).trim();
        if (idBio2) fasesActuales.set(idBio2, String(datosBioActuales[b2][75]).trim());
      }
    }

    var lastRowSolActual = hojaSol.getLastRow();
    var filasABorrar = [];
    if (lastRowSolActual >= 2) {
      var datosSolActuales = hojaSol.getRange(2, 1, lastRowSolActual - 1, 17).getValues();
      for (var k = 0; k < datosSolActuales.length; k++) {
        var idActual = String(datosSolActuales[k][0]).trim();
        var estadoActual = String(datosSolActuales[k][16]).toUpperCase().trim();
        if (!idsABorrar.has(idActual) || estadoActual !== "APROBADO_PENDIENTE_BIOMETRIA") continue;
        if (fasesActuales.get(idActual) === "ESCALADA") continue; // ya escalÃ³ mientras se esperaba, correcto dejarlo
        filasABorrar.push(k + 2);
      }
    }

    filasABorrar.sort((a, b) => b - a).forEach(function(fila) { hojaSol.deleteRow(fila); });
    SpreadsheetApp.flush();
    Logger.log("âœ… " + filasABorrar.length + " filas duplicadas eliminadas de 'solicitud' (de " + idsABorrar.size + " candidatas confirmadas). Quedan intactas en pendiente_biometria siguiendo su fase actual.");
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }

  Logger.log("=== FIN corregirBiometriasDuplicadasEnCola ===");
}

// BACKFILL ÃšNICO â€” correr una sola vez, despuÃ©s de agregarColumnaFechaActualizacionFase(),
// para poblar fecha_actualizacion_fase en filas que ya tenÃ­an fase asignada antes de que
// existiera la columna. No existe un registro exacto de cuÃ¡ndo cambiÃ³ cada fase en el pasado
// (esa es justamente la brecha que esta columna cierra hacia adelante), asÃ­ que se usa el
// mejor proxy disponible por caso:
// - WA_ENVIADO â†’ fecha_envio_brodcast (mismo evento, exacto).
// - ESCALADA   â†’ fecha de asignaciÃ³n del caso en Historico_Gestiones (aproximada: el caso
//                pudo escalar un poco antes de que un analista lo tomara).
// - RESUELTA / cualquier otro valor â†’ no hay ningÃºn dato confiable, se deja vacÃ­a.
function backfillFechaActualizacionFase() {
  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var datos = hojaBio.getRange(2, 1, lastRow - 1, 76).getValues();
  var actuales = hojaBio.getRange(2, COL_FECHA_ACTUALIZACION_FASE, lastRow - 1, 1).getValues();

  // Mapa solId â†’ fechaAsig desde Historico_Gestiones, para aproximar ESCALADA.
  var mapaFechaAsignacion = new Map();
  try {
    var ssHist = SpreadsheetApp.openById(ID_WAREHOUSE_USUARIOS);
    var hojaHist = ssHist.getSheetByName("Historico_Gestiones");
    if (hojaHist && hojaHist.getLastRow() > 1) {
      var dataHist = hojaHist.getRange(2, 1, hojaHist.getLastRow() - 1, 25).getValues();
      for (var h = 0; h < dataHist.length; h++) {
        var solIdHist = String(dataHist[h][0]).trim();
        var fechaAsig = dataHist[h][24]; // columna 25: fechaAsig
        if (solIdHist && fechaAsig) mapaFechaAsignacion.set(solIdHist, fechaAsig);
      }
    }
  } catch (e) {
    Logger.log("âš ï¸ No se pudo leer Historico_Gestiones para aproximar ESCALADA: " + e.message);
  }

  var actualizaciones = [];
  var contadorWA = 0, contadorEscalada = 0;
  var sinDatoWA = 0, sinDatoEscalada = 0, sinDatoOtraFase = 0;

  for (var i = 0; i < datos.length; i++) {
    var yaTiene = String(actuales[i][0]).trim();
    if (yaTiene !== "") continue; // ya tiene fecha (cambio reciente, ya cubierto por el flujo nuevo)

    var fase = String(datos[i][75]).trim();
    if (fase === "") continue; // nunca contactado, no aplica

    if (fase === "WA_ENVIADO") {
      var fechaWA = datos[i][60]; // fecha_envio_brodcast
      if (fechaWA) {
        var valorWA = fechaWA instanceof Date ? Utilities.formatDate(fechaWA, "GMT-5", "yyyy-MM-dd HH:mm:ss") : String(fechaWA);
        actualizaciones.push({ fila: i + 2, valor: valorWA });
        contadorWA++;
      } else {
        sinDatoWA++;
      }
      continue;
    }

    if (fase === "ESCALADA") {
      var solId = String(datos[i][0]).trim();
      var fechaAsigEnc = mapaFechaAsignacion.get(solId);
      if (fechaAsigEnc) {
        var valorEsc = fechaAsigEnc instanceof Date ? Utilities.formatDate(fechaAsigEnc, "GMT-5", "yyyy-MM-dd HH:mm:ss") : String(fechaAsigEnc);
        actualizaciones.push({ fila: i + 2, valor: valorEsc });
        contadorEscalada++;
      } else {
        sinDatoEscalada++;
      }
      continue;
    }

    sinDatoOtraFase++; // RESUELTA u otro valor: sin dato confiable disponible
  }

  Logger.log("DiagnÃ³stico â€” filas con fase pero sin fecha_actualizacion_fase previa: " +
    "WA_ENVIADO sin fecha_envio_brodcast: " + sinDatoWA +
    " | ESCALADA sin match en Historico_Gestiones: " + sinDatoEscalada +
    " | RESUELTA/otro (esperado, sin proxy): " + sinDatoOtraFase +
    " | filas leÃ­das en Historico_Gestiones: " + mapaFechaAsignacion.size);

  if (actualizaciones.length === 0) {
    Logger.log("No hay filas para backfill (o ya todas tienen fecha_actualizacion_fase).");
    return;
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    Logger.log("âŒ Lock no disponible para backfill: " + e.message);
    return;
  }

  try {
    actualizaciones.forEach(function(u) {
      hojaBio.getRange(u.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(u.valor);
    });
    SpreadsheetApp.flush();
    Logger.log("âœ… Backfill completado â€” WA_ENVIADO: " + contadorWA + " | ESCALADA (aproximada): " + contadorEscalada +
      " | sin dato disponible: " + (sinDatoWA + sinDatoEscalada + sinDatoOtraFase));
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function _eliminarSolicitudDeCola(hojaSol, solId) {
  if (!hojaSol) return;
  var lastRow = hojaSol.getLastRow();
  if (lastRow < 2) return;
  var ids = hojaSol.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]).trim() === solId) {
      hojaSol.deleteRow(i + 2);
      return;
    }
  }
}

// PASO 2: Capturar nuevas biometrÃ­as desde la API
// Ãšnicos resultCode de SAI que indican biometrÃ­a genuinamente pendiente para la persona
// evaluada en ese registro (500 = pendiente, 503 = igual pendiente por otro motivo).
// Cualquier otro resultCode (aunque estadoGeneral siga APROBADO_PENDIENTE_BIOMETRIA) es
// el resultado de otra acciÃ³n no relacionada con biometrÃ­a â€” p.ej. evaluaciÃ³n de un
// codeudor, error de sistema â€” y NO debe usarse para decidir a quiÃ©n escribirle por
// WhatsApp ni para dejar entrar la solicitud a pendiente_biometria. Usado por los tres
// puntos que pueden insertar en esa hoja: _capturarNuevasBiometrias(),
// corregirBiometriasMalEnrutadas() y revisarEnEsperaCodeudor() (CÃ³digo.js).
function _esResultCodeBiometriaPendiente(resultCode) {
  var rc = String(resultCode || "").trim();
  return rc === "500" || rc === "503";
}

function _capturarNuevasBiometrias() {
  Logger.log("--- Paso 2: Captura de nuevas biometrÃ­as ---");

  var keyFull_ = getKeyFull();
  var endpointBase = getEndPointNewApiDate();
  if (!keyFull_ || !endpointBase) {
    Logger.log("âŒ Faltan credenciales o endpoint.");
    return;
  }

  var hoy = new Date();
  var fechaInicio = new Date();
  fechaInicio.setDate(hoy.getDate() - 3);
  var sIni = formatDateCustom(fechaInicio);
  var sFin = formatDateCustom(hoy);

  var TIPOS_EXCLUIR = new Set(["AC"]);
  var biometriasNuevas = [];
  var paginaActual = 1;
  var totalPaginas = 1;

  try {
    do {
      var url = endpointBase + '?startDate=' + sIni + '&endDate=' + sFin + '&page=' + paginaActual + '&size=200';
      Logger.log("[BiometrÃ­a] PÃ¡gina " + paginaActual + " consultando...");

      var response = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: { 'x-api-key': keyFull_, 'Accept': 'application/json' },
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        Logger.log("âŒ API error HTTP " + response.getResponseCode());
        break;
      }

      var json = JSON.parse(response.getContentText());
      totalPaginas = json.totalPages || 1;
      var contenido = json.content || [];

      contenido.forEach(function(item) {
        var esUar = (item.uar === true || String(item.uar).toLowerCase() === "true");
        if (esUar) return;

        var estadoGeneral = String(item.studyStatus || "").toUpperCase().trim();
        var tipoSolicitud = String(item.requestType || "").toUpperCase().trim();

        if (estadoGeneral !== "APROBADO_PENDIENTE_BIOMETRIA") return;
        if (!_esResultCodeBiometriaPendiente(item.resultCode)) return;
        if (String(item.mainResultCode) !== "2") return;
        if (TIPOS_EXCLUIR.has(tipoSolicitud)) return;

        biometriasNuevas.push(_homologarDatosApi(item));
      });

      paginaActual++;
      if (paginaActual <= totalPaginas) Utilities.sleep(2000);

    } while (paginaActual <= totalPaginas);

  } catch (e) {
    Logger.log("âŒ Error en consulta API biometrÃ­as: " + e.message);
    return;
  }

  if (biometriasNuevas.length === 0) {
    Logger.log("No se encontraron nuevas biometrÃ­as pendientes.");
    return;
  }

  Logger.log(biometriasNuevas.length + " biometrÃ­as candidatas encontradas.");
  _guardarLoteBiometriaPendiente(biometriasNuevas);
}

function _guardarLoteBiometriaPendiente(listaObjetos) {
  if (!listaObjetos || listaObjetos.length === 0) return;

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    Logger.log("âŒ Lock no disponible para guardar biometrÃ­as: " + e.message);
    return;
  }

  try {
    var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
    var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
    if (!hojaBio) throw new Error("Hoja pendiente_biometria no encontrada.");

    var setIdsBio = getSetDeIds(hojaBio);

    var ssSol = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    var hojaSol = ssSol.getSheetByName(SHEET_NAME_SOLICITUDES);
    var setIdsSol = hojaSol ? getSetDeIds(hojaSol) : new Set();

    var filas = [];
    var ahora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");
    var duplicados = 0;

    listaObjetos.forEach(function(item) {
      var solId = String(item.solicitud || "").trim();
      if (!solId) return;

      if (setIdsBio.has(solId) || setIdsSol.has(solId)) {
        duplicados++;
        return;
      }

      var est = String(item.estadoGeneral || "").toUpperCase();
      var fila = new Array(76).fill(""); // Ã­ndice 75 = fase_seguimiento_biometria, arranca vacÃ­a

      fila[0]  = solId;
      fila[1]  = item.poliza || "";
      fila[2]  = item.identificacionInquilino || "";
      fila[3]  = item.tipoIdentificacion || "";
      fila[4]  = item.nombreInquilino || "";
      fila[5]  = item.correoInquilino || "";
      fila[6]  = item.telefonoInquilino || "";
      fila[7]  = item.ingresos != null ? item.ingresos : "";
      fila[8]  = item.fechaExpedicion || "";
      fila[9]  = item.canon != null ? item.canon : "";
      fila[10] = item.cuota != null ? item.cuota : "";
      fila[11] = item.direccionInmueble || "";
      fila[12] = item.destinoInmueble || "";
      fila[13] = item.ciudadInmueble || "";
      fila[14] = item.nombreAsesor || "";
      fila[15] = item.correoAsesor || "";
      fila[16] = est;
      fila[20] = item.clase || "";
      fila[21] = item.digitalUar || "";
      fila[36] = item.canal || "";

      if (item.codeudores && item.codeudores.length > 0) {
        for (var ci = 0; ci < Math.min(item.codeudores.length, 3); ci++) {
          var base = 37 + (ci * 7);
          var cod = item.codeudores[ci];
          fila[base]     = cod.nombre || "";
          fila[base + 1] = cod.documento || "";
          fila[base + 2] = cod.tipoDoc || "";
          fila[base + 3] = cod.email || "";
          fila[base + 4] = cod.telefono || "";
          fila[base + 5] = cod.estado || "";
          fila[base + 6] = cod.resultado || "";
        }
      }

      [item.fechaRadicacion, item.fechaResultado].forEach(function(f, idx) {
        fila[17 + idx] = _normalizarFechaApiComoTexto(f);
      });

      fila[59] = ahora;  // fecha_consulta_sai

      var destIdx = 0;
      if (item.resultCode === "500" && destIdx < 4) {
        var baseD = 63 + (destIdx * 3);
        fila[baseD]     = "INQUILINO";
        fila[baseD + 1] = String(item.nombreInquilino || "").split(" ")[0];
        fila[baseD + 2] = String(item.telefonoInquilino || "").trim();
        destIdx++;
      }
      if (item.codeudores) {
        for (var cd = 0; cd < item.codeudores.length && destIdx < 4; cd++) {
          if (item.codeudores[cd].resultCode === "500") {
            var baseD2 = 63 + (destIdx * 3);
            fila[baseD2]     = "CODEUDOR";
            fila[baseD2 + 1] = String(item.codeudores[cd].nombre || "").split(" ")[0];
            fila[baseD2 + 2] = String(item.codeudores[cd].telefono || "").trim();
            destIdx++;
          }
        }
      }

      filas.push(fila);
      setIdsBio.add(solId);
    });

    if (filas.length > 0) {
      var rowInicio = hojaBio.getLastRow() + 1;
      var rango = hojaBio.getRange(rowInicio, 1, filas.length, 76);
      rango.setNumberFormat("@");
      rango.setValues(filas);
      SpreadsheetApp.flush();
      Logger.log("âœ… " + filas.length + " nuevas biometrÃ­as guardadas en pendiente_biometria. Duplicados: " + duplicados);

    } else {
      Logger.log("No se guardaron biometrÃ­as nuevas. Duplicados: " + duplicados);
    }

  } catch (e) {
    Logger.log("âŒ Error guardando biometrÃ­as: " + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function configurarInfobip() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('INFOBIP_API_KEY', 'cc0c476419eea6d179ad2136c13c0072-a919e025-1367-4775-bd25-7d69973a0df7');
  props.setProperty('INFOBIP_BASE_URL', 'yrrzxg.api.infobip.com');
  props.setProperty('INFOBIP_TEMPLATE_NAME', 'biometria_pendiente');
  props.setProperty('INFOBIP_SENDER', '573148390322');
  props.setProperty('INFOBIP_HEADER_IMAGE_URL', 'https://image.experienciasbolivar.segurosbolivar.com/lib/fe3511747364047b751475/m/1/58814996-8fab-4e04-a605-9d60ff14d81a.png');
  Logger.log("âœ… Propiedades de Infobip configuradas correctamente.");
}

// MIGRACIÃ“N ÃšNICA â€” correr manualmente una sola vez desde el editor. Reemplaza la
function testEnviarWhatsApp() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var baseUrl = props.getProperty('INFOBIP_BASE_URL');
  var templateName = props.getProperty('INFOBIP_TEMPLATE_NAME');
  var sender = props.getProperty('INFOBIP_SENDER');
  var headerImageUrl = props.getProperty('INFOBIP_HEADER_IMAGE_URL');

  var telefono = "573002720356";  // â† PON TU NÃšMERO AQUÃ (con 57)
  var nombre = "Santiago";
  var solicitud = "12345678";

  var templateData = {
    body: { placeholders: [nombre, solicitud] },
    buttons: [{ type: "QUICK_REPLY", parameter: solicitud }]
  };
  if (headerImageUrl) {
    templateData.header = { type: "IMAGE", mediaUrl: headerImageUrl };
  }

  var url = "https://" + baseUrl + "/whatsapp/1/message/template";
  var payload = {
    messages: [{
      from: sender,
      to: telefono,
      content: {
        templateName: templateName,
        templateData: templateData,
        language: "es_CO"
      }
    }]
  };

  var response = UrlFetchApp.fetch(url, {
    method: "POST",
    contentType: "application/json",
    headers: { "Authorization": "App " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log("HTTP " + response.getResponseCode());
  Logger.log(response.getContentText());
}

function testEnviarWhatsAppDuplicado() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var baseUrl = props.getProperty('INFOBIP_BASE_URL');
  var sender = props.getProperty('INFOBIP_SENDER');
  var templateName = 'duplicado_de_biometria_pendiente';

  var telefono = "573002720356";  // â† PON TU NÃšMERO AQUÃ (con 57)
  var nombre = "Santiago";
  var solicitud = "12345678";

  var templateData = {
    body: { placeholders: [nombre, solicitud] },
    header: { type: "IMAGE", mediaUrl: "https://image.experienciasbolivar.segurosbolivar.com/lib/fe3511747364047b751475/m/1/58814996-8fab-4e04-a605-9d60ff14d81a.png" },
    buttons: [{ type: "QUICK_REPLY", parameter: solicitud }]
  };

  var url = "https://" + baseUrl + "/whatsapp/1/message/template";
  var payload = {
    messages: [{
      from: sender,
      to: telefono,
      content: {
        templateName: templateName,
        templateData: templateData,
        language: "es_CO"
      }
    }]
  };

  var response = UrlFetchApp.fetch(url, {
    method: "POST",
    contentType: "application/json",
    headers: { "Authorization": "App " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log("HTTP " + response.getResponseCode());
  Logger.log(response.getContentText());
}

// Vocabulario de la columna "estado" de gestiÃ³n: SAI y los formularios manuales
// ya hablan ambos en masculino (APROBADO/APLAZADO/RECHAZADO), asÃ­ que no hace
// falta traducir nada al escribir el resultado de SAI.
var ESTADOS_FINALES_GESTION = new Set(['APROBADO', 'RECHAZADO']);
var VENTANA_DIAS_VERIFICACION_SAI = 3;

// Alcance de verificarAprobacionDesaplazamientos(): por ahora solo desaplazamiento e
// inducciÃ³n (columna 61 de Historico_Gestiones, el "tipo asignado"), no digital/canones
// altos. Ventana de 90 dÃ­as porque esa es la vigencia real de una solicitud â€” mÃ¡s allÃ¡
// de eso ya no tiene sentido seguir preguntÃ¡ndole a SAI.
var TIPOS_VERIFICACION_DESAPLAZAMIENTO_INDUCCION = new Set(['desaplazamiento', 'induccion']);
var VENTANA_DIAS_VERIFICACION_DESAPLAZAMIENTO_INDUCCION = 90;

/**
 * Verifica contra SAI el resultado real de los casos de desaplazamiento e inducciÃ³n
 * (Historico_Gestiones principal) que un analista dejÃ³ sin resoluciÃ³n definitiva
 * (aplazado, negado con motivo pendiente, etc.). No toca digital/canones altos.
 * DiseÃ±ada para ejecutarse con trigger diario de 4 a 5 pm.
 */
function verificarAprobacionDesaplazamientos() {
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hojaHist = ss.getSheetByName("Historico_Gestiones");
  if (!hojaHist) return { success: false, message: "Hoja Historico_Gestiones no encontrada." };

  const lastRow = hojaHist.getLastRow();
  if (lastRow < 2) return { success: false, message: "No hay datos en Historico_Gestiones." };

  const data = hojaHist.getRange(2, 1, lastRow - 1, 61).getValues();
  const limiteFecha = new Date();
  limiteFecha.setDate(limiteFecha.getDate() - VENTANA_DIAS_VERIFICACION_DESAPLAZAMIENTO_INDUCCION);

  var candidatos = [];
  for (var i = 0; i < data.length; i++) {
    var fechaAsig = data[i][24];
    var solicitudId = String(data[i][0]).trim();
    var estadoActual = String(data[i][16]).toUpperCase().trim();
    var tipoAsignado = String(data[i][60]).trim().toLowerCase();

    if (!TIPOS_VERIFICACION_DESAPLAZAMIENTO_INDUCCION.has(tipoAsignado)) continue;
    if (!(fechaAsig instanceof Date)) continue;
    if (fechaAsig < limiteFecha) continue;
    if (!solicitudId) continue;
    if (ESTADOS_FINALES_GESTION.has(estadoActual)) continue;

    candidatos.push({ filaReal: i + 2, solicitudId: solicitudId, estadoActual: estadoActual });
  }

  if (candidatos.length === 0) {
    return { success: true, message: "No hay casos pendientes de verificaciÃ³n.", totalRevisados: 0, totalActualizados: 0, detalles: [] };
  }

  var endpoint = getEndPointNewSai();
  var apiKey = getKeyFull();
  if (!endpoint || !apiKey) return { success: false, message: "Endpoint o API key de SAI no configurados." };

  // Consultar SAI candidato por candidato ANTES de tomar el lock: son llamadas HTTP
  // con pausa de 2s entre cada una, y no deben retener el ScriptLock global que
  // tambiÃ©n usan la asignaciÃ³n de casos y el resto del sistema.
  var actualizaciones = [];
  var detalles = [];

  for (var j = 0; j < candidatos.length; j++) {
    var c = candidatos[j];
    try {
      var response = UrlFetchApp.fetch(endpoint + c.solicitudId, {
        method: "GET",
        muteHttpExceptions: true,
        headers: { "x-api-key": apiKey, "Accept": "application/json" }
      });

      if (response.getResponseCode() === 200) {
        var jsonData = JSON.parse(response.getContentText());
        var studyStatus = String(jsonData.studyStatus || "").toUpperCase().trim();

        if (ESTADOS_FINALES_GESTION.has(studyStatus)) {
          actualizaciones.push({ filaReal: c.filaReal, estado: studyStatus });
          detalles.push({ solicitudId: c.solicitudId, estado: "ACTUALIZADO", detalle: studyStatus });
        } else {
          detalles.push({ solicitudId: c.solicitudId, estado: "SIN_CAMBIO", detalle: studyStatus || "sin estado" });
        }
      } else {
        detalles.push({ solicitudId: c.solicitudId, estado: "ERROR_HTTP", detalle: "HTTP " + response.getResponseCode() });
      }
    } catch (e) {
      detalles.push({ solicitudId: c.solicitudId, estado: "ERROR", detalle: e.message });
    }

    if (j < candidatos.length - 1) Utilities.sleep(2000);
  }

  if (actualizaciones.length === 0) {
    return {
      success: true,
      message: "VerificaciÃ³n completada. 0 de " + candidatos.length + " actualizados.",
      totalRevisados: candidatos.length,
      totalActualizados: 0,
      detalles: detalles
    };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return { success: false, message: "No se pudo adquirir el lock. Intenta mÃ¡s tarde." };
  }

  try {
    actualizaciones.forEach(function(u) {
      hojaHist.getRange(u.filaReal, 17).setValue(u.estado);
    });
    SpreadsheetApp.flush();

    return {
      success: true,
      message: "VerificaciÃ³n completada. " + actualizaciones.length + " de " + candidatos.length + " actualizados.",
      totalRevisados: candidatos.length,
      totalActualizados: actualizaciones.length,
      detalles: detalles
    };
  } catch (error) {
    return { success: false, message: "Error interno: " + error.toString() };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function triggerVerificacionDesaplazamientos() {
  try {
    var resultado = verificarAprobacionDesaplazamientos();
    Logger.log("VerificaciÃ³n desaplazamientos: " + resultado.totalRevisados + " revisados, " + resultado.totalActualizados + " actualizados.");
  } catch (e) {
    Logger.log("Error en trigger verificaciÃ³n desaplazamientos: " + e.message);
  }
}

/**
 * `verificarAprobacionDesaplazamientos()` ya cubre `induccion` explÃ­citamente (mismo
 * Historico_Gestiones, mismo filtro de tipo). Este wrapper es 100% redundante â€” si el
 * trigger `triggerVerificacionInducciones` sigue activo en la UI de Apps Script junto
 * al de `triggerVerificacionDesaplazamientos`, hay que borrar uno de los dos: ambos
 * corren exactamente el mismo trabajo y disparar los dos duplica innecesariamente las
 * llamadas a SAI (y el riesgo de que la ejecuciÃ³n se pase del tiempo lÃ­mite).
 */
function verificarResultadoInducciones() {
  return verificarAprobacionDesaplazamientos();
}

function triggerVerificacionInducciones() {
  try {
    var resultado = verificarResultadoInducciones();
    Logger.log("VerificaciÃ³n inducciones: " + resultado.totalRevisados + " revisados, " + resultado.totalActualizados + " actualizados.");
  } catch (e) {
    Logger.log("Error en trigger verificaciÃ³n inducciones: " + e.message);
  }
}

/**
 * Verifica contra SAI el resultado real de los casos de reestudio/nuevaUar/deudorUar
 * que un analista dejÃ³ sin resoluciÃ³n definitiva. Estos tipos viven en una hoja de
 * cÃ¡lculo distinta (ID_HOJA_REESTUDIOS), con su propio esquema de columnas:
 * solicitudId en B (2), fechaAsignacion en I (9), estadoGestion en K (11).
 * Requiere un trigger de tiempo propio (agregar manualmente en la UI de Apps Script,
 * 16:00-17:00, apuntando a triggerVerificacionReestudiosUar).
 */
function verificarAprobacionReestudiosUar() {
  const ss = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
  const hojaHist = ss.getSheetByName("Historico_Gestiones");
  if (!hojaHist) return { success: false, message: "Hoja Historico_Gestiones no encontrada." };

  const lastRow = hojaHist.getLastRow();
  if (lastRow < 2) return { success: false, message: "No hay datos en Historico_Gestiones." };

  const data = hojaHist.getRange(2, 1, lastRow - 1, 11).getValues();
  const limiteFecha = new Date();
  limiteFecha.setDate(limiteFecha.getDate() - VENTANA_DIAS_VERIFICACION_SAI);

  var candidatos = [];
  for (var i = 0; i < data.length; i++) {
    var solicitudId = String(data[i][1]).trim();
    var fechaAsig = data[i][8];
    var estadoActual = String(data[i][10]).toUpperCase().trim();

    if (!(fechaAsig instanceof Date)) continue;
    if (fechaAsig < limiteFecha) continue;
    if (!solicitudId) continue;
    if (ESTADOS_FINALES_GESTION.has(estadoActual)) continue;

    candidatos.push({ filaReal: i + 2, solicitudId: solicitudId, estadoActual: estadoActual });
  }

  if (candidatos.length === 0) {
    return { success: true, message: "No hay casos pendientes de verificaciÃ³n.", totalRevisados: 0, totalActualizados: 0, detalles: [] };
  }

  var endpoint = getEndPointNewSai();
  var apiKey = getKeyFull();
  if (!endpoint || !apiKey) return { success: false, message: "Endpoint o API key de SAI no configurados." };

  // Consultar SAI candidato por candidato ANTES de tomar el lock: son llamadas HTTP
  // con pausa de 2s entre cada una, y no deben retener el ScriptLock global que
  // tambiÃ©n usan la asignaciÃ³n de casos y el resto del sistema.
  var actualizaciones = [];
  var detalles = [];

  for (var j = 0; j < candidatos.length; j++) {
    var c = candidatos[j];
    try {
      var response = UrlFetchApp.fetch(endpoint + c.solicitudId, {
        method: "GET",
        muteHttpExceptions: true,
        headers: { "x-api-key": apiKey, "Accept": "application/json" }
      });

      if (response.getResponseCode() === 200) {
        var jsonData = JSON.parse(response.getContentText());
        var studyStatus = String(jsonData.studyStatus || "").toUpperCase().trim();

        if (ESTADOS_FINALES_GESTION.has(studyStatus)) {
          actualizaciones.push({ filaReal: c.filaReal, estado: studyStatus });
          detalles.push({ solicitudId: c.solicitudId, estado: "ACTUALIZADO", detalle: studyStatus });
        } else {
          detalles.push({ solicitudId: c.solicitudId, estado: "SIN_CAMBIO", detalle: studyStatus || "sin estado" });
        }
      } else {
        detalles.push({ solicitudId: c.solicitudId, estado: "ERROR_HTTP", detalle: "HTTP " + response.getResponseCode() });
      }
    } catch (e) {
      detalles.push({ solicitudId: c.solicitudId, estado: "ERROR", detalle: e.message });
    }

    if (j < candidatos.length - 1) Utilities.sleep(2000);
  }

  if (actualizaciones.length === 0) {
    return {
      success: true,
      message: "VerificaciÃ³n completada. 0 de " + candidatos.length + " actualizados.",
      totalRevisados: candidatos.length,
      totalActualizados: 0,
      detalles: detalles
    };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return { success: false, message: "No se pudo adquirir el lock. Intenta mÃ¡s tarde." };
  }

  try {
    actualizaciones.forEach(function(u) {
      hojaHist.getRange(u.filaReal, 11).setValue(u.estado);
    });
    SpreadsheetApp.flush();

    return {
      success: true,
      message: "VerificaciÃ³n completada. " + actualizaciones.length + " de " + candidatos.length + " actualizados.",
      totalRevisados: candidatos.length,
      totalActualizados: actualizaciones.length,
      detalles: detalles
    };
  } catch (error) {
    return { success: false, message: "Error interno: " + error.toString() };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function triggerVerificacionReestudiosUar() {
  try {
    var resultado = verificarAprobacionReestudiosUar();
    Logger.log("VerificaciÃ³n reestudios/UAR: " + resultado.totalRevisados + " revisados, " + resultado.totalActualizados + " actualizados.");
  } catch (e) {
    Logger.log("Error en trigger verificaciÃ³n reestudios/UAR: " + e.message);
  }
}