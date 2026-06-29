// OBSOLETA: biometrías ahora se toman de la hoja "solicitud" en ID_WAREHOUSE_USUARIOS
// const ID_SHEET_ORIGEN = '1tmXIxNB65eAUQah8dxvSJSJVKmR25ZiuM59SLX0NYME';
// OBSOLETA: biometría ahora usa Historico_Gestiones en ID_WAREHOUSE_USUARIOS
// const ID_SHEET_GESTION = '1lT9BxWAKgo9xed9xaAbbFqna304TWNbzL3v2302ZvOQ';
const ID_WAREHOUSE_USUARIOS = '1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0';
const ID_SHEET_BIOMETRIA_PENDIENTE = '1gHW1RFMVd0h4HZr2xTrFnx-A5Pk_npJs-bAk8GOx2h0';
const NOMBRE_HOJA_PENDIENTE_BIOMETRIA = 'pendiente_biometria';

function getEndPointNewApiDate() { return PropertiesService.getScriptProperties().getProperty('endPointSaiNewApiDate'); }
function getEndPointNewSai() { return PropertiesService.getScriptProperties().getProperty('endpointSaiNewApi'); }

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

    const bioIds = new Set();

    for (let i = 0; i < datos.length; i++) {
      const estado = String(datos[i][16]).toUpperCase().trim();
      if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;

      const solicitud = String(datos[i][0]).trim();
      if (!solicitud) continue;
      bioIds.add(solicitud);
    }

    if (bioIds.size === 0) {
      Logger.log("✅ No hay biometrías pendientes para revisar.");
      return;
    }

    Logger.log("📋 " + bioIds.size + " biometrías pendientes a verificar contra SAI.");

    const endpointBase = getEndPointNewApiDate();
    const keyFull = getKeyFull();
    if (!endpointBase || !keyFull) { Logger.log("❌ Faltan credenciales API."); return; }

    const hace4Dias = new Date();
    hace4Dias.setDate(hace4Dias.getDate() - 4);
    const sIni = formatDateCustom(hace4Dias);
    const sFin = formatDateCustom(new Date());

    const estadosSai = new Map();
    let paginaActual = 1;
    let totalPaginas = 1;

    do {
      const url = endpointBase + '?startDate=' + sIni + '&endDate=' + sFin + '&page=' + paginaActual + '&size=200';
      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: { 'x-api-key': keyFull, 'Accept': 'application/json' },
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        Logger.log("❌ API error HTTP " + response.getResponseCode() + " en página " + paginaActual);
        break;
      }

      const json = JSON.parse(response.getContentText());
      totalPaginas = json.totalPages || 1;
      const contenido = json.content || [];

      contenido.forEach(function(item) {
        const id = String(item.consecutive || "").trim();
        if (id && bioIds.has(id)) {
          estadosSai.set(id, String(item.studyStatus || "").toUpperCase().trim());
        }
      });

      Logger.log("Página " + paginaActual + "/" + totalPaginas + " — " + contenido.length + " registros. Encontradas: " + estadosSai.size + "/" + bioIds.size);

      if (estadosSai.size >= bioIds.size) {
        Logger.log("✅ Todas las biometrías encontradas en SAI. Deteniendo paginación.");
        break;
      }

      paginaActual++;
      if (paginaActual <= totalPaginas) Utilities.sleep(2000);
    } while (paginaActual <= totalPaginas);

    const ESTADOS_CONSERVAR = new Set(["APROBADO_PENDIENTE_BIOMETRIA", "EN_ESTUDIO"]);
    const filasAEliminar = [];

    for (let i = 0; i < datos.length; i++) {
      const estado = String(datos[i][16]).toUpperCase().trim();
      if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;

      const solicitud = String(datos[i][0]).trim();
      if (!solicitud) continue;

      const statusSai = estadosSai.get(solicitud);
      if (statusSai && !ESTADOS_CONSERVAR.has(statusSai)) {
        filasAEliminar.push(i + 2);
        Logger.log("🗑️ Solicitud " + solicitud + " cambió a " + statusSai);
      }
    }

    for (let j = filasAEliminar.length - 1; j >= 0; j--) {
      hoja.deleteRow(filasAEliminar[j]);
    }

    if (filasAEliminar.length > 0) {
      SpreadsheetApp.flush();
      Logger.log("✅ " + filasAEliminar.length + " biometrías resueltas eliminadas.");
    } else {
      Logger.log("✅ Ninguna biometría cambió de estado.");
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
        const motivoNeg = resFinal === 'NEGADA' ? (datosFormulario.motivoNegacion || '') : '';

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
        hojaHist.getRange(filaReal, 29, 1, 2).setValues([[motivoAplaz, motivoNeg]]);
        // Col AE (31): fecha solo día
        hojaHist.getRange(filaReal, 31).setValue(fechaSoloDia);

        // Calcular tiempos SLA
        const fechaAsignacion = _parseFechaGAS(fila[24]);
        // Desaplazamiento: fechaDiligenciadaRadicación = fechaAsignación (cola = 0)
        const tRadCola = fechaAsignacion;
        hojaHist.getRange(filaReal, 34).setValue(fechaAsignacion || '');
        if (fechaAsignacion) hojaHist.getRange(filaReal, 34).setNumberFormat("dd/MM/yyyy HH:mm:ss");
        const tiempos = calcularTiemposCaso(tRadCola, fechaAsignacion, ahora, userEmail);
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


// ===================================================================
// FLUJO BIOMETRÍA: Captura cada 10 min + Revisión 8am/12pm
// ===================================================================

// Trigger cada 10 min: captura nuevas biometrías de SAI
function consultarBiometriasPeriodicaAPI() {
  Logger.log("=== INICIO consultarBiometriasPeriodicaAPI ===");
  _capturarNuevasBiometrias();
  Logger.log("=== FIN consultarBiometriasPeriodicaAPI ===");
}

// Trigger 8am y 12pm: re-consulta pendientes, decide destino y envía WA pendientes
function cicloBiometriaPendiente() {
  Logger.log("=== INICIO cicloBiometriaPendiente ===");
  _reconsultarPendientesBio();
  _enviarBroadcastPendientes();
  Logger.log("=== FIN cicloBiometriaPendiente ===");
}

function _enviarBroadcastPendientes() {
  Logger.log("--- Envío de WA a biometrías sin broadcast ---");
  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) return;

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) return;

  var datos = hojaBio.getRange(2, 1, lastRow - 1, 75).getValues();
  var filasPendientes = [];

  for (var i = 0; i < datos.length; i++) {
    var estadoBroadcast = String(datos[i][61]).trim();
    if (estadoBroadcast === 'ENVIADO') continue;
    var solicitudId = String(datos[i][0]).trim();
    if (!solicitudId) continue;
    filasPendientes.push({ fila: datos[i], filaSheet: i + 2 });
  }

  if (filasPendientes.length === 0) {
    Logger.log("No hay biometrías pendientes de envío de WA.");
    return;
  }

  Logger.log(filasPendientes.length + " biometrías sin WA enviado.");

  var filasParaEnvio = filasPendientes.map(function(p) { return p.fila; });
  var rowInicios = filasPendientes.map(function(p) { return p.filaSheet; });

  enviarBroadcastInfobipConFilas(filasParaEnvio, hojaBio, rowInicios);
}

