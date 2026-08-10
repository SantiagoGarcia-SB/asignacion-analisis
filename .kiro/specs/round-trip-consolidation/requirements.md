# Requirements Document

## Introduction

Esta feature consolida los 5 patrones de multi-round-trip restantes en la aplicación de asignación de análisis. Cada `google.script.run` agrega 4-9 segundos de overhead de comunicación del iframe de Google Apps Script, y los patrones identificados producen 2-3 viajes secuenciales innecesarios.

Las consolidaciones previas (`activarYAsignar` y `guardarYAsignarSiguiente`) validaron el patrón: ejecutar múltiples operaciones en una sola invocación del servidor reutilizando `_abrirSSCacheado()` para memoizar spreadsheets dentro de la misma ejecución. Esta feature extiende ese patrón a los 5 flujos restantes.

## Glossary

- **Sistema_Cliente**: Frontend de la aplicación ejecutado en `main.js.html` dentro del iframe de Google Apps Script.
- **Sistema_Servidor**: Backend en Google Apps Script (`Código.js`, `MotorAsignacion.js`, `Biometria.js`).
- **Función_AutoAsignarConPanel**: Nueva función servidor que ejecuta `autoAsignarDesdeEquipo()` + `cargarPanelAnalista()` en una sola invocación, retornando resultado de asignación y datos del panel en un único objeto.
- **Función_GuardarYAsignarSiguiente**: Función servidor existente que consolida guardado + auto-asignación + carga de panel en una sola ejecución.
- **Panel_Analista**: Conjunto de datos que el frontend necesita para renderizar la vista del analista (tabla de casos, cupos, pendientes de validación, gestiones cruzadas, estado, turno, permisos, motivos).
- **Vista_No_Unificada**: Modo de la aplicación donde `window.__IS_UNIFIED_VIEW__ === false`, usado por analistas que no tienen activada la vista unificada.
- **Vista_Unificada**: Modo de la aplicación donde `window.__IS_UNIFIED_VIEW__ === true`.
- **Caché_Solicitudes_Modal**: Estructura de datos en memoria del cliente que almacena los resultados de `getDataUniqueForSolicitud()` indexados por solicitudId durante la sesión de la pestaña.
- **Round_Trip**: Una invocación completa de `google.script.run` (ida al servidor + respuesta al cliente), con overhead de 4-9 segundos por la comunicación del iframe.
- **Polling_Tabla_Vacía**: Mecanismo periódico (`_ejecutarPoll`) que busca nuevos casos cuando la bandeja del analista está vacía.
- **Biometría_Deferred**: Invocación de `actualizarFaseBiometriaPendienteDeferred()` que actualiza la fase de solicitudes de biometría recién asignadas.
- **Fire_And_Forget**: Patrón de invocación donde el cliente no espera ni procesa la respuesta del servidor.

## Requirements

### Requirement 1: Consolidación post-guardado en Vista No Unificada

**User Story:** Como analista en vista no unificada, quiero que el flujo post-guardado con asignación use la misma función consolidada que la vista unificada, para que mi tiempo de espera se reduzca de ~12-27 segundos a ~4-9 segundos.

#### Acceptance Criteria

