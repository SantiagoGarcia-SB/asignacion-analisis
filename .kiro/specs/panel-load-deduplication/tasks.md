# Implementation Plan: Panel Load Deduplication

## Overview

Implementar memoización de las hojas `Historico_Gestiones` (principal y reestudios) dentro de `cargarPanelAnalista()` usando el patrón existente de variables de módulo (`_datosTurnosMemo`, `_datosUsuariosMemo`). Se crean dos accessors (`_getHistGestionesPrincipal` y `_getHistGestionesReest`) que leen una sola vez y cachean el dataset completo, eliminando 4-6 network round-trips redundantes (~2-4 segundos de ahorro).

## Tasks

- [x] 1. Declarar variables de módulo y funciones accessor/invalidación
  - [x] 1.1 Agregar declaraciones de `_histGestionesPrincipalMemo` y `_histGestionesReestMemo` como variables de módulo en Código.js, siguiendo el mismo patrón de declaración que `_datosTurnosMemo`
    - Declarar ambas como `var _histGestionesPrincipalMemo = null;` y `var _histGestionesReestMemo = null;`
    - Incluir JSDoc type annotations (`@type {Array<Array<string>>|null}`)
    - Ubicar las declaraciones junto a las demás variables memo existentes
    - _Requirements: 1.3, 2.3, 8.1, 8.2_

  - [x] 1.2 Implementar la función accessor `_getHistGestionesPrincipal()` en Código.js
    - Si memo !== null y es Array válido → retornar memo (memo hit) y loguear SPERF
    - Si memo es non-null pero no-Array → descartar (null), log warning, continuar a fresh read
    - Fresh read: `_abrirSSCacheado(TARGET_SOLICITUDES_SS_ID).getSheetByName("Historico_Gestiones")`, getRange(2,1,lastRow-1, max(lastCol,61)).getDisplayValues()
    - Retry 1 vez si la lectura falla; si retry también falla → memo = null, return []
    - Loguear SPERF en cada branch (fresh read ms, memo hit, error, retry)
    - _Requirements: 1.1, 1.2, 1.4, 3.1, 3.3, 5.2, 5.3_

  - [x] 1.3 Implementar la función accessor `_getHistGestionesReest()` en Código.js
    - Misma lógica que `_getHistGestionesPrincipal()` pero para `ID_HOJA_REESTUDIOS`
    - Fresh read: getRange(2,1,lastRow-1, max(lastCol,14)).getDisplayValues()
    - Retry 1 vez en caso de excepción; dejar memo null si ambos intentos fallan
    - Loguear SPERF en cada branch
    - _Requirements: 2.1, 2.2, 2.4, 3.2, 3.4, 5.2, 5.3_

  - [x] 1.4 Implementar funciones de invalidación: `_invalidarMemoHistPrincipal()`, `_invalidarMemoHistReest()`, `_invalidarMemoHistGestiones()`
    - Cada función setea su variable a null
    - Seguir el mismo patrón que `_invalidarCacheTurnos()`
    - _Requirements: 8.3_

- [x] 2. Refactorizar sub-funciones para consumir el memo en vez de leer de red
  - [x] 2.1 Refactorizar `getTableData()` — bloque Historico_Gestiones principal
    - Reemplazar TextFinder + lecturas individuales de filas por: `_getHistGestionesPrincipal()` + filtro in-memory en col 25 (idx 0-based para col 26)
    - Filtrar filas del analista (`dataHist[i][25].trim().toLowerCase() === userEmail`)
    - Mantener la lógica de construcción de objetos fila existente usando los datos del array
    - _Requirements: 4.1, 4.5, 3.1_

  - [x] 2.2 Refactorizar `getTableData()` — bloque Historico_Gestiones reestudios
    - Reemplazar TextFinder + lecturas individuales por: `_getHistGestionesReest()` + filtro in-memory en col 6 (idx 0-based para col 7)
    - Filtrar filas del analista (`dataReest[i][6].trim().toLowerCase() === userEmail`)
    - _Requirements: 4.2, 3.2_

  - [x] 2.3 Refactorizar `obtenerCasosPendientesAnalista()` — bloque digital
    - Reemplazar TextFinder en col 26 por: `_getHistGestionesPrincipal()` + filtro in-memory por col 25 (email) y col 16 (estado)
    - Construir lista de filas candidatas con su número de fila (i + 2)
    - _Requirements: 4.5, 3.1_

  - [x] 2.4 Refactorizar `obtenerCasosPendientesAnalista()` — bloque reestudios
    - Reemplazar TextFinder en col 7 por: `_getHistGestionesReest()` + filtro in-memory por col 6 (email) y col 10 (estado)
    - _Requirements: 4.2, 3.2_

  - [x] 2.5 Refactorizar `_calcularGestionesHoyTodos()` — bloque principal
    - Reemplazar `hojaHistG.getRange(2, 26, lastRow-1, 2).getDisplayValues()` por: `_getHistGestionesPrincipal()` + extracción de cols 25-26 en memoria
    - Iterar dataset y usar idx 25 (asignado), idx 26 (fechaFin)
    - _Requirements: 4.3, 3.1_

  - [x] 2.6 Refactorizar `_calcularGestionesHoyTodos()` — bloque reestudios
    - Reemplazar `hojaHistReest.getRange(2, 7, lastRow-1, 4).getDisplayValues()` por: `_getHistGestionesReest()` + extracción de cols 6-9 en memoria
    - Iterar dataset y usar idx 6 (asignado), idx 9 (fechaFin)
    - _Requirements: 4.4, 3.2_

