/**
 * Lógica pura de rotación para la conciliación SAI de biometrías.
 * Refleja el cursor compuesto y el límite de ciclo usados por Biometria.js.
 */

/**
 * Encuentra el punto exacto de reanudación o su sucesora por fila.
 * @param {{solicitudId: string, filaReal: number}[]} candidatos Candidatos elegibles.
 * @param {{solicitudId: string, filaReal: number}|null} punto Punto persistido.
 * @returns {number} Índice de reanudación o -1 cuando no existe sucesora.
 */
function encontrarIndiceReanudacion(candidatos, punto) {
  if (!punto) return 0;
  const exacto = candidatos.findIndex((candidato) =>
    candidato.solicitudId === punto.solicitudId && candidato.filaReal === punto.filaReal
  );
  if (exacto >= 0) return exacto;
  if (punto.filaReal > 0) {
    return candidatos.findIndex((candidato) => candidato.filaReal >= punto.filaReal);
  }
  return -1;
}

/**
 * Rota una lista desde el cursor compuesto.
 * @param {{solicitudId: string, filaReal: number}[]} candidatos Lista ordenada de candidatos.
 * @param {{solicitudId: string, filaReal: number}|null} cursor Punto de reanudación.
 * @returns {{solicitudId: string, filaReal: number}[]} Orden de consulta para la corrida.
 */
function ordenarDesdeCursor(candidatos, cursor) {
  const indiceInicio = encontrarIndiceReanudacion(candidatos, cursor);
  if (cursor && indiceInicio < 0) return [];
  if (indiceInicio < 1) return candidatos.slice();
  return candidatos.slice(indiceInicio).concat(candidatos.slice(0, indiceInicio));
}

/**
 * Calcula el avance persistible sin iniciar una segunda vuelta sobre no-finalizados.
 * @param {Object} params Datos del lote.
 * @param {{solicitudId: string, filaReal: number}[]} params.candidatos Candidatos elegibles.
 * @param {{solicitudId: string, filaReal: number}|null} params.cursor Cursor de entrada.
 * @param {{solicitudId: string, filaReal: number}|null} params.limiteCiclo Último candidato de la vuelta.
 * @param {number} params.maximoPorLote Límite de candidatos del lote.
 * @param {number} params.totalIntentados Consultas realmente intentadas.
 * @returns {{orden: Object[], hasMore: boolean, pendientes: number, siguientePunto: Object|null, limiteCiclo: Object, cantidadHastaLimite: number}}
 */
function calcularAvanceLote({ candidatos, cursor, limiteCiclo, maximoPorLote, totalIntentados }) {
  const orden = ordenarDesdeCursor(candidatos, cursor);
  const indiceLimite = limiteCiclo
    ? orden.findIndex((candidato) =>
      candidato.solicitudId === limiteCiclo.solicitudId && candidato.filaReal === limiteCiclo.filaReal
    )
    : -1;
  const limiteEfectivo = indiceLimite >= 0 ? indiceLimite : orden.length - 1;
  const cantidadHastaLimite = limiteEfectivo + 1;
  const capacidad = Math.min(orden.length, maximoPorLote, cantidadHastaLimite);
  const intentados = Math.min(Math.max(totalIntentados, 0), capacidad);
  const completoCiclo = intentados >= cantidadHastaLimite;
  const pendientes = completoCiclo ? 0 : orden.length - intentados;

  return {
    orden,
    hasMore: !completoCiclo && pendientes > 0,
    pendientes,
    siguientePunto: !completoCiclo && pendientes > 0 ? orden[intentados] : null,
    limiteCiclo: indiceLimite >= 0 ? limiteCiclo : orden[orden.length - 1],
    cantidadHastaLimite,
  };
}

export { encontrarIndiceReanudacion, ordenarDesdeCursor, calcularAvanceLote };