function enviarBroadcastInfobipConFilas(filasBiometria, hojaBio, filasSheet) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var baseUrl = props.getProperty('INFOBIP_BASE_URL');
  var templateName = props.getProperty('INFOBIP_TEMPLATE_NAME');
  var sender = props.getProperty('INFOBIP_SENDER');

  if (!apiKey || !baseUrl || !templateName || !sender) {
    Logger.log("⚠️ Infobip no configurado. Broadcast no enviado.");
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

      var payload = {
        messages: [{
          from: sender,
          to: telefono,
          content: {
            templateName: templateName,
            templateData: { body: { placeholders: [nombre, solicitudId] } },
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
          Logger.log("✅ WA enviado → " + rol + ": " + nombre + " | Tel: " + telefono + " | Sol: " + solicitudId);
        } else {
          errores++;
          Logger.log("❌ WA falló → " + telefono + " | HTTP " + code);
        }
      } catch (e) {
        errores++;
        Logger.log("❌ Error WA → " + telefono + " | " + e.message);
      }

      Utilities.sleep(500);
    }

    var filaSheet = filasSheet[i];
    var estado = filaEnvioOk ? "ENVIADO" : "ERROR";
    hojaBio.getRange(filaSheet, 61).setValue(ahora);
    hojaBio.getRange(filaSheet, 62).setValue(estado);
  }

  SpreadsheetApp.flush();
  Logger.log("📱 Broadcast finalizado: " + enviados + " enviados, " + errores + " errores.");
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
    Logger.log("⚠️ Error consultando SAI para " + consecutivo + ": " + e.message);
    return null;
  }
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
    fechaResultado: item.lastResultDate || item.lastMovementDate,
    clase: claseNormalizada,
    digitalUar: "No",
    canal: String(item.channel || "").trim(),
    codeudores: codeudores,
    resultCode: String(item.resultCode || "").trim()
  };
}

