# Implementation Plan: Optimización del Flujo de Activación

## Overview

Implementación de 6 optimizaciones que reducen el flujo de activación de ~18s a ~10-12s en Google Apps Script. Cada tarea se enfoca en un componente específico del path crítico: cache de turnos, batch writes en Usuarios, Historico_Estados fuera del lock, memoización de spreadsheet de biometría, batch writes en `_actualizarFaseBiometriaPendiente`, y el patrón deferred desde el cliente.

## Tasks

- [x] 1. Implementar cache de datos de turnos con CacheService
  - [x] 1.1 Crear función `_getTurnosDataCacheado(ss)` en `Código.js`
    - Definir constantes `_TURNOS_CACHE_PREFIX`, `_TURNOS_CACHE_TTL` (60s), `_TURNOS_CACHE_TAM_CHUNK` (90000)
    - Implementar lectura de CacheService con chunking (mismo patrón que `_getDataUsuarios`)
    - En caso de cache miss: leer hojas `Analistas_Turnos` y `Turnos`, serializar como JSON `{dataAT, dataTurnos, dispTurnos}`, particionar en chunks y guardar con `cache.putAll()`
    - En caso de cache hit: reconstruir JSON desde chunks y devolver datos deserializados
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Crear función `_invalidarCacheTurnos()` en `Código.js`
    - Implementar invalidación leyendo COUNT y eliminando todos los chunks asociados
    - Invocar desde funciones admin que modifican turnos (e.g., `admin_guardarTurno`, `admin_eliminarTurno`)
    - _Requirements: 1.3, 1.5_

  - [x] 1.3 Refactorizar `_verificarTurnoActivoReal` para usar `_getTurnosDataCacheado`
    - Reemplazar las lecturas directas de `hojaAT.getDataRange().getValues()` y `hojaTurnos.getDataRange().getValues()` por los datos cacheados
    - Mantener toda la lógica de validación idéntica (parseMin, días ISO, etc.)
    - Verificar que el resultado es idéntico con o sin cache
    - _Requirements: 1.1, 1.2, 1.5, 1.6_

  - [ ]* 1.4 Escribir unit tests para `_getTurnosDataCacheado`
    - Test cache miss: verifica lectura de hojas y almacenamiento en cache
    - Test cache hit: verifica que no se leen hojas cuando hay cache válido
    - Test chunking: verifica particionamiento correcto cuando payload > 90KB
    - Test resultados idénticos: misma salida con/sin cache
    - _Requirements: 1.5_

