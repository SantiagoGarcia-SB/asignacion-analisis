/**
 * ============================================================
 * Biometria Cycle Integrity — Funciones Puras (exportables para testing)
 * ============================================================
 *
 * Este módulo contiene implementaciones PURAS (sin I/O, sin SpreadsheetApp,
 * sin LockService) que replican la lógica actual (UNFIXED) del ciclo de
 * biometría. Permite testear con fast-check via Vitest en Node.js para
 * exponer los cuatro bugs documentados.
 *
 * Patrón equivalente al de tests/lib/guardar-y-asignar-puro.js
 */

// ============================================================
// Bug 1: Manejo de respuesta null de SAI en _procesarCortePendientes
// ============================================================

/**
 * Simula la lógica ACTUAL (FIXED) del manejo de un caso individual en
 * _procesarCortePendientes() cuando SAI responde null.
 *
 * En el código FIJO (Biometria.js): cuando datosApi es null, se incrementa un
 * retry counter persistido. Si alcanza el threshold → escalación con SAI_NO_CONFIRMO.
 * Si no → permanece en WA_ENVIADO con counter incrementado.
 *
 * @param {Object} params
 * @param {string} params.consecutivo - ID del caso
 * @param {string} params.fase - Fase actual (siempre "WA_ENVIADO" para entrar aquí)
 * @param {Function} params.consultarSaiFn - () => datosApi | null
 * @param {number} params.intentosPrevios - Intentos anteriores
 * @param {number} params.threshold - Umbral configurable
 * @returns {{ nuevaFase: string, escalado: boolean, intentosActuales: number }}
 */
function procesarCasoSaiNull_actual(params) {
  const { consecutivo, fase, consultarSaiFn, intentosPrevios, threshold } = params;

  const datosApi = consultarSaiFn(consecutivo);

  if (!datosApi) {
    const intentosActuales = intentosPrevios + 1;
    if (intentosActuales >= threshold) {
      // Escalar con flag SAI_NO_CONFIRMO
      return { nuevaFase: "ESCALADA", escalado: true, intentosActuales: intentosActuales };
    }
    // Aún no alcanza threshold — permanece en WA_ENVIADO con counter incrementado
    return { nuevaFase: "WA_ENVIADO", escalado: false, intentosActuales: intentosActuales };
  }

  // Ruta normal: SAI respondió con datos — reset counter
  const statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();
  if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA") {
    return { nuevaFase: "RESUELTA", escalado: false, intentosActuales: 0 };
  }
  return { nuevaFase: "ESCALADA", escalado: true, intentosActuales: 0 };
}

/**
 * Simula la lógica ESPERADA (fixed) del manejo de un caso individual con
 * SAI null — con retry counter y escalación tras threshold.
 *
 * @param {Object} params - Mismos parámetros que procesarCasoSaiNull_actual
 * @returns {{ nuevaFase: string, escalado: boolean, intentosActuales: number }}
 */
function procesarCasoSaiNull_esperado(params) {
  const { consecutivo, fase, consultarSaiFn, intentosPrevios, threshold } = params;

  const datosApi = consultarSaiFn(consecutivo);

  if (!datosApi) {
    const intentosActuales = intentosPrevios + 1;
    if (intentosActuales >= threshold) {
      // Escalar con flag SAI_NO_CONFIRMO
      return { nuevaFase: "ESCALADA", escalado: true, intentosActuales: intentosActuales };
    }
    // Aún no alcanza threshold — permanece en WA_ENVIADO con counter incrementado
    return { nuevaFase: "WA_ENVIADO", escalado: false, intentosActuales: intentosActuales };
  }

  // Ruta normal: SAI respondió con datos — reset counter
  const statusActual = String(datosApi.studyStatus || "").toUpperCase().trim();
  if (statusActual !== "APROBADO_PENDIENTE_BIOMETRIA") {
    return { nuevaFase: "RESUELTA", escalado: false, intentosActuales: 0 };
  }
  return { nuevaFase: "ESCALADA", escalado: true, intentosActuales: 0 };
}

// ============================================================
// Bug 2: Orden de operaciones en admin_desarchivarBiometrias
// ============================================================

/**
 * Simula la lógica ACTUAL (FIXED) de admin_desarchivarBiometrias cuando
 * procesarYGuardarLote lanza excepción.
 *
 * Código fijo: llama procesarYGuardarLote PRIMERO, y solo marca ESCALADA
 * si la escritura tiene éxito. Si falla → casos permanecen ARCHIVADA.
 *
 * @param {Object} params
 * @param {Array<Object>} params.casosParaReponer - Casos que pasan filtro SAI
 * @param {Function} params.procesarYGuardarLoteFn - () => void | throws
 * @returns {{ faseFinal: string[], exito: boolean, error: string|null }}
 */
