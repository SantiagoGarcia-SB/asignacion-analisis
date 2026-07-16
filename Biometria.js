// OBSOLETA: biometrías ahora se toman de la hoja "solicitud" en ID_WAREHOUSE_USUARIOS
// const ID_SHEET_ORIGEN = '1tmXIxNB65eAUQah8dxvSJSJVKmR25ZiuM59SLX0NYME';
// OBSOLETA: biometría ahora usa Historico_Gestiones en ID_WAREHOUSE_USUARIOS
// const ID_SHEET_GESTION = '1lT9BxWAKgo9xed9xaAbbFqna304TWNbzL3v2302ZvOQ';
const ID_WAREHOUSE_USUARIOS = '1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0';
const ID_SHEET_BIOMETRIA_PENDIENTE = '1gHW1RFMVd0h4HZr2xTrFnx-A5Pk_npJs-bAk8GOx2h0';
const NOMBRE_HOJA_PENDIENTE_BIOMETRIA = 'pendiente_biometria';
// OBSOLETA — la trazabilidad de archivadas ahora se gestiona directamente en
// pendiente_biometria con fase "ARCHIVADA". La hoja se conserva como registro histórico.
const NOMBRE_HOJA_BIOMETRIA_ARCHIVADA = 'biometria_cola_archivada';

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

