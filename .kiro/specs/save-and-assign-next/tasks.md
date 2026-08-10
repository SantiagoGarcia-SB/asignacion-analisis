# Implementation Plan: Save and Assign Next (Consolidated Post-Save Flow)

## Overview

Implementar la función consolidada `guardarYAsignarSiguiente()` que ejecuta guardado + auto-asignación + carga de panel en un solo round-trip servidor, eliminando 2 viajes de red (de 13-27s a ~4-9s de latencia percibida). Backend en Código.js siguiendo el patrón de `activarYAsignar()`, frontend en main.js.html con routing por `window.__IS_UNIFIED_VIEW__`. Property tests vía fast-check/Vitest con lógica de orquestación extraída como función pura.

## Tasks

- [x] 1. Extraer lógica de orquestación como función pura para testing
  - [x] 1.1 Crear `tests/lib/guardar-y-asignar-puro.js` con la función `guardarYAsignarLogica()`
    - Implementar la lógica pura de composición: recibe `{ guardarFn, asignarFn, panelFn, deadline }`
    - Ejecutar `guardarFn(data)` → si `success=false`, retornar inmediatamente con `asignacion=null, panel=null`
    - Si `guardado.disparaAsignacion=true`, ejecutar `asignarFn()` con try/catch; si falla, capturar y continuar
    - Ejecutar `panelFn()` con try/catch; si falla, retornar objeto panel con `_error` y valores por defecto
    - Verificar deadline antes de cada paso; si superado, retornar resultado parcial
    - Garantizar estructura de salida: `{guardado, asignacion, panel}` siempre con tipos correctos
    - Normalizar `idsAsignados` a array vacío y `faseTarget` a null cuando asignación no se ejecuta o falla
    - Exportar como módulo ES para consumo por Vitest
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 5.4, 6.1, 6.2_

- [x] 2. Implementar función servidor `guardarYAsignarSiguiente(data)` en Código.js
  - [x] 2.1 Agregar la función `guardarYAsignarSiguiente(data)` en Código.js junto a `activarYAsignar()`
    - Validar que `data.solicitudId` no sea vacío/ausente → retornar error inmediato si falta
    - Invocar `guardarCambiosInternos(data)` (NO modificar esa función)
    - Si guardado retorna `success=false`, retornar `{guardado, asignacion:null, panel:null}` inmediatamente
    - Si `guardado.disparaAsignacion=true`, invocar `autoAsignarDesdeEquipo()` dentro de try/catch
    - Si asignación falla (exception), capturar y registrar `{success:false, message: e.message, idsAsignados:[], faseTarget:null}`
    - Invocar `cargarPanelAnalista()` dentro de try/catch; si falla, retornar panel con defaults y `_error`
    - Implementar safety deadline: medir `Date.now()` al inicio, verificar antes de cada paso que no supere 300s
    - Si deadline superado, retornar resultado parcial con pasos no completados como null
    - Reutilizar `_abrirSSCacheado()` automáticamente (misma ejecución servidor = mismo cache)
    - Seguir el patrón exacto de `activarYAsignar()` para estructura y manejo de errores
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 5.3, 5.4_

- [x] 3. Checkpoint — Verificar función servidor
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar que `guardarYAsignarSiguiente` compila sin errores en el entorno GAS
  - Confirmar que `_abrirSSCacheado()` reutiliza spreadsheets entre pasos

- [x] 4. Implementar integración frontend en main.js.html
  - [x] 4.1 Crear función `_guardarYAsignarConsolidado(data)` en main.js.html
    - Invocar `google.script.run.withSuccessHandler(...).withFailureHandler(...).guardarYAsignarSiguiente(data)`
    - En success handler: renderizar panel con `resp.panel`, manejar toasts, disparar biometría deferred
    - En failure handler: mostrar error genérico, invocar `cargarDatos()` como fallback de recuperación
    - Si `resp.panel === null` o `resp.panel._error`: invocar `cargarDatos()` como recuperación
    - _Requirements: 3.1, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4_

  - [x] 4.2 Modificar `onGuardarExitoUnificado()` para routing por vista
    - Si `window.__IS_UNIFIED_VIEW__ === true` y `r.disparaAsignacion === true`: invocar `_guardarYAsignarConsolidado(data)` en lugar de `_dispararAutoAsignacion()` + `cargarDatos()`
    - Si `window.__IS_UNIFIED_VIEW__ === true` y `r.disparaAsignacion === false`: invocar `cargarPanelAnalista()` directamente (1 round-trip)
    - Si `window.__IS_UNIFIED_VIEW__ === false`: mantener flujo existente sin cambios (`_dispararAutoAsignacion()` + `cargarDatos()` separados)
    - Lanzar `UX.showSuccessCheck()` de forma concurrente con la invocación servidor (no esperar respuesta)
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 7.1, 7.2, 7.3, 7.4_

  - [x] 4.3 Implementar lógica de toasts por resultado de asignación
    - `asignacion.success=true && asignacion.nueva=true` → toast info con `asignacion.message`, auto-dismiss 5000ms
    - `asignacion.success=false` → toast warning con `asignacion.message`, auto-dismiss 5000ms
    - `asignacion=null` → sin toast adicional (solo toast de guardado existente)
    - `asignacion.success=true && asignacion.nueva=false` → sin toast de asignación
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 4.4 Implementar compatibilidad con biometría deferred
    - Si `resp.asignacion && resp.asignacion.idsAsignados && resp.asignacion.idsAsignados.length > 0`: invocar `actualizarFaseBiometriaPendienteDeferred(idsAsignados, faseTarget)` sin handler (fire-and-forget)
    - Si `idsAsignados` vacío o ausente: omitir invocación
    - No bloquear renderizado del panel por esta invocación
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 5. Checkpoint — Verificar integración frontend completa
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar que vista unificada usa la función consolidada
  - Verificar que vista no unificada mantiene flujo separado sin cambios
  - Confirmar que animación de éxito es concurrente con la llamada servidor

