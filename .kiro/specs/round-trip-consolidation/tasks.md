# Implementation Plan: Round-Trip Consolidation

## Overview

Implementar las 5 consolidaciones de multi-round-trip restantes: (1) reutilizar `guardarYAsignarSiguiente()` desde vista no unificada, (2) nueva función `autoAsignarConPanel()` en servidor, (3) polling sin delay artificial usando `autoAsignarConPanel()`, (4) LRU cache client-side para datos de modal, y (5) biometría deferred server-side dentro de funciones consolidadas. Backend en Código.js siguiendo el patrón de `activarYAsignar()`, frontend en main.js.html. Property tests vía fast-check/Vitest con lógica de cache extraída como función pura.

## Tasks

- [ ] 1. Implementar biometría deferred server-side en funciones consolidadas existentes
  - [ ] 1.1 Modificar `guardarYAsignarSiguiente()` en Código.js para ejecutar biometría deferred
    - Después de `autoAsignarDesdeEquipo()`, verificar si `resultado.asignacion.idsAsignados.length > 0`
    - Si hay IDs, ejecutar `actualizarFaseBiometriaPendienteDeferred(idsAsignados, faseTarget)` dentro de try/catch
    - Si la ejecución es exitosa, agregar `_biometriaEjecutada: true` al objeto `asignacion`
    - Si lanza excepción, capturar con `Logger.log`, agregar `_biometriaEjecutada: false`, continuar normalmente
    - Ejecutar biometría ANTES de `cargarPanelAnalista()` pero DESPUÉS de la asignación
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ] 1.2 Modificar `activarYAsignar()` en Código.js para ejecutar biometría deferred
    - Mismo patrón que 1.1: después de asignación, si `idsAsignados.length > 0`, ejecutar biometría deferred
    - Try/catch con `Logger.log` en caso de error
    - Agregar `_biometriaEjecutada: true/false` al objeto `asignacion` de la respuesta
    - Respetar el deadline existente de `activarYAsignar()` (verificar tiempo antes de ejecutar biometría)
    - _Requirements: 5.6, 5.3, 5.4_

- [ ] 2. Implementar función servidor `autoAsignarConPanel()` en Código.js
  - [ ] 2.1 Crear la función `autoAsignarConPanel()` junto a `activarYAsignar()` y `guardarYAsignarSiguiente()`
    - Seguir el patrón exacto de `activarYAsignar()` para estructura y manejo de errores
    - Medir `Date.now()` al inicio para deadline de 300s
    - Invocar `autoAsignarDesdeEquipo()` dentro de try/catch
    - Si exception: `asignacion = {success:false, message:e.message, nueva:false, idsAsignados:[], faseTarget:null, _biometriaEjecutada:false}`
    - Si asignación exitosa con `idsAsignados.length > 0`: ejecutar `actualizarFaseBiometriaPendienteDeferred(idsAsignados, faseTarget)` con try/catch, setear `_biometriaEjecutada` según resultado
    - Verificar deadline (280s) antes de invocar `cargarPanelAnalista()`; si excedido, retornar con `panel: null`
    - Invocar `cargarPanelAnalista()` dentro de try/catch; si falla, retornar panel con `{_error: e.message, tabla:null, cupos:null, pendientesValidacion:[], gestionesHoyCruzadas:null}`
    - Retornar `{asignacion, panel}` — exactamente dos propiedades top-level
    - Loguear tiempo total con formato `⏱ SPERF autoAsignarConPanel: total = Xms`
    - Reutilizar `_abrirSSCacheado()` automáticamente (misma ejecución = mismo cache)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.1, 5.3, 5.4, 6.1, 6.2, 6.3, 7.2, 7.3, 8.2, 8.3_

- [ ] 3. Checkpoint — Verificar funciones servidor
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar que `autoAsignarConPanel()` compila sin errores en el entorno GAS
  - Verificar que biometría deferred se ejecuta correctamente en `guardarYAsignarSiguiente()` y `activarYAsignar()`
  - Confirmar que `_abrirSSCacheado()` reutiliza spreadsheets entre pasos