- [x] 2. Checkpoint - Verificar cache de turnos
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implementar escrituras batch y mover Historico_Estados fuera del lock
  - [x] 3.1 Refactorizar escrituras de Usuarios dentro del lock a batch `setValues()`
    - Leer el rango `getRange(fila, 6, 1, 7)` (columnas F a L) con los valores actuales
    - Modificar solo posición [0][0] (col F = estado) y posición [0][6] (col L = historial JSON)
    - Escribir de vuelta con un solo `setValues()` seguido de `flush()` dentro del lock
    - Eliminar los dos `setValue()` individuales actuales (líneas que escriben a `columnaEstado+1` y `celdaHistorial`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 Mover bloque Historico_Estados fuera del ScriptLock
    - Extraer el bloque completo de scan + appendRow de `Historico_Estados` después de `lock.releaseLock()`
    - Envolver en try/catch independiente que loguea error pero retorna `{success: true}` al analista
    - Preservar la misma lógica: cerrar registro anterior (setValue fin + duración) y appendRow nuevo registro
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.3 Escribir unit tests para la sección crítica reducida
    - Test: la escritura batch produce los mismos valores en columnas F y L que los 2 setValue individuales
    - Test: si Historico_Estados falla, el resultado sigue siendo `{success: true}`
    - Test: el lock se libera antes de ejecutar operaciones de Historico_Estados
    - _Requirements: 2.3, 3.3_

- [x] 4. Checkpoint - Verificar refactorización de actualizarEstadoPropio
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Optimizar `_actualizarFaseBiometriaPendiente` con memoización y batch writes
  - [x] 5.1 Reemplazar `SpreadsheetApp.openById` por `_abrirSSCacheado` en `_actualizarFaseBiometriaPendiente`
    - Cambiar `SpreadsheetApp.openById(ID_SHEET_BIOMETRIA_PENDIENTE)` por `_abrirSSCacheado(ID_SHEET_BIOMETRIA_PENDIENTE)` en `Biometria.js`
    - Verificar que la función sigue produciendo el mismo comportamiento funcional
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.2 Implementar batch writes en `_actualizarFaseBiometriaPendiente`
    - Leer columnas 76-77 completas del rango `(2, 76, lastRow-1, 2)` en un solo `getValues()`
    - Iterar en memoria: para cada fila que coincide con `idsSet` y cuya fase no es terminal, actualizar `[nuevaFase, ahora]` en el array
    - Escribir de vuelta con un solo `setValues()` del rango completo de 2 columnas
    - Para caso de 1 sola fila: usar `getRange(row, 76, 1, 2).setValues([[fase, fecha]])` directamente
    - Eliminar los `setValue()` individuales dentro del for loop actual
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 5.3 Escribir unit tests para batch writes de biometría
    - Test: N filas actualizadas con O(1) llamadas setValues en lugar de O(N) setValue
    - Test: fila única usa un solo setValues de 1x2
    - Test: filas con fase terminal (RESUELTA, ASIGNADA, ARCHIVADA) no se modifican
    - _Requirements: 5.4, 5.5_

- [x] 6. Checkpoint - Verificar optimizaciones de biometría
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implementar ejecución no-bloqueante (deferred pattern)
  - [x] 7.1 Crear función pública `actualizarFaseBiometriaPendienteDeferred(ids, fase)` en `Biometria.js`
    - Wrapper público que invoca `_actualizarFaseBiometriaPendiente(ids, fase)` con try/catch
    - Loguear error con IDs y fase en caso de fallo sin lanzar excepción al cliente
    - No adquirir ScriptLock (la trazabilidad no requiere exclusión mutua)
    - _Requirements: 6.1, 6.3, 6.4, 6.6_

  - [x] 7.2 Modificar `RequestLeadUnificado` para retornar IDs asignados como metadata
    - En la ruta de asignación donde se llama a `_actualizarFaseBiometriaPendiente`, remover esa llamada directa
    - En su lugar, acumular los `idsAsignados` y `faseTarget` en el objeto de respuesta
    - Asegurar que `SpreadsheetApp.flush()` se ejecuta ANTES de retornar (la asignación debe estar confirmada)
    - _Requirements: 6.1, 6.2, 6.5_

  - [x] 7.3 Modificar `activarYAsignar` para incluir `idsAsignados` y `faseTarget` en la respuesta
    - Propagar los campos `idsAsignados` y `faseTarget` desde `resultado.asignacion` al objeto final devuelto al cliente
    - La interfaz de respuesta ampliada: `{activacion, asignacion: {..., idsAsignados, faseTarget}, panel}`
    - _Requirements: 6.1, 6.2_

  - [x] 7.4 Implementar fire-and-forget en el cliente (`main.js.html`)
    - En el success handler de `activarYAsignar`, agregar lógica que dispare `google.script.run.actualizarFaseBiometriaPendienteDeferred(ids, fase)` sin `withSuccessHandler` bloqueante
    - Solo disparar si `r.asignacion && r.asignacion.idsAsignados && r.asignacion.idsAsignados.length > 0`
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [ ]* 7.5 Escribir unit tests para el patrón deferred
    - Test: `actualizarFaseBiometriaPendienteDeferred` no lanza excepción cuando `_actualizarFaseBiometriaPendiente` falla
    - Test: el flujo principal retorna en menos de 12s sin esperar la trazabilidad de biometría
    - _Requirements: 6.3, 6.5_

- [x] 8. Verificación de latencia end-to-end
  - [x] 8.1 Validar que la sección crítica del ScriptLock dura < 800ms
    - Revisar logs SPERF dentro del lock: lectura de rango F:L + setValues + flush deben sumar < 800ms
    - Si excede, identificar el paso más lento y ajustar
    - _Requirements: 7.2_

  - [x] 8.2 Validar flujo completo activarYAsignar < 12s bajo condiciones normales
    - Ejecutar `activarYAsignar` con logs SPERF activos y verificar total < 12s sin contención
    - Documentar tiempos por fase: verificarTurnoActivo, lock, autoAsignar, cargarPanel
    - _Requirements: 7.1, 7.3, 7.4_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Unit tests validate specific examples and edge cases
- This is a Google Apps Script project — no async/await server-side, all optimizations use synchronous patterns + client-initiated deferred calls
- El patrón de chunking de CacheService ya está probado en `_getDataUsuarios` (Código.js) — replicar el mismo approach

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "3.1"] },
    { "id": 3, "tasks": ["3.2", "5.1"] },
    { "id": 4, "tasks": ["3.3", "5.2"] },
    { "id": 5, "tasks": ["5.3", "7.1"] },
    { "id": 6, "tasks": ["7.2"] },
    { "id": 7, "tasks": ["7.3"] },
    { "id": 8, "tasks": ["7.4"] },
    { "id": 9, "tasks": ["7.5", "8.1"] },
    { "id": 10, "tasks": ["8.2"] }
  ]
}
```
