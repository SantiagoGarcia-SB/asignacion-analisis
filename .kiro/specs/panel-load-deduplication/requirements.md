# Requirements Document

## Introduction

Reducción de latencia en `cargarPanelAnalista()` eliminando lecturas redundantes de las hojas `Historico_Gestiones` (principal y reestudios) dentro de una misma ejecución del servidor. Actualmente tres sub-funciones — `getTableData()` (vía `_filasFiltradasPorAnalista`), `obtenerCasosPendientesAnalista()` y `obtenerGestionesHoyCruzadas()` (vía `_calcularGestionesHoyTodos`) — leen de forma independiente los mismos datos de Historico_Gestiones, pagando ~800-1200ms de red por cada lectura. Aplicar el patrón "read once, use many" (memoización por ejecución, ya probado con `_datosTurnosMemo`, `_datosUsuariosMemo` y `_scoreMapMemo`) permite reducir 2-4 segundos del tiempo total de carga del panel.

## Glossary

- **Panel_Loader**: La función `cargarPanelAnalista()` que orquesta las sub-llamadas al servidor y devuelve los datos consolidados al cliente.
- **Historico_Gestiones_Principal**: Hoja "Historico_Gestiones" dentro del spreadsheet `TARGET_SOLICITUDES_SS_ID` (warehouse). Contiene casos digitales, desaplazamiento e inducción ya gestionados (~1257+ filas, crece sin límite).
- **Historico_Gestiones_Reestudios**: Hoja "Historico_Gestiones" dentro del spreadsheet `ID_HOJA_REESTUDIOS`. Contiene reestudios, UAR y biometría fallida ya gestionados (~24+ filas).
- **Memo_Variable**: Variable de módulo (scope de ejecución) que almacena datos leídos durante la primera invocación y los reutiliza en invocaciones posteriores dentro de la misma ejecución de Apps Script.
- **Execution_Scope**: El ámbito de vida de una variable de módulo en Google Apps Script — existe solo durante una invocación del servidor (no persiste entre ejecuciones distintas).
- **Sub_Function**: Cualquiera de las funciones llamadas por Panel_Loader que necesita datos de Historico_Gestiones: `getTableData`, `obtenerCasosPendientesAnalista`, `obtenerGestionesHoyCruzadas`.
- **Network_Round_Trip**: Una llamada de lectura desde Apps Script al backend de Google Sheets (`getRange().getValues()` o `.getDisplayValues()`), con latencia típica de 800-1200ms.

## Requirements

### Requirement 1: Memoización de Historico_Gestiones Principal

**User Story:** Como analista, quiero que la carga de mi panel sea más rápida, para no perder 2-3 segundos esperando mientras el sistema relee los mismos datos que ya obtuvo.

#### Acceptance Criteria

1. WHEN Panel_Loader invokes a Sub_Function that needs data from Historico_Gestiones_Principal AND the Memo_Variable for Historico_Gestiones_Principal is null, THE Sub_Function SHALL read all rows and all columns (up to the last column with data) from Google Sheets using getDisplayValues, store the resulting 2D array in the Memo_Variable, and return the requested data from it
2. WHEN Panel_Loader invokes a Sub_Function that needs data from Historico_Gestiones_Principal AND the Memo_Variable for Historico_Gestiones_Principal already contains a non-null value, THE Sub_Function SHALL use the data from the Memo_Variable without performing a Network_Round_Trip
3. THE Memo_Variable for Historico_Gestiones_Principal SHALL be declared as a module-level variable initialized to null, following the same declaration pattern as `_datosTurnosMemo` in Código.js, and SHALL reset to null automatically at the start of each new Execution_Scope
4. IF the Memo_Variable contains data but a Sub_Function detects the data is not a valid 2D array (not an Array or length is 0 when the sheet is known to have rows), THEN THE system SHALL discard the Memo_Variable by setting it to null, read fresh data from Google Sheets, and log a warning via Logger.log indicating the fallback occurred

### Requirement 2: Memoización de Historico_Gestiones Reestudios