1. WHEN el Sistema_Cliente recibe una respuesta exitosa de guardado con `disparaAsignacion=true` y `window.__IS_UNIFIED_VIEW__ === false`, THE Sistema_Cliente SHALL invocar `guardarYAsignarSiguiente(_ultimosDatosGuardado)` en el servidor en lugar de la secuencia separada de `_dispararAutoAsignacion()` seguida de `cargarDatos()`, y SHALL lanzar `UX.showSuccessCheck()` de forma concurrente sin esperar la respuesta del servidor.
2. WHEN la Función_GuardarYAsignarSiguiente retorna en vista no unificada con `resp.panel` presente y sin `resp.panel._error`, THE Sistema_Cliente SHALL renderizar el panel con los datos recibidos en `resp.panel` mediante `_procesarRespuestaPanel(resp.panel)` sin ejecutar un Round_Trip adicional a `cargarDatos()`.
3. IF la Función_GuardarYAsignarSiguiente retorna con `resp.panel` nulo o con `resp.panel._error` en vista no unificada, THEN THE Sistema_Cliente SHALL ejecutar `cargarDatos()` como mecanismo de recuperación.
4. WHEN el Sistema_Cliente recibe una respuesta exitosa de guardado con `disparaAsignacion=false` y `window.__IS_UNIFIED_VIEW__ === false`, THE Sistema_Cliente SHALL invocar `cargarPanelAnalista()` directamente como único Round_Trip para refrescar el panel.
5. WHEN el Sistema_Cliente en vista no unificada recibe la respuesta de la Función_GuardarYAsignarSiguiente con `resp.asignacion.success=true` y `resp.asignacion.nueva=true`, THE Sistema_Cliente SHALL mostrar un toast de tipo info con el mensaje de asignación durante 5000ms; WHEN `resp.asignacion.success=false`, SHALL mostrar un toast de tipo warning con el mensaje de error durante 5000ms; WHEN `resp.asignacion` es null o `resp.asignacion.nueva=false`, SHALL no mostrar toast de asignación.
6. IF la invocación de `guardarYAsignarSiguiente()` falla (failure handler de `google.script.run`) en vista no unificada, THEN THE Sistema_Cliente SHALL ejecutar `cargarDatos()` como fallback y mostrar un mensaje de error genérico al analista.

### Requirement 2: Consolidación de auto-asignación con panel

**User Story:** Como analista activo cuya asignación post-guardado dispara `autoAsignarDesdeEquipo()` exitosamente, quiero que el panel se cargue en la misma invocación que la asignación, para que no haya un segundo viaje de red solo para obtener los datos del panel.

#### Acceptance Criteria

1. THE Sistema_Servidor SHALL exponer una función `autoAsignarConPanel()` que ejecute `autoAsignarDesdeEquipo()` seguido de `cargarPanelAnalista()` en una misma invocación, retornando ambos resultados en un único objeto.
2. WHEN `autoAsignarDesdeEquipo()` dentro de la Función_AutoAsignarConPanel retorna exitosamente (con o sin caso nuevo), THE Función_AutoAsignarConPanel SHALL invocar `cargarPanelAnalista()` a continuación y retornar ambos resultados.
3. IF `autoAsignarDesdeEquipo()` dentro de la Función_AutoAsignarConPanel lanza una excepción, THEN THE Función_AutoAsignarConPanel SHALL capturar la excepción y retornar `asignacion` con `success: false`, `message` conteniendo el mensaje de la excepción, `nueva: false`, `idsAsignados: []`, `faseTarget: null`, y proceder a ejecutar `cargarPanelAnalista()` retornando el resultado parcial.
4. IF `cargarPanelAnalista()` dentro de la Función_AutoAsignarConPanel lanza una excepción, THEN THE Función_AutoAsignarConPanel SHALL retornar el resultado de asignación con `panel` conteniendo `_error` con el mensaje de excepción y propiedades por defecto (`tabla: null, cupos: null, pendientesValidacion: [], gestionesHoyCruzadas: null`).
5. THE Función_AutoAsignarConPanel SHALL retornar un objeto con exactamente dos propiedades: `asignacion` (objeto con `success`, `message`, `nueva`, `idsAsignados`, `faseTarget`) y `panel` (objeto con los datos del Panel_Analista o con `_error`).
6. THE Función_AutoAsignarConPanel SHALL reutilizar los spreadsheets ya abiertos durante la auto-asignación para la carga del panel mediante `_abrirSSCacheado()`, evitando aperturas duplicadas.
7. IF el tiempo transcurrido desde el inicio de la Función_AutoAsignarConPanel alcanza 280 segundos antes de invocar `cargarPanelAnalista()`, THEN THE Función_AutoAsignarConPanel SHALL retornar los resultados obtenidos hasta ese momento con `panel: null`, sin intentar la carga del panel.

### Requirement 3: Eliminación del polling con delay artificial