- [ ] 4. Implementar routing de vista no unificada en frontend
  - [ ] 4.1 Modificar `onGuardarExitoUnificado()` en main.js.html para vista no unificada
    - En rama `window.__IS_UNIFIED_VIEW__ === false` con `r.disparaAsignacion === true`:
      - Invocar `google.script.run.guardarYAsignarSiguiente(_ultimosDatosGuardado)` con success/failure handlers
      - Lanzar `UX.showSuccessCheck()` de forma concurrente (no esperar respuesta servidor)
    - En rama `window.__IS_UNIFIED_VIEW__ === false` con `r.disparaAsignacion === false`:
      - Invocar `cargarPanelAnalista()` directamente como único round-trip
    - Success handler para vista no unificada:
      - Si `resp.panel` presente sin `_error`: renderizar con `_procesarRespuestaPanel(resp.panel)`
      - Si `resp.panel` nulo o con `_error`: ejecutar `cargarDatos()` como recuperación
      - Toast de asignación: `nueva=true` → info 5000ms; `success=false` → warning 5000ms; null/nueva=false → no toast
    - Failure handler: `cargarDatos()` + mensaje de error genérico
    - Agregar `_PERF.mark()` al inicio y final del flujo
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 8.1_

  - [ ] 4.2 Implementar routing de biometría client-side basado en `_biometriaEjecutada`
    - En los success handlers de `guardarYAsignarSiguiente`, `autoAsignarConPanel`, y `activarYAsignar`:
      - Si `resp.asignacion._biometriaEjecutada === true`: NO invocar `actualizarFaseBiometriaPendienteDeferred()`
      - Si `_biometriaEjecutada` ausente o `false` Y `idsAsignados.length > 0`: invocar fire-and-forget `actualizarFaseBiometriaPendienteDeferred(idsAsignados, faseTarget)`
    - Actualizar handler existente de `activarYAsignar()` para respetar el mismo patrón
    - _Requirements: 5.5, 5.7, 5.8_

- [ ] 5. Implementar polling sin delay artificial usando `autoAsignarConPanel()`
  - [ ] 5.1 Modificar `_ejecutarPoll()` en main.js.html para usar `autoAsignarConPanel()`
    - Reemplazar invocación de `autoAsignarDesdeEquipo`/`autoAsignarAlEntrar` por `autoAsignarConPanel()`
    - Eliminar el `setTimeout(2000)` + `cargarDatos()` separado post-asignación
    - Success handler:
      - Si `asignacion.nueva=true` y panel válido (no nulo, sin `_error`): renderizar panel con `_procesarRespuestaPanel(resp.panel)`, mostrar toast info, detener polling si tabla tiene casos
      - Si `asignacion.nueva=true` pero panel nulo/con error: `cargarDatos()` sin delay artificial
      - Si `asignacion.nueva=false` o `success=false`: continuar ciclo de polling sin `cargarDatos()`
    - Routing de biometría: respetar `_biometriaEjecutada` (reutilizar lógica de 4.2)
    - Agregar `_PERF.mark()` al inicio y final
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.1_

  - [ ] 5.2 Modificar `_dispararAutoAsignacion()` para usar `autoAsignarConPanel()`
    - Reemplazar invocación de `autoAsignarDesdeEquipo`/`autoAsignarAlEntrar` por `autoAsignarConPanel()`
    - Success handler con misma lógica de panel rendering y toast
    - Si panel válido: renderizar directamente, no invocar `cargarDatos()`
    - Failure handler: `cargarDatos()` como fallback + mensaje de error genérico
    - Mantener toast de información cuando `asignacion.nueva=true` (comportamiento existente)
    - Agregar `_PERF.mark()` al inicio y final
    - _Requirements: 3.6, 7.1, 7.5, 8.1_

  - [ ] 5.3 Implementar backoff exponencial en failure handler del polling
    - Si `google.script.run` falla al invocar `autoAsignarConPanel()` desde polling:
      - Incrementar delay del polling (multiplicar por factor, máximo 360 segundos)
      - Registrar error en consola con `console.error`
      - Reprogramar siguiente poll sin invocar `cargarDatos()`
    - _Requirements: 3.6_

- [ ] 6. Checkpoint — Verificar flujos de polling y vista no unificada
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar que vista no unificada usa `guardarYAsignarSiguiente()` correctamente
  - Verificar que polling usa `autoAsignarConPanel()` sin delay artificial
  - Confirmar que `_dispararAutoAsignacion()` usa la nueva función consolidada
  - Verificar que el backoff exponencial funciona correctamente

