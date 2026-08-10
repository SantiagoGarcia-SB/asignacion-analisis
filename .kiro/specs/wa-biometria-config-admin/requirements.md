# Requirements Document

## Introduction

Externalizar la parametrización de horarios y días de envío de WhatsApp de biometría al panel de administración existente. Actualmente los horarios permitidos para envío de mensajes WhatsApp están hardcodeados en la función `_dentroDeVentanaLey2300()` del archivo `Biometria.js`, así como la constante `VENTANA_HORAS_WA_BIOMETRIA = 4`. El objetivo es que un usuario administrador pueda modificar estos valores desde la vista admin sin intervención en código, con total libertad para configurar cualquier día y hora. Si la configuración cae fuera de los límites de referencia de la Ley 2300 de 2023, el sistema muestra una advertencia consultiva que requiere confirmación explícita del administrador antes de guardar, pero nunca bloquea el guardado.

## Glossary

- **Sistema_Admin**: Panel de administración existente (VistaAdmin.html) servido por Google Apps Script que gestiona configuraciones operativas del proyecto asignacion-analisis.
- **Motor_WA_Biometria**: Lógica del servidor (Biometria.js) que evalúa si es momento permitido para enviar mensajes WhatsApp de primer contacto a solicitantes con biometría pendiente.
- **Ventana_Ley_2300**: Franja horaria de referencia definida por la Ley 2300 de 2023 para comunicaciones de cobranza: Lunes a Viernes 7:00–19:00, Sábados 8:00–15:00, Domingos y festivos prohibido. Utilizada como criterio de advertencia consultiva, no como límite restrictivo.
- **Ventana_Horas_Primer_Contacto**: Tiempo mínimo en horas que debe transcurrir desde la fecha_resultado antes de enviar el primer WhatsApp de biometría (actualmente 4 horas).
- **Config_WA_Biometria**: Conjunto de parámetros persistidos en Script Properties que definen la ventana operativa de envío de WhatsApp de biometría.
- **Diálogo_Confirmación_Ley2300**: Diálogo modal de SweetAlert2 tipo warning que se muestra al administrador cuando la configuración ingresada cae fuera de los límites de referencia de la Ley 2300, requiriendo confirmación explícita para proceder con el guardado.
- **Script_Properties**: Mecanismo de persistencia de Google Apps Script (PropertiesService.getScriptProperties()) utilizado por el proyecto para almacenar configuraciones administrativas.

## Requirements

### Requirement 1: Interfaz de configuración de envío WA Biometría

**User Story:** Como administrador, quiero una sección en el panel admin para configurar los horarios y días de envío de WhatsApp de biometría, para poder ajustar la ventana operativa sin modificar código y con total libertad de configuración.

#### Acceptance Criteria

1. WHEN el administrador accede a la sección "Configuración de envío WA Biometría", THE Sistema_Admin SHALL mostrar un formulario con los siguientes campos editables: días habilitados para envío (checkboxes Lunes a Domingo, todos seleccionables), hora de inicio y hora de fin para días Lunes–Viernes (formato 24h, rango 0:00–23:30 en incrementos de 30 minutos), hora de inicio y hora de fin para Sábado (formato 24h, rango 0:00–23:30 en incrementos de 30 minutos), hora de inicio y hora de fin para Domingo (formato 24h, rango 0:00–23:30 en incrementos de 30 minutos), y ventana de horas mínima antes del primer contacto (valor entero entre 1 y 48 horas).
2. THE Sistema_Admin SHALL mostrar una nota informativa visible junto al formulario indicando los límites de referencia de la Ley 2300: Lunes a Viernes 7:00–19:00, Sábados 8:00–15:00, Domingos y festivos no recomendado.
3. WHEN el administrador abre la sección de configuración, THE Sistema_Admin SHALL cargar y mostrar los valores actualmente persistidos en Script_Properties.
4. IF no existen valores persistidos en Script_Properties, THEN THE Sistema_Admin SHALL mostrar los valores por defecto: Lunes a Viernes habilitados con horario 7:00–19:00, Sábado habilitado con horario 8:00–15:00, Domingo deshabilitado con horario 8:00–12:00, y ventana de horas mínima de 4 horas.
5. WHEN el administrador presiona el botón de guardar configuración y la configuración está dentro de los límites de referencia Ley 2300, THE Sistema_Admin SHALL persistir los valores del formulario en Script_Properties y mostrar una notificación de confirmación indicando que la configuración fue guardada exitosamente.
6. IF el administrador intenta guardar una configuración donde la hora de fin es menor o igual a la hora de inicio para un día habilitado, THEN THE Sistema_Admin SHALL impedir el guardado y mostrar un mensaje de error indicando que la hora de fin debe ser posterior a la hora de inicio.
7. IF ocurre un error al persistir la configuración en Script_Properties, THEN THE Sistema_Admin SHALL mostrar una notificación de error indicando que no se pudo guardar la configuración y SHALL preservar los valores ingresados en el formulario sin pérdida de datos.

