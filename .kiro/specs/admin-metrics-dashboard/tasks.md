# Implementation Plan: Admin Metrics Dashboard

## Overview

Implementar la sección "Métricas" en el panel de administración (VistaAdmin.html) con backend en Admin.js. El trabajo se divide en: funciones auxiliares backend → función principal backend → integración del enlace sidebar → sección HTML con filtros y placeholders → gráficos Chart.js → tabla DataTables → renderizado progresivo. Todo el código es JavaScript plano (Google Apps Script) sin bundler.

## Tasks

- [ ] 1. Crear funciones auxiliares del backend en Admin.js
  - [ ] 1.1 Implementar funciones de conversión de fechas (`_fechaDDMMYYYYaNumero`, `_valorAFechaNumero`, `_fechaNumeroAString`)
    - Agregar al final de Admin.js las tres funciones de utilidad para convertir fechas dd/MM/yyyy a entero YYYYMMDD y viceversa
    - `_fechaDDMMYYYYaNumero(fechaStr)` convierte string "dd/MM/yyyy" → entero YYYYMMDD, retorna null si inválido
    - `_valorAFechaNumero(valor)` maneja tanto Date objects como strings "dd/MM/yyyy" → entero YYYYMMDD
    - `_fechaNumeroAString(num)` reconstruye "dd/MM/yyyy" desde entero YYYYMMDD
    - _Requirements: 16.1, 16.2, 16.3_

  - [ ] 1.2 Implementar funciones auxiliares de verificación y resultado vacío (`_verificarAdminDesdeInstancia`, `_resultadoVacio`)
    - `_verificarAdminDesdeInstancia(ss)` verifica permisos ADMIN reutilizando la instancia de spreadsheet ya abierta (no llama `openById` adicional)
    - `_resultadoVacio()` retorna el objeto de respuesta con contadores en 0 y arrays vacíos
    - _Requirements: 12.2, 12.3, 9.4_

  - [ ] 1.3 Implementar funciones de construcción de arrays de respuesta (`_objectToSortedArray`, `_buildAnalystArray`, `_buildSLAArray`)
    - `_objectToSortedArray(porDia)` convierte mapa {fecha: count} a array [{fecha, cantidad}] ordenado cronológicamente
    - `_buildAnalystArray(porAnalista)` construye array de analistas con tiempoPromedio calculado, ordenado por total descendente
    - `_buildSLAArray(slaPorDia)` construye array [{fecha, dentroSLA, fueraSLA}] ordenado cronológicamente
    - _Requirements: 9.4, 6.3, 8.1_

- [ ] 2. Implementar la función principal `obtenerDatosMetricas` en Admin.js
  - [ ] 2.1 Implementar `obtenerDatosMetricas(fechaDesde, fechaHasta, forceRefresh)` con caché y procesamiento de datos
    - Verificar caché con CacheService (clave `metricas_` + fechaDesde + `_` + fechaHasta, TTL 300s)
    - Si forceRefresh=true o cache miss: abrir spreadsheet UNA vez con `openById(TARGET_SOLICITUDES_SS_ID)`
    - Llamar `_verificarAdminDesdeInstancia(ss)` reutilizando la instancia
    - Leer Historico_Gestiones con `getRange(2, 1, lastRow - 1, 35).getValues()`
    - Convertir fechaDesde/fechaHasta a entero numérico UNA vez antes del loop
    - Iterar filas: filtrar por rango de fecha con comparación numérica, acumular métricas (total, estados, tiempos, SLA, agrupaciones por día y analista)
    - Construir objeto respuesta usando las funciones auxiliares de 1.3
    - Almacenar en caché con try/catch (puede fallar si >100KB)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 12.1, 12.2, 12.3, 13.1, 13.2, 13.3, 14.1, 14.2, 14.3, 14.4, 16.1, 16.2, 16.3_

  - [ ]* 2.2 Write property test: Date Range Filtering
    - **Property 1: Date Range Filtering**
    - **Validates: Requirements 3.2, 9.3**

  - [ ]* 2.3 Write property test: Arithmetic Mean Correctness
    - **Property 2: Arithmetic Mean Correctness**
    - **Validates: Requirements 3.3, 7.5**

  - [ ]* 2.4 Write property test: Estado Distribution Integrity
    - **Property 3: Estado Distribution Integrity**
    - **Validates: Requirements 3.4, 5.2**

  - [ ]* 2.5 Write property test: SLA Threshold Classification
    - **Property 4: SLA Threshold Classification**
    - **Validates: Requirements 3.5, 8.2**

  - [ ]* 2.6 Write property test: Daily Production Grouping
    - **Property 5: Daily Production Grouping**
    - **Validates: Requirements 4.2**

  - [ ]* 2.7 Write property test: Analyst Aggregation Completeness
    - **Property 6: Analyst Aggregation Completeness**
    - **Validates: Requirements 6.2, 7.2**

  - [ ]* 2.8 Write property test: Analyst Sort Invariant
    - **Property 7: Analyst Sort Invariant**
    - **Validates: Requirements 6.3**

  - [ ]* 2.9 Write property test: Date Numeric Conversion Equivalence
    - **Property 9: Date Numeric Conversion Equivalence**
    - **Validates: Requirements 16.1, 16.2**