**User Story:** Como analista con bandeja vacía cuyo polling encuentra un caso nuevo, quiero que el panel se cargue inmediatamente junto con el resultado de la asignación, para que no haya una espera artificial de 2 segundos más un segundo viaje de red.

#### Acceptance Criteria

1. WHEN el Polling_Tabla_Vacía ejecuta una auto-asignación y obtiene un resultado con `nueva=true`, THE Sistema_Cliente SHALL usar la Función_AutoAsignarConPanel en lugar de la secuencia de `autoAsignarDesdeEquipo()` seguida de un `setTimeout` de 2 segundos y `cargarDatos()`.
2. WHEN la Función_AutoAsignarConPanel retorna con `asignacion.nueva=true` y un `panel` no nulo sin propiedad `_error`, THE Sistema_Cliente SHALL mostrar un toast informativo con el mensaje de asignación y renderizar el panel inmediatamente con `_procesarRespuestaPanel(resp.panel)` sin delay artificial.
3. WHEN la Función_AutoAsignarConPanel retorna con `asignacion.nueva=true` pero `panel` nulo o con `_error`, THE Sistema_Cliente SHALL ejecutar `cargarDatos()` como recuperación sin delay artificial.
4. WHEN la Función_AutoAsignarConPanel retorna con `asignacion.nueva=false` o `asignacion.success=false`, THE Sistema_Cliente SHALL continuar el ciclo de polling sin invocar `cargarDatos()`.
5. WHEN el Sistema_Cliente usa la Función_AutoAsignarConPanel desde el polling, THE Sistema_Cliente SHALL detener el polling (`_detenerPollingTablaVacia()`) si el panel renderizado contiene al menos un caso en la tabla.
6. IF la llamada `google.script.run` a la Función_AutoAsignarConPanel desde el polling falla (failure handler), THEN THE Sistema_Cliente SHALL incrementar el delay de backoff del polling (hasta un máximo de 360 segundos), registrar el error en consola, y reprogramar el siguiente poll sin invocar `cargarDatos()`.

### Requirement 4: Caché cliente de datos de modal

**User Story:** Como analista que abre el detalle de un caso múltiples veces durante la misma sesión, quiero que los datos se obtengan del servidor solo la primera vez, para que las aperturas posteriores sean instantáneas sin esperar 4-9 segundos.

#### Acceptance Criteria

1. WHEN el Sistema_Cliente necesita los datos de `getDataUniqueForSolicitud(solicitudId)` y la Caché_Solicitudes_Modal contiene una entrada para ese `solicitudId`, THE Sistema_Cliente SHALL usar los datos cacheados sin invocar `google.script.run` y renderizar el contenido del modal en menos de 200 milisegundos desde el clic del usuario.
2. WHEN el Sistema_Cliente necesita los datos de `getDataUniqueForSolicitud(solicitudId)` y la Caché_Solicitudes_Modal NO contiene una entrada para ese `solicitudId` y NO existe una petición en vuelo para ese mismo `solicitudId`, THE Sistema_Cliente SHALL invocar `google.script.run.getDataUniqueForSolicitud(solicitudId)` y almacenar la respuesta con `success=true` en la Caché_Solicitudes_Modal indexada por `solicitudId`.
3. WHEN el Sistema_Cliente necesita los datos de `getDataUniqueForSolicitud(solicitudId)` y ya existe una petición en vuelo para ese mismo `solicitudId`, THE Sistema_Cliente SHALL esperar la resolución de la petición existente en lugar de lanzar una invocación duplicada a `google.script.run`.
4. IF `getDataUniqueForSolicitud(solicitudId)` retorna un resultado con `success=false`, THEN THE Sistema_Cliente SHALL NO almacenar el resultado en la Caché_Solicitudes_Modal, permitiendo un reintento en la próxima apertura del modal.
5. WHEN el Sistema_Cliente ejecuta un guardado exitoso de gestión (respuesta del servidor con `success=true`) para un `solicitudId`, THE Sistema_Cliente SHALL invalidar (eliminar) la entrada correspondiente en la Caché_Solicitudes_Modal para ese `solicitudId`, forzando una recarga fresca en la próxima apertura.
6. WHEN el Sistema_Cliente recarga la página o cierra la pestaña, THE Caché_Solicitudes_Modal SHALL descartarse completamente (almacenamiento solo en memoria de JavaScript, sin persistencia en `localStorage` ni `sessionStorage`).
7. THE Caché_Solicitudes_Modal SHALL aplicar a todas las funciones que invocan `getDataUniqueForSolicitud`: `poblarModalDig`, `poblarModalBio` y `poblarModalRst`.
8. THE Caché_Solicitudes_Modal SHALL almacenar un máximo de 50 entradas; WHEN se alcance el límite y se necesite almacenar una nueva entrada, THE Sistema_Cliente SHALL descartar la entrada menos recientemente accedida antes de insertar la nueva.

