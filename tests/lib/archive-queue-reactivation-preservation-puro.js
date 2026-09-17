/**
 * Adaptadores puros que reproducen las rutas no defectuosas observadas en
 * Biometria.js y Código.js para las propiedades de preservación.
 */

const FASE_ARCHIVADA = 'ARCHIVADA';
const FASE_ESCALADA = 'ESCALADA';
const FASE_ASIGNADA = 'ASIGNADA';
const FASE_RESUELTA = 'RESUELTA';
const FECHA_NO_INTERPRETABLE = 9999999999999;

/**
 * Normaliza una fecha igual que _parseDateUnif para el orden posterior.
 * @param {unknown} fechaResultado Fecha que proviene de solicitud.
 * @returns {number} Milisegundos normalizados o centinela de fecha no interpretable.
 */
function normalizarFechaResultado(fechaResultado) {
  if (!fechaResultado || String(fechaResultado).trim() === '') return FECHA_NO_INTERPRETABLE;
  if (fechaResultado instanceof Date) return fechaResultado.getTime();

  try {
    const texto = String(fechaResultado).trim();
    const partes = texto.split(' ');
    const partesFecha = partes[0].split(/[/-]/);
    let horas = 0;
    let minutos = 0;
    let segundos = 0;

    if (partes.length > 1) {
      const partesHora = partes[1].split(':');
      horas = parseInt(partesHora[0], 10) || 0;
      minutos = parseInt(partesHora[1], 10) || 0;
      segundos = parseInt(partesHora[2], 10) || 0;
    }

    if (partesFecha.length === 3) {
      if (partesFecha[0].length === 4) {
        return new Date(
          parseInt(partesFecha[0], 10),
          parseInt(partesFecha[1], 10) - 1,
          parseInt(partesFecha[2], 10),
          horas,
          minutos,
          segundos
        ).getTime();
      }
      return new Date(
        parseInt(partesFecha[2], 10),
        parseInt(partesFecha[1], 10) - 1,
        parseInt(partesFecha[0], 10),
        horas,
        minutos,
        segundos
      ).getTime();
    }

    const fechaAlterna = new Date(fechaResultado).getTime();
    return Number.isNaN(fechaAlterna) ? FECHA_NO_INTERPRETABLE : fechaAlterna;
  } catch (_error) {
    return FECHA_NO_INTERPRETABLE;
  }
}

/**
 * Ordena casos confirmados para una ejecución posterior de asignación.
 * @param {{id: string, fechaResultado: unknown}[]} casos Casos presentes en solicitud.
 * @param {string|undefined|null} ordenDesaplazamiento Valor leído por asignación.
 * @returns {{id: string, fechaOrden: number}[]} Casos ordenados sin mutar la entrada.
 */
function ordenarAsignacionPosterior(casos, ordenDesaplazamiento) {
  const ordenReciente = (ordenDesaplazamiento || 'RECIENTE_PRIMERO') === 'RECIENTE_PRIMERO';
  return casos
    .map((caso, indice) => ({
      id: caso.id,
      fechaOrden: normalizarFechaResultado(caso.fechaResultado),
      indice,
    }))
    .sort((izquierda, derecha) => {
      const diferencia = ordenReciente
        ? derecha.fechaOrden - izquierda.fechaOrden
        : izquierda.fechaOrden - derecha.fechaOrden;
      return diferencia || izquierda.indice - derecha.indice;
    })
    .map(({ id, fechaOrden }) => ({ id, fechaOrden }));
}

/**
 * Clasifica la ruta observada, restringida al caso no defectuoso de admisión exacta 500.
 * @param {unknown} respuesta Respuesta individual de SAI.
 * @returns {'SIN_RESPUESTA'|'ELEGIBLE'|'RESUELTA'} Resultado de la ruta preservada.
 */
function clasificarSaiPreservado(respuesta) {
  if (!respuesta || typeof respuesta !== 'object') return 'SIN_RESPUESTA';
  const estado = String(respuesta.studyStatus || '').trim().toUpperCase();
  const resultCode = String(respuesta.resultCode || '').trim();
  return estado === 'APROBADO_PENDIENTE_BIOMETRIA' && resultCode === '500'
    ? 'ELEGIBLE'
    : 'RESUELTA';
}