- [ ] 3. Checkpoint - Verificar backend completo
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Integrar navegación y estructura HTML de la sección Métricas en VistaAdmin.html
  - [ ] 4.1 Convertir enlace "Métricas" del sidebar de externo a interno y agregar CDN de Chart.js
    - Reemplazar el `<a href="https://script.google.com/..." target="_blank" ...>` por `<a href="#" id="link-metricas" class="nav-link-admin" onclick="mostrarSeccion('metricas', event)">`
    - Eliminar el icono `bi-box-arrow-up-right` (ya no es enlace externo)
    - Agregar `<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>` después de la línea de SweetAlert2
    - _Requirements: 1.1, 1.4_

  - [ ] 4.2 Crear la sección HTML `seccion-metricas` con filtros de fecha, tarjetas de resumen y contenedores de gráficos
    - Agregar `<div id="seccion-metricas" class="seccion-admin" style="display:none;">` con toda la estructura interna
    - Header con título "Métricas" y botón "Actualizar" (icono refresh)
    - Fila de filtros: inputs type="date" para Desde/Hasta, botón "Aplicar", botones rápidos ("Hoy", "Última semana", "Último mes")
    - Fila de 4 tarjetas de resumen (total gestionadas, tiempo promedio, tasa aprobación, fuera de SLA)
    - Grid 2x2 con contenedores de gráficos (cada uno con placeholder animado + canvas oculto): producción diaria, distribución estados, productividad por analista, cumplimiento SLA
    - Tabla de rendimiento por analista con estructura para DataTables
    - Usar clases Bootstrap 5 para grid responsivo (col-lg-6 para 2 columnas en >992px, col-12 en móvil)
    - _Requirements: 1.2, 2.1, 2.5, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 10.1, 11.1, 11.2, 11.3, 15.2_

  - [ ] 4.3 Agregar estilos CSS para la sección de métricas (tarjetas, placeholders, charts)
    - Estilos para tarjetas de resumen (.metric-card con sombra, borde, icono)
    - Estilos para placeholder de carga animado (.chart-placeholder con pulse animation)
    - Estilos para contenedores de gráfico (.chart-container con altura fija)
    - Estilo para celdas fuera de SLA resaltadas (.sla-alert con fondo rojo claro)
    - Responsive: media query ≤992px para stacking de gráficos
    - _Requirements: 1.4, 11.1, 11.2, 11.3, 7.4, 15.2_

