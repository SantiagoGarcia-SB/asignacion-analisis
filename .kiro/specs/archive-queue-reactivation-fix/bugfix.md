# Bugfix Requirements Document

## Introduction

La recuperación manual de biometrías archivadas permite hoy seleccionar casos sin una fecha de consulta SAI elegida por el usuario y sin un límite lógico máximo de cantidad. Esto puede recuperar filas que no pertenecen al día operativo que se desea revisar y permitir un número no acotado de consultas individuales a SAI en una sola ejecución. El ajuste debe hacer que la fecha de desarchivado sea una decisión explícita del usuario, que `fecha_consulta_sai` sea la única fecha de selección, que la respuesta individual de SAI sea la única fuente para decidir si el caso continúa aplazado y puede reingresar, y que la operación acepte como máximo 100 candidatas físicas. `fechaResultado` no forma parte del flujo de desarchivado.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN el usuario inicia el desarchivado manual THEN el sistema solo solicita una cantidad de casos y no permite elegir una fecha de consulta SAI, incluida hoy, ayer, anteayer u otra fecha de calendario.

1.2 WHEN existen filas en `pendiente_biometria` con fase `ARCHIVADA` THEN el sistema las selecciona por `fecha_actualizacion_fase` sin exigir que `fecha_consulta_sai` sea igual a una fecha elegida por el usuario.

1.3 WHEN una ejecución de desarchivado considera una fecha de una fila archivada THEN el sistema puede basar la selección o la decisión de reingreso en una fecha distinta de `fecha_consulta_sai`, incluida `fechaResultado`.

1.4 WHEN una biometría archivada es candidata y SAI responde `studyStatus = APROBADO_PENDIENTE_BIOMETRIA`, `mainResultCode = 2` y un `requestType` no excluido, pero `resultCode` es distinto de `500`, incluido `503` THEN el sistema la reincorpora a `solicitud` y marca la fase `ESCALADA`.

1.5 WHEN una biometría archivada es candidata y SAI responde `resultCode = 500`, pero no cumple `studyStatus = APROBADO_PENDIENTE_BIOMETRIA`, `mainResultCode = 2` o un `requestType` admisible THEN el sistema puede reincorporarla sin aplicar todos los criterios vigentes de admisión.

1.6 WHEN varias filas `ARCHIVADA` coinciden con el día elegido de `fecha_consulta_sai` THEN el sistema actual no define que la selección y el límite de cantidad deban conservar el orden físico de esas filas y mantener separado el orden administrativo de Biometría.

1.7 WHEN existen filas `ARCHIVADA` coincidentes con ID repetido, `fecha_consulta_sai` vacía o malformada, o fechas de resultado vacías o malformadas THEN el sistema actual no documenta de forma explícita si esas condiciones cambian la elegibilidad, el límite de cantidad, la deduplicación de la cola o la prioridad posterior.

1.8 WHEN el usuario solicita una cantidad positiva igual al total de archivadas o a un número arbitrariamente grande THEN el sistema no impone un máximo lógico propio en backend y puede iniciar una cantidad no acotada de consultas individuales a SAI durante una sola ejecución.

1.9 WHEN el desarchivado consulta varias candidatas THEN el sistema no garantiza un presupuesto explícito de cantidad que mantenga la operación muy por debajo de los patrones operativos existentes de consultas seriales con espera ni protege la ejecución manual ante la latencia variable de SAI.

### Expected Behavior (Correct)

2.1 WHEN el usuario abre el flujo de desarchivado THEN el sistema SHALL permitir elegir una fecha de consulta mediante las opciones hoy, ayer, anteayer u otra fecha de calendario válida.

2.2 WHEN el usuario envía una fecha de desarchivado THEN el sistema SHALL validar también en backend que sea una fecha de calendario completa, existente, no futura y dentro del formato admitido; ante una fecha ausente, malformada, imposible o futura, SHALL rechazar la solicitud sin consultar SAI ni modificar filas.

2.3 WHEN el sistema acepta una fecha elegida THEN el sistema SHALL normalizarla y compararla como fecha de calendario en la zona horaria operativa, de modo que una diferencia de zona horaria o de hora no desplace el día seleccionado ni produzca coincidencias de un día adyacente.

2.4 WHEN el sistema busca candidatas para desarchivar THEN el sistema SHALL incluir únicamente filas de `pendiente_biometria` cuya fase sea `ARCHIVADA` y cuyo valor normalizado de `fecha_consulta_sai` sea exactamente igual a la fecha elegida por el usuario.

