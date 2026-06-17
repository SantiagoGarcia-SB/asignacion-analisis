// ===================================================================
// MotorTiempos.js
// Motor unificado de cálculo de tiempos hábiles.
//
// Punto de entrada público:
//   calcularTiemposCaso(tRadicacion, tAsignacion, tResultado, emailAnalista)
//   → { minutos_cola, minutos_gestion, minutos_general }
//
// minutos_cola    = minutosHabiles(T_radicacion → T_asignacion, horarioEquipo)
// minutos_gestion = minutosHabiles(T_asignacion → T_resultado,  horarioAnalista)
// minutos_general = minutos_cola + minutos_gestion  (suma aritmética, siempre consistente)
//
// Usa como fuente de configuración las hojas del spreadsheet TARGET_SOLICITUDES_SS_ID:
//   - Festivos            (col A: fecha)
//   - Turnos              (cols A-L: ID, Nombre, Activo, Lun-Dom, HoraInicio, HoraFin)
//   - Analistas_Turnos    (cols A-D: Email, ID_Turno, Fecha_Desde, Fecha_Hasta)
//   - Horas_Extra         (cols A-E: Email, Fecha, HoraInicio, HoraFin, Descripcion)
// ===================================================================


// ─── PARSEO DE HORA ────────────────────────────────────────────────────────────
// Convierte distintos formatos que puede devolver GAS a minutos desde medianoche.
// GAS devuelve tiempo como Date con fecha base 30/12/1899, como fracción de día,
// o como string "HH:mm".
function _parsearHora(valor) {
  if (!valor && valor !== 0) return null;
  if (valor instanceof Date) {
    // GAS creates time Dates with UTC hours matching the cell value (epoch Dec 30, 1899).
    // Use getUTCHours/getUTCMinutes to avoid the historical LMT offset shift.
    return valor.getUTCHours() * 60 + valor.getUTCMinutes();
  }
  if (typeof valor === 'number') {
    return Math.round(valor * 24 * 60);
  }
  if (typeof valor === 'string') {
    const s = valor.trim();
    if (s.includes(':')) {
      const p = s.split(':');
      return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    }
  }
  return null;
}