function desarchivarBiometrias_actual(params) {
  const { casosParaReponer, procesarYGuardarLoteFn } = params;

  if (casosParaReponer.length === 0) {
    return { faseFinal: [], exito: true, error: null };
  }

  // Fixed: intenta escribir PRIMERO
  try {
    procesarYGuardarLoteFn(casosParaReponer);
  } catch (e) {
    // Error: NO marca ESCALADA — permanecen ARCHIVADA
    const faseFinal = casosParaReponer.map(() => "ARCHIVADA");
    return { faseFinal: faseFinal, exito: false, error: e.message };
  }

  // Éxito: ahora sí marca ESCALADA
  const faseFinal = casosParaReponer.map(() => "ESCALADA");
  return { faseFinal: faseFinal, exito: true, error: null };
}

/**
 * Simula la lógica ESPERADA (fixed) de admin_desarchivarBiometrias:
 * escribe PRIMERO en "solicitud" y solo marca ESCALADA si tiene éxito.
 *
 * @param {Object} params - Mismos parámetros que desarchivarBiometrias_actual
 * @returns {{ faseFinal: string[], exito: boolean, error: string|null }}
 */
function desarchivarBiometrias_esperado(params) {
  const { casosParaReponer, procesarYGuardarLoteFn } = params;

  if (casosParaReponer.length === 0) {
    return { faseFinal: [], exito: true, error: null };
  }

  // Fixed: intenta escribir PRIMERO
  try {
    procesarYGuardarLoteFn(casosParaReponer);
  } catch (e) {
    // Error: NO marca ESCALADA — permanecen ARCHIVADA
    const faseFinal = casosParaReponer.map(() => "ARCHIVADA");
    return { faseFinal: faseFinal, exito: false, error: e.message };
  }

  // Éxito: ahora sí marca ESCALADA
  const faseFinal = casosParaReponer.map(() => "ESCALADA");
  return { faseFinal: faseFinal, exito: true, error: null };
}

// ============================================================
// Bug 3: Constante usada en autoAsignarBiometria
// ============================================================

/**
 * Simula la lógica ACTUAL (buggy) de autoAsignarBiometria que usa
 * ID_WAREHOUSE_USUARIOS para abrir la hoja "solicitud", mientras
 * procesarYGuardarLote escribe a TARGET_SOLICITUDES_SS_ID.
 *
 * @param {Object} params
 * @param {string} params.constanteUsada - Constante que usa autoAsignar para leer
 * @param {string} params.constanteEscritura - Constante que usa procesarYGuardarLote para escribir
 * @returns {{ mismaConstante: boolean, constanteLectura: string, constanteEscritura: string }}
 */
function verificarConstanteSolicitud_actual(params) {
  const { constanteUsada, constanteEscritura } = params;
  return {
    mismaConstante: constanteUsada === constanteEscritura,
    constanteLectura: constanteUsada,
    constanteEscritura: constanteEscritura,
  };
}

// Valores actuales del código (ambas apuntan al mismo ID, pero son constantes separadas)
const ID_WAREHOUSE_USUARIOS_VALUE = '1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0';
const TARGET_SOLICITUDES_SS_ID_VALUE = '1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0';

// Bug 3 fix applied: autoAsignarBiometria ahora usa "TARGET_SOLICITUDES_SS_ID"
// (la misma constante que procesarYGuardarLote usa para escribir).
// Se eliminó el acoplamiento frágil con ID_WAREHOUSE_USUARIOS.
const CONSTANTE_USADA_POR_AUTOASIGNAR = 'TARGET_SOLICITUDES_SS_ID';
const CONSTANTE_USADA_POR_ESCRIBIR = 'TARGET_SOLICITUDES_SS_ID';

// ============================================================
// Bug 4: Comparación de frontera (>= vs >)
// ============================================================

/**
 * Calcula el límite de liberación de desaplazamiento (replica exacta de
 * _calcularLimiteLiberacionDesaplazamiento en Biometria.js).
 *
 * @param {Date} ahora - Fecha/hora actual
 * @returns {Date} Límite: hoy 00:00 si mañana, hoy 12:00 si tarde
 */
function calcularLimiteLiberacion(ahora) {
  const hoy00 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (ahora.getHours() < 12) return hoy00;
  return new Date(hoy00.getTime() + 12 * 60 * 60 * 1000);
}

/**
 * Simula el filtro ACTUAL (buggy) de candidatos: usa >= para excluir.
 * Un caso con fechaResultado EXACTAMENTE en el límite es EXCLUIDO.
 *
 * @param {number} fechaResultadoMs - Timestamp del fechaResultado del caso
 * @param {number} limiteMs - Timestamp del límite de liberación
 * @returns {boolean} true si el caso debe ser INCLUIDO (ofrecido), false si se filtra (excluido)
 */
