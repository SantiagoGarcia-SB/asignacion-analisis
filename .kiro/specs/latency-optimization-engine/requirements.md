# Requirements Document

## Introduction

Este feature aborda los problemas severos de latencia en el sistema de asignación de casos a analistas, implementado como Google Apps Script. Las funciones críticas (`RequestLeadUnificado`, `actualizarEstadoPropio`, `guardarGestionBiometria`) presentan tiempos de respuesta de 5–26 segundos debido a patrones de acceso a datos ineficientes: lecturas redundantes de hojas completas dentro del ScriptLock global, iteraciones duplicadas sobre los mismos arreglos, uso de `createTextFinder` cuando los datos ya están en memoria, y lecturas individuales fila-por-fila en lugar de lecturas por bloque. La optimización preserva todas las garantías de concurrencia existentes (ningún caso se asigna a dos analistas simultáneamente) mientras reduce significativamente el tiempo que el ScriptLock permanece bloqueado y la cantidad de viajes de red al API de SpreadsheetApp.

## Glossary

- **Motor_Asignación**: Función `RequestLeadUnificado` en `MotorAsignacion.js` que gestiona la asignación atómica de casos a analistas bajo ScriptLock.
- **ScriptLock**: Candado global de Google Apps Script (`LockService.getScriptLock()`) que serializa las ejecuciones concurrentes de todo el script. Protege la garantía de que dos analistas no reciban el mismo caso.
- **Sección_Crítica**: Bloque de código que se ejecuta mientras el ScriptLock está adquirido. Cuanto más corta, menor la contención entre analistas.
- **Viaje_Red**: Cada llamada a la API de SpreadsheetApp (getValues, getRange, createTextFinder, setValue, flush) implica una solicitud HTTP al servidor de Google Sheets.
- **Fusión_Funciones**: Técnica de combinar dos funciones que iteran el mismo arreglo en una sola pasada, eliminando el recorrido duplicado.
- **Lectura_Bloque**: Leer un rango contiguo de filas [minRow:maxRow] en una sola llamada a getRange en lugar de N llamadas individuales fila por fila.
- **Filtrado_Memoria**: Recorrer un arreglo ya cargado en una variable JavaScript para encontrar coincidencias, en lugar de hacer un Viaje_Red con createTextFinder.
- **Contención**: Tiempo que un analista espera en `lock.waitLock()` mientras otro analista tiene el ScriptLock adquirido.
- **Hoja_Solicitud**: Pestaña "solicitud" del spreadsheet principal — contiene los casos nuevos pendientes de asignar y los legados aún no migrados.
- **Hoja_ORIGEN**: Pestaña "ORIGEN" del spreadsheet de reestudios — contiene los reestudios pendientes de asignar.
- **Historico_Gestiones**: Pestaña donde se mueven los casos ya asignados. Crece sin límite, nunca se archiva.
- **Re-validación**: Paso que verifica, después de adquirir el ScriptLock, que un caso leído antes del lock todavía está disponible para asignación (no fue tomado por otro analista en el intervalo).

## Requirements

### Requisito 1: Fusión de funciones de conteo y recolección para hoja principal

**Historia de usuario:** Como analista, quiero que la solicitud de un nuevo caso sea más rápida, para no esperar innecesariamente mientras el sistema recorre los mismos datos dos veces dentro del candado global.

#### Criterios de Aceptación

1. WHEN el Motor_Asignación necesita contar asignaciones del día y recolectar casos pendientes de la Hoja_Solicitud, THE Motor_Asignación SHALL ejecutar ambas operaciones en una única iteración sobre el arreglo de datos cargado en memoria.
2. WHEN se fusionan `_contarDesdeHojaPrincipal` y `_recolectarPendientesPrincipal`, THE Motor_Asignación SHALL producir resultados de conteo idénticos a los que producían las funciones separadas para cualquier conjunto de datos de entrada.
3. WHEN se fusionan `_contarDesdeHojaPrincipal` y `_recolectarPendientesPrincipal`, THE Motor_Asignación SHALL producir la misma lista de casos pendientes (mismo contenido y orden) que producía `_recolectarPendientesPrincipal` de forma independiente.
4. THE Motor_Asignación SHALL reducir el tiempo de CPU dentro de la Sección_Crítica dedicado al procesamiento de la Hoja_Solicitud en al menos un 30% respecto a la ejecución secuencial de ambas funciones separadas.