// ─── CARGA DE CONFIGURACIÓN ────────────────────────────────────────────────────
// Lee todas las hojas de configuración en un solo bloque para minimizar
// llamadas a la API de Sheets. Se llama una vez por ejecución de calcularTiemposCaso.
function _cargarConfigHoraria() {
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);

  // --- Festivos: Set<"yyyy-MM-dd"> ---
  const festivos = new Set();
  try {
    const hf = ss.getSheetByName('Festivos');
    if (hf && hf.getLastRow() > 0) {
      hf.getDataRange().getValues().forEach(fila => {
        const v = fila[0];
        if (v instanceof Date && !isNaN(v.getTime())) {
          festivos.add(Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd'));
        }
      });
    }
  } catch (e) {
    Logger.log('MotorTiempos Festivos: ' + e.message);
  }

  // --- Turnos: Map<ID_Turno, [{diaSemana(JS 0-6), ini(min), fin(min)}]> ---
  // Columnas hoja (A-X, 24 cols):
  //   A=ID, B=Nombre, C=Activo, D-J=bool por día (Lun→Dom)
  //   K=Lun_Ini, L=Lun_Fin, M=Mar_Ini, N=Mar_Fin, O=Mie_Ini, P=Mie_Fin,
  //   Q=Jue_Ini, R=Jue_Fin, S=Vie_Ini, T=Vie_Fin, U=Sab_Ini, V=Sab_Fin, W=Dom_Ini, X=Dom_Fin
  // JS día semana: 0=Dom, 1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab
  const DIAS_JS = [1, 2, 3, 4, 5, 6, 0]; // orden: Lun→Dom mapeados a JS
  const turnos = new Map();
  try {
    const ht = ss.getSheetByName('Turnos');
    if (ht && ht.getLastRow() > 1) {
      const data = ht.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        const id = String(r[0] || '').trim();
        const activo = r[2] === true || String(r[2]).toUpperCase() === 'TRUE';
        if (!id || !activo) continue;
        if (!turnos.has(id)) turnos.set(id, []);
        for (let d = 0; d < 7; d++) {
          const marcado = r[3 + d];
          if (!(marcado === true || String(marcado).toUpperCase() === 'TRUE' || marcado === 1)) continue;
          // Per-day hours: index 10 + d*2 = Ini, 11 + d*2 = Fin
          const ini = _parsearHora(r[10 + d * 2]);
          const fin = _parsearHora(r[11 + d * 2]);
          if (ini === null || fin === null || ini >= fin) continue;
          turnos.get(id).push({ diaSemana: DIAS_JS[d], ini, fin });
        }
      }
    }
  } catch (e) {
    Logger.log('MotorTiempos Turnos: ' + e.message);
  }

  // --- Analistas_Turnos: Map<email, [{idTurno, desde:Date, hasta:Date|null}]> ---
  // Columnas: A=Email, B=ID_Turno, C=Fecha_Desde, D=Fecha_Hasta
  const analistaTurnos = new Map();
  try {
    const hat = ss.getSheetByName('Analistas_Turnos');
    if (hat && hat.getLastRow() > 1) {
      const data = hat.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        const email = String(r[0] || '').toLowerCase().trim();
        const idTurno = String(r[1] || '').trim();
        const desde = r[2] instanceof Date && !isNaN(r[2].getTime()) ? r[2] : null;
        const hasta = r[3] instanceof Date && !isNaN(r[3].getTime()) ? r[3] : null;
        if (!email || !idTurno || !desde) continue;
        if (!analistaTurnos.has(email)) analistaTurnos.set(email, []);
        analistaTurnos.get(email).push({ idTurno, desde, hasta });
      }
    }
  } catch (e) {
    Logger.log('MotorTiempos Analistas_Turnos: ' + e.message);
  }

  // --- Horas_Extra: Map<"email|yyyy-MM-dd", [{ini(min), fin(min)}]> ---
  // Columnas: A=Email, B=Fecha, C=HoraInicio, D=HoraFin, E=Descripcion
  const horasExtra = new Map();
  try {
    const hhe = ss.getSheetByName('Horas_Extra');
    if (hhe && hhe.getLastRow() > 1) {
      const data = hhe.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        const email = String(r[0] || '').toLowerCase().trim();
        const fechaV = r[1];
        const fechaStr = fechaV instanceof Date && !isNaN(fechaV.getTime())
          ? Utilities.formatDate(fechaV, TIMEZONE, 'yyyy-MM-dd')
          : String(fechaV || '').trim();
        const ini = _parsearHora(r[2]);
        const fin = _parsearHora(r[3]);
        if (!email || !fechaStr || ini === null || fin === null || ini >= fin) continue;
        const key = email + '|' + fechaStr;
        if (!horasExtra.has(key)) horasExtra.set(key, []);
        horasExtra.get(key).push({ ini, fin });
      }
    }
  } catch (e) {
    Logger.log('MotorTiempos Horas_Extra: ' + e.message);
  }

  return { festivos, turnos, analistaTurnos, horasExtra };
}


// ─── FUSIÓN DE INTERVALOS ──────────────────────────────────────────────────────
// Recibe [{ini, fin}] y retorna el arreglo fusionado sin solapamientos.
function _fusionarIntervalos(bloques) {
  if (!bloques || bloques.length === 0) return [];
  const s = bloques.slice().sort((a, b) => a.ini - b.ini);
  const merged = [{ ini: s[0].ini, fin: s[0].fin }];
  for (let i = 1; i < s.length; i++) {
    const last = merged[merged.length - 1];
    if (s[i].ini <= last.fin) {
      if (s[i].fin > last.fin) last.fin = s[i].fin;
    } else {
      merged.push({ ini: s[i].ini, fin: s[i].fin });
    }
  }
  return merged;
}


