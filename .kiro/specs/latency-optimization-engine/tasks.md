# Implementation Plan: Latency Optimization Engine

## Overview

Optimización de latencia del motor de asignación de casos (`RequestLeadUnificado`) y funciones de panel (`getTableData`) mediante fusión de funciones, pre-lectura fuera del ScriptLock, filtrado en memoria, lectura por bloque, y re-validación ligera. Implementado en JavaScript (Google Apps Script) con property tests ejecutados vía clasp + Node.js + Vitest + fast-check.

## Tasks

- [x] 1. Crear funciones fusionadas de conteo y recolección
  - [x] 1.1 Implementar `_contarYRecolectarPrincipal` en MotorAsignacion.js
    - Crear función pura que recibe `dataSolicitudes`, `userEmail`, `ctx`, `cuotas`, `equipo`
    - Fusionar la lógica de `_contarDesdeHojaPrincipal` y `_recolectarPendientesPrincipal` en una única iteración
    - Retornar `{ conteoHoy, cargaPendiente, pendientes }` con el shape definido en el diseño
    - Mantener compatibilidad con contadores incrementales (sumar al total después)
    - _Requirements: 1.1, 1.2, 1.3, 7.1_

  - [x] 1.2 Implementar `_contarYRecolectarReestudios` en MotorAsignacion.js
    - Crear función pura que recibe `dataReestudios`, `userEmail`, `ctx`, `cuotas`
    - Fusionar la lógica de `_contarDesdeHojaReestudios` y `_recolectarPendientesReestudios` en una única iteración
    - Retornar `{ conteoHoy, cargaPendiente, pendientes }` con `pendientes[].base = 'REESTUDIOS'`
    - _Requirements: 2.1, 2.2, 2.3, 7.1_

  - [ ]* 1.3 Write property test for equivalencia de función fusionada principal
    - **Property 1: Equivalencia de la función fusionada principal**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - Usar fast-check con generadores de filas de Hoja_Solicitud (59 columnas)
    - Comparar output de `_contarYRecolectarPrincipal` vs ejecución secuencial de las funciones originales
    - Mínimo 200 iteraciones

  - [ ]* 1.4 Write property test for equivalencia de función fusionada de reestudios
    - **Property 2: Equivalencia de la función fusionada de reestudios**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - Usar fast-check con generadores de filas de Hoja_ORIGEN (14 columnas)
    - Comparar output de `_contarYRecolectarReestudios` vs ejecución secuencial de las funciones originales
    - Mínimo 200 iteraciones