// IMPORTANTE: la consulta paginada a SAI (lenta, con pausas de 2s entre páginas) corre
// SIN el ScriptLock — igual que se corrigió en verificarAprobacionDesaplazamientos/Uar
// (ver commit "Corrige retención de lock durante llamadas a SAI"). El lock solo se toma
// al final, para el borrado, y justo antes se vuelve a leer la hoja para confirmar que
// la fila sigue ahí con el mismo estado (evita borrar una fila que otro proceso ya movió
// o reemplazó mientras se esperaba la respuesta de SAI).
// Se llama tanto desde el ciclo horario (cicloLimpiezaBiometriaEscalada) como desde el
// de corte 8am/12pm (cicloBiometriaPendiente) — si ambos triggers coinciden en una misma
// franja, esta guarda evita repetir la misma tanda de consultas individuales a SAI.
const _MIN_ENTRE_CORRIDAS_LIMPIAR_BIOMETRIAS = 5;
function limpiarBiometriasResueltas() {
  var propsGuarda = PropertiesService.getScriptProperties();
  var ULTIMA_CORRIDA_KEY = 'ULTIMA_CORRIDA_LIMPIAR_BIOMETRIAS_MS';
  var ahoraMs = Date.now();
  var ultimaMs = parseInt(propsGuarda.getProperty(ULTIMA_CORRIDA_KEY), 10) || 0;
  if (ahoraMs - ultimaMs < _MIN_ENTRE_CORRIDAS_LIMPIAR_BIOMETRIAS * 60000) {
    Logger.log("⏭️ limpiarBiometriasResueltas: ya corrió hace menos de " + _MIN_ENTRE_CORRIDAS_LIMPIAR_BIOMETRIAS + " min (el ciclo horario y el de corte probablemente coincidieron) — se salta para no repetir las mismas consultas a SAI.");
    return;
  }
  propsGuarda.setProperty(ULTIMA_CORRIDA_KEY, String(ahoraMs));

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
      Logger.log("✅ No hay biometrías pendientes para revisar.");
      return;
    }

    Logger.log("📋 " + bioIds.length + " biometrías pendientes a verificar contra SAI (consulta individual).");

    // Consulta individual por solicitud (mismo patrón que _procesarCortePendientes()) en vez
    // de la búsqueda paginada por rango de fechas: con la cola típica (decenas, no miles de
    // pendientes) es mucho más rápido y no depende de que la solicitud se haya radicado
    // dentro de una ventana de días — antes, una solicitud radicada hace más de 4 días
    // quedaba fuera del rango de búsqueda y nunca se revisaba.
    const estadosSai = new Map();
    const fechasSai = new Map();
    for (let i = 0; i < bioIds.length; i++) {
      const datosApi = _consultarSaiIndividual(bioIds[i]);
      if (datosApi) {
        estadosSai.set(bioIds[i], String(datosApi.studyStatus || "").toUpperCase().trim());
        // Mismo campo que _homologarDatosApi() usa para fechaResultado (lastResultDate con
        // fallback a lastMovementDate) — si aquí se comparara contra un campo distinto al que
        // se guardó al escalar, cualquier caso recién escalado se vería como "cambiado" en su
        // primera revisión horaria solo por la diferencia entre campos, no porque SAI haya
        // movido algo de verdad.
        const fechaResultadoApi = datosApi.lastResultDate || datosApi.lastMovementDate || "";
        if (fechaResultadoApi) fechasSai.set(bioIds[i], fechaResultadoApi);
      } else {
        Logger.log("⚠️ Sin respuesta API para " + bioIds[i]);
      }
      Utilities.sleep(1000);
    }

    const ESTADOS_CONSERVAR = new Set(["APROBADO_PENDIENTE_BIOMETRIA", "EN_ESTUDIO"]);
    const idsAEliminar = new Set();
    const fechasAActualizar = new Map(); // id → nueva fechaResultado (texto normalizado)

    for (let i = 0; i < datos.length; i++) {
      const estado = String(datos[i][16]).toUpperCase().trim();
      if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;

      const solicitud = String(datos[i][0]).trim();
      if (!solicitud) continue;

      const statusSai = estadosSai.get(solicitud);
      if (statusSai && !ESTADOS_CONSERVAR.has(statusSai)) {
        idsAEliminar.add(solicitud);
        Logger.log("🗑️ Solicitud " + solicitud + " cambió a " + statusSai);
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
      Logger.log("✅ Ninguna biometría cambió de estado ni de fechaResultado.");
      return;
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(5000);
    } catch (e) {
      Logger.log("❌ Lock no disponible para limpiar biometrías (no se bloquea la asignación): " + e.message);
      return;
    }

    try {
      // Re-leer justo antes de actuar: si otro proceso ya asignó/movió la fila mientras
      // se esperaba la respuesta de SAI, esta relectura evita tocar la fila equivocada.
      const lastRowActual = hoja.getLastRow();
      if (lastRowActual < 2) return;
      const lastColActual = hoja.getLastColumn();
      const filasCompletas = hoja.getRange(2, 1, lastRowActual - 1, lastColActual).getValues();

      let eliminadas = 0;
      let actualizadas = 0;
      const filasFinales = [];
      for (let i = 0; i < filasCompletas.length; i++) {
        const fila = filasCompletas[i];
        const solicitud = String(fila[0]).trim();
        const estado = String(fila[16]).toUpperCase().trim();

        if (estado === "APROBADO_PENDIENTE_BIOMETRIA" && idsAEliminar.has(solicitud)) {
          eliminadas++;
          continue; // se excluye del recorte en bloque
        }
        if (estado === "APROBADO_PENDIENTE_BIOMETRIA" && fechasAActualizar.has(solicitud)) {
          fila[18] = fechasAActualizar.get(solicitud);
          actualizadas++;
        }
        filasFinales.push(fila);
      }

      // Recorte en bloque en vez de deleteRow() por fila: con backlogs grandes, cientos de
      // deleteRow() secuenciales son lentos y mantienen el ScriptLock ocupado más tiempo del
      // necesario (mismo problema ya corregido en _archivarColaBiometriaVencida()). En su
      // lugar se reescribe toda la hoja de una sola vez, conservando el orden de las filas
      // que quedan.
      if (eliminadas > 0 || actualizadas > 0) {
        hoja.getRange(2, 1, filasCompletas.length, lastColActual).clearContent();
        if (filasFinales.length > 0) {
          hoja.getRange(2, 1, filasFinales.length, lastColActual).setValues(filasFinales);
        }
        SpreadsheetApp.flush();
        Logger.log("✅ " + eliminadas + " biometrías resueltas eliminadas. " + actualizadas + " fechaResultado actualizadas.");
      } else {
        Logger.log("ℹ️ Las filas candidatas ya no estaban disponibles al momento de actuar (probablemente asignadas mientras tanto).");
      }
    } finally {
      if (lock.hasLock()) lock.releaseLock();
    }

    // Fuera del lock: registrar en pendiente_biometria que estas solicitudes se resolvieron
    // solas mientras estaban en la cola (ningún analista las tomó).
    if (idsAEliminar.size > 0) {
      _actualizarFaseBiometriaPendiente(idsAEliminar, "RESUELTA_EN_COLA");
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
    // Misma ventana de liberación que usa RequestLeadUnificado (ver
    // _calcularLimiteLiberacionDesaplazamiento en este archivo), para que ambas rutas de
    // asignación (manual y automática) respeten la regla real de operación: un caso "de
    // esta tarde" no se ofrece hasta la sesión de mañana del siguiente día hábil.
    const limiteLiberacionDesaplazamiento = _calcularLimiteLiberacionDesaplazamiento(new Date());

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
      // _parseDateUnif devuelve un NÚMERO (ms desde epoch), no un Date — y 9999999999999
      // si no pudo parsear fecha; ese caso no se filtra, para no bloquearlo para siempre.
      const fechaOrdCandidato = _parseDateUnif(row[18]);
      if (fechaOrdCandidato !== 9999999999999 && fechaOrdCandidato >= limiteLiberacionDesaplazamiento.getTime()) continue;

      candidatosElegibles.push({ row: row, sheetRowIndex: i + 2, fechaOrd: fechaOrdCandidato });
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

    // Registrar en pendiente_biometria que estas solicitudes fueron asignadas a un analista.
    var idsAsignadas = candidatosParaAsignar.map(c => String(c.row[0]).trim()).filter(id => id);
    _actualizarFaseBiometriaPendiente(idsAsignadas, "ASIGNADA");

    // Agregar al índice de casos abiertos
    idsAsignadas.forEach(function(id) { _agregarCasoAbierto(userEmail, id); });

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
    lock.waitLock(10000);
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

    // Antes leía 34 columnas de toda la hoja para ubicar el ID. Ahora usa
    // TextFinder acotado a la columna del ID.
    const colIdBio = hojaHist.getRange(2, 1, lastRow - 1, 1);
    const matchesIdBio = colIdBio.createTextFinder(String(idSolicitud).trim()).matchEntireCell(true).findAll();

    for (let i = 0; i < matchesIdBio.length; i++) {
      const filaReal0 = matchesIdBio[i].getRow();
      const fila = hojaHist.getRange(filaReal0, 1, 1, 34).getValues()[0];
      const solId = String(fila[0]).trim();
      const emailH = String(fila[25]).trim().toLowerCase();
      const fechaFin = String(fila[26]).trim();

      if (solId === String(idSolicitud).trim() && emailH === userEmail && fechaFin === '') {
        const filaReal = filaReal0;
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
        const tiempos = calcularTiemposCaso(tRadCola, fechaAsignacion, ahora, userEmail, ss);
        hojaHist.getRange(filaReal, 35, 1, 3).setValues([[tiempos.minutos_cola, tiempos.minutos_gestion, tiempos.minutos_general]]);
        hojaHist.getRange(filaReal, 35, 1, 3).setNumberFormat("0.00");

        _registrarCierreContador(userEmail, 'desaplazamiento', fechaAsignacion, String(idSolicitud).trim());

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
// "RESUELTA_EN_COLA" = SAI dejó de reportar pendiente mientras estaba en cola "solicitud" (sin analista)
// "ASIGNADA" = un analista la tomó desde la cola | "ARCHIVADA" = se venció en cola sin ser asignada
// Columna 77 (índice 76): fecha_actualizacion_fase — se sobrescribe con la fecha/hora exacta
// cada vez que fase_seguimiento_biometria cambia de valor. Requiere correr una vez
// agregarColumnaFechaActualizacionFase() para crear el encabezado en la hoja.
var COL_FECHA_ACTUALIZACION_FASE = 77;

/**
 * Actualiza la fase final en pendiente_biometria para una lista de consecutivos.
 * Busca cada consecutivo en la hoja y marca la fase indicada + timestamp.
 * Solo actualiza filas cuya fase actual sea "ESCALADA" (las únicas que deberían
 * estar en la cola "solicitud"). Si la fase ya es terminal (RESUELTA, RESUELTA_EN_COLA,
 * ASIGNADA, ARCHIVADA), no la sobreescribe — protege contra doble ejecución.
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
      if (idsSet.size === 0) break; // ya encontró todas
    }

    if (actualizadas > 0) {
      SpreadsheetApp.flush();
      Logger.log("📝 pendiente_biometria: " + actualizadas + " filas actualizadas a fase '" + nuevaFase + "'.");
    }
  } catch (e) {
    // No lanzar: esta operación es de trazabilidad, no debe romper el flujo principal.
    Logger.log("⚠️ Error actualizando fase en pendiente_biometria (" + nuevaFase + "): " + e.message);
  }
}

// SUSPENDIDA (2026-07-13): la captura de nuevas biometrías se fusionó dentro de
// actualizarSolicitudesNuevasAPI (Código.js) — antes esta función paginaba el mismo
// endpoint y el mismo rango de fechas de SAI por separado, solo para quedarse con el
// subconjunto complementario (APROBADO_PENDIENTE_BIOMETRIA). Ahora esa clasificación
// pasa en la misma pasada que la consulta principal, así que este trigger ya no tiene
// nada propio que hacer. Se puede borrar el trigger de tiempo asociado a esta función
// en el editor de Apps Script (ícono del reloj) cuando sea conveniente.
function consultarBiometriasPeriodicaAPI() {
  Logger.log("consultarBiometriasPeriodicaAPI SUSPENDIDA — la captura de biometrías ahora corre dentro de actualizarSolicitudesNuevasAPI (Código.js)");
  return;
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

// Calcula el inicio de la ventana de ~12h que se abre en el corte actual (8am o 12pm),
// usada por _archivarColaBiometriaVencida() para decidir qué queda fuera de plazo.
// Los triggers reales corren en las ventanas 7-8am y 11-12pm (Apps Script no dispara al
// minuto exacto), así que el corte de "12pm" normalmente se ejecuta con hora=11, todavía
// menor a 12. Por eso el corte se separa en el punto medio entre ambas ventanas (hora < 9),
// no en el mediodía exacto — de lo contrario el corte de 11-12 se clasificaba como si fuera
// el de 8am y usaba el umbral equivocado (más laxo: "ayer 12:00pm" en vez de "hoy 00:00").
// Corte 8am (hora < 9): la ventana que se abre es "ayer 12:00pm–11:59pm" → umbral = ayer 12:00pm.
// Corte 12pm (hora >= 9): la ventana que se abre es "hoy 00:00–11:59am" → umbral = hoy 00:00.
// Se deriva de la hora real de ejecución (no de un parámetro fijo) para poder probarla manualmente.
function _calcularUmbralArchivoColaBiometria(ahora) {
  var base = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (ahora.getHours() < 9) {
    var ayerMediodia = new Date(base.getTime() - 12 * 60 * 60 * 1000);
    return { umbral: ayerMediodia, corteOrigen: "CORTE_8AM" };
  }
  return { umbral: base, corteOrigen: "CORTE_12PM" };
}

// Lee pendiente_biometria y devuelve un mapa solicitud → fecha en que pasó a fase
// "ESCALADA" (col 77, fecha_actualizacion_fase). Es el momento real en que el caso
// entró a la cola de llamada en "solicitud" — a diferencia de fechaResultado/
// fechaRadicacion (fechas de SAI, que no reflejan cuánto lleva el caso en cola).
function _mapaFechaEscaladaBiometria() {
  var mapa = new Map();
  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio || hojaBio.getLastRow() < 2) return mapa;

  var lastRow = hojaBio.getLastRow();
  var ids = hojaBio.getRange(2, 1, lastRow - 1, 1).getValues();
  var fases = hojaBio.getRange(2, 76, lastRow - 1, 1).getValues();
  var fechas = hojaBio.getRange(2, COL_FECHA_ACTUALIZACION_FASE, lastRow - 1, 1).getValues();

  for (var i = 0; i < ids.length; i++) {
    if (String(fases[i][0]).trim().toUpperCase() !== "ESCALADA") continue;
    var solId = String(ids[i][0]).trim();
    if (!solId) continue;
    var fecha = _parseFechaGAS(fechas[i][0]);
    if (fecha) mapa.set(solId, fecha);
  }
  return mapa;
}

// Archiva a biometria_cola_archivada (mismo spreadsheet de pendiente_biometria) las
// solicitudes APROBADO_PENDIENTE_BIOMETRIA sin asignar en "solicitud" cuya fechaResultado
// de SAI (col S) sea anterior al umbral del corte actual — es decir, que según la hora
// de SAI ya tuvieron un ciclo completo de ~12h para ser llamadas y no se lograron asignar.
// limpiarBiometriasResueltas() refresca esta fecha contra SAI justo antes en el mismo ciclo,
// así que siempre refleja el dato más reciente del API.
// Es una bandeja de solo revisión manual: no hay reactivación automática (ver
// admin_desarchivarBiometrias() para la recuperación manual).
function _archivarColaBiometriaVencida() {
  Logger.log("--- Archivado de cola de biometría vencida ---");

  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  if (!hoja) { Logger.log("Hoja 'solicitud' no encontrada."); return; }

  var lastRow = hoja.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en 'solicitud'."); return; }

  var ahora = new Date();
  var vent = _calcularUmbralArchivoColaBiometria(ahora);

  // Fase 1 — sin lock: lectura y decisión sobre los datos vigentes en este momento.
  // limpiarBiometriasResueltas() ya corrió justo antes en el mismo ciclo y refrescó
  // fechaResultado (col S) contra SAI, así que la fecha aquí refleja el último movimiento
  // real en SAI. Si SAI no ha movido el caso desde antes del umbral, se archiva.
  var datos = hoja.getRange(2, 1, lastRow - 1, hoja.getLastColumn()).getValues();
  var idsCandidatos = new Set();

  for (var i = 0; i < datos.length; i++) {
    var row = datos[i];
    var estado = String(row[16]).toUpperCase().trim();
    if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;
    var asignado = String(row[27]).trim();
    if (asignado !== "") continue;

    var solicitud = String(row[0]).trim();
    if (!solicitud) continue;

    // Usar fechaResultado de SAI (col S, índice 18) — ya refrescada por
    // limpiarBiometriasResueltas() en este mismo ciclo. Fallback a fechaRadicacion.
    var fecha = _parseFechaGAS(row[18]) || _parseFechaGAS(row[17]);
    if (!fecha) {
      Logger.log("⚠️ Solicitud " + solicitud + " sin fechaResultado ni fechaRadicacion parseable — no se archiva.");
      continue;
    }

    if (fecha.getTime() < vent.umbral.getTime()) {
      idsCandidatos.add(solicitud);
    }
  }

  if (idsCandidatos.size === 0) {
    Logger.log("✅ No hay solicitudes fuera de ventana (" + vent.corteOrigen + ") para archivar.");
    return;
  }

  Logger.log(idsCandidatos.size + " solicitudes candidatas a archivar (" + vent.corteOrigen + ").");

  // Fase 2 — con lock, solo para actuar: re-leer y re-filtrar por si algún analista tomó
  // el caso entre la fase 1 y este punto (mismo patrón que limpiarBiometriasResueltas()).
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) {
    Logger.log("❌ Lock no disponible para archivar cola de biometría (no se bloquea la asignación): " + e.message);
    return;
  }

  try {
    var lastRowActual = hoja.getLastRow();
    if (lastRowActual < 2) return;
    // Ancho dinámico (no fijo a 58): la columna 59 (BG) guarda el flag REASIGNADA
    // (ver desasignarSolicitud en Admin.js y su lectura en MotorAsignacion.js) — un
    // ancho fijo la deja fuera de la reescritura de abajo y esa columna queda con el
    // valor viejo de esa posición de fila tras el corrimiento, desalineando REASIGNADA
    // entre solicitudes.
    var numColsActual = hoja.getLastColumn();
    var datosActuales = hoja.getRange(2, 1, lastRowActual - 1, numColsActual).getValues();

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
      Logger.log("ℹ️ Las candidatas ya no estaban disponibles al momento de archivar (probablemente asignadas mientras tanto).");
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

    hoja.getRange(2, 1, datosActuales.length, numColsActual).clearContent();
    if (filasRestantes.length > 0) {
      hoja.getRange(2, 1, filasRestantes.length, numColsActual).setValues(filasRestantes);
    }

    SpreadsheetApp.flush();
    Logger.log("✅ " + idsAQuitarDeSolicitud.size + " solicitudes vencidas eliminadas de cola (" + vent.corteOrigen + ").");

    // Registrar en pendiente_biometria que estas solicitudes se vencieron sin ser asignadas.
    _actualizarFaseBiometriaPendiente(idsAQuitarDeSolicitud, "ARCHIVADA");
  } catch (e) {
    Logger.log("❌ Error en _archivarColaBiometriaVencida: " + e.message);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

// DIAGNÓSTICO MANUAL, SOLO LECTURA — correr desde el editor sin parámetros. Simula la
// Fase 1 de _archivarColaBiometriaVencida() (misma selección de candidatos, mismo umbral)
// pero sin archivar nada, para poder revisar antes de que corra el trigger real qué se
// archivaría y por qué. Útil para confirmar que el atrasado de un finde/festivo no se
// está por archivar antes de tiempo, o para entender por qué un caso puntual sí calificó.
function diagnosticarArchivadoColaBiometria() {
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  if (!hoja) { Logger.log("Hoja 'solicitud' no encontrada."); return; }

  var lastRow = hoja.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en 'solicitud'."); return; }

  var ahora = new Date();
  var vent = _calcularUmbralArchivoColaBiometria(ahora);
  var mapaEscalada = _mapaFechaEscaladaBiometria();

  Logger.log("=== DIAGNÓSTICO archivado de cola de biometría (" + ahora + ") ===");
  Logger.log("Corte detectado: " + vent.corteOrigen + " | Umbral: " + vent.umbral);

  var datos = hoja.getRange(2, 1, lastRow - 1, 58).getValues();
  var seArchivarian = [];
  var seSalvan = [];
  var sinFecha = [];

  for (var i = 0; i < datos.length; i++) {
    var row = datos[i];
    var estado = String(row[16]).toUpperCase().trim();
    if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;
    var asignado = String(row[27]).trim();
    if (asignado !== "") continue;

    var solicitud = String(row[0]).trim();
    if (!solicitud) continue;

    var fechaEscalada = mapaEscalada.get(solicitud);
    var fuente = fechaEscalada ? "ESCALADA (real)" : null;
    var fecha = fechaEscalada;
    if (!fecha) { fecha = _parseFechaGAS(row[18]); if (fecha) fuente = "fechaResultado (fallback)"; }
    if (!fecha) { fecha = _parseFechaGAS(row[17]); if (fecha) fuente = "fechaRadicacion (fallback)"; }

    if (!fecha) {
      sinFecha.push(solicitud);
      continue;
    }

    var horas = Math.round((ahora.getTime() - fecha.getTime()) / (60 * 60 * 1000) * 10) / 10;
    var linea = solicitud + " | fuente=" + fuente + " | fecha=" + fecha + " | horas_en_cola=" + horas;

    if (fecha.getTime() < vent.umbral.getTime()) {
      seArchivarian.push(linea);
    } else {
      seSalvan.push(linea);
    }
  }

  Logger.log("--- SE ARCHIVARÍAN si corriera el trigger ahora (" + seArchivarian.length + ") ---");
  seArchivarian.forEach(function(l) { Logger.log("🔴 " + l); });

  Logger.log("--- NO se archivan, siguen dentro de su ventana (" + seSalvan.length + ") ---");
  seSalvan.forEach(function(l) { Logger.log("🟢 " + l); });

  if (sinFecha.length > 0) {
    Logger.log("--- SIN fecha parseable, no se archivan por falta de dato (" + sinFecha.length + ") ---");
    Logger.log(sinFecha.join(", "));
  }

  Logger.log("=== FIN DIAGNÓSTICO ===");
}

// DIAGNÓSTICO MANUAL, SOLO LECTURA — correr desde el editor sin parámetros. Con los datos
// reales de "solicitud" en este momento, muestra qué candidatos a desaplazamiento
// quedarían LIBERADOS (se le pueden ofrecer a un analista ahora, vía RequestLeadUnificado
// o autoAsignarBiometria) vs. ESPERANDO su ventana (_calcularLimiteLiberacionDesaplazamiento)
// si se pidiera una asignación en este instante. No asigna ni modifica nada.
function diagnosticarLiberacionDesaplazamiento() {
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  if (!hoja) { Logger.log("Hoja 'solicitud' no encontrada."); return; }

  var lastRow = hoja.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en 'solicitud'."); return; }

  var ahora = new Date();
  var limite = _calcularLimiteLiberacionDesaplazamiento(ahora);
  var sesion = ahora.getHours() < 12 ? "MAÑANA (antes de 12m)" : "TARDE (desde 12m)";

  Logger.log("=== DIAGNÓSTICO ventana de liberación desaplazamiento (" + ahora + ") ===");
  Logger.log("Sesión: " + sesion + " | Límite de liberación (fechaResultado <): " + limite);

  var datos = hoja.getRange(2, 1, lastRow - 1, 59).getValues();
  var liberados = [];
  var esperando = [];

  for (var i = 0; i < datos.length; i++) {
    var row = datos[i];
    var estado = String(row[16]).toUpperCase().trim();
    if (estado !== "APROBADO_PENDIENTE_BIOMETRIA") continue;
    var asignado = String(row[27]).trim();
    if (asignado !== "") continue;

    var solicitud = String(row[0]).trim();
    if (!solicitud) continue;

    var reasignada = row.length > 58 && String(row[58]).trim().toUpperCase() === "REASIGNADA";
    // _parseDateUnif devuelve un NÚMERO (ms desde epoch), no un Date — y 9999999999999
    // si no pudo parsear fecha (fechaResultado vacía).
    var fechaResultadoMs = _parseDateUnif(row[18]);
    var sinFechaParseable = fechaResultadoMs === 9999999999999;

    var linea = solicitud + " | fechaResultado=" + (sinFechaParseable ? "(sin fecha)" : new Date(fechaResultadoMs)) + (reasignada ? " | REASIGNADA (bypass)" : "");

    if (reasignada || sinFechaParseable || fechaResultadoMs < limite.getTime()) {
      liberados.push(linea);
    } else {
      esperando.push(linea);
    }
  }

  Logger.log("--- LIBERADOS, se pueden ofrecer a un analista ahora (" + liberados.length + ") ---");
  liberados.forEach(function(l) { Logger.log("🟢 " + l); });

  Logger.log("--- ESPERANDO su ventana, no se ofrecen todavía (" + esperando.length + ") ---");
  esperando.forEach(function(l) { Logger.log("🟡 " + l); });

  Logger.log("=== FIN DIAGNÓSTICO ===");
}

// Trigger 8am y 12pm: escala a la cola de asignación (llamada) los pendientes que ya
// están en fase WA_ENVIADO (segundo contacto) y SAI sigue diciendo pendiente.
// Si SAI ya no dice pendiente, el caso se marca resuelto y no se llama.
// También, en este mismo corte: refresca fechaResultado contra SAI, archiva lo que agotó
// su ventana de ~12h sin ser asignado, y solo entonces escala los nuevos pendientes.
function cicloBiometriaPendiente() {
  Logger.log("=== INICIO cicloBiometriaPendiente ===");
  if (_esDiaNoHabilOperacion(new Date())) {
    Logger.log("⏸️ Día no hábil para operación (domingo o festivo) — se omite limpieza/archivado/escalada. Nadie está llamando hoy, así que archivar por tiempo de espera penalizaría casos sin que operación tuviera oportunidad real de tomarlos.");
    Logger.log("=== FIN cicloBiometriaPendiente ===");
    return;
  }
  limpiarBiometriasResueltas();
  _archivarColaBiometriaVencida();
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

// MANUAL — correr desde el editor cuando se necesita forzar la escalación sin que el
// archivado use el umbral de CORTE_12PM (que archivaría lo de ayer tarde antes de que
// operación lo trabaje). Solo limpia resueltas + escala pendientes, SIN archivar nada.
function forzarEscalacionSinArchivar() {
  Logger.log("=== INICIO forzarEscalacionSinArchivar (MANUAL) ===");
  limpiarBiometriasResueltas();
  _procesarCortePendientes();
  Logger.log("=== FIN forzarEscalacionSinArchivar ===");
}

function enviarBroadcastInfobipConFilas(filasBiometria, hojaBio, filasSheet) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var baseUrl = props.getProperty('INFOBIP_BASE_URL');
  var templateName = props.getProperty('INFOBIP_TEMPLATE_NAME');
  var sender = props.getProperty('INFOBIP_SENDER');
  var headerImageUrl = props.getProperty('INFOBIP_HEADER_IMAGE_URL');

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

// Wrapper sin argumentos: el botón "Ejecutar" del editor no permite pasar parámetros,
// así que este es el que hay que seleccionar y correr directamente.
function diagnosticarDestinosBiometriaTest() {
  diagnosticarDestinosBiometria('12236327');
}

// DIAGNÓSTICO MANUAL — correr desde el editor pasando un consecutivo, p.ej.
// diagnosticarDestinosBiometria('12236327'). Muestra en el log el resultCode real
// del inquilino y de cada codeudor tal como los devuelve SAI, para entender por qué
// un caso queda sin destinatarios de WhatsApp (bio_destino_1..4 vacíos → estado ERROR).
function diagnosticarDestinosBiometria(consecutivo) {
  var item = _consultarSaiIndividual(String(consecutivo).trim());
  if (!item) {
    Logger.log("❌ Sin respuesta de SAI para " + consecutivo);
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

// DIAGNÓSTICO MANUAL — lee la fila realmente guardada en pendiente_biometria (no lo
// que SAI dice ahora, que ya pudo haber cambiado): estado, fase de seguimiento, cuándo
// se consultó por última vez, y qué quedó en las columnas bio_destino_1..4.
function diagnosticarFilaPendienteBiometria(consecutivo) {
  var id = String(consecutivo).trim();
  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("Hoja vacía."); return; }

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
  Logger.log("⚠️ No se encontró la solicitud " + id + " en pendiente_biometria.");
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

// true si la fecha dada es domingo o festivo (hoja "Festivos"). Extraído de
// _dentroDeVentanaLey2300() para poder reutilizarlo en guardas que no dependen de la
// franja horaria de la ley (p.ej. si el ciclo de biometría debe correr hoy o no).
function _esDiaNoHabilOperacion(fecha) {
  var fechaStr = Utilities.formatDate(fecha, "GMT-5", "yyyy-MM-dd");
  var dow = new Date(fechaStr + "T12:00:00").getDay(); // 0=domingo … 6=sábado
  if (dow === 0) return true;

  try {
    var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    var hojaFestivos = ss.getSheetByName("Festivos");
    if (hojaFestivos) {
      var valores = hojaFestivos.getDataRange().getValues();
      for (var i = 0; i < valores.length; i++) {
        var celda = valores[i][0];
        var fFestivo = celda instanceof Date ? celda : new Date(celda);
        if (!isNaN(fFestivo.getTime()) && Utilities.formatDate(fFestivo, "GMT-5", "yyyy-MM-dd") === fechaStr) {
          return true;
        }
      }
    }
  } catch (e) {
    Logger.log("⚠️ No se pudo verificar hoja Festivos, se asume día hábil: " + e.message);
  }
  return false;
}

// Ley 2300 de 2023: las comunicaciones de cobranza (incluye WhatsApp) solo se pueden
// enviar lunes a viernes 7:00-19:00 y sábados 8:00-15:00. Domingos y festivos, prohibido.
// Se valida aquí (y no solo confiando en el horario del trigger en GAS) para que el
// envío quede protegido aunque el trigger quede mal configurado o corra fuera de horario.
function _dentroDeVentanaLey2300() {
  var ahora = new Date();
  if (_esDiaNoHabilOperacion(ahora)) return false;

  var horaStr = Utilities.formatDate(ahora, "GMT-5", "HH:mm");
  var horaNum = parseInt(horaStr.split(':')[0], 10) + parseInt(horaStr.split(':')[1], 10) / 60;
  var fechaStr = Utilities.formatDate(ahora, "GMT-5", "yyyy-MM-dd");
  var dow = new Date(fechaStr + "T12:00:00").getDay();

  if (dow === 6) return horaNum >= 8 && horaNum < 15;
  return horaNum >= 7 && horaNum < 19;
}

// Ventana de liberación para asignar desaplazamiento/biometría, según la regla real de
// operación: en la sesión de la mañana (antes de las 12m) solo se libera lo de ANTES de
// hoy — cualquier día anterior, sin importar cuántos, así el atraso de un festivo/fin de
// semana se resuelve solo, sin que el sistema necesite saber que hubo un festivo de por
// medio. Desde las 12m se libera además lo de hoy en la mañana (00:00-11:59am). Un caso
// con fechaResultado de esta tarde nunca se libera hasta la sesión de mañana del
// siguiente día hábil. Se usa como límite superior (exclusivo) sobre fechaResultado — el
// límite inferior no importa: entre más viejo, más prioridad ya le da el orden existente
// (ORDEN_DESAPLAZAMIENTO). Mismo patrón de anclaje a "hoy" que
// _calcularUmbralArchivoColaBiometria(), pero para el límite opuesto.
function _calcularLimiteLiberacionDesaplazamiento(ahora) {
  var hoy00 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (ahora.getHours() < 12) return hoy00;
  return new Date(hoy00.getTime() + 12 * 60 * 60 * 1000);
}

// Primer contacto: evalúa pendientes en fase vacía, envía WhatsApp a los que ya
// cumplieron la ventana de 4h desde fecha_resultado y siguen pendientes en SAI.
function _enviarPrimerContactoBiometria() {
  Logger.log("--- Primer contacto: evaluación de pendientes en fase vacía ---");

  if (!_dentroDeVentanaLey2300()) {
    Logger.log("⏸️ Fuera del horario permitido por Ley 2300 (L-V 7:00-19:00, Sáb 8:00-15:00, no domingos/festivos). Envío de WA pospuesto al próximo corte hábil.");
    return;
  }

  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var numColsBio = Math.max(hojaBio.getLastColumn(), COL_FECHA_ACTUALIZACION_FASE);
  var datos = hojaBio.getRange(2, 1, lastRow - 1, numColsBio).getValues();

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
  try { lock.waitLock(5000); } catch (e) {
    Logger.log("❌ Lock no disponible para primer contacto de biometría (se reintenta en próximo ciclo): " + e.message);
    return;
  }

  try {
    var rowsParaWA = [];
    var filasParaWA = [];
    var ahora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");
    var huboCambios = false;

    for (var r = 0; r < resultados.length; r++) {
      var item = resultados[r].item;
      var datosApi = resultados[r].datosApi;

      if (!datosApi) {
        Logger.log("⚠️ Sin respuesta API para " + item.consecutivo);
        continue;
      }

      var statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();
      item.datosFila[62] = statusActual; // nuevo_estado_sai
      huboCambios = true;

      if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA") {
        item.datosFila[75] = "RESUELTA";
        item.datosFila[76] = ahora;
        Logger.log("✅ " + item.consecutivo + " se resolvió solo (" + statusActual + ") → cerrado, sin llamada.");
        continue;
      }

      rowsParaWA.push(item.datosFila);
      filasParaWA.push(item.fila);
      item.datosFila[75] = "WA_ENVIADO";
      item.datosFila[76] = ahora;
      Logger.log("📲 " + item.consecutivo + " cumple ventana de " + VENTANA_HORAS_WA_BIOMETRIA + "h y sigue pendiente → primer contacto (WhatsApp).");
    }

    // Una sola escritura en bloque (toda la hoja leída al inicio, mutada en memoria) en
    // vez de hasta 3 setValue() individuales por candidato — mismo motivo que en
    // limpiarBiometriasResueltas() y eliminarSolicitudesFinalizadas(): con backlogs
    // grandes, cientos de llamadas individuales a Sheets mantienen el ScriptLock ocupado
    // más tiempo del necesario, bloqueando a otros procesos que esperan el mismo candado
    // global (p.ej. guardarGestionBiometria()).
    if (huboCambios) {
      var numColsEscritura = datos[0].length;
      // Si al mutar datos se extendió una fila (p.ej. col 77 no existía al leer pero
      // se asignó en memoria), normalizar TODAS las filas a la misma longitud para que
      // setValues no falle por inconsistencia. Además, expandir el rango de escritura
      // al ancho real de los datos.
      for (var f = 0; f < datos.length; f++) {
        while (datos[f].length < numColsEscritura) datos[f].push("");
      }
      hojaBio.getRange(2, 1, datos.length, numColsEscritura).setValues(datos);
      SpreadsheetApp.flush();
    }
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

  if (!_dentroDeVentanaLey2300()) {
    Logger.log("⏸️ Fuera del horario permitido por Ley 2300 (L-V 7:00-19:00, Sáb 8:00-15:00, no domingos/festivos). No se envía, ni siquiera forzado manualmente.");
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
  try { lock.waitLock(5000); } catch (e) {
    Logger.log("❌ Lock no disponible para forzar primer contacto (se reintenta en próximo ciclo): " + e.message);
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

// Tope de candidatos por corrida — con backlogs grandes, consultar a SAI uno por uno (1s
// de pausa + latencia real) puede tomar más de los 30 min que da Apps Script. Si eso pasa,
// la corrida se corta a la mitad del loop de consultas — y como antes solo se escribía
// hasta el final, no quedaba nada guardado, así que el siguiente corte repetía las mismas
// 1369 consultas desde cero sin avanzar nunca (caso real: corrida de 2026-07-14 11:25am,
// seguía sin terminar pasados 23 minutos). Los más antiguos (por fecha_actualizacion_fase,
// o sea los que más tiempo llevan esperando desde que se les mandó el WA) se procesan
// primero, así el atraso se pone al día en unas pocas corridas en vez de nunca.
var MAX_CANDIDATOS_POR_CORTE = 500;
// Respaldo por tiempo además del tope de cantidad: si SAI responde más lento de lo normal
// un día dado, 500 candidatos podrían tardar más de lo esperado. Al llegar a este límite se
// deja de CONSULTAR candidatos nuevos (lo ya escrito se queda escrito) — así la corrida
// siempre cierra con margen antes del límite real de Apps Script.
var TIEMPO_MAXIMO_CONSULTAS_CORTE_MS = 20 * 60 * 1000;
// Cada cuántos candidatos procesados se escribe en la hoja, en vez de esperar a que
// termine todo el lote — así una corrida interrumpida no pierde el trabajo ya hecho.
var TAMANO_BLOQUE_ESCRITURA_CORTE = 50;

// Escalación: pendientes que ya están en fase WA_ENVIADO (segundo contacto) y siguen
// pendientes en SAI se escalan a la cola de asignación (llamada).
function _procesarCortePendientes() {
  Logger.log("--- Corte de escalación de pendientes de biometría ---");

  var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
  var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
  if (!hojaBio) { Logger.log("Hoja pendiente_biometria no encontrada."); return; }

  var lastRow = hojaBio.getLastRow();
  if (lastRow < 2) { Logger.log("No hay filas en pendiente_biometria."); return; }

  var datos = hojaBio.getRange(2, 1, lastRow - 1, COL_FECHA_ACTUALIZACION_FASE).getValues();

  var pendientes = [];
  for (var i = 0; i < datos.length; i++) {
    var fase = String(datos[i][75]).trim();
    if (fase !== "WA_ENVIADO") continue; // este corte solo escala casos que ya tuvieron su oportunidad por WhatsApp
    var consecutivo = String(datos[i][0]).trim();
    if (!consecutivo) continue;
    var fechaFase = _parseFechaGAS(datos[i][COL_FECHA_ACTUALIZACION_FASE - 1]);
    pendientes.push({ fila: i + 2, consecutivo: consecutivo, ts: fechaFase ? fechaFase.getTime() : 0 });
  }

  if (pendientes.length === 0) {
    Logger.log("No hay pendientes por escalar en este corte.");
    return;
  }

  pendientes.sort(function(a, b) { return a.ts - b.ts; }); // más antiguos primero
  var totalPendientes = pendientes.length;
  var candidatos = pendientes.slice(0, MAX_CANDIDATOS_POR_CORTE);
  Logger.log(totalPendientes + " pendientes en total; procesando hasta " + candidatos.length + " en este corte (los más antiguos primero).");

  var solicitudesParaAsignar = [];
  var actualizaciones = []; // { fila, fase, fecha, estadoSai }

  function _volcarBloque() {
    if (actualizaciones.length === 0) return;
    var lock = LockService.getScriptLock();
    try { lock.waitLock(5000); } catch (e) {
      Logger.log("❌ Lock no disponible para volcar bloque del corte (se reintenta en próximo ciclo): " + e.message);
      return;
    }
    try {
      actualizaciones.forEach(function(u) {
        hojaBio.getRange(u.fila, 63).setValue(u.estadoSai); // nuevo_estado_sai
        hojaBio.getRange(u.fila, 76).setValue(u.fase);
        hojaBio.getRange(u.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(u.fecha);
      });
      SpreadsheetApp.flush();
    } finally {
      if (lock.hasLock()) lock.releaseLock();
    }
    // procesarYGuardarLote() toma su propio lock — se llama fuera del try/finally de
    // arriba para no quedar sosteniendo dos locks del mismo script a la vez.
    if (solicitudesParaAsignar.length > 0) {
      procesarYGuardarLote(solicitudesParaAsignar.slice());
      solicitudesParaAsignar.length = 0;
    }
    actualizaciones = [];
  }

  var inicioMs = Date.now();
  var escaladas = 0, resueltas = 0, sinRespuesta = 0, dejadosPorTiempo = 0;

  for (var p = 0; p < candidatos.length; p++) {
    if (Date.now() - inicioMs > TIEMPO_MAXIMO_CONSULTAS_CORTE_MS) {
      dejadosPorTiempo = candidatos.length - p;
      Logger.log("⏱️ Tope de tiempo alcanzado, se dejan " + dejadosPorTiempo + " para el próximo corte.");
      break;
    }

    var item = candidatos[p];
    var datosApi = _consultarSaiIndividual(item.consecutivo);
    Utilities.sleep(1000);

    if (!datosApi) {
      sinRespuesta++;
      Logger.log("⚠️ Sin respuesta API para " + item.consecutivo);
      continue; // se queda en WA_ENVIADO, se reintenta en un próximo corte
    }

    var ahora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");
    var statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();

    if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA") {
      actualizaciones.push({ fila: item.fila, fase: "RESUELTA", fecha: ahora, estadoSai: statusActual });
      resueltas++;
    } else {
      solicitudesParaAsignar.push(_homologarDatosApi(datosApi));
      actualizaciones.push({ fila: item.fila, fase: "ESCALADA", fecha: ahora, estadoSai: statusActual });
      escaladas++;
    }

    if (actualizaciones.length >= TAMANO_BLOQUE_ESCRITURA_CORTE) {
      _volcarBloque();
    }
  }

  _volcarBloque();

  Logger.log("✅ Corte terminado: " + escaladas + " escaladas, " + resueltas + " resueltas solas, " + sinRespuesta + " sin respuesta SAI"
    + (dejadosPorTiempo > 0 ? ", " + dejadosPorTiempo + " dejados para el próximo corte por tiempo" : "")
    + (totalPendientes > candidatos.length ? " (quedan " + (totalPendientes - candidatos.length) + " más allá del tope de " + MAX_CANDIDATOS_POR_CORTE + ")" : "") + ".");
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

    if (!_esResultCodeBiometriaPendiente(datosApi.resultCode)) {
      Logger.log("ℹ️ " + candidatos[c].solicitud + " sigue " + statusActual + " pero resultCode=" + datosApi.resultCode + " (no 500/503) — no se puede determinar a quién contactar. Se deja en 'solicitud' para revisión manual.");
      yaNoAplica++;
      continue;
    }

    paraMover.push(_homologarDatosApi(datosApi));
    idsAMover.add(candidatos[c].solicitud);
    Utilities.sleep(1000);
  }

  if (idsAMover.size > 0) {
    var lock = LockService.getScriptLock();
    try { lock.waitLock(5000); } catch (e) {
      Logger.log("❌ Lock no disponible para mover biometrías mal enrutadas (se reintenta manual): " + e.message);
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

// ===================================================================
// DESARCHIVADO MANUAL DE BIOMETRÍAS (panel admin)
// ===================================================================
// Red de seguridad manual para _archivarColaBiometriaVencida(): esa función no tiene
// reactivación automática por diseño (es "bandeja de solo revisión manual"). Estas dos
// funciones le dan al admin una forma de ver qué se archivó y recuperar los N casos más
// recientes, siempre revalidando contra SAI antes de reponerlos en la cola.

// Devuelve las solicitudes en pendiente_biometria con fase "ARCHIVADA", más recientes
// primero (por fecha_actualizacion_fase), para que el admin decida cuántas recuperar.
function admin_listarBiometriasArchivadas() {
  try {
    var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
    var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
    if (!hojaBio || hojaBio.getLastRow() < 2) {
      return { success: true, total: 0, lista: [] };
    }

    var lastRow = hojaBio.getLastRow();
    var ids = hojaBio.getRange(2, 1, lastRow - 1, 1).getValues();
    var fases = hojaBio.getRange(2, 76, lastRow - 1, 1).getValues();
    var fechas = hojaBio.getRange(2, COL_FECHA_ACTUALIZACION_FASE, lastRow - 1, 1).getValues();

    var archivadas = [];
    for (var i = 0; i < ids.length; i++) {
      if (String(fases[i][0]).trim().toUpperCase() !== "ARCHIVADA") continue;
      var solId = String(ids[i][0]).trim();
      if (!solId) continue;
      var fecha = _parseFechaGAS(fechas[i][0]);
      archivadas.push({ solicitud: solId, fechaArchivado: fecha ? Utilities.formatDate(fecha, "GMT-5", "dd/MM/yyyy HH:mm") : "" , _ts: fecha ? fecha.getTime() : 0 });
    }

    archivadas.sort(function(a, b) { return b._ts - a._ts; });
    archivadas.forEach(function(a) { delete a._ts; });

    return { success: true, total: archivadas.length, lista: archivadas.slice(0, 50) };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Recupera las `cantidad` solicitudes más recientemente archivadas: revalida cada una
// contra SAI (mismo patrón que corregirBiometriasMalEnrutadas) y solo repone en la cola
// de llamada ("solicitud") las que SAI sigue reportando como pendientes de biometría. Las
// que ya se resolvieron por otro lado se dejan cerradas (fase "RESUELTA") en vez de
// reabrirlas. Se salta a propósito la protección de _actualizarFaseBiometriaPendiente()
// contra fases terminales, porque esta sí es una reactivación deliberada del admin.
function admin_desarchivarBiometrias(cantidad) {
  try {
    var n = parseInt(cantidad, 10);
    if (!n || n <= 0) return { success: false, message: "La cantidad debe ser un número mayor a 0." };

    var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
    var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
    if (!hojaBio || hojaBio.getLastRow() < 2) {
      return { success: true, message: "No hay biometrías archivadas.", restauradas: 0, yaResueltas: 0, sinRespuestaSai: 0 };
    }

    var lastRow = hojaBio.getLastRow();
    var ids = hojaBio.getRange(2, 1, lastRow - 1, 1).getValues();
    var fases = hojaBio.getRange(2, 76, lastRow - 1, 1).getValues();
    var fechas = hojaBio.getRange(2, COL_FECHA_ACTUALIZACION_FASE, lastRow - 1, 1).getValues();

    var candidatos = [];
    for (var i = 0; i < ids.length; i++) {
      if (String(fases[i][0]).trim().toUpperCase() !== "ARCHIVADA") continue;
      var solId = String(ids[i][0]).trim();
      if (!solId) continue;
      var fecha = _parseFechaGAS(fechas[i][0]);
      candidatos.push({ fila: i + 2, solicitud: solId, ts: fecha ? fecha.getTime() : 0 });
    }

    candidatos.sort(function(a, b) { return b.ts - a.ts; });
    candidatos = candidatos.slice(0, n);

    if (candidatos.length === 0) {
      return { success: true, message: "No hay biometrías archivadas para recuperar.", restauradas: 0, yaResueltas: 0, sinRespuestaSai: 0 };
    }

    var paraReponer = [];
    var filasAActualizar = []; // { fila, nuevaFase }
    var yaResueltas = 0, sinRespuestaSai = 0;

    for (var c = 0; c < candidatos.length; c++) {
      var datosApi = _consultarSaiIndividual(candidatos[c].solicitud);
      if (!datosApi) {
        sinRespuestaSai++;
        continue;
      }

      var statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();
      if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA" || !_esResultCodeBiometriaPendiente(datosApi.resultCode)) {
        filasAActualizar.push({ fila: candidatos[c].fila, nuevaFase: "RESUELTA" });
        yaResueltas++;
        continue;
      }

      paraReponer.push(_homologarDatosApi(datosApi));
      filasAActualizar.push({ fila: candidatos[c].fila, nuevaFase: "ESCALADA" });
      Utilities.sleep(1000);
    }

    var ahora = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");
    filasAActualizar.forEach(function(item) {
      hojaBio.getRange(item.fila, 76).setValue(item.nuevaFase);
      hojaBio.getRange(item.fila, COL_FECHA_ACTUALIZACION_FASE).setValue(ahora);
    });
    if (filasAActualizar.length > 0) SpreadsheetApp.flush();

    if (paraReponer.length > 0) {
      procesarYGuardarLote(paraReponer);
    }

    var msg = paraReponer.length + " biometría(s) repuestas en la cola de llamada.";
    if (yaResueltas > 0) msg += " " + yaResueltas + " ya se habían resuelto en SAI (se dejaron cerradas).";
    if (sinRespuestaSai > 0) msg += " " + sinRespuestaSai + " sin respuesta de SAI (se dejaron archivadas, reintentar luego).";

    return { success: true, message: msg, restauradas: paraReponer.length, yaResueltas: yaResueltas, sinRespuestaSai: sinRespuestaSai };
  } catch (e) {
    return { success: false, message: e.message };
  }
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
  try { lock.waitLock(5000); } catch (e) {
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
  try { lock.waitLock(5000); } catch (e) {
    Logger.log("❌ Lock no disponible para backfill (se reintenta luego): " + e.message);
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

// Únicos resultCode de SAI que indican biometría genuinamente pendiente para la persona
// evaluada en ese registro (500 = pendiente, 503 = igual pendiente por otro motivo).
// Cualquier otro resultCode (aunque estadoGeneral siga APROBADO_PENDIENTE_BIOMETRIA) es
// el resultado de otra acción no relacionada con biometría — p.ej. evaluación de un
// codeudor, error de sistema — y NO debe usarse para decidir a quién escribirle por
// WhatsApp ni para dejar entrar la solicitud a pendiente_biometria. Usado por los tres
// puntos que pueden insertar en esa hoja: actualizarSolicitudesNuevasAPI (Código.js,
// fusionó aquí la captura de nuevas biometrías el 2026-07-13), corregirBiometriasMalEnrutadas()
// y revisarEnEsperaCodeudor() (Código.js).
function _esResultCodeBiometriaPendiente(resultCode) {
  var rc = String(resultCode || "").trim();
  return rc === "500" || rc === "503";
}

function _guardarLoteBiometriaPendiente(listaObjetos) {
  if (!listaObjetos || listaObjetos.length === 0) return;

  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) {
    Logger.log("❌ Lock no disponible para guardar biometrías (se reintenta en próximo ciclo): " + e.message);
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

function configurarInfobip() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('INFOBIP_API_KEY', 'cc0c476419eea6d179ad2136c13c0072-a919e025-1367-4775-bd25-7d69973a0df7');
  props.setProperty('INFOBIP_BASE_URL', 'yrrzxg.api.infobip.com');
  props.setProperty('INFOBIP_TEMPLATE_NAME', 'biometria_pendiente');
  props.setProperty('INFOBIP_SENDER', '573148390322');
  props.setProperty('INFOBIP_HEADER_IMAGE_URL', 'https://image.experienciasbolivar.segurosbolivar.com/lib/fe3511747364047b751475/m/1/58814996-8fab-4e04-a605-9d60ff14d81a.png');
  Logger.log("✅ Propiedades de Infobip configuradas correctamente.");
}

// MIGRACIÓN ÚNICA — correr manualmente una sola vez desde el editor. Reemplaza la
function testEnviarWhatsApp() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('INFOBIP_API_KEY');
  var baseUrl = props.getProperty('INFOBIP_BASE_URL');
  var templateName = props.getProperty('INFOBIP_TEMPLATE_NAME');
  var sender = props.getProperty('INFOBIP_SENDER');
  var headerImageUrl = props.getProperty('INFOBIP_HEADER_IMAGE_URL');

  var telefono = "573002720356";  // ← PON TU NÚMERO AQUÍ (con 57)
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

// Núcleo compartido de verificarAprobacionDesaplazamientos() y
// verificarAprobacionReestudiosUar() — mismo patrón de consulta (candidatos → SAI
// caso por caso, sin lock → escritura con lock al final), solo cambia la hoja/columnas
// de origen y la ventana de días. Unificado el 2026-07-13 (antes eran ~90% el mismo
// código copiado dos veces).
function _verificarAprobacionesPendientesEnSAI(config) {
  const ss = SpreadsheetApp.openById(config.ssId);
  const hojaHist = ss.getSheetByName("Historico_Gestiones");
  if (!hojaHist) return { success: false, message: "Hoja Historico_Gestiones no encontrada." };

  const lastRow = hojaHist.getLastRow();
  if (lastRow < 2) return { success: false, message: "No hay datos en Historico_Gestiones." };

  const data = hojaHist.getRange(2, 1, lastRow - 1, config.numCols).getValues();
  const limiteFecha = new Date();
  limiteFecha.setDate(limiteFecha.getDate() - config.ventanaDias);

  var candidatos = [];
  for (var i = 0; i < data.length; i++) {
    var fechaAsig = data[i][config.colFechaAsig];
    var solicitudId = String(data[i][config.colSolicitud]).trim();
    var estadoActual = String(data[i][config.colEstado]).toUpperCase().trim();

    if (config.tiposFiltro) {
      var tipoAsignado = String(data[i][config.colTipoAsignado]).trim().toLowerCase();
      if (!config.tiposFiltro.has(tipoAsignado)) continue;
    }
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
    lock.waitLock(5000);
  } catch (e) {
    return { success: false, message: "No se pudo adquirir el lock. Intenta más tarde." };
  }

  try {
    actualizaciones.forEach(function(u) {
      hojaHist.getRange(u.filaReal, config.colEscribirEstado).setValue(u.estado);
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

/**
 * Verifica contra SAI el resultado real de los casos de desaplazamiento e inducción
 * (Historico_Gestiones principal) que un analista dejó sin resolución definitiva
 * (aplazado, negado con motivo pendiente, etc.). No toca digital/canones altos.
 * Diseñada para ejecutarse con trigger diario de 4 a 5 pm.
 */
function verificarAprobacionDesaplazamientos() {
  return _verificarAprobacionesPendientesEnSAI({
    ssId: TARGET_SOLICITUDES_SS_ID,
    numCols: 61,
    colSolicitud: 0,
    colFechaAsig: 24,
    colEstado: 16,
    colEscribirEstado: 17,
    colTipoAsignado: 60,
    tiposFiltro: TIPOS_VERIFICACION_DESAPLAZAMIENTO_INDUCCION,
    ventanaDias: VENTANA_DIAS_VERIFICACION_DESAPLAZAMIENTO_INDUCCION
  });
}

function triggerVerificacionDesaplazamientos() {
  try {
    var resultado = verificarAprobacionDesaplazamientos();
    Logger.log("Verificación desaplazamientos: " + resultado.totalRevisados + " revisados, " + resultado.totalActualizados + " actualizados.");
  } catch (e) {
    Logger.log("Error en trigger verificación desaplazamientos: " + e.message);
  }
}

// SUSPENDIDA (2026-07-13): `verificarAprobacionDesaplazamientos()` ya cubre `induccion`
// explícitamente (mismo Historico_Gestiones, mismo filtro de tipo) — este trigger corría
// exactamente el mismo trabajo que `triggerVerificacionDesaplazamientos`, duplicando
// innecesariamente las llamadas a SAI. Se puede borrar el trigger de tiempo asociado a
// esta función en el editor de Apps Script (ícono del reloj) cuando sea conveniente.
function triggerVerificacionInducciones() {
  Logger.log("triggerVerificacionInducciones SUSPENDIDA — ya cubierta por triggerVerificacionDesaplazamientos (verifica inducción internamente)");
  return;
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
  return _verificarAprobacionesPendientesEnSAI({
    ssId: ID_HOJA_REESTUDIOS,
    numCols: 11,
    colSolicitud: 1,
    colFechaAsig: 8,
    colEstado: 10,
    colEscribirEstado: 11,
    colTipoAsignado: null,
    tiposFiltro: null,
    ventanaDias: VENTANA_DIAS_VERIFICACION_SAI
  });
}

function triggerVerificacionReestudiosUar() {
  try {
    var resultado = verificarAprobacionReestudiosUar();
    Logger.log("Verificación reestudios/UAR: " + resultado.totalRevisados + " revisados, " + resultado.totalActualizados + " actualizados.");
  } catch (e) {
    Logger.log("Error en trigger verificación reestudios/UAR: " + e.message);
  }
}
