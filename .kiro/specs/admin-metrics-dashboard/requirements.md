# Requirements Document

## Introduction

Este documento define los requisitos para la nueva sección "Métricas" del panel de administración (VistaAdmin). El objetivo es proporcionar al coordinador una vista consolidada del rendimiento del equipo de análisis, tiempos de respuesta, cumplimiento de SLA y tendencias históricas de producción. La sección se integra al sidebar existente (Dashboard, Usuarios) como una tercera opción de navegación y utiliza Chart.js para la visualización gráfica.

La implementación incorpora optimizaciones de rendimiento desde el diseño inicial para mitigar la latencia inherente de las operaciones sobre Google Sheets con volúmenes crecientes de datos (hoja Historico_Gestiones con crecimiento diario continuo).

## Glossary

- **Panel_Admin**: La aplicación web VistaAdmin.html que sirve como interfaz de administración para el coordinador.
- **Módulo_Métricas**: La nueva sección dentro del Panel_Admin que presenta indicadores de rendimiento, gráficos de productividad y cumplimiento de SLA.
- **Coordinador**: Usuario con rol ADMIN que accede al Panel_Admin para supervisar al equipo de análisis.
- **Analista**: Usuario con rol ASESOR que gestiona solicitudes de análisis de pólizas.
- **Solicitud**: Registro individual de una petición de análisis de póliza de seguros almacenada en la hoja "Historico_Gestiones".
- **Tiempo_Gestión**: Minutos transcurridos desde la asignación de una solicitud a un analista hasta su finalización (columna AI, índice 34).
- **SLA_Horas**: Horas hábiles calculadas desde la asignación hasta la finalización excluyendo fines de semana y festivos (columna AD, índice 29).
- **Estado_Final**: Resultado de la gestión de una solicitud: APROBADA, NEGADA o APLAZADA (columna Q, índice 16).
- **Fecha_Gestión**: Fecha en que el analista completó la gestión de una solicitud en formato dd/MM/yyyy (columna AH, índice 33).
- **Fecha_Fin_Gestión**: Marca de tiempo completa de finalización de la gestión (columna AC, índice 28).
- **Backend_Métricas**: Función o funciones del servidor Google Apps Script que recopilan y procesan los datos para el Módulo_Métricas.
- **CacheService**: Servicio de caché de Google Apps Script que almacena pares clave-valor temporalmente (máximo 6 horas) para evitar lecturas repetidas a Google Sheets.
- **Instancia_Spreadsheet**: Objeto retornado por `SpreadsheetApp.openById()` que se reutiliza para evitar múltiples aperturas del mismo libro.

## Requirements

### Requisito 1: Navegación al Módulo de Métricas

**Historia de usuario:** Como coordinador, quiero acceder a la sección de métricas desde el menú lateral del panel de administración, para consultar el rendimiento del equipo sin abandonar la interfaz habitual.

#### Criterios de Aceptación

1. THE Panel_Admin SHALL mostrar un enlace "Métricas" con icono `bi-bar-chart-line-fill` en el sidebar debajo del enlace "Usuarios".
2. WHEN el Coordinador hace clic en el enlace "Métricas", THE Panel_Admin SHALL mostrar la sección del Módulo_Métricas y ocultar las demás secciones (Dashboard, Usuarios).
3. WHEN el Coordinador navega al Módulo_Métricas, THE Panel_Admin SHALL resaltar el enlace "Métricas" como activo y desactivar los demás enlaces del sidebar.
4. THE Panel_Admin SHALL mantener la misma estructura visual (estilos, colores, tipografía) del sidebar existente para el nuevo enlace de Métricas.

---

### Requisito 2: Filtro de Rango de Fechas

**Historia de usuario:** Como coordinador, quiero filtrar las métricas por rango de fechas, para analizar períodos específicos de actividad del equipo.

#### Criterios de Aceptación

