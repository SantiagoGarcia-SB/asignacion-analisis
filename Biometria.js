const ID_SHEET_ORIGEN = '1tmXIxNB65eAUQah8dxvSJSJVKmR25ZiuM59SLX0NYME';
const ID_SHEET_GESTION = '1lT9BxWAKgo9xed9xaAbbFqna304TWNbzL3v2302ZvOQ';
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

function descargarBiometriasAPI() {
  const startTime = new Date().getTime();
  const TIEMPO_LIMITE_MS = 300000; 
  
  Logger.log("INICIANDO EJECUCIÓN - Descarga de Biometrías");

  const endpointBase = getEndPointNewApiDate();
  const keyFull = getKeyFull();
  
  if (!endpointBase || !keyFull) {
    Logger.log("❌ Faltan configuraciones técnicas (API Key o Endpoint)");
    return;
  }

  const ssOrigen = SpreadsheetApp.openById(ID_SHEET_ORIGEN);
  let hojaOrigen = ssOrigen.getSheetByName("Hoja 2") || ssOrigen.insertSheet("Hoja 2");

  const lastRow = hojaOrigen.getLastRow();
  const idsExistentes = new Set();
  if (lastRow > 1) {
    hojaOrigen.getRange(2, 1, lastRow - 1, 1).getValues().flat().forEach(id => {
      if (id) idsExistentes.add(String(id).trim());
    });
  }

  const hoy = new Date();
  const fechaInicio = new Date();
  fechaInicio.setDate(hoy.getDate() - 8); 
  const sIni = formatDateCustom(fechaInicio);
  const sFin = formatDateCustom(hoy);

  let paginaActual = 1;
  let totalPaginas = 1;
  let nuevasFilas = [];

  try {
    do {
      if (new Date().getTime() - startTime > TIEMPO_LIMITE_MS) {
        Logger.log("⏳ Tiempo de ejecución acercándose al límite de Google. Deteniendo para guardar...");
        break;
      }

      const url = `${endpointBase}?startDate=${sIni}&endDate=${sFin}&page=${paginaActual}&size=200`;
      Logger.log("📡 Consultando página: " + paginaActual + " / " + totalPaginas);

      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: { 'x-api-key': keyFull, 'Accept': 'application/json' },
        muteHttpExceptions: true
      });

      if (response.getResponseCode() === 200) {
        const json = JSON.parse(response.getContentText());
        totalPaginas = json.totalPages || 1;
        const contenido = json.content || [];
        
        let biometriasEncontradas = 0;

        contenido.forEach(item => {
          const rc = String(item.resultCode).trim();
          const consecutivo = String(item.consecutive).trim();

          if ((rc === "500" || rc === "503") && !idsExistentes.has(consecutivo)) {
            let personasContactar = [];
            personasContactar.push({
              rol: "INQUILINO PRINCIPAL",
              nombre: item.tenantName || "Sin Nombre",
              documento: item.evaluatedDocument || "",
              telefono: item.tenantPhone || "Sin Teléfono",
              correo: item.tenantEmail || "Sin Correo",
              resultCode: rc,
              descripcion: item.resultDescription || item.studyStatus || ""
            });

            if (item.codebtors && Array.isArray(item.codebtors)) {
              item.codebtors.forEach(c => {
                personasContactar.push({
                  rol: c.profileType || "CODEUDOR",
                  nombre: c.name || "Sin Nombre",
                  documento: c.document || "",
                  telefono: c.phone || "Sin Teléfono",
                  correo: c.email || "Sin Correo",
                  resultCode: c.resultCode || "",
                  descripcion: c.resultDescription || c.studyStatus || ""
                });
              });
            }

            nuevasFilas.push([
              consecutivo, item.policyNumber, item.evaluatedDocument, item.tenantName,
              item.tenantPhone, item.tenantEmail, item.cityName, item.address,
              item.monthlyRent, JSON.stringify(personasContactar), item.studyStatus
            ]);
            idsExistentes.add(consecutivo);
            biometriasEncontradas++;
          }
        });
        
        Logger.log(`✅ Biometrías nuevas extraídas en Pág ${paginaActual}: ${biometriasEncontradas}`);
        
      } else {
        Logger.log("⚠️ Error API Pág " + paginaActual + ": " + response.getResponseCode());
        break;
      }

      paginaActual++;
      
      if (paginaActual <= totalPaginas) {
        Logger.log("⏳ Pausa de 2 segundos (Anti-Datadog)...");
        Utilities.sleep(2000); 
      }

    } while (paginaActual <= totalPaginas);

    Logger.log("Barrido de API completado exitosamente.");

  } catch (e) {
    Logger.log("ERROR DURANTE LA CONSULTA: " + e.toString());
  }

  if (nuevasFilas.length > 0) {
    hojaOrigen.getRange(hojaOrigen.getLastRow() + 1, 1, nuevasFilas.length, nuevasFilas[0].length).setValues(nuevasFilas);
    Logger.log("Datos guardados en Hoja 2: " + nuevasFilas.length);
  } else {
    Logger.log("No se encontraron biometrías nuevas pendientes.");
  }
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

    const capTotal = parseInt(usuario[6]) || 0;
    const nombreAnalista = String(usuario[1]).trim();
    if (capTotal <= 0) return { success: false, message: "Capacidad inválida o en 0" };

    const mapaInmobiliarias = obtenerMapaInmobiliarias(ssWarehouse);

    const ssGestion = SpreadsheetApp.openById(ID_SHEET_GESTION);
    const hojaGestion = ssGestion.getSheetByName("Hoja 1");
    const lastRowGestion = hojaGestion.getLastRow();

    let cargaActual = 0;
    let idsEnGestion = new Set();

    if (lastRowGestion > 1) {
      const dataGestion = hojaGestion.getRange(2, 1, lastRowGestion - 1, 18).getValues();
      dataGestion.forEach(f => {
        let idSol = String(f[6]).trim(); 
        if (idSol) idsEnGestion.add(idSol);

        let analistaColR = f.length > 17 ? String(f[17]).trim().toLowerCase() : "";
        let analistaColB = String(f[1]).trim().toLowerCase();
        let analistaFila = analistaColR ? analistaColR : analistaColB;
        let estadoFila = String(f[15]).toUpperCase().trim();

        if (analistaFila === userEmail && estadoFila === "PENDIENTE GESTION") {
          cargaActual++;
        }
      });
    }

    let cupoDisponible = capTotal - cargaActual;
    if (cupoDisponible <= 0) return { success: false, message: "Capacidad llena" };

    // Validar cupo diario del equipo Biometría (individual o global)
    const cuposBio = obtenerCuposEfectivos(userEmail, 'BIOMETRIA', dataUsuarios);
    const cupoBioDiario = cuposBio.biometria;
    
    // Contar biometrías asignadas hoy a este analista
    const hoy = new Date();
    let conteoHoyBio = 0;
    if (lastRowGestion > 1) {
      const dataGestionFull = hojaGestion.getRange(2, 1, lastRowGestion - 1, 18).getValues();
      dataGestionFull.forEach(f => {
        let analistaColR = f.length > 17 ? String(f[17]).trim().toLowerCase() : "";
        let analistaColB = String(f[1]).trim().toLowerCase();
        let analistaFila = analistaColR ? analistaColR : analistaColB;
        if (analistaFila === userEmail) {
          const fechaFila = f[0];
          if (fechaFila instanceof Date && fechaFila.getDate() === hoy.getDate() && fechaFila.getMonth() === hoy.getMonth() && fechaFila.getFullYear() === hoy.getFullYear()) {
            conteoHoyBio++;
          }
        }
      });
    }
    if (conteoHoyBio >= cupoBioDiario) return { success: false, message: "Cupo diario de biometría alcanzado (" + cupoBioDiario + ")." };
    // Limitar asignación al cupo restante
    const cupoRestanteBio = cupoBioDiario - conteoHoyBio;
    if (cupoDisponible > cupoRestanteBio) cupoDisponible = cupoRestanteBio;

    const ssOrigen = SpreadsheetApp.openById(ID_SHEET_ORIGEN);
    const hojaOrigen = ssOrigen.getSheetByName("Hoja 2");
    const lastRowOrigen = hojaOrigen.getLastRow();

    if (lastRowOrigen < 2) return { success: false, message: "No hay biometrías pendientes en la base." };

    const datosBio = hojaOrigen.getRange(2, 1, lastRowOrigen - 1, 11).getValues();
    let candidatosParaAsignar = [];
    let filasAEliminar = [];

    for (let i = 0; i < datosBio.length; i++) {
      if (cupoDisponible <= 0) break;

      let id = String(datosBio[i][0]).trim();
      if (!id) continue;

      let statusResult = verificarEstadoBiometria(id);

      if (statusResult === "PENDIENTE" && !idsEnGestion.has(id)) {
        candidatosParaAsignar.push(datosBio[i]);
        filasAEliminar.push(i + 2);
        idsEnGestion.add(id);
        cupoDisponible--;
      } else if (statusResult === "YA_NO_PENDIENTE") {
        filasAEliminar.push(i + 2);
      }
    }

    if (candidatosParaAsignar.length === 0) {
      if (filasAEliminar.length > 0) {
        filasAEliminar.sort((a, b) => b - a).forEach(fila => {
          hojaOrigen.deleteRow(fila);
        });
      }
      return { success: false, message: "No hay biometrías pendientes validadas." };
    }

    const nuevasFilas = [];
    const fechaAsignacion = new Date();

    candidatosParaAsignar.forEach(candidato => {
      let polizaVal = String(candidato[1] || "").trim();
      let polNorm = polizaVal.split(/[.,]/)[0].replace(/\D/g, '').replace(/^0+/, '');
      let inmoVal = mapaInmobiliarias.get(polizaVal) || mapaInmobiliarias.get(polNorm) || "Sin registro en score";
      
      let jsonContactos = String(candidato[9] || "[]");

      nuevasFilas.push([
        fechaAsignacion,
        nombreAnalista, 
        String(usuario[3]),
        polizaVal, 
        inmoVal, 
        String(candidato[6] || ""),
        String(candidato[0] || ""),
        candidato[8] || 0,
        String(candidato[4] || ""),
        "",
        String(candidato[7] || ""),
        String(candidato[3] || ""),
        "",
        String(candidato[10] || ""),
        "",
        "PENDIENTE GESTION",
        jsonContactos, 
        userEmail 
      ]);
    });

    hojaGestion.getRange(lastRowGestion + 1, 1, nuevasFilas.length, nuevasFilas[0].length).setValues(nuevasFilas);

    filasAEliminar.sort((a, b) => b - a).forEach(fila => {
      hojaOrigen.deleteRow(fila);
    });

    SpreadsheetApp.flush();

    return { success: true, message: `Se te asignaron ${nuevasFilas.length} nuevas solicitudes.`, nueva: true };

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
    return { success: false, error: "El sistema está ocupado. Intenta de nuevo." };
  }

  try {
    const ssGestion = SpreadsheetApp.openById(ID_SHEET_GESTION);
    const hoja = ssGestion.getSheets()[0];
    const matrizDatos = hoja.getDataRange().getValues();

    for (let i = 1; i < matrizDatos.length; i++) {
      if (String(matrizDatos[i][6]).trim() === String(idSolicitud).trim()) {
        const filaReal = i + 1;
        const fechaParaLooker = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");

        hoja.getRange(filaReal, 10).setValue(datosFormulario.resLlamada);
        hoja.getRange(filaReal, 13).setValue(datosFormulario.resFinal);
        hoja.getRange(filaReal, 15).setValue(fechaParaLooker);
        hoja.getRange(filaReal, 16).setValue("GESTIONADO");

        // Fecha y hora radicación SAI (ingresada manualmente por el analista)
        if (datosFormulario.fechaRadicacionSai) {
          hoja.getRange(filaReal, 17).setValue(datosFormulario.fechaRadicacionSai);
        }

        SpreadsheetApp.flush();

        // Guardar fechaRadicacionSai en Historico_Gestiones del warehouse (columna AL = 38)
        if (datosFormulario.fechaRadicacionSai) {
          try {
            const ssWarehouse = SpreadsheetApp.openById(ID_WAREHOUSE_USUARIOS);
            const sheetSolicitud = ssWarehouse.getSheetByName("solicitud");
            const ids = sheetSolicitud.getRange('A:A').getValues();
            for (let j = 1; j < ids.length; j++) {
              if (String(ids[j][0]).trim() === String(idSolicitud).trim()) {
                sheetSolicitud.getRange(j + 1, 38).setValue(datosFormulario.fechaRadicacionSai);
                SpreadsheetApp.flush();
                break;
              }
            }
          } catch (e) {
            // No bloquear la gestión si falla la escritura en warehouse
          }
        }

        lock.releaseLock();

        let mensaje = "Gestión guardada correctamente.";
        try {
          let auto = autoAsignarBiometria();
          if (auto.success && auto.nueva) {
            mensaje += "\n📌 " + auto.message;
          }
        } catch (e) {}

        return { success: true, message: mensaje };
      }
    }
    return { success: false, error: "ID no encontrado" };
  } catch (error) {
    return { success: false, error: error.toString() };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function getDatosBiometria() {
  const correoUsuario = Session.getActiveUser().getEmail().toLowerCase().trim();
  const ssGestion = SpreadsheetApp.openById(ID_SHEET_GESTION);
  const hoja = ssGestion.getSheets()[0];
  const matrizDatos = hoja.getDataRange().getValues();

  if (matrizDatos.length <= 1) return { solicitudes: [], stats: { hoy: 0, pendientes: 0 } };

  let conteoHoy = 0;
  let listaPendientes = [];
  const hoySinHora = new Date().setHours(0, 0, 0, 0);

  for (let i = 1; i < matrizDatos.length; i++) {
    const filaActual = matrizDatos[i];

    let analistaColR = filaActual.length > 17 ? String(filaActual[17]).trim().toLowerCase() : "";
    let analistaColB = String(filaActual[1]).trim().toLowerCase();
    let analistaFila = analistaColR ? analistaColR : analistaColB;
    const estadoFila = String(filaActual[15]).trim().toUpperCase();

    if (analistaFila === correoUsuario) {
      if (estadoFila === "PENDIENTE GESTION") {
        let filaCopia = filaActual.map(celda => {
          if (celda instanceof Date) {
            return Utilities.formatDate(celda, "GMT-5", "dd/MM/yyyy HH:mm");
          }
          return celda;
        });

        listaPendientes.push(filaCopia);
      }
      else if (estadoFila === "GESTIONADO") {
        const fechaGestion = new Date(filaActual[14]);
        if (!isNaN(fechaGestion.getTime()) && fechaGestion.getTime() >= hoySinHora) {
          conteoHoy++;
        }
      }
    }
  }

  return {
    solicitudes: listaPendientes,
    stats: { hoy: conteoHoy, pendientes: listaPendientes.length }
  };
}