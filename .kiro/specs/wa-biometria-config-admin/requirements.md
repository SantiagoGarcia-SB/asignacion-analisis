# Requirements Document

## Introduction

Externalizar la parametrización de horarios y días de envío de WhatsApp de biometría al panel de administración existente. Actualmente los horarios permitidos para envío de mensajes WhatsApp están hardcodeados en la función `_dentroDeVentanaLey2300()` del archivo `Biometria.js`, así como la constante `VENTANA_HORAS_WA_BIOMETRIA = 4`. El objetivo es que un usuario administrador pueda modificar estos valores desde la vista admin sin intervención en código, respetando siempre los límites máximos definidos por la Ley 2300 de 2023.

## Glossary

- **Sistema_Admin**: Panel de administración existente (VistaAdmin.html) servido por Google Apps Script que gestiona configuraciones operativas del proyecto asignacion-analisis.
- **Motor_WA_Biometria**: Lógica del servidor (Biometria.js) que evalúa si es momento permitido para enviar mensajes WhatsApp de primer contacto a solicitantes con biometría pendiente.
- **Ventana_Ley_2300**: Franja horaria máxima legal definida por la Ley 2300 de 2023 para comunicaciones de cobranza: Lunes a Viernes 7:00–19:00, Sábados 8:00–15:00, Domingos y festivos prohibido.
- **Ventana_Horas_Primer_Contacto**: Tiempo mínimo en horas que debe transcurrir desde la fecha_resultado antes de enviar el primer WhatsApp de biometría (actualmente 4 horas).
- **Config_WA_Biometria**: Conjunto de parámetros persistidos en Script Properties que definen la ventana operativa de envío de WhatsApp de biometría.
- **Validador_Config**: Componente server-side que verifica que los valores configurados por el administrador no excedan los límites de la Ley 2300.
- **Script_Properties**: Mecanismo de persistencia de Google Apps Script (PropertiesService.getScriptProperties()) utilizado por el proyecto para almacenar configuraciones administrativas.

## Requirements

### Requirement 1: Interfaz de configuración de envío WA Biometría

**User Story:** Como administrador, quiero una sección en el panel admin para configurar los horarios y días de envío de WhatsApp de biometría, para poder ajustar la ventana operativa sin modificar código.

#### Acceptance Criteria

1. WHEN el administrador accede a la sección "Configuración de envío WA Biometría", THE Sistema_Admin SHALL mostrar un formulario con los siguientes campos editables: días habilitados para envío (checkboxes Lunes a Sábado), hora de inicio y hora de fin para días Lunes–Viernes (formato 24h, rango permitido 5:00–22:00 en incrementos de 30 minutos), hora de inicio y hora de fin para Sábado (formato 24h, rango permitido 5:00–22:00 en incrementos de 30 minutos), y ventana de horas mínima antes del primer contacto (valor entero entre 1 y 12 horas).
2. THE Sistema_Admin SHALL mostrar el campo Domingo como checkbox deshabilitado y desmarcado permanentemente, con indicación textual de que está bloqueado por la Ley 2300.
3. WHEN el administrador abre la sección de configuración, THE Sistema_Admin SHALL cargar y mostrar los valores actualmente persistidos en Script_Properties.
4. IF no existen valores persistidos en Script_Properties, THEN THE Sistema_Admin SHALL mostrar los valores por defecto: Lunes a Viernes habilitados con horario 7:00–19:00, Sábado habilitado con horario 8:00–15:00, y ventana de horas mínima de 4 horas.
5. WHEN el administrador presiona el botón de guardar configuración, THE Sistema_Admin SHALL persistir los valores del formulario en Script_Properties y mostrar una notificación de confirmación indicando que la configuración fue guardada exitosamente.
6. IF el administrador intenta guardar una configuración donde la hora de fin es menor o igual a la hora de inicio, o donde la diferencia entre hora de inicio y hora de fin es menor que la ventana de horas mínima configurada, THEN THE Sistema_Admin SHALL impedir el guardado y mostrar un mensaje de error indicando la regla de validación incumplida.
7. IF ocurre un error al persistir la configuración en Script_Properties, THEN THE Sistema_Admin SHALL mostrar una notificación de error indicando que no se pudo guardar la configuración y SHALL preservar los valores ingresados en el formulario sin pérdida de datos.

### Requirement 2: Validación server-side de configuración contra Ley 2300

**User Story:** Como administrador, quiero que el sistema impida guardar una configuración que viole la Ley 2300, para garantizar el cumplimiento normativo.

#### Acceptance Criteria