// PASO 1: Re-consultar pendientes (nuevo_estado_sai vacío)
function _reconsultarPendientesBio() {
  Logger.log("--- Paso 1: Re-consulta de pendientes ---");

  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var datos = hojaBio.getRange(2, 1, lastRow - 1, 75).getValues();

  var pendientes = [];
  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][62]).trim() !== "") continue;
    var consecutivo = String(datos[i][0]).trim();
    if (!consecutivo) continue;
    pendientes.push({ fila: i + 2, consecutivo: consecutivo });
  }

  if (pendientes.length === 0) {
    Logger.log("No hay pendientes sin re-consultar.");
    return;
  }

  Logger.log(pendientes.length + " pendientes a re-consultar.");

  var resultados = [];
  for (var p = 0; p < pendientes.length; p++) {
    var datosApi = _consultarSaiIndividual(pendientes[p].consecutivo);
    resultados.push({ fila: pendientes[p].fila, consecutivo: pendientes[p].consecutivo, datosApi: datosApi });
    Utilities.sleep(1000);
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    Logger.log("❌ Lock no disponible para actualizar pendientes: " + e.message);
    return;
  }

  try {
    var solicitudesParaSolicitud = [];

    for (var r = 0; r < resultados.length; r++) {
      var res = resultados[r];
      if (!res.datosApi) {
        Logger.log("⚠️ Sin respuesta API para " + res.consecutivo);
        continue;
      }

      var statusActual = String(res.datosApi.studyStatus || "").toUpperCase().trim();
      hojaBio.getRange(res.fila, 63).setValue(statusActual);

      if (statusActual === "APROBADO") {
        Logger.log("✅ " + res.consecutivo + " APROBADO → marcado en nuevo_estado_sai");
      } else if (statusActual === "APROBADO_PENDIENTE_BIOMETRIA") {
        solicitudesParaSolicitud.push(_homologarDatosApi(res.datosApi));
        Logger.log("🔄 " + res.consecutivo + " sigue pendiente biometría → enviando a cola de asignación");
      } else {
        Logger.log("🔄 " + res.consecutivo + " cambió a " + statusActual + " → sin acción");
      }
    }

    SpreadsheetApp.flush();
    lock.releaseLock();

    if (solicitudesParaSolicitud.length > 0) {
      procesarYGuardarLote(solicitudesParaSolicitud);
      Logger.log("✅ " + solicitudesParaSolicitud.length + " solicitudes enviadas a hoja solicitud.");
    }

  } catch (e) {
    Logger.log("❌ Error en _reconsultarPendientesBio: " + e.message);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

// PASO 2: Capturar nuevas biometrías desde la API
function _capturarNuevasBiometrias() {
  Logger.log("--- Paso 2: Captura de nuevas biometrías ---");

  var keyFull_ = getKeyFull();
  var endpointBase = getEndPointNewApiDate();
  if (!keyFull_ || !endpointBase) {
    Logger.log("❌ Faltan credenciales o endpoint.");
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
      Logger.log("[Biometría] Página " + paginaActual + " consultando...");

      var response = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: { 'x-api-key': keyFull_, 'Accept': 'application/json' },
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        Logger.log("❌ API error HTTP " + response.getResponseCode());
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
        var rc = String(item.resultCode || "").trim();

        if (estadoGeneral !== "APROBADO_PENDIENTE_BIOMETRIA") return;
        if (rc !== "500" && rc !== "503") return;
        if (String(item.mainResultCode) !== "2") return;
        if (TIPOS_EXCLUIR.has(tipoSolicitud)) return;

        biometriasNuevas.push(_homologarDatosApi(item));
      });

      paginaActual++;
      if (paginaActual <= totalPaginas) Utilities.sleep(2000);

    } while (paginaActual <= totalPaginas);

  } catch (e) {
    Logger.log("❌ Error en consulta API biometrías: " + e.message);
    return;
  }

  if (biometriasNuevas.length === 0) {
    Logger.log("No se encontraron nuevas biometrías pendientes.");
    return;
  }

  Logger.log(biometriasNuevas.length + " biometrías candidatas encontradas.");
  _guardarLoteBiometriaPendiente(biometriasNuevas);
}

