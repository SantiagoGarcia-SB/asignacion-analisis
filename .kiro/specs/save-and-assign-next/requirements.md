# Requirements Document

## Introduction

Optimización del flujo post-guardado de gestión para el panel de analistas. Actualmente, después de guardar una gestión que cierra un caso (estado APROBADO/NEGADO/RECHAZADO/APLAZADO), el sistema ejecuta 3 viajes de red secuenciales: guardar → asignar siguiente caso → cargar panel. Esto produce una latencia percibida de 13-27 segundos. Esta feature consolida las 3 operaciones en una sola llamada servidor (patrón ya validado por `activarYAsignar()`), eliminando 2 round-trips y permitiendo reutilizar spreadsheets ya abiertos entre pasos.

## Glossary

- **Sistema_Servidor**: Capa backend en Google Apps Script (Código.js, MotorAsignacion.js) que ejecuta lógica de negocio sobre Google Sheets.
- **Sistema_Cliente**: Capa frontend (main.js.html) que corre en el navegador del analista dentro del entorno de Google Apps Script (google.script.run).
- **Analista**: Usuario autenticado que gestiona casos de solicitudes desde el panel unificado.
- **Gestión**: Acción de resolución de un caso asignado al analista (incluye estado final, biometría, comentarios).
- **Estado_de_Cierre**: Uno de los estados que finaliza la gestión actual del analista sobre un caso: APROBADO, NEGADO, RECHAZADO o APLAZADO.
- **Auto_Asignación**: Proceso que asigna automáticamente el siguiente caso disponible al analista tras cerrar el caso actual.
- **Panel_Analista**: Datos consolidados que renderizan la vista del analista (tabla de casos, cupos, pendientes de validación, gestiones del día).
- **ScriptLock**: Mecanismo de exclusión mutua de Google Apps Script que serializa acceso a recursos compartidos entre ejecuciones concurrentes.
- **Round_Trip**: Ciclo completo de comunicación cliente → servidor → cliente vía google.script.run.
- **Función_Consolidada**: Nueva función servidor `guardarYAsignarSiguiente()` que ejecuta guardar + asignar + cargar panel en un solo Round_Trip.

## Requirements

### Requirement 1: Función consolidada servidor

**User Story:** Como analista, quiero que al guardar una gestión con estado de cierre el sistema ejecute guardado, asignación y carga de panel en una sola llamada, para reducir el tiempo de espera entre casos.

#### Acceptance Criteria

1. WHEN el Sistema_Cliente invoca la Función_Consolidada con datos de gestión que incluyen solicitudId no vacío, estado_q válido, y motivo obligatorio según el estado (motivo_aplazamiento si APLAZADO, motivo_negacion si NEGADO o RECHAZADO), y el estado corresponde a un Estado_de_Cierre, THE Sistema_Servidor SHALL ejecutar secuencialmente: guardar la gestión (lógica de `guardarCambiosInternos`), solicitar asignación del siguiente caso (`RequestLeadUnificado`), y cargar los datos del Panel_Analista (`cargarPanelAnalista`) dentro de la misma ejecución servidor.
2. WHEN el Sistema_Cliente invoca la Función_Consolidada con datos de gestión válidos y el estado NO corresponde a un Estado_de_Cierre, THE Sistema_Servidor SHALL ejecutar únicamente el guardado de la gestión y la carga de datos del Panel_Analista, sin ejecutar Auto_Asignación.
3. THE Función_Consolidada SHALL retornar un objeto con tres propiedades: resultado del guardado (success, message, disparaAsignacion), resultado de la asignación (success, message, nueva, idsAsignados, faseTarget) o null si no aplica, y datos del Panel_Analista (tabla, cupos, pendientesValidacion, gestionesHoyCruzadas, estadoActual, infoTurno, permisoVigente, yaAlmorzo, motivosAplazamiento, motivosNegacion).
4. WHEN el guardado de la gestión falla (retorna success=false), THE Función_Consolidada SHALL retornar inmediatamente el error del guardado sin ejecutar la Auto_Asignación ni la carga del Panel_Analista.
5. IF la carga del Panel_Analista falla después de un guardado exitoso, THEN THE Función_Consolidada SHALL retornar el resultado exitoso del guardado, el resultado de la asignación (si se ejecutó), y un objeto de panel con valores por defecto que indique el error, sin revertir el guardado ni la asignación ya ejecutados.
6. IF el Sistema_Cliente invoca la Función_Consolidada con solicitudId vacío o ausente, THEN THE Función_Consolidada SHALL retornar inmediatamente un resultado de guardado con success=false y un mensaje indicando el dato faltante, sin ejecutar ninguna operación posterior.

### Requirement 2: Manejo de fallos en asignación

**User Story:** Como analista, quiero que si la asignación del siguiente caso falla (sin casos disponibles, cupos llenos, timeout de lock), el sistema igualmente me muestre el panel actualizado, para no quedar en un estado inconsistente.

#### Acceptance Criteria