1. WHEN el administrador intenta guardar una hora de inicio para Lunes–Viernes menor a 7 o una hora de fin mayor a 19 (formato entero 24h, rango válido 0–23), THEN THE Validador_Config SHALL rechazar la operación y retornar un mensaje de error indicando el límite legal Lunes–Viernes 7:00–19:00.
2. WHEN el administrador intenta guardar una hora de inicio para Sábado menor a 8 o una hora de fin mayor a 15 (formato entero 24h, rango válido 0–23), THEN THE Validador_Config SHALL rechazar la operación y retornar un mensaje de error indicando el límite legal Sábado 8:00–15:00.
3. WHEN el administrador intenta habilitar el Domingo o un día festivo colombiano como día de envío, THEN THE Validador_Config SHALL rechazar la operación y retornar un mensaje de error indicando que la Ley 2300 prohíbe envíos en domingos y festivos.
4. WHEN el administrador envía una hora de inicio mayor o igual a la hora de fin para cualquier tipo de día, THEN THE Validador_Config SHALL rechazar la operación y retornar un mensaje de error indicando que la hora de inicio debe ser anterior a la hora de fin.
5. WHEN el administrador envía un valor de ventana de horas mínima que no sea un entero o sea menor a 1 o mayor a 12, THEN THE Validador_Config SHALL rechazar la operación y retornar un mensaje de error indicando que el valor debe ser un número entero entre 1 y 12.
6. THE Validador_Config SHALL ejecutar todas las validaciones en el servidor (Google Apps Script) de forma independiente de cualquier validación previa del cliente, de modo que una solicitud enviada directamente al servidor sin pasar por la interfaz sea igualmente validada.
7. WHEN el administrador envía una configuración que cumple todas las reglas de la Ley 2300 y las validaciones de formato, THEN THE Validador_Config SHALL aceptar la operación y confirmar el guardado exitoso.
8. IF la configuración enviada viola más de una regla simultáneamente, THEN THE Validador_Config SHALL rechazar la operación y retornar todos los mensajes de error correspondientes a cada violación detectada en una sola respuesta.

### Requirement 3: Persistencia de la configuración

**User Story:** Como administrador, quiero que la configuración se guarde de forma persistente, para que los cambios sobrevivan reinicios del script y se apliquen inmediatamente.

#### Acceptance Criteria

1. WHEN el Validador_Config aprueba la configuración enviada por el administrador, THE Sistema_Admin SHALL reemplazar completamente el valor existente en Script_Properties bajo la clave "CONFIG_WA_BIOMETRIA" con la representación JSON de la configuración aprobada.
2. WHEN la configuración se persiste exitosamente en Script_Properties, THE Sistema_Admin SHALL actualizar la configuración activa en memoria de modo que las solicitudes posteriores utilicen los nuevos valores sin requerir reinicio del script.
3. WHEN la configuración se guarda exitosamente, THE Sistema_Admin SHALL retornar una respuesta de éxito al cliente que incluya un indicador de resultado positivo y un mensaje confirmando la actualización.
4. IF ocurre un error al escribir en Script_Properties, THEN THE Sistema_Admin SHALL retornar un mensaje de error genérico al cliente sin exponer detalles internos, y registrar en el Logger el tipo de excepción y el contexto de la operación fallida.
5. IF la clave "CONFIG_WA_BIOMETRIA" no existe en Script_Properties al momento de lectura, THEN THE Sistema_Admin SHALL utilizar los valores por defecto definidos en el sistema sin generar error.

### Requirement 4: Lectura dinámica de la configuración en el Motor de WA

**User Story:** Como sistema, quiero que la lógica de envío lea los parámetros de configuración dinámicamente, para que los cambios del admin se apliquen sin necesidad de redeploy.

#### Acceptance Criteria

1. WHEN la función _dentroDeVentanaLey2300() se ejecuta, THE Motor_WA_Biometria SHALL leer los parámetros de días habilitados, hora de inicio y hora de fin desde Script_Properties bajo la clave "CONFIG_WA_BIOMETRIA" en lugar de usar valores hardcodeados.
2. WHEN la función _enviarPrimerContactoBiometria() evalúa la ventana de horas mínima, THE Motor_WA_Biometria SHALL leer el valor de ventana de horas (número entero entre 1 y 48) desde Script_Properties bajo la clave "CONFIG_WA_BIOMETRIA" en lugar de usar la constante VENTANA_HORAS_WA_BIOMETRIA.
3. IF no existe configuración guardada en Script_Properties bajo la clave "CONFIG_WA_BIOMETRIA", THEN THE Motor_WA_Biometria SHALL usar los valores por defecto: Lunes a Viernes 7:00–19:00, Sábado 8:00–15:00, Domingo deshabilitado, y ventana de 4 horas.
4. IF el valor almacenado en la clave "CONFIG_WA_BIOMETRIA" no es un JSON válido o no contiene las propiedades esperadas (días, horaInicio, horaFin, ventanaHoras), THEN THE Motor_WA_Biometria SHALL aplicar los valores por defecto definidos en el criterio 3 y registrar el error en el log del script.
5. WHEN la función _dentroDeVentanaLey2300() o _enviarPrimerContactoBiometria() lee la configuración, THE Motor_WA_Biometria SHALL obtener el valor actual de Script_Properties en cada ejecución sin almacenar en caché entre invocaciones, de modo que los cambios del admin se reflejen en la siguiente ejecución.

