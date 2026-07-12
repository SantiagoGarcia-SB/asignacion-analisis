/**
 * Verifica si el usuario activo tiene rol de administrador en la base de datos.
 * @throws {Error} Si el usuario no tiene permisos o no existe.
 */
function verificarPermisoAdmin() {
  const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hojaUser = ss.getSheetByName("Usuarios");
  const dataUser = hojaUser.getDataRange().getValues();
  const usuario = dataUser.find(f => String(f[2]).toLowerCase().trim() === userEmail);
  
  if (!usuario || String(usuario[23]).toUpperCase().trim() !== "ADMIN") {
    throw new Error("Acceso Denegado: Se requieren permisos de Administrador.");
  }
}


function _clasificarPorReglas(campos, tipos) {
  for (var i = 0; i < tipos.length; i++) {
    var t = tipos[i];
    if (!t.activo) continue;
    var reglas = t.reglasDeteccion;
    if (!reglas || !reglas.campo) continue;
    var val1 = String(campos[reglas.campo] || "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    var ref1 = String(reglas.valor || "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    var ok1 = false;
    if (reglas.condicion === 'equals') ok1 = val1 === ref1 || val1.replace(/_/g, ' ') === ref1.replace(/_/g, ' ');
    else if (reglas.condicion === 'includes') ok1 = val1.indexOf(ref1) !== -1;
    if (!ok1) continue;
    if (reglas.campo2) {
      var val2 = String(campos[reglas.campo2] || "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      var ref2 = String(reglas.valor2 || "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      var ok2 = false;
      if (reglas.condicion2 === 'equals') ok2 = val2 === ref2 || val2.replace(/_/g, ' ') === ref2.replace(/_/g, ' ');
      else if (reglas.condicion2 === 'includes') ok2 = val2.indexOf(ref2) !== -1;
      if (!ok2) continue;
    }
    return t.id;
  }
  return null;
}

/**
 * Recopila los datos operativos en tiempo real para el Dashboard principal.
 * @returns {Object} Datos consolidados del dashboard.
 */
function obtenerDatosDashboard() {
  verificarPermisoAdmin();
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hojaSol = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  const dataSol = hojaSol.getDataRange().getDisplayValues();
  const hoyStr = Utilities.formatDate(new Date(), TIMEZONE, "dd/MM/yyyy");

  const tiposConfig = _getTiposSolicitud();
  const tiposActivos = tiposConfig.filter(function(t) { return t.activo; });
  const desgloseInit = {};
  tiposActivos.forEach(function(t) { desgloseInit[t.id] = 0; });

  let res = {
    sinAsignar: 0,
    gestionadasHoyEquipo: 0,
    activos: 0,
    inactivos: 0,
    listaGestion: [],
    listaSinAsignar: [],
    listaGestionadasHoy: [],
    desglose: {
      sinAsignar: JSON.parse(JSON.stringify(desgloseInit)),
      enGestion: JSON.parse(JSON.stringify(desgloseInit)),
      gestionadasHoy: JSON.parse(JSON.stringify(desgloseInit))
    },
    tiposConfig: tiposActivos.map(function(t) {
      return { id: t.id, label: t.label, icono: t.icono, colorBadge: t.colorBadge, reglasDeteccion: t.reglasDeteccion };
    }),
    reestudios: {
      sinAsignar: 0,
      pendientes: 0,
      gestionadasHoy: 0,
      listaGestionadasHoy: [],
      listaPendientes: [],
      listaSinAsignar: []
    }
  };
  
  const hojaUser = ss.getSheetByName("Usuarios");
  const dataUser = hojaUser.getDataRange().getValues();
  for (let j = 1; j < dataUser.length; j++) {
    const estadoUser = String(dataUser[j][5] || "").toUpperCase().trim();
    if (estadoUser === "ACTIVO" || estadoUser === "DISPONIBLE") {
      res.activos++;
    } else {
      res.inactivos++;
    }
  }
  
  // ── Sin Asignar desde hoja activa de solicitudes ──
  for (let i = 1; i < dataSol.length; i++) {
    const asignado = String(dataSol[i][27] || "").trim();
    const fechaFin = String(dataSol[i][28] || "").trim();
    const solicitudId = String(dataSol[i][0] || "").trim();
    const poliza = String(dataSol[i][1] || "");
    if (solicitudId === "") continue;

    var tipoVisual = 'digital';
    try {
      var camposSol = { estadoGeneral: String(dataSol[i][16] || ""), clase: String(dataSol[i][20] || "") };
      tipoVisual = _clasificarPorReglas(camposSol, tiposActivos) || 'digital';
    } catch (eClasif) { tipoVisual = 'digital'; }

    if (asignado === "" && fechaFin === "") {
      res.sinAsignar++;
      if (res.desglose.sinAsignar[tipoVisual] !== undefined) res.desglose.sinAsignar[tipoVisual]++;
      if (res.listaSinAsignar.length < 100) {
        res.listaSinAsignar.push({ id: solicitudId, poliza: poliza, tipo: tipoVisual });
      }
    }
  }

  // ── Sin Asignar desde hoja activa de reestudios ──
  try {
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hojaReest = ssReestudios.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (hojaReest) {
      const lastRowR = hojaReest.getLastRow();
      if (lastRowR > 1) {
        const dataReest = hojaReest.getRange(2, 1, lastRowR - 1, 14).getDisplayValues();
        for (let i = 0; i < dataReest.length; i++) {
          const solicitud = String(dataReest[i][1]).trim();
          const origen = String(dataReest[i][3]).trim();
          const tipoProceso = String(dataReest[i][4]).trim();
          const analistaEmail = String(dataReest[i][6]).trim();
          const fechaFin = String(dataReest[i][9]).trim();

          if (solicitud === "") continue;
          var tipoDesglose = 'reestudio';
          try {
            var camposReest = { origen: origen, tipoProceso: tipoProceso, claseDeSolicitud: String(dataReest[i][5]).trim() };
            tipoDesglose = _clasificarPorReglas(camposReest, tiposActivos) || 'reestudio';
          } catch (eClasifR) { tipoDesglose = 'reestudio'; }

          if (analistaEmail === "" && fechaFin === "") {
            res.reestudios.sinAsignar++;
            res.sinAsignar++;
            if (res.desglose.sinAsignar[tipoDesglose] !== undefined) res.desglose.sinAsignar[tipoDesglose]++;
            if (res.reestudios.listaSinAsignar.length < 100) {
              res.reestudios.listaSinAsignar.push({ id: solicitud, origen: origen, tipo: tipoProceso });
            }
            if (res.listaSinAsignar.length < 100) {
              res.listaSinAsignar.push({ id: solicitud, poliza: origen, tipo: tipoDesglose });
            }
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Aviso: No se pudo leer hoja activa de reestudios: " + e.message);
  }

  // ── En Gestión desde Historico_Gestiones (digitales, biometría, inducciones) ──
  // Condición: col Z (idx 25) = analista asignado NO vacío, col AA (idx 26) = fecha fin vacía
  try {
    const hojaHistEnG = ss.getSheetByName("Historico_Gestiones");
    if (hojaHistEnG && hojaHistEnG.getLastRow() > 1) {
      const colsEG = Math.max(61, hojaHistEnG.getLastColumn());
      const dataEG = hojaHistEnG.getRange(2, 1, hojaHistEnG.getLastRow() - 1, colsEG).getDisplayValues();
      for (let i = 0; i < dataEG.length; i++) {
        const solicitudId = String(dataEG[i][0] || "").trim();
        if (solicitudId === "") continue;
        const asignadoH = String(dataEG[i][25] || "").trim();
        const fechaFinH = String(dataEG[i][26] || "").trim();
        if (asignadoH === "" || fechaFinH !== "") continue;
        const estadoH = String(dataEG[i][16] || "").toUpperCase();
        const polizaH = String(dataEG[i][1] || "");
        const asesorH = String(dataEG[i][27] || dataEG[i][25] || "N/A");
        const tipoGuardado = String(dataEG[i][60] || "").trim();
        const tipoVisual = (tipoGuardado && res.desglose.enGestion[tipoGuardado] !== undefined)
          ? tipoGuardado
          : (_clasificarPorReglas({ estadoGeneral: String(dataEG[i][16] || ""), clase: String(dataEG[i][20] || "") }, tiposActivos) || 'digital');
        if (res.desglose.enGestion[tipoVisual] !== undefined) res.desglose.enGestion[tipoVisual]++;
        res.listaGestion.push({
          id: solicitudId,
          poliza: polizaH,
          estado: estadoH || "EN GESTIÓN",
          correo: asignadoH,
          asesor: asesorH,
          tipo: tipoVisual
        });
      }
    }
  } catch (e) {
    Logger.log("Aviso: Error leyendo Historico_Gestiones enGestion principal: " + e.message);
  }

  // ── En Gestión desde Historico_Gestiones de reestudios/UAR ──
  // Condición: col G (idx 6) = analista NO vacío, col J (idx 9) = fechaFin vacía
  try {
    const ssReestEG = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hojaHistReestEG = ssReestEG.getSheetByName("Historico_Gestiones");
    if (hojaHistReestEG && hojaHistReestEG.getLastRow() > 1) {
      const colsREG = Math.max(19, hojaHistReestEG.getLastColumn());
      const dataREG = hojaHistReestEG.getRange(2, 1, hojaHistReestEG.getLastRow() - 1, colsREG).getDisplayValues();
      for (let i = 0; i < dataREG.length; i++) {
        const solicitud = String(dataREG[i][1] || "").trim();
        if (solicitud === "") continue;
        const analistaEmail = String(dataREG[i][6] || "").trim();
        const fechaFin = String(dataREG[i][9] || "").trim();
        if (analistaEmail === "" || fechaFin !== "") continue;
        const origen = String(dataREG[i][3] || "").trim();
        const tipoProceso = String(dataREG[i][4] || "");
        const nombreAnalista = String(dataREG[i][7] || "N/A");
        const tipoGuardadoR = String(dataREG[i][18] || "").trim();
        const tipoDesglose = (tipoGuardadoR && res.desglose.enGestion[tipoGuardadoR] !== undefined)
          ? tipoGuardadoR
          : (_clasificarPorReglas({ origen: origen, tipoProceso: tipoProceso, claseDeSolicitud: String(dataREG[i][5] || "").trim() }, tiposActivos) || 'reestudio');
        res.reestudios.pendientes++;
        if (res.desglose.enGestion[tipoDesglose] !== undefined) res.desglose.enGestion[tipoDesglose]++;
        if (res.reestudios.listaPendientes.length < 50) {
          res.reestudios.listaPendientes.push({ id: solicitud, origen: origen, tipo: tipoProceso, asesor: nombreAnalista });
        }
        res.listaGestion.push({
          id: solicitud,
          poliza: origen,
          estado: "EN GESTIÓN",
          correo: analistaEmail,
          asesor: nombreAnalista,
          tipo: tipoDesglose
        });
      }
    }
  } catch (e) {
    Logger.log("Aviso: Error leyendo Historico_Gestiones enGestion reestudios: " + e.message);
  }

  // ── Gestionadas Hoy — desde Historico_Gestiones (digitales, biometría, inducciones) ──
  // Columna AA (idx 26) = fecha fin gestión
  try {
    const hojaHistDig = ss.getSheetByName("Historico_Gestiones");
    if (hojaHistDig && hojaHistDig.getLastRow() > 1) {
      const colsNeeded = Math.max(61, hojaHistDig.getLastColumn());
      const dataHist = hojaHistDig.getRange(2, 1, hojaHistDig.getLastRow() - 1, colsNeeded).getDisplayValues();
      for (let i = 0; i < dataHist.length; i++) {
        const fechaFinH = String(dataHist[i][26] || "").trim(); // col AA
        if (fechaFinH === "" || !fechaFinH.includes(hoyStr)) continue;
        const solicitudId = String(dataHist[i][0] || "").trim();
        if (solicitudId === "") continue;
        const estadoH = String(dataHist[i][16] || "").toUpperCase();
        const asesorH = String(dataHist[i][27] || dataHist[i][25] || "N/A");
        const polizaH = String(dataHist[i][1] || "");
        const tipoGuardado = String(dataHist[i][60] || "").trim();
        const tipoVisual = (tipoGuardado && res.desglose.gestionadasHoy[tipoGuardado] !== undefined)
          ? tipoGuardado
          : (_clasificarPorReglas({ estadoGeneral: String(dataHist[i][16] || ""), clase: String(dataHist[i][20] || "") }, tiposActivos) || 'digital');
        res.gestionadasHoyEquipo++;
        if (res.desglose.gestionadasHoy[tipoVisual] !== undefined) res.desglose.gestionadasHoy[tipoVisual]++;
        res.listaGestionadasHoy.push({ id: solicitudId, poliza: polizaH, estado: estadoH, asesor: asesorH, tipo: tipoVisual });
      }
    }
  } catch (e) {
    Logger.log("Aviso: Error leyendo Historico_Gestiones principal: " + e.message);
  }

  // ── Gestionadas Hoy — desde Historico_Gestiones de reestudios/UAR ──
  // Columna J (idx 9) = fechaFinGestion
  try {
    const ssReest2 = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hojaHistReest = ssReest2.getSheetByName("Historico_Gestiones");
    if (hojaHistReest && hojaHistReest.getLastRow() > 1) {
      const colsHistR = Math.max(19, hojaHistReest.getLastColumn());
      const dataHistR = hojaHistReest.getRange(2, 1, hojaHistReest.getLastRow() - 1, colsHistR).getDisplayValues();
      for (let i = 0; i < dataHistR.length; i++) {
        const fechaFinR = String(dataHistR[i][9] || "").trim(); // col J
        if (fechaFinR === "" || !fechaFinR.includes(hoyStr)) continue;
        const solicitud = String(dataHistR[i][1] || "").trim();
        if (solicitud === "") continue;
        const origen = String(dataHistR[i][3] || "").trim();
        const tipoProceso = String(dataHistR[i][4] || "");
        const nombreAnalista = String(dataHistR[i][7] || "N/A");
        const estadoGestion = String(dataHistR[i][10] || "").trim();
        const tipoGuardadoR = String(dataHistR[i][18] || "").trim();
        const tipoDesglose = (tipoGuardadoR && res.desglose.gestionadasHoy[tipoGuardadoR] !== undefined)
          ? tipoGuardadoR
          : (_clasificarPorReglas({ origen: origen, tipoProceso: tipoProceso, claseDeSolicitud: String(dataHistR[i][5] || "").trim() }, tiposActivos) || 'reestudio');
        res.reestudios.gestionadasHoy++;
        res.gestionadasHoyEquipo++;
        if (res.desglose.gestionadasHoy[tipoDesglose] !== undefined) res.desglose.gestionadasHoy[tipoDesglose]++;
        res.reestudios.listaGestionadasHoy.push({ id: solicitud, origen: origen, estado: estadoGestion, asesor: nombreAnalista });
        res.listaGestionadasHoy.push({ id: solicitud, poliza: origen, estado: estadoGestion, asesor: nombreAnalista, tipo: tipoDesglose });
      }
    }
  } catch (e) {
    Logger.log("Aviso: Error leyendo Historico_Gestiones reestudios: " + e.message);
  }

  try {
    var ssBio = SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE);
    var hojaBio = ssBio.getSheetByName(NOMBRE_HOJA_PENDIENTE_BIOMETRIA);
    if (hojaBio && hojaBio.getLastRow() > 1) {
      var dataBio = hojaBio.getRange(2, 1, hojaBio.getLastRow() - 1, 75).getDisplayValues();
      var pendientesBio = 0;
      var enviadasAsignar = 0;
      var aprobadasSinGestion = 0;
      var listaBio = [];
      for (var b = 0; b < dataBio.length; b++) {
        var nuevoEst = String(dataBio[b][62]).trim();
        var estadoLabel = nuevoEst === "" ? "ESPERANDO RE-CONSULTA" : nuevoEst;
        listaBio.push({
          id: String(dataBio[b][0]).trim(),
          poliza: String(dataBio[b][1]).trim(),
          telefono: String(dataBio[b][6]).trim(),
          estadoSai: estadoLabel,
          fechaCaptura: String(dataBio[b][59]).trim()
        });
        if (nuevoEst === "") {
          pendientesBio++;
        } else if (nuevoEst === "APROBADO_PENDIENTE_BIOMETRIA") {
          enviadasAsignar++;
        } else {
          aprobadasSinGestion++;
        }
      }
      res.biometriaPendiente = { pendientes: pendientesBio, enviadasAsignar: enviadasAsignar, aprobadasSinGestion: aprobadasSinGestion, total: dataBio.length, lista: listaBio };
    } else {
      res.biometriaPendiente = { pendientes: 0, procesadas: 0, total: 0 };
    }
  } catch (e) {
    Logger.log("Aviso: Error leyendo pendiente_biometria: " + e.message);
    res.biometriaPendiente = { pendientes: 0, procesadas: 0, total: 0 };
  }

  return res;
}

/**
 * Obtiene la lista de analistas y calcula sus cargas de trabajo operativas actuales.
 */
function admin_obtenerUsuariosGestion() {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName("Usuarios");
    if (!hoja) return [];
    
    const datos = hoja.getDataRange().getValues();
    datos.shift(); 
    const hojaSol = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
    const dataSol = hojaSol.getDataRange().getValues();
    const cargaPorAnalista = {};
    
    for (let i = 1; i < dataSol.length; i++) {
      const asignado = String(dataSol[i][27] || "").toLowerCase().trim();
      const fechaFin = String(dataSol[i][28] || "").trim();
      if (asignado && fechaFin === "") {
        cargaPorAnalista[asignado] = (cargaPorAnalista[asignado] || 0) + 1;
      }
    }
    try {
      const ssReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
      const hojaReest = ssReest.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
      if (hojaReest) {
        const lastRowR = hojaReest.getLastRow();
        if (lastRowR > 1) {
          const dataReest = hojaReest.getRange(2, 7, lastRowR - 1, 4).getValues();
          for (let i = 0; i < dataReest.length; i++) {
            const asignado = String(dataReest[i][0]).toLowerCase().trim();
            const fechaFin = String(dataReest[i][3]).trim();
            if (asignado && fechaFin === "") {
              cargaPorAnalista[asignado] = (cargaPorAnalista[asignado] || 0) + 1;
            }
          }
        }
      }
    } catch (e) {
      Logger.log("Aviso: No se pudo contar carga de reestudios: " + e.message);
    }
    
    return datos.map((fila, index) => {
      let tiempoEnEstado = "---";
      try {
        const historialRaw = fila[11];
        if (historialRaw && String(historialRaw).startsWith('[')) {
          const historial = JSON.parse(historialRaw);
          if (historial.length > 0) {
            const ultimo = historial[historial.length - 1];
            if (ultimo.inicio && ultimo.fin === "EN CURSO") {
              const inicioDate = new Date(ultimo.inicio.includes("T") ? ultimo.inicio : ultimo.inicio.replace(" ", "T"));
              if (!isNaN(inicioDate.getTime())) {
                const minutos = Math.round((new Date().getTime() - inicioDate.getTime()) / 60000);
                tiempoEnEstado = minutos >= 60 ? Math.floor(minutos / 60) + "h " + (minutos % 60) + "m" : minutos + "m";
              }
            }
          }
        }
      } catch (e) { tiempoEnEstado = "---"; }
      
      const correoLower = String(fila[2]).toLowerCase().trim();
      const cargaActual = cargaPorAnalista[correoLower] || 0;
      return {
        nombreComercial: fila[1], 
        correo: fila[2],          
        capacidad: fila[6],       
        especialidad: fila[4],    
        estado: fila[5],          
        desde: tiempoEnEstado,        
        cargaActual: cargaActual,
        pendientes: fila[7] || 0, 
        rol: fila[23] || "ASESOR", 
        row: index + 2
      };
    });
  } catch (e) { throw new Error(e.message); }
}

/**
 * Actualiza los parámetros de un analista desde la sección de CRUD.
 */
function admin_actualizarAnalista(correo, datos) {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName("Usuarios");
    const data = hoja.getRange("C:C").getValues(); 
    const correoBuscado = correo.toLowerCase().trim();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase().trim() === correoBuscado) {
        const fila = i + 1;
        const especialidadUpper = String(datos.especialidad || "").toUpperCase().trim();
        const estadoUpper = String(datos.estado || "").toUpperCase().trim();
        const rolUpper = String(datos.rol || "ASESOR").toUpperCase().trim();
        const capacidadNum = Number(datos.capacidad) || 0;
        
        const estadoAnterior = String(hoja.getRange(fila, 6).getValue() || "").toUpperCase().trim();
        hoja.getRange(fila, 5).setValue(especialidadUpper);
        hoja.getRange(fila, 6).setValue(estadoUpper);
        hoja.getRange(fila, 7).setValue(capacidadNum);
        hoja.getRange(fila, 24).setValue(rolUpper);

        if (estadoUpper && estadoUpper !== estadoAnterior) {
          admin_sincronizarEstado(correoBuscado, estadoUpper);
        }

        _invalidarCacheUsuarios();
        return { success: true, message: "Usuario actualizado correctamente" };
      }
    }
    return { success: false, message: "No se encontró el usuario" };
  } catch (e) { return { success: false, message: e.message }; }
}

/**
 * Crea un nuevo analista en la hoja de control de usuarios.
 */
function admin_crearUsuario(datos) {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName("Usuarios");
    const dataExistente = hoja.getDataRange().getValues();
    let ultimoNumero = 0;
    if (dataExistente.length > 1) {
      const numeros = dataExistente.slice(1).map(f => Number(f[0])).filter(n => !isNaN(n));
      ultimoNumero = numeros.length > 0 ? Math.max(...numeros) : 0;
    }
    const nuevoNumeroAsesor = ultimoNumero + 1;
    let filaCompleta = new Array(25).fill(""); 
    filaCompleta[0]  = nuevoNumeroAsesor;
    filaCompleta[1]  = datos.nombre; 
    filaCompleta[2]  = String(datos.correo).toLowerCase().trim(); 
    filaCompleta[3]  = datos.documento;
    filaCompleta[4]  = String(datos.especialidad || "").toUpperCase().trim(); 
    filaCompleta[5]  = "INACTIVO"; 
    filaCompleta[23] = String(datos.rol || "ASESOR").toUpperCase().trim();   
    filaCompleta[6]  = Number(datos.capacidad) || 10; 
    
    hoja.appendRow(filaCompleta);
    hoja.getRange(hoja.getLastRow(), 7).setNumberFormat("0");
    _invalidarCacheUsuarios();
    return { success: true, message: "Usuario #" + nuevoNumeroAsesor + " creado." };
  } catch (e) { return { success: false, message: e.message }; }
}