1. IF la Auto_Asignación falla por ausencia de casos disponibles, THEN THE Función_Consolidada SHALL registrar en el resultado de asignación un objeto con success=false y un message indicando la ausencia de casos, y continuar ejecutando la carga del Panel_Analista retornando los datos completos del panel (tabla, cupos, pendientesValidacion, gestionesHoyCruzadas, estadoActual).
2. IF la Auto_Asignación falla por cupos del día completados, THEN THE Función_Consolidada SHALL registrar en el resultado de asignación un objeto con success=false y un message indicando los tipos de caso cuyos cupos están llenos, y continuar ejecutando la carga del Panel_Analista retornando los datos completos del panel.
3. IF la Auto_Asignación falla por timeout del ScriptLock tras 25 segundos de espera, THEN THE Función_Consolidada SHALL registrar en el resultado de asignación un objeto con success=false y un message indicando contención del sistema, y continuar ejecutando la carga del Panel_Analista retornando los datos completos del panel.
4. IF la Auto_Asignación lanza una excepción no controlada, THEN THE Función_Consolidada SHALL capturar la excepción, registrar un resultado de asignación con success=false y el mensaje de error de la excepción, y continuar ejecutando la carga del Panel_Analista retornando los datos completos del panel.
5. IF la carga del Panel_Analista falla después de un fallo de Auto_Asignación, THEN THE Función_Consolidada SHALL retornar el resultado de asignación con success=false, el message del fallo de asignación original, y datos del panel como null, de modo que el Sistema_Cliente pueda identificar la ausencia de datos de panel y ejecutar una recarga independiente.

### Requirement 3: Integración frontend con la función consolidada

**User Story:** Como analista, quiero que la animación de éxito se muestre inmediatamente mientras el servidor procesa la asignación, para percibir una respuesta más rápida.

#### Acceptance Criteria

1. WHEN el guardado retorna exitosamente con disparaAsignacion=true, THE Sistema_Cliente SHALL invocar la Función_Consolidada (`guardarYAsignarSiguiente`) en lugar de las llamadas separadas a `_dispararAutoAsignacion()` y `cargarDatos()`, pasando los mismos datos de gestión utilizados en el guardado.
2. WHEN el guardado retorna exitosamente con disparaAsignacion=false, THE Sistema_Cliente SHALL invocar únicamente la función servidor `cargarPanelAnalista()` para recargar el panel sin ejecutar Auto_Asignación, y renderizar el Panel_Analista con los datos recibidos en un solo Round_Trip.
3. WHEN el guardado retorna exitosamente (independientemente del valor de disparaAsignacion), THE Sistema_Cliente SHALL iniciar la animación de éxito (UX.showSuccessCheck) de forma concurrente con la invocación servidor, sin esperar la respuesta del servidor para mostrar la animación ni esperar el fin de la animación para procesar la respuesta del servidor.
4. WHEN la Función_Consolidada retorna exitosamente, THE Sistema_Cliente SHALL renderizar el Panel_Analista con los datos recibidos en la propiedad panel de la respuesta sin ejecutar un Round_Trip adicional a `cargarDatos()`.
5. IF la invocación a la Función_Consolidada falla (error de red o excepción servidor), THEN THE Sistema_Cliente SHALL mostrar un mensaje de error indicando el fallo de la operación post-guardado y ejecutar `cargarDatos()` como mecanismo de recuperación para actualizar el panel.
6. WHEN la animación de éxito finaliza antes de que la Función_Consolidada retorne, THE Sistema_Cliente SHALL esperar la respuesta del servidor antes de renderizar el Panel_Analista, sin mostrar indicadores de carga adicionales durante la espera.

### Requirement 4: Notificaciones al analista según resultado de asignación

**User Story:** Como analista, quiero recibir un mensaje claro indicando si el siguiente caso fue asignado o si no hay casos disponibles, para saber qué esperar sin consultar manualmente.

#### Acceptance Criteria

1. WHEN la Función_Consolidada retorna con asignación exitosa (asignacion.success=true y asignacion.nueva=true), THE Sistema_Cliente SHALL mostrar un toast no-modal de tipo "info" con el mensaje de asignación recibido del servidor, auto-descartable tras 5000 milisegundos.
2. WHEN la Función_Consolidada retorna con asignación fallida (asignacion.success=false), THE Sistema_Cliente SHALL mostrar un toast no-modal de tipo "warning" con el motivo del fallo (asignacion.message) sin bloquear la interacción del analista con el panel, auto-descartable tras 5000 milisegundos.
3. WHEN la Función_Consolidada retorna sin intentar asignación (asignacion=null), THE Sistema_Cliente SHALL mostrar únicamente el toast de éxito del guardado sin mensajes adicionales de asignación.
4. WHEN la Función_Consolidada retorna con asignacion.success=true y asignacion.nueva=false (caso ya asignado previamente, sin nueva asignación), THE Sistema_Cliente SHALL no mostrar toast de asignación y proceder directamente a renderizar el Panel_Analista.