### Requisito 2: Fusión de funciones de conteo y recolección para hoja de reestudios

**Historia de usuario:** Como analista que trabaja con reestudios, quiero que el procesamiento de la hoja ORIGEN sea eficiente, para que el sistema no itere los mismos datos dos veces bajo el candado global.

#### Criterios de Aceptación

1. WHEN el Motor_Asignación necesita contar asignaciones del día y recolectar pendientes de reestudios de la Hoja_ORIGEN, THE Motor_Asignación SHALL ejecutar ambas operaciones en una única iteración sobre el arreglo de datos cargado en memoria.
2. WHEN se fusionan `_contarDesdeHojaReestudios` y `_recolectarPendientesReestudios`, THE Motor_Asignación SHALL producir resultados de conteo idénticos a los de las funciones separadas.
3. WHEN se fusionan `_contarDesdeHojaReestudios` y `_recolectarPendientesReestudios`, THE Motor_Asignación SHALL producir la misma lista de candidatos pendientes que producía `_recolectarPendientesReestudios` de forma independiente.
4. THE Motor_Asignación SHALL reducir el tiempo de CPU dentro de la Sección_Crítica dedicado al procesamiento de la Hoja_ORIGEN en al menos un 30% respecto a la ejecución secuencial de ambas funciones separadas.

### Requisito 3: Mover lecturas de hojas completas fuera del ScriptLock

**Historia de usuario:** Como analista, quiero que el tiempo que el sistema bloquea a otros compañeros sea el mínimo posible, para que cuando varios analistas piden caso al mismo tiempo la espera sea corta.

#### Criterios de Aceptación

1. WHEN el Motor_Asignación ejecuta `RequestLeadUnificado`, THE Motor_Asignación SHALL realizar la lectura completa de la Hoja_Solicitud y la Hoja_ORIGEN ANTES de adquirir el ScriptLock.
2. WHEN el ScriptLock se adquiere, THE Motor_Asignación SHALL usar los datos pre-cargados para el conteo y la recolección de pendientes sin realizar Viajes_Red adicionales de lectura de hojas completas.
3. WHEN el Motor_Asignación adquiere el ScriptLock con datos pre-cargados, THE Motor_Asignación SHALL ejecutar una Re-validación del caso seleccionado antes de escribir la asignación, confirmando que la fila del caso aún no tiene un analista asignado en la celda correspondiente.
4. IF la Re-validación detecta que el caso seleccionado fue asignado a otro analista entre la lectura y la escritura, THEN THE Motor_Asignación SHALL descartar ese candidato y seleccionar el siguiente caso disponible de la lista de pendientes sin liberar el ScriptLock.
5. THE Motor_Asignación SHALL preservar la garantía de que dos analistas no reciban el mismo caso, aun con la lectura realizada fuera del candado.
6. WHILE el ScriptLock está adquirido, THE Motor_Asignación SHALL NO invocar llamadas a APIs externas (SAI) ni lecturas completas de hojas que no estén directamente relacionadas con la escritura de la asignación.

### Requisito 4: Eliminar llamadas redundantes a createTextFinder sobre datos ya en memoria

**Historia de usuario:** Como analista que revisa su panel, quiero que el sistema no haga viajes de red innecesarios cuando ya tiene toda la información en una variable local.

#### Criterios de Aceptación

1. WHEN `getTableData` ya posee un arreglo completo de la Hoja_Solicitud cargado en memoria, THE Sistema SHALL filtrar los casos del analista mediante recorrido del arreglo en JavaScript en lugar de invocar `createTextFinder` sobre la hoja.
2. WHEN los datos de la Hoja_ORIGEN ya están cargados en memoria dentro de la misma ejecución, THE Sistema SHALL filtrar los casos del analista mediante recorrido del arreglo en JavaScript.
3. THE Sistema SHALL conservar el uso de `createTextFinder` exclusivamente para hojas de crecimiento ilimitado (Historico_Gestiones) donde una lectura completa sería prohibitiva.
4. WHEN se reemplaza `createTextFinder` por Filtrado_Memoria, THE Sistema SHALL producir el mismo conjunto de filas que el TextFinder habría encontrado para el mismo correo del analista.