1. THE Módulo_Métricas SHALL presentar un selector de rango de fechas con campos "Desde" y "Hasta" en la parte superior de la sección.
2. WHEN el Coordinador carga el Módulo_Métricas por primera vez, THE Módulo_Métricas SHALL establecer el rango predeterminado a los últimos 7 días.
3. WHEN el Coordinador modifica el rango de fechas y presiona "Aplicar", THE Módulo_Métricas SHALL actualizar todos los gráficos y tablas con los datos correspondientes al nuevo rango.
4. IF el Coordinador selecciona una fecha "Desde" posterior a la fecha "Hasta", THEN THE Módulo_Métricas SHALL mostrar un mensaje de error indicando que el rango es inválido y conservar los datos del filtro anterior.
5. THE Módulo_Métricas SHALL incluir botones de acceso rápido para los rangos: "Hoy", "Última semana", "Último mes".

---

### Requisito 3: Tarjetas de Resumen de Métricas

**Historia de usuario:** Como coordinador, quiero ver indicadores clave resumidos al inicio de la sección de métricas, para obtener una visión rápida del rendimiento general del equipo.

#### Criterios de Aceptación

1. THE Módulo_Métricas SHALL mostrar una fila de tarjetas resumen con los siguientes indicadores: total de solicitudes gestionadas, tiempo promedio de gestión en minutos, tasa de aprobación en porcentaje y cantidad de solicitudes que excedieron el SLA.
2. WHEN los datos se cargan correctamente, THE Módulo_Métricas SHALL calcular el total de solicitudes gestionadas contando registros con Fecha_Fin_Gestión dentro del rango de fechas seleccionado.
3. WHEN los datos se cargan correctamente, THE Módulo_Métricas SHALL calcular el tiempo promedio de gestión como el promedio aritmético de los valores de Tiempo_Gestión de las solicitudes filtradas.
4. WHEN los datos se cargan correctamente, THE Módulo_Métricas SHALL calcular la tasa de aprobación como el porcentaje de solicitudes con Estado_Final "APROBADA" sobre el total de solicitudes gestionadas.
5. WHEN los datos se cargan correctamente, THE Módulo_Métricas SHALL calcular las solicitudes que excedieron el SLA contando aquellas con SLA_Horas mayor a 4 horas.

---

### Requisito 4: Gráfico de Producción Diaria del Equipo

**Historia de usuario:** Como coordinador, quiero ver un gráfico de líneas con la producción diaria del equipo, para identificar tendencias y picos de actividad.

#### Criterios de Aceptación

1. THE Módulo_Métricas SHALL mostrar un gráfico de líneas (Chart.js) con el eje X representando cada día del rango seleccionado y el eje Y representando la cantidad de solicitudes gestionadas.
2. WHEN el rango de fechas contiene datos, THE Módulo_Métricas SHALL agrupar las solicitudes por Fecha_Gestión y graficar una línea con la cantidad por día.
3. WHEN el Coordinador pasa el cursor sobre un punto del gráfico, THE Módulo_Métricas SHALL mostrar un tooltip con la fecha y la cantidad exacta de solicitudes gestionadas ese día.
4. IF el rango de fechas seleccionado no contiene solicitudes gestionadas, THEN THE Módulo_Métricas SHALL mostrar el gráfico vacío con un mensaje "Sin datos para el período seleccionado".

---

### Requisito 5: Gráfico de Distribución por Estado

**Historia de usuario:** Como coordinador, quiero visualizar la proporción de solicitudes aprobadas, negadas y aplazadas, para entender la composición de resultados del equipo.

#### Criterios de Aceptación

1. THE Módulo_Métricas SHALL mostrar un gráfico de dona (Chart.js) con los segmentos: APROBADA (verde), NEGADA (rojo) y APLAZADA (amarillo).
2. WHEN los datos se cargan correctamente, THE Módulo_Métricas SHALL calcular el conteo de solicitudes por cada Estado_Final dentro del rango de fechas seleccionado.
3. WHEN el Coordinador pasa el cursor sobre un segmento del gráfico, THE Módulo_Métricas SHALL mostrar un tooltip con el nombre del estado, la cantidad y el porcentaje del total.
4. THE Módulo_Métricas SHALL mostrar la leyenda del gráfico debajo de la dona con los colores y etiquetas correspondientes.

