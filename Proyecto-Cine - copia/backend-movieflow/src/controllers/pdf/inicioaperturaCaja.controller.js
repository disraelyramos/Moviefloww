const db = require("../../config/db");
const oracledb = require("oracledb");
const { sendPDF } = require("../../utils/pdfHelper");
const { buildAperturaCajaDoc } = require("../../pdf/inicioaperturaCaja.doc");

//
// 🔹 Generar PDF de apertura de caja
//
const generarAperturaCajaPDF = async (req, res) => {
  let connection;
  try {
    let { id_apertura } = req.params;

    // 🔒 Validación estricta
    id_apertura = parseInt(id_apertura, 10);
    if (isNaN(id_apertura) || id_apertura <= 0) {
      return res.status(400).json({ message: "ID de apertura inválido" });
    }

    connection = await db.getConnection();

    // 1️⃣ Datos del negocio (encabezado)
    const negocioResult = await connection.execute(
      `SELECT nombre_cine, direccion, telefono, correo
         FROM configuracion_negocio
        WHERE ROWNUM = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const negocio = negocioResult.rows[0] || {};

    // 2️⃣ Datos de la apertura
    const aperturaResult = await connection.execute(
      `SELECT a.numero_ticket,
              TO_CHAR(a.fecha_apertura, 'DD/MM/YYYY') AS fecha,
              TO_CHAR(a.hora_apertura, 'HH24:MI') AS hora,
              u.nombre AS cajero,
              c.nombre_caja AS caja,
              t.nombre_turno AS turno,
              a.total_efectivo_inicial,
              a.observaciones
         FROM apertura_caja a
         JOIN usuarios u ON a.usuario_id = u.id
         JOIN cajas c ON a.caja_id = c.id_caja
         JOIN turnos t ON a.turno_id = t.id_turno
        WHERE a.id_apertura = :id`,
      { id: id_apertura },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const apertura = aperturaResult.rows[0];
    if (!apertura) {
      return res.status(404).json({ message: "Apertura de caja no encontrada" });
    }

    // 3️⃣ Denominaciones
    const denomResult = await connection.execute(
      `SELECT d.valor AS denominacion,
              ad.cantidad,
              ad.subtotal
         FROM apertura_denominacion ad
         JOIN denominaciones d ON ad.denominacion_id = d.id_denominacion
        WHERE ad.apertura_id = :id
        ORDER BY d.valor DESC`,
      { id: id_apertura },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const denominaciones = denomResult.rows || [];

    // 4️⃣ Construir docDefinition
    const docDefinition = buildAperturaCajaDoc(negocio, apertura, denominaciones);

    // 5️⃣ Enviar PDF al navegador
    sendPDF(res, docDefinition, `apertura_caja_${apertura.NUMERO_TICKET}.pdf`);
  } catch (error) {
    console.error("❌ Error generando PDF de apertura de caja:", error);
    res.status(500).json({ message: "Error generando PDF" });
  } finally {
    if (connection) await connection.close();
  }
};

module.exports = { generarAperturaCajaPDF };