/**
 * Reconstruye desde cero los contadores incrementales de cupo del día y carga
 * pendiente (ver Código.js), escaneando Historico_Gestiones (principal y
 * reestudios) una sola vez. Es la red de seguridad si algo desincroniza los
 * contadores (edición manual de una hoja, un caso raro no cubierto). Llamarla
 * no tiene efectos secundarios más allá de dejar los contadores al día — es
 * seguro correrla en cualquier momento, incluso con analistas trabajando.
 */
function admin_recalcularContadores() {
  verificarPermisoAdmin();

  var cargaPendiente = {};
  var cupoHoy = {};
  var hoy = _hoyYMD();

  function acumular(email, tipo, esPendiente, esHoy) {
    email = String(email).toLowerCase().trim();
    if (!email) return;
    if (esPendiente) cargaPendiente[email] = (cargaPendiente[email] || 0) + 1;
    if (esHoy) {
      var key = email + '|' + tipo;
      cupoHoy[key] = (cupoHoy[key] || 0) + 1;
    }
  }

  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hojaHist = ss.getSheetByName("Historico_Gestiones");
  if (hojaHist && hojaHist.getLastRow() > 1) {
    var cols = Math.max(61, hojaHist.getLastColumn());
    var data = hojaHist.getRange(2, 1, hojaHist.getLastRow() - 1, cols).getValues();
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row[25]) continue;
      var tipo = String(row[60] || '').trim() || 'digital';
      var tieneFin = row[26] instanceof Date || String(row[26]).trim() !== "";
      var esHoy = _fechaEsHoyYMD(row[24]) || _fechaEsHoyYMD(row[26]);
      acumular(row[25], tipo, !tieneFin, esHoy);
    }
  }

  var idReest = PropertiesService.getScriptProperties().getProperty('ID_HOJA_REESTUDIOS') || ID_HOJA_REESTUDIOS;
  var ssR = SpreadsheetApp.openById(idReest);
  var hojaHistR = ssR.getSheetByName("Historico_Gestiones");
  if (hojaHistR && hojaHistR.getLastRow() > 1) {
    var colsR = Math.max(19, hojaHistR.getLastColumn());
    var dataR = hojaHistR.getRange(2, 1, hojaHistR.getLastRow() - 1, colsR).getValues();
    for (var j = 0; j < dataR.length; j++) {
      var rowR = dataR[j];
      if (!rowR[6]) continue;
      var tipoR = String(rowR[18] || '').trim();
      if (!tipoR) {
        var origenR = String(rowR[3]).toUpperCase().trim();
        var tipoPNormR = String(rowR[4]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
        tipoR = _derivarTipoReestudio(origenR, tipoPNormR) || 'reestudio';
      }
      var tieneFinR = rowR[9] instanceof Date || String(rowR[9]).trim() !== "";
      var esHoyR = _fechaEsHoyYMD(rowR[8]) || _fechaEsHoyYMD(rowR[9]);
      acumular(rowR[6], tipoR, !tieneFinR, esHoyR);
    }
  }

  _guardarCargaPendienteTodos(cargaPendiente);
  _guardarContadoresCupoHoy({ fecha: hoy, datos: cupoHoy });

  return {
    success: true,
    message: "Contadores recalculados.",
    analistasConCargaPendiente: Object.keys(cargaPendiente).length,
    entradasCupoHoy: Object.keys(cupoHoy).length
  };
}

/**
 * Remueve la asignación de una solicitud para que vuelva a estar disponible en cola.
 */
function desasignarSolicitud(idSolicitud){
  try{
    verificarPermisoAdmin();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
      const sheet = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
      const idBuscado = String(idSolicitud).trim();

      // 1. Buscar en hoja solicitud (casos legados sin migrar)
      const data = sheet.getRange("A:A").getValues();
      for(let i = 1; i < data.length; i++){
        if(String(data[i][0]).trim() === idBuscado){
          const fila = i + 1;
          sheet.getRange(fila, 27).clearContent();
          sheet.getRange(fila, 28).clearContent();
          sheet.getRange(fila, 31).clearContent();
          sheet.getRange(fila, 59).setValue("REASIGNADA");
          SpreadsheetApp.flush();
          return { success: true, message: "Solicitud desasignada." };
        }
      }

      // 2. Buscar en Historico_Gestiones (casos asignados con motor unificado)
      const hojaHist = ss.getSheetByName("Historico_Gestiones");
      if (hojaHist && hojaHist.getLastRow() > 1) {
        const lastRowH = hojaHist.getLastRow();
        const numCols = Math.max(61, hojaHist.getLastColumn());
        const dataH = hojaHist.getRange(2, 1, lastRowH - 1, numCols).getValues();
        for (let i = 0; i < dataH.length; i++) {
          const idMatch = String(dataH[i][0]).trim() === idBuscado;
          const fechaFin = String(dataH[i][26]).trim();
          if (idMatch && fechaFin === '') {
            const filaH = i + 2;
            const filaCompleta = hojaHist.getRange(filaH, 1, 1, numCols).getValues()[0];

            var filaSol = new Array(59).fill('');
            for (var c = 0; c < 22; c++) filaSol[c] = filaCompleta[c];
            filaSol[23] = filaCompleta[22]; filaSol[24] = filaCompleta[23];
            filaSol[35] = filaCompleta[31]; filaSol[36] = filaCompleta[32];
            for (var ci = 0; ci < 21; ci++) filaSol[37 + ci] = filaCompleta[39 + ci] || '';
            filaSol[26] = ''; filaSol[27] = ''; filaSol[28] = ''; filaSol[30] = '';
            filaSol[58] = 'REASIGNADA';

            sheet.appendRow(filaSol);
            sheet.getRange(sheet.getLastRow(), 1, 1, filaSol.length).setNumberFormat("@");
            hojaHist.deleteRow(filaH);

            var emailAnaOriginal = String(filaCompleta[25] || '').toLowerCase().trim();
            if (emailAnaOriginal) _ajustarCargaPendiente(emailAnaOriginal, -1);

            SpreadsheetApp.flush();
            return { success: true, message: "Solicitud desasignada desde Historico_Gestiones y devuelta a cola." };
          }
        }
      }

      return { success: false, message: "No encontrada." };
    } finally {
      lock.releaseLock();
    }
  } catch(e){ return { success: false, message: e.message }; }
}

