const PdfPrinter = require("pdfmake");
const path = require("path");

// 🔹 Fuentes Roboto desde carpeta /fonts
const fonts = {
  Roboto: {
    normal: path.join(__dirname, "../../fonts/Roboto-Regular.ttf"),
    bold: path.join(__dirname, "../../fonts/Roboto-Medium.ttf"),
    italics: path.join(__dirname, "../../fonts/Roboto-Italic.ttf"),
    bolditalics: path.join(__dirname, "../../fonts/Roboto-MediumItalic.ttf"),
  },
};

const printer = new PdfPrinter(fonts);

// 🔒 Sanitizar texto contra XSS
// Para texto general (nombres, observaciones, etc.)
const sanitizeText = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/"/g, "")
    .replace(/'/g, "");
};

// Para fechas y números → no escapamos nada
const sanitizePlain = (str) => {
  if (!str) return "";
  return String(str);
};


// 🔹 Enviar PDF al navegador
const sendPDF = (res, docDefinition, filename = "documento.pdf") => {
  try {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    console.error("❌ Error en sendPDF:", err);
    res.status(500).json({ message: "Error al generar PDF" });
  }
};

module.exports = { printer, sanitizeText, sendPDF };