/**
 * Ejecuta los efectos observables de la ruta no defectuosa de reactivación.
 * @param {{id: string, fila: number, fase?: string}[]} candidatas Filas físicas ya seleccionadas.
 * @param {{consultarSai: (id: string) => unknown, persistir: (ids: string[]) => {idsInsertados?: string[], idsYaEnSolicitud?: string[], idsYaEnHistorico?: string[]}, releerFase: (fila: number) => string, escribirFase: (fila: number, fase: string, marcaTiempo: string) => void, tomarLock: () => void, liberarLock: () => void, flush: () => void, ahora: () => string}} adaptadores Efectos externos simulados.
 * @returns {{success: boolean, message: string, restauradas: number, yaResueltas: number, sinRespuestaSai: number, efectos: {saiCalls: string[], persistencias: string[][], lockAttempts: number, relecturas: number[], escrituras: {fila: number, fase: string, marcaTiempo: string}[], flushes: number}, fasesFinales: Map<number, string>}} Resultado y trazas agregadas.
 */
function ejecutarReactivacionPreservada(candidatas, adaptadores) {
  const efectos = {
    saiCalls: [],
    persistencias: [],
    lockAttempts: 0,
    relecturas: [],
    escrituras: [],
    flushes: 0,
  };
  const fasesFinales = new Map(candidatas.map((candidata) => [candidata.fila, candidata.fase || FASE_ARCHIVADA]));

  if (candidatas.length === 0) {
    return {
      success: true,
      message: 'No hay biometrías archivadas para recuperar.',
      restauradas: 0,
      yaResueltas: 0,
      sinRespuestaSai: 0,
      efectos,
      fasesFinales,
    };
  }

  const elegibles = [];
  const transiciones = [];
  let yaResueltas = 0;
  let sinRespuestaSai = 0;

  candidatas.forEach((candidata) => {
    efectos.saiCalls.push(candidata.id);
    const rutaSai = clasificarSaiPreservado(adaptadores.consultarSai(candidata.id));
    if (rutaSai === 'SIN_RESPUESTA') {
      sinRespuestaSai += 1;
      return;
    }
    if (rutaSai === 'RESUELTA') {
      yaResueltas += 1;
      transiciones.push({ candidata, fase: FASE_RESUELTA, requiereConfirmacion: false });
      return;
    }
    elegibles.push(candidata);
  });

  let resultadoPersistencia = { idsInsertados: [], idsYaEnSolicitud: [], idsYaEnHistorico: [] };
  if (elegibles.length > 0) {
    const idsElegibles = elegibles.map((candidata) => candidata.id);
    efectos.persistencias.push(idsElegibles.slice());
    resultadoPersistencia = adaptadores.persistir(idsElegibles) || resultadoPersistencia;
  }

  const idsConfirmados = new Set([
    ...(resultadoPersistencia.idsInsertados || []),
    ...(resultadoPersistencia.idsYaEnSolicitud || []),
  ]);
  const idsHistoricos = new Set(resultadoPersistencia.idsYaEnHistorico || []);
  elegibles.forEach((candidata) => {
    if (idsConfirmados.has(candidata.id)) {
      transiciones.push({ candidata, fase: FASE_ESCALADA, requiereConfirmacion: true });
    } else if (idsHistoricos.has(candidata.id)) {
      transiciones.push({ candidata, fase: FASE_ASIGNADA, requiereConfirmacion: true });
    }
  });

  if (transiciones.length > 0) {
    efectos.lockAttempts += 1;
    adaptadores.tomarLock();
    try {
      transiciones.forEach((transicion) => {
        efectos.relecturas.push(transicion.candidata.fila);
        if (String(adaptadores.releerFase(transicion.candidata.fila)).trim().toUpperCase() !== FASE_ARCHIVADA) return;
        const marcaTiempo = adaptadores.ahora();
        adaptadores.escribirFase(transicion.candidata.fila, transicion.fase, marcaTiempo);
        efectos.escrituras.push({ fila: transicion.candidata.fila, fase: transicion.fase, marcaTiempo });
        fasesFinales.set(transicion.candidata.fila, transicion.fase);
      });
      if (efectos.escrituras.length > 0) {
        adaptadores.flush();
        efectos.flushes += 1;
      }
    } finally {
      adaptadores.liberarLock();
    }
  }

  const restauradas = efectos.escrituras.filter((escritura) => escritura.fase === FASE_ESCALADA).length;
  return {
    success: true,
    message: `${restauradas} biometría(s) repuestas en la cola de llamada.`,
    restauradas,
    yaResueltas,
    sinRespuestaSai,
    efectos,
    fasesFinales,
  };
}

export {
  FECHA_NO_INTERPRETABLE,
  FASE_ARCHIVADA,
  FASE_ASIGNADA,
  FASE_ESCALADA,
  FASE_RESUELTA,
  clasificarSaiPreservado,
  ejecutarReactivacionPreservada,
  normalizarFechaResultado,
  ordenarAsignacionPosterior,
};