- [ ] 5. Implementar lógica JavaScript del frontend para métricas en VistaAdmin.html
  - [ ] 5.1 Implementar funciones de navegación, filtro y carga de datos
    - Extender `mostrarSeccion()` con caso `if (id === 'metricas') cargarMetricas();`
    - Agregar `_renderFromCache` caso para 'metricas' si aplica
    - Implementar `cargarMetricas(forceRefresh)`: obtener fechas del filtro, validar rango, mostrar placeholders, llamar `google.script.run.obtenerDatosMetricas()`
    - Implementar `validarRangoFechas(desde, hasta)` con validación de fechas
    - Implementar `aplicarFiltroFechas()` que valida y llama `cargarMetricas(false)`
    - Implementar `setRangoRapido(tipo)` para botones "Hoy", "Última semana", "Último mes" con cálculo de fechas
    - Conectar botón "Actualizar" para llamar `cargarMetricas(true)` (forceRefresh)
    - Inicializar filtro predeterminado a últimos 7 días al cargar sección
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 10.1, 10.2, 10.3, 10.4, 14.4_

  - [ ] 5.2 Implementar renderizado progresivo y funciones de tarjetas de resumen
    - Implementar `renderizarMetricas(datos)` que orquesta renderizado secuencial con setTimeout de 50ms entre componentes
    - Implementar `actualizarTarjetas(datos)` que actualiza los 4 valores de las tarjetas
    - Implementar `mostrarPlaceholders()` y `ocultarPlaceholders()` para gestionar animaciones de carga
    - Declarar variables globales `chartProduccion`, `chartEstados`, `chartAnalistas`, `chartSLA` (instancias Chart.js)
    - Orden de renderizado: tarjetas → producción → estados → analistas → SLA → tabla
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 10.1, 10.2, 15.1, 15.2, 15.3_

  - [ ] 5.3 Implementar gráficos Chart.js (producción diaria, estados, analistas, SLA)
    - `renderGraficoProduccion(produccionDiaria)`: gráfico de líneas con fechas en eje X, cantidad en eje Y, tooltip con fecha y cantidad. Si sin datos, mostrar mensaje "Sin datos para el período seleccionado"
    - `renderGraficoEstados(distribucion)`: gráfico de dona con segmentos APROBADA(verde), NEGADA(rojo), APLAZADA(amarillo), leyenda debajo, tooltip con nombre, cantidad y porcentaje
    - `renderGraficoAnalistas(porAnalista)`: gráfico de barras horizontales ordenado de mayor a menor, tooltip con nombre y cantidad
    - `renderGraficoSLA(slaDiario)`: gráfico de barras agrupadas (dentro SLA verde, fuera SLA rojo) por día, línea de referencia horizontal al 90%
    - Cada función: destruye instancia previa con `.destroy()`, oculta placeholder, muestra canvas, configura `responsive: true`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 8.1, 8.2, 8.3, 8.4, 11.4_

  - [ ] 5.4 Implementar tabla de rendimiento por analista con DataTables
    - `renderTablaAnalistas(porAnalista)`: destruir DataTable existente si hay, reconstruir tbody con datos
    - Columnas: Nombre, Total gestionadas, Aprobadas, Negadas, Aplazadas, Tiempo promedio (min), Fuera de SLA
    - Aplicar DataTables con ordenación por columnas y búsqueda por texto
    - Resaltar celdas de "Fuera de SLA" con valor > 0 usando clase CSS `.sla-alert` (fondo rojo claro)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 6. Checkpoint - Verificar integración frontend-backend completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check (Node.js environment, separate from GAS runtime)
- The project has no existing test framework; property tests require Node.js setup with fast-check
- All code is plain JavaScript for Google Apps Script (no modules, no imports)
- Chart.js CDN needs to be added (not currently loaded)
- The existing `mostrarSeccion()` function at line ~2814 needs a new case for 'metricas'
- The sidebar link at line ~976 needs to be converted from external URL to internal `onclick`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "4.1"] },
    { "id": 2, "tasks": ["2.1", "4.2", "4.3"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "5.1"] },
    { "id": 4, "tasks": ["5.2"] },
    { "id": 5, "tasks": ["5.3", "5.4"] }
  ]
}
```
