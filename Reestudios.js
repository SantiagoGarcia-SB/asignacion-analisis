const ID_HOJA_VICTORIA = '1_wSkdh3eD0mG474De6RUrj9yd9L8SKnnSjqO3Pg4Jsg'; 
const NOMBRE_PESTANA_VICTORIA = 'Anexar documentos a la solicitud';

const ID_HOJA_CORREO = '1jGa30nF7DTlu6bRoU8cOBqU8c_AP-bq6LP8D52JpaPQ'; 
const NOMBRE_PESTANA_CORREO = 'Solicitudes';

const ID_HOJA_APROBADOS = '1slgykTgjoAtCd6KmlG7Lqiuw-nM1hSguQbi0XqeLu7U'; 
const NOMBRE_PESTANA_APROBADOS = 'Hoja 1';

function registrarSolicitudAprobada(nroSolicitud) {
  if (!nroSolicitud || nroSolicitud === "---") return;
  try {
    const sheetAprobados = SpreadsheetApp.openById(ID_HOJA_APROBADOS).getSheetByName(NOMBRE_PESTANA_APROBADOS);
    sheetAprobados.appendRow([nroSolicitud]);
  } catch (error) {
    Logger.log("Error al pasar a la hoja de aprobados: " + error.message);
  }
}


function obtenerUltimaFilaReal(sheet) {
  const columnaB = sheet.getRange("B1:B" + sheet.getLastRow()).getValues();
  for (let i = columnaB.length - 1; i >= 0; i--) {
    let valor = String(columnaB[i][0]).replace(/[\n\r\t]/g, "").trim();
    if (valor !== "" && valor.toLowerCase() !== "null" && valor.length > 2) {
      return i + 1;
    }
  }
  return 1;
}