### Requirement 2: Advertencia consultiva por configuración fuera de Ley 2300

**User Story:** Como administrador, quiero recibir una advertencia cuando mi configuración exceda los límites de referencia de la Ley 2300, para tomar una decisión informada y confirmar con el equipo de mercadeo antes de proceder.

#### Acceptance Criteria

1. WHEN el administrador presiona guardar y la hora de inicio para Lunes–Viernes es menor a 7:00 o la hora de fin es mayor a 19:00, THE Sistema_Admin SHALL mostrar el Diálogo_Confirmación_Ley2300 indicando que el horario configurado para Lunes–Viernes excede el rango de referencia 7:00–19:00 de la Ley 2300 y que debe confirmar con el equipo de mercadeo antes de proceder.
2. WHEN el administrador presiona guardar y la hora de inicio para Sábado es menor a 8:00 o la hora de fin es mayor a 15:00, THE Sistema_Admin SHALL mostrar el Diálogo_Confirmación_Ley2300 indicando que el horario configurado para Sábado excede el rango de referencia 8:00–15:00 de la Ley 2300 y que debe confirmar con el equipo de mercadeo antes de proceder.
3. WHEN el administrador presiona guardar y el Domingo está habilitado como día de envío, THE Sistema_Admin SHALL mostrar el Diálogo_Confirmación_Ley2300 indicando que la Ley 2300 no recomienda envíos en domingos y festivos, y que debe confirmar con el equipo de mercadeo antes de proceder.
4. WHEN el Diálogo_Confirmación_Ley2300 se muestra por múltiples violaciones simultáneas, THE Sistema_Admin SHALL consolidar todas las desviaciones detectadas en un solo diálogo con una lista de los ítems fuera de la referencia Ley 2300.
5. WHEN el administrador confirma el Diálogo_Confirmación_Ley2300 presionando el botón de aceptar, THE Sistema_Admin SHALL proceder con el guardado de la configuración tal como fue ingresada sin modificar ningún valor.
6. WHEN el administrador cancela el Diálogo_Confirmación_Ley2300 presionando el botón de cancelar, THE Sistema_Admin SHALL abortar la operación de guardado y preservar los valores en el formulario sin cambios ni pérdida de datos.
7. THE Sistema_Admin SHALL ejecutar la evaluación de desviaciones contra Ley 2300 en el cliente (JavaScript del navegador) antes de enviar la solicitud al servidor, de modo que el diálogo se muestre de forma inmediata sin latencia de red.
8. WHEN la configuración ingresada cumple todos los límites de referencia Ley 2300 (L-V 7:00–19:00, Sáb 8:00–15:00, Domingo deshabilitado), THE Sistema_Admin SHALL proceder directamente al guardado sin mostrar ningún diálogo de confirmación.

### Requirement 3: Persistencia de la configuración