### Requirement 5: Reutilización de spreadsheets entre pasos

**User Story:** Como equipo de desarrollo, quiero que la función consolidada reutilice los spreadsheets ya abiertos durante el guardado para la fase de asignación, para reducir el tiempo total de ejecución servidor.

#### Acceptance Criteria

1. WHEN el guardado de la gestión ya abrió el spreadsheet de solicitudes (TARGET_SOLICITUDES_SS_ID), THE Función_Consolidada SHALL pasar la referencia memoizada a la lógica de Auto_Asignación, de manera que no se ejecute una llamada adicional a SpreadsheetApp.openById() para ese mismo ID dentro de la misma ejecución.
2. WHEN el guardado de la gestión ya abrió el spreadsheet de reestudios (ID_HOJA_REESTUDIOS), THE Función_Consolidada SHALL pasar la referencia memoizada a la lógica de Auto_Asignación, de manera que no se ejecute una llamada adicional a SpreadsheetApp.openById() para ese mismo ID dentro de la misma ejecución.
3. THE Función_Consolidada SHALL completar la secuencia guardado + asignación + carga de panel en un tiempo total no superior a 90 segundos en condiciones normales de operación (hojas con hasta 5000 filas en solicitudes y 2000 filas en ORIGEN), y siempre dentro del límite absoluto de 6 minutos de Google Apps Script.
4. IF la ejecución de la Función_Consolidada supera los 300 segundos (5 minutos) sin haber completado los tres pasos, THEN THE Función_Consolidada SHALL retornar el resultado parcial obtenido hasta ese momento (guardado exitoso con asignación y/o panel como null) en lugar de permitir que la plataforma termine la ejecución por timeout.

### Requirement 6: Compatibilidad con flujo existente de biometría deferred

**User Story:** Como analista, quiero que la asignación de casos con biometría pendiente siga devolviendo los IDs para actualización deferred, sin romper el patrón existente.

#### Acceptance Criteria

1. WHEN la Auto_Asignación dentro de la Función_Consolidada asigna al menos un caso de tipo desaplazamiento, THE Función_Consolidada SHALL incluir en el resultado de asignación la propiedad idsAsignados (array de strings con los IDs de solicitud de tipo desaplazamiento asignados) y la propiedad faseTarget con valor "ASIGNADA".
2. WHEN la Auto_Asignación dentro de la Función_Consolidada NO asigna ningún caso de tipo desaplazamiento, THE Función_Consolidada SHALL retornar idsAsignados como array vacío y faseTarget como null en el resultado de asignación.
3. WHEN el Sistema_Cliente recibe idsAsignados con al menos un elemento en el resultado de asignación de la Función_Consolidada, THE Sistema_Cliente SHALL invocar `actualizarFaseBiometriaPendienteDeferred(idsAsignados, faseTarget)` sin registrar handler de respuesta (fire-and-forget), de modo que el renderizado del Panel_Analista no se bloquee esperando la finalización de dicha invocación.
4. IF el Sistema_Cliente recibe idsAsignados vacío o ausente en el resultado de asignación de la Función_Consolidada, THEN THE Sistema_Cliente SHALL omitir la invocación a `actualizarFaseBiometriaPendienteDeferred()` y continuar con el renderizado normal del Panel_Analista.

### Requirement 7: Preservación del comportamiento en vista no unificada

**User Story:** Como analista usando la vista no unificada, quiero que el flujo post-guardado siga funcionando sin cambios, para no afectar usuarios que no usan la vista unificada.

#### Acceptance Criteria

1. WHILE el Sistema_Cliente opera en vista no unificada (window.__IS_UNIFIED_VIEW__ === false), WHEN el guardado retorna exitosamente con disparaAsignacion=true, THE Sistema_Cliente SHALL ejecutar `_dispararAutoAsignacion()` y `cargarDatos()` como llamadas separadas al servidor sin invocar la Función_Consolidada.
2. WHILE el Sistema_Cliente opera en vista no unificada (window.__IS_UNIFIED_VIEW__ === false), WHEN el guardado retorna exitosamente con disparaAsignacion=false, THE Sistema_Cliente SHALL ejecutar únicamente `cargarDatos()` sin invocar la Función_Consolidada ni `_dispararAutoAsignacion()`.
3. WHILE el Sistema_Cliente opera en vista unificada (window.__IS_UNIFIED_VIEW__ === true), WHEN el guardado retorna exitosamente con disparaAsignacion=true, THE Sistema_Cliente SHALL invocar la Función_Consolidada en lugar de las llamadas separadas a `_dispararAutoAsignacion()` y `cargarDatos()`.
4. IF el Sistema_Cliente opera en vista no unificada y la Función_Consolidada es invocada por error, THEN THE Sistema_Cliente SHALL no ejecutar la llamada y continuar con el flujo de llamadas separadas (`guardarCambiosInternos` → `_dispararAutoAsignacion` → `cargarDatos`).
