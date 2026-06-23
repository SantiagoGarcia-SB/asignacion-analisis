// OBSOLETA: biometrías ahora se toman de la hoja "solicitud" en ID_WAREHOUSE_USUARIOS
// const ID_SHEET_ORIGEN = '1tmXIxNB65eAUQah8dxvSJSJVKmR25ZiuM59SLX0NYME';
// OBSOLETA: biometría ahora usa Historico_Gestiones en ID_WAREHOUSE_USUARIOS
// const ID_SHEET_GESTION = '1lT9BxWAKgo9xed9xaAbbFqna304TWNbzL3v2302ZvOQ';
const ID_WAREHOUSE_USUARIOS = '1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0';

function getEndPointNewApiDate() { return PropertiesService.getScriptProperties().getProperty('endPointSaiNewApiDate'); }
function getEndPointNewSai() { return PropertiesService.getScriptProperties().getProperty('endpointSaiNewApi'); }
function getKeyFull() { return PropertiesService.getScriptProperties().getProperty('KeyEndPointSaiFullProd'); }

function formatDateCustom(date) {
  const year = date.getFullYear();
  const month = ("0" + (date.getMonth() + 1)).slice(-2);
  const day = ("0" + date.getDate()).slice(-2);
  return `${year}${month}${day}`;
}

// SUSPENDIDA: biometrías ahora se toman de la hoja "solicitud" (APROBADO_PENDIENTE_BIOMETRIA)
function descargarBiometriasAPI() {
  Logger.log("descargarBiometriasAPI SUSPENDIDA — biometrías se toman de hoja solicitud");
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
    console.error("updateBiometriagpt - Excepción para solicitud " + solicitud + ": " + e.toString());
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

function limpiarBiometriasResueltas() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log("❌ Lock no disponible para limpiar biometrías: " + e.message);
    return;
  }

  try {
    const ss = SpreadsheetApp.openById(ID_WAREHOUSE_USUARIOS);
    const hoja = ss.getSheetByName("solicitud");
    if (!hoja) { Logger.log("Hoja 'solicitud' no encontrada."); return; }

    const lastRow = hoja.getLastRow();
    if (lastRow < 2) return;

    const datos = hoja.getRange(2, 1, lastRow - 1, 17).getValues();
    const baseUrl = getEndPointNewSai();
    const keyFull = getKeyFull();
    if (!baseUrl || !keyFull) { Logger.log("❌ Faltan credenciales API."); return; }

    const ESTADOS_CONSERVAR = new Set(["APROBADO_PENDIENTE_BIOMETRIA", "EN_ESTUDIO"]);
    const filasAEliminar = [];

    for (let i = 0; i < datos.length; i++) {
      const estadoLocal = String(datos[i][16]).toUpperCase().trim();
      if (estadoLocal !== "APROBADO_PENDIENTE_BIOMETRIA") continue;

      const solicitud = String(datos[i][0]).trim();
      if (!solicitud) continue;

      try {
        const response = UrlFetchApp.fetch(baseUrl + solicitud, {
          method: "GET",
          muteHttpExceptions: true,
          headers: { "x-api-key": keyFull, "Accept": "application/json" }
        });

        if (response.getResponseCode() !== 200) {
          Logger.log("⚠️ API error HTTP " + response.getResponseCode() + " para solicitud " + solicitud + " — se conserva.");
          continue;
        }

        const statusApi = String(JSON.parse(response.getContentText()).studyStatus || "").toUpperCase().trim();
        if (!ESTADOS_CONSERVAR.has(statusApi)) {
          filasAEliminar.push(i + 2);
          Logger.log("🗑️ Solicitud " + solicitud + " cambió a " + statusApi + " — marcada para eliminar.");
        }

        Utilities.sleep(500);
      } catch (e) {
        Logger.log("⚠️ Error consultando solicitud " + solicitud + ": " + e.message + " — se conserva.");
      }
    }

    for (let j = filasAEliminar.length - 1; j >= 0; j--) {
      hoja.deleteRow(filasAEliminar[j]);
    }

    if (filasAEliminar.length > 0) {
      SpreadsheetApp.flush();
      Logger.log("✅ " + filasAEliminar.length + " biometrías resueltas eliminadas de la hoja solicitud.");
    } else {
      Logger.log("✅ Ninguna biometría resuelta para eliminar.");
    }
  } catch (e) {
    Logger.log("❌ Error en limpiarBiometriasResueltas: " + e.message);
  } finally {
    lock.releaseLock();
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
    return { success: false, message: "El sistema está asignando casos a otros compañeros. Reintenta en unos segundos." };
  }

  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();

    const ssWarehouse = SpreadsheetApp.openById(ID_WAREHOUSE_USUARIOS);
    const hojaUsuarios = ssWarehouse.getSheetByName("Usuarios");
    const dataUsuarios = hojaUsuarios.getDataRange().getValues();
    const usuario = dataUsuarios.find(u => String(u[2]).trim().toLowerCase() === userEmail);

    if (!usuario) return { success: false, message: "Usuario no registrado" };
    if (String(usuario[5]).toUpperCase().trim() !== "ACTIVO") return { success: false, message: "Usuario no está activo" };

    const permisoCheck = verificarPermisoVigenteHoy();
    if (permisoCheck.tienePermiso) return { success: false, message: "⛔ Tienes un permiso vigente (" + permisoCheck.tipo + "). No puedes recibir casos hoy." };

    const capTotal = parseInt(usuario[6]) || 0;
    const nombreAnalista = String(usuario[1]).trim();
    if (capTotal <= 0) return { success: false, message: "Capacidad inválida o en 0" };

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

    if (conteoHoyBio >= cupoBioDiario) return { success: false, message: "Cupo diario de biometría alcanzado (" + cupoBioDiario + ")." };
    const cupoRestanteBio = cupoBioDiario - conteoHoyBio;
    if (cupoDisponible > cupoRestanteBio) cupoDisponible = cupoRestanteBio;

    const hojaSolicitud = ssWarehouse.getSheetByName("solicitud");
    if (!hojaSolicitud || hojaSolicitud.getLastRow() < 2) return { success: false, message: "No hay biometrías pendientes en la base." };

    const lastRowSol = hojaSolicitud.getLastRow();
    const datosSol = hojaSolicitud.getRange(2, 1, lastRowSol - 1, 38).getValues();

    let candidatosParaAsignar = [];

    for (let i = 0; i < datosSol.length; i++) {
      if (cupoDisponible <= 0) break;

      const row = datosSol[i];
      const id = String(row[0]).trim();
      if (!id) continue;

      const estado = String(row[16]).toUpperCase().trim();
      const asignado = String(row[27]).trim();

      if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;
      if (asignado !== "") continue;
      if (idsEnGestion.has(id)) continue;

      candidatosParaAsignar.push({ row: row, sheetRowIndex: i + 2 });
      idsEnGestion.add(id);
      cupoDisponible--;
    }

    if (candidatosParaAsignar.length === 0) {
      return { success: false, message: "No hay biometrías pendientes validadas." };
    }

    const fechaAsignacion = new Date();
    const filasAEliminar = [];
    const filasHist = [];

    candidatosParaAsignar.forEach(candidato => {
      const row = candidato.row;

      const histRow = new Array(37).fill("");
      for (let c = 0; c < 22; c++) histRow[c] = row[c] !== undefined ? row[c] : "";
      histRow[24] = fechaAsignacion;
      histRow[25] = userEmail;
      histRow[27] = nombreAnalista;
      histRow[32] = row[36] || "";
      // Para biometría: fechaDiligenciadaRadicación (col 34) = fechaAsignación
      histRow[33] = fechaAsignacion;
      histRow[34] = 0;
      histRow[35] = 0;
      histRow[36] = 0;

      filasHist.push(histRow);
      filasAEliminar.push(candidato.sheetRowIndex);
    });

    hojaHist.getRange(lastRowHist + 1, 1, filasHist.length, 37).setValues(filasHist);

    filasAEliminar.sort((a, b) => b - a).forEach(fila => {
      hojaSolicitud.deleteRow(fila);
    });

    SpreadsheetApp.flush();

    return { success: true, message: `Se te asignaron ${filasHist.length} nuevas solicitudes.`, nueva: true };

  } catch (error) {
    return { success: false, message: "Error interno: " + error.toString() };
  } finally {
    if(lock.hasLock()) lock.releaseLock();
  }
}

