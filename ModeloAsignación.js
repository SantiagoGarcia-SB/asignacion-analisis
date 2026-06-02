const MAX_VIP_CONSECUTIVAS = 2;
const CATEGORIAS_ROTACION = ['mediana', 'grande', 'pequena', 'gen', 'dev', 'rev', 'otros'];

const ORDEN_PRIORIDAD_POR_MODO = {
  NUEVAS_PRIMERO:['nueva', 'biometria', 'induccion'],
  BIOMETRIA_PRIMERO:['biometria', 'nueva', 'induccion'],
  INDUCCION_PRIMERO:['induccion', 'nueva', 'biometria'],
};

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

    if (!solicitudesSheet || !usuariosSheet || !scoreSheet) {
      throw new Error("Una o más hojas requeridas no existen en el Spreadsheet.");
    }

    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const dataUsuarios = usuariosSheet.getDataRange().getDisplayValues();
    const usuarioInfo  = dataUsuarios.find(u => u[2].trim().toLowerCase() === userEmail);
    if (!usuarioInfo) return "❌ Usuario no registrado en el sistema.";

    const nombreUsuario = usuarioInfo[1];
    const especialidad  = usuarioInfo[4];
    const estadoUsuario = usuarioInfo[5].toString().trim().toUpperCase();
    const capTotal      = parseInt(usuarioInfo[6]) || 0;

    if (estadoUsuario !== "ACTIVO")return "❌ Tu usuario no está Activo.";
    if (!especialidad.toUpperCase().includes("ESTUDIO DIGITAL")) return "❌ Tu especialidad no es 'Estudio Digital'.";

    const lastRow = solicitudesSheet.getLastRow();
    if (lastRow < 2) return "No hay solicitudes en la base de datos.";

    const dataSolicitudes = solicitudesSheet.getRange("A2:AL" + lastRow).getValues();

    let capPendienteReal = 0;
    for (const row of dataSolicitudes) {
      if (
        String(row[27]).trim().toLowerCase() === userEmail &&
        String(row[26]).trim() !== "" &&
        String(row[28]).trim() === ""
      ) {
        capPendienteReal++;
      }
    }

    const capacidadDisponible = capTotal - capPendienteReal;
    if (capacidadDisponible < 1) return "No tienes capacidad disponible. Termina casos pendientes primero.";

    const dataScore = scoreSheet.getDataRange().getDisplayValues();
    const buckets = {
      vip: new Set(), grande: new Set(), mediana: new Set(),
      pequena: new Set(), gen: new Set(), dev: new Set(),
      rev: new Set(), otros: new Set()
    };

    for (let i = 1; i < dataScore.length; i++) {
      const key = normalizarClave(dataScore[i][0]);
      if (!key || key === "0") continue;
      const cat = dataScore[i][1].toString().toLowerCase().trim();

      if(cat.includes("vip"))buckets.vip.add(key);
      else if (cat.includes("grande"))buckets.grande.add(key);
      else if (cat.includes("mediana"))buckets.mediana.add(key);
      else if (cat.includes("peque"))buckets.pequena.add(key);
      else if (cat.includes("generica"))buckets.gen.add(key);
      else if (cat.includes("en desarrollo"))buckets.dev.add(key);
      else if (cat.includes("revisar"))buckets.rev.add(key);
      else buckets.otros.add(key);
    }

    const props = PropertiesService.getScriptProperties();
    const prioridadGlobal = props.getProperty('GLOBAL_PRIORIDAD') || 'NUEVAS_PRIMERO';
    const ordenPrioridad  = ORDEN_PRIORIDAD_POR_MODO[prioridadGlobal] || ORDEN_PRIORIDAD_POR_MODO['NUEVAS_PRIMERO'];

    const ahora = new Date();
    const hoyDia = ahora.getDate();
    const hoyMes = ahora.getMonth();
    const hoyAnio = ahora.getFullYear();

    let pendientes = dataSolicitudes
      .map((row, index) => {
        const claseNorm  = String(row[20]).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const estadoNorm = String(row[16]).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const esNueva = claseNorm.includes("NUEV") || claseNorm.includes("REESTUDIO") || estadoNorm.includes("EN_ESTUDIO") || estadoNorm.includes("EN ESTUDIO") || estadoNorm.includes("BORRADOR");
        const esBiometria  = estadoNorm.includes("BIOMETRIA");
        const esInduccion = claseNorm.includes("INDUCCI") || claseNorm === "IND";
        const reasignada = String(row[35]).trim().toUpperCase() === "REASIGNADA";
        const esCRM = String(row[36] || "").toLowerCase().trim().startsWith("crm");
        
        let tipoPrioridad = 4; 
        if (reasignada) {
          tipoPrioridad = 0;
        } else {
          const flagPorNombre = { nueva: esNueva, biometria: esBiometria, induccion: esInduccion };
          const posicion = ordenPrioridad.findIndex(tipo => flagPorNombre[tipo]);
          if (posicion !== -1) tipoPrioridad = posicion + 1;
        }

        let gestionadaHoy = false;
        const fechaGestion = String(row[33]).trim();
        if (fechaGestion) {
          const p = fechaGestion.split(/[\/\-]/);
          if (p.length === 3) {
            const gDia  = parseInt(p[0]);
            const gMes  = parseInt(p[1]) - 1;
            const gAnio = p[2].length === 4 ? parseInt(p[2]) : 2000 + parseInt(p[2]);
            gestionadaHoy = (gDia === hoyDia && gMes === hoyMes && gAnio === hoyAnio);
          }
        }

        return {
          rowData: row,
          rowIndex: index + 2,
          claseNorm,
          estadoNorm,
          polizaKey: normalizarClave(row[1]),
          esNueva,
          esBiometria,
          esInduccion,
          reasignada,
          esCRM,
          tipoPrioridad,
          gestionadaHoy,
          sinAsignar:   String(row[26]).trim() === "",
          esCerrada: (estadoNorm.includes("APROB") && !esBiometria) || estadoNorm.includes("NEGAD") || estadoNorm.includes("RECHAZ") || estadoNorm.includes("APLAZ"),
        };
      })
      .filter(item => {
        if (!item.esNueva && !item.esBiometria && !item.esInduccion) return false;
        if (!item.sinAsignar) return false;
        if (item.esCerrada) return false; 
        if (item.estadoNorm === "") return false;
        if (item.gestionadaHoy && !item.reasignada) return false;

        return true;
      });

    if (pendientes.length === 0) return "No hay solicitudes pendientes en la bandeja.";

    pendientes.sort((a, b) => {
      if (a.tipoPrioridad !== b.tipoPrioridad) return a.tipoPrioridad - b.tipoPrioridad;
      if (a.esCRM && !b.esCRM) return -1;
      if (!a.esCRM && b.esCRM) return 1;
      const dateA = parseDateCustom(a.rowData[17]);
      const dateB = parseDateCustom(b.rowData[17]);
      return a.esBiometria ? (dateB - dateA) : (dateA - dateB);
    });

    const leadsAsignados = [];
    let capRestante = capacidadDisponible;
    let punteroRotacion = parseInt(props.getProperty('PUNTERO_ROTACION'))|| 0;
    let contadorVIP = parseInt(props.getProperty(`VIP_COUNT_${userEmail}`))|| 0;

    while (capRestante > 0 && pendientes.length > 0) {
      
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
          if (leadSeleccionado) { 
             tipoAsignar = tipo; 
             break; 
          }
        }
      }

      if (!leadSeleccionado) {
        leadSeleccionado = candidatos[0];
        tipoAsignar = 'otros';
      }

      if (!leadSeleccionado) break;

      leadsAsignados.push(leadSeleccionado);
      capRestante--;

      if (buckets[tipoAsignar]) {
        buckets[tipoAsignar].delete(leadSeleccionado.polizaKey);
      }

      pendientes = pendientes.filter(p => p.rowIndex !== leadSeleccionado.rowIndex);

      if (tipoAsignar === 'vip') {
        contadorVIP++;
      } else {
        contadorVIP = 0;
        punteroRotacion++;
      }
    }

    props.setProperty(`VIP_COUNT_${userEmail}`, contadorVIP.toString());
    props.setProperty('PUNTERO_ROTACION', punteroRotacion.toString());

    if (leadsAsignados.length === 0) return "No se encontraron leads para asignar.";

    const fechaHora = new Date();
    leadsAsignados.forEach(lead => {
      solicitudesSheet
        .getRange(lead.rowIndex, 27, 1, 5)
        .setValues([[fechaHora, userEmail, "", "", nombreUsuario]]);

      solicitudesSheet.getRange(lead.rowIndex, 36).clearContent();
    });

    SpreadsheetApp.flush();

    Logger.log(`✅ ${leadsAsignados.length} leads asignados a ${userEmail}`);
    return `✅ Asignados: ${leadsAsignados.length} caso(s).`;

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
  if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === "") {
    return 9999999999999;
  }
  try {
    const parts = dateStr.trim().split(' ')[0].split(/[\/\-]/);
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