- [x] 2. Reestructurar RequestLeadUnificado con pre-lectura y re-validación
  - [x] 2.1 Mover lecturas de hojas completas fuera del ScriptLock en `RequestLeadUnificado`
    - Leer `hojaSolicitud.getRange(...).getValues()` y `hojaOrigen.getRange(...).getValues()` ANTES de `lock.waitLock(25000)`
    - Almacenar en variables `dataSolicitudes` y `dataReestudios`
    - Eliminar las lecturas completas que actualmente ocurren dentro de la sección crítica
    - No modificar la lectura de `_getDataUsuarios()` (ya está cacheada)
    - _Requirements: 3.1, 3.2, 3.6_

  - [x] 2.2 Implementar re-validación de celda de asignación dentro del lock
    - Después de `_ordenarYSeleccionarCandidatos`, antes de escribir la asignación
    - Leer `hoja.getRange(lead.rowIndex, COL_ASIGNADO).getValue()` para cada candidato seleccionado
    - Si la celda no está vacía, descartar candidato y probar el siguiente sin liberar el lock
    - Si todos los candidatos son stale, retornar "sin casos disponibles"
    - _Requirements: 3.3, 3.4, 3.5, 6.3_

  - [x] 2.3 Integrar funciones fusionadas en el flujo de `RequestLeadUnificado`
    - Reemplazar llamadas a `_contarDesdeHojaPrincipal` + `_recolectarPendientesPrincipal` por `_contarYRecolectarPrincipal(dataSolicitudes, ...)`
    - Reemplazar llamadas a `_contarDesdeHojaReestudios` + `_recolectarPendientesReestudios` por `_contarYRecolectarReestudios(dataReestudios, ...)`
    - Sumar contadores incrementales (`_obtenerConteoHoyAnalista`, `_obtenerCargaPendienteAnalista`) al resultado de las fusionadas
    - Asegurar que `SpreadsheetApp.flush()` se ejecuta antes de `releaseLock()`
    - _Requirements: 1.1, 2.1, 3.2, 6.1, 6.4, 7.1, 7.2_

  - [ ]* 2.4 Write property test for re-validación descarta candidatos stale
    - **Property 3: Re-validación descarta candidatos stale**
    - **Validates: Requirements 3.3, 3.4, 6.3**
    - Simular lista de N candidatos con K de ellos ya asignados
    - Verificar que el motor asigna exactamente el primer candidato no-stale (posición K+1)
    - Verificar que retorna "sin casos" si K = N

  - [ ]* 2.5 Write property test for exclusividad de asignación bajo concurrencia
    - **Property 4: Exclusividad de asignación bajo concurrencia**
    - **Validates: Requirements 3.5, 6.2**
    - Simular M ejecuciones secuenciales sobre los mismos N casos con re-validación
    - Verificar que cada caso aparece asignado a exactamente 1 analista (0 duplicados)

- [x] 3. Checkpoint - Verificar funciones fusionadas y flujo de asignación
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implementar filtrado en memoria en getTableData
  - [x] 4.1 Reemplazar `createTextFinder` por filtrado en memoria para Hoja_Solicitud en `getTableData`
    - Cuando `getTableData` ya tiene los registros de "solicitud" cargados en un arreglo, filtrar por email del analista con recorrido JavaScript
    - Comparar `String(row[COL_ASIGNADO]).trim().toLowerCase() === userEmail`
    - Eliminar la llamada a `createTextFinder` sobre la hoja "solicitud"
    - _Requirements: 4.1, 4.4_

  - [x] 4.2 Reemplazar `createTextFinder` por filtrado en memoria para Hoja_ORIGEN en `getTableData`
    - Aplicar la misma técnica de filtrado en memoria para los datos de la hoja ORIGEN
    - Conservar `createTextFinder` SOLO para Historico_Gestiones (hoja de crecimiento ilimitado)
    - _Requirements: 4.2, 4.3, 4.4_

  - [ ]* 4.3 Write property test for equivalencia de filtrado en memoria vs TextFinder
    - **Property 5: Equivalencia de filtrado en memoria vs. TextFinder**
    - **Validates: Requirements 4.4**
    - Generar arreglos de datos con emails variados (mayúsculas, espacios, parciales)
    - Verificar que el filtrado en memoria produce el mismo conjunto de índices que TextFinder

- [x] 5. Implementar lectura por bloque para Historico_Gestiones
  - [x] 5.1 Crear función `_leerBloqueCasosAbiertos` en Código.js
    - Recibir `hoja`, `filasDeseadas` (array de números de fila 1-indexed), `numCols`
    - Calcular `filaMin = Math.min(...filasDeseadas)`, `filaMax = Math.max(...filasDeseadas)`
    - Hacer una sola llamada `hoja.getRange(filaMin, 1, filaMax - filaMin + 1, numCols).getValues()`
    - Mapear filas deseadas: `filasDeseadas.map(f => bloque[f - filaMin])`
    - Si `filasDeseadas` está vacío, retornar `[]` sin hacer getRange
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 5.2 Integrar `_leerBloqueCasosAbiertos` en el flujo de `getTableData`
    - Reemplazar el ciclo de N llamadas individuales `getRange(fila, 1, 1, cols)` por la invocación de `_leerBloqueCasosAbiertos`
    - Descartar en memoria las filas del bloque que no pertenecen al analista
    - Verificar que el resultado final es idéntico al de la implementación actual
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 5.3 Write property test for equivalencia de lectura por bloque
    - **Property 6: Equivalencia de lectura por bloque**
    - **Validates: Requirements 5.2, 5.3**
    - Generar conjuntos de N números de fila dentro de un rango [minRow, maxRow]
    - Simular bloque de datos y verificar que el resultado del mapeo es idéntico a N lecturas individuales

