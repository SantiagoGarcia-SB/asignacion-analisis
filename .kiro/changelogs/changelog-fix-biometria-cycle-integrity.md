# Changelog — fix/biometria-cycle-integrity

## [No publicado]

### Corregido
- Se corrigió la sincronización de fases de biometría entre `solicitud`, `Historico_Gestiones` y `pendiente_biometria`: `ESCALADA` ahora requiere que la cola confirme el ID, y las salidas a `ASIGNADA`, `RESUELTA_EN_COLA` y `ARCHIVADA` reportan actualizaciones incompletas.
- Se agregó reconciliación al inicio de cada corte para reparar automáticamente biometrías escaladas que ya fueron asignadas, se resolvieron en SAI o perdieron su fila de cola.
- Se ajustó la escalación por respuestas nulas de SAI para que los casos sigan siendo asignables en la cola, conservando `SAI_NO_CONFIRMO` como trazabilidad.