**User Story:** Como analista, quiero que la lectura de mis datos de reestudios no se duplique innecesariamente, para que el panel cargue más rápido.

#### Acceptance Criteria

1. WHEN Panel_Loader invokes a Sub_Function that needs data from Historico_Gestiones_Reestudios AND the Memo_Variable for Historico_Gestiones_Reestudios is null, THE Sub_Function SHALL read all rows (from row 2 to last row) and columns 1 through 14 from Google Sheets using getDisplayValues(), store the resulting two-dimensional array in the Memo_Variable, and return the requested subset to the caller
2. WHEN Panel_Loader invokes a Sub_Function that needs data from Historico_Gestiones_Reestudios AND the Memo_Variable for Historico_Gestiones_Reestudios is not null, THE Sub_Function SHALL extract its required columns from the Memo_Variable without performing a Network_Round_Trip
3. THE Memo_Variable for Historico_Gestiones_Reestudios SHALL be declared as a module-level variable initialized to null, existing only within Execution_Scope, and automatically resetting to null at the start of each new server execution
4. IF the initial Google Sheets read for Historico_Gestiones_Reestudios fails with an exception, THEN THE Sub_Function SHALL log the error, leave the Memo_Variable as null, and allow subsequent Sub_Functions within the same Execution_Scope to retry the read on their next invocation

### Requirement 3: Reducción de Network Round-Trips

**User Story:** Como líder técnico, quiero que el número de lecturas de red a Historico_Gestiones se reduzca al mínimo posible por ejecución, para liberar tiempo de ejecución del script.

#### Acceptance Criteria

1. WHILE Panel_Loader executes, THE system SHALL perform at most one Network_Round_Trip to Historico_Gestiones_Principal for bulk data retrieval (getRange/getValues/getDisplayValues), regardless of how many Sub_Functions need that data
2. WHILE Panel_Loader executes, THE system SHALL perform at most one Network_Round_Trip to Historico_Gestiones_Reestudios for bulk data retrieval (getRange/getValues/getDisplayValues), regardless of how many Sub_Functions need that data
3. WHEN the first Sub_Function reads Historico_Gestiones_Principal, THE system SHALL read at minimum columns 1 through 61 (all columns used by getUnifiedTableData, obtenerCasosPendientesAnalista, and _calcularGestionesHoyTodos) so that subsequent Sub_Functions consume the cached data without additional reads
4. WHEN the first Sub_Function reads Historico_Gestiones_Reestudios, THE system SHALL read at minimum columns 1 through 14 (all columns used by _calcularGestionesHoyTodos and obtenerCasosPendientesAnalista) so that subsequent Sub_Functions consume the cached data without additional reads
5. IF the single Network_Round_Trip to Historico_Gestiones_Principal or Historico_Gestiones_Reestudios fails, THEN THE system SHALL allow each Sub_Function to attempt its own independent read as a fallback and log a warning via SPERF indicating the memo read failed

### Requirement 4: Compatibilidad con Lecturas Parciales vs Completas

**User Story:** Como desarrollador, quiero que la memoización funcione con las distintas lecturas que hacen las sub-funciones (columnas parciales vs. filas completas), para que todas puedan consumir los datos cacheados.

#### Acceptance Criteria

1. THE Memo_Variable for Historico_Gestiones_Principal SHALL store all columns (columns 1 through the last column of the sheet) so that any Sub_Function needing a subset (e.g., columns 26-27 for `_calcularGestionesHoyTodos`, or full rows for `obtenerCasosPendientesAnalista`) can extract its required data from the single cached dataset
2. THE Memo_Variable for Historico_Gestiones_Reestudios SHALL store all columns (columns 1 through the last column of the sheet) so that any Sub_Function needing a subset (e.g., columns 7-10 for `_calcularGestionesHoyTodos`, or full rows for other consumers) can extract its required data from the single cached dataset
3. WHEN `_calcularGestionesHoyTodos` needs only columns 26-27 of Historico_Gestiones_Principal, THE Sub_Function SHALL extract those columns from the Memo_Variable in memory without an additional Network_Round_Trip
4. WHEN `_calcularGestionesHoyTodos` needs only columns 7-10 of Historico_Gestiones_Reestudios, THE Sub_Function SHALL extract those columns from the Memo_Variable in memory without an additional Network_Round_Trip
5. WHEN `obtenerCasosPendientesAnalista` needs to locate rows by analyst email in Historico_Gestiones_Principal, THE Sub_Function SHALL perform the search against the in-memory Memo_Variable data (filtering column 26 for the email) instead of using TextFinder on the live sheet, and `_textFinderCache` SHALL remain available as the lookup mechanism only for functions that execute outside Panel_Loader's Execution_Scope