function getDatosVictoria() {
  try {
    const sheet = SpreadsheetApp.openById(ID_HOJA_VICTORIA).getSheetByName(NOMBRE_PESTANA_VICTORIA);
    if (!sheet) throw new Error("No se encontró la pestaña Victoria.");

    const lastRowReal = obtenerUltimaFilaReal(sheet);
    if (lastRowReal <= 1) return { success: true, data: [] }; 

    const data = sheet.getRange("A2:Q" + lastRowReal).getDisplayValues();
    let resultados = [];

    let inicio = 0;
    if (data.length > 2000) inicio = data.length - 2000;

    for (let i = inicio; i < data.length; i++) {
      let solicitud = String(data[i][1] || "").trim();
      if (solicitud === "") continue; 

      let valRepetida = String(data[i][8] || "").trim().toUpperCase(); 
      if (valRepetida === "") valRepetida = "NO";

      resultados.push({
        filaReal: i + 2, 
        nro_solicitud:     solicitud, 
        tipo_documento:    String(data[i][2] || "---"), 
        nro_documento:     String(data[i][3] || "---"), 
        documento_adjunto: String(data[i][4] || ""),    
        detalles:          String(data[i][5] || ""),    
        celular:           String(data[i][6] || ""),    
        correo:            String(data[i][7] || ""),    
        repetida:          valRepetida,
        estadoColJ:        String(data[i][9] || "").trim() 
      });
    }

    resultados.reverse(); 
    return { success: true, data: resultados };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function guardarGestionVictoria(datos) {
  try {
    if (!datos.filaReal) throw new Error("Falta la fila de destino.");
    const sheet = SpreadsheetApp.openById(ID_HOJA_VICTORIA).getSheetByName(NOMBRE_PESTANA_VICTORIA);
    const targetRow = datos.filaReal;

    sheet.getRange(targetRow, 10).setValue(datos.estadoSolicitud || ""); // Col J
    sheet.getRange(targetRow, 16).setValue(datos.tipoDocPresentado || ""); // Col P

    if (datos.estadoSolicitud === "Solicitud aprobada") {
      registrarSolicitudAprobada(datos.nroSolicitud);
    }

    SpreadsheetApp.flush();
    return { success: true, message: "Gestión de Victoria guardada correctamente." };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function getDatosCorreo() {
  try {
    const sheet = SpreadsheetApp.openById(ID_HOJA_CORREO).getSheetByName(NOMBRE_PESTANA_CORREO);
    if (!sheet) throw new Error("No se encontró la pestaña Correo.");

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, data: [] }; 

    const data = sheet.getRange("A2:M" + lastRow).getDisplayValues();
    let pendientes = [];

    for (let i = 0; i < data.length; i++) {
      let estadoEval = String(data[i][11] || "").trim();

      if (estadoEval === "") {
        pendientes.push({
          filaReal: i + 2,
          id_registro:      String(data[i][0] || "---"),
          nro_solicitud:    String(data[i][1] || "---"),
          nro_poliza:       String(data[i][2] || "---"),
          tipo_proceso:     String(data[i][3] || "---"),
          adjuntos:         String(data[i][4] || ""),
          fecha_llegada:    String(data[i][5] || "---"),
          url_carpeta:      String(data[i][6] || ""),
          fecha_registro:   String(data[i][7] || "---"),
          registrado_por:   String(data[i][8] || "---"),
          email_asignador:  String(data[i][9] || "---")
        });
      }
    }
    return { success: true, data: pendientes };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function guardarGestionCorreo(datos) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { success: false, message: "Sistema ocupado." }; }

  try {
    if (!datos.filaReal) throw new Error("Falta la fila de destino.");
    const sheet = SpreadsheetApp.openById(ID_HOJA_CORREO).getSheetByName(NOMBRE_PESTANA_CORREO);
    const targetRow = datos.filaReal;

    const estadoL = String(sheet.getRange(targetRow, 12).getDisplayValue()).trim(); 
    if (estadoL !== "") {
        return { success: false, message: "Este correo ya fue evaluado por otro analista." };
    }

    sheet.getRange(targetRow, 11).setValue(datos.nombreEvaluador || ""); 
    sheet.getRange(targetRow, 12).setValue(datos.estadoEvaluacion || ""); 
    sheet.getRange(targetRow, 13).setValue(datos.motivoDevolucion || ""); 

    if (datos.estadoEvaluacion === "APROBADO PARA ASIGNAR") {
      registrarSolicitudAprobada(datos.nroSolicitud);
    }

    SpreadsheetApp.flush();
    return { success: true, message: "Evaluación de Correo guardada exitosamente." };

  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

const URL_WEBHOOK_GOOGLE_CHAT = 'https://chat.googleapis.com/v1/spaces/AAQAwBNOpI8/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=lzhAcRL1_ZA3xh-Wa_DGDZCbzyxchh2sPBgh0-GaMEo'; 

function inicializarHistorico() {
  try {
    const sheetVictoria = SpreadsheetApp.openById(ID_HOJA_VICTORIA).getSheetByName(NOMBRE_PESTANA_VICTORIA);
    const trueLastRowVic = obtenerUltimaFilaReal(sheetVictoria);
    PropertiesService.getScriptProperties().setProperty('LAST_ROW_VICTORIA', trueLastRowVic.toString());

    const sheetCorreo = SpreadsheetApp.openById(ID_HOJA_CORREO).getSheetByName(NOMBRE_PESTANA_CORREO);
    const lastRowCor = sheetCorreo.getLastRow();
    if (lastRowCor > 1) {
      const valoresCor = [];
      for (let i = 2; i <= lastRowCor; i++) { valoresCor.push(["NOTIFICADO"]); }
      sheetCorreo.getRange(2, 14, valoresCor.length, 1).setValues(valoresCor); 
    }

    Logger.log("✅ ¡Borrón completado!");
  } catch(error) {
    Logger.log("❌ Error en inicialización: " + error.message);
  }
}

function escanearYNotificar() {
  try {
    const sheetVictoria = SpreadsheetApp.openById(ID_HOJA_VICTORIA).getSheetByName(NOMBRE_PESTANA_VICTORIA);
    const currentTrueLastRow = obtenerUltimaFilaReal(sheetVictoria);
    let lastProcessedRowVicStr = PropertiesService.getScriptProperties().getProperty('LAST_ROW_VICTORIA');
    
    if (!lastProcessedRowVicStr) {
      PropertiesService.getScriptProperties().setProperty('LAST_ROW_VICTORIA', currentTrueLastRow.toString());
      lastProcessedRowVicStr = currentTrueLastRow.toString();
    }
    let lastProcessedRowVic = parseInt(lastProcessedRowVicStr, 10);

    if (currentTrueLastRow > lastProcessedRowVic) {
      const numRowsNew = currentTrueLastRow - lastProcessedRowVic;
      const dataNuevosVic = sheetVictoria.getRange(lastProcessedRowVic + 1, 1, numRowsNew, sheetVictoria.getLastColumn()).getDisplayValues();
      
      for (let i = 0; i < dataNuevosVic.length; i++) {
        let solicitud = String(dataNuevosVic[i][1] || "").trim(); 
        let tipoDoc = String(dataNuevosVic[i][2] || "").trim();   
        let adjunto = String(dataNuevosVic[i][4] || "").trim();   
        
        if (solicitud !== "" && solicitud.length > 2) {
          enviarNotificacionGoogleChat("VICTORIA", solicitud, "Tipo de Documento: " + tipoDoc, adjunto);
        }
      }
      PropertiesService.getScriptProperties().setProperty('LAST_ROW_VICTORIA', currentTrueLastRow.toString());
    }
    
    const sheetCorreo = SpreadsheetApp.openById(ID_HOJA_CORREO).getSheetByName(NOMBRE_PESTANA_CORREO);
    const dataCorreo = sheetCorreo.getDisplayValues();
    
    for (let i = 1; i < dataCorreo.length; i++) {
      let notificado = String(dataCorreo[i][13] || "").trim().toUpperCase(); 
      let solicitud = String(dataCorreo[i][1] || "").trim();
      
      if (solicitud !== "" && notificado !== "NOTIFICADO") {
        let proceso = String(dataCorreo[i][3] || "").trim();
        let carpeta = String(dataCorreo[i][6] || "").trim();
        
        enviarNotificacionGoogleChat("CORREO", solicitud, "Tipo de Proceso: " + proceso, carpeta);
        sheetCorreo.getRange(i + 1, 14).setValue("NOTIFICADO"); 
      }
    }
  } catch(error) {
    Logger.log("Error en el escáner: " + error.message);
  }
}

function enviarNotificacionGoogleChat(modulo, solicitud, detalle, linkAdjunto) {
  if (!URL_WEBHOOK_GOOGLE_CHAT || URL_WEBHOOK_GOOGLE_CHAT.includes('AQUÍ_PEGA')) return;

  let titulo = (modulo === "VICTORIA") ? "Notificación de Victoria" : "Notificación de Correo";
  let subtitulo = "Se ha ingresado una nueva solicitud en " + modulo;
  let icono = (modulo === "VICTORIA") ? "https://cdn-icons-png.flaticon.com/512/4616/4616304.png" : "https://cdn-icons-png.flaticon.com/512/8899/8899109.png";
  let webAppUrl = ScriptApp.getService().getUrl();

  let botones = [{ "textButton": { "text": "Ver solicitud", "onClick": { "openLink": { "url": webAppUrl } } } }];
  if (linkAdjunto && linkAdjunto.startsWith("http")) {
    botones.push({ "textButton": { "text": "Ver Adjuntos / Carpeta", "onClick": { "openLink": { "url": linkAdjunto } } } });
  }

  let widgetsArray = [
    { "keyValue": { "topLabel": "Número de solicitud", "content": "" + solicitud, "icon": "PERSON" } },
    { "keyValue": { "topLabel": "Detalles", "content": "" + detalle, "icon": "DESCRIPTION" } },
    { "buttons": botones } 
  ];

  let message = {
    "cards": [{ "header": { "title": titulo, "subtitle": subtitulo, "imageUrl": icono, "imageStyle": "AVATAR" }, "sections": [{ "header": "Detalles del registro", "widgets": widgetsArray }] }]
  };

  UrlFetchApp.fetch(URL_WEBHOOK_GOOGLE_CHAT, { method: "POST", payload: JSON.stringify(message), contentType: "application/json", muteHttpExceptions: true });
}

function getEmailUsuario() {
  return Session.getActiveUser().getEmail();
}