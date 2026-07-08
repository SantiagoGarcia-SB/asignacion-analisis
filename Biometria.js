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

// IMPORTANTE: la consulta paginada a SAI (lenta, con pausas de 2s entre páginas) corre
// SIN el ScriptLock — igual que se corrigió en verificarAprobacionDesaplazamientos/Uar
// (ver commit "Corrige retención de lock durante llamadas a SAI"). El lock solo se toma
// al final, para el borrado, y justo antes se vuelve a leer la hoja para confirmar que
// la fila sigue ahí con el mismo estado (evita borrar una fila que otro proceso ya movió
// o reemplazó mientras se esperaba la respuesta de SAI).
function limpiarBiometriasResueltas() {
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
    const idsAEliminar = new Set();

    for (let i = 0; i < datos.length; i++) {
      const estado = String(datos[i][16]).toUpperCase().trim();
      if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;

      const solicitud = String(datos[i][0]).trim();
      if (!solicitud) continue;

      const statusSai = estadosSai.get(solicitud);
      if (statusSai && !ESTADOS_CONSERVAR.has(statusSai)) {
        idsAEliminar.add(solicitud);
        Logger.log("🗑️ Solicitud " + solicitud + " cambió a " + statusSai);
      }
    }

    if (idsAEliminar.size === 0) {
      Logger.log("✅ Ninguna biometría cambió de estado.");
      return;
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      Logger.log("❌ Lock no disponible para limpiar biometrías: " + e.message);
      return;
    }

    try {
      // Re-leer justo antes de borrar: si otro proceso ya asignó/movió la fila mientras
      // se esperaba la respuesta de SAI, esta relectura evita borrar la fila equivocada.
      const lastRowActual = hoja.getLastRow();
      if (lastRowActual < 2) return;
      const idsActuales = hoja.getRange(2, 1, lastRowActual - 1, 17).getValues();

      const filasAEliminar = [];
      for (let i = 0; i < idsActuales.length; i++) {
        const solicitud = String(idsActuales[i][0]).trim();
        const estado = String(idsActuales[i][16]).toUpperCase().trim();
        if (estado === "APROBADO_PENDIENTE_BIOMETRIA" && idsAEliminar.has(solicitud)) {
          filasAEliminar.push(i + 2);
        }
      }

      for (let j = filasAEliminar.length - 1; j >= 0; j--) {
        hoja.deleteRow(filasAEliminar[j]);
      }

      if (filasAEliminar.length > 0) {
        SpreadsheetApp.flush();
        Logger.log("✅ " + filasAEliminar.length + " biometrías resueltas eliminadas.");
      } else {
        Logger.log("ℹ️ Las filas candidatas ya no estaban disponibles al momento de borrar (probablemente asignadas mientras tanto).");
      }
    } finally {
      if (lock.hasLock()) lock.releaseLock();
    }
  } catch (e) {
    Logger.log("❌ Error en limpiarBiometriasResueltas: " + e.message);
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

      // fechaResultado (col S / índice 18): misma columna que usa RequestLeadUnificado
      // para ordenar desaplazamiento, así ambas rutas de asignación quedan consistentes.
      candidatosElegibles.push({ row: row, sheetRowIndex: i + 2, fechaOrd: _parseDateUnif(row[18]) });
      idsEnGestion.add(id);
    }

    if (candidatosElegibles.length === 0) {
      return { success: false, message: "No hay biometrías pendientes validadas." };
    }

    // El admin decide si se llama primero al más reciente o al más antiguo
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
        const motivoAplaz = resFinal === 'APLAZADO' ? (datosFormulario.motivoAplazamiento || '') : '';
        const motivoNeg = resFinal === 'RECHAZADO' ? (datosFormulario.motivoNegacion || '') : '';

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
// FLUJO BIOMETRÍA: Captura cada 10 min + Primer contacto cada hora + Escalación 8am/12pm
// ===================================================================
// Columna 76 (índice 75) de pendiente_biometria: fase_seguimiento_biometria
// "" = aún sin contactar | "WA_ENVIADO" = ya tuvo su oportunidad por WhatsApp
// "ESCALADA" = ya se envió a asignación (llamada) | "RESUELTA" = SAI ya no dice pendiente, se cierra sin llamar
// Columna 77 (índice 76): fecha_actualizacion_fase — se sobrescribe con la fecha/hora exacta
// cada vez que fase_seguimiento_biometria cambia de valor. Requiere correr una vez
// agregarColumnaFechaActualizacionFase() para crear el encabezado en la hoja.
var COL_FECHA_ACTUALIZACION_FASE = 77;