2.5 WHEN el sistema filtra candidatas para desarchivar THEN el sistema SHALL usar exclusivamente `fecha_consulta_sai` como criterio de fecha y SHALL NOT leer ni usar `fechaResultado`, `fecha_actualizacion_fase` ni otra fecha para seleccionar, ordenar o decidir el flujo de desarchivado.

2.6 WHEN no existen filas `ARCHIVADA` cuya `fecha_consulta_sai` coincida con la fecha elegida THEN el sistema SHALL completar la operación sin error, informar que no hubo coincidencias y no consultar SAI ni modificar filas.

2.7 WHEN una fila candidata es procesada THEN el sistema SHALL consultar la API SAI exactamente una vez por su ID y SHALL usar exclusivamente esa respuesta individual para determinar si la biometría continúa aplazada y puede ser asignable.

2.8 WHEN SAI responde para una candidata THEN el sistema SHALL permitir su reingreso únicamente si `resultCode = 500` y, además, se mantienen los demás criterios de admisión aplicables: `studyStatus = APROBADO_PENDIENTE_BIOMETRIA`, `mainResultCode = 2` y un `requestType` no excluido.

2.9 WHEN SAI responde para una candidata pero `resultCode` es distinto de `500`, o cualquier otro criterio de admisión aplicable no se cumple THEN el sistema SHALL no reincorporarla a la cola de llamada y SHALL marcarla `RESUELTA`.

2.10 WHEN varias filas `ARCHIVADA` con ID no vacío tienen la misma `fecha_consulta_sai` normalizada que la fecha elegida THEN el sistema SHALL conservar su orden físico en `pendiente_biometria`, aplicar `cantidad` sobre esa secuencia y SHALL NOT ordenarlas, desempatar ni excluirlas con `ORDEN_DESAPLAZAMIENTO`, `fechaResultado`, `fecha_actualizacion_fase` ni otra fecha o prioridad.

2.11 WHEN una candidata elegible se confirma en `solicitud` THEN el sistema SHALL no copiar, consumir, modificar ni reinterpretar `ORDEN_DESAPLAZAMIENTO` durante el desarchivado; el caso reinsertado SHALL quedar sujeto posteriormente al orden vigente de asignación de Desaplazamiento/Biometría por su `fechaResultado`.

2.12 WHEN una fila `ARCHIVADA` tiene `fecha_consulta_sai` vacía, no interpretable o que normaliza a un día distinto del elegido THEN el sistema SHALL no seleccionarla, no contarla dentro de `cantidad`, no consultar SAI para ella ni cambiar su fase.

2.13 WHEN dos o más filas físicas coincidentes tienen el mismo ID de solicitud THEN el sistema SHALL tratarlas como candidatas físicas en su orden de hoja y dentro de `cantidad`, SHALL evitar insertar el ID más de una vez en `solicitud` mediante la deduplicación existente y SHALL confirmar la fase de cada fila únicamente conforme al resultado individual SAI y al resultado confirmado de persistencia.

2.14 WHEN el usuario envía una solicitud de desarchivado THEN el backend SHALL aceptar `cantidad` únicamente como un entero decimal estricto entre 1 y 100, sin coerción de textos parciales, decimales, signos, valores no finitos, claves inesperadas ni valores fuera de ese intervalo; ante cualquier valor inválido SHALL rechazar la solicitud antes de consultar SAI, tomar bloqueos, escribir en `solicitud` o modificar filas.

2.15 WHEN `cantidad` es mayor que 100 THEN el backend SHALL responder de forma determinista con `success = false`, `errorCode = CANTIDAD_MAXIMA_EXCEDIDA`, `maxCantidad = 100` y un mensaje que indique que el máximo de desarchivado por operación es 100; SHALL no consultar SAI, cambiar fases ni realizar escrituras.

2.16 WHEN el usuario ve o edita la cantidad en el flujo de desarchivado THEN el frontend SHALL mostrar que el máximo es 100, restringir su control a 1–100 y bloquear el envío local de un valor fuera de ese intervalo; el frontend SHALL tratar la respuesta de límite del backend como autoritativa y mostrar el mensaje recibido sin iniciar ni reintentar consultas SAI por su cuenta.

2.17 WHEN el backend acepta una solicitud con `cantidad` entre 1 y 100 THEN el sistema SHALL procesar como máximo esa cantidad de candidatas físicas ya filtradas, realizar una sola consulta individual por cada candidata seleccionada y mantener una espera de al menos un segundo entre intentos consecutivos de consulta SAI, incluidos los que no produzcan una respuesta elegible.

