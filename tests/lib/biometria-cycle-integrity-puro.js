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

// (El antiguo "Bug 4: Comparación de frontera (>= vs >)" y sus funciones de
// preservación de filtrado/ordenamiento por ventana de liberación se
// eliminaron por completo: esa regla de horario ya no se revisa en el
// momento de asignar — ver nota en MotorAsignacion.js/Biometria.js.)

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
  // Preservation
  procesarCasoSaiNonNull_preservacion,
  desarchivarBiometriasExitoso_preservacion,
  volcarBloque_preservacion,
};