// EJECUTAR UNA SOLA VEZ desde el editor de Apps Script para crear el encabezado.
function agregarColumnaFechaActualizacionFase() {
  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var encabezadoActual = hojaBio.getRange(1, COL_FECHA_ACTUALIZACION_FASE).getValue();
  if (String(encabezadoActual).trim() !== "") {
    Logger.log("La columna " + COL_FECHA_ACTUALIZACION_FASE + " ya tiene encabezado: " + encabezadoActual);
    return;
  }
  hojaBio.getRange(1, COL_FECHA_ACTUALIZACION_FASE).setValue("fecha_actualizacion_fase");
  Logger.log("✅ Encabezado 'fecha_actualizacion_fase' creado en columna " + COL_FECHA_ACTUALIZACION_FASE + ".");
}

// Trigger cada 10 min: captura nuevas biometrías de SAI
function consultarBiometriasPeriodicaAPI() {
  Logger.log("=== INICIO consultarBiometriasPeriodicaAPI ===");
  _capturarNuevasBiometrias();
  Logger.log("=== FIN consultarBiometriasPeriodicaAPI ===");
}

// Trigger cada hora: primer contacto (fase vacía) → si ya pasaron >=4h desde fecha_resultado
// (cuando radicación le mandó su propio WA al aplazar por biometría) y SAI sigue diciendo
// pendiente, se envía WhatsApp y se marca WA_ENVIADO. Corre independiente del corte de
// escalación para que el WA salga apenas se cumple la ventana, sin esperar al corte fijo
// siguiente — así casos de un día quedan con WA_ENVIADO listos para escalar desde el
// primer corte del día siguiente (8am).
var VENTANA_HORAS_WA_BIOMETRIA = 4;
function cicloPrimerContactoBiometria() {
  Logger.log("=== INICIO cicloPrimerContactoBiometria ===");
  _enviarPrimerContactoBiometria();
  Logger.log("=== FIN cicloPrimerContactoBiometria ===");
}

// Trigger 8am y 12pm: escala a la cola de asignación (llamada) los pendientes que ya
// están en fase WA_ENVIADO (segundo contacto) y SAI sigue diciendo pendiente.
// Si SAI ya no dice pendiente, el caso se marca resuelto y no se llama.
function cicloBiometriaPendiente() {
  Logger.log("=== INICIO cicloBiometriaPendiente ===");
  _procesarCortePendientes();
  Logger.log("=== FIN cicloBiometriaPendiente ===");
}

