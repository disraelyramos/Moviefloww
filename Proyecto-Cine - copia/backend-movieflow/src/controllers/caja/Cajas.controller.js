const db = require("../../config/db");
const oracledb = require("oracledb");

// 🔹 Consultar el último estado de la caja de un usuario
// 🔹 Consultar el último estado de la caja de un usuario
exports.getEstadoCajaPorUsuario = async (req, res) => {
  let connection;
  const { usuario_id } = req.query;

  try {
    if (!usuario_id) {
      return res.status(400).json({ message: "usuario_id es requerido" });
    }

    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT ac.id_apertura,
              ac.caja_id,
              c.nombre_caja,
              ac.turno_id,
              ac.estado_id,
              e.nombre_estado
       FROM apertura_caja ac
       JOIN cajas c ON ac.caja_id = c.id_caja
       JOIN estado_caja e ON ac.estado_id = e.id_estado
       WHERE ac.usuario_id = :usuario_id
       ORDER BY ac.id_apertura DESC
       FETCH FIRST 1 ROWS ONLY`,
      { usuario_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.json({
        abierta: false,
        message: "El usuario no tiene ninguna caja abierta actualmente"
      });
    }

    const datos = result.rows[0];
    const abierta = datos.ESTADO_ID === 1;

    res.json({
      abierta,
      datos
    });
  } catch (error) {
    console.error("❌ Error consultando estado de caja:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) await connection.close();
  }
};
