const db = require("../../config/db");
const oracledb = require("oracledb");
const { sendPDF } = require("../../utils/pdfHelper");
const { buildDetallesVentaDoc } = require("../../pdf/detallesVenta.doc");

// Utilidad fechas
// ...imports iguales

const z = n => String(n).padStart(2, "0");
const fmtFecha = d => `${z(d.getDate())}/${z(d.getMonth()+1)}/${d.getFullYear()}`;
const fmtHora  = d => `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; // 24h
const yyyymmdd_hhmmss = d => `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;

exports.generarDetallesVentaPDF = async (req, res) => {
  let cn;
  try {
    const { filtros = {}, rows, total } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "No hay filas para exportar." });
    }

    cn = await db.getConnection();

    // Negocio
    const rsNeg = await cn.execute(
      `SELECT NOMBRE_CINE, DIRECCION, TELEFONO, CORREO
         FROM CONFIGURACION_NEGOCIO
        WHERE ROWNUM = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const negocio = rsNeg.rows?.[0] || {};

    // ← Solo si falta el nombre del vendedor, lo completamos por ID
    if (!filtros.vendedorNombre && filtros.vendedorId) {
      const rsVend = await cn.execute(
        `SELECT NOMBRE FROM USUARIOS WHERE ID = :id`,
        { id: Number(filtros.vendedorId) || 0 },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (rsVend.rows?.[0]?.NOMBRE) filtros.vendedorNombre = rsVend.rows[0].NOMBRE;
    }

    const now = new Date();
    const payload = {
      nowFecha: fmtFecha(now),
      nowHora:  fmtHora(now), // ← 24h fijo
      filtros,
      rows,
      total: Number(total || 0),
    };

    const doc = buildDetallesVentaDoc(negocio, payload);
    const fname = `detalles_venta_${yyyymmdd_hhmmss(now)}.pdf`;
    sendPDF(res, doc, fname);
  } catch (err) {
    console.error("❌ Error generarDetallesVentaPDF:", err);
    return res.status(500).json({ message: "Error al generar PDF." });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};