- [x] 3. Checkpoint — Verificar integración de memos
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar que `cargarPanelAnalista()` ejecuta sin errores con los memos activos
  - Confirmar que no se introdujeron regresiones en la lógica de filtrado

- [x] 4. Garantizar aislamiento de funciones externas
  - [x] 4.1 Verificar que `RequestLeadUnificado`, `guardarGestionBiometria`, `guardarGestionReestudio` y `obtenerDetalleGestionesHoy` NO usan los accessors del memo
    - Estas funciones ejecutan en su propio Execution_Scope — el memo se resetea automáticamente a null
    - Asegurar que `_textFinderCache` se mantiene disponible para funciones fuera de Panel_Loader
    - No modificar la lógica de funciones que operan en scopes independientes
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 4.2 Escribir unit tests para aislamiento de funciones externas
    - Test: memo comienza null en un nuevo scope (simular llamada aislada)
    - Test: funciones fuera de Panel_Loader leen datos frescos
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 5. Implementar property-based tests para memoización
  - [ ]* 5.1 Escribir property test: idempotencia del accessor
    - **Property 1: Read-once-use-many (Idempotence of accessor)**
    - Generar datos 2D aleatorios con fast-check, mockear sheet.getDisplayValues() para retornarlos
    - Verificar que N llamadas al accessor (N ≥ 1) retornan siempre el mismo resultado y getDisplayValues se invoca exactamente 1 vez
    - **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 7.1, 7.2, 7.3**

  - [ ]* 5.2 Escribir property test: extracción correcta de subconjunto de columnas
    - **Property 2: Column subset extraction correctness**
    - Generar arrays 2D con C ≥ 61 columnas, extraer subset [a..b], verificar equivalencia con slice directo
    - **Validates: Requirements 4.3, 4.4**

  - [ ]* 5.3 Escribir property test: equivalencia de búsqueda in-memory por email
    - **Property 3: In-memory email search equivalence**
    - Generar dataset + emails aleatorios, verificar que el filtro in-memory (`trim().toLowerCase() === email`) produce los mismos índices que un brute-force search
    - **Validates: Requirements 4.5**

  - [ ]* 5.4 Escribir property test: detección y recuperación de memo inválido
    - **Property 4: Invalid memo detection and recovery**
    - Asignar valores no-array al memo (number, string, object, undefined), verificar que el accessor descarta el valor, re-lee, y retorna datos válidos o []
    - **Validates: Requirements 1.4**

  - [ ]* 5.5 Escribir property test: retry en caso de fallo de lectura
    - **Property 5: Read failure retry and graceful degradation**
    - Mockear getDisplayValues para lanzar excepción en primer y/o segundo intento, verificar: retry exactamente 1 vez; si ambos fallan → memo null + return []
    - **Validates: Requirements 2.4, 3.5, 5.3**

  - [ ]* 5.6 Escribir property test: invalidación resetea memo a null
    - **Property 6: Invalidation resets memo to null**
    - Generar estados no-null (arrays de cualquier tamaño), invocar invalidación, verificar memo === null y siguiente llamada al accessor hace fresh read
    - **Validates: Requirements 8.3**

- [~] 6. Checkpoint final — Validar optimización completa
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar SPERF logs muestran "memo hit" con latencia ≤5ms
  - Confirmar que la ejecución total de `cargarPanelAnalista()` ≤ 5000ms (vs baseline ~7000ms)
  - _Requirements: 5.1, 5.2_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- El proyecto usa Google Apps Script (JavaScript ES5/ES6 limitado en server-side) — los tests se ejecutan en Node.js con vitest + fast-check
- Los mocks en tests simulan la API de Google Sheets (`getSheetByName`, `getRange`, `getDisplayValues`, `getLastRow`, `getLastColumn`)
- `_textFinderCache` se mantiene para funciones fuera de Panel_Loader — no se elimina

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "5.1", "5.2", "5.3", "5.4", "5.5", "5.6"] }
  ]
}
```