// ─── HORARIO DEL EQUIPO PARA UN DÍA ───────────────────────────────────────────
// Retorna [{ini, fin}] en minutos. Usa la unión de todos los turnos activos.
// Si el día es festivo retorna [].
function _horarioEquipo(fecha, config) {
  const fechaStr = Utilities.formatDate(fecha, TIMEZONE, 'yyyy-MM-dd');
  if (config.festivos.has(fechaStr)) return [];

  const diaSemana = new Date(
    fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12, 0, 0
  ).getDay();

  const bloques = [];
  config.turnos.forEach(bloquesTurno => {
    bloquesTurno.forEach(b => {
      if (b.diaSemana === diaSemana) bloques.push({ ini: b.ini, fin: b.fin });
    });
  });

  if (bloques.length === 0) return [];
  return _fusionarIntervalos(bloques);
}


// ─── HORARIO DEL ANALISTA PARA UN DÍA ─────────────────────────────────────────
// Retorna [{ini, fin}] considerando:
//   - Su turno vigente en esa fecha
//   - Sus horas extra ese día (pueden añadir bloques en festivos también)
// Si no tiene turno asignado, usa el horario del equipo como fallback.
function _horarioAnalista(fecha, email, config) {
  const fechaStr = Utilities.formatDate(fecha, TIMEZONE, 'yyyy-MM-dd');
  const emailLower = (email || '').toLowerCase().trim();
  const keyExtra = emailLower + '|' + fechaStr;
  const extras = (config.horasExtra.get(keyExtra) || []).map(e => ({ ini: e.ini, fin: e.fin }));

  if (config.festivos.has(fechaStr)) {
    return _fusionarIntervalos(extras);
  }

  // Día de referencia al mediodía para evitar problemas de DST en getDay()
  const diaSemana = new Date(
    fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12, 0, 0
  ).getDay();

  // Buscar turno vigente para este analista en esta fecha
  const fechaTs = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
  const asignaciones = config.analistaTurnos.get(emailLower) || [];
  let idTurnoVigente = null;

  for (const asig of asignaciones) {
    const desdeTs = new Date(
      asig.desde.getFullYear(), asig.desde.getMonth(), asig.desde.getDate()
    ).getTime();
    const hastaTs = asig.hasta
      ? new Date(asig.hasta.getFullYear(), asig.hasta.getMonth(), asig.hasta.getDate(), 23, 59).getTime()
      : Infinity;
    if (fechaTs >= desdeTs && fechaTs <= hastaTs) {
      idTurnoVigente = asig.idTurno;
      break;
    }
  }

  let bloquesBase = [];
  if (idTurnoVigente && config.turnos.has(idTurnoVigente)) {
    config.turnos.get(idTurnoVigente).forEach(b => {
      if (b.diaSemana === diaSemana) bloquesBase.push({ ini: b.ini, fin: b.fin });
    });
  } else {
    bloquesBase = _horarioEquipo(fecha, config);
  }

  return _fusionarIntervalos([...bloquesBase, ...extras]);
}