### Requirement 5: Ejecución server-side de biometría deferred

**User Story:** Como analista que recibe una asignación con casos de biometría, quiero que la actualización de fase de biometría se ejecute dentro de la misma invocación del servidor, para que no haya un Round_Trip adicional después de cada asignación.

#### Acceptance Criteria

1. WHEN la Función_AutoAsignarConPanel ejecuta `autoAsignarDesdeEquipo()` y el resultado incluye `idsAsignados` con al menos un elemento, THE Función_AutoAsignarConPanel SHALL ejecutar `actualizarFaseBiometriaPendienteDeferred(idsAsignados, faseTarget)` dentro de la misma invocación del servidor, antes de retornar la respuesta al cliente, e incluir `_biometriaEjecutada: true` en el objeto `asignacion` de la respuesta.
2. WHEN la Función_GuardarYAsignarSiguiente ejecuta `autoAsignarDesdeEquipo()` y el resultado incluye `idsAsignados` con al menos un elemento, THE Función_GuardarYAsignarSiguiente SHALL ejecutar `actualizarFaseBiometriaPendienteDeferred(idsAsignados, faseTarget)` dentro de la misma invocación del servidor, antes de retornar la respuesta al cliente, e incluir `_biometriaEjecutada: true` en el objeto `asignacion` de la respuesta.
3. IF la ejecución de `actualizarFaseBiometriaPendienteDeferred()` dentro de la función consolidada lanza una excepción, THEN THE función consolidada SHALL capturar la excepción, registrar el error en el log del servidor con `Logger.log`, retornar `_biometriaEjecutada: false` en el objeto `asignacion`, y continuar retornando la respuesta normalmente sin afectar al cliente.
4. WHEN la biometría deferred se ejecuta server-side dentro de la función consolidada, THE función consolidada SHALL completar la ejecución total (incluyendo biometría) dentro de 300 segundos para evitar timeout de la plataforma.
5. WHEN el Sistema_Cliente recibe `asignacion._biometriaEjecutada === true` en la respuesta de la Función_AutoAsignarConPanel o la Función_GuardarYAsignarSiguiente, THE Sistema_Cliente SHALL NO invocar `actualizarFaseBiometriaPendienteDeferred()` como Round_Trip adicional.
6. WHEN la función `activarYAsignar()` ejecuta la auto-asignación y el resultado incluye `idsAsignados` con al menos un elemento, THE función `activarYAsignar()` SHALL ejecutar `actualizarFaseBiometriaPendienteDeferred(idsAsignados, faseTarget)` dentro de la misma invocación del servidor y retornar un indicador `_biometriaEjecutada: true` en el resultado de asignación.
7. WHEN el Sistema_Cliente recibe `asignacion._biometriaEjecutada === true` en la respuesta de `activarYAsignar()`, THE Sistema_Cliente SHALL omitir la invocación fire-and-forget de `actualizarFaseBiometriaPendienteDeferred()`.
8. IF el Sistema_Cliente recibe `asignacion._biometriaEjecutada` ausente o con valor `false` en la respuesta de cualquier función consolidada y `asignacion.idsAsignados` contiene al menos un elemento, THEN THE Sistema_Cliente SHALL invocar `actualizarFaseBiometriaPendienteDeferred(idsAsignados, faseTarget)` como fire-and-forget para garantizar la actualización de fase.