---

### Requisito 6: Gráfico de Productividad por Analista

**Historia de usuario:** Como coordinador, quiero comparar la productividad de cada analista en un gráfico de barras, para identificar quién gestiona más solicitudes y balancear la carga de trabajo.

#### Criterios de Aceptación

1. THE Módulo_Métricas SHALL mostrar un gráfico de barras horizontales (Chart.js) con una barra por cada analista que tenga al menos una solicitud gestionada en el rango seleccionado.
2. WHEN los datos se cargan, THE Módulo_Métricas SHALL agrupar las solicitudes por el campo Nombre (columna AE, índice 30) y contar el total gestionado por cada analista.
3. THE Módulo_Métricas SHALL ordenar las barras de mayor a menor cantidad de solicitudes gestionadas.
4. WHEN el Coordinador pasa el cursor sobre una barra, THE Módulo_Métricas SHALL mostrar un tooltip con el nombre del analista y la cantidad exacta de solicitudes.

---

### Requisito 7: Tabla de Rendimiento Individual por Analista

**Historia de usuario:** Como coordinador, quiero ver una tabla detallada con métricas individuales de cada analista, para evaluar el desempeño granular y tomar decisiones de gestión.

#### Criterios de Aceptación

1. THE Módulo_Métricas SHALL mostrar una tabla con las columnas: Nombre del analista, Total gestionadas, Aprobadas, Negadas, Aplazadas, Tiempo promedio (minutos) y Solicitudes fuera de SLA.
2. WHEN los datos se cargan, THE Módulo_Métricas SHALL calcular las métricas de cada analista agrupando solicitudes por el campo Nombre dentro del rango de fechas seleccionado.
3. THE Módulo_Métricas SHALL aplicar el plugin DataTables a la tabla con funcionalidad de ordenación por columnas y búsqueda por texto.
4. WHEN una celda de "Solicitudes fuera de SLA" contiene un valor mayor a 0, THE Módulo_Métricas SHALL resaltar esa celda con un fondo rojo claro para alertar al coordinador.
5. THE Módulo_Métricas SHALL calcular el tiempo promedio por analista como el promedio aritmético de Tiempo_Gestión de las solicitudes de ese analista dentro del rango.

---

### Requisito 8: Gráfico de Cumplimiento de SLA

**Historia de usuario:** Como coordinador, quiero ver un gráfico que muestre el porcentaje de cumplimiento de SLA a lo largo del tiempo, para detectar degradaciones en el servicio.

#### Criterios de Aceptación

1. THE Módulo_Métricas SHALL mostrar un gráfico de barras agrupadas (Chart.js) con el eje X representando cada día del rango seleccionado y dos barras por día: solicitudes dentro de SLA (verde) y solicitudes fuera de SLA (rojo).
2. WHEN los datos se cargan, THE Módulo_Métricas SHALL clasificar cada solicitud como "dentro de SLA" si SLA_Horas es menor o igual a 4 horas y "fuera de SLA" si SLA_Horas es mayor a 4 horas.
3. WHEN el Coordinador pasa el cursor sobre una barra, THE Módulo_Métricas SHALL mostrar un tooltip con la fecha, la categoría (dentro/fuera de SLA) y la cantidad de solicitudes.
4. THE Módulo_Métricas SHALL mostrar una línea de referencia horizontal indicando el objetivo de cumplimiento de SLA al 90%.

---

### Requisito 9: Backend de Datos para Métricas

**Historia de usuario:** Como coordinador, quiero que los datos de métricas se carguen de forma eficiente desde el servidor, para que la sección responda de manera ágil.

#### Criterios de Aceptación