function _guardarLoteBiometriaPendiente(listaObjetos) {
  if (!listaObjetos || listaObjetos.length === 0) return;

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    Logger.log("❌ Lock no disponible para guardar biometrías: " + e.message);
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
      var fila = new Array(75).fill("");

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
        var valor = String(f || "").trim();
        var resultado = valor;
        if (valor && valor !== "En Proceso" && valor !== "null") {
          try {
            var fObj;
            if (valor.includes("/")) {
              var p = valor.split(/[\/\s:]/);
              fObj = new Date(p[2], p[1] - 1, p[0], p[3] || 0, p[4] || 0, p[5] || 0);
            } else {
              fObj = new Date(valor);
            }
            if (!isNaN(fObj.getTime())) {
              resultado = Utilities.formatDate(fObj, "GMT-5", "yyyy-MM-dd HH:mm:ss");
            }
          } catch (e) {}
        }
        fila[17 + idx] = resultado;
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
      var rango = hojaBio.getRange(rowInicio, 1, filas.length, 75);
      rango.setNumberFormat("@");
      rango.setValues(filas);
      SpreadsheetApp.flush();
      Logger.log("✅ " + filas.length + " nuevas biometrías guardadas en pendiente_biometria. Duplicados: " + duplicados);

    } else {
      Logger.log("No se guardaron biometrías nuevas. Duplicados: " + duplicados);
    }

  } catch (e) {
    Logger.log("❌ Error guardando biometrías: " + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function enviarBroadcastInfobip(filasBiometria, hojaBio, rowInicio) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var baseUrl = props.getProperty('INFOBIP_BASE_URL');
  var templateName = props.getProperty('INFOBIP_TEMPLATE_NAME');
  var sender = props.getProperty('INFOBIP_SENDER');

  if (!apiKey || !baseUrl || !templateName || !sender) {
    Logger.log("⚠️ Infobip no configurado — faltan Script Properties. Broadcast no enviado.");
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

      var payload = {
        messages: [{
          from: sender,
          to: telefono,
          content: {
            templateName: templateName,
            templateData: {
              body: {
                placeholders: [nombre, solicitudId]
              }
            },
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
          Logger.log("✅ WA enviado → " + rol + ": " + nombre + " | Tel: " + telefono + " | Sol: " + solicitudId);
        } else {
          errores++;
          Logger.log("❌ WA falló → " + telefono + " | HTTP " + code + " | " + response.getContentText());
        }
      } catch (e) {
        errores++;
        Logger.log("❌ Error WA → " + telefono + " | " + e.message);
      }

      Utilities.sleep(500);
    }

    if (hojaBio && rowInicio) {
      var filaSheet = rowInicio + i;
      var estado = filaEnvioOk ? "ENVIADO" : "ERROR";
      hojaBio.getRange(filaSheet, 61).setValue(ahora);    // fecha_envio_brodcast
      hojaBio.getRange(filaSheet, 62).setValue(estado);    // estado_brodcast
    }
  }

  if (hojaBio) SpreadsheetApp.flush();
  Logger.log("📱 Broadcast finalizado: " + enviados + " enviados, " + errores + " errores.");
}

function configurarInfobip() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('INFOBIP_API_KEY', 'cc0c476419eea6d179ad2136c13c0072-a919e025-1367-4775-bd25-7d69973a0df7');
  props.setProperty('INFOBIP_BASE_URL', 'yrrzxg.api.infobip.com');
  props.setProperty('INFOBIP_TEMPLATE_NAME', 'biometria_pendiente');
  props.setProperty('INFOBIP_SENDER', '573148390322');
  Logger.log("✅ Propiedades de Infobip configuradas correctamente.");
}

function testEnviarWhatsApp() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var baseUrl = props.getProperty('INFOBIP_BASE_URL');
  var templateName = props.getProperty('INFOBIP_TEMPLATE_NAME');
  var sender = props.getProperty('INFOBIP_SENDER');

  var telefono = "573002720356";  // ← PON TU NÚMERO AQUÍ (con 57)
  var nombre = "Santiago";
  var solicitud = "12345678";

  var url = "https://" + baseUrl + "/whatsapp/1/message/template";
  var payload = {
    messages: [{
      from: sender,
      to: telefono,
      content: {
        templateName: templateName,
        templateData: {
          body: {
            placeholders: [nombre, solicitud]
          },
        },
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

function verificarAprobacionDesaplazamientos() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return { success: false, message: "No se pudo adquirir el lock. Intenta más tarde." };
  }

  try {
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hojaHist = ss.getSheetByName("Historico_Gestiones");
    if (!hojaHist) return { success: false, message: "Hoja Historico_Gestiones no encontrada." };

    const lastRow = hojaHist.getLastRow();
    if (lastRow < 2) return { success: false, message: "No hay datos en Historico_Gestiones." };

    const data = hojaHist.getRange(2, 1, lastRow - 1, 61).getValues();
    const ahora = new Date();
    const hoyDia = ahora.getDate();
    const hoyMes = ahora.getMonth();
    const hoyAnio = ahora.getFullYear();

    var candidatos = [];
    for (var i = 0; i < data.length; i++) {
      var tipoAsignado = String(data[i][60]).trim().toLowerCase();
      var fechaAsig = data[i][24];
      var solicitudId = String(data[i][0]).trim();
      var estadoActual = String(data[i][16]).toUpperCase().trim();

      if (tipoAsignado !== 'desaplazamiento') continue;
      if (!(fechaAsig instanceof Date)) continue;
      if (fechaAsig.getDate() !== hoyDia || fechaAsig.getMonth() !== hoyMes || fechaAsig.getFullYear() !== hoyAnio) continue;
      if (!solicitudId) continue;
      if (estadoActual === 'APROBADO') continue;

      candidatos.push({ filaReal: i + 2, solicitudId: solicitudId, estadoActual: estadoActual });
    }

    if (candidatos.length === 0) {
      return { success: true, message: "No hay desaplazamientos pendientes de verificación hoy.", totalRevisados: 0, totalActualizados: 0, detalles: [] };
    }

    var endpoint = getEndPointNewSai();
    var apiKey = getKeyFull();
    if (!endpoint || !apiKey) return { success: false, message: "Endpoint o API key de SAI no configurados." };

    var totalActualizados = 0;
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

          if (studyStatus === "APROBADO") {
            hojaHist.getRange(c.filaReal, 17).setValue("APROBADO");
            totalActualizados++;
            detalles.push({ solicitudId: c.solicitudId, estado: "ACTUALIZADO", detalle: "APROBADO" });
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

    SpreadsheetApp.flush();

    return {
      success: true,
      message: "Verificación completada. " + totalActualizados + " de " + candidatos.length + " actualizados.",
      totalRevisados: candidatos.length,
      totalActualizados: totalActualizados,
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
    Logger.log("Verificación desaplazamientos: " + resultado.totalRevisados + " revisados, " + resultado.totalActualizados + " actualizados.");
  } catch (e) {
    Logger.log("Error en trigger verificación desaplazamientos: " + e.message);
  }
}

/**
 * Verifica en SAI si las inducciones asignadas (tipoAsignado='induccion') ya cambiaron
 * de estado. Si studyStatus cambió a APROBADO o RECHAZADO, actualiza estadoGeneral
 * en Historico_Gestiones.
 * Diseñada para ejecutarse con trigger diario de 4 a 5 pm.
 */
function verificarResultadoInducciones() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return { success: false, message: "No se pudo adquirir el lock." };
  }

  try {
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hojaHist = ss.getSheetByName("Historico_Gestiones");
    if (!hojaHist) return { success: false, message: "Hoja Historico_Gestiones no encontrada." };

    const lastRow = hojaHist.getLastRow();
    if (lastRow < 2) return { success: false, message: "No hay datos en Historico_Gestiones." };

    const data = hojaHist.getRange(2, 1, lastRow - 1, 61).getValues();
    const ESTADOS_FINALES = new Set(["APROBADO", "RECHAZADO"]);

    var candidatos = [];
    for (var i = 0; i < data.length; i++) {
      var tipoAsignado = String(data[i][60]).trim().toLowerCase();
      var fechaFin = String(data[i][26]).trim();
      var solicitudId = String(data[i][0]).trim();
      var estadoActual = String(data[i][16]).toUpperCase().trim();

      if (tipoAsignado !== 'induccion') continue;
      if (fechaFin !== '') continue;
      if (!solicitudId) continue;
      if (ESTADOS_FINALES.has(estadoActual)) continue;

      candidatos.push({ filaReal: i + 2, solicitudId: solicitudId, estadoActual: estadoActual });
    }

    if (candidatos.length === 0) {
      return { success: true, message: "No hay inducciones pendientes de verificación.", totalRevisados: 0, totalActualizados: 0, detalles: [] };
    }

    var endpoint = getEndPointNewSai();
    var apiKey = getKeyFull();
    if (!endpoint || !apiKey) return { success: false, message: "Endpoint o API key de SAI no configurados." };

    var totalActualizados = 0;
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

          if (ESTADOS_FINALES.has(studyStatus)) {
            hojaHist.getRange(c.filaReal, 17).setValue(studyStatus);
            totalActualizados++;
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

    SpreadsheetApp.flush();

    return {
      success: true,
      message: "Verificación completada. " + totalActualizados + " de " + candidatos.length + " actualizados.",
      totalRevisados: candidatos.length,
      totalActualizados: totalActualizados,
      detalles: detalles
    };
  } catch (error) {
    return { success: false, message: "Error interno: " + error.toString() };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function triggerVerificacionInducciones() {
  try {
    var resultado = verificarResultadoInducciones();
    Logger.log("Verificación inducciones: " + resultado.totalRevisados + " revisados, " + resultado.totalActualizados + " actualizados.");
  } catch (e) {
    Logger.log("Error en trigger verificación inducciones: " + e.message);
  }
}