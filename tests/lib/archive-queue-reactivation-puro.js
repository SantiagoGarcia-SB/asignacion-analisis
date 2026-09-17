/**
 * Adaptador aislado de exploración para el contrato corregido de
 * admin_desarchivarBiometrias. No invoca Apps Script ni servicios externos.
 * Reproduce sus decisiones observables con dependencias instrumentadas.
 */

const MAX_CANDIDATAS = 100;
const CLAVES_SOLICITUD = ['fechaConsultaSai', 'cantidad'];

function esFechaCalendarioEstrica(value, hoy = '2026-04-19') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const fecha = new Date(Date.UTC(year, month - 1, day));
  return fecha.getUTCFullYear() === year
    && fecha.getUTCMonth() === month - 1
    && fecha.getUTCDate() === day
    && value <= hoy;
}

function esSolicitudExacta(request, hoy) {
  if (!request || Array.isArray(request) || Object.getPrototypeOf(request) !== Object.prototype) return false;
  const claves = Object.keys(request).sort();
  if (claves.length !== CLAVES_SOLICITUD.length
    || claves.some((clave, index) => clave !== CLAVES_SOLICITUD.slice().sort()[index])) return false;
  return esFechaCalendarioEstrica(request.fechaConsultaSai, hoy)
    && typeof request.cantidad === 'number'
    && Number.isSafeInteger(request.cantidad)
    && request.cantidad >= 1
    && request.cantidad <= MAX_CANDIDATAS;
}

function esCantidadMaximaExcedida(request, hoy) {
  return request
    && !Array.isArray(request)
    && Object.getPrototypeOf(request) === Object.prototype
    && Object.keys(request).sort().join(',') === CLAVES_SOLICITUD.slice().sort().join(',')
    && esFechaCalendarioEstrica(request.fechaConsultaSai, hoy)
    && typeof request.cantidad === 'number'
    && Number.isSafeInteger(request.cantidad)
    && request.cantidad > MAX_CANDIDATAS;
}

function crearEntornoExploracion({ rows, saiPorSolicitud = {}, hoy = '2026-04-19' }) {
  const metricas = {
    saiCalls: [], lockAttempts: 0, queueWrites: 0, phaseWrites: 0,
    sheetMutations: 0, forbiddenAccesses: [], propertyAccesses: [],
    physicalFieldAccesses: [], relojMs: 0, persistenceCalls: 0,
    selectedSolicitudes: [],
  };

  const filas = rows.map((row, index) => {
    const fila = { ...row, fila: index + 2 };
    Object.defineProperty(fila, 'origen', { value: row, enumerable: false });
    for (const campo of ['fechaResultado', 'fechaActualizacionFase']) {
      const valor = fila[campo];
      Object.defineProperty(fila, campo, {
        enumerable: true,
        get() {
          metricas.forbiddenAccesses.push(campo);
          return valor;
        },
      });
    }
    return fila;
  });

  return {
    filas,
    hoy,
    metricas,
    consultarSai(solicitud) {
      metricas.saiCalls.push({ solicitud, timestampMs: metricas.relojMs });
      return saiPorSolicitud[solicitud] ?? null;
    },
    sleep(ms) { metricas.relojMs += ms; },
  };
}

function clasificarRespuestaSai(datosSai) {
  if (!datosSai || typeof datosSai !== 'object' || Array.isArray(datosSai)) return 'REINTENTABLE';
  if (datosSai.resultCode === undefined || datosSai.studyStatus === undefined
    || datosSai.mainResultCode === undefined || datosSai.requestType === undefined) return 'REINTENTABLE';

  const resultCode = String(datosSai.resultCode).trim();
  const studyStatus = String(datosSai.studyStatus).trim().toUpperCase();
  const mainResultCode = String(datosSai.mainResultCode).trim();
  const requestType = String(datosSai.requestType).trim().toUpperCase();
  return resultCode === '500'
    && studyStatus === 'APROBADO_PENDIENTE_BIOMETRIA'
    && mainResultCode === '2'
    && requestType !== 'AC'
    && requestType !== 'AV'
    ? 'ELEGIBLE'
    : 'RESUELTA';
}

function seleccionarCandidatasCorregidas(filas, fechaConsultaSai, cantidad, hoy) {
  return filas
    .filter((fila) => String(fila.phase || '').trim().toUpperCase() === 'ARCHIVADA'
      && String(fila.solicitudId || '').trim() !== ''
      && esFechaCalendarioEstrica(fila.fechaConsultaSai, hoy)
      && fila.fechaConsultaSai === fechaConsultaSai)
    .slice(0, Math.min(cantidad, MAX_CANDIDATAS));
}

