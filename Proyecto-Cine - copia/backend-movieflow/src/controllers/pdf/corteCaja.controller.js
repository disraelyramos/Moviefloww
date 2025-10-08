const db = require("../../config/db");
const oracledb = require("oracledb");
const { sendPDF } = require("../../utils/pdfHelper");
const { buildCorteCajaDoc } = require("../../pdf/corteCaja.doc");

const generarCorteCajaPDF = async (req, res) => {
  let connection;
  try {
    let { id_cierre } = req.params;
    id_cierre = parseInt(id_cierre, 10);
    if (!Number.isFinite(id_cierre) || id_cierre <= 0) {
      return res.status(400).json({ message: "ID de cierre inválido" });
    }

    connection = await db.getConnection();

    // 1) Negocio
    const negocioResult = await connection.execute(
      `SELECT NOMBRE_CINE, DIRECCION, TELEFONO, CORREO
         FROM CONFIGURACION_NEGOCIO
        WHERE ROWNUM = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const negocio = negocioResult.rows[0] || {};

    // 2) Cabecera del cierre (usa columnas reales)
    const corteResult = await connection.execute(
      `
      SELECT
        CC.NUMERO_TICKET                             AS NUMERO_TICKET,
        TO_CHAR(CC.FECHA_CIERRE,'DD/MM/YYYY')        AS FECHA,
        TO_CHAR(CC.HORA_CIERRE,'HH24:MI')            AS HORA,
        U.NOMBRE                                     AS CAJERO,
        C.NOMBRE_CAJA                                AS CAJA,
        CC.MONTO_APERTURA                            AS MONTO_APERTURA,
        CC.MONTO_VENTAS                              AS MONTO_VENTAS,
        CC.MONTO_ESPERADO                            AS MONTO_ESPERADO,
        CC.MONTO_CONTADO                             AS MONTO_CONTADO,
        CC.OBSERVACIONES                             AS OBSERVACIONES
      FROM CIERRE_CAJA CC
      JOIN APERTURA_CAJA A ON A.ID_APERTURA = CC.APERTURA_ID
      JOIN USUARIOS U      ON U.ID = CC.USUARIO_ID
      JOIN CAJAS C         ON C.ID_CAJA = A.CAJA_ID
      WHERE CC.ID_CIERRE = :ID
      `,
      { ID: id_cierre },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const corte = corteResult.rows[0];
    if (!corte) return res.status(404).json({ message: "Cierre de caja no encontrado" });

    // 3) Denominaciones
    const denomResult = await connection.execute(
      `
      SELECT
        D.VALOR     AS DENOMINACION,
        CD.CANTIDAD AS CANTIDAD,
        CD.SUBTOTAL AS SUBTOTAL
      FROM CIERRE_DENOMINACION CD
      JOIN DENOMINACIONES D ON D.ID_DENOMINACION = CD.DENOMINACION_ID
      WHERE CD.CIERRE_ID = :ID
      ORDER BY D.VALOR DESC
      `,
      { ID: id_cierre },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const denominaciones = denomResult.rows || [];

    // 4) Armar objeto que espera el doc
    const corteDoc = {
      NUMERO_TICKET: corte.NUMERO_TICKET || "",
      FECHA: corte.FECHA || "",
      HORA: corte.HORA || "",
      CAJERO: corte.CAJERO || "",
      CAJA: corte.CAJA || "",
      MONTO_APERTURA: Number(corte.MONTO_APERTURA || 0),
      TOTAL_VENTAS: Number(corte.MONTO_VENTAS || 0),
      MONTO_ESPERADO: Number(corte.MONTO_ESPERADO || 0),
      TOTAL_CONTADO: Number(corte.MONTO_CONTADO || 0),
      OBSERVACIONES: corte.OBSERVACIONES || ""
    };

    // 5) Generar y enviar PDF
    const docDefinition = buildCorteCajaDoc(negocio, corteDoc, denominaciones);
    const ticket = corteDoc.NUMERO_TICKET ? `_ticket_${corteDoc.NUMERO_TICKET}` : "";
    sendPDF(res, docDefinition, `corte_caja${ticket}.pdf`);
  } catch (error) {
    console.error("❌ Error generando PDF de corte de caja:", error);
    res.status(500).json({ message: "Error generando PDF" });
  } finally {
    if (connection) { try { await connection.close(); } catch {} }
  }
};

module.exports = { generarCorteCajaPDF };