1. THE Backend_Métricas SHALL exponer una función `obtenerDatosMetricas(fechaDesde, fechaHasta)` accesible desde el cliente mediante `google.script.run`.
2. WHEN el Backend_Métricas recibe una solicitud, THE Backend_Métricas SHALL verificar que el usuario tiene permisos de administrador reutilizando la Instancia_Spreadsheet obtenida durante la verificación para las lecturas de datos posteriores.
3. WHEN el Backend_Métricas procesa los datos, THE Backend_Métricas SHALL filtrar solicitudes cuya Fecha_Gestión se encuentre dentro del rango proporcionado (comparación en formato dd/MM/yyyy).
4. THE Backend_Métricas SHALL retornar un objeto con las siguientes propiedades: `totalGestionadas`, `tiempoPromedioMinutos`, `tasaAprobacion`, `fueraDeSLA`, `produccionDiaria` (array de objetos {fecha, cantidad}), `distribucionEstados` (objeto {aprobadas, negadas, aplazadas}), `porAnalista` (array de objetos {nombre, total, aprobadas, negadas, aplazadas, tiempoPromedio, fueraSLA}), `slaDiario` (array de objetos {fecha, dentroSLA, fueraSLA}).
5. IF el Backend_Métricas encuentra un error al leer la hoja de cálculo, THEN THE Backend_Métricas SHALL lanzar una excepción con un mensaje descriptivo del error.

---

### Requisito 10: Estado de Carga y Manejo de Errores en la Interfaz

**Historia de usuario:** Como coordinador, quiero ver indicadores visuales mientras se cargan los datos y mensajes claros si ocurre un error, para entender el estado del sistema en todo momento.

#### Criterios de Aceptación

1. WHILE el Módulo_Métricas espera la respuesta del Backend_Métricas, THE Módulo_Métricas SHALL mostrar un spinner de carga centrado en el área de contenido.
2. WHEN los datos se reciben correctamente, THE Módulo_Métricas SHALL ocultar el spinner y renderizar los gráficos y tablas.
3. IF el Backend_Métricas retorna un error, THEN THE Módulo_Métricas SHALL ocultar el spinner y mostrar una alerta SweetAlert2 de tipo "error" con el mensaje recibido del servidor.
4. THE Módulo_Métricas SHALL incluir un botón "Actualizar" que permita al Coordinador recargar los datos manualmente en cualquier momento.

---

### Requisito 11: Diseño Responsivo del Módulo de Métricas

**Historia de usuario:** Como coordinador, quiero que la sección de métricas se adapte a diferentes tamaños de pantalla, para consultarla desde distintos dispositivos.

#### Criterios de Aceptación

1. WHILE el ancho de pantalla es mayor a 992px, THE Módulo_Métricas SHALL mostrar los gráficos en un grid de 2 columnas.
2. WHILE el ancho de pantalla es menor o igual a 992px, THE Módulo_Métricas SHALL apilar los gráficos en una sola columna.
3. THE Módulo_Métricas SHALL utilizar las clases del sistema de grid de Bootstrap 5 para la distribución de los componentes.
4. THE Módulo_Métricas SHALL mantener la legibilidad de los gráficos Chart.js al redimensionar la ventana utilizando la opción `responsive: true` en la configuración de cada gráfico.

---

### Requisito 12: Reutilización de Instancia de Spreadsheet

**Historia de usuario:** Como coordinador, quiero que el backend minimice las llamadas redundantes a Google Sheets, para que la respuesta de métricas sea más rápida.

#### Criterios de Aceptación

1. THE Backend_Métricas SHALL abrir el spreadsheet principal (`TARGET_SOLICITUDES_SS_ID`) una sola vez por invocación de `obtenerDatosMetricas`.
2. WHEN el Backend_Métricas verifica permisos de administrador, THE Backend_Métricas SHALL reutilizar la misma Instancia_Spreadsheet para la lectura posterior de datos de la hoja Historico_Gestiones.
3. THE Backend_Métricas SHALL pasar la Instancia_Spreadsheet como parámetro interno a las funciones auxiliares de lectura en lugar de invocar `SpreadsheetApp.openById()` adicionales.

