const MAX_VIP_CONSECUTIVAS = 2;
const CATEGORIAS_ROTACION = ['mediana', 'grande', 'pequena', 'gen', 'dev', 'rev', 'otros'];

const ORDEN_PRIORIDAD_POR_MODO = {
  NUEVAS_PRIMERO:['nueva', 'biometria', 'induccion', 'reestudio', 'nuevaUar', 'deudorUar'],
  BIOMETRIA_PRIMERO:['biometria', 'nueva', 'induccion', 'reestudio', 'nuevaUar', 'deudorUar'],
  INDUCCION_PRIMERO:['induccion', 'nueva', 'biometria', 'reestudio', 'nuevaUar', 'deudorUar'],
};

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

    const hoyFmt1 = `${d}/${m}/${y}`;
    const hoyFmt2 = `${y}-${m}-${d}`;
    const hoyFmt3 = `${d_s}/${m_s}/${y}`;

    function cumpleHoy(strVal) {
      if (!strVal) return false;
      const texto = String(strVal);
      return texto.includes(hoyFmt1) || texto.includes(hoyFmt2) || texto.includes(hoyFmt3);
    }

    let conteoHoy = { nueva: 0, biometria: 0, induccion: 0, nuevaUar: 0, deudorUar: 0, reestudio: 0 };
    let capPendienteReal = 0;

    const dataSolicitudes = solicitudesSheet.getRange("A1:AL" + solicitudesSheet.getLastRow()).getDisplayValues();
    for (let i = 1; i < dataSolicitudes.length; i++) {
      const row = dataSolicitudes[i];
      const asignado = String(row[27]).trim().toLowerCase();
      
      if (asignado === userEmail) {
        const fechaAsig = row[26];
        const fechaFin = row[28];
        const claseNorm = String(row[20]).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const estadoNorm = String(row[16]).trim().toUpperCase();
        
        let tipo = 'nueva';
        if (estadoNorm.includes("BIOMETRIA") || claseNorm.includes("BIOMETRIA")) tipo = 'biometria';
        else if (claseNorm.includes("INDUCCI") || claseNorm === "IND") tipo = 'induccion';

        if (cumpleHoy(fechaAsig) || cumpleHoy(fechaFin)) {
          conteoHoy[tipo]++;
        }
        if (String(fechaAsig).trim() !== "" && String(fechaFin).trim() === "") {
          capPendienteReal++;
        }
      }
    }

    const dataReestudios = reestudiosSheet.getDataRange().getDisplayValues();
    for (let i = 1; i < dataReestudios.length; i++) {
      const row = dataReestudios[i];
      const asignado = String(row[6]).trim().toLowerCase(); 
      
      if (asignado === userEmail) {
        const origen = String(row[3]).toUpperCase().trim();
        const tipoP = String(row[4]).toUpperCase().trim();
        const claseR = String(row[5]).toUpperCase().trim();
        const fechaAsig = row[8]; 
        const fechaFin = row[9];  
        
        let tipo = 'reestudio';
        if (tipoP.includes("NUEVA UAR") || claseR.includes("NUEVA UAR")) tipo = 'nuevaUar';
        else if (tipoP.includes("DEUDOR UAR") || claseR.includes("DEUDOR UAR")) tipo = 'deudorUar';

        if (cumpleHoy(fechaAsig) || cumpleHoy(fechaFin)) {
          conteoHoy[tipo]++;
        }
        if (String(fechaAsig).trim() !== "" && String(fechaFin).trim() === "") {
          capPendienteReal++;
        }
      }
    }

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
      
      const tipoP = String(row[4]).toUpperCase().trim();
      const claseR = String(row[5]).toUpperCase().trim();
      
      let tipo = 'reestudio';
      if (tipoP.includes("NUEVA UAR") || claseR.includes("NUEVA UAR")) tipo = 'nuevaUar';
      else if (tipoP.includes("DEUDOR UAR") || claseR.includes("DEUDOR UAR")) tipo = 'deudorUar';

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

    if (pendientes.length === 0) return "Tu cupo diario para los tipos de casos disponibles ya está lleno, o no hay casos en bandeja.";

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

    const prioridadGlobal = props.getProperty('GLOBAL_PRIORIDAD') || 'NUEVAS_PRIMERO';
    const ordenPrioridad  = ORDEN_PRIORIDAD_POR_MODO[prioridadGlobal] || ORDEN_PRIORIDAD_POR_MODO['NUEVAS_PRIMERO'];

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
      solicitudesSheet.getRange(leadSeleccionado.rowIndex, 36).clearContent(); 
    } else {
      reestudiosSheet.getRange(leadSeleccionado.rowIndex, 7, 1, 3).setValues([[userEmail, nombreUsuario, fechaHora]]);
    }

    SpreadsheetApp.flush();
    return `✅ Asignado: 1 caso de ${leadSeleccionado.tipo.toUpperCase()}.`;

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