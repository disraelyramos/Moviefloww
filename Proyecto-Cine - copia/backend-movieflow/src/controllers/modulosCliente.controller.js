const db = require("../config/db");   // conexión Oracle
const oracledb = require("oracledb"); // 👈 necesario para el outFormat
const xss = require("xss");

/**
 * 📌 Obtener TODOS los módulos cliente (admin view)
 */
exports.getModulosCliente = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const query = `
      SELECT 
        m.id_modulo,
        m.nombre AS modulo_nombre,
        m.icono AS modulo_icono,
        m.ruta AS modulo_ruta,
        NVL(em.activo, 1) AS modulo_activo,
        o.id_opcion,
        o.nombre AS opcion_nombre,
        o.icono AS opcion_icono,
        o.accion AS opcion_accion,
        NVL(eo.activo, 1) AS opcion_activo
      FROM modulos_cliente m
      LEFT JOIN estados_modulos_cliente em 
        ON m.id_modulo = em.id_modulo
      LEFT JOIN opciones_cliente o 
        ON m.id_modulo = o.id_modulo
      LEFT JOIN estados_opciones_cliente eo 
        ON o.id_opcion = eo.id_opcion
      ORDER BY m.id_modulo, o.id_opcion
    `;

    const result = await connection.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

    const modulos = {};
    result.rows.forEach(row => {
      const idModulo = row.ID_MODULO;

      if (!modulos[idModulo]) {
        modulos[idModulo] = {
          id_modulo: idModulo,
          nombre: xss(row.MODULO_NOMBRE),
          icono: row.MODULO_ICONO,
          ruta: row.MODULO_RUTA,
          activo: row.MODULO_ACTIVO,
          opciones: []
        };
      }

      if (row.ID_OPCION) {
        modulos[idModulo].opciones.push({
          id_opcion: row.ID_OPCION,
          nombre: xss(row.OPCION_NOMBRE),
          icono: row.OPCION_ICONO,
          accion: row.OPCION_ACCION,
          activo: row.OPCION_ACTIVO
        });
      }
    });

    res.json(Object.values(modulos));
  } catch (err) {
    console.error("Error al obtener módulos:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error("Error cerrando conexión:", err);
      }
    }
  }
};


/**
 * 📌 Obtener SOLO los módulos activos (vista cliente)
 */
exports.getMenuCliente = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const query = `
      SELECT 
        m.id_modulo,
        m.nombre AS modulo_nombre,
        m.icono AS modulo_icono,
        m.ruta AS modulo_ruta,
        o.id_opcion,
        o.nombre AS opcion_nombre,
        o.icono AS opcion_icono,
        o.accion AS opcion_accion
      FROM modulos_cliente m
      JOIN estados_modulos_cliente em 
        ON m.id_modulo = em.id_modulo AND em.activo = 1
      LEFT JOIN opciones_cliente o 
        ON m.id_modulo = o.id_modulo
      LEFT JOIN estados_opciones_cliente eo 
        ON o.id_opcion = eo.id_opcion
      WHERE (eo.activo = 1 OR eo.id_estado IS NULL)
      ORDER BY m.id_modulo, o.id_opcion
    `;

    const result = await connection.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

    const modulos = {};
    result.rows.forEach(row => {
      const idModulo = row.ID_MODULO;

      if (!modulos[idModulo]) {
        modulos[idModulo] = {
          id_modulo: idModulo,
          nombre: xss(row.MODULO_NOMBRE),
          icono: row.MODULO_ICONO,
          ruta: row.MODULO_RUTA,
          opciones: []
        };
      }

      if (row.ID_OPCION) {
        modulos[idModulo].opciones.push({
          id_opcion: row.ID_OPCION,
          nombre: xss(row.OPCION_NOMBRE),
          icono: row.OPCION_ICONO,
          accion: row.OPCION_ACCION
        });
      }
    });

    res.json(Object.values(modulos));
  } catch (err) {
    console.error("Error al obtener menú cliente:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error("Error cerrando conexión:", err);
      }
    }
  }
};


/**
 * 📌 Guardar estados de módulos y opciones (Admin)
 */
exports.guardarEstados = async (req, res) => {
  let connection;
  try {
    const { modulos, rol_id } = req.body;

    if (!Array.isArray(modulos) || modulos.length === 0) {
      return res.status(400).json({ message: "No hay datos para guardar" });
    }

    connection = await db.getConnection();

    for (const modulo of modulos) {
      const idModulo = modulo.id_modulo;
      const activoModulo = modulo.activo ? 1 : 0;

      // 🔹 Guardar estado del módulo padre
      await connection.execute(
        `
        MERGE INTO estados_modulos_cliente em
        USING (SELECT :id_modulo AS id_modulo FROM dual) src
        ON (em.id_modulo = src.id_modulo)
        WHEN MATCHED THEN 
          UPDATE SET activo = :activo, rol_id = :rol_id, fecha_modificacion = SYSDATE
        WHEN NOT MATCHED THEN
          INSERT (id_modulo, activo, rol_id, fecha_modificacion)
          VALUES (:id_modulo, :activo, :rol_id, SYSDATE)
        `,
        { id_modulo: idModulo, activo: activoModulo, rol_id }
      );

      // 🔹 Guardar estados de opciones
      if (Array.isArray(modulo.opciones)) {
        for (const op of modulo.opciones) {
          const idOp = op.id_opcion;
          const activoOp = op.activo ? 1 : 0;

          await connection.execute(
            `
            MERGE INTO estados_opciones_cliente eo
            USING (SELECT :id_opcion AS id_opcion FROM dual) src
            ON (eo.id_opcion = src.id_opcion)
            WHEN MATCHED THEN 
              UPDATE SET activo = :activo, rol_id = :rol_id, fecha_modificacion = SYSDATE
            WHEN NOT MATCHED THEN
              INSERT (id_opcion, activo, rol_id, fecha_modificacion)
              VALUES (:id_opcion, :activo, :rol_id, SYSDATE)
            `,
            { id_opcion: idOp, activo: activoOp, rol_id }
          );
        }
      }
    }

    await connection.commit();
    res.json({ success: true, message: "Estados guardados correctamente ✅" });
  } catch (err) {
    console.error("Error guardando estados:", err);
    res.status(500).json({ success: false, message: "Error guardando estados" });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error("Error cerrando conexión:", err);
      }
    }
  }
};