function filtrarCandidato_actual(fechaResultadoMs, limiteMs) {
  // Replica: if (fechaResultadoMs > limiteMs) continue; // excluir (fixed: usa >)
  if (fechaResultadoMs === 9999999999999) return true; // fecha inválida → no filtrar
  if (fechaResultadoMs > limiteMs) return false; // Fixed: solo excluye estrictamente después
  return true; // incluir
}

/**
 * Simula el filtro ESPERADO (fixed): usa > para excluir.
 * Un caso con fechaResultado EXACTAMENTE en el límite es INCLUIDO.
 *
 * @param {number} fechaResultadoMs - Timestamp del fechaResultado del caso
 * @param {number} limiteMs - Timestamp del límite de liberación
 * @returns {boolean} true si el caso debe ser INCLUIDO (ofrecido), false si se filtra (excluido)
 */
function filtrarCandidato_esperado(fechaResultadoMs, limiteMs) {
  if (fechaResultadoMs === 9999999999999) return true; // fecha inválida → no filtrar
  if (fechaResultadoMs > limiteMs) return false; // Fixed: solo excluye estrictamente después
  return true; // incluir (incluyendo caso exacto en frontera)
}

// ============================================================
// PRESERVATION: Normal SAI Response (Req 3.1, 3.2)
// ============================================================

/**
 * Simula la lógica ACTUAL del manejo de un caso cuando SAI responde con datos
 * (non-null). Esta ruta ya funciona correctamente y debe preservarse.
 *
 * - Si studyStatus es APROBADO_PENDIENTE_BIOMETRIA → ESCALADA
 * - Si studyStatus cambió (cualquier otro valor) → RESUELTA
 *
 * @param {Object} params
 * @param {string} params.consecutivo - ID del caso
 * @param {Object} params.datosApi - Respuesta de SAI (non-null)
 * @param {string} params.datosApi.studyStatus - Estado actual del caso en SAI
 * @returns {{ nuevaFase: string, escalado: boolean }}
 */
function procesarCasoSaiNonNull_preservacion(params) {
  const { consecutivo, datosApi } = params;

  // SAI respondió con datos — ruta normal (no buggy)
  const statusActual = String(datosApi.studyStatus || '').toUpperCase().trim();

  if (statusActual === 'APROBADO_PENDIENTE_BIOMETRIA') {
    // Caso sigue pendiente de biometría → escalamos al motor de asignación
    return { nuevaFase: 'ESCALADA', escalado: true };
  }

  // Status cambió (resuelto, rechazado, etc.) → marcar RESUELTA
  return { nuevaFase: 'RESUELTA', escalado: false };
}

// ============================================================
// PRESERVATION: Successful Desarchivar (Req 3.3)
// ============================================================

/**
 * Simula la lógica ACTUAL de admin_desarchivarBiometrias cuando
 * procesarYGuardarLote tiene ÉXITO. Los casos se marcan ESCALADA y
 * el admin recibe el conteo. Esta ruta ya funciona correctamente.
 *
 * @param {Object} params
 * @param {Array<Object>} params.casosParaReponer - Casos que pasan filtro SAI
 * @param {Function} params.procesarYGuardarLoteFn - () => void (no lanza)
 * @returns {{ faseFinal: string[], exito: boolean, mensajeAdmin: string }}
 */
function desarchivarBiometriasExitoso_preservacion(params) {
  const { casosParaReponer, procesarYGuardarLoteFn } = params;

  if (casosParaReponer.length === 0) {
    return { faseFinal: [], exito: true, mensajeAdmin: 'No hay casos para reponer' };
  }

  // En código actual: marca ESCALADA primero (bug para caso de fallo),
  // pero cuando TODO sale bien, la secuencia es:
  // 1. Marca ESCALADA
  // 2. Llama procesarYGuardarLote (éxito)
  // 3. Reporta al admin
  const faseFinal = casosParaReponer.map(() => 'ESCALADA');

  // Llama procesarYGuardarLote — éxito
  procesarYGuardarLoteFn(casosParaReponer);

  const mensajeAdmin = `Se repusieron ${casosParaReponer.length} caso(s) en la cola de asignación`;

  return { faseFinal, exito: true, mensajeAdmin };
}

// ============================================================
// PRESERVATION: Non-Boundary Filtering (Req 3.5, 3.6)
// ============================================================

/**
 * Verifica que para fechaResultado estrictamente ANTES del límite,
 * AMBOS operadores (>= y >) producen el mismo resultado: INCLUIR.
 *
 * @param {number} fechaResultadoMs - Timestamp del fechaResultado
 * @param {number} limiteMs - Timestamp del límite
 * @returns {{ incluidoConActual: boolean, incluidoConFix: boolean, coinciden: boolean }}
 */
