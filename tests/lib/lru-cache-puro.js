/**
 * ============================================================
 * LRU Cache — Lógica Pura (exportable para testing)
 * ============================================================
 *
 * Este módulo contiene la implementación PURA (sin dependencias de GAS)
 * de un LRU cache con capacidad máxima configurable, diseñada para
 * ser testeada con fast-check via Vitest en Node.js.
 *
 * La estructura replica la lógica de _cacheSolicitudes en main.js.html
 * sin google.script.run ni DOM, exponiendo solo la lógica de:
 * - Almacenamiento con clave/valor
 * - Actualización de lastAccess en cada get (LRU tracking)
 * - Evicción de la entrada más antigua cuando se excede maxSize
 * - Invalidación individual de entradas
 *
 * Patrón equivalente al de tests/lib/guardar-y-asignar-puro.js
 *
 * Requirements: 4.1, 4.2, 4.4, 4.5, 4.8
 */

// ============================================================
// CONSTANTES
// ============================================================

/** Tamaño máximo por defecto del cache */
const DEFAULT_MAX_SIZE = 50;

// ============================================================
// FUNCIÓN FACTORY — CREA INSTANCIA DE CACHE LRU
// ============================================================

/**
 * Crea una instancia de cache LRU con capacidad máxima configurable.
 * Función pura sin dependencias de Google Apps Script.
 *
 * @param {number} [maxSize=50] - Capacidad máxima del cache
 * @param {Function} [nowFn] - Función para obtener timestamp actual (default: Date.now)
 * @returns {{get: Function, set: Function, invalidate: Function, size: Function, has: Function}}
 */
function crearCacheLRU(maxSize, nowFn) {
  var _maxSize = typeof maxSize === 'number' && maxSize > 0 ? Math.floor(maxSize) : DEFAULT_MAX_SIZE;
  var _now = typeof nowFn === 'function' ? nowFn : Date.now;

  /** @type {Map<string, {data: any, lastAccess: number}>} */
  var _map = new Map();

  /**
   * Obtiene el valor asociado a una clave.
   * Si la clave existe, actualiza su lastAccess (patrón LRU).
   *
   * @param {string} key - Clave de búsqueda
   * @returns {any|undefined} Datos almacenados o undefined si no existe
   */
  function get(key) {
    var entry = _map.get(key);
    if (entry === undefined) {
      return undefined;
    }
    // Actualizar lastAccess para marcar como recientemente usado
    entry.lastAccess = _now();
    return entry.data;
  }

  /**
   * Almacena un valor en el cache. Si el cache está lleno,
   * evicta la entrada con lastAccess más antiguo antes de insertar.
   *
   * @param {string} key - Clave de almacenamiento
   * @param {any} data - Datos a almacenar
   */
  function set(key, data) {
    // Si la clave ya existe, actualizar en lugar de insertar nuevo
    if (_map.has(key)) {
      var existing = _map.get(key);
      existing.data = data;
      existing.lastAccess = _now();
      return;
    }

    // Evictar entrada LRU si se alcanza la capacidad máxima
    if (_map.size >= _maxSize) {
      _evictLRU();
    }

    _map.set(key, {
      data: data,
      lastAccess: _now(),
    });
  }

  /**
   * Elimina una entrada específica del cache.
   *
   * @param {string} key - Clave a invalidar
   * @returns {boolean} true si la entrada existía y fue eliminada
   */
  function invalidate(key) {
    return _map.delete(key);
  }

  /**
   * Retorna el número actual de entradas en el cache.
   *
   * @returns {number}
   */
  function size() {
    return _map.size;
  }

  /**
   * Verifica si una clave existe en el cache.
   * NO actualiza lastAccess (solo consulta de existencia).
   *
   * @param {string} key - Clave a verificar
   * @returns {boolean}
   */
  function has(key) {
    return _map.has(key);
  }

  /**
   * Evicta la entrada con el lastAccess más antiguo.
   * Se invoca internamente cuando el cache alcanza maxSize.
   * @private
   */
  function _evictLRU() {
    var oldestKey = null;
    var oldestTime = Infinity;

    _map.forEach(function (entry, key) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    });

    if (oldestKey !== null) {
      _map.delete(oldestKey);
    }
  }

  return {
    get: get,
    set: set,
    invalidate: invalidate,
    size: size,
    has: has,
  };
}

// ============================================================
// EXPORTS
// ============================================================

export { crearCacheLRU, DEFAULT_MAX_SIZE };