### Requirement 5: Backward compatibility y valores por defecto

**User Story:** Como sistema, quiero mantener el comportamiento actual como fallback cuando no hay configuración guardada, para que el cambio sea retrocompatible y no rompa nada si las properties se borran.

#### Acceptance Criteria

1. IF Script_Properties no contiene la clave "CONFIG_WA_BIOMETRIA" o su valor es nulo, THEN THE Motor_WA_Biometria SHALL aplicar los valores por defecto definidos como constantes en código: Lunes a Viernes 7:00–19:00, Sábado 8:00–15:00, Domingo bloqueado, ventana mínima de 4 horas.
2. IF la lectura de Script_Properties lanza una excepción, retorna nulo, o retorna un valor que no es JSON válido, THEN THE Motor_WA_Biometria SHALL aplicar los valores por defecto del criterio 1 y registrar una entrada de nivel WARNING en el Logger indicando el tipo de fallo ocurrido (excepción, nulo, o JSON inválido).
3. IF el valor de la clave "CONFIG_WA_BIOMETRIA" es JSON válido pero no contiene las claves requeridas para la configuración de horarios o contiene valores de tipo incorrecto, THEN THE Motor_WA_Biometria SHALL aplicar los valores por defecto del criterio 1 y registrar una entrada de nivel WARNING en el Logger indicando que la estructura del JSON no cumple el esquema esperado.
4. THE Motor_WA_Biometria SHALL conservar la consulta a la hoja "Festivos" para determinar si el día es festivo, independientemente de si la configuración proviene de Script_Properties o de los valores por defecto.

### Requirement 6: Control de acceso a la configuración

**User Story:** Como sistema, quiero que solo los usuarios administradores puedan acceder y modificar la configuración de envío WA Biometría, para proteger la integridad de los parámetros operativos.

#### Acceptance Criteria

1. IF un usuario sin rol "ADMIN" intenta leer o guardar la configuración de envío WA Biometría, THEN THE Sistema_Admin SHALL rechazar la solicitud con un mensaje de error indicando acceso denegado y sin incluir valores de configuración en la respuesta.
2. THE Sistema_Admin SHALL verificar el permiso de administrador mediante la función verificarPermisoAdmin() existente antes de ejecutar las operaciones de lectura y escritura de la configuración.
3. WHEN un usuario con rol "ADMIN" solicita leer o guardar la configuración de envío WA Biometría, THE Sistema_Admin SHALL ejecutar la operación solicitada y retornar el resultado correspondiente.
4. IF la función verificarPermisoAdmin() genera un error o no puede determinar la identidad del usuario, THEN THE Sistema_Admin SHALL denegar el acceso a la configuración y retornar un mensaje de error indicando que no se pudo verificar el permiso.

### Requirement 7: Feedback al usuario en el panel admin

**User Story:** Como administrador, quiero recibir feedback claro al guardar la configuración, para saber si la operación fue exitosa o qué corregir.

#### Acceptance Criteria

1. WHEN la configuración se guarda exitosamente, THE Sistema_Admin SHALL mostrar una notificación de éxito al administrador mediante SweetAlert2 con un mensaje indicando que la configuración fue guardada correctamente, y la notificación se auto-cerrará después de 3 segundos.
2. WHEN la validación server-side rechaza la configuración, THE Sistema_Admin SHALL mostrar una notificación de error al administrador mediante SweetAlert2 con el mensaje descriptivo del error retornado por el servidor.
3. WHILE la operación de guardado está en curso, THE Sistema_Admin SHALL mostrar un indicador de carga (spinner) y deshabilitar el botón de guardar para prevenir envíos duplicados, con un tiempo máximo de espera de 30 segundos antes de considerar la operación como fallida.
4. WHEN la operación de guardado finaliza (éxito o error), THE Sistema_Admin SHALL ocultar el indicador de carga y rehabilitar el botón de guardar para permitir una nueva operación.
5. IF la operación de guardado falla por error de red o por exceder el tiempo máximo de espera, THEN THE Sistema_Admin SHALL mostrar una notificación de error mediante SweetAlert2 con un mensaje indicando fallo de comunicación con el servidor, ocultar el indicador de carga y rehabilitar el botón de guardar.