function filtrarNoBoundary_preservacion(fechaResultadoMs, limiteMs) {
  if (fechaResultadoMs === 9999999999999) {
    // fecha inválida — ambos la incluyen
    return { incluidoConActual: true, incluidoConFix: true, coinciden: true };
  }

  // Operador actual: >= excluye
  const incluidoConActual = !(fechaResultadoMs >= limiteMs);
  // Operador fix: > excluye
  const incluidoConFix = !(fechaResultadoMs > limiteMs);

  return { incluidoConActual, incluidoConFix, coinciden: incluidoConActual === incluidoConFix };
}

// ============================================================
// PRESERVATION: _volcarBloque Protective Pattern (Req 3.7)
// ============================================================

/**
 * Simula la lógica ACTUAL de _volcarBloque() que ya tiene el patrón
 * protectivo correcto: try/catch alrededor de procesarYGuardarLote,
 * y marca ESCALADA SOLO si tiene éxito. Este patrón ya funciona y
 * debe preservarse tras el fix.
 *
 * @param {Object} params
 * @param {Array<Object>} params.bloque - Casos del bloque a volcar
 * @param {Function} params.procesarYGuardarLoteFn - () => void | throws
 * @returns {{ faseFinal: string[], exito: boolean, error: string|null }}
 */
function volcarBloque_preservacion(params) {
  const { bloque, procesarYGuardarLoteFn } = params;

  if (bloque.length === 0) {
    return { faseFinal: [], exito: true, error: null };
  }

  // Patrón protectivo de _volcarBloque:
  // 1. Intenta procesarYGuardarLote
  // 2. SOLO si tiene éxito → marca ESCALADA
  // 3. Si falla → deja en estado anterior, log error
  try {
    procesarYGuardarLoteFn(bloque);
    // Éxito: marca ESCALADA
    const faseFinal = bloque.map(() => 'ESCALADA');
    return { faseFinal, exito: true, error: null };
  } catch (e) {
    // Fallo: no marca ESCALADA — casos permanecen sin cambiar fase
    const faseFinal = bloque.map((c) => c.faseAnterior || 'WA_ENVIADO');
    return { faseFinal, exito: false, error: e.message };
  }
}

// ============================================================
// PRESERVATION: Assignment Ordering (Req 3.4)
// ============================================================

/**
 * Simula la lógica de ordenamiento y filtrado de asignación.
 * Los casos se ordenan por fechaResultado (más antiguo primero)
 * y se limitan por cupo disponible.
 *
 * @param {Object} params
 * @param {Array<Object>} params.casosDisponibles - Casos con fechaResultadoMs
 * @param {number} params.cupoDisponible - Número máximo de casos a asignar
 * @param {number} params.limiteMs - Timestamp del límite de liberación
 * @returns {{ casosSeleccionados: Array<Object>, cantidadAsignada: number }}
 */
function asignarConOrden_preservacion(params) {
  const { casosDisponibles, cupoDisponible, limiteMs } = params;

  // Filtrar: excluir los que están después del límite (usando >= actual)
  const candidatos = casosDisponibles.filter((c) => {
    if (c.fechaResultadoMs === 9999999999999) return true;
    return c.fechaResultadoMs < limiteMs; // strictly before (NOT at boundary)
  });

  // Ordenar por fechaResultado ascendente (más antiguo primero)
  const ordenados = [...candidatos].sort((a, b) => a.fechaResultadoMs - b.fechaResultadoMs);

  // Limitar por cupo
  const casosSeleccionados = ordenados.slice(0, Math.max(0, cupoDisponible));

  return {
    casosSeleccionados,
    cantidadAsignada: casosSeleccionados.length,
  };
}

// ============================================================
// EXPORTS
// ============================================================

export {
  // Bug 1
  procesarCasoSaiNull_actual,
  procesarCasoSaiNull_esperado,
  // Bug 2
  desarchivarBiometrias_actual,
  desarchivarBiometrias_esperado,
  // Bug 3
  verificarConstanteSolicitud_actual,
  ID_WAREHOUSE_USUARIOS_VALUE,
  TARGET_SOLICITUDES_SS_ID_VALUE,
  CONSTANTE_USADA_POR_AUTOASIGNAR,
  CONSTANTE_USADA_POR_ESCRIBIR,
  // Bug 4
  calcularLimiteLiberacion,
  filtrarCandidato_actual,
  filtrarCandidato_esperado,
  // Preservation
  procesarCasoSaiNonNull_preservacion,
  desarchivarBiometriasExitoso_preservacion,
  filtrarNoBoundary_preservacion,
  volcarBloque_preservacion,
  asignarConOrden_preservacion,
};