- [x] 6. Implementar property-based tests
  - [x]* 6.1 Escribir property test: Output structure invariant
    - **Property 1: Output structure invariant**
    - Generar combinaciones aleatorias de resultados de sub-funciones (guardar ok/fail, asignar ok/fail/exception, panel ok/fail/exception) con fast-check
    - Verificar que el retorno SIEMPRE tiene exactamente 3 propiedades: `guardado` (object con success boolean y message string), `asignacion` (object con success, message, idsAsignados array, faseTarget — O null), `panel` (object con tabla, cupos, pendientesValidacion, gestionesHoyCruzadas — O null)
    - Mínimo 100 iteraciones
    - **Validates: Requirements 1.3, 1.5, 2.5**

  - [x]* 6.2 Escribir property test: Early-exit on save failure
    - **Property 2: Early-exit on save failure**
    - Generar datos con solicitudId vacío/null/undefined y datos donde guardarFn retorna `success=false` con mensajes aleatorios
    - Verificar que `asignacion === null` y `panel === null`, y que `asignarFn` y `panelFn` nunca son invocadas
    - Mínimo 100 iteraciones
    - **Validates: Requirements 1.4, 1.6**

  - [x]* 6.3 Escribir property test: Assignment executed if and only if closing state
    - **Property 3: Assignment iff closing state**
    - Generar estados aleatorios (APROBADO, NEGADO, RECHAZADO, APLAZADO vs estados no-cierre como EN_GESTION, PENDIENTE, etc.) con save exitoso
    - Verificar que `asignarFn` se invoca si y solo si `guardado.disparaAsignacion=true`; cuando `disparaAsignacion=false`, `asignacion === null` y panel se carga igual
    - Mínimo 100 iteraciones
    - **Validates: Requirements 1.1, 1.2**

  - [x]* 6.4 Escribir property test: Assignment failure never blocks panel load
    - **Property 4: Assignment failure → panel loads**
    - Generar tipos de fallo de asignación (exception con mensajes aleatorios, return `success=false` con motivos variados)
    - Verificar que `panelFn` SIEMPRE es invocada después de fallo de asignación, y que `asignacion.message` preserva el motivo del fallo
    - Mínimo 100 iteraciones
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [x]* 6.5 Escribir property test: Timeout produces partial result
    - **Property 5: Timeout partial result**
    - Simular tiempos > 300s en distintos puntos de la ejecución (antes de asignar, antes de panel)
    - Verificar que retorna resultado parcial con pasos completados y null para el resto, sin lanzar excepción
    - Mínimo 100 iteraciones
    - **Validates: Requirements 5.4**

  - [x]* 6.6 Escribir property test: idsAsignados and faseTarget passthrough
    - **Property 6: idsAsignados passthrough**
    - Generar arrays aleatorios de IDs (strings) y valores de faseTarget (string o null)
    - Verificar que la función consolidada pasa estos valores exactos sin modificación en `asignacion.idsAsignados` y `asignacion.faseTarget`; cuando asignación no se ejecuta o falla, verificar `idsAsignados=[]` y `faseTarget=null`
    - Mínimo 100 iteraciones
    - **Validates: Requirements 6.1, 6.2**

- [x] 7. Checkpoint final — Validar feature completa
  - Ensure all tests pass, ask the user if questions arise.
  - Confirmar que property tests pasan con 100+ iteraciones
  - Verificar que el flujo consolidado elimina 2 round-trips en vista unificada
  - Confirmar que vista no unificada no tiene regresiones

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- El proyecto usa Google Apps Script (JavaScript ES5/ES6 limitado en server-side) — los tests se ejecutan en Node.js con vitest + fast-check
- La función pura `guardarYAsignarLogica()` en `tests/lib/` replica la lógica de orquestación sin dependencias de GAS, permitiendo property testing
- El patrón wrapper ya está validado por `activarYAsignar()` — seguir su estructura exacta
- `_abrirSSCacheado()` proporciona memoización automática dentro de la misma ejecución servidor
- Los toasts usan la infraestructura existente de `utilidades-ux.html`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["4.1", "4.2"] },
    { "id": 3, "tasks": ["4.3", "4.4"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6"] }
  ]
}
```