// Trigger cada hora: revisa las biometrías YA escaladas a la cola de asignación
// (solicitud, estado APROBADO_PENDIENTE_BIOMETRIA) contra SAI. Si el estado cambió a
// algo distinto de APROBADO_PENDIENTE_BIOMETRIA/EN_ESTUDIO, se bajan de la cola para
// que ningún analista llame a un cliente por un caso que ya se resolvió por otro lado.
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
  var headerPdfUrl = props.getProperty('INFOBIP_HEADER_PDF_URL');

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

      var templateData = {
        body: { placeholders: [nombre, solicitudId] },
        buttons: [{ type: "QUICK_REPLY", parameter: solicitudId }]
      };
      if (headerPdfUrl) {
        templateData.header = { type: "DOCUMENT", mediaUrl: headerPdfUrl, filename: "Instructivo.pdf" };
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

// Primer contacto: evalúa pendientes en fase vacía, envía WhatsApp a los que ya
// cumplieron la ventana de 4h desde fecha_resultado y siguen pendientes en SAI.
function _enviarPrimerContactoBiometria() {
  Logger.log("--- Primer contacto: evaluación de pendientes en fase vacía ---");

  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var datos = hojaBio.getRange(2, 1, lastRow - 1, 76).getValues();

  var candidatos = [];
  for (var i = 0; i < datos.length; i++) {
    var fase = String(datos[i][75]).trim();
    if (fase !== "") continue; // solo primer contacto: fase vacía
    var consecutivo = String(datos[i][0]).trim();
    if (!consecutivo) continue;

    var fechaResultado = _parseFechaGAS(datos[i][18]); // fecha_resultado
    var horasDesdeResultado = fechaResultado ? (Date.now() - fechaResultado.getTime()) / 3600000 : null;
    if (fechaResultado !== null && horasDesdeResultado < VENTANA_HORAS_WA_BIOMETRIA) continue; // aún no cumple ventana

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
    Logger.log("❌ Lock no disponible para primer contacto de biometría: " + e.message);
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
        Logger.log("⚠️ Sin respuesta API para " + item.consecutivo);
        continue;
      }

      var statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();
      hojaBio.getRange(item.fila, 63).setValue(statusActual); // nuevo_estado_sai

      if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA") {
        hojaBio.getRange(item.fila, 76).setValue("RESUELTA");
        hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
        Logger.log("✅ " + item.consecutivo + " se resolvió solo (" + statusActual + ") → cerrado, sin llamada.");
        continue;
      }

      rowsParaWA.push(item.datosFila);
      filasParaWA.push(item.fila);
      hojaBio.getRange(item.fila, 76).setValue("WA_ENVIADO");
      hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
      Logger.log("📲 " + item.consecutivo + " cumple ventana de " + VENTANA_HORAS_WA_BIOMETRIA + "h y sigue pendiente → primer contacto (WhatsApp).");
    }

    SpreadsheetApp.flush();
    lock.releaseLock();

    if (rowsParaWA.length > 0) {
      enviarBroadcastInfobipConFilas(rowsParaWA, hojaBio, filasParaWA);
    }
  } catch (e) {
    Logger.log("❌ Error en _enviarPrimerContactoBiometria: " + e.message);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

// ===================================================================
// UTILIDAD MANUAL — correr a demanda desde el editor de Apps Script cuando se
// necesite destrabar biometrías 02/500 o 02/503 que están en fase vacía
// esperando la ventana normal de VENTANA_HORAS_WA_BIOMETRIA horas (p.ej. un
// pico de solicitudes que no puede esperar el ciclo horario normal). Envía el
// WhatsApp ya mismo, sin esperar la ventana, y marca WA_ENVIADO. No es un
// trigger automático: alguien tiene que ejecutarla a mano cada vez.
//
// Para escalar a asignación los que YA estaban en WA_ENVIADO antes de correr
// esta función, usa la función existente cicloBiometriaPendiente() (no hace
// falta duplicarla: no tiene espera de horario, solo revisa la fase).
//
// Importante: no correr cicloBiometriaPendiente() inmediatamente después de
// esta función en la misma sesión — eso escalaría a llamada los casos recién
// contactados por WhatsApp sin darles ni un minuto para responder, que es
// justo lo que la ventana normal evita. Dejar pasar un rato entre una y otra.
function forzarPrimerContactoBiometriaManual() {
  Logger.log("=== INICIO forzarPrimerContactoBiometriaManual ===");

  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var datos = hojaBio.getRange(2, 1, lastRow - 1, 76).getValues();

  var candidatos = [];
  for (var i = 0; i < datos.length; i++) {
    var fase = String(datos[i][75]).trim();
    if (fase !== "") continue; // solo primer contacto: fase vacía
    var consecutivo = String(datos[i][0]).trim();
    if (!consecutivo) continue;
    candidatos.push({ fila: i + 2, consecutivo: consecutivo, datosFila: datos[i] });
  }

  if (candidatos.length === 0) {
    Logger.log("No hay candidatos en fase vacía para forzar.");
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
    Logger.log("❌ Lock no disponible para forzar primer contacto: " + e.message);
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
        Logger.log("⚠️ Sin respuesta API para " + item.consecutivo);
        continue;
      }

      var statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();
      hojaBio.getRange(item.fila, 63).setValue(statusActual);

      if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA") {
        hojaBio.getRange(item.fila, 76).setValue("RESUELTA");
        hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
        Logger.log("✅ " + item.consecutivo + " ya no está pendiente (" + statusActual + ") → cerrado sin WA.");
        continue;
      }

      rowsParaWA.push(item.datosFila);
      filasParaWA.push(item.fila);
      hojaBio.getRange(item.fila, 76).setValue("WA_ENVIADO");
      hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
      Logger.log("📲 " + item.consecutivo + " forzado a WA_ENVIADO (sin esperar ventana).");
    }

    SpreadsheetApp.flush();
    lock.releaseLock();

    if (rowsParaWA.length > 0) {
      enviarBroadcastInfobipConFilas(rowsParaWA, hojaBio, filasParaWA);
    }
  } catch (e) {
    Logger.log("❌ Error en forzarPrimerContactoBiometriaManual: " + e.message);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }

  Logger.log("=== FIN forzarPrimerContactoBiometriaManual ===");
}