- [x] 6. Preservar compatibilidad de contadores y endpoints de guardado
  - [x] 6.1 Verificar integración de contadores incrementales con funciones fusionadas
    - Confirmar que `_obtenerConteoHoyAnalista` y `_obtenerCargaPendienteAnalista` se suman al resultado de las funciones fusionadas
    - Confirmar que `_incrementarContadorCupo` y `_ajustarCargaPendiente` se invocan con los mismos valores tras asignación exitosa
    - Confirmar que `trigger_recalcularContadores` / `admin_recalcularContadores` sigue reconstruyendo desde cero sin conflictos
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 6.2 Validar que endpoints de guardado no adquieren ScriptLock
    - Revisar `guardarCambiosInternos`, `guardarGestionBiometria`, y ruta HISTORICO de `guardarGestionReestudio`
    - Confirmar que ninguna optimización introduce ScriptLock ni efectos colaterales en estos endpoints
    - Si las funciones compartidas (filtrado en memoria, lectura por bloque) se usan en estos endpoints, verificar que no alteran su comportamiento
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 6.3 Write property test for preservación de totales con contadores incrementales
    - **Property 7: Preservación de totales con contadores incrementales**
    - **Validates: Requirements 7.1**
    - Generar conteoHoy de función fusionada + contadores incrementales arbitrarios
    - Verificar que el total combinado es la suma elemento-a-elemento sin omisiones ni duplicados

- [x] 7. Configurar entorno de testing con fast-check
  - [x] 7.1 Configurar proyecto Node.js para property tests
    - Crear `package.json` con dependencias exactas: `vitest`, `fast-check`
    - Configurar scripts de ejecución: `npx vitest --run tests/properties/`
    - Crear estructura de carpetas `tests/properties/`
    - Extraer funciones puras (`_contarYRecolectarPrincipal`, `_contarYRecolectarReestudios`, `_leerBloqueCasosAbiertos`) a módulos exportables para testing
    - _Requirements: 1.4, 2.4_

  - [ ]* 7.2 Write unit tests para flujo completo de RequestLeadUnificado optimizado
    - Verificar que no se invoca `getRange` sobre hojas completas después de `waitLock()`
    - Verificar que `flush()` se llama antes de `releaseLock()`
    - Verificar que `createTextFinder` NO se invoca sobre "solicitud"/"ORIGEN" cuando datos están en memoria
    - Verificar que endpoints de guardado no adquieren ScriptLock
    - _Requirements: 3.1, 3.2, 6.1, 6.4, 8.1_

- [x] 8. Final checkpoint - Verificar todas las optimizaciones integradas
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples, order of API calls, and edge cases
- Las funciones fusionadas son funciones puras (no dependen de SpreadsheetApp) y se testean directamente con fast-check
- Las funciones originales (`_contarDesdeHojaPrincipal`, `_recolectarPendientesPrincipal`, etc.) se mantienen temporalmente como referencia para los property tests y se eliminan tras validación completa
- Los property tests se ejecutan fuera de Google Apps Script vía clasp + Node.js + Vitest

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "7.1"] },
    { "id": 1, "tasks": ["1.3", "1.4", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "4.1", "4.2"] },
    { "id": 3, "tasks": ["2.4", "2.5", "4.3", "5.1"] },
    { "id": 4, "tasks": ["5.2", "6.1"] },
    { "id": 5, "tasks": ["5.3", "6.2", "6.3"] },
    { "id": 6, "tasks": ["7.2"] }
  ]
}
```