function guardarGestionBiometria(idSolicitud, datosFormulario) {
  const lock = LockService.getUserLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "El sistema está ocupado. Intenta de nuevo." };
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
        const motivoAplaz = resFinal === 'APLAZADA' ? (datosFormulario.motivoAplazamiento || '') : '';

        // Col Q (17): estado → resultado final
        hojaHist.getRange(filaReal, 17).setValue(resFinal);
        // Col U (21): clase → BIOMETRIA
        hojaHist.getRange(filaReal, 21).setValue('BIOMETRIA');
        // Col AM (39): resultado_llamada_desaplazamiento_biometria
        hojaHist.getRange(filaReal, 39).setValue(datosFormulario.resLlamada || '');
        // Col X (24): observaciones → vacío para biometría
        hojaHist.getRange(filaReal, 24).setValue('');
        // Col AA (27): fecha fin gestión
        hojaHist.getRange(filaReal, 27).setValue(ahora).setNumberFormat("dd/mm/yyyy HH:mm:ss");
        // Col AC-AD (29-30): motivo aplazamiento, motivo negación
        hojaHist.getRange(filaReal, 29, 1, 2).setValues([[motivoAplaz, '']]);
        // Col AE (31): fecha solo día
        hojaHist.getRange(filaReal, 31).setValue(fechaSoloDia);

        // Calcular tiempos SLA: fechaDiligenciadaRadicación (col 34) y fechaAsignación (col 25)
        const fechaDiligenciada = _parseFechaGAS(fila[33]);
        const fechaAsignacion = _parseFechaGAS(fila[24]);
        const tiempos = calcularTiemposCaso(fechaDiligenciada, fechaAsignacion, ahora, userEmail);
        hojaHist.getRange(filaReal, 35, 1, 3).setValues([[tiempos.minutos_cola, tiempos.minutos_gestion, tiempos.minutos_general]]);
        hojaHist.getRange(filaReal, 35, 1, 3).setNumberFormat("0.00");

        SpreadsheetApp.flush();
        lock.releaseLock();

        return { success: true, message: "Gestión guardada correctamente.", disparaAsignacion: true };
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
        "",                     // [2] (vacío)
        polizaVal,              // [3] poliza
        inmoVal,                // [4] inmobiliaria
        String(hist[13] || ""), // [5] ciudad
        String(hist[0] || ""),  // [6] solicitud
        hist[9] || 0,           // [7] canon
        String(hist[6] || ""),  // [8] celular/telefono
        "",                     // [9] (vacío)
        String(hist[11] || ""), // [10] direccion
        String(hist[4] || ""),  // [11] nombreInquilino
        "",                     // [12] (vacío)
        String(hist[16] || ""), // [13] estadoGeneral
        "",                     // [14] (vacío)
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