- [ ] 7. Implementar LRU cache client-side para datos de modal
  - [ ] 7.1 Crear estructura `_cacheSolicitudes` en main.js.html
    - Implementar objeto con `_map` (Map: solicitudId → {data, lastAccess}), `_inflight` (Map: solicitudId → [callbacks])
    - Constante `MAX_SIZE: 50`
    - Método `get(solicitudId, callback)`:
      - Si existe en `_map`: actualizar `lastAccess`, invocar callback inmediatamente, NO lanzar `google.script.run`
      - Si existe en `_inflight`: agregar callback al array de pendientes
      - Si no existe en ninguno: crear entrada en `_inflight`, lanzar `google.script.run.getDataUniqueForSolicitud(solicitudId)`
    - Success handler de `google.script.run`:
      - Si `result.success=true`: almacenar en `_map` con `lastAccess=Date.now()`, invocar todos los callbacks pendientes
      - Si `result.success=false`: NO almacenar, invocar callbacks con el resultado fallido, limpiar `_inflight`
    - Failure handler: limpiar `_inflight`, invocar callbacks con error
    - Método `invalidate(solicitudId)`: eliminar entrada de `_map`
    - Método `_evictLRU()`: si `_map.size >= MAX_SIZE`, eliminar la entrada con `lastAccess` más antiguo
    - Solo en memoria (no localStorage ni sessionStorage)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.8, 7.4_

  - [ ] 7.2 Integrar `_cacheSolicitudes` en funciones de modal
    - Modificar `poblarModalDig()` para usar `_cacheSolicitudes.get(solicitudId, callback)` en lugar de `google.script.run.getDataUniqueForSolicitud()` directo
    - Modificar `poblarModalBio()` con el mismo patrón
    - Modificar `poblarModalRst()` con el mismo patrón
    - En cada caso, el callback recibe los datos y procede con el renderizado existente del modal
    - _Requirements: 4.7_

  - [ ] 7.3 Implementar invalidación de cache post-guardado
    - En `onGuardarExitoUnificado()` (o donde se recibe respuesta exitosa de guardado):
      - Si `respuesta.success === true`: invocar `_cacheSolicitudes.invalidate(solicitudId)` para el ID del caso guardado
    - Garantizar que la próxima apertura del modal hace un fresh request al servidor
    - _Requirements: 4.5_

- [ ] 8. Extraer lógica de LRU cache como función pura para testing
  - [ ] 8.1 Crear `tests/lib/lru-cache-puro.js` con la lógica del cache
    - Implementar clase/objeto puro `crearCacheLRU(maxSize)` sin dependencias de GAS
    - Métodos: `get(key)`, `set(key, data)`, `invalidate(key)`, `size()`, `has(key)`
    - Lógica LRU: actualizar `lastAccess` en cada `get`, evictar entrada más antigua cuando se excede `maxSize`
    - Exportar como módulo ES para consumo por Vitest
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.8_

- [ ] 9. Checkpoint — Verificar LRU cache y modals
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar que `_cacheSolicitudes` funciona correctamente para los 3 modals
  - Confirmar que invalidación post-guardado limpia la entrada correcta
  - Verificar que MAX_SIZE=50 se respeta

