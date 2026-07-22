/**
 * ====================================================
 * MÓDULO REESTUDIOS - Backend para VistaUnificada.html (modal #modalReestudio)
 * ====================================================
 * Funciones: getReestudiosData, guardarGestionReestudio
 *
 * El motor de asignación (RequestLeadUnificado) está en MotorAsignacion.js
 * 
 * Hoja fuente: "Solicitudes_Asignacion_Reestudios_UAR" en el spreadsheet ID_HOJA_REESTUDIOS
 * 
 * Columnas (1-indexed):
 *  A(1): fechaRadicacion
 *  B(2): solicitud
 *  C(3): linkDrive
 *  D(4): origen (VICTORIA / CORREO)
 *  E(5): tipoDeProceso
 *  F(6): claseDeSolicitud
 *  G(7): analistaAsignado (email)
 *  H(8): nombreAnalista
 *  I(9): fechaAsignacion
 *  J(10): fechaFinGestion
 *  K(11): estadoGestion
 *  L(12): motivoAplazamiento
 *  M(13): motivoNegacion
 *  N(14): observaciones
 */

const ID_HOJA_REESTUDIOS = '1slgykTgjoAtCd6KmlG7Lqiuw-nM1hSguQbi0XqeLu7U';
const NOMBRE_PESTANA_REESTUDIOS = 'ORIGEN';

/**
 * Obtiene todos los casos asignados al analista: reestudios + digitales/bio/inducción.
 * La fuente de cada caso queda en item.fuente = 'REESTUDIO' | 'DIGITAL'.
 */