### Requisito 5: Lectura por bloque de casos abiertos en Historico_Gestiones

**Historia de usuario:** Como analista, quiero que la carga de mis casos pendientes del histórico sea rápida, para que el panel no tarde más de lo necesario en mostrar mis casos.

#### Criterios de Aceptación

1. WHEN `getTableData` identifica N filas abiertas del analista en Historico_Gestiones mediante TextFinder, THE Sistema SHALL leer el bloque contiguo [minRow:maxRow] en una sola llamada a `getRange` y filtrar en memoria, en lugar de realizar N llamadas individuales `getRange(fila, 1, 1, cols)`.
2. WHEN el bloque contiguo [minRow:maxRow] contiene filas de otros analistas, THE Sistema SHALL descartarlas en memoria sin efecto sobre el resultado final.
3. THE Sistema SHALL producir el mismo conjunto de datos de casos abiertos del analista que la implementación actual de N lecturas individuales.
4. WHEN N es mayor que 1, THE Sistema SHALL reducir el número de Viajes_Red de N a 1 para obtener los datos completos de los casos abiertos.

### Requisito 6: Preservación de la garantía de exclusividad de asignación

**Historia de usuario:** Como líder de equipo, quiero que ninguna optimización de velocidad comprometa la regla de que un caso solo se asigna a un analista, para que no ocurran asignaciones duplicadas.

#### Criterios de Aceptación

1. THE Motor_Asignación SHALL mantener el ScriptLock adquirido durante toda la ventana de tiempo entre la verificación de disponibilidad del caso y la escritura de la asignación.
2. IF dos analistas invocan `RequestLeadUnificado` simultáneamente para el mismo tipo de caso, THEN THE Motor_Asignación SHALL asignar cada caso a exactamente un analista, sin duplicados.
3. WHEN se mueven lecturas fuera del ScriptLock, THE Motor_Asignación SHALL NO permitir que un caso previamente marcado como disponible en la lectura pre-lock se asigne si entre la lectura y la adquisición del lock otro proceso ya lo asignó.
4. THE Motor_Asignación SHALL ejecutar `SpreadsheetApp.flush()` antes de liberar el ScriptLock para garantizar que las escrituras de asignación son visibles para la siguiente ejecución que adquiera el candado.

### Requisito 7: Compatibilidad con el flujo existente de contadores incrementales

**Historia de usuario:** Como administrador del sistema, quiero que las optimizaciones de lectura no rompan los contadores incrementales de cupos y carga pendiente, para que los cupos diarios sigan funcionando correctamente.

#### Criterios de Aceptación

1. WHEN el Motor_Asignación fusiona las funciones de conteo y recolección, THE Motor_Asignación SHALL seguir sumando los contadores incrementales (`_obtenerConteoHoyAnalista`, `_obtenerCargaPendienteAnalista`) al total, exactamente como lo hace la implementación actual.
2. WHEN el Motor_Asignación completa una asignación exitosa, THE Motor_Asignación SHALL actualizar los contadores incrementales (`_incrementarContadorCupo`, `_ajustarCargaPendiente`) con los mismos valores que la implementación actual.
3. IF los contadores incrementales derivan respecto a la realidad de las hojas, THEN THE trigger_recalcularContadores SHALL seguir siendo capaz de reconstruirlos desde cero sin conflicto con las optimizaciones aplicadas.

### Requisito 8: No degradar la funcionalidad de los 3 endpoints de guardado exentos de ScriptLock

**Historia de usuario:** Como analista que gestiona un caso, quiero que el guardado de gestiones siga siendo rápido y no se vea afectado por las optimizaciones del motor de asignación.

#### Criterios de Aceptación

1. THE Sistema SHALL NO reintroducir el ScriptLock en `guardarCambiosInternos`, `guardarGestionBiometria`, ni la ruta HISTORICO de `guardarGestionReestudio`.
2. WHEN se aplican optimizaciones de Filtrado_Memoria o Lectura_Bloque en funciones compartidas, THE Sistema SHALL NO introducir efectos colaterales que modifiquen el comportamiento de los endpoints de guardado.
3. THE Sistema SHALL mantener la independencia funcional de los endpoints de guardado respecto al Motor_Asignación.
