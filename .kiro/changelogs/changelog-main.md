# Changelog — main

## [No publicado]

### Agregado
- Se agregó nueva columna "Tiempo general (radicación)" en `HEADER_SOLICITUDES` (col 37) que almacena horas hábiles desde la radicación hasta el resultado
- Se agregó cálculo de tiempo general (radicación → resultado) en `guardarCambiosInternos()` usando `calcularMinutosHabilesSLA()`
- Se agregaron columnas "Prom. Gestión" y "Prom. General" al panel de Seguimiento de Analistas con promedios por analista
- Se agregó columna "T. General" en el modal de detalle del analista (solicitudes gestionadas) mostrando horas hábiles desde radicación
- Se creó función `formatearTiempoGeneral()` para formatear horas hábiles en formato legible (Xh Ymin)
- Se agregó tarjeta KPI "Tiempo General" en la sección Métricas mostrando promedio de horas hábiles radicación → cierre
- Se agregó columna "T. General" a la tabla Rendimiento Individual en Métricas
- Se agregaron data labels (etiquetas de datos) a todos los gráficos: producción diaria, distribución por estado, productividad por analista, cumplimiento SLA
- Se incluyó plugin `chartjs-plugin-datalabels@2` para soporte de etiquetas en gráficos Chart.js
- Se creó función `desasignarSolicitudReestudios()` en `Admin.js` para devolver solicitudes de reestudios/UAR a la cola (limpia cols G, H, I de hoja ORIGEN)
- Se creó función frontend `confirmarDesasignacionReestudios()` con confirmación visual diferenciada para reestudios
- Se diferencia automáticamente en la tabla de monitoreo: solicitudes tipo reestudio/UAR usan `desasignarSolicitudReestudios`, el resto usa `desasignarSolicitud`
- Se agregó campo "Número de Póliza" en la pestaña Gestión de `VistaReestudios.html`, visible solo cuando el origen es VICTORIA
- Se agregó validación obligatoria: no se puede guardar gestión de solicitud VICTORIA sin diligenciar la póliza
- Se modificó `guardarGestionReestudio()` en `Reestudios.js` para guardar la póliza en la columna Q (17) de la hoja ORIGEN
- Se agregó campo "Fecha y hora de radicación (SAI)" en la pestaña Gestión del modal de solicitudes (`index.html`) con input `datetime-local`
- Se agregó validación obligatoria: no se puede guardar gestión sin diligenciar la fecha de radicación SAI
- Se agregó precarga automática del campo si la solicitud ya tiene fecha de radicación registrada
- Se modificó `guardarCambiosInternos()` para recibir `fecha_radicacion_sai` y actualizar la col 18 (fechaRadicación) con la fecha proporcionada por el analista

### Cambiado
- Se cambió la fuente de datos de `obtenerDatosMetricas()` de la hoja "solicitud" a "Historico_Gestiones" del mismo spreadsheet
- Se modificó el panel "Seguimiento de Analistas" en `VistaAdmin.html` para permitir filtrar por fecha con un input tipo date (predeterminado: hoy)
- Se modificó `admin_obtenerAsesoresActivosPrimerResultado()` en `Admin.js` para aceptar fecha opcional
- Se implementó lógica diferenciada: si es hoy muestra "Pendientes" (sin resultado actual), si es fecha pasada muestra "Asignadas" ese día
- Se modificó `admin_obtenerDetallePorAnalista()` en `Admin.js` para exponer `tiempoSLA` y `tiempoGeneral` en solicitudes gestionadas (ambas hojas), y filtrar por fecha
- Se modificó `obtenerDatosMetricas()`: calcula Tiempo General al vuelo como diferencia entre fechaRadicación (col 17) y fecha fin gestión (col 28)
- Se creó función `parseFechaCompleta_()` para parsear strings "dd/MM/yyyy HH:mm:ss" a Date completo
- Se actualizó la lectura de reestudios en métricas para incluir tiempos O (resolución total) y P (gestión)
- Se eliminaron columnas "Prom. Gestión" y "Prom. General" del panel Seguimiento de Analistas (se mantienen solo en Rendimiento Individual)
- Se agregó recarga automática de la tabla al cambiar la fecha seleccionada (evento `onchange`)

### Cambiado
- Se ajustó la vista de gestión (`index.html` + `main.js.html`) para solicitudes de tipo Inducción: se oculta el campo Biometría, se limita "Estado Final de Gestión" a solo "APLAZADA", y "Motivo Aplazamiento" a solo "Pendiente resultado lote"
- Se agregó ID `contenedor_biometria` al div del campo Biometría para control dinámico de visibilidad
- Se modificó la validación de guardado para no exigir Biometría en solicitudes de tipo Inducción

### Agregado
- Se integró la hoja de Reestudios/UAR (`ID_HOJA_REESTUDIOS`) como fuente de datos consolidada en el dashboard Admin
- Se creó función `obtenerGestionesHoyCruzadas()` en `Código.js` que consolida gestiones del día del analista desde todas las fuentes
- Se agregó conteo cruzado en todas las vistas de analista (index, VistaBiometria, VistaReestudios) — "Gestionadas Hoy" refleja actividad total del día sin importar la vista
- Se incluyeron gestiones de reestudios en las métricas, panel primer resultado, y carga por analista del Admin
- Se agregó desglose por tipo (Digital, Biometría, Inducción, UAR, Reestudios) como mini-chips en las tarjetas (Sin Asignar, En Gestión, Gestionadas Hoy) con colores diferenciados
- Se agregó modal drill-down con encabezado de desglose visual + listado detallado al hacer clic en cada tarjeta
- Se reemplazó la tarjeta "Aplazadas" por "En Gestión (Asignadas)" — solicitudes asignadas sin resultado final
- Se detecta columna UAR (col V = "Si") para clasificar solicitudes UAR en el desglose
- Se clasifican registros de hoja ORIGEN como "reestudios" o "uar" según tipoDeProceso/claseDeSolicitud

### Cambiado
- Se modificó `obtenerDatosDashboard()` en `Admin.js` para incluir objeto `reestudios` con KPIs de la hoja ORIGEN
- Se modificó `obtenerDatosMetricas()` en `Admin.js` para incluir gestiones de reestudios en los cálculos de producción y rendimiento
- Se modificó `admin_obtenerUsuariosGestion()` para sumar carga de reestudios al total de cada analista
- Se modificó `admin_obtenerAsesoresActivosPrimerResultado()` para considerar resultados de reestudios
- Se modificó `cargarDatos()` en `main.js.html` para usar `obtenerGestionesHoyCruzadas()` en el contador "Hoy"
- Se modificó la carga de datos en `VistaBiometria.html` para usar conteo cruzado
- Se modificó la carga de datos en `VistaReestudios.html` para usar conteo cruzado

### Agregado (previo)
- Se agregó panel "Asesores Activos — Primer Resultado Hoy" en la sección Métricas del Admin, mostrando la hora del primer resultado de cada asesor activo para identificar si ya empezaron a trabajar
- Se agregó columna "Último Resultado" al panel de asesores activos, mostrando la hora del último resultado y el tiempo transcurrido con código de colores (verde <30min, amarillo >30min, rojo >1h)
- Se creó función backend `admin_obtenerAsesoresActivosPrimerResultado()` en `Admin.js` que consulta la hora del primer y último resultado del día por asesor activo

### Cambiado
- Se ordenaron alfabéticamente las opciones del select "Motivo Aplazamiento" en la vista de Reestudios (`VistaReestudios.html`)

### Corregido
- Se corrigió typo "Desestimiento" → "Desistimiento" en `index.html` y `VistaReestudios.html`