### Requirement 6: Preservación de la estructura de respuesta de asignación

**User Story:** Como desarrollador del sistema, quiero que todas las funciones consolidadas preserven exactamente los campos `idsAsignados` y `faseTarget` de la respuesta de `autoAsignarDesdeEquipo()`, para que la lógica dependiente de biometría funcione correctamente.

#### Acceptance Criteria

1. THE Función_AutoAsignarConPanel SHALL incluir `idsAsignados` (array de strings) y `faseTarget` (string o null) en el objeto `asignacion` de su respuesta, pasando los valores exactos retornados por `autoAsignarDesdeEquipo()`.
2. WHEN `autoAsignarDesdeEquipo()` no se ejecuta o falla con excepción dentro de la Función_AutoAsignarConPanel, THE Función_AutoAsignarConPanel SHALL retornar `idsAsignados` como array vacío y `faseTarget` como null en el objeto `asignacion`.
3. THE Función_AutoAsignarConPanel SHALL incluir la propiedad `nueva` (boolean) en el objeto `asignacion`, reflejando exactamente el valor retornado por `autoAsignarDesdeEquipo()` (true si se asignó un caso nuevo, false si no había casos disponibles).

### Requirement 7: Compatibilidad y no regresión

**User Story:** Como equipo de desarrollo, quiero que las consolidaciones no rompan los flujos existentes, para que la transición sea transparente para los analistas.

#### Acceptance Criteria

1. WHEN el Sistema_Cliente invoca la Función_AutoAsignarConPanel desde `_dispararAutoAsignacion()`, THE Sistema_Cliente SHALL seguir mostrando un toast de información con el mensaje de asignación cuando `asignacion.nueva=true`, idéntico al comportamiento actual.
2. WHEN el Sistema_Servidor ejecuta la Función_AutoAsignarConPanel, THE ejecución total (asignación + panel + biometría deferred) SHALL completarse dentro de 300 segundos para respetar el límite de 6 minutos de Google Apps Script con margen de seguridad.
3. WHILE la Función_AutoAsignarConPanel está ejecutándose y el tiempo transcurrido excede 280 segundos, THE Función_AutoAsignarConPanel SHALL retornar los resultados obtenidos hasta ese momento (parciales) en lugar de permitir que la plataforma corte la ejecución.
4. THE Caché_Solicitudes_Modal SHALL ser un objeto en memoria JavaScript del navegador sin persistencia en `localStorage` ni `sessionStorage`, para evitar datos desactualizados entre sesiones.
5. WHEN el Sistema_Cliente detecta que `google.script.run` falla (failure handler) al invocar la Función_AutoAsignarConPanel, THE Sistema_Cliente SHALL ejecutar `cargarDatos()` como mecanismo de fallback y mostrar un mensaje de error genérico al analista.
6. THE Sistema_Servidor SHALL preservar el comportamiento de `_abrirSSCacheado()` (memoización por ejecución) sin cambios, beneficiándose automáticamente de que las funciones consolidadas ejecutan más operaciones en una sola invocación.

### Requirement 8: Rendimiento medible

**User Story:** Como equipo de operaciones, quiero poder verificar que las consolidaciones reducen efectivamente la latencia percibida por el analista.

#### Acceptance Criteria

1. THE Sistema_Cliente SHALL registrar marcas de tiempo con `_PERF.mark()` al inicio y al final de cada flujo consolidado (Función_AutoAsignarConPanel, ruta de vista no unificada, polling con panel), permitiendo medir el tiempo total del ciclo.
2. THE Sistema_Servidor SHALL registrar el tiempo total de ejecución de la Función_AutoAsignarConPanel con `Logger.log()` usando el formato `⏱ SPERF autoAsignarConPanel: total = Xms`, consistente con el patrón de telemetría existente en el proyecto.
3. WHEN la Función_AutoAsignarConPanel completa exitosamente con asignación y panel, THE ejecución del servidor (sin contar overhead de iframe) SHALL completarse en menos de 90 segundos bajo condiciones normales de carga.
