// controllers/inventario/productoPorLote.controller.js
const db = require('../../config/db');
const oracledb = require('oracledb');
const xss = require('xss');


// Asume que ya tienes importados: const db = require('.../config/db'); const oracledb = require('oracledb');

exports.crearProductoPorLote = async (req, res) => {
  let { productoId, loteId, cantidad, fechaVencimiento } = req.body;

  // ---- Helpers fecha ----
  const toISO = (val) => {
    if (!val) return "";
    const s = String(val).trim();
    if (s.includes("-")) return s; // asume YYYY-MM-DD válido
    // DD/MM/YYYY -> YYYY-MM-DD
    const [d, m, y] = s.split("/");
    if (d && m && y) return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return s;
  };

  const normalizeAndCheckFuture = (val) => {
    const iso = toISO(val);
    if (!iso) return { iso: "", date: null };
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return { error: "Formato de fecha inválido. Use 'YYYY-MM-DD' o 'DD/MM/YYYY'." };
    }
    // Comparar solo fecha (sin hora)
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    if (d < hoy) {
      return { error: "La fecha de vencimiento no puede ser anterior a hoy." };
    }
    return { iso, date: d };
  };

  // Sanitizar / normalizar ids y cantidad
  productoId = Number(productoId) || null;
  loteId = Number(loteId) || null;
  cantidad = Number(cantidad) || 0;
  fechaVencimiento = fechaVencimiento?.toString().trim() || "";

  // Validaciones rápidas
  if (!productoId) return res.status(400).json({ message: "productoId es requerido." });
  if (!loteId) return res.status(400).json({ message: "loteId es requerido." });
  if (!(cantidad > 0)) return res.status(400).json({ message: "cantidad debe ser mayor a 0." });

  // Validación de fecha (si viene)
  let fvISO = "";
  if (fechaVencimiento) {
    const chk = normalizeAndCheckFuture(fechaVencimiento);
    if (chk.error) return res.status(400).json({ message: chk.error });
    fvISO = chk.iso; // 'YYYY-MM-DD'
  }

  let conn;
  try {
    conn = await db.getConnection();

    // 1) Existen las FKs?
    const [prod, lote] = await Promise.all([
      conn.execute(
        `SELECT 1 FROM PRODUCTO_NUEVO WHERE ID = :id`,
        { id: productoId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
      conn.execute(
        `SELECT 1 FROM PRODUCTO_LOTE WHERE ID = :id`,
        { id: loteId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
    ]);

    if (prod.rows.length === 0) return res.status(404).json({ message: "Producto no existe." });
    if (lote.rows.length === 0) return res.status(404).json({ message: "Lote no existe." });

    // 2) ¿Ya existe la pareja PRODUCTO_ID + LOTE_ID?
    const existente = await conn.execute(
      `SELECT ID_POR_LOTE,
              CANTIDAD_DISPONIBLE,
              TO_CHAR(FECHA_VENCIMIENTO,'YYYY-MM-DD') AS FV
         FROM PRODUCTO_POR_LOTE
        WHERE PRODUCTO_ID = :p AND LOTE_ID = :l`,
      { p: productoId, l: loteId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (existente.rows.length > 0) {
      // 🔁 Existe: sumamos cantidad y opcionalmente actualizamos fecha
      const row = existente.rows[0];
      const idPorLote = row.ID_POR_LOTE;

      const campos = [`CANTIDAD_DISPONIBLE = CANTIDAD_DISPONIBLE + :delta`];
      const binds = { delta: cantidad, id: idPorLote };

      if (fvISO) {
        campos.push(`FECHA_VENCIMIENTO = TO_DATE(:fv, 'YYYY-MM-DD')`);
        binds.fv = fvISO;
      }

      await conn.execute(
        `UPDATE PRODUCTO_POR_LOTE
            SET ${campos.join(", ")}
          WHERE ID_POR_LOTE = :id`,
        binds,
        { autoCommit: true }
      );

      return res.status(200).json({
        message: "Cantidad actualizada para el producto-lote.",
        idPorLote,
        agregado: cantidad,
        fechaVencimiento: fvISO || row.FV,
      });

    } else {
      // ➕ No existe: crear (SQL estático, siempre :fv; si no hay fecha, va null)
      const result = await conn.execute(
        `INSERT INTO PRODUCTO_POR_LOTE
           (PRODUCTO_ID, LOTE_ID, FECHA_VENCIMIENTO, CANTIDAD_DISPONIBLE, FECHA_INGRESO)
         VALUES
           (:p, :l, TO_DATE(:fv, 'YYYY-MM-DD'), :cant, TRUNC(SYSDATE))
         RETURNING ID_POR_LOTE INTO :id`,
        {
          p: productoId,
          l: loteId,
          fv: fvISO || null, // 👈 si no hay fecha, mandar null
          cant: cantidad,
          id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: true }
      );

      return res.status(201).json({
        message: "Producto por lote creado.",
        idPorLote: result.outBinds.id[0],
      });
    }
  } catch (err) {
    if (err?.errorNum === 1) {
      // Unique (si hay índice único por PRODUCTO_ID+LOTE_ID)
      return res.status(409).json({ message: "Ya existe un registro para este PRODUCTO y LOTE." });
    }
    console.error("❌ Error crear PRODUCTO_POR_LOTE:", err);
    return res.status(500).json({ message: "Error al registrar producto por lote." });
  } finally {
    if (conn) await conn.close();
  }
};



// PUT /producto-por-lote/:id
exports.actualizarProductoPorLote = async (req, res) => {
  const id = Number(req.params.id) || null;
  if (!id) return res.status(400).json({ message: 'ID de producto-por-lote inválido.' });

  let { cantidad, fechaVencimiento } = req.body;

  const sets  = [];
  const binds = { id };

  // cantidad (DELTA) OPCIONAL: si viene, se suma, debe ser > 0
  if (cantidad !== undefined) {
    const delta = Number(cantidad);
    if (Number.isNaN(delta) || delta <= 0) {
      return res.status(400).json({ message: 'Si envías cantidad (delta), debe ser mayor a 0.' });
    }
    sets.push('CANTIDAD_DISPONIBLE = CANTIDAD_DISPONIBLE + :delta');
    binds.delta = delta;
  }

  // fechaVencimiento:
  //  - omitida   -> no tocar
  //  - ''        -> limpiar (NULL)
  //  - 'YYYY-MM-DD' -> actualizar
  if (fechaVencimiento === '') {
    sets.push('FECHA_VENCIMIENTO = NULL');
  } else if (fechaVencimiento) {
    sets.push("FECHA_VENCIMIENTO = TO_DATE(:fv, 'YYYY-MM-DD')");
    binds.fv = fechaVencimiento;
  }

  if (sets.length === 0) {
    return res.json({ message: 'Sin cambios.', id });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.execute(
      `UPDATE PRODUCTO_POR_LOTE
          SET ${sets.join(', ')}
        WHERE ID_POR_LOTE = :id`,
      binds,
      { autoCommit: true }
    );

    const resp = { message: 'Actualizado', id };
    if (binds.delta !== undefined) resp.agregado = binds.delta;
    if (fechaVencimiento === '') resp.fechaVencimiento = null;
    if (fechaVencimiento) resp.fechaVencimiento = fechaVencimiento;

    return res.json(resp);
  } catch (err) {
    console.error('❌ Error actualizarProductoPorLote:', err);
    return res.status(500).json({ message: 'Error al actualizar producto por lote.' });
  } finally {
    if (conn) await conn.close();
  }
};


// GET /producto-por-lote?productoId=123
exports.listarPorProducto = async (req, res) => {
  const productoId = Number(req.query.productoId) || null;
  if (!productoId) {
    return res.status(400).json({ message: 'productoId es requerido.' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `
      SELECT
        ppl.ID_POR_LOTE                    AS ID,
        ppl.PRODUCTO_ID                    AS PRODUCTO_ID,
        ppl.LOTE_ID                        AS LOTE_ID,
        l.CODIGO_LOTE                      AS CODIGO_LOTE,
        l.NOMBRE                           AS NOMBRE_LOTE,
        TO_CHAR(ppl.FECHA_VENCIMIENTO, 'DD/MM/YYYY') AS FECHA_VENCIMIENTO,
        ppl.CANTIDAD_DISPONIBLE            AS CANTIDAD,
        TO_CHAR(ppl.FECHA_INGRESO, 'DD/MM/YYYY')     AS FECHA_INGRESO
      FROM PRODUCTO_POR_LOTE ppl
      JOIN PRODUCTO_LOTE l ON l.ID = ppl.LOTE_ID
      WHERE ppl.PRODUCTO_ID = :pid
      ORDER BY ppl.ID_POR_LOTE
      `,
      { pid: productoId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Normaliza a camelCase para el front
    const data = result.rows.map(r => ({
      id: r.ID,
      productoId: r.PRODUCTO_ID,
      loteId: r.LOTE_ID,
      codigoLote: r.CODIGO_LOTE,
      nombreLote: r.NOMBRE_LOTE,
      fechaVencimiento: r.FECHA_VENCIMIENTO, // DD/MM/YYYY
      cantidad: r.CANTIDAD,
      fechaIngreso: r.FECHA_INGRESO,         // DD/MM/YYYY
    }));

    res.json(data);
  } catch (err) {
    console.error('❌ Error listarPorProducto:', err);
    res.status(500).json({ message: 'Error al obtener lotes del producto.' });
  } finally {
    if (conn) await conn.close();
  }
};