- [ ] 10. Implementar property-based tests
  - [ ]* 10.1 Escribir property test: Response structure of autoAsignarConPanel
    - **Property 1: Response structure of autoAsignarConPanel**
    - Generar combinaciones aleatorias de resultados de autoAsignar (éxito/fallo/exception) y cargarPanel (éxito/fallo/exception) con fast-check
    - Verificar que el retorno SIEMPRE tiene exactamente 2 propiedades top-level: `asignacion` (objeto con `success`, `message`, `nueva`, `idsAsignados`, `faseTarget`, `_biometriaEjecutada`) y `panel` (objeto o null)
    - Mínimo 100 iteraciones
    - **Validates: Requirements 2.5, 6.1, 6.3**

  - [ ]* 10.2 Escribir property test: Cache hit returns data without network call
    - **Property 2: Cache hit returns data without network call**
    - Generar solicitudIds aleatorios (strings no vacíos), popular cache con datos válidos
    - Verificar que `get()` retorna datos cacheados sin incrementar contador de llamadas de red
    - Mínimo 100 iteraciones
    - **Validates: Requirements 4.1**

  - [ ]* 10.3 Escribir property test: Cache miss triggers fetch and stores result
    - **Property 3: Cache miss triggers fetch and stores result**
    - Generar solicitudIds no presentes en cache
    - Verificar que se dispara exactamente una invocación de fetch y que resultado con `success=true` se almacena
    - Mínimo 100 iteraciones
    - **Validates: Requirements 4.2**

  - [ ]* 10.4 Escribir property test: Inflight request deduplication
    - **Property 4: Inflight request deduplication**
    - Generar solicitudIds con estado inflight, ejecutar múltiples `get()` concurrentes (2-10 callbacks)
    - Verificar que solo se lanza 1 invocación de red y que TODOS los callbacks reciben el mismo resultado
    - Mínimo 100 iteraciones
    - **Validates: Requirements 4.3**

  - [ ]* 10.5 Escribir property test: Failed responses never cached
    - **Property 5: Failed responses never cached**
    - Generar respuestas con `success=false` y mensajes de error aleatorios
    - Verificar que después de procesar la respuesta, el cache NO contiene entrada para ese solicitudId
    - Mínimo 100 iteraciones
    - **Validates: Requirements 4.4**

  - [ ]* 10.6 Escribir property test: Cache invalidation on successful save
    - **Property 6: Cache invalidation on successful save**
    - Generar solicitudIds previamente cacheados, ejecutar `invalidate(solicitudId)`
    - Verificar que la entrada fue eliminada y que el siguiente `get()` dispara un fresh request
    - Mínimo 100 iteraciones
    - **Validates: Requirements 4.5**

  - [ ]* 10.7 Escribir property test: LRU eviction at capacity
    - **Property 7: LRU eviction at capacity**
    - Generar secuencias de >50 inserciones con patrones de acceso aleatorios (get intermitentes)
    - Verificar que `size()` nunca excede 50 y que la entrada evictada es la de `lastAccess` más antiguo
    - Mínimo 100 iteraciones
    - **Validates: Requirements 4.8**

  - [ ]* 10.8 Escribir property test: Biometría client routing based on _biometriaEjecutada
    - **Property 8: Biometría client routing based on _biometriaEjecutada**
    - Generar respuestas con combinaciones de `_biometriaEjecutada` (true/false/undefined) e `idsAsignados` (vacío/con elementos)
    - Verificar: si `_biometriaEjecutada===true`, el cliente NO invoca biometría; si ausente/false con IDs, SÍ invoca fire-and-forget
    - Mínimo 100 iteraciones
    - **Validates: Requirements 5.5, 5.7, 5.8**

- [ ] 11. Implementar telemetría de rendimiento
  - [ ] 11.1 Agregar `_PERF.mark()` y logging de rendimiento
    - Agregar marcas de tiempo al inicio y final de cada flujo consolidado en main.js.html
    - En `autoAsignarConPanel()` servidor: agregar `Logger.log('⏱ SPERF autoAsignarConPanel: total = ' + (Date.now() - _t0) + 'ms')`
    - Verificar que las marcas de rendimiento siguen el patrón existente del proyecto
    - _Requirements: 8.1, 8.2_

- [ ] 12. Checkpoint final — Validar feature completa
  - Ensure all tests pass, ask the user if questions arise.
  - Confirmar que property tests pasan con 100+ iteraciones
  - Verificar que los 5 flujos consolidados eliminan round-trips según lo esperado
  - Confirmar compatibilidad con flujos existentes sin regresiones
  - Verificar que biometría deferred se ejecuta server-side y el fallback client-side funciona

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- El proyecto usa Google Apps Script (JavaScript ES5/ES6 limitado en server-side) — los tests se ejecutan en Node.js con vitest + fast-check
- La función pura `crearCacheLRU()` en `tests/lib/lru-cache-puro.js` replica la lógica del LRU cache sin dependencias de GAS, permitiendo property testing
- El patrón de `activarYAsignar()` ya está validado en producción — `autoAsignarConPanel()` sigue su estructura exacta sin el paso de activación
- `_abrirSSCacheado()` proporciona memoización automática dentro de la misma ejecución servidor — no requiere cambios
- Los toasts usan la infraestructura existente de `utilidades-ux.html`
- La biometría deferred se integra en funciones existentes (1.1, 1.2) ANTES de crear la nueva función, para mantener incrementalidad

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "8.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["4.1", "4.2"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 4, "tasks": ["7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3"] },
    { "id": 6, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8"] },
    { "id": 7, "tasks": ["11.1"] }
  ]
}
```
