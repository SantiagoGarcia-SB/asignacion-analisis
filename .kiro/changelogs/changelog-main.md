# Changelog — main

## [No publicado]

### Agregado
- Se agregó campo "Fecha y Hora Radicación SAI" en la pestaña Gestión del modal de index.html (Solicitudes) con input datetime-local y botón "Ahora"
- Se agregó campo "Fecha y Hora Radicación SAI" en la sección Datos de Gestión del modal de VistaBiometria.html con input datetime-local y botón "Ahora"
- Se incluyó el nuevo campo en el envío de datos al backend en main.js.html (fecha_radicacion_sai) y VistaBiometria.html (fechaRadicacionSai)
- Se actualizó guardarCambiosInternos en Código.js para persistir fecha_radicacion_sai en columna AL (38) de la hoja "solicitud" del warehouse, y se amplió el appendRow a Historico_Gestiones a 38 columnas para que la columna "fechaDiligenciadaRadicación" (AL) quede incluida
- Se actualizó guardarGestionBiometria en Biometria.js para escribir fechaRadicacionSai tanto en la hoja de gestión biometría (col 17) como en la columna AL (38) de la hoja "solicitud" del warehouse (ID: 1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0), asegurando que al copiar al Historico_Gestiones el dato esté presente
