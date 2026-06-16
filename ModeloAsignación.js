const MAX_VIP_CONSECUTIVAS = 2;
const CATEGORIAS_ROTACION = ['mediana', 'grande', 'pequena', 'gen', 'dev', 'rev', 'otros'];

const ORDEN_PRIORIDAD_POR_MODO = {
  NUEVAS_PRIMERO:    ['nueva', 'biometria', 'induccion', 'reestudio', 'nuevaUar', 'deudorUar'],
  BIOMETRIA_PRIMERO: ['biometria', 'nueva', 'induccion', 'reestudio', 'nuevaUar', 'deudorUar'],
  INDUCCION_PRIMERO: ['induccion', 'nueva', 'biometria', 'reestudio', 'nuevaUar', 'deudorUar'],
};

// Para analistas del equipo REESTUDIOS, los casos propios (ORIGEN) siempre van primero
const ORDEN_PRIORIDAD_REESTUDIOS = ['reestudio', 'nuevaUar', 'deudorUar', 'nueva', 'biometria', 'induccion'];

const ID_HOJA_REESTUDIOS_API = '1slgykTgjoAtCd6KmlG7Lqiuw-nM1hSguQbi0XqeLu7U';

function RequestLead() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return "Sistema ocupado. Otro compañero está recibiendo casos. Intenta en unos segundos.";
  }

  try {
    const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
    const solicitudesSheet = ss.getSheetByName("solicitud");
    const usuariosSheet = ss.getSheetByName("Usuarios");
    const scoreSheet = ss.getSheetByName("score");
    
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS_API);
    const reestudiosSheet = ssReestudios.getSheetByName('ORIGEN');

    if (!solicitudesSheet || !usuariosSheet || !scoreSheet || !reestudiosSheet) {
      throw new Error("Una o más hojas requeridas no existen en las Bases de Datos.");
    }

    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const dataUsuarios = usuariosSheet.getDataRange().getDisplayValues();
    const usuarioInfo  = dataUsuarios.find(u => u[2].trim().toLowerCase() === userEmail);
    if (!usuarioInfo) return "❌ Usuario no registrado en el sistema.";

    const nombreUsuario = usuarioInfo[1];
    const especialidad  = usuarioInfo[4];
    const estadoUsuario = usuarioInfo[5].toString().trim().toUpperCase();
    const capTotal      = parseInt(usuarioInfo[6]) || 0;

    if (estadoUsuario !== "ACTIVO") return "❌ Tu usuario no está Activo.";

    // Determinar equipo según especialidad para leer cupos correctos
    let equipoCupos = 'DIGITAL';
    if (especialidad.toUpperCase().includes("REESTUDIO")) equipoCupos = 'REESTUDIOS';
    else if (especialidad.toUpperCase().includes("BIOMETRIA")) equipoCupos = 'BIOMETRIA';

    const props = PropertiesService.getScriptProperties();

    const cuotas = obtenerCuposEfectivos(userEmail, equipoCupos, dataUsuarios);

    const hoy = new Date();
    const d = String(hoy.getDate()).padStart(2, '0');
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const y = hoy.getFullYear();
    const d_s = hoy.getDate();
    const m_s = hoy.getMonth() + 1;

    const hoyFmt1 = `${d}/${m}/${y}`;          // DD/MM/YYYY  (Colombia con padding)
    const hoyFmt2 = `${y}-${m}-${d}`;          // YYYY-MM-DD  (ISO)
    const hoyFmt3 = `${d_s}/${m_s}/${y}`;      // D/M/YYYY    (Colombia sin padding)
    const hoyFmt4 = `${m_s}/${d_s}/${y}`;      // M/D/YYYY    (US sin padding)
    const hoyFmt5 = `${m}/${d}/${y}`;          // MM/DD/YYYY  (US con padding)

    function cumpleHoy(val) {
      if (!val) return false;
      // Comparaci\u00f3n exacta cuando se leen con getValues() \u2014 sin ambig\u00fcedad de formato
      if (val instanceof Date) {
        return val.getFullYear() === y && val.getMonth() === (m_s - 1) && val.getDate() === d_s;
      }
      const texto = String(val);
      return texto.includes(hoyFmt1) || texto.includes(hoyFmt2) || texto.includes(hoyFmt3)
          || texto.includes(hoyFmt4) || texto.includes(hoyFmt5);
    }

    let conteoHoy = { nueva: 0, biometria: 0, induccion: 0, nuevaUar: 0, deudorUar: 0, reestudio: 0 };
    let capPendienteReal = 0;

    // getValues() en lugar de getDisplayValues() para obtener Date reales en col 27/29
    const dataSolicitudes = solicitudesSheet.getRange("A1:AL" + solicitudesSheet.getLastRow()).getValues();
    for (let i = 1; i < dataSolicitudes.length; i++) {
      const row = dataSolicitudes[i];
      const asignado = String(row[27]).trim().toLowerCase();

      if (asignado === userEmail) {
        const fechaAsig = row[26];
        const fechaFin  = row[28];
        const claseNorm = String(row[20]).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const estadoNorm = String(row[16]).trim().toUpperCase();

        let tipo = 'nueva';
        if (estadoNorm.includes("BIOMETRIA") || claseNorm.includes("BIOMETRIA")) tipo = 'biometria';
        else if (claseNorm.includes("INDUCCI") || claseNorm === "IND") tipo = 'induccion';

        if (cumpleHoy(fechaAsig) || cumpleHoy(fechaFin)) {
          conteoHoy[tipo]++;
        }
        const tieneAsig = fechaAsig instanceof Date || String(fechaAsig).trim() !== "";
        const tieneFin  = fechaFin  instanceof Date || String(fechaFin).trim()  !== "";
        if (tieneAsig && !tieneFin) capPendienteReal++;
      }
    }

    // Contar desde Historico_Gestiones (casos digitales movidos al asignar)
    try {
      const hojaHistD = ss.getSheetByName("Historico_Gestiones");
      if (hojaHistD && hojaHistD.getLastRow() > 1) {
        const dataHistD = hojaHistD.getRange(2, 1, hojaHistD.getLastRow() - 1, 37).getValues();
        for (let i = 0; i < dataHistD.length; i++) {
          const row = dataHistD[i];
          const asignado = String(row[25]).trim().toLowerCase(); // hist col 26: asignacion
          if (asignado !== userEmail) continue;
          const fechaAsig = row[24]; // hist col 25: fecha asignación
          const fechaFin  = row[26]; // hist col 27: fecha fin gestión
          const claseNorm  = String(row[20]).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
          const estadoNorm = String(row[16]).trim().toUpperCase();
          let tipo = 'nueva';
          if (estadoNorm.includes("BIOMETRIA") || claseNorm.includes("BIOMETRIA")) tipo = 'biometria';
          else if (claseNorm.includes("INDUCCI") || claseNorm === "IND") tipo = 'induccion';
          if (cumpleHoy(fechaAsig) || cumpleHoy(fechaFin)) conteoHoy[tipo]++;
          const tieneAsig = fechaAsig instanceof Date || String(fechaAsig).trim() !== "";
          const tieneFin  = fechaFin  instanceof Date || String(fechaFin).trim()  !== "";
          if (tieneAsig && !tieneFin) capPendienteReal++;
        }
      }
    } catch(eH) { Logger.log("RequestLead Hist digital count: " + eH.message); }

    // getValues() para obtener Date reales en cols I (fechaAsig) y J (fechaFin) de ORIGEN
    const dataReestudios = reestudiosSheet.getDataRange().getValues();
    for (let i = 1; i < dataReestudios.length; i++) {
      const row = dataReestudios[i];
      const asignado = String(row[6]).trim().toLowerCase();

      if (asignado === userEmail) {
        const origenR = String(row[3]).toUpperCase().trim();
        const tipoP  = String(row[4]).toUpperCase().trim();
        const fechaAsig = row[8];
        const fechaFin  = row[9];

        let tipo = 'reestudio';
        if (origenR === "CORREO" && tipoP === "NUEVA") tipo = 'nuevaUar';
        else if (origenR === "CORREO" && tipoP === "ADICIONAL") tipo = 'deudorUar';

        if (cumpleHoy(fechaAsig) || cumpleHoy(fechaFin)) {
          conteoHoy[tipo]++;
        }
        const tieneAsigR = fechaAsig instanceof Date ? true : String(fechaAsig).trim() !== "";
        const tieneFinR  = fechaFin  instanceof Date ? true : String(fechaFin).trim()  !== "";
        if (tieneAsigR && !tieneFinR) capPendienteReal++;
      }
    }

    // Contar desde Historico_Gestiones de reestudios (casos movidos al asignar)
    try {
      const hojaHistR = ssReestudios.getSheetByName("Historico_Gestiones");
      if (hojaHistR && hojaHistR.getLastRow() > 1) {
        const dataHistR = hojaHistR.getRange(2, 1, hojaHistR.getLastRow() - 1, 14).getValues();
        for (let i = 0; i < dataHistR.length; i++) {
          const row = dataHistR[i];
          const asignado = String(row[6]).trim().toLowerCase();
          if (asignado !== userEmail) continue;
          const origenR = String(row[3]).toUpperCase().trim();
          const tipoP  = String(row[4]).toUpperCase().trim();
          const fechaAsig = row[8];
          const fechaFin  = row[9];
          let tipo = 'reestudio';
          if (origenR === "CORREO" && tipoP === "NUEVA") tipo = 'nuevaUar';
          else if (origenR === "CORREO" && tipoP === "ADICIONAL") tipo = 'deudorUar';
          if (cumpleHoy(fechaAsig) || cumpleHoy(fechaFin)) conteoHoy[tipo]++;
          const tieneAsigR = fechaAsig instanceof Date ? true : String(fechaAsig).trim() !== "";
          const tieneFinR  = fechaFin  instanceof Date ? true : String(fechaFin).trim()  !== "";
          if (tieneAsigR && !tieneFinR) capPendienteReal++;
        }
      }
    } catch(eH) { Logger.log("RequestLead Hist reestudios count: " + eH.message); }

    Logger.log(`Analista: ${userEmail} | Límite Cupos Digital: ${JSON.stringify(cuotas)} | Realizado/Asignado Hoy: ${JSON.stringify(conteoHoy)}`);

    const capacidadDisponible = capTotal - capPendienteReal;
    if (capacidadDisponible < 1) return "No tienes capacidad disponible. Termina casos pendientes primero.";

    let pendientes = [];

    for (let i = 1; i < dataSolicitudes.length; i++) {
      const row = dataSolicitudes[i];
      const asignado = String(row[27]).trim();
      const estadoNorm = String(row[16]).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const claseNorm  = String(row[20]).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      if (asignado !== "") continue; 
      if (estadoNorm === "") continue;
      
      const esBiometria = estadoNorm.includes("BIOMETRIA") || claseNorm.includes("BIOMETRIA");
      if ((estadoNorm.includes("APROB") && !esBiometria) || estadoNorm.includes("NEGAD") || estadoNorm.includes("RECHAZ") || estadoNorm.includes("APLAZ")) continue;

      const esInduccion = claseNorm.includes("INDUCCI") || claseNorm === "IND";
      const esNueva = claseNorm.includes("NUEV") || claseNorm.includes("REESTUDIO") || estadoNorm.includes("EN_ESTUDIO") || estadoNorm.includes("EN ESTUDIO") || estadoNorm.includes("BORRADOR");
      
      if (!esNueva && !esBiometria && !esInduccion) continue;

      let tipo = 'nueva';
      if (esBiometria) tipo = 'biometria';
      else if (esInduccion) tipo = 'induccion';

      if (conteoHoy[tipo] >= cuotas[tipo]) continue;

      const reasignada = String(row[35]).trim().toUpperCase() === "REASIGNADA";
      const esCRM = String(row[36] || "").toLowerCase().trim().startsWith("crm");

      pendientes.push({
        base: 'PRINCIPAL',
        rowIndex: i + 1,
        rowData: row,
        tipo: tipo,
        reasignada: reasignada,
        esCRM: esCRM,
        polizaKey: normalizarClave(row[1]),
        fechaOrd: parseDateCustom(row[17])
      });
    }

    for (let i = 1; i < dataReestudios.length; i++) {
      const row = dataReestudios[i];
      const asignado = String(row[6]).trim(); 
      const estadoGest = String(row[10]).trim(); 
      
      if (asignado !== "") continue; 
      if (estadoGest !== "") continue; 
      
      const origenR = String(row[3]).toUpperCase().trim();
      const tipoP = String(row[4]).toUpperCase().trim();

      let tipo = 'reestudio';
      if (origenR === "CORREO" && tipoP === "NUEVA") tipo = 'nuevaUar';
      else if (origenR === "CORREO" && tipoP === "ADICIONAL") tipo = 'deudorUar';

      if (conteoHoy[tipo] >= cuotas[tipo]) continue;

      pendientes.push({
        base: 'REESTUDIOS',
        rowIndex: i + 1,
        rowData: row,
        tipo: tipo,
        reasignada: false, 
        esCRM: false,
        polizaKey: normalizarClave(row[1] || row[3]), 
        fechaOrd: parseDateCustom(row[0]) 
      });
    }

    const _etiquetasTipo = { nueva: 'Nuevas', biometria: 'Biometría', induccion: 'Inducción', reestudio: 'Reestudios', nuevaUar: 'Nueva UAR', deudorUar: 'Deudor UAR' };
    const cuposLlenosHoy = Object.entries(cuotas)
      .filter(([tipo, lim]) => lim > 0 && conteoHoy[tipo] >= lim)
      .map(([tipo]) => `${_etiquetasTipo[tipo]} (${conteoHoy[tipo]}/${cuotas[tipo]})`);

    if (pendientes.length === 0) {
      if (cuposLlenosHoy.length > 0) {
        return `⚠️ Sin casos disponibles. Cupos del día completados: ${cuposLlenosHoy.join(', ')}.`;
      }
      return "⚠️ No hay casos en bandeja para tus subcategorías disponibles.";
    }

    const dataScore = scoreSheet.getDataRange().getDisplayValues();
    const buckets = { vip: new Set(), grande: new Set(), mediana: new Set(), pequena: new Set(), gen: new Set(), dev: new Set(), rev: new Set(), otros: new Set() };

    for (let i = 1; i < dataScore.length; i++) {
      const key = normalizarClave(dataScore[i][0]);
      if (!key || key === "0") continue;
      const cat = dataScore[i][1].toString().toLowerCase().trim();
      if(cat.includes("vip")) buckets.vip.add(key);
      else if (cat.includes("grande")) buckets.grande.add(key);
      else if (cat.includes("mediana")) buckets.mediana.add(key);
      else if (cat.includes("peque")) buckets.pequena.add(key);
      else if (cat.includes("generica")) buckets.gen.add(key);
      else if (cat.includes("en desarrollo")) buckets.dev.add(key);
      else if (cat.includes("revisar")) buckets.rev.add(key);
      else buckets.otros.add(key);
    }

    let ordenPrioridad;
    if (equipoCupos === 'REESTUDIOS') {
      ordenPrioridad = ORDEN_PRIORIDAD_REESTUDIOS;
    } else {
      const prioridadGlobal = props.getProperty('GLOBAL_PRIORIDAD') || 'NUEVAS_PRIMERO';
      ordenPrioridad = ORDEN_PRIORIDAD_POR_MODO[prioridadGlobal] || ORDEN_PRIORIDAD_POR_MODO['NUEVAS_PRIMERO'];
    }

    pendientes.forEach(p => {
      if (p.reasignada) p.tipoPrioridad = -1;
      else {
        const posicion = ordenPrioridad.indexOf(p.tipo);
        p.tipoPrioridad = posicion !== -1 ? posicion : 99; 
      }
    });

    pendientes.sort((a, b) => {
      if (a.tipoPrioridad !== b.tipoPrioridad) return a.tipoPrioridad - b.tipoPrioridad;
      if (a.esCRM && !b.esCRM) return -1;
      if (!a.esCRM && b.esCRM) return 1;
      return a.tipo === 'biometria' ? (b.fechaOrd - a.fechaOrd) : (a.fechaOrd - b.fechaOrd);
    });

    let punteroRotacion = parseInt(props.getProperty('PUNTERO_ROTACION')) || 0;
    let contadorVIP = parseInt(props.getProperty(`VIP_COUNT_${userEmail}`)) || 0;

    let prioridadActual = pendientes[0].tipoPrioridad;
    let candidatos = pendientes.filter(p => p.tipoPrioridad === prioridadActual);

    let tipoAsignar = 'vip';
    if (contadorVIP >= MAX_VIP_CONSECUTIVAS) {
      tipoAsignar = CATEGORIAS_ROTACION[punteroRotacion % CATEGORIAS_ROTACION.length];
    }

    let leadSeleccionado = candidatos.find(item => buckets[tipoAsignar].has(item.polizaKey));

    if (!leadSeleccionado) {
      for (const [tipo, bucketSet] of Object.entries(buckets)) {
        leadSeleccionado = candidatos.find(item => bucketSet.has(item.polizaKey));
        if (leadSeleccionado) { tipoAsignar = tipo; break; }
      }
    }

    if (!leadSeleccionado) {
      leadSeleccionado = candidatos[0];
      tipoAsignar = 'otros';
    }

    if (tipoAsignar === 'vip') contadorVIP++;
    else { contadorVIP = 0; punteroRotacion++; }

    props.setProperty(`VIP_COUNT_${userEmail}`, contadorVIP.toString());
    props.setProperty('PUNTERO_ROTACION', punteroRotacion.toString());

    const fechaHora = new Date();

    if (leadSeleccionado.base === 'PRINCIPAL') {
      solicitudesSheet.getRange(leadSeleccionado.rowIndex, 27, 1, 5).setValues([[fechaHora, userEmail, "", "", nombreUsuario]]);
      solicitudesSheet.getRange(leadSeleccionado.rowIndex, 27).setNumberFormat("dd/MM/yyyy HH:mm:ss");
      solicitudesSheet.getRange(leadSeleccionado.rowIndex, 36).clearContent();
    } else {
      reestudiosSheet.getRange(leadSeleccionado.rowIndex, 7, 1, 3).setValues([[userEmail, nombreUsuario, fechaHora]]);
      reestudiosSheet.getRange(leadSeleccionado.rowIndex, 9).setNumberFormat("dd/MM/yyyy HH:mm:ss");
    }

    SpreadsheetApp.flush();

    // Mover caso asignado a Historico_Gestiones (columnas equivalentes) y eliminar del activo
    if (leadSeleccionado.base === 'PRINCIPAL') {
      const s = solicitudesSheet.getRange(leadSeleccionado.rowIndex, 1, 1, 38).getValues()[0];
      // Construir fila de 37 cols según estructura Historico_Gestiones
      const histRow = [
        s[0],s[1],s[2],s[3],s[4],s[5],s[6],s[7],s[8],s[9],s[10],s[11],s[12],s[13],s[14],s[15],
        s[16],s[17],s[18],s[19],s[20],s[21],  // cols 1-22 iguales
        s[23],s[24],                            // col 23 biometría, col 24 observaciones (omite s[22]=tiemporesp)
        s[26],s[27],s[28],                      // col 25 fechaAsig, col 26 asignacion, col 27 fechaFin (omite s[25]=tracking)
        s[30],s[31],s[32],s[33],                // col 28 Nombre, 29 motAplaz, 30 motNeg, 31 fechaGest (omite s[29]=tiempototal)
        s[35],s[36],                            // col 32 Poliza, col 33 Canal (omite s[34]=Tiempogestion, s[37]=vacio)
        '',0,0,0                                // col 34 fechaRadSAI, 35 min_cola, 36 min_gestion, 37 min_general
      ];
      let hojaHist = ss.getSheetByName("Historico_Gestiones");
      if (!hojaHist) hojaHist = ss.insertSheet("Historico_Gestiones");
      hojaHist.appendRow(histRow);
      hojaHist.getRange(hojaHist.getLastRow(), 35, 1, 3).setNumberFormat("0.00");
      solicitudesSheet.deleteRow(leadSeleccionado.rowIndex);
    } else {
      const filaRest = reestudiosSheet.getRange(leadSeleccionado.rowIndex, 1, 1, 18).getValues()[0];
      const ssRestH  = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS_API);
      let hojaHistR  = ssRestH.getSheetByName("Historico_Gestiones");
      if (!hojaHistR) hojaHistR = ssRestH.insertSheet("Historico_Gestiones");
      hojaHistR.appendRow(filaRest);
      reestudiosSheet.deleteRow(leadSeleccionado.rowIndex);
    }

    let _msgAsignacion = `✅ Asignado: 1 caso de ${_etiquetasTipo[leadSeleccionado.tipo] || leadSeleccionado.tipo.toUpperCase()}.`;
    if (cuposLlenosHoy.length > 0) {
      _msgAsignacion += `\n⚠️ Cupos del día completados: ${cuposLlenosHoy.join(', ')}`;
    }
    return _msgAsignacion;

  } catch (err) {
    Logger.log(`❌ Error crítico en RequestLead: ${err.message}`);
    throw err; 
  } finally {
    lock.releaseLock(); 
  }
}

function normalizarClave(valor) {
  if (!valor) return "";
  const digits = valor.toString().split(/[.,]/)[0].replace(/\D/g, '');
  return digits.replace(/^0+/, '') || "0";
}

function parseDateCustom(dateStr) {
  if (!dateStr || String(dateStr).trim() === "") return 9999999999999;
  if (dateStr instanceof Date) return dateStr.getTime();
  try {
    const parts = String(dateStr).trim().split(' ')[0].split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getTime();
      }
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
    }
    const fallback = new Date(dateStr).getTime();
    return isNaN(fallback) ? 9999999999999 : fallback;
  } catch (e) {
    return 9999999999999; 
  }
}