// ─── ALGORITMO PRINCIPAL ───────────────────────────────────────────────────────
// Suma los minutos hábiles entre tInicio y tFin usando fnHorario(Date) → [{ini,fin}].
function _minutosHabiles(tInicio, tFin, fnHorario) {
  if (!(tInicio instanceof Date) || !(tFin instanceof Date)) return 0;
  if (tInicio >= tFin) return 0;

  let total = 0;
  const dIni = new Date(tInicio.getFullYear(), tInicio.getMonth(), tInicio.getDate());
  const dFin = new Date(tFin.getFullYear(), tFin.getMonth(), tFin.getDate());

  for (let d = new Date(dIni.getTime()); d <= dFin; d.setDate(d.getDate() + 1)) {
    const bloques = fnHorario(d);
    for (const b of bloques) {
      const bIniDt = new Date(d.getFullYear(), d.getMonth(), d.getDate(),
                               Math.floor(b.ini / 60), b.ini % 60, 0);
      const bFinDt = new Date(d.getFullYear(), d.getMonth(), d.getDate(),
                               Math.floor(b.fin / 60), b.fin % 60, 0);
      const corteIni = tInicio > bIniDt ? tInicio : bIniDt;
      const corteFin  = tFin   < bFinDt ? tFin   : bFinDt;
      if (corteIni < corteFin) {
        total += (corteFin.getTime() - corteIni.getTime()) / 60000;
      }
    }
  }
  return total;
}


// ─── PARSER DE FECHAS ─────────────────────────────────────────────────────────
// Convierte strings de fecha (dd/MM/yyyy HH:mm, ISO, etc.) a Date.
// Necesario porque GAS a veces almacena fechas como texto con setNumberFormat("@").
function _parseFechaGAS(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) return valor;
  if (!valor) return null;
  const s = String(valor).trim();
  if (!s) return null;
  // ISO: "2026-06-15 21:32" o "2026-06-15T21:32:00"
  let d = new Date(s.replace(' ', 'T'));
  if (!isNaN(d.getTime())) return d;
  // Formato dd/MM/yyyy HH:mm:ss  o  dd/MM/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]),
                 parseInt(m[4] || 0), parseInt(m[5] || 0), parseInt(m[6] || 0));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// ─── PUNTO DE ENTRADA PÚBLICO ──────────────────────────────────────────────────
/**
 * Calcula los tres tiempos hábiles de un caso.
 *
 * @param {Date}   tRadicacion   - Fecha/hora en que llegó el caso.
 * @param {Date}   tAsignacion   - Fecha/hora en que fue asignado al analista.
 * @param {Date}   tResultado    - Fecha/hora en que el analista guardó el resultado (ahora).
 * @param {string} emailAnalista - Email del analista asignado (para su horario de turno).
 * @returns {{ minutos_cola: number, minutos_gestion: number, minutos_general: number }}
 */
function calcularTiemposCaso(tRadicacion, tAsignacion, tResultado, emailAnalista) {
  if (!(tResultado instanceof Date) || isNaN(tResultado.getTime())) {
    return { minutos_cola: 0, minutos_gestion: 0, minutos_general: 0 };
  }

  const config = _cargarConfigHoraria();
  Logger.log('[MotorTiempos] turnos cargados: ' + config.turnos.size +
    ' | tRad=' + tRadicacion + ' | tAsi=' + tAsignacion +
    ' | festivos=' + config.festivos.size +
    ' | analistaTurnos=' + config.analistaTurnos.size);
  const fnEquipo   = (d) => _horarioEquipo(d, config);
  const fnAnalista = (d) => _horarioAnalista(d, emailAnalista, config);

  const tRadOk = tRadicacion instanceof Date && !isNaN(tRadicacion.getTime());
  const tAsiOk = tAsignacion instanceof Date && !isNaN(tAsignacion.getTime());

  let minutos_cola    = 0;
  let minutos_gestion = 0;

  if (tRadOk && tAsiOk) {
    minutos_cola = _minutosHabiles(tRadicacion, tAsignacion, fnEquipo);
  } else if (tRadOk) {
    minutos_cola = _minutosHabiles(tRadicacion, tResultado, fnEquipo);
  }

  if (tAsiOk) {
    minutos_gestion = _minutosHabiles(tAsignacion, tResultado, fnAnalista);
  }

  const minutos_general = minutos_cola + minutos_gestion;

  return {
    minutos_cola:    Number(minutos_cola.toFixed(2)),
    minutos_gestion: Number(minutos_gestion.toFixed(2)),
    minutos_general: Number(minutos_general.toFixed(2))
  };
}