### Requirement 5: Reducción Medible de Latencia

**User Story:** Como jefe de equipo, quiero que la mejora sea cuantificable en los logs de SPERF, para validar que la optimización cumple su objetivo.

#### Acceptance Criteria

1. WHEN Panel_Loader completes its execution after implementing the memoization of Historico_Gestiones, THE total elapsed time logged via SPERF SHALL be at most 5000ms (representing a reduction of at least 2000ms from the pre-optimization baseline minimum of 7000ms)
2. WHEN a Sub_Function obtains data from a Memo_Variable instead of performing a Network_Round_Trip, THE system SHALL log via SPERF a line labeled "memo hit" that includes the name of the Memo_Variable and the elapsed time of the cache retrieval (expected 0-5ms)
3. IF the initial Network_Round_Trip to populate a Memo_Variable fails (returns null or throws an error), THEN THE system SHALL retry the read from Google Sheets once, and if the retry also fails, log a warning via Logger.log indicating which Memo_Variable could not be populated and continue execution with an empty dataset for that source

### Requirement 6: No Afectar Funciones Fuera de Panel_Loader

**User Story:** Como desarrollador, quiero que la memoización no cause efectos secundarios en funciones que se ejecutan fuera del contexto del panel, para mantener la correctitud del sistema.

#### Acceptance Criteria

1. WHEN `RequestLeadUnificado` executes in its own Execution_Scope (not as part of Panel_Loader), THE Memo_Variable SHALL be empty and the function SHALL read fresh data from Google Sheets
2. WHEN `guardarGestionBiometria` or `guardarGestionReestudio` execute, THE Memo_Variable SHALL NOT interfere with their reads or writes to Historico_Gestiones
3. WHEN `obtenerDetalleGestionesHoy` executes independently (from the detail button), THE Memo_Variable SHALL be empty and the function SHALL read fresh data from Google Sheets

### Requirement 7: Consistencia de Datos Dentro de Una Ejecución

**User Story:** Como analista, quiero que todas las secciones de mi panel muestren datos coherentes entre sí, para no ver discrepancias entre lo que dice "gestiones hoy" y lo que muestra mi tabla.

#### Acceptance Criteria

1. WHILE Panel_Loader executes, THE Memo_Variable SHALL provide the same snapshot of Historico_Gestiones_Principal to all Sub_Functions that consume it
2. WHILE Panel_Loader executes, THE Memo_Variable SHALL provide the same snapshot of Historico_Gestiones_Reestudios to all Sub_Functions that consume it
3. THE system SHALL NOT update the Memo_Variable mid-execution even if an external process modifies Historico_Gestiones concurrently

### Requirement 8: Aislamiento de la Optimización

**User Story:** Como desarrollador, quiero que la memoización use el mismo patrón ya probado en el proyecto (`_datosTurnosMemo`, `_datosUsuariosMemo`), para que sea fácil de mantener y no introduzca complejidad nueva.

#### Acceptance Criteria

1. THE Memo_Variable for Historico_Gestiones_Principal SHALL follow the same declaration and usage pattern as `_datosTurnosMemo` in Código.js
2. THE Memo_Variable for Historico_Gestiones_Reestudios SHALL follow the same declaration and usage pattern as `_datosTurnosMemo` in Código.js
3. THE system SHALL expose a function to invalidate each Memo_Variable (set to null) following the same pattern as `_invalidarCacheTurnos`
