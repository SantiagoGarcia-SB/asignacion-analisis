# Implementation Plan: Admin Metrics Dashboard

## Overview

Implementar la sección "Métricas" en el panel de administración (VistaAdmin.html), incluyendo el backend de agregación de datos en Admin.js y el frontend con gráficos Chart.js, tarjetas de resumen y tabla DataTables. La implementación sigue un enfoque incremental: primero backend, luego estructura HTML, después lógica frontend, y finalmente integración con gráficos y tabla.

## Tasks

- [x] 1. Implementar backend de métricas en Admin.js
  - [x] 1.1 Crear función auxiliar `parseFechaDDMMYYYY(fechaStr)` en Admin.js
  - [x] 1.2 Crear función `obtenerDatosMetricas(fechaDesde, fechaHasta)` en Admin.js

  - [ ]* 1.3 Write property tests for backend aggregation logic (Property 1: Date Range Filtering)
    - **Property 1: Date Range Filtering**
    - Extraer lógica de filtrado en función pura testeable
    - Usar fast-check para generar solicitudes con fechas aleatorias y verificar que solo se incluyen las que caen en [desde, hasta]
    - Verificar que totalGestionadas == cantidad de solicitudes filtradas
    - **Validates: Requirements 3.2, 9.3**

  - [ ]* 1.4 Write property tests for arithmetic calculations (Property 2: Arithmetic Mean, Property 3: Estado Distribution)
    - **Property 2: Arithmetic Mean Correctness**
    - **Property 3: Estado Distribution Integrity**
    - Verificar que tiempoPromedioMinutos == sum(tiempos) / count, redondeado a 1 decimal
    - Verificar que aprobadas + negadas + aplazadas == totalGestionadas
    - Verificar que tasaAprobacion == (aprobadas / total) * 100 redondeado a 1 decimal
    - **Validates: Requirements 3.3, 3.4, 5.2, 7.5**

  - [ ]* 1.5 Write property tests for SLA classification and grouping (Property 4, 5, 6, 7)
    - **Property 4: SLA Threshold Classification**
    - **Property 5: Daily Production Grouping**
    - **Property 6: Analyst Aggregation Completeness**
    - **Property 7: Analyst Sort Invariant**
    - Verificar clasificación SLA con threshold 4 horas exacto
    - Verificar que sum(produccionDiaria.cantidad) == totalGestionadas
    - Verificar que cada analista tiene total == aprobadas + negadas + aplazadas
    - Verificar ordenamiento descendente de porAnalista por total
    - **Validates: Requirements 3.5, 4.2, 6.2, 6.3, 7.2, 8.2**

- [ ] 2. Checkpoint - Verificar backend
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Agregar estructura HTML del Módulo de Métricas
  - [x] 3.1 Agregar CDN de Chart.js y DataTables en VistaAdmin.html
  - [x] 3.2 Agregar enlace "Métricas" al sidebar en VistaAdmin.html
  - [x] 3.3 Crear sección `seccion-metricas` completa en VistaAdmin.html

- [x] 4. Implementar lógica JavaScript del frontend
  - [x] 4.1 Extender función `mostrarSeccion()` para manejar 'metricas'
  - [x] 4.2 Implementar funciones `aplicarFiltroFechas()` y `setRangoRapido(tipo)`
  - [x] 4.3 Implementar función `cargarMetricas()`
  - [x] 4.4 Implementar funciones `renderizarMetricas(datos)` y `actualizarTarjetas(datos)`
  - [x] 4.5 Implementar `renderGraficoProduccion(produccionDiaria)`
  - [x] 4.6 Implementar `renderGraficoEstados(distribucion)`
  - [x] 4.7 Implementar `renderGraficoAnalistas(porAnalista)`
  - [x] 4.8 Implementar `renderGraficoSLA(slaDiario)`
  - [x] 4.9 Implementar `renderTablaAnalistas(porAnalista)`

- [ ] 5. Checkpoint - Verificar integración frontend-backend
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Integración final y validación
  - [ ] 6.1 Wiring completo: verificar flujo end-to-end
    - Verificar que click en "Métricas" → mostrarSeccion → cargarMetricas → renderizarMetricas funciona
    - Verificar que filtros de fecha actualizan todos los gráficos y tabla
    - Verificar que botón "Actualizar" recarga datos correctamente
    - Verificar que errores de backend muestran alerta SweetAlert2
    - Verificar que rango predeterminado (últimos 7 días) se aplica al primer acceso
    - _Requirements: 1.2, 2.2, 2.3, 10.3, 10.4_

  - [ ]* 6.2 Write property test for response structure completeness (Property 8)
    - **Property 8: Response Structure Completeness**
    - Verificar que para cualquier rango válido, el objeto retornado contiene todas las propiedades requeridas con tipos correctos
    - **Validates: Requirements 9.4**

- [ ] 7. Final checkpoint - Verificar todo el módulo
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- El proyecto usa Google Apps Script; las funciones se agregan directamente a Admin.js
- El HTML se modifica inline en VistaAdmin.html (no hay sistema de módulos/bundler)
- Chart.js y DataTables se cargan via CDN
- fast-check se usaría para property tests de la lógica de agregación extraída en funciones puras

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "3.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "3.3"] },
    { "id": 3, "tasks": ["4.1", "4.2"] },
    { "id": 4, "tasks": ["4.3", "4.4"] },
    { "id": 5, "tasks": ["4.5", "4.6", "4.7", "4.8", "4.9"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2"] }
  ]
}
```