---

### Requisito 13: Lectura Selectiva de Columnas

**Historia de usuario:** Como coordinador, quiero que el backend lea solo las columnas necesarias para el cálculo de métricas, para reducir el tiempo de transferencia de datos desde Google Sheets.

#### Criterios de Aceptación

1. THE Backend_Métricas SHALL leer únicamente las columnas requeridas para el cálculo de métricas (índices 0, 16, 27, 28, 29, 30, 33, 34) en lugar de leer el rango completo de datos.
2. WHEN el Backend_Métricas lee la hoja Historico_Gestiones, THE Backend_Métricas SHALL utilizar `getRange()` especificando solo las columnas necesarias o leer el rango completo y extraer los índices relevantes en una sola pasada.
3. THE Backend_Métricas SHALL utilizar `getValues()` en lugar de `getDisplayValues()` para la lectura de datos, aplicando conversión manual de fechas solo en la columna Fecha_Gestión.

---

### Requisito 14: Caché de Resultados con CacheService

**Historia de usuario:** Como coordinador, quiero que consultas repetidas al mismo rango de fechas se sirvan desde caché, para obtener respuestas inmediatas al navegar entre secciones.

#### Criterios de Aceptación

1. WHEN el Backend_Métricas completa el cálculo de métricas para un rango de fechas, THE Backend_Métricas SHALL almacenar el resultado en CacheService con una clave basada en el rango de fechas solicitado.
2. WHEN el Backend_Métricas recibe una solicitud para un rango de fechas que existe en caché, THE Backend_Métricas SHALL retornar los datos almacenados sin acceder a Google Sheets.
3. THE Backend_Métricas SHALL establecer un tiempo de expiración de caché de 300 segundos (5 minutos) para los resultados almacenados.
4. WHEN el Coordinador presiona el botón "Actualizar", THE Módulo_Métricas SHALL enviar un parámetro que fuerce al Backend_Métricas a invalidar la caché y recalcular los datos desde la hoja de cálculo.

---

### Requisito 15: Carga Progresiva de la Interfaz

**Historia de usuario:** Como coordinador, quiero que los elementos de la interfaz de métricas se rendericen progresivamente a medida que los datos estén disponibles, para percibir menor tiempo de espera.

#### Criterios de Aceptación

1. WHEN el Módulo_Métricas recibe los datos del backend, THE Módulo_Métricas SHALL renderizar primero las tarjetas de resumen y luego los gráficos en secuencia con un intervalo mínimo de 50ms entre cada renderizado.
2. WHILE los gráficos se renderizan, THE Módulo_Métricas SHALL mostrar un placeholder con animación de carga en cada contenedor de gráfico que aún no se ha dibujado.
3. THE Módulo_Métricas SHALL renderizar los gráficos en el siguiente orden de prioridad: tarjetas de resumen, gráfico de producción diaria, gráfico de distribución por estado, gráfico de productividad por analista, gráfico de SLA, tabla de analistas.

---

### Requisito 16: Optimización del Procesamiento de Fechas

**Historia de usuario:** Como coordinador, quiero que el filtrado por fecha sea eficiente incluso con miles de registros, para que el cálculo de métricas no se degrade con el crecimiento de datos.

#### Criterios de Aceptación

1. THE Backend_Métricas SHALL convertir las fechas de límite del rango (fechaDesde, fechaHasta) a formato numérico comparable una sola vez antes del ciclo de iteración sobre los registros.
2. WHEN el Backend_Métricas itera sobre la hoja Historico_Gestiones, THE Backend_Métricas SHALL convertir cada Fecha_Gestión a formato numérico comparable para la comparación contra los límites del rango, evitando operaciones de parsing de string repetitivas.
3. IF una fila de Historico_Gestiones contiene un valor de Fecha_Gestión vacío o no parseable, THEN THE Backend_Métricas SHALL omitir esa fila del cálculo sin interrumpir el procesamiento de las filas restantes.