function getReestudiosData() {
  try {
    const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
    const hoyStr = Utilities.formatDate(new Date(), "GMT-5", "dd/MM/yyyy");

    let conteoHoy = 0;
    let listaPendientes = [];

    // --- Hoja de Reestudios ---
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);
    const hoja = ssReestudios.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (!hoja) return { success: false, message: "No se encontró la hoja de reestudios." };

    const lastRow = hoja.getLastRow();
    if (lastRow >= 2) {
      const data = hoja.getRange(2, 1, lastRow - 1, 14).getDisplayValues();
      for (let i = 0; i < data.length; i++) {
        const fila = data[i];
        const asignado = String(fila[6]).trim().toLowerCase();
        const fechaFin = String(fila[9]).trim();
        const fechaAsignacion = String(fila[8]).trim();

        if (asignado !== userEmail) continue;

        if (fechaFin !== "") {
          if (fechaFin.includes(hoyStr)) conteoHoy++;
          continue;
        }
        if (fechaAsignacion === "") continue;

        listaPendientes.push({
          fuente: 'REESTUDIO',
          filaReal: i + 2,
          solicitud: String(fila[1]).trim(),
          linkDrive: String(fila[2]).trim(),
          origen: String(fila[3]).trim(),
          tipoProceso: String(fila[4]).trim(),
          claseSolicitud: String(fila[5]).trim(),
          fechaAsignacion: fechaAsignacion,
          fechaRadicacion: String(fila[0]).trim()
        });
      }
    }

    // --- Casos asignados ya movidos a Historico_Gestiones (MotorAsignacion los mueve al asignar) ---
    // Antes esto leía y recorría TODA la hoja (crece sin límite). Ahora, como ya
    // sabemos por el contador de carga pendiente si este analista tiene algo
    // abierto, solo buscamos cuando corresponde, y con TextFinder acotado a la
    // columna de analista asignado en vez de traer todas las columnas a memoria.
    let errorHistR = null;
    try {
      const hojaHistR = ssReestudios.getSheetByName('Historico_Gestiones');
      const lastRowH = hojaHistR ? hojaHistR.getLastRow() : 0;
      if (hojaHistR && lastRowH > 1 && _obtenerCargaPendienteAnalista(userEmail) > 0) {
        const filasR = _filasFiltradasPorAnalista(
          hojaHistR, 7, 10,
          function(fechaFin) { return fechaFin.trim() === ''; },
          userEmail, 14
        );
        filasR.forEach(function(r) {
          const fila = r.valores;
          const fechaAsignacion = String(fila[8]).trim();
          if (fechaAsignacion === '') return;

          listaPendientes.push({
            fuente: 'REESTUDIO',
            filaReal: r.fila,
            solicitud: String(fila[1]).trim(),
            linkDrive: String(fila[2]).trim(),
            origen: String(fila[3]).trim(),
            tipoProceso: String(fila[4]).trim(),
            claseSolicitud: String(fila[5]).trim(),
            fechaAsignacion: fechaAsignacion,
            fechaRadicacion: String(fila[0]).trim()
          });
        });
      }
    } catch (eHistR) {
      Logger.log('getReestudiosData - Error leyendo Historico_Gestiones reestudios: ' + eHistR.toString());
      errorHistR = 'No se pudieron cargar tus casos pendientes de reestudios.';
    }

    // --- Lookup score/inmobiliaria para casos DIGITAL ---
    // _getScoreMapCacheado() (Código.js) — cachea 90s vía CacheService en vez de releer la
    // hoja "score" completa en cada carga de panel (misma hoja que ya lee getTableData).
    const scoreMapsR = _getScoreMapCacheado();
    const mapaScoreR = scoreMapsR.mapaScore;
    const mapaInmobiliariaR = scoreMapsR.mapaInmobiliaria;

    // --- Hoja principal (digitales, biometría, inducciones) ---
    try {
      const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
      const hojaDigital = ss.getSheetByName(SHEET_NAME_SOLICITUDES);
      if (hojaDigital) {
        const lastRowD = hojaDigital.getLastRow();
        if (lastRowD >= 2) {
          // Leemos hasta col AE (31 columnas) para cubrir nombreAnalista
          const dataD = hojaDigital.getRange(2, 1, lastRowD - 1, 31).getDisplayValues();
          for (let i = 0; i < dataD.length; i++) {
            const fila = dataD[i];
            const asignado = String(fila[27]).trim().toLowerCase(); // col AB
            const fechaAsig = String(fila[26]).trim();              // col AA
            const fechaFin  = String(fila[28]).trim();              // col AC

            if (asignado !== userEmail) continue;
            if (fechaAsig === "") continue;

            if (fechaFin !== "") {
              if (fechaFin.includes(hoyStr)) conteoHoy++;
              continue;
            }

            var polD = String(fila[1]).trim();
            var polDNorm = polD.replace(/\D/g, '').replace(/^0+/, '');
            listaPendientes.push({
              fuente: 'DIGITAL',
              origen: 'DIGITAL',
              tipoProceso: String(fila[20]).trim(),
              claseSolicitud: String(fila[4]).trim(),
              solicitud: String(fila[0]).trim(),
              poliza: polD,
              identificacion: String(fila[2]).trim(),
              tipoIdentificacion: String(fila[3]).trim(),
              nombreInquilino: String(fila[4]).trim(),
              correoInquilino: String(fila[5]).trim(),
              telefonoInquilino: String(fila[6]).trim(),
              ingresos: String(fila[7]).trim(),
              fechaExpedicion: String(fila[8]).trim(),
              canon: String(fila[9]).trim(),
              cuota: String(fila[10]).trim(),
              direccionInmueble: String(fila[11]).trim(),
              destinoInmueble: String(fila[12]).trim(),
              ciudadInmueble: String(fila[13]).trim(),
              nombreAsesor: String(fila[14]).trim(),
              correoAsesor: String(fila[15]).trim(),
              estadoGeneral: String(fila[16]).trim(),
              fechaRadicacion: String(fila[17]).trim(),
              fechaResultado: String(fila[18]).trim(),
              clase: String(fila[20]).trim(),
              biometriaActual: String(fila[23]).trim(),
              fechaAsignacion: fechaAsig,
              categoriaScore: mapaScoreR.get(polD) || mapaScoreR.get(polDNorm) || '',
              inmobiliaria: mapaInmobiliariaR.get(polD) || mapaInmobiliariaR.get(polDNorm) || ''
            });
          }
        }
      }
    } catch (eDigital) {
      Logger.log('getReestudiosData - Error leyendo digitales: ' + eDigital.toString());
    }

    // --- Historico_Gestiones principal (casos movidos al asignar desde solicitud) ---
    // Mismo cambio que arriba: se salta la lectura completa si el contador de
    // carga pendiente dice que este analista no tiene nada abierto, y si sí
    // tiene, ubica la fila con TextFinder en vez de recorrer toda la hoja.
    let errorHistPrincipal = null;
    try {
      const ssPrincipal = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
      const hojaHistPrincipal = ssPrincipal.getSheetByName('Historico_Gestiones');
      const lastRowHP = hojaHistPrincipal ? hojaHistPrincipal.getLastRow() : 0;
      if (hojaHistPrincipal && lastRowHP > 1 && _obtenerCargaPendienteAnalista(userEmail) > 0) {
        const colsHP = Math.max(61, hojaHistPrincipal.getLastColumn());
        const filasHP = _filasFiltradasPorAnalista(
          hojaHistPrincipal, 26, 27,
          function(fechaFin) { return fechaFin.trim() === ''; },
          userEmail, colsHP
        );
        filasHP.forEach(function(r) {
          const fila = r.valores;
          const fechaAsig = String(fila[24]).trim();

          if (fechaAsig === '') return;

          var polHP = String(fila[1]).trim();
          var polHPNorm = polHP.replace(/\D/g, '').replace(/^0+/, '');
          listaPendientes.push({
            fuente: 'DIGITAL',
            origen: 'DIGITAL',
            tipoProceso: String(fila[20]).trim(),
            claseSolicitud: String(fila[4]).trim(),
            solicitud: String(fila[0]).trim(),
            poliza: polHP,
            identificacion: String(fila[2]).trim(),
            tipoIdentificacion: String(fila[3]).trim(),
            nombreInquilino: String(fila[4]).trim(),
            correoInquilino: String(fila[5]).trim(),
            telefonoInquilino: String(fila[6]).trim(),
            ingresos: String(fila[7]).trim(),
            fechaExpedicion: String(fila[8]).trim(),
            canon: String(fila[9]).trim(),
            cuota: String(fila[10]).trim(),
            direccionInmueble: String(fila[11]).trim(),
            destinoInmueble: String(fila[12]).trim(),
            ciudadInmueble: String(fila[13]).trim(),
            nombreAsesor: String(fila[14]).trim(),
            correoAsesor: String(fila[15]).trim(),
            estadoGeneral: String(fila[16]).trim(),
            fechaRadicacion: String(fila[17]).trim(),
            fechaResultado: String(fila[18]).trim(),
            clase: String(fila[20]).trim(),
            biometriaActual: String(fila[22]).trim(),
            fechaAsignacion: fechaAsig,
            categoriaScore: mapaScoreR.get(polHP) || mapaScoreR.get(polHPNorm) || '',
            inmobiliaria: mapaInmobiliariaR.get(polHP) || mapaInmobiliariaR.get(polHPNorm) || ''
          });
        });
      }
    } catch (eHistPrincipal) {
      Logger.log('getReestudiosData - Error leyendo Historico_Gestiones principal: ' + eHistPrincipal.toString());
      errorHistPrincipal = 'No se pudieron cargar tus casos pendientes digitales.';
    }

    const errorParcial = [errorHistR, errorHistPrincipal].filter(Boolean).join(' ');
    return {
      success: true,
      solicitudes: listaPendientes,
      stats: { hoy: conteoHoy, pendientes: listaPendientes.length },
      error: errorParcial || undefined
    };

  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

/**
 * Guarda la gestión de un caso de reestudio.
 * Después de guardar, intenta auto-asignar un nuevo caso (via MotorAsignacion.js).
 * 
 * @param {Object} datos - { filaReal, estadoGestion, motivoAplazamiento, motivoNegacion, observaciones }
 */
function guardarGestionReestudio(datos) {
  if (datos && datos.solicitudId && !datos.solicitud) datos.solicitud = datos.solicitudId;
  if (!datos || (!datos.filaReal && !datos.solicitud)) {
    return { success: false, message: "Identificador del caso no proporcionado." };
  }

  try {
    const ssReestudios = SpreadsheetApp.openById(ID_HOJA_REESTUDIOS);

    // Buscar caso: primero en Historico_Gestiones (nueva lógica), luego en ORIGEN (legados)
    let hojaHistorico = ssReestudios.getSheetByName("Historico_Gestiones");
    let targetRow = -1;
    let fuenteRuta = '';
    const targetId = String(datos.solicitud || datos.filaReal).trim();

    if (hojaHistorico && hojaHistorico.getLastRow() > 1) {
      const lastRowH = hojaHistorico.getLastRow();
      // Antes esto leía columnas B-J de toda la hoja para buscar el ID. Ahora
      // usa la búsqueda nativa de Sheets (TextFinder) acotada a la columna del
      // ID, y solo lee la fila que realmente coincide.
      const colSolicitud = hojaHistorico.getRange(2, 2, lastRowH - 1, 1);
      const matchesH = colSolicitud.createTextFinder(targetId).matchEntireCell(true).findAll();
      for (let mh = 0; mh < matchesH.length; mh++) {
        const rowH = matchesH[mh].getRow();
        const fechaFinH = String(hojaHistorico.getRange(rowH, 10).getDisplayValue()).trim();
        if (fechaFinH === '') { targetRow = rowH; fuenteRuta = 'HISTORICO'; break; }
      }
    }

    const hojaOrigen = ssReestudios.getSheetByName(NOMBRE_PESTANA_REESTUDIOS);
    if (targetRow === -1 && hojaOrigen) {
      // Fallback por filaReal (fila en ORIGEN)
      targetRow = parseInt(datos.filaReal);
      fuenteRuta = 'ORIGEN';
    }

    const hojaActiva = fuenteRuta === 'HISTORICO' ? hojaHistorico : hojaOrigen;
    if (!hojaActiva) return { success: false, message: "No se encontró la hoja." };

    // ============================================================
    // RUTA ORIGEN (legado): sigue detrás de ScriptLock, igual que antes de este
    // cambio (2026-07-22) — al final hace deleteRow(), que desplaza los índices
    // de TODAS las filas siguientes de esa hoja, a diferencia de un setValue/
    // setValues puntual (que no afecta a nadie más). Eso sí necesita serializarse
    // contra cualquier otra ejecución que esté referenciando una fila de esta
    // misma hoja por índice. Es tráfico legado y cada vez más escaso (los casos
    // nuevos ya nacen directo en Historico_Gestiones), así que mantenerlo bajo
    // lock no reintroduce el cuello de botella que sí tenía la ruta activa de
    // abajo con muchos analistas guardando a la vez.
    if (fuenteRuta === 'ORIGEN') {
      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(15000);
      } catch (e) {
        return { success: false, message: "Sistema ocupado, reintenta en unos segundos." };
      }
      try {
        const fechaFinExistente = String(hojaActiva.getRange(targetRow, 10).getDisplayValue()).trim();
        if (fechaFinExistente !== "") {
          return { success: false, message: "Este caso ya fue gestionado." };
        }

        const ahora = new Date();
        const filaBase        = hojaActiva.getRange(targetRow, 1, 1, 18).getValues()[0];
        const fechaRadicacion = filaBase[0];
        const fechaAsignacion = filaBase[8];
        const emailAnalista   = String(filaBase[6] || '').toLowerCase().trim();
        const tRadCola = _parseFechaGAS(datos.fecha_radicacion_sai) || _parseFechaGAS(fechaRadicacion);
        const tiempos = calcularTiemposCaso(tRadCola, _parseFechaGAS(fechaAsignacion), ahora, emailAnalista);

        // Escribir gestión en columnas J(10) a R(18)
        hojaActiva.getRange(targetRow, 10, 1, 9).setValues([[
          ahora, datos.estadoGestion || "", datos.motivoAplazamiento || "", datos.motivoNegacion || "",
          datos.observaciones || "", tiempos.minutos_cola, tiempos.minutos_gestion, tiempos.minutos_general,
          datos.poliza || ""
        ]]);
        hojaActiva.getRange(targetRow, 10).setNumberFormat("dd/mm/yyyy HH:mm:ss");
        hojaActiva.getRange(targetRow, 15, 1, 3).setNumberFormat("0.00");
        SpreadsheetApp.flush();

        // Caso legado en ORIGEN: mover a Historico y eliminar del activo. No está
        // cubierto por los contadores incrementales (los casos de ORIGEN nunca se
        // sumaron ahí, siguen contados por el escaneo en vivo de
        // _contarDesdeHojaReestudios), así que no hay nada que descontar aquí.
        const filaFinal = hojaOrigen.getRange(targetRow, 1, 1, 18).getValues()[0];
        if (!hojaHistorico) hojaHistorico = ssReestudios.insertSheet("Historico_Gestiones");
        hojaHistorico.appendRow(filaFinal);
        hojaOrigen.deleteRow(targetRow);
        SpreadsheetApp.flush();

        return { success: true, message: "Gestión guardada correctamente.", disparaAsignacion: true };
      } finally {
        lock.releaseLock();
      }
    }

    // ============================================================
    // RUTA HISTORICO (activa/normal): sin ScriptLock — mismo cambio y mismo
    // motivo que guardarCambiosInternos (Código.js) y guardarGestionBiometria
    // (Biometria.js): cada solicitud vive en su propia fila, así que no hace
    // falta serializar contra el resto del sistema para escribirla. Se revalida
    // el ID justo antes de escribir por si un admin desasignó/reasignó el caso y
    // corrió filas entre la búsqueda de arriba y este punto.
    const fechaFinExistente = String(hojaHistorico.getRange(targetRow, 10).getDisplayValue()).trim();
    if (fechaFinExistente !== "") {
      return { success: false, message: "Este caso ya fue gestionado." };
    }

    const idEnFila = String(hojaHistorico.getRange(targetRow, 2).getDisplayValue()).trim();
    if (idEnFila !== targetId) {
      const reubicado = hojaHistorico.getRange(2, 2, hojaHistorico.getLastRow() - 1, 1)
        .createTextFinder(targetId).matchEntireCell(true).findNext();
      if (!reubicado) {
        return { success: false, message: "La solicitud cambió de estado mientras guardabas. Actualiza la página e intenta de nuevo." };
      }
      targetRow = reubicado.getRow();
    }

    const ahora = new Date();
    const filaBase        = hojaHistorico.getRange(targetRow, 1, 1, 18).getValues()[0];
    const fechaRadicacion = filaBase[0];
    const fechaAsignacion = filaBase[8];
    const emailAnalista   = String(filaBase[6] || '').toLowerCase().trim();
    const tRadCola = _parseFechaGAS(datos.fecha_radicacion_sai) || _parseFechaGAS(fechaRadicacion);
    const tiempos = calcularTiemposCaso(
      tRadCola,
      _parseFechaGAS(fechaAsignacion),
      ahora,
      emailAnalista
    );

    hojaHistorico.getRange(targetRow, 10, 1, 9).setValues([[
      ahora,
      datos.estadoGestion || "",
      datos.motivoAplazamiento || "",
      datos.motivoNegacion || "",
      datos.observaciones || "",
      tiempos.minutos_cola,
      tiempos.minutos_gestion,
      tiempos.minutos_general,
      datos.poliza || ""
    ]]);
    hojaHistorico.getRange(targetRow, 10).setNumberFormat("dd/mm/yyyy HH:mm:ss");
    hojaHistorico.getRange(targetRow, 15, 1, 3).setNumberFormat("0.00");
    SpreadsheetApp.flush();

    var origenNormReest = String(filaBase[3]).toUpperCase().trim();
    var tipoPNormReest = String(filaBase[4]).toUpperCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
    var tipoCierreReest = _derivarTipoReestudio(origenNormReest, tipoPNormReest) || 'reestudio';
    _cerrarConteoConLockCorto(emailAnalista, tipoCierreReest, fechaAsignacion);

    return { success: true, message: "Gestión guardada correctamente.", disparaAsignacion: true };

  } catch (error) {
    return { success: false, message: "Error al guardar: " + error.toString() };
  }
}