// Escalación: pendientes que ya están en fase WA_ENVIADO (segundo contacto) y siguen
// pendientes en SAI se escalan a la cola de asignación (llamada).
function _procesarCortePendientes() {
  Logger.log("--- Corte de escalación de pendientes de biometría ---");

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
    Logger.log("❌ Lock no disponible para procesar corte de pendientes: " + e.message);
    return;
  }

  try {
    var solicitudesParaAsignar = [];
    var ahora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");

    for (var r = 0; r < resultados.length; r++) {
      var item = resultados[r].item;
      var datosApi = resultados[r].datosApi;

      if (!datosApi) {
        Logger.log("⚠️ Sin respuesta API para " + item.consecutivo);
        continue;
      }

      var statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();
      hojaBio.getRange(item.fila, 63).setValue(statusActual); // nuevo_estado_sai

      if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA") {
        hojaBio.getRange(item.fila, 76).setValue("RESUELTA");
        hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
        Logger.log("✅ " + item.consecutivo + " se resolvió solo (" + statusActual + ") → cerrado, sin llamada.");
        continue;
      }

      solicitudesParaAsignar.push(_homologarDatosApi(datosApi));
      hojaBio.getRange(item.fila, 76).setValue("ESCALADA");
      hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
      Logger.log("📞 " + item.consecutivo + " sigue pendiente tras WhatsApp → escalado a asignación (llamada).");
    }

    SpreadsheetApp.flush();
    lock.releaseLock();

    if (solicitudesParaAsignar.length > 0) {
      procesarYGuardarLote(solicitudesParaAsignar);
      Logger.log("✅ " + solicitudesParaAsignar.length + " solicitudes escaladas a la cola de asignación.");
    }

  } catch (e) {
    Logger.log("❌ Error en _procesarCortePendientes: " + e.message);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

// MIGRACIÓN ÚNICA — correr manualmente una sola vez al desplegar la columna 76.
// Bajo la lógica anterior, consultar y asignar pasaban juntos en la misma corrida.
// Para las filas de HOY (WhatsApp recién enviado el mismo día), todavía se puede
// deshacer: si la solicitud sigue en la cola "solicitud" (ningún analista la ha
// tomado aún), se saca de la cola y se deja en WA_ENVIADO para que espere el
// próximo corte, como debía ser desde el principio. Si ya no está en la cola
// (un analista ya la tomó) o es de un corte anterior a hoy, ya no es seguro
// deshacerlo y se deja como ESCALADA.
function migrarFaseSeguimientoBiometriaExistente() {
  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var datos = hojaBio.getRange(2, 1, lastRow - 1, 76).getValues();
  var hoyStr = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd");
  var ahora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    Logger.log("❌ Lock no disponible para migrar: " + e.message);
    return;
  }

  try {
    var ssSol = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    var hojaSol = ssSol.getSheetByName(SHEET_NAME_SOLICITUDES);
    var idsEnCola = hojaSol ? getSetDeIds(hojaSol) : new Set();

    var recuperadas = 0, escaladasDejadas = 0, resueltas = 0;

    for (var i = 0; i < datos.length; i++) {
      var faseActual = String(datos[i][75]).trim();
      if (faseActual !== "") continue; // ya migrada, o ya la tocó el nuevo flujo

      var nuevoEstadoSai = String(datos[i][62]).trim().toUpperCase();
      if (!nuevoEstadoSai) continue; // nunca se re-consultó → se queda "", es correcto

      if (nuevoEstadoSai !== "APROBADO_PENDIENTE_BIOMETRIA") {
        hojaBio.getRange(i + 2, 76).setValue("RESUELTA");
        hojaBio.getRange(i + 2, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
        resueltas++;
        continue;
      }

      var solId = String(datos[i][0]).trim();
      var fechaWA = datos[i][60]; // fecha_envio_brodcast
      var fechaWAStr = fechaWA instanceof Date ? Utilities.formatDate(fechaWA, "GMT-5", "yyyy-MM-dd") : String(fechaWA || "").slice(0, 10);
      var esDeHoy = fechaWAStr === hoyStr;

      if (esDeHoy && solId && idsEnCola.has(solId)) {
        _eliminarSolicitudDeCola(hojaSol, solId);
        hojaBio.getRange(i + 2, 76).setValue("WA_ENVIADO");
        hojaBio.getRange(i + 2, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
        recuperadas++;
      } else {
        hojaBio.getRange(i + 2, 76).setValue("ESCALADA");
        hojaBio.getRange(i + 2, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
        escaladasDejadas++;
      }
    }

    SpreadsheetApp.flush();
    Logger.log("✅ Migración completada — recuperadas de la cola: " + recuperadas + " | dejadas como escaladas: " + escaladasDejadas + " | resueltas: " + resueltas);

  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

// CORRECCIÓN ÚNICA — correr una sola vez, después de migrarFaseSeguimientoBiometriaExistente().
// Bajo la lógica anterior, el envío de WhatsApp era independiente de la re-consulta a SAI
// (se le mandaba a cualquiera sin estado_brodcast=ENVIADO, sin importar nuevo_estado_sai).
// Por eso hay filas que ya recibieron WhatsApp pero la migración las dejó con fase vacía
// (porque nunca se les llenó nuevo_estado_sai). Sin esta corrección, el próximo corte las
// trataría como "nunca contactadas" y les mandaría un segundo WhatsApp en vez de escalarlas.
function corregirFaseParaBroadcastsPrevios() {
  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var datos = hojaBio.getRange(2, 1, lastRow - 1, 76).getValues();
  var ahora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");
  var corregidas = 0;

  for (var i = 0; i < datos.length; i++) {
    var fase = String(datos[i][75]).trim();
    if (fase !== "") continue; // solo las que la migración dejó sin tocar

    var estadoBroadcast = String(datos[i][61]).trim().toUpperCase(); // estado_brodcast
    if (estadoBroadcast !== "ENVIADO") continue; // nunca recibió WhatsApp, se deja como está (correcto)

    hojaBio.getRange(i + 2, 76).setValue("WA_ENVIADO");
    hojaBio.getRange(i + 2, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
    corregidas++;
  }

  SpreadsheetApp.flush();
  Logger.log("✅ Corrección aplicada: " + corregidas + " filas marcadas WA_ENVIADO (ya habían recibido WhatsApp bajo la lógica anterior).");
}

// CORRECCIÓN PUNTUAL — correr una sola vez (o cuantas veces haga falta, es idempotente)
// para reparar casos que entraron a "solicitud" directo desde revisarEnEsperaCodeudor()
// (Código.js) antes de que esa función enrutara APROBADO_PENDIENTE_BIOMETRIA hacia
// pendiente_biometria. Busca en "solicitud" filas con ese estado que no tengan su
// solicitud en pendiente_biometria, las re-consulta en SAI para reconstruir los datos
// completos, y si SAI confirma que siguen pendientes de biometría las mueve a
// pendiente_biometria (fase vacía, como si hubieran entrado por el camino correcto) y
// las borra de "solicitud". Si SAI ya no dice pendiente, se deja la fila donde está y
// se loguea para revisión manual (no se borra nada solo, para no perder el caso).
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
    if (!solId || setIdsBio.has(solId)) continue; // ya está en pendiente_biometria, no es un caso mal enrutado

    candidatos.push({ fila: i + 2, solicitud: solId });
  }

  if (candidatos.length === 0) {
    Logger.log("✅ No hay biometrías mal enrutadas en 'solicitud'.");
    return;
  }

  Logger.log(candidatos.length + " candidatos encontrados en 'solicitud' sin match en pendiente_biometria.");

  var paraMover = [];
  var idsAMover = new Set();
  var yaNoAplica = 0;

  for (var c = 0; c < candidatos.length; c++) {
    var datosApi = _consultarSaiIndividual(candidatos[c].solicitud);
    if (!datosApi) {
      Logger.log("⚠️ Sin respuesta API para " + candidatos[c].solicitud + ", se deja como está.");
      continue;
    }

    var statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();
    if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA") {
      Logger.log("ℹ️ " + candidatos[c].solicitud + " ya no está pendiente de biometría (" + statusActual + "). Se deja en 'solicitud' para revisión manual.");
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
      Logger.log("❌ Lock no disponible para mover biometrías mal enrutadas: " + e.message);
      return;
    }
    var filasBorradas = 0;
    try {
      // Re-leer justo antes de borrar por ID (no por el índice capturado antes de las
      // consultas a SAI): entre esas consultas y este punto pudieron pasar varios
      // segundos, tiempo en el que otro proceso (asignación, etc.) pudo mover filas y
      // desfasar los índices originales.
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
    Logger.log("✅ " + filasBorradas + " biometrías movidas de 'solicitud' a pendiente_biometria (de " + idsAMover.size + " candidatas confirmadas).");
  }

  Logger.log("Resumen — movidas: " + idsAMover.size + " | ya no aplica (dejadas para revisión manual): " + yaNoAplica);
  Logger.log("=== FIN corregirBiometriasMalEnrutadas ===");
}

// CORRECCIÓN PUNTUAL — correr una sola vez (idempotente) para el caso contrario a
// corregirBiometriasMalEnrutadas(): solicitudes que quedaron DUPLICADAS — presentes a la
// vez en "solicitud" (ya disponibles para llamar) y en pendiente_biometria con una fase
// que todavía no debería permitir eso ("" = nunca contactado, "WA_ENVIADO" = contactado
// pero sin escalar, "RESUELTA" = ya cerrado en SAI). Solo cuando la fase es "ESCALADA" es
// correcto que coexistan en ambas hojas — ese es el estado normal post-escalación.
// Para los demás casos, se borra la fila de "solicitud" y se deja pendiente_biometria
// intacta para que el caso siga su curso normal (WA en el próximo ciclo horario si aplica,
// escalación en el próximo corte 8am/12pm). No se toca nada en pendiente_biometria.
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
    detalle.push(solId + " (fase: " + (fase || "vacía") + ")");
  }

  if (idsABorrar.size === 0) {
    Logger.log("✅ No hay duplicados indebidos entre 'solicitud' y pendiente_biometria.");
    return;
  }

  Logger.log(idsABorrar.size + " duplicados encontrados: " + detalle.join(", "));

  var lock = LockService.getScriptLock();
  try { lock.waitLock(60000); } catch (e) {
    Logger.log("❌ Lock no disponible para limpiar duplicados: " + e.message + " — vuelve a correrla en un momento con menos actividad.");
    return;
  }
  try {
    // Re-leer justo antes de borrar (por ID, no por el índice calculado arriba): la
    // espera del lock (hasta 60s bajo contención) es tiempo suficiente para que otro
    // proceso mueva filas y desfase los índices originales. También se vuelve a
    // consultar la fase en pendiente_biometria por si cambió a ESCALADA mientras se
    // esperaba, en cuyo caso la coexistencia ya sería correcta y no hay que borrar.
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
        if (fasesActuales.get(idActual) === "ESCALADA") continue; // ya escaló mientras se esperaba, correcto dejarlo
        filasABorrar.push(k + 2);
      }
    }

    filasABorrar.sort((a, b) => b - a).forEach(function(fila) { hojaSol.deleteRow(fila); });
    SpreadsheetApp.flush();
    Logger.log("✅ " + filasABorrar.length + " filas duplicadas eliminadas de 'solicitud' (de " + idsABorrar.size + " candidatas confirmadas). Quedan intactas en pendiente_biometria siguiendo su fase actual.");
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }

  Logger.log("=== FIN corregirBiometriasDuplicadasEnCola ===");
}