/** Ejecuta el contrato corregido con adaptadores sin I/O real. */
function ejecutarReactivacionActual(request, entorno) {
  const { filas, metricas, hoy } = entorno;
  if (esCantidadMaximaExcedida(request, hoy)) {
    return {
      success: false,
      errorCode: 'CANTIDAD_MAXIMA_EXCEDIDA',
      maxCantidad: MAX_CANDIDATAS,
      message: 'El máximo de desarchivado por operación es 100.',
    };
  }
  if (!esSolicitudExacta(request, hoy)) {
    return { success: false, errorCode: 'SOLICITUD_INVALIDA', message: 'La solicitud de desarchivado no es válida.' };
  }

  const candidatos = seleccionarCandidatasCorregidas(filas, request.fechaConsultaSai, request.cantidad, hoy);
  metricas.selectedSolicitudes = candidatos.map((fila) => String(fila.solicitudId).trim());
  if (candidatos.length === 0) {
    return { success: true, message: 'No hay biometrías archivadas para recuperar.', restauradas: 0, yaResueltas: 0, sinRespuestaSai: 0 };
  }

  const cambios = [];
  const elegibles = [];
  let yaResueltas = 0;
  let sinRespuestaSai = 0;
  let ultimoIntentoMs = null;
  for (const fila of candidatos) {
    if (ultimoIntentoMs !== null) entorno.sleep(Math.max(0, 1000 - (metricas.relojMs - ultimoIntentoMs)));
    const solicitud = String(fila.solicitudId).trim();
    const datosSai = entorno.consultarSai(solicitud);
    ultimoIntentoMs = metricas.relojMs;
    const clasificacion = clasificarRespuestaSai(datosSai);
    if (clasificacion === 'REINTENTABLE') {
      sinRespuestaSai += 1;
      continue;
    }
    if (clasificacion === 'RESUELTA') {
      cambios.push({ fila, nuevaFase: 'RESUELTA' });
      yaResueltas += 1;
      continue;
    }
    elegibles.push({ fila, solicitud });
    cambios.push({ fila, nuevaFase: 'ESCALADA' });
  }

  if (elegibles.length > 0) {
    metricas.persistenceCalls += 1;
    metricas.queueWrites += elegibles.length;
    metricas.sheetMutations += elegibles.length;
  }
  metricas.lockAttempts += 1;
  for (const cambio of cambios) {
    cambio.fila.phase = cambio.nuevaFase;
    cambio.fila.origen.phase = cambio.nuevaFase;
    metricas.phaseWrites += 1;
    metricas.sheetMutations += 1;
  }

  return {
    success: true,
    message: `${elegibles.length} biometría(s) repuestas en la cola de llamada.`,
    restauradas: elegibles.length,
    yaResueltas,
    sinRespuestaSai,
  };
}

function candidatosEsperados(request, rows, hoy = '2026-04-19') {
  if (!esSolicitudExacta(request, hoy)) return [];
  return rows
    .filter((row) => String(row.phase || '').trim().toUpperCase() === 'ARCHIVADA'
      && String(row.solicitudId || '').trim() !== ''
      && esFechaCalendarioEstrica(row.fechaConsultaSai, hoy)
      && row.fechaConsultaSai === request.fechaConsultaSai)
    .slice(0, request.cantidad);
}

function expectedBehavior({ request, rows, hoy = '2026-04-19' }) {
  if (esCantidadMaximaExcedida(request, hoy)) {
    return { success: false, errorCode: 'CANTIDAD_MAXIMA_EXCEDIDA', maxCantidad: 100 };
  }
  if (!esSolicitudExacta(request, hoy)) return { success: false, errorCode: 'SOLICITUD_INVALIDA' };
  return { success: true, selected: candidatosEsperados(request, rows, hoy) };
}

function isBugCondition({ request, rows, response, metricas, hoy = '2026-04-19' }) {
  const esperado = expectedBehavior({ request, rows, hoy });
  const tuvoEfectos = metricas.saiCalls.length > 0 || metricas.lockAttempts > 0
    || metricas.queueWrites > 0 || metricas.phaseWrites > 0 || metricas.sheetMutations > 0;
  if (!esperado.success) {
    if (esperado.errorCode === 'CANTIDAD_MAXIMA_EXCEDIDA') {
      return response.errorCode !== esperado.errorCode || response.maxCantidad !== 100 || tuvoEfectos;
    }
    return tuvoEfectos;
  }
  const esperadas = metricas.selectedSolicitudes.length > 0
    ? metricas.selectedSolicitudes
    : esperado.selected.map((row) => row.solicitudId);
  const observadas = metricas.saiCalls.map((call) => call.solicitud);
  const gaps = metricas.saiCalls.slice(1).map((call, index) => call.timestampMs - metricas.saiCalls[index].timestampMs);
  return JSON.stringify(esperadas) !== JSON.stringify(observadas)
    || gaps.some((gap) => gap < 1000)
    || metricas.forbiddenAccesses.length > 0;
}

export {
  MAX_CANDIDATAS,
  candidatosEsperados,
  crearEntornoExploracion,
  ejecutarReactivacionActual,
  esCantidadMaximaExcedida,
  esFechaCalendarioEstrica,
  esSolicitudExacta,
  expectedBehavior,
  isBugCondition,
};