2.18 WHEN se establece el máximo de desarchivado THEN el sistema SHALL usar 100 como límite seguro por operación, porque acota a 100 las consultas individuales seriales y su espera mínima acumulada de 100 segundos antes de considerar la latencia de SAI y la persistencia; este presupuesto conserva un margen amplio frente a los flujos operativos existentes que controlan hasta 500 consultas con un presupuesto de 20 minutos.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN SAI no responde o no está disponible para una candidata seleccionada THEN el sistema SHALL CONTINUE TO mantenerla `ARCHIVADA`, no reincorporarla ni cerrarla, y dejarla disponible para un reintento posterior.

3.2 WHEN una candidata satisface la respuesta SAI y todos los criterios de admisión para reingreso THEN el sistema SHALL CONTINUE TO escribirla primero en `solicitud` y marcarla `ESCALADA` solo después de confirmar que quedó insertada o que ya estaba presente en la cola.

3.3 WHEN una candidata elegible ya figura en `Historico_Gestiones` THEN el sistema SHALL CONTINUE TO evitar una inserción duplicada en `solicitud` y marcar su fase `ASIGNADA`.

3.4 WHEN una candidata elegible ya figura en `solicitud` THEN el sistema SHALL CONTINUE TO evitar una inserción duplicada y confirmar su fase `ESCALADA`.

3.5 WHEN el desarchivado procesa una candidata de una fecha válida THEN el sistema SHALL CONTINUE TO preservar las protecciones de concurrencia y confirmar que la fila sigue en fase `ARCHIVADA` antes de escribir su nueva fase.

3.6 WHEN otros flujos de biometría usan o actualizan `fechaResultado` para sus propósitos vigentes THEN el sistema SHALL CONTINUE TO conservar ese comportamiento fuera del flujo de desarchivado.

3.7 WHEN una biometría reinsertada llegue posteriormente a la asignación de Desaplazamiento/Biometría THEN el sistema SHALL CONTINUE TO usar `ORDEN_DESAPLAZAMIENTO` solo en esa asignación posterior, ordenando por `fechaResultado`: `RECIENTE_PRIMERO` conserva LIFO como valor histórico predeterminado y `ANTIGUO_PRIMERO` conserva FIFO.

3.8 WHEN `ORDEN_DESAPLAZAMIENTO` esté ausente o vacío THEN el sistema SHALL CONTINUE TO usar `RECIENTE_PRIMERO`; WHEN su valor haya sido alterado fuera del setter administrativo y sea distinto de `RECIENTE_PRIMERO` THEN el sistema SHALL CONTINUE TO conservar la interpretación vigente de antiguo primero. El desarchivado no SHALL validar, reparar ni persistir ese valor.

3.9 WHEN una biometría reinsertada tenga `fechaResultado` vacía o no interpretable THEN el sistema SHALL CONTINUE TO no usar ese valor para seleccionar, limitar ni decidir su desarchivado; su ubicación posterior conserva el comportamiento existente del normalizador de fechas y de `ORDEN_DESAPLAZAMIENTO`.

3.10 WHEN existan IDs duplicados en filas físicas coincidentes THEN el sistema SHALL CONTINUE TO impedir una inserción duplicada en `solicitud`; cada fila que llegue a una transición confirmada conserva su actualización individual de fase, y las filas no confirmadas conservan `ARCHIVADA` para reintento.

3.11 WHEN el usuario solicita una cantidad válida entre 1 y 100 para una fecha válida THEN el sistema SHALL CONTINUE TO seleccionar exclusivamente las filas físicas `ARCHIVADA` con ID no vacío y coincidencia exacta de `fecha_consulta_sai`, conservar su orden físico y aplicar la cantidad únicamente después de ese filtrado.

3.12 WHEN una candidata física queda dentro de la cantidad aceptada THEN el sistema SHALL CONTINUE TO emitir una sola consulta SAI individual para esa candidata, incluso si comparte ID con otra fila física seleccionada; las filas fuera de la cantidad no recibirán consultas SAI ni cambios de fase.

3.13 WHEN una fecha válida no tenga coincidencias `ARCHIVADA` por `fecha_consulta_sai` THEN el sistema SHALL CONTINUE TO retornar un resultado exitoso e informativo de cero coincidencias, sin consumir capacidad del máximo de 100, consultar SAI, tomar bloqueos, escribir en cola ni modificar filas.