// BACKFILL ÚNICO — correr una sola vez, después de agregarColumnaFechaActualizacionFase(),
// para poblar fecha_actualizacion_fase en filas que ya tenían fase asignada antes de que
// existiera la columna. No existe un registro exacto de cuándo cambió cada fase en el pasado
// (esa es justamente la brecha que esta columna cierra hacia adelante), así que se usa el
// mejor proxy disponible por caso:
// - WA_ENVIADO → fecha_envio_brodcast (mismo evento, exacto).
// - ESCALADA   → fecha de asignación del caso en Historico_Gestiones (aproximada: el caso
//                pudo escalar un poco antes de que un analista lo tomara).
// - RESUELTA / cualquier otro valor → no hay ningún dato confiable, se deja vacía.
function backfillFechaActualizacionFase() {
  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var datos = hojaBio.getRange(2, 1, lastRow - 1, 76).getValues();
  var actuales = hojaBio.getRange(2, COL_FECHA_ACTUALIZACION_FASE, lastRow - 1, 1).getValues();

  // Mapa solId → fechaAsig desde Historico_Gestiones, para aproximar ESCALADA.
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
    Logger.log("⚠️ No se pudo leer Historico_Gestiones para aproximar ESCALADA: " + e.message);
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

  Logger.log("Diagnóstico — filas con fase pero sin fecha_actualizacion_fase previa: " +
    "WA_ENVIADO sin fecha_envio_brodcast: " + sinDatoWA +
    " | ESCALADA sin match en Historico_Gestiones: " + sinDatoEscalada +
    " | RESUELTA/otro (esperado, sin proxy): " + sinDatoOtraFase +
    " | filas leídas en Historico_Gestiones: " + mapaFechaAsignacion.size);

  if (actualizaciones.length === 0) {
    Logger.log("No hay filas para backfill (o ya todas tienen fecha_actualizacion_fase).");
    return;
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    Logger.log("❌ Lock no disponible para backfill: " + e.message);
    return;
  }

  try {
    actualizaciones.forEach(function(u) {
      hojaBio.getRange(u.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(u.valor);
    });
    SpreadsheetApp.flush();
    Logger.log("✅ Backfill completado — WA_ENVIADO: " + contadorWA + " | ESCALADA (aproximada): " + contadorEscalada +
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
      var fila = new Array(76).fill(""); // índice 75 = fase_seguimiento_biometria, arranca vacía

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
      var rango = hojaBio.getRange(rowInicio, 1, filas.length, 76);
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
  var headerPdfUrl = props.getProperty('INFOBIP_HEADER_PDF_URL');

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

      var templateData = {
        body: { placeholders: [nombre, solicitudId] },
        buttons: [{ type: "QUICK_REPLY", parameter: solicitudId }]
      };
      if (headerPdfUrl) {
        templateData.header = { type: "DOCUMENT", mediaUrl: headerPdfUrl, filename: "Instructivo.pdf" };
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
  props.setProperty('INFOBIP_HEADER_PDF_URL', 'https://image.experienciasbolivar.segurosbolivar.com/lib/fe3511747364047b751475/m/1/cc80086a-3754-40f0-a50e-5163febeeb84.pdf');
  Logger.log("✅ Propiedades de Infobip configuradas correctamente.");
}

function testEnviarWhatsApp() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var baseUrl = props.getProperty('INFOBIP_BASE_URL');
  var templateName = props.getProperty('INFOBIP_TEMPLATE_NAME');
  var sender = props.getProperty('INFOBIP_SENDER');
  var headerPdfUrl = props.getProperty('INFOBIP_HEADER_PDF_URL');

  var telefono = "573002720356";  // ← PON TU NÚMERO AQUÍ (con 57)
  var nombre = "Santiago";
  var solicitud = "12345678";

  var templateData = {
    body: { placeholders: [nombre, solicitud] },
    buttons: [{ type: "QUICK_REPLY", parameter: solicitud }]
  };
  if (headerPdfUrl) {
    templateData.header = { type: "DOCUMENT", mediaUrl: headerPdfUrl, filename: "Instructivo.pdf" };
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

  var telefono = "573002720356";  // ← PON TU NÚMERO AQUÍ (con 57)
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

// Vocabulario de la columna "estado" de gestión: SAI y los formularios manuales
// ya hablan ambos en masculino (APROBADO/APLAZADO/RECHAZADO), así que no hace
// falta traducir nada al escribir el resultado de SAI.
var ESTADOS_FINALES_GESTION = new Set(['APROBADO', 'RECHAZADO']);
var VENTANA_DIAS_VERIFICACION_SAI = 3;

// Alcance de verificarAprobacionDesaplazamientos(): por ahora solo desaplazamiento e
// inducción (columna 61 de Historico_Gestiones, el "tipo asignado"), no digital/canones
// altos. Ventana de 90 días porque esa es la vigencia real de una solicitud — más allá
// de eso ya no tiene sentido seguir preguntándole a SAI.
var TIPOS_VERIFICACION_DESAPLAZAMIENTO_INDUCCION = new Set(['desaplazamiento', 'induccion']);
var VENTANA_DIAS_VERIFICACION_DESAPLAZAMIENTO_INDUCCION = 90;

/**
 * Verifica contra SAI el resultado real de los casos de desaplazamiento e inducción
 * (Historico_Gestiones principal) que un analista dejó sin resolución definitiva
 * (aplazado, negado con motivo pendiente, etc.). No toca digital/canones altos.
 * Diseñada para ejecutarse con trigger diario de 4 a 5 pm.
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
    return { success: true, message: "No hay casos pendientes de verificación.", totalRevisados: 0, totalActualizados: 0, detalles: [] };
  }

  var endpoint = getEndPointNewSai();
  var apiKey = getKeyFull();
  if (!endpoint || !apiKey) return { success: false, message: "Endpoint o API key de SAI no configurados." };

  // Consultar SAI candidato por candidato ANTES de tomar el lock: son llamadas HTTP
  // con pausa de 2s entre cada una, y no deben retener el ScriptLock global que
  // también usan la asignación de casos y el resto del sistema.
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
      message: "Verificación completada. 0 de " + candidatos.length + " actualizados.",
      totalRevisados: candidatos.length,
      totalActualizados: 0,
      detalles: detalles
    };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return { success: false, message: "No se pudo adquirir el lock. Intenta más tarde." };
  }

  try {
    actualizaciones.forEach(function(u) {
      hojaHist.getRange(u.filaReal, 17).setValue(u.estado);
    });
    SpreadsheetApp.flush();

    return {
      success: true,
      message: "Verificación completada. " + actualizaciones.length + " de " + candidatos.length + " actualizados.",
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
    Logger.log("Verificación desaplazamientos: " + resultado.totalRevisados + " revisados, " + resultado.totalActualizados + " actualizados.");
  } catch (e) {
    Logger.log("Error en trigger verificación desaplazamientos: " + e.message);
  }
}

/**
 * `verificarAprobacionDesaplazamientos()` ya cubre `induccion` explícitamente (mismo
 * Historico_Gestiones, mismo filtro de tipo). Este wrapper es 100% redundante — si el
 * trigger `triggerVerificacionInducciones` sigue activo en la UI de Apps Script junto
 * al de `triggerVerificacionDesaplazamientos`, hay que borrar uno de los dos: ambos
 * corren exactamente el mismo trabajo y disparar los dos duplica innecesariamente las
 * llamadas a SAI (y el riesgo de que la ejecución se pase del tiempo límite).
 */
function verificarResultadoInducciones() {
  return verificarAprobacionDesaplazamientos();
}

function triggerVerificacionInducciones() {
  try {
    var resultado = verificarResultadoInducciones();
    Logger.log("Verificación inducciones: " + resultado.totalRevisados + " revisados, " + resultado.totalActualizados + " actualizados.");
  } catch (e) {
    Logger.log("Error en trigger verificación inducciones: " + e.message);
  }
}

/**
 * Verifica contra SAI el resultado real de los casos de reestudio/nuevaUar/deudorUar
 * que un analista dejó sin resolución definitiva. Estos tipos viven en una hoja de
 * cálculo distinta (ID_HOJA_REESTUDIOS), con su propio esquema de columnas:
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
    return { success: true, message: "No hay casos pendientes de verificación.", totalRevisados: 0, totalActualizados: 0, detalles: [] };
  }

  var endpoint = getEndPointNewSai();
  var apiKey = getKeyFull();
  if (!endpoint || !apiKey) return { success: false, message: "Endpoint o API key de SAI no configurados." };

  // Consultar SAI candidato por candidato ANTES de tomar el lock: son llamadas HTTP
  // con pausa de 2s entre cada una, y no deben retener el ScriptLock global que
  // también usan la asignación de casos y el resto del sistema.
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
      message: "Verificación completada. 0 de " + candidatos.length + " actualizados.",
      totalRevisados: candidatos.length,
      totalActualizados: 0,
      detalles: detalles
    };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return { success: false, message: "No se pudo adquirir el lock. Intenta más tarde." };
  }

  try {
    actualizaciones.forEach(function(u) {
      hojaHist.getRange(u.filaReal, 11).setValue(u.estado);
    });
    SpreadsheetApp.flush();

    return {
      success: true,
      message: "Verificación completada. " + actualizaciones.length + " de " + candidatos.length + " actualizados.",
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
    Logger.log("Verificación reestudios/UAR: " + resultado.totalRevisados + " revisados, " + resultado.totalActualizados + " actualizados.");
  } catch (e) {
    Logger.log("Error en trigger verificación reestudios/UAR: " + e.message);
  }
}