/**
 * Remueve la asignación de una solicitud de REESTUDIOS para que vuelva a estar disponible en cola.
 * Limpia columnas G(7), H(8), I(9) en la hoja de reestudios.
 */
function desasignarSolicitudReestudio(idSolicitud) {
  try {
    verificarPermisoAdmin();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hoja = ssReestudios.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (!hoja) { lock.releaseLock(); return { success: false, message: "No se encontró la hoja de reestudios." }; }

    const lastRow = hoja.getLastRow();
    if (lastRow < 2) { lock.releaseLock(); return { success: false, message: "No hay datos en la hoja." }; }

    const data = hoja.getRange(2, 2, lastRow - 1, 1).getValues();

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(idSolicitud).trim()) {
        const fila = i + 2;
        hoja.getRange(fila, 7).clearContent();
        hoja.getRange(fila, 8).clearContent();
        hoja.getRange(fila, 9).clearContent();
        SpreadsheetApp.flush();
        lock.releaseLock();
        return { success: true, message: "Solicitud de reestudio desasignada correctamente." };
      }
    }
    lock.releaseLock();
    return { success: false, message: "Solicitud no encontrada en reestudios." };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function admin_reasignarSolicitud(idSolicitud, correoNuevo, tipo) {
  try {
    verificarPermisoAdmin();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    const correoNorm = correoNuevo.toLowerCase().trim();

    // Obtener nombre del analista destino
    const ssMain = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hojaUser = ssMain.getSheetByName("Usuarios");
    const dataUser = hojaUser.getDataRange().getValues();
    const usuario = dataUser.find(function(f) { return String(f[2]).toLowerCase().trim() === correoNorm; });
    const nombreNuevo = usuario ? String(usuario[1]).trim() : correoNorm;
    const ahora = new Date();
    const adminEmail = Session.getActiveUser().getEmail();

    if (tipo === 'reestudio') {
      // Historico_Gestiones de reestudios: G(7)=email, H(8)=nombre, I(9)=fechaAsig
      const ssReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
      const hojaHR = ssReest.getSheetByName("Historico_Gestiones");
      if (!hojaHR || hojaHR.getLastRow() <= 1) { lock.releaseLock(); return { success: false, message: "Historico_Gestiones de reestudios no encontrada." }; }
      const dataR = hojaHR.getRange(2, 2, hojaHR.getLastRow() - 1, 9).getValues();
      for (let i = 0; i < dataR.length; i++) {
        if (String(dataR[i][0]).trim() === String(idSolicitud).trim() && String(dataR[i][8]).trim() === '') {
          const fila = i + 2;
          const emailAnteriorR = String(dataR[i][5] || '').toLowerCase().trim();
          hojaHR.getRange(fila, 7).setValue(correoNorm);
          hojaHR.getRange(fila, 8).setValue(nombreNuevo);
          hojaHR.getRange(fila, 9).setValue(ahora);
          hojaHR.getRange(fila, 9).setNumberFormat("dd/MM/yyyy HH:mm:ss");
          hojaHR.getRange(fila, 20).setValue("ADMIN:" + adminEmail + "|" + Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd HH:mm"));
          if (emailAnteriorR && emailAnteriorR !== correoNorm) {
            _ajustarCargaPendiente(emailAnteriorR, -1);
            _ajustarCargaPendiente(correoNorm, 1);
          }
          SpreadsheetApp.flush();
          lock.releaseLock();
          return { success: true, message: "Solicitud " + idSolicitud + " reasignada a " + nombreNuevo + "." };
        }
      }
      lock.releaseLock();
      return { success: false, message: "Solicitud " + idSolicitud + " no encontrada en Historico reestudios." };

    } else {
      // Historico_Gestiones principal: Z(26)=email, AE(31)=nombre, Y(25)=fechaAsig, AA(27)=fechaFin
      const hojaHP = ssMain.getSheetByName("Historico_Gestiones");
      if (!hojaHP || hojaHP.getLastRow() <= 1) { lock.releaseLock(); return { success: false, message: "Historico_Gestiones no encontrada." }; }
      const dataP = hojaHP.getRange(2, 1, hojaHP.getLastRow() - 1, 27).getValues();
      for (let i = 0; i < dataP.length; i++) {
        if (String(dataP[i][0]).trim() === String(idSolicitud).trim() && String(dataP[i][26]).trim() === '') {
          const fila = i + 2;
          const emailAnteriorP = String(dataP[i][25] || '').toLowerCase().trim();
          hojaHP.getRange(fila, 25).setValue(ahora);
          hojaHP.getRange(fila, 25).setNumberFormat("dd/MM/yyyy HH:mm:ss");
          hojaHP.getRange(fila, 26).setValue(correoNorm);
          hojaHP.getRange(fila, 28).setValue(nombreNuevo);
          hojaHP.getRange(fila, 38).setValue("ADMIN:" + adminEmail + "|" + Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd HH:mm"));
          if (emailAnteriorP && emailAnteriorP !== correoNorm) {
            _ajustarCargaPendiente(emailAnteriorP, -1);
            _ajustarCargaPendiente(correoNorm, 1);
          }
          SpreadsheetApp.flush();
          lock.releaseLock();
          return { success: true, message: "Solicitud " + idSolicitud + " reasignada a " + nombreNuevo + "." };
        }
      }
      lock.releaseLock();
      return { success: false, message: "Solicitud " + idSolicitud + " no encontrada en Historico principal." };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Busca una solicitud por ID en las bases de datos para auditar en modal.
 */
function admin_buscarSolicitud(idSolicitud) {
  verificarPermisoAdmin();
  idSolicitud = String(idSolicitud || "").trim();
  if (!idSolicitud) return { success: false, message: "Ingresa un número de solicitud." };
  
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hojaSol = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
  if (hojaSol) {
    const lastRow = hojaSol.getLastRow();
    if (lastRow > 1) {
      const colA = hojaSol.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      for (let i = 0; i < colA.length; i++) {
        if (String(colA[i][0]).trim() === idSolicitud) {
          const fila = hojaSol.getRange(i + 2, 1, 1, hojaSol.getLastColumn()).getDisplayValues()[0];
          return {
            success: true,
            fuente: "solicitud",
            datos: {
              solicitud: fila[0] || "",
              poliza: fila[1] || "",
              identificacion: fila[2] || "",
              tipoIdentificacion: fila[3] || "",
              nombreInquilino: fila[4] || "",
              correoInquilino: fila[5] || "",
              telefonoInquilino: fila[6] || "",
              ingresos: fila[7] || "",
              fechaExpedicion: fila[8] || "",
              canon: fila[9] || "",
              cuota: fila[10] || "",
              direccionInmueble: fila[11] || "",
              destinoInmueble: fila[12] || "",
              ciudadInmueble: fila[13] || "",
              nombreAsesor: fila[14] || "",
              correoAsesor: fila[15] || "",
              estadoGeneral: fila[16] || "",
              fechaRadicacion: fila[17] || "",
              fechaResultado: fila[18] || "",
              clase: fila[20] || "",
              uar: fila[21] || "",
              biometria: fila[23] || "",
              observaciones: fila[24] || "",
              fechaAsignacion: fila[26] || "",
              analistaAsignado: fila[27] || "",
              fechaFinGestion: fila[28] || "",
              tiempoResolucion: fila[29] || "",
              nombreAnalista: fila[30] || "",
              motivoAplazamiento: fila[31] || "",
              motivoNegacion: fila[32] || "",
              fechaGestion: fila[33] || "",
              tiempoGestion: fila[34] || "",
              canal: fila[36] || ""
            }
          };
        }
      }
    }
  }
  try {
    const ssReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hojaReest = ssReest.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (hojaReest) {
      const lastRowR = hojaReest.getLastRow();
      if (lastRowR > 1) {
        const colB = hojaReest.getRange(2, 2, lastRowR - 1, 1).getDisplayValues();
        for (let i = 0; i < colB.length; i++) {
          if (String(colB[i][0]).trim() === idSolicitud) {
            const fila = hojaReest.getRange(i + 2, 1, 1, 16).getDisplayValues()[0];
            return {
              success: true,
              fuente: "reestudios",
              datos: {
                fechaRadicacion: fila[0] || "",
                solicitud: fila[1] || "",
                linkDrive: fila[2] || "",
                origen: fila[3] || "",
                tipoDeProceso: fila[4] || "",
                claseDeSolicitud: fila[5] || "",
                analistaAsignado: fila[6] || "",
                nombreAnalista: fila[7] || "",
                fechaAsignacion: fila[8] || "",
                fechaFinGestion: fila[9] || "",
                estadoGestion: fila[10] || "",
                motivoAplazamiento: fila[11] || "",
                motivoNegacion: fila[12] || "",
                observaciones: fila[13] || "",
                tiempoResolucion: fila[14] || "",
                tiempoGestion: fila[15] || ""
              }
            };
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Error buscando en reestudios: " + e.message);
  }
  return { success: false, message: "Solicitud '" + idSolicitud + "' no encontrada." };
}

function admin_getPrioridadGlobal() {
  verificarPermisoAdmin();
  return PropertiesService.getScriptProperties().getProperty('GLOBAL_PRIORIDAD') || 'DIGITAL_PRIMERO';
}

function admin_setPrioridadGlobal(nuevaPrioridad) {
  verificarPermisoAdmin();
  PropertiesService.getScriptProperties().setProperty('GLOBAL_PRIORIDAD', nuevaPrioridad);
  return { success: true, message: "Prioridad actualizada a: " + nuevaPrioridad };
}

// Orden de asignación para desaplazamiento/biometría: qué caso se llama primero
// dentro de la cola, según fechaResultado (última actualización de SAI).
// RECIENTE_PRIMERO = LIFO (comportamiento histórico) | ANTIGUO_PRIMERO = FIFO.
// Aplica tanto a RequestLeadUnificado (MotorAsignacion.js) como a autoAsignarBiometria (Biometria.js).
function admin_getOrdenDesaplazamiento() {
  verificarPermisoAdmin();
  return PropertiesService.getScriptProperties().getProperty('ORDEN_DESAPLAZAMIENTO') || 'RECIENTE_PRIMERO';
}

function admin_setOrdenDesaplazamiento(nuevoOrden) {
  verificarPermisoAdmin();
  if (nuevoOrden !== 'RECIENTE_PRIMERO' && nuevoOrden !== 'ANTIGUO_PRIMERO') {
    return { success: false, message: "Valor de orden inválido." };
  }
  PropertiesService.getScriptProperties().setProperty('ORDEN_DESAPLAZAMIENTO', nuevoOrden);
  return { success: true, message: "Orden de desaplazamiento actualizado a: " + nuevoOrden };
}

function _getTiposParaCupos() {
  var tipos = _getTiposSolicitud();
  return tipos.filter(function(t) { return t.activo; }).map(function(t) { return { id: t.id, label: t.label }; });
}

function _propKeyCupo(equipoId, tipoId) {
  var legacy = { digital: 'DIGITAL', nueva: 'NUEVAS', desaplazamiento: 'DESAPLAZAMIENTO', induccion: 'INDUCCIONES', reestudio: 'REESTUDIOS', nuevaUar: 'NUEVA_UAR', deudorUar: 'DEUDOR_UAR', biometriaFallida: 'BIOMETRIA_FALLIDA' };
  var suffix = legacy[tipoId] || tipoId.toUpperCase();
  return 'CUPOS_' + equipoId.toUpperCase() + '_' + suffix;
}

function admin_getCuotasGlobales() {
  verificarPermisoAdmin();
  var props = PropertiesService.getScriptProperties();
  var tipos = _getTiposParaCupos();

  function getVal(key, def) {
    var v = props.getProperty(key);
    if (v === null || v === '') return def;
    var p = parseInt(v, 10);
    return isNaN(p) ? def : p;
  }

  var equipos = _getEquipos();
  if (!equipos || equipos.length === 0) equipos = [
    { id: 'DIGITAL' }, { id: 'DESAPLAZAMIENTO' }, { id: 'REESTUDIOS' }
  ];

  var result = {};
  for (var e = 0; e < equipos.length; e++) {
    var eqId = equipos[e].id.toLowerCase();
    var data = { total: getVal('CUPOS_' + eqId.toUpperCase() + '_TOTAL', 0) };
    for (var t = 0; t < tipos.length; t++) {
      var val = getVal(_propKeyCupo(eqId, tipos[t].id), -1);
      if (val === -1 && tipos[t].id === 'digital') val = getVal(_propKeyCupo(eqId, 'nueva'), 0);
      if (val === -1 && tipos[t].id === 'desaplazamiento') val = getVal('CUPOS_' + eqId.toUpperCase() + '_BIOMETRIA', 0);
      if (val === -1) val = 0;
      data[tipos[t].id] = val;
    }
    result[eqId] = data;
  }
  return result;
}

function admin_setCuotasGlobales(cupos) {
  verificarPermisoAdmin();
  var props = PropertiesService.getScriptProperties();
  var tipos = _getTiposParaCupos();
  var equipoKeys = Object.keys(cupos);

  for (var e = 0; e < equipoKeys.length; e++) {
    var equipo = equipoKeys[e];
    var data = cupos[equipo];
    if (!data) return { success: false, message: "Datos incompletos para equipo: " + equipo };
    var suma = 0;
    for (var t = 0; t < tipos.length; t++) {
      suma += parseInt(data[tipos[t].id]) || 0;
    }
    if (suma > (parseInt(data.total) || 0)) {
      return { success: false, message: "La suma de subcategorias excede el total en equipo: " + equipo + " (" + suma + " > " + data.total + ")" };
    }
    props.setProperty('CUPOS_' + equipo.toUpperCase() + '_TOTAL', String(parseInt(data.total) || 0));
    for (var t2 = 0; t2 < tipos.length; t2++) {
      var key = _propKeyCupo(equipo, tipos[t2].id);
      props.setProperty(key, String(parseInt(data[tipos[t2].id]) || 0));
    }
  }

  var adminEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  var ahora = new Date();
  for (var e2 = 0; e2 < equipoKeys.length; e2++) {
    registrarHistoricoCupos_('GENERAL', equipoKeys[e2].toUpperCase(), '', '', cupos[equipoKeys[e2]], adminEmail, ahora);
  }

  return { success: true, message: "Cupos actualizados correctamente." };
}

/**
 * Busca analistas por nombre o email para el buscador de cupos individuales.
 */
function admin_buscarAnalistasCupos(termino) {
  verificarPermisoAdmin();
  termino = String(termino || '').toLowerCase().trim();
  if (termino.length < 2) return [];

  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hoja = ss.getSheetByName("Usuarios");
  const datos = hoja.getDataRange().getValues();
  const resultados = [];

  for (let i = 1; i < datos.length; i++) {
    const nombre = String(datos[i][1]).trim();
    const correo = String(datos[i][2]).trim().toLowerCase();
    const especialidad = String(datos[i][4]).trim();

    if (nombre.toLowerCase().includes(termino)) {
      resultados.push({
        nombre: nombre,
        correo: correo,
        especialidad: especialidad,
        capacidad: parseInt(datos[i][6]) || 0,
        row: i + 1
      });
    }
    if (resultados.length >= 10) break;
  }
  return resultados;
}

/**
 * Obtiene los cupos individuales de un analista.
 * Retorna null si usa los globales, o el objeto de cupos si tiene personalizados.
 */
function admin_getAnalistasConCuposPersonalizados() {
  verificarPermisoAdmin();
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName("Usuarios");
  var datos = hoja.getDataRange().getValues();
  var resultado = [];
  for (var i = 1; i < datos.length; i++) {
    var cuposRaw = String(datos[i][24] || '').trim();
    if (!cuposRaw) continue;
    try {
      var cupos = JSON.parse(cuposRaw);
      resultado.push({
        correo: String(datos[i][2]).toLowerCase().trim(),
        nombre: String(datos[i][1]).trim(),
        especialidad: String(datos[i][4]).trim(),
        cupos: cupos,
        fijo: cupos.fijo === true
      });
    } catch(e) {}
  }
  return resultado;
}

function admin_getCuposIndividual(correoAnalista) {
  verificarPermisoAdmin();
  correoAnalista = String(correoAnalista).toLowerCase().trim();

  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hoja = ss.getSheetByName("Usuarios");
  const datos = hoja.getDataRange().getValues();

  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][2]).toLowerCase().trim() === correoAnalista) {
      const cuposRaw = String(datos[i][24] || '').trim();
      if (!cuposRaw || cuposRaw === '') {
        return { personalizado: false, cupos: null, especialidad: String(datos[i][4]).trim() };
      }
      try {
        const cupos = JSON.parse(cuposRaw);
        return { personalizado: true, cupos: cupos, especialidad: String(datos[i][4]).trim() };
      } catch (e) {
        return { personalizado: false, cupos: null, especialidad: String(datos[i][4]).trim() };
      }
    }
  }
  return { personalizado: false, cupos: null, especialidad: '' };
}

/**
 * Guarda cupos individuales para un analista específico.
 * Si cupos es null o vacío, elimina los cupos personalizados (vuelve a globales).
 */
function admin_setCuposIndividual(correoAnalista, cupos) {
  verificarPermisoAdmin();
  correoAnalista = String(correoAnalista).toLowerCase().trim();
  if (!correoAnalista) return { success: false, message: "Correo de analista requerido." };

  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hoja = ss.getSheetByName("Usuarios");
  const datos = hoja.getDataRange().getValues();

  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][2]).toLowerCase().trim() === correoAnalista) {
      const row = i + 1;
      const nombreAnalista = String(datos[i][1]).trim();
      const especialidad = String(datos[i][4]).trim();

      if (!cupos || cupos === null) {
        // Eliminar cupos personalizados
        hoja.getRange(row, 25).clearContent(); // col Y (index 24)
        const adminEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
        var cuposReset = { total: 0 };
        _getTiposParaCupos().forEach(function(t) { cuposReset[t.id] = 0; });
        registrarHistoricoCupos_('INDIVIDUAL_RESET', especialidad, correoAnalista, nombreAnalista, cuposReset, adminEmail, new Date());
        return { success: true, message: "Cupos personalizados eliminados. " + nombreAnalista + " usará los cupos globales del equipo." };
      }

      // Validar
      var tipos = _getTiposParaCupos();
      var suma = 0;
      tipos.forEach(function(t) { suma += parseInt(cupos[t.id]) || 0; });
      if (suma > (parseInt(cupos.total) || 0)) {
        return { success: false, message: "La suma de subcategorías (" + suma + ") excede el total (" + cupos.total + ")." };
      }

      const cuposObj = { total: parseInt(cupos.total) || 0, fijo: cupos.fijo === true };
      tipos.forEach(function(t) { cuposObj[t.id] = parseInt(cupos[t.id]) || 0; });

      hoja.getRange(row, 25).setValue(JSON.stringify(cuposObj)); // col Y (index 24)
      hoja.getRange(row, 7).setValue(cuposObj.total);           // col G = capTotal (leída por RequestLead)

      const adminEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
      registrarHistoricoCupos_('INDIVIDUAL', especialidad, correoAnalista, nombreAnalista, cuposObj, adminEmail, new Date());

      return { success: true, message: "Cupos personalizados guardados para " + nombreAnalista + "." };
    }
  }
  return { success: false, message: "Analista no encontrado." };
}

/**
 * Registra un cambio de cupos en la hoja historico_cupos.
 * Columnas: fecha | tipo | equipo | analista_email | analista_nombre | total | digital | reestudios | inducciones | desaplazamiento | nueva_uar | deudor_uar | modificado_por
 * @private
 */
function registrarHistoricoCupos_(tipo, equipo, analistaEmail, analistaNombre, cupos, adminEmail, fecha) {
  try {
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    let hoja = ss.getSheetByName("historico_cupos");
    var tipos = _getTiposParaCupos();
    if (!hoja) {
      hoja = ss.insertSheet("historico_cupos");
      var headers = ['Fecha', 'Tipo', 'Equipo', 'Analista Email', 'Analista Nombre', 'Total'];
      tipos.forEach(function(t) { headers.push(t.label); });
      headers.push('Modificado Por');
      hoja.appendRow(headers);
      hoja.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    var row = [fecha, tipo, equipo, analistaEmail || '', analistaNombre || '', parseInt(cupos.total) || 0];
    tipos.forEach(function(t) {
      row.push(parseInt(cupos[t.id]) || 0);
    });
    row.push(adminEmail);
    hoja.appendRow(row);
  } catch (e) {
    Logger.log("Error al registrar histórico de cupos: " + e.message);
  }
}

/**
 * Obtiene datos de novedades/estados para el panel de control.
 * Lee siempre de Historico_Estados + datos de solicitudes para horas de asignación/cierre.
 * @param {string} [fechaDesde] - Fecha inicio yyyy-MM-dd (default: hoy)
 * @param {string} [fechaHasta] - Fecha fin yyyy-MM-dd (default: igual a fechaDesde)
 */
function admin_obtenerNovedades(fechaDesde, fechaHasta) {
  verificarPermisoAdmin();
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);

  const hoy = new Date();
  const hoyStr = Utilities.formatDate(hoy, TIMEZONE, "yyyy-MM-dd");
  const desde = (fechaDesde && fechaDesde.trim() !== '') ? fechaDesde.trim() : hoyStr;
  const hasta = (fechaHasta && fechaHasta.trim() !== '') ? fechaHasta.trim() : desde;

  // Mapa turno nombre por idTurno
  const mapaTurnoNombre = {};
  const hojaTurnos = ss.getSheetByName('Turnos');
  if (hojaTurnos && hojaTurnos.getLastRow() > 1) {
    const dt = hojaTurnos.getDataRange().getValues();
    for (let i = 1; i < dt.length; i++) {
      const id = String(dt[i][0]).trim();
      if (id) mapaTurnoNombre[id] = String(dt[i][1]).trim();
    }
  }

  // Mapa email → idTurno vigente
  const mapaEmailTurno = {};
  const hojaAT = ss.getSheetByName('Analistas_Turnos');
  if (hojaAT && hojaAT.getLastRow() > 1) {
    const dat = hojaAT.getDataRange().getValues();
    for (let i = 1; i < dat.length; i++) {
      const email = String(dat[i][0]).toLowerCase().trim();
      const idT = String(dat[i][1]).trim();
      const desdeFecha = dat[i][2] instanceof Date ? dat[i][2] : null;
      const hastaFecha = dat[i][3] instanceof Date ? dat[i][3] : null;
      if (!email || !idT || !desdeFecha) continue;
      if (hoy >= desdeFecha && (!hastaFecha || hoy <= hastaFecha)) {
        mapaEmailTurno[email] = mapaTurnoNombre[idT] || idT;
      }
    }
  }

  // Mapa de analistas
  const hojaUsuarios = ss.getSheetByName("Usuarios");
  const datosUsuarios = hojaUsuarios.getDataRange().getValues();
  const mapaAnalistas = {};
  for (let i = 1; i < datosUsuarios.length; i++) {
    const correo = String(datosUsuarios[i][2]).trim().toLowerCase();
    if (!correo) continue;
    mapaAnalistas[correo] = {
      nombre: String(datosUsuarios[i][1]).trim(),
      especialidad: String(datosUsuarios[i][4]).trim(),
      estadoActual: String(datosUsuarios[i][5]).trim(),
      turno: mapaEmailTurno[correo] || ''
    };
  }

  // Leer Historico_Estados
  const hojaHist = ss.getSheetByName("Historico_Estados");
  if (!hojaHist) return { desde: desde, hasta: hasta, datos: [] };
  const lastRow = hojaHist.getLastRow();
  if (lastRow < 2) return { desde: desde, hasta: hasta, datos: [] };

  const dataHist = hojaHist.getRange(2, 1, lastRow - 1, 6).getDisplayValues();

  // Agrupar por analista
  const agrupado = {};
  for (let i = 0; i < dataHist.length; i++) {
    const fechaReg = String(dataHist[i][0]).trim();
    if (fechaReg < desde || fechaReg > hasta) continue;

    const correo = String(dataHist[i][1]).trim().toLowerCase();
    if (!agrupado[correo]) agrupado[correo] = { estados: {}, registros: [] };

    const estado = String(dataHist[i][2]).trim();
    const horaInicio = String(dataHist[i][3]).trim();
    const horaFin = String(dataHist[i][4]).trim();
    const duracion = parseInt(dataHist[i][5]) || 0;
    const enCurso = (horaFin === 'EN CURSO');

    let durReal = duracion;
    if (enCurso && horaInicio) {
      try {
        const inicioDate = new Date(horaInicio.replace(' ', 'T'));
        if (!isNaN(inicioDate.getTime())) durReal = Math.round((hoy.getTime() - inicioDate.getTime()) / 60000);
      } catch(e) {}
    }

    if (!agrupado[correo].estados[estado]) agrupado[correo].estados[estado] = 0;
    agrupado[correo].estados[estado] += durReal;

    agrupado[correo].registros.push({ estado: estado, horaInicio: horaInicio, horaFin: horaFin, duracion: durReal, enCurso: enCurso });
  }

  // Primer y último resultado (fechaFinGestion) — solicitudes + reestudios
  const horasSolicitudes = {};

  function registrarResultado_(correo, fecha) {
    if (!correo || !(fecha instanceof Date) || isNaN(fecha.getTime())) return;
    if (!horasSolicitudes[correo]) horasSolicitudes[correo] = { primerResultado: '', ultimoResultado: '' };
    const fechaStr = Utilities.formatDate(fecha, TIMEZONE, "yyyy-MM-dd");
    if (fechaStr < desde || fechaStr > hasta) return;
    const hora = Utilities.formatDate(fecha, TIMEZONE, "HH:mm");
    if (!horasSolicitudes[correo].primerResultado || hora < horasSolicitudes[correo].primerResultado) {
      horasSolicitudes[correo].primerResultado = hora;
    }
    if (!horasSolicitudes[correo].ultimoResultado || hora > horasSolicitudes[correo].ultimoResultado) {
      horasSolicitudes[correo].ultimoResultado = hora;
    }
  }

  // 1. Historico_Gestiones (Digital/Biometría/Inducción): col Z(26)=email, col AA(27)=fechaFinGestion
  try {
    const hojaHistNov = ss.getSheetByName("Historico_Gestiones");
    if (hojaHistNov && hojaHistNov.getLastRow() > 1) {
      const colsNov = Math.max(28, hojaHistNov.getLastColumn());
      const dataHistNov = hojaHistNov.getRange(2, 1, hojaHistNov.getLastRow() - 1, colsNov).getValues();
      for (let i = 0; i < dataHistNov.length; i++) {
        const asignado = String(dataHistNov[i][25] || "").trim().toLowerCase();
        if (!asignado) continue;
        registrarResultado_(asignado, dataHistNov[i][26]);
      }
    }
  } catch(e) { Logger.log("Error solicitudes novedades: " + e.message); }

  // 2. Historico_Gestiones de Reestudios: col G(7)=email, col J(10)=fechaFinGestion
  try {
    const ssReest = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hojaHistReestNov = ssReest.getSheetByName("Historico_Gestiones");
    if (hojaHistReestNov && hojaHistReestNov.getLastRow() > 1) {
      const dataReestNov = hojaHistReestNov.getRange(2, 1, hojaHistReestNov.getLastRow() - 1, 10).getValues();
      for (let i = 0; i < dataReestNov.length; i++) {
        const asignado = String(dataReestNov[i][6] || "").trim().toLowerCase();
        if (!asignado) continue;
        registrarResultado_(asignado, dataReestNov[i][9]);
      }
    }
  } catch(e) { Logger.log("Error reestudios novedades: " + e.message); }

  // Construir resultado
  const resultados = [];
  for (const correo in agrupado) {
    const info = mapaAnalistas[correo] || { nombre: correo, especialidad: '', estadoActual: '', turno: '' };
    const d = agrupado[correo];
    const horas = horasSolicitudes[correo] || { primerResultado: '', ultimoResultado: '' };

    let tiempoEnEstadoActual = 0;
    if (d.registros.length > 0) {
      const ultimo = d.registros[d.registros.length - 1];
      if (ultimo.enCurso) tiempoEnEstadoActual = ultimo.duracion;
    }

    resultados.push({
      nombre: info.nombre,
      correo: correo,
      especialidad: info.especialidad,
      turno: info.turno || '',
      estadoActual: info.estadoActual,
      tiempoEnEstadoActual: tiempoEnEstadoActual,
      estados: d.estados,
      primerResultado: horas.primerResultado,
      ultimoResultado: horas.ultimoResultado
    });
  }

  // Incluir analistas sin actividad
  for (const correo in mapaAnalistas) {
    if (!agrupado[correo]) {
      resultados.push({
        nombre: mapaAnalistas[correo].nombre,
        correo: correo,
        especialidad: mapaAnalistas[correo].especialidad,
        turno: mapaAnalistas[correo].turno || '',
        estadoActual: mapaAnalistas[correo].estadoActual,
        tiempoEnEstadoActual: 0,
        estados: {},
        primerResultado: '',
        ultimoResultado: ''
      });
    }
  }

  // Permisos aprobados que cruzan el rango de fechas
  const permisosAprobados = [];
  try {
    const hojaPI = ss.getSheetByName('Permisos_Incapacidades');
    if (hojaPI && hojaPI.getLastRow() > 1) {
      const dataPI = hojaPI.getDataRange().getValues();
      for (let i = 1; i < dataPI.length; i++) {
        if (String(dataPI[i][8]).toUpperCase() !== 'APROBADO') continue;
        const fi = _fmtFechaPI_(dataPI[i][5]);
        const ff = _fmtFechaPI_(dataPI[i][6]);
        if (fi > hasta || ff < desde) continue;
        permisosAprobados.push({
          id: String(dataPI[i][0]).trim(),
          correo: String(dataPI[i][2]).trim(),
          nombre: String(dataPI[i][3]).trim(),
          tipo: String(dataPI[i][4]).trim(),
          fechaInicio: fi,
          fechaFin: ff,
          observacion: String(dataPI[i][7]).trim()
        });
      }
    }
  } catch(ePI) { Logger.log('Error permisos: ' + ePI.message); }

  return { desde: desde, hasta: hasta, datos: resultados, permisos: permisosAprobados };
}

function admin_desactivarTodosAsesores() {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName("Usuarios");
    const lastRow = hoja.getLastRow();
    if (lastRow < 2) return { success: false, message: "No hay usuarios." };
    const rangoEstados = hoja.getRange(2, 6, lastRow - 1, 1);
    const nuevosValores = new Array(lastRow - 1).fill(["INACTIVO"]);
    rangoEstados.setValues(nuevosValores);
    return { success: true, message: "Sistema pausado: Todos los analistas han sido pasados a INACTIVO." };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TURNOS — CRUD y asignación
// ═══════════════════════════════════════════════════════════════════════════════

function admin_getTurnosData() {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const DIAS_KEYS = ['lun','mar','mie','jue','vie','sab','dom'];

    // 1. Leer turnos
    const hojaTurnos = ss.getSheetByName('Turnos');
    const turnos = [];
    if (hojaTurnos && hojaTurnos.getLastRow() > 1) {
      const data = hojaTurnos.getDataRange().getValues();
      const disp = hojaTurnos.getDataRange().getDisplayValues();
      for (let i = 1; i < data.length; i++) {
        const id = String(data[i][0]).trim();
        if (!id) continue;
        const activo = data[i][2] === true || String(data[i][2]).toUpperCase() === 'TRUE';
        const dias = {};
        for (let d = 0; d < 7; d++) {
          const boolCol = 3 + d;
          const iniCol = 10 + d * 2;
          const finCol = 11 + d * 2;
          dias[DIAS_KEYS[d]] = {
            activo: data[i][boolCol] === true || String(data[i][boolCol]).toUpperCase() === 'TRUE',
            horaInicio: String(disp[i][iniCol] || '').trim(),
            horaFin:    String(disp[i][finCol] || '').trim()
          };
        }
        turnos.push({ id: id, nombre: String(data[i][1]).trim(), activo: activo, dias: dias });
      }
    }

    // 2. Leer analistas y sus turnos vigentes
    const hojaUsuarios = ss.getSheetByName('Usuarios');
    const datosU = hojaUsuarios.getDataRange().getValues();
    const ahora = new Date();
    const mapaEmailTurno = {};
    const hojaAT = ss.getSheetByName('Analistas_Turnos');
    if (hojaAT && hojaAT.getLastRow() > 1) {
      const dat = hojaAT.getDataRange().getValues();
      for (let i = 1; i < dat.length; i++) {
        const email = String(dat[i][0]).toLowerCase().trim();
        const idT = String(dat[i][1]).trim();
        const desde = dat[i][2] instanceof Date ? dat[i][2] : null;
        const hasta = dat[i][3] instanceof Date ? dat[i][3] : null;
        if (!email || !idT || !desde) continue;
        if (ahora >= desde && (!hasta || ahora <= hasta)) {
          mapaEmailTurno[email] = idT;
        }
      }
    }

    const analistas = [];
    const sinTurno = [];
    const turnoIdsActivos = turnos.filter(function(t){ return t.activo; }).map(function(t){ return t.id; });
    for (let i = 1; i < datosU.length; i++) {
      const email = String(datosU[i][2]).toLowerCase().trim();
      if (!email) continue;
      const nombre = String(datosU[i][1]).trim();
      const especialidad = String(datosU[i][4]).trim();
      const idTurnoActual = mapaEmailTurno[email] || '';
      analistas.push({ email: email, nombre: nombre, especialidad: especialidad, idTurnoActual: idTurnoActual });
      if (!idTurnoActual || turnoIdsActivos.indexOf(idTurnoActual) === -1) {
        sinTurno.push(email);
      }
    }

    return { success: true, turnos: turnos, analistas: analistas, sinTurno: sinTurno };
  } catch (e) {
    return { success: false, message: e.message, turnos: [], analistas: [], sinTurno: [] };
  }
}

function admin_guardarTurno(turno) {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    let hoja = ss.getSheetByName('Turnos');
    if (!hoja) {
      hoja = ss.insertSheet('Turnos');
      hoja.appendRow(['id','nombre','activo','lun','mar','mie','jue','vie','sab','dom',
                       'iniLun','finLun','iniMar','finMar','iniMie','finMie',
                       'iniJue','finJue','iniVie','finVie','iniSab','finSab','iniDom','finDom']);
      hoja.getRange(2, 11, hoja.getMaxRows() - 1, 14).setNumberFormat('@');
    }

    const DIAS_KEYS = ['lun','mar','mie','jue','vie','sab','dom'];
    const fila = [turno.id, turno.nombre, true];
    DIAS_KEYS.forEach(function(d) {
      fila.push(turno.dias[d] ? turno.dias[d].activo : false);
    });
    DIAS_KEYS.forEach(function(d) {
      fila.push(turno.dias[d] && turno.dias[d].activo ? turno.dias[d].horaInicio : '');
      fila.push(turno.dias[d] && turno.dias[d].activo ? turno.dias[d].horaFin : '');
    });

    // Buscar si ya existe
    const data = hoja.getDataRange().getValues();
    let filaIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === turno.id) { filaIdx = i + 1; break; }
    }

    if (filaIdx > 0) {
      hoja.getRange(filaIdx, 11, 1, 14).setNumberFormat('@');
      hoja.getRange(filaIdx, 1, 1, fila.length).setValues([fila]);
    } else {
      const nuevaFila = hoja.getLastRow() + 1;
      hoja.getRange(nuevaFila, 11, 1, 14).setNumberFormat('@');
      hoja.getRange(nuevaFila, 1, 1, fila.length).setValues([fila]);
    }
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function admin_desactivarTurno(idTurno) {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName('Turnos');
    if (!hoja) return { success: false, message: 'Hoja Turnos no encontrada.' };

    const data = hoja.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === idTurno) {
        hoja.getRange(i + 1, 3).setValue(false);
        break;
      }
    }

    // Cerrar asignaciones vigentes de ese turno
    const afectados = [];
    const hojaAT = ss.getSheetByName('Analistas_Turnos');
    if (hojaAT && hojaAT.getLastRow() > 1) {
      const ahora = new Date();
      const dat = hojaAT.getDataRange().getValues();
      for (let i = 1; i < dat.length; i++) {
        const idT = String(dat[i][1]).trim();
        if (idT !== idTurno) continue;
        const desde = dat[i][2] instanceof Date ? dat[i][2] : null;
        const hasta = dat[i][3] instanceof Date ? dat[i][3] : null;
        if (desde && ahora >= desde && (!hasta || ahora <= hasta)) {
          hojaAT.getRange(i + 1, 4).setValue(ahora);
          afectados.push(String(dat[i][0]).trim());
        }
      }
    }

    SpreadsheetApp.flush();
    return { success: true, message: 'Turno desactivado.', afectados: afectados };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function admin_asignarTurnoAnalista(email, idTurno, desde) {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    let hojaAT = ss.getSheetByName('Analistas_Turnos');
    if (!hojaAT) {
      hojaAT = ss.insertSheet('Analistas_Turnos');
      hojaAT.appendRow(['email','idTurno','desde','hasta']);
    }

    const ahora = new Date();
    const emailNorm = email.toLowerCase().trim();
    const fechaDesde = new Date(desde + 'T00:00:00');

    // Cerrar asignación vigente anterior
    if (hojaAT.getLastRow() > 1) {
      const dat = hojaAT.getDataRange().getValues();
      for (let i = 1; i < dat.length; i++) {
        const em = String(dat[i][0]).toLowerCase().trim();
        if (em !== emailNorm) continue;
        const d = dat[i][2] instanceof Date ? dat[i][2] : null;
        const h = dat[i][3] instanceof Date ? dat[i][3] : null;
        if (d && ahora >= d && (!h || ahora <= h)) {
          hojaAT.getRange(i + 1, 4).setValue(ahora);
        }
      }
    }

    // Nueva asignación
    hojaAT.appendRow([emailNorm, idTurno, fechaDesde, '']);
    hojaAT.getRange(hojaAT.getLastRow(), 3).setNumberFormat('yyyy-MM-dd');
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function admin_asignarTodosSinTurno(idTurno, desde) {
  try {
    verificarPermisoAdmin();
    const res = admin_getTurnosData();
    if (!res.success) return res;
    const sinTurno = res.sinTurno || [];
    if (sinTurno.length === 0) return { success: true, message: 'No hay analistas sin turno.' };

    let asignados = 0;
    for (let i = 0; i < sinTurno.length; i++) {
      var r = admin_asignarTurnoAnalista(sinTurno[i], idTurno, desde);
      if (r.success) asignados++;
    }
    return { success: true, message: asignados + ' analista(s) asignados al turno.' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HORAS EXTRA
// ═══════════════════════════════════════════════════════════════════════════════

function admin_getHorasExtra(emailFiltro, anio, mes) {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName('Horas_Extra');
    if (!hoja || hoja.getLastRow() <= 1) return { success: true, extras: [] };

    const data = hoja.getDataRange().getValues();
    const disp = hoja.getDataRange().getDisplayValues();
    const extras = [];
    for (let i = 1; i < data.length; i++) {
      const em = String(data[i][0]).toLowerCase().trim();
      const fecha = data[i][1] instanceof Date
        ? Utilities.formatDate(data[i][1], TIMEZONE, 'yyyy-MM-dd')
        : String(data[i][1]).trim().substring(0, 10);

      if (emailFiltro && em !== emailFiltro.toLowerCase().trim()) continue;
      const parts = fecha.split('-');
      if (parseInt(parts[0]) !== anio || parseInt(parts[1]) !== mes) continue;

      extras.push({
        fila: i + 1,
        email: em,
        fecha: fecha,
        horaInicio: String(disp[i][2] || '').trim(),
        horaFin:    String(disp[i][3] || '').trim(),
        descripcion: String(data[i][4] || '').trim()
      });
    }
    return { success: true, extras: extras };
  } catch (e) {
    return { success: false, message: e.message, extras: [] };
  }
}

function admin_guardarHorasExtra(extra) {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    let hoja = ss.getSheetByName('Horas_Extra');
    if (!hoja) {
      hoja = ss.insertSheet('Horas_Extra');
      hoja.appendRow(['email','fecha','horaInicio','horaFin','descripcion']);
    }
    hoja.appendRow([
      extra.email.toLowerCase().trim(),
      extra.fecha,
      extra.horaInicio,
      extra.horaFin,
      extra.descripcion || ''
    ]);
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function admin_eliminarHorasExtra(fila) {
  try {
    verificarPermisoAdmin();
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const hoja = ss.getSheetByName('Horas_Extra');
    if (!hoja) return { success: false, message: 'Hoja no encontrada.' };
    if (fila < 2 || fila > hoja.getLastRow()) return { success: false, message: 'Fila inválida.' };
    hoja.deleteRow(fila);
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISOS / INCAPACIDADES — Admin
// ═══════════════════════════════════════════════════════════════════════════════

function _fmtFechaPI_(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, TIMEZONE, 'yyyy-MM-dd');
  var s = String(val).trim();
  if (s.length >= 10 && s[4] === '-') return s.substring(0, 10);
  if (s.includes('/')) {
    var p = s.split(/[\s\/]/);
    if (p[2] && p[2].length === 4) return p[2] + '-' + p[1].padStart(2,'0') + '-' + p[0].padStart(2,'0');
  }
  return s;
}

function _getHojaPermisos_() {
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName('Permisos_Incapacidades');
  if (!hoja) {
    hoja = ss.insertSheet('Permisos_Incapacidades');
    hoja.appendRow(['id','fechaSolicitud','correo','nombre','tipo','fechaInicio','fechaFin','observacionAnalista','estado','correoAdmin','fechaRevision','observacionAdmin']);
  }
  return hoja;
}

function admin_obtenerPermisosPendientes(filtro) {
  verificarPermisoAdmin();
  var hoja = _getHojaPermisos_();
  if (hoja.getLastRow() <= 1) return { registros: [] };
  var data = hoja.getDataRange().getValues();
  var registros = [];
  for (var i = 1; i < data.length; i++) {
    var estado = String(data[i][8] || 'PENDIENTE').toUpperCase().trim();
    if (filtro && filtro !== 'TODOS' && estado !== filtro) continue;
    registros.push({
      id: String(data[i][0]).trim(),
      fechaSolicitud: _fmtFechaPI_(data[i][1]),
      correo: String(data[i][2]).trim(),
      nombre: String(data[i][3]).trim(),
      tipo: String(data[i][4]).trim(),
      fechaInicio: _fmtFechaPI_(data[i][5]),
      fechaFin: _fmtFechaPI_(data[i][6]),
      observacionAnalista: String(data[i][7] || '').trim(),
      estado: estado,
      correoAdmin: String(data[i][9] || '').trim(),
      fechaRevision: _fmtFechaPI_(data[i][10]),
      observacionAdmin: String(data[i][11] || '').trim()
    });
  }
  return { registros: registros };
}

function admin_resolverPermiso(id, decision, observacion) {
  try {
    verificarPermisoAdmin();
    var hoja = _getHojaPermisos_();
    if (hoja.getLastRow() <= 1) return { success: false, message: 'Permiso no encontrado.' };
    var data = hoja.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === id) {
        var adminEmail = Session.getActiveUser().getEmail();
        var ahora = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
        hoja.getRange(i + 1, 9).setValue(decision);
        hoja.getRange(i + 1, 10).setValue(adminEmail);
        hoja.getRange(i + 1, 11).setValue(ahora);
        hoja.getRange(i + 1, 12).setValue(observacion || '');
        SpreadsheetApp.flush();

        try {
          var correoAnalista = String(data[i][2]).trim();
          if (correoAnalista) {
            _enviarCorreoMarca_(
              correoAnalista,
              (decision === 'APROBADO' ? '✅ Tu permiso fue aprobado: ' : 'Sobre tu solicitud de permiso: ') + String(data[i][4]).trim(),
              _construirCorreoResolucionPermiso_(
                String(data[i][3]).trim(), String(data[i][4]).trim(),
                _fmtFechaPI_(data[i][5]), _fmtFechaPI_(data[i][6]),
                decision, observacion || ''
              )
            );
          }
        } catch (eMail) {
          Logger.log('Error enviando correo de resolución de permiso: ' + eMail.message);
        }

        return { success: true, message: 'Permiso ' + decision.toLowerCase() + ' correctamente.' };
      }
    }
    return { success: false, message: 'Permiso con ID ' + id + ' no encontrado.' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function admin_contarPermisosPendientes() {
  try {
    verificarPermisoAdmin();
    var hoja = _getHojaPermisos_();
    if (hoja.getLastRow() <= 1) return { pendientes: 0 };
    var data = hoja.getRange(2, 9, hoja.getLastRow() - 1, 1).getValues();
    var n = 0;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]).toUpperCase().trim() === 'PENDIENTE') n++;
    }
    return { pendientes: n };
  } catch (e) {
    return { pendientes: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORIAL Y ANALÍTICA DE AUSENCIAS — Admin
// ═══════════════════════════════════════════════════════════════════════════════

// Días de ausencia inclusive entre dos fechas ya normalizadas a yyyy-MM-dd (usar
// siempre después de _fmtFechaPI_, no parsea formatos crudos del sheet).
function _diasEntreFechasPI_(fechaIniStr, fechaFinStr) {
  if (!fechaIniStr || !fechaFinStr) return 0;
  var ini = new Date(fechaIniStr + 'T00:00:00');
  var fin = new Date(fechaFinStr + 'T00:00:00');
  if (isNaN(ini.getTime()) || isNaN(fin.getTime())) return 0;
  var dias = Math.round((fin.getTime() - ini.getTime()) / 86400000) + 1;
  return dias > 0 ? dias : 0;
}

function admin_getUmbralFrecuente() {
  verificarPermisoAdmin();
  var v = PropertiesService.getScriptProperties().getProperty('UMBRAL_PERMISOS_FRECUENTE_30D');
  return { umbral: parseInt(v) || 3 };
}

function admin_setUmbralFrecuente(valor) {
  try {
    verificarPermisoAdmin();
    var n = parseInt(valor);
    if (isNaN(n) || n < 1) return { success: false, message: 'El umbral debe ser un número mayor a 0.' };
    PropertiesService.getScriptProperties().setProperty('UMBRAL_PERMISOS_FRECUENTE_30D', String(n));
    return { success: true, message: 'Umbral actualizado a ' + n + ' aprobados en 30 días.' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Agregación por analista sobre TODOS los estados (a diferencia de admin_obtenerNovedades,
// que solo mira APROBADO). Usa el mismo criterio de solapamiento de rango que
// admin_obtenerNovedades (fi > hasta || ff < desde) para que los números cuadren
// entre ambas vistas.
function admin_obtenerHistorialAusencias(fechaDesde, fechaHasta) {
  verificarPermisoAdmin();
  var hoy = new Date();
  var hoyStr = Utilities.formatDate(hoy, TIMEZONE, 'yyyy-MM-dd');
  var desde = (fechaDesde && fechaDesde.trim() !== '') ? fechaDesde.trim() : hoyStr;
  var hasta = (fechaHasta && fechaHasta.trim() !== '') ? fechaHasta.trim() : hoyStr;

  var resultado = {
    desde: desde, hasta: hasta,
    kpis: { totalAprobados: 0, totalPendientes: 0, totalRechazados: 0, totalDiasAusencia: 0, tasaAprobacion: 0, porTipo: {} },
    porAnalista: []
  };

  var hoja = _getHojaPermisos_();
  if (hoja.getLastRow() <= 1) return resultado;

  var data = hoja.getDataRange().getValues();
  var porCorreo = {};
  var umbral30 = Utilities.formatDate(new Date(hoy.getTime() - 30 * 86400000), TIMEZONE, 'yyyy-MM-dd');

  for (var i = 1; i < data.length; i++) {
    var fi = _fmtFechaPI_(data[i][5]);
    var ff = _fmtFechaPI_(data[i][6]);
    if (fi > hasta || ff < desde) continue;

    var correo = String(data[i][2]).trim().toLowerCase();
    var nombre = String(data[i][3]).trim();
    var tipo = String(data[i][4]).trim();
    var estado = String(data[i][8] || 'PENDIENTE').toUpperCase().trim();
    var dias = _diasEntreFechasPI_(fi, ff);

    if (!porCorreo[correo]) {
      porCorreo[correo] = { correo: correo, nombre: nombre, aprobados: 0, pendientes: 0, rechazados: 0, diasTotales: 0, porTipo: {}, recientes30: 0 };
    }
    var r = porCorreo[correo];
    r.porTipo[tipo] = (r.porTipo[tipo] || 0) + 1;

    if (estado === 'APROBADO') {
      r.aprobados++; r.diasTotales += dias;
      resultado.kpis.totalAprobados++; resultado.kpis.totalDiasAusencia += dias;
      resultado.kpis.porTipo[tipo] = (resultado.kpis.porTipo[tipo] || 0) + 1;
      if (fi >= umbral30) r.recientes30++;
    } else if (estado === 'PENDIENTE') {
      r.pendientes++; resultado.kpis.totalPendientes++;
    } else {
      r.rechazados++; resultado.kpis.totalRechazados++;
    }
  }

  var totalSolicitudes = resultado.kpis.totalAprobados + resultado.kpis.totalPendientes + resultado.kpis.totalRechazados;
  resultado.kpis.tasaAprobacion = totalSolicitudes > 0 ? Math.round((resultado.kpis.totalAprobados / totalSolicitudes) * 100) : 0;

  var umbralFrecuente = admin_getUmbralFrecuente().umbral;
  for (var c in porCorreo) {
    var p = porCorreo[c];
    var tipoMasFrecuente = '', maxCount = 0;
    for (var t in p.porTipo) { if (p.porTipo[t] > maxCount) { maxCount = p.porTipo[t]; tipoMasFrecuente = t; } }
    resultado.porAnalista.push({
      correo: p.correo, nombre: p.nombre,
      aprobados: p.aprobados, pendientes: p.pendientes, rechazados: p.rechazados,
      diasTotales: p.diasTotales, tipoMasFrecuente: tipoMasFrecuente,
      esFrecuente: p.recientes30 >= umbralFrecuente
    });
  }
  return resultado;
}

// Historial completo (todas las filas, todos los estados) de un analista, para la
// "ficha de ausencias" del panel admin.
function admin_obtenerFichaAusenciasAnalista(correo) {
  verificarPermisoAdmin();
  correo = String(correo || '').trim().toLowerCase();
  var out = { correo: correo, nombre: '', registros: [], resumen: { aprobados: 0, pendientes: 0, rechazados: 0, diasTotales: 0 } };

  var hoja = _getHojaPermisos_();
  if (!correo || hoja.getLastRow() <= 1) return out;

  var data = hoja.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim().toLowerCase() !== correo) continue;
    var fi = _fmtFechaPI_(data[i][5]);
    var ff = _fmtFechaPI_(data[i][6]);
    var dias = _diasEntreFechasPI_(fi, ff);
    var estado = String(data[i][8] || 'PENDIENTE').toUpperCase().trim();

    out.nombre = String(data[i][3]).trim();
    out.registros.push({
      id: String(data[i][0]).trim(),
      fechaSolicitud: _fmtFechaPI_(data[i][1]),
      tipo: String(data[i][4]).trim(),
      fechaInicio: fi, fechaFin: ff, dias: dias,
      observacionAnalista: String(data[i][7] || '').trim(),
      estado: estado,
      observacionAdmin: String(data[i][11] || '').trim()
    });

    if (estado === 'APROBADO') { out.resumen.aprobados++; out.resumen.diasTotales += dias; }
    else if (estado === 'PENDIENTE') out.resumen.pendientes++;
    else out.resumen.rechazados++;
  }
  out.registros.sort(function(a, b) { return b.fechaSolicitud.localeCompare(a.fechaSolicitud); });
  return out;
}

// Conteo liviano de permisos APROBADOS con inicio en los últimos 30 días, para el
// badge de contexto en la pestaña Solicitudes (no recalcula el historial completo).
function admin_obtenerConteoPermisosRecientes(correos) {
  verificarPermisoAdmin();
  var mapa = {};
  var set = {};
  (correos || []).forEach(function(c) { set[String(c).trim().toLowerCase()] = true; });
  if (Object.keys(set).length === 0) return mapa;

  var hoja = _getHojaPermisos_();
  if (hoja.getLastRow() <= 1) return mapa;

  var data = hoja.getDataRange().getValues();
  var umbral30 = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), TIMEZONE, 'yyyy-MM-dd');

  for (var i = 1; i < data.length; i++) {
    var correo = String(data[i][2]).trim().toLowerCase();
    if (!set[correo]) continue;
    if (String(data[i][8]).toUpperCase().trim() !== 'APROBADO') continue;
    var fi = _fmtFechaPI_(data[i][5]);
    if (fi < umbral30) continue;
    mapa[correo] = (mapa[correo] || 0) + 1;
  }
  return mapa;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HORARIOS DE ASIGNACIÓN — Admin
// ═══════════════════════════════════════════════════════════════════════════════

function admin_getHorariosAsignacion() {
  verificarPermisoAdmin();
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('HORARIOS_ASIGNACION');
  if (raw) {
    try { return JSON.parse(raw); } catch(e) {}
  }
  return {
    lunes:     { activo: true,  inicio: '08:00', fin: '18:00' },
    martes:    { activo: true,  inicio: '08:00', fin: '18:00' },
    miercoles: { activo: true,  inicio: '08:00', fin: '18:00' },
    jueves:    { activo: true,  inicio: '08:00', fin: '18:00' },
    viernes:   { activo: true,  inicio: '08:00', fin: '18:00' },
    sabado:    { activo: false, inicio: '08:00', fin: '13:00' },
    domingo:   { activo: false, inicio: '08:00', fin: '13:00' }
  };
}

function admin_setHorariosAsignacion(horarios) {
  try {
    verificarPermisoAdmin();
    var props = PropertiesService.getScriptProperties();
    props.setProperty('HORARIOS_ASIGNACION', JSON.stringify(horarios));
    return { success: true, message: 'Horarios actualizados correctamente.' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ============================================================
// EQUIPOS — CRUD
// ============================================================

function _getHojaEquipos() {
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName("Equipos");
  if (!hoja) {
    hoja = ss.insertSheet("Equipos");
    hoja.getRange(1, 1, 1, 15).setValues([[
      "id", "nombre", "icono", "colorHex", "activo",
      "usarVipRotacion", "usarScoreCategories", "maxAsignarPorLlamada",
      "ordenPrioridad", "fuentesDatos", "modalTipo", "funcionGuardar",
      "canonDesde", "canonHasta", "canonTipos"
    ]]);
    hoja.getRange(1, 1, 1, 15).setFontWeight("bold");
  }
  return hoja;
}

function _getEquipos() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('EQUIPOS_CONFIG');
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  var hoja = _getHojaEquipos();
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) return [];

  var data = hoja.getRange(2, 1, lastRow - 1, 15).getValues();
  var equipos = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var id = String(row[0]).trim();
    if (!id) continue;

    var ordenPrioridad = [];
    try { ordenPrioridad = JSON.parse(row[8] || '[]'); } catch (e) {}
    var fuentesDatos = [];
    try { fuentesDatos = JSON.parse(row[9] || '[]'); } catch (e) {}

    equipos.push({
      id: id,
      nombre: String(row[1]).trim(),
      icono: String(row[2]).trim(),
      colorHex: String(row[3]).trim(),
      activo: String(row[4]).toUpperCase() === 'TRUE',
      usarVipRotacion: String(row[5]).toUpperCase() === 'TRUE',
      usarScoreCategories: String(row[6]).toUpperCase() === 'TRUE',
      maxAsignarPorLlamada: parseInt(row[7]) || 1,
      ordenPrioridad: ordenPrioridad,
      fuentesDatos: fuentesDatos,
      modalTipo: String(row[10]).trim(),
      funcionGuardar: String(row[11]).trim(),
      canonDesde: parseFloat(row[12]) || 0,
      canonHasta: parseFloat(row[13]) || 0,
      canonTipos: (function() { try { return JSON.parse(row[14] || '[]'); } catch(e) { return []; } })()
    });
  }

  try { cache.put('EQUIPOS_CONFIG', JSON.stringify(equipos), 21600); } catch (e) {}
  return equipos;
}

function _invalidarCacheEquipos() {
  try { CacheService.getScriptCache().remove('EQUIPOS_CONFIG'); } catch (e) {}
}

function admin_getEquipos() {
  verificarPermisoAdmin();
  return _getEquipos();
}

function admin_crearEquipo(datos) {
  verificarPermisoAdmin();
  var id = String(datos.id || '').trim().toUpperCase();
  if (!id) throw new Error("El ID del equipo es obligatorio.");
  if (!datos.nombre) throw new Error("El nombre del equipo es obligatorio.");

  var equiposExistentes = _getEquipos();
  if (equiposExistentes.some(function(e) { return e.id === id; })) {
    throw new Error("Ya existe un equipo con el ID: " + id);
  }

  var hoja = _getHojaEquipos();
  hoja.appendRow([
    id,
    String(datos.nombre).trim(),
    String(datos.icono || 'bi-people-fill').trim(),
    String(datos.colorHex || '#253150').trim(),
    datos.activo !== false ? 'TRUE' : 'FALSE',
    datos.usarVipRotacion ? 'TRUE' : 'FALSE',
    datos.usarScoreCategories ? 'TRUE' : 'FALSE',
    parseInt(datos.maxAsignarPorLlamada) || 1,
    JSON.stringify(datos.ordenPrioridad || []),
    JSON.stringify(datos.fuentesDatos || []),
    String(datos.modalTipo || 'DIGITAL_FULL').trim(),
    String(datos.funcionGuardar || 'guardarCambiosInternos').trim(),
    parseFloat(datos.canonDesde) || 0,
    parseFloat(datos.canonHasta) || 0,
    JSON.stringify(datos.canonTipos || [])
  ]);
  SpreadsheetApp.flush();
  _invalidarCacheEquipos();

  return { success: true, message: "Equipo '" + datos.nombre + "' creado correctamente." };
}

function admin_actualizarEquipo(equipoId, datos) {
  verificarPermisoAdmin();
  var hoja = _getHojaEquipos();
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) throw new Error("No hay equipos registrados.");

  var data = hoja.getRange(2, 1, lastRow - 1, 1).getValues();
  var filaIndex = -1;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === equipoId.toUpperCase()) {
      filaIndex = i + 2;
      break;
    }
  }
  if (filaIndex === -1) throw new Error("Equipo no encontrado: " + equipoId);

  hoja.getRange(filaIndex, 2, 1, 14).setValues([[
    String(datos.nombre).trim(),
    String(datos.icono || 'bi-people-fill').trim(),
    String(datos.colorHex || '#253150').trim(),
    datos.activo !== false ? 'TRUE' : 'FALSE',
    datos.usarVipRotacion ? 'TRUE' : 'FALSE',
    datos.usarScoreCategories ? 'TRUE' : 'FALSE',
    parseInt(datos.maxAsignarPorLlamada) || 1,
    JSON.stringify(datos.ordenPrioridad || []),
    JSON.stringify(datos.fuentesDatos || []),
    String(datos.modalTipo || 'DIGITAL_FULL').trim(),
    String(datos.funcionGuardar || 'guardarCambiosInternos').trim(),
    parseFloat(datos.canonDesde) || 0,
    parseFloat(datos.canonHasta) || 0,
    JSON.stringify(datos.canonTipos || [])
  ]]);
  SpreadsheetApp.flush();
  _invalidarCacheEquipos();

  return { success: true, message: "Equipo '" + datos.nombre + "' actualizado correctamente." };
}

function admin_eliminarEquipo(equipoId) {
  verificarPermisoAdmin();

  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hojaUsuarios = ss.getSheetByName("Usuarios");
  if (hojaUsuarios) {
    var dataU = hojaUsuarios.getDataRange().getValues();
    var mapeoInverso = { 'DIGITAL': 'ESTUDIO DIGITAL', 'BIOMETRIA': 'PENDIENTE_BIOMETRIA', 'REESTUDIOS': 'REESTUDIOS' };
    var espBuscada = mapeoInverso[equipoId.toUpperCase()] || equipoId.toUpperCase();
    for (var i = 1; i < dataU.length; i++) {
      if (String(dataU[i][4]).toUpperCase().trim() === espBuscada && String(dataU[i][5]).toUpperCase().trim() === 'ACTIVO') {
        throw new Error("No se puede eliminar: hay analistas activos asignados a este equipo.");
      }
    }
  }

  var hoja = _getHojaEquipos();
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) throw new Error("No hay equipos registrados.");

  var data = hoja.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var j = 0; j < data.length; j++) {
    if (String(data[j][0]).trim().toUpperCase() === equipoId.toUpperCase()) {
      hoja.deleteRow(j + 2);
      SpreadsheetApp.flush();
      _invalidarCacheEquipos();
      return { success: true, message: "Equipo eliminado correctamente." };
    }
  }
  throw new Error("Equipo no encontrado: " + equipoId);
}

// ============================================================
// HISTORICO_ESTADOS — Auto-reparación de registros huérfanos
// ============================================================

/**
 * Recorre Historico_Estados buscando registros EN CURSO cuyo estado no coincide
 * con el estado real en Usuarios. Los cierra y crea el registro correcto.
 * @param {Spreadsheet} ss - instancia abierta de TARGET_SOLICITUDES_SS_ID
 * @returns {Object.<string, number>} mapa correo → minutos en estado actual (solo registros válidos)
 */
function _repararHistoricoEstados(ss, datosUsuarios) {
  var ahora = new Date();
  var fechaHoraAhora = Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd HH:mm:ss");
  var fechaDiaHoy = Utilities.formatDate(ahora, TIMEZONE, "yyyy-MM-dd");

  var estadoRealPorCorreo = {};
  for (var u = 1; u < datosUsuarios.length; u++) {
    var correoU = String(datosUsuarios[u][2]).trim().toLowerCase();
    if (correoU) estadoRealPorCorreo[correoU] = String(datosUsuarios[u][5]).trim().toUpperCase();
  }

  var tiempoEstadoPorCorreo = {};
  try {
    var hojaHist = ss.getSheetByName("Historico_Estados");
    if (!hojaHist || hojaHist.getLastRow() <= 1) return tiempoEstadoPorCorreo;

    var lastRowH = hojaHist.getLastRow();
    // Solo revisar las últimas 500 filas — los EN CURSO siempre son recientes
    var rango = Math.min(lastRowH - 1, 500);
    var startRow = lastRowH - rango + 1;
    var dataHist = hojaHist.getRange(startRow, 1, rango, 5).getValues();
    var filasPorCorregir = [];

    for (var h = 0; h < dataHist.length; h++) {
      var correoH = String(dataHist[h][1]).trim().toLowerCase();
      var horaFin = String(dataHist[h][4]).trim();
      if (horaFin !== 'EN CURSO') continue;
      var estadoH = String(dataHist[h][2]).trim().toUpperCase();
      var inicioRaw = dataHist[h][3];
      if (!inicioRaw) continue;

      var estadoReal = estadoRealPorCorreo[correoH] || '';
      var inicioDate;
      try { inicioDate = inicioRaw instanceof Date ? inicioRaw : new Date(String(inicioRaw).replace(' ', 'T')); } catch (e) { continue; }
      if (isNaN(inicioDate.getTime())) continue;
      var minutosTranscurridos = Math.max(0, Math.round((ahora.getTime() - inicioDate.getTime()) / 60000));

      if (estadoH === estadoReal) {
        tiempoEstadoPorCorreo[correoH] = minutosTranscurridos;
      } else {
        filasPorCorregir.push({
          filaSheet: startRow + h,
          correo: correoH,
          estadoReal: estadoReal,
          duracion: minutosTranscurridos
        });
      }
    }

    if (filasPorCorregir.length > 0) {
      for (var f = 0; f < filasPorCorregir.length; f++) {
        var fix = filasPorCorregir[f];
        hojaHist.getRange(fix.filaSheet, 5).setValue(fechaHoraAhora + ' [AUTO]');
        hojaHist.getRange(fix.filaSheet, 6).setValue(fix.duracion);
        if (fix.estadoReal) {
          hojaHist.appendRow([fechaDiaHoy, fix.correo, fix.estadoReal, fechaHoraAhora, 'EN CURSO', 0]);
        }
      }
      SpreadsheetApp.flush();
      Logger.log('Auto-reparó ' + filasPorCorregir.length + ' registro(s) huérfano(s) en Historico_Estados.');
    }
  } catch (e) {
    Logger.log('Error en _repararHistoricoEstados: ' + e.message);
  }

  return tiempoEstadoPorCorreo;
}

// ============================================================
// EQUIPOS — Gestión de miembros (Kanban)
// ============================================================

function _especialidadParaEquipo(equipoId) {
  var mapeo = { 'DIGITAL': 'ESTUDIO DIGITAL', 'BIOMETRIA': 'PENDIENTE_BIOMETRIA', 'REESTUDIOS': 'REESTUDIOS' };
  return mapeo[equipoId.toUpperCase()] || equipoId.toUpperCase();
}

function _equipoIdDesdeEspecialidad(esp) {
  esp = String(esp).toUpperCase().trim();
  var mapeo = { 'ESTUDIO DIGITAL': 'DIGITAL', 'ESTUDIO_DIGITAL': 'DIGITAL', 'PENDIENTE_BIOMETRIA': 'BIOMETRIA', 'BIOMETRIA': 'BIOMETRIA', 'REESTUDIOS': 'REESTUDIOS' };
  return mapeo[esp] || esp;
}

function admin_getEquiposMiembros() {
  verificarPermisoAdmin();
  var equipos = _getEquipos();
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hojaUser = ss.getSheetByName("Usuarios");
  var datosUser = hojaUser.getDataRange().getValues();

  var tiempoEstadoPorCorreo = _repararHistoricoEstados(ss, datosUser);

  var equipoIds = {};
  equipos.forEach(function(eq) { equipoIds[eq.id] = true; });

  var miembrosPorEquipo = {};
  equipos.forEach(function(eq) { miembrosPorEquipo[eq.id] = []; });
  var sinEquipo = [];

  for (var k = 1; k < datosUser.length; k++) {
    var nombre = String(datosUser[k][1]).trim();
    var correo = String(datosUser[k][2]).trim().toLowerCase();
    var especialidad = String(datosUser[k][4]).trim();
    var estado = String(datosUser[k][5]).trim();
    if (!correo) continue;

    var analista = {
      nombre: nombre,
      correo: correo,
      especialidad: especialidad,
      estado: estado,
      tiempoEnEstado: tiempoEstadoPorCorreo[correo] || 0
    };

    var eqId = _equipoIdDesdeEspecialidad(especialidad);
    if (equipoIds[eqId]) {
      miembrosPorEquipo[eqId].push(analista);
    } else {
      sinEquipo.push(analista);
    }
  }

  var resultado = equipos.filter(function(eq) { return eq.activo; }).map(function(eq) {
    return {
      id: eq.id,
      nombre: eq.nombre,
      icono: eq.icono,
      colorHex: eq.colorHex,
      miembros: miembrosPorEquipo[eq.id] || []
    };
  });

  return { equipos: resultado, sinEquipo: sinEquipo };
}

function admin_moverAnalistasEquipo(correos, nuevoEquipoId) {
  verificarPermisoAdmin();
  if (!correos || correos.length === 0) return { success: false, message: "No se seleccionaron analistas." };

  var equipos = _getEquipos();
  var equipoDestino = equipos.find(function(e) { return e.id === nuevoEquipoId; });
  if (!equipoDestino && nuevoEquipoId !== '__SIN_EQUIPO__') {
    return { success: false, message: "Equipo destino no encontrado: " + nuevoEquipoId };
  }

  var nuevaEspecialidad = nuevoEquipoId === '__SIN_EQUIPO__' ? '' : _especialidadParaEquipo(nuevoEquipoId);

  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName("Usuarios");
  var data = hoja.getDataRange().getValues();
  var correosSet = {};
  correos.forEach(function(c) { correosSet[c.toLowerCase().trim()] = true; });

  var movidos = 0;
  for (var i = 1; i < data.length; i++) {
    var email = String(data[i][2]).toLowerCase().trim();
    if (correosSet[email]) {
      hoja.getRange(i + 1, 5).setValue(nuevaEspecialidad);
      movidos++;
    }
  }

  SpreadsheetApp.flush();
  var destNombre = equipoDestino ? equipoDestino.nombre : 'Sin equipo';
  return { success: true, message: movidos + " analista(s) movido(s) a " + destNombre + "." };
}

// ============================================================
// TIPOS DE SOLICITUD — CRUD
// ============================================================

function _getHojaTiposSolicitud() {
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName("TiposSolicitud");
  // Orden crítico: específicos primero, generales al final (igual que el Motor)
  // Principales: desaplazamiento → induccion → digital (catch-all)
  // Reestudios:  biometriaFallida → nuevaUar → deudorUar → reestudio (catch-all)
  var TIPOS_ORDEN = [
    ["desaplazamiento", "Desaplazamiento", "bi-fingerprint", "#8b0a0e", '{"campo":"estadoGeneral","condicion":"equals","valor":"APROBADO_PENDIENTE_BIOMETRIA"}', "TRUE"],
    ["induccion", "Inducción", "bi-mortarboard", "#0d6efd", '{"campo":"clase","condicion":"equals","valor":"INDUCCION"}', "TRUE"],
    ["digital", "Digital", "bi-laptop", "#253150", '{"campo":"estadoGeneral","condicion":"equals","valor":"EN_ESTUDIO"}', "TRUE"],
    ["biometriaFallida", "Biometría Fallida", "bi-exclamation-triangle", "#dc3545", '{"campo":"tipoProceso","condicion":"includes","valor":"Biometria Fallida"}', "TRUE"],
    ["nuevaUar", "Nueva UAR", "bi-envelope-plus", "#6f42c1", '{"campo":"origen","condicion":"equals","valor":"CORREO","campo2":"tipoProceso","condicion2":"equals","valor2":"NUEVA"}', "TRUE"],
    ["deudorUar", "Deudor UAR", "bi-person-plus", "#fd7e14", '{"campo":"origen","condicion":"equals","valor":"CORREO","campo2":"tipoProceso","condicion2":"equals","valor2":"ADICIONAL"}', "TRUE"],
    ["reestudio", "Reestudios", "bi-arrow-repeat", "#198754", '{"campo":"tipoProceso","condicion":"equals","valor":"Reestudio"}', "TRUE"]
  ];

  if (!hoja) {
    hoja = ss.insertSheet("TiposSolicitud");
    hoja.getRange(1, 1, 1, 6).setValues([["id", "label", "icono", "colorBadge", "reglasDeteccion", "activo"]]);
    hoja.getRange(1, 1, 1, 6).setFontWeight("bold");
    hoja.getRange(2, 1, TIPOS_ORDEN.length, 6).setValues(TIPOS_ORDEN);
    SpreadsheetApp.flush();
  } else {
    // Reconstruir la hoja con el orden correcto, preservando personalizaciones del admin
    var lastRow = hoja.getLastRow();
    var existentes = {};
    if (lastRow >= 2) {
      var data = hoja.getRange(2, 1, lastRow - 1, 6).getValues();
      for (var i = 0; i < data.length; i++) {
        var id = String(data[i][0]).trim();
        if (id.toLowerCase() === 'nueva') id = 'digital';
        existentes[id] = data[i];
      }
    }
    var filas = [];
    for (var t = 0; t < TIPOS_ORDEN.length; t++) {
      var tipoId = TIPOS_ORDEN[t][0];
      if (existentes[tipoId]) {
        var fila = existentes[tipoId].slice();
        fila[0] = tipoId;
        var reglasRaw = String(fila[4] || '').trim();
        if (reglasRaw === '' || reglasRaw === '{}') fila[4] = TIPOS_ORDEN[t][4];
        if (String(fila[5]).trim() === '') fila[5] = 'TRUE';
        filas.push(fila);
        delete existentes[tipoId];
      } else {
        filas.push(TIPOS_ORDEN[t]);
      }
    }
    // Tipos custom del admin que no están en TIPOS_ORDEN
    for (var customId in existentes) {
      if (existentes.hasOwnProperty(customId) && customId) filas.push(existentes[customId]);
    }
    // Reescribir
    if (lastRow > 1) hoja.getRange(2, 1, lastRow - 1, 6).clearContent();
    hoja.getRange(2, 1, filas.length, 6).setValues(filas);
    SpreadsheetApp.flush();
  }
  return hoja;
}

function _getTiposSolicitud() {
  var hoja = _getHojaTiposSolicitud();
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) return [];

  var data = hoja.getRange(2, 1, lastRow - 1, 6).getValues();
  var tipos = [];
  for (var i = 0; i < data.length; i++) {
    var id = String(data[i][0]).trim();
    if (!id) continue;
    var reglas = {};
    try { reglas = JSON.parse(data[i][4] || '{}'); } catch (e) {}
    tipos.push({
      id: id,
      label: String(data[i][1]).trim(),
      icono: String(data[i][2]).trim(),
      colorBadge: String(data[i][3]).trim(),
      reglasDeteccion: reglas,
      activo: String(data[i][5]).toUpperCase() === 'TRUE'
    });
  }
  return tipos;
}

function admin_getTiposSolicitud() {
  verificarPermisoAdmin();
  return _getTiposSolicitud();
}

function admin_guardarTipoSolicitud(datos) {
  verificarPermisoAdmin();
  var id = String(datos.id || '').trim().toLowerCase();
  if (!id) throw new Error("El ID del tipo es obligatorio.");

  var hoja = _getHojaTiposSolicitud();
  var lastRow = hoja.getLastRow();
  var filaExistente = -1;

  if (lastRow >= 2) {
    var ids = hoja.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim().toLowerCase() === id) {
        filaExistente = i + 2;
        break;
      }
    }
  }

  var fila = [
    id,
    String(datos.label || id).trim(),
    String(datos.icono || 'bi-tag').trim(),
    String(datos.colorBadge || '#6c757d').trim(),
    JSON.stringify(datos.reglasDeteccion || {}),
    datos.activo !== false ? 'TRUE' : 'FALSE'
  ];

  if (filaExistente > 0) {
    hoja.getRange(filaExistente, 1, 1, 6).setValues([fila]);
  } else {
    hoja.appendRow(fila);
  }
  SpreadsheetApp.flush();
  return { success: true, message: "Tipo '" + datos.label + "' guardado correctamente." };
}

function admin_eliminarTipoSolicitud(id) {
  verificarPermisoAdmin();
  var hoja = _getHojaTiposSolicitud();
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) throw new Error("No hay tipos registrados.");

  var ids = hoja.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim().toLowerCase() === id.toLowerCase()) {
      hoja.deleteRow(i + 2);
      SpreadsheetApp.flush();
      return { success: true, message: "Tipo eliminado correctamente." };
    }
  }
  throw new Error("Tipo no encontrado: " + id);
}

// ============================================================
// MOTIVOS DE APLAZAMIENTO — CRUD
// ============================================================

function _getHojaMotivos(tipo) {
  var nombreHoja = tipo === 'negacion' ? 'MotivosNegacion' : 'MotivosAplazamiento';
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) {
    hoja = ss.insertSheet(nombreHoja);
    hoja.getRange(1, 1, 1, 4).setValues([["id", "motivo", "activo", "orden"]]);
    hoja.getRange(1, 1, 1, 4).setFontWeight("bold");

    var semillas = [];
    if (tipo === 'aplazamiento') {
      semillas = [
        "Acta de constitución consorcio", "Acta de junta de socios", "Actualización de resultado",
        "Cámara de comercio", "Cerrada por intentos fallidos", "Certificado laboral",
        "Confirmar solicitud simultánea", "Documento de identidad legible", "Dos deudores solidarios",
        "Error de terceros", "Estados financieros", "Extractos bancarios",
        "Formulario con firma y huella legible", "Partida presupuestal", "Pendiente aceptación LMI",
        "Pendiente biometría", "Pendiente confirmar destino", "Pendiente constitución CDT",
        "Pendiente deudor y documentos", "Pendiente entrevista telefónica", "Pendiente recaudo",
        "Pendiente respuesta ELI", "Pendiente resultado lote", "Pendiente simasol",
        "Pendiente validación de datos", "Presentar constituyentes del consorcio", "Un deudor solidario"
      ];
    } else {
      semillas = [
        "Alerta de suplantación", "Anteriores negadas inconsistencias", "Contrato firmado en traslados",
        "Cuentas embargadas", "Desistimiento", "Destino no asegurable",
        "Deudor de profesión", "Empresa recién constituida", "Evidente no aprobado",
        "Inconsistencias en validación", "Inducción sin garantías", "Ingresos insuficientes",
        "Modelo rechaza, causal diferente", "Mora libertador", "Patrimonio en negativo/pérdidas",
        "Póliza no asegurable", "Reportes en centrales de riesgo", "Solicitud duplicada",
        "Traslado no solicitado"
      ];
    }

    var filas = [];
    for (var i = 0; i < semillas.length; i++) {
      filas.push([i + 1, semillas[i], "TRUE", i + 1]);
    }
    if (filas.length > 0) {
      hoja.getRange(2, 1, filas.length, 4).setValues(filas);
    }
  }
  return hoja;
}

function _getMotivos(tipo) {
  var hoja = _getHojaMotivos(tipo);
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) return [];

  var data = hoja.getRange(2, 1, lastRow - 1, 4).getValues();
  var motivos = [];
  for (var i = 0; i < data.length; i++) {
    var motivo = String(data[i][1]).trim();
    if (!motivo) continue;
    motivos.push({
      id: parseInt(data[i][0]) || (i + 1),
      motivo: motivo,
      activo: String(data[i][2]).toUpperCase() === 'TRUE',
      orden: parseInt(data[i][3]) || (i + 1)
    });
  }
  motivos.sort(function(a, b) { return a.orden - b.orden; });
  return motivos;
}

function getMotivosAplazamiento() {
  return _getMotivos('aplazamiento').filter(function(m) { return m.activo; });
}

function getMotivosNegacion() {
  return _getMotivos('negacion').filter(function(m) { return m.activo; });
}

function admin_getMotivosAplazamiento() {
  verificarPermisoAdmin();
  return _getMotivos('aplazamiento');
}

function admin_getMotivosNegacion() {
  verificarPermisoAdmin();
  return _getMotivos('negacion');
}

function admin_guardarMotivo(tipo, datos) {
  verificarPermisoAdmin();
  if (!datos.motivo || !String(datos.motivo).trim()) throw new Error("El texto del motivo es obligatorio.");

  var hoja = _getHojaMotivos(tipo);
  var lastRow = hoja.getLastRow();
  var filaExistente = -1;
  var maxId = 0;
  var maxOrden = 0;

  if (lastRow >= 2) {
    var dataExist = hoja.getRange(2, 1, lastRow - 1, 4).getValues();
    for (var i = 0; i < dataExist.length; i++) {
      var idActual = parseInt(dataExist[i][0]) || 0;
      var ordenActual = parseInt(dataExist[i][3]) || 0;
      if (idActual > maxId) maxId = idActual;
      if (ordenActual > maxOrden) maxOrden = ordenActual;
      if (datos.id && idActual === parseInt(datos.id)) {
        filaExistente = i + 2;
      }
    }
  }

  var id = datos.id ? parseInt(datos.id) : (maxId + 1);
  var orden = datos.orden ? parseInt(datos.orden) : (maxOrden + 1);
  var fila = [id, String(datos.motivo).trim(), datos.activo !== false ? 'TRUE' : 'FALSE', orden];

  if (filaExistente > 0) {
    hoja.getRange(filaExistente, 1, 1, 4).setValues([fila]);
  } else {
    hoja.appendRow(fila);
  }
  SpreadsheetApp.flush();
  return { success: true, message: "Motivo guardado correctamente." };
}

function admin_guardarMotivoAplazamiento(datos) {
  return admin_guardarMotivo('aplazamiento', datos);
}

function admin_guardarMotivoNegacion(datos) {
  return admin_guardarMotivo('negacion', datos);
}

function admin_eliminarMotivo(tipo, id) {
  verificarPermisoAdmin();
  var hoja = _getHojaMotivos(tipo);
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) throw new Error("No hay motivos registrados.");

  var ids = hoja.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (parseInt(ids[i][0]) === parseInt(id)) {
      hoja.deleteRow(i + 2);
      SpreadsheetApp.flush();
      return { success: true, message: "Motivo eliminado correctamente." };
    }
  }
  throw new Error("Motivo no encontrado.");
}

function admin_eliminarMotivoAplazamiento(id) {
  return admin_eliminarMotivo('aplazamiento', id);
}

function admin_eliminarMotivoNegacion(id) {
  return admin_eliminarMotivo('negacion', id);
}

// ============================================================
// CATEGORÍAS SCORE — Lectura y gestión
// ============================================================

function admin_getCategoriasScore() {
  verificarPermisoAdmin();
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName("score");
  if (!hoja) return { categorias: [], polizas: [] };

  var data = hoja.getDataRange().getDisplayValues();
  var categoriasMap = {};
  var polizas = [];

  for (var i = 1; i < data.length; i++) {
    var poliza = String(data[i][0]).trim();
    var categoria = String(data[i][1] || data[i][2] || '').trim();
    if (!poliza) continue;

    if (categoria) {
      var catKey = categoria.toLowerCase();
      if (!categoriasMap[catKey]) {
        categoriasMap[catKey] = { nombre: categoria, cantidad: 0 };
      }
      categoriasMap[catKey].cantidad++;
    }
    polizas.push({ poliza: poliza, categoria: categoria, fila: i + 1 });
  }

  var categorias = [];
  for (var key in categoriasMap) {
    categorias.push(categoriasMap[key]);
  }
  categorias.sort(function(a, b) { return b.cantidad - a.cantidad; });

  return { categorias: categorias, totalPolizas: polizas.length };
}

function admin_buscarPolizaScore(polizaBuscada) {
  verificarPermisoAdmin();
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName("score");
  if (!hoja) return [];

  var data = hoja.getDataRange().getDisplayValues();
  var resultados = [];
  var busqueda = String(polizaBuscada).trim().toLowerCase();

  for (var i = 1; i < data.length; i++) {
    var poliza = String(data[i][0]).trim();
    if (poliza.toLowerCase().includes(busqueda)) {
      resultados.push({
        poliza: poliza,
        categoria: String(data[i][1] || data[i][2] || '').trim(),
        fila: i + 1
      });
    }
    if (resultados.length >= 20) break;
  }
  return resultados;
}

function admin_actualizarCategoriaPoliza(fila, nuevaCategoria) {
  verificarPermisoAdmin();
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName("score");
  if (!hoja) throw new Error("Hoja score no encontrada.");

  hoja.getRange(fila, 2).setValue(String(nuevaCategoria).trim());
  SpreadsheetApp.flush();
  return { success: true, message: "Categoría actualizada correctamente." };
}

// ============================================================
// FESTIVOS — CRUD
// ============================================================

function admin_getFestivos() {
  verificarPermisoAdmin();
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName('Festivos');
  if (!hoja) return { success: true, festivos: [] };
  var lastRow = hoja.getLastRow();
  if (lastRow < 1) return { success: true, festivos: [] };
  var data = hoja.getDataRange().getValues();
  var festivos = [];
  for (var i = 0; i < data.length; i++) {
    var val = data[i][0];
    var desc = String(data[i][1] || '').trim();
    var fechaStr = '';
    if (val instanceof Date && !isNaN(val.getTime())) {
      fechaStr = Utilities.formatDate(val, TIMEZONE, 'yyyy-MM-dd');
    } else if (val) {
      fechaStr = String(val).trim();
    }
    if (!fechaStr) continue;
    festivos.push({ fila: i + 1, fecha: fechaStr, descripcion: desc });
  }
  festivos.sort(function(a, b) { return a.fecha.localeCompare(b.fecha); });
  return { success: true, festivos: festivos };
}

function admin_agregarFestivo(fecha, descripcion) {
  verificarPermisoAdmin();
  if (!fecha) return { success: false, message: 'Fecha requerida.' };
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName('Festivos');
  if (!hoja) {
    hoja = ss.insertSheet('Festivos');
  }
  var fechaObj = new Date(fecha + 'T12:00:00');
  if (isNaN(fechaObj.getTime())) return { success: false, message: 'Fecha inválida.' };
  hoja.appendRow([fechaObj, descripcion || '']);
  hoja.getRange(hoja.getLastRow(), 1).setNumberFormat('yyyy-MM-dd');
  SpreadsheetApp.flush();
  return { success: true, message: 'Festivo agregado: ' + fecha };
}

function admin_eliminarFestivo(fila) {
  verificarPermisoAdmin();
  var ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  var hoja = ss.getSheetByName('Festivos');
  if (!hoja) return { success: false, message: 'Hoja Festivos no encontrada.' };
  if (fila < 1 || fila > hoja.getLastRow()) return { success: false, message: 'Fila inválida.' };
  hoja.deleteRow(fila);
  SpreadsheetApp.flush();
  return { success: true, message: 'Festivo eliminado.' };
}

function admin_verificarDesaplazamientos() {
  try {
    verificarPermisoAdmin();
    return verificarAprobacionDesaplazamientos();
  } catch (e) {
    return { success: false, message: e.message || e.toString() };
  }
}