**User Story:** Como administrador, quiero que la configuración se guarde de forma persistente, para que los cambios sobrevivan reinicios del script y se apliquen inmediatamente.

#### Acceptance Criteria

1. WHEN el administrador confirma el guardado (directamente o tras aceptar el Diálogo_Confirmación_Ley2300), THE Sistema_Admin SHALL reemplazar completamente el valor existente en Script_Properties bajo la clave "CONFIG_WA_BIOMETRIA" con la representación JSON de la configuración enviada.
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
6. WHEN el Domingo está habilitado en la configuración y el día actual es domingo, THE Motor_WA_Biometria SHALL permitir el envío de WhatsApp dentro del horario configurado para Domingo, sin aplicar bloqueo por día de la semana.
7. WHEN un día festivo colombiano coincide con un día habilitado en la configuración, THE Motor_WA_Biometria SHALL respetar la configuración del administrador y permitir el envío si el horario actual está dentro de la franja configurada para ese tipo de día.

### Requirement 5: Backward compatibility y valores por defecto

**User Story:** Como sistema, quiero mantener el comportamiento actual como fallback cuando no hay configuración guardada, para que el cambio sea retrocompatible y no rompa nada si las properties se borran.

#### Acceptance Criteria

1. IF Script_Properties no contiene la clave "CONFIG_WA_BIOMETRIA" o su valor es nulo, THEN THE Motor_WA_Biometria SHALL aplicar los valores por defecto definidos como constantes en código: Lunes a Viernes 7:00–19:00, Sábado 8:00–15:00, Domingo deshabilitado, ventana mínima de 4 horas.
2. IF la lectura de Script_Properties lanza una excepción, retorna nulo, o retorna un valor que no es JSON válido, THEN THE Motor_WA_Biometria SHALL aplicar los valores por defecto del criterio 1 y registrar una entrada de nivel WARNING en el Logger indicando el tipo de fallo ocurrido (excepción, nulo, o JSON inválido).
3. IF el valor de la clave "CONFIG_WA_BIOMETRIA" es JSON válido pero no contiene las claves requeridas para la configuración de horarios o contiene valores de tipo incorrecto, THEN THE Motor_WA_Biometria SHALL aplicar los valores por defecto del criterio 1 y registrar una entrada de nivel WARNING en el Logger indicando que la estructura del JSON no cumple el esquema esperado.
4. THE Motor_WA_Biometria SHALL conservar la consulta a la hoja "Festivos" para informar al log cuando se envía en un día festivo, independientemente de si la configuración proviene de Script_Properties o de los valores por defecto.

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

1. WHEN la configuración se guarda exitosamente (tras confirmación directa o tras aceptar el Diálogo_Confirmación_Ley2300), THE Sistema_Admin SHALL mostrar una notificación de éxito al administrador mediante SweetAlert2 con un mensaje indicando que la configuración fue guardada correctamente, y la notificación se auto-cerrará después de 3 segundos.
2. WHEN la validación de formato rechaza la configuración (hora fin menor o igual a hora inicio), THE Sistema_Admin SHALL mostrar una notificación de error al administrador mediante SweetAlert2 con el mensaje descriptivo del error detectado.
3. WHILE la operación de guardado está en curso (tras la confirmación del administrador), THE Sistema_Admin SHALL mostrar un indicador de carga (spinner) y deshabilitar el botón de guardar para prevenir envíos duplicados, con un tiempo máximo de espera de 30 segundos antes de considerar la operación como fallida.
4. WHEN la operación de guardado finaliza (éxito o error), THE Sistema_Admin SHALL ocultar el indicador de carga y rehabilitar el botón de guardar para permitir una nueva operación.
5. IF la operación de guardado falla por error de red o por exceder el tiempo máximo de espera, THEN THE Sistema_Admin SHALL mostrar una notificación de error mediante SweetAlert2 con un mensaje indicando fallo de comunicación con el servidor, ocultar el indicador de carga y rehabilitar el botón de guardar.
