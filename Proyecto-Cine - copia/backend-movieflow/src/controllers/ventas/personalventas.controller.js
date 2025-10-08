// controllers/ventas/personalventas.controller.js
const db = require("../../config/db");
const oracledb = require("oracledb");

/* =========================
 * LISTAR PRODUCTOS (VENTAS)
 * ========================= */
exports.listarProductos = async (_req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const query = `
      SELECT 
        p.ID,
        p.NOMBRE,
        p.PRECIO_VENTA,
        p.IMAGEN,
        p.ESTADO_ID,
        u.NOMBRE AS UNIDAD_MEDIDA,
        c.NOMBRE AS CATEGORIA_NOMBRE,
        /* agregados desde PRODUCTO_POR_LOTE */
        NVL(agg.STOCK_TOTAL, 0)              AS STOCK_TOTAL,
        TO_CHAR(agg.PROX_VENC,'DD/MM/YYYY')  AS PROX_VENC,
        /* último estado dinámico */
        (
          SELECT pe.ESTADO
          FROM PRODUCTO_ESTADO pe
          WHERE pe.PRODUCTO_ID = p.ID
          ORDER BY pe.FECHA_REGISTRO DESC
          FETCH FIRST 1 ROWS ONLY
        ) AS ESTADO_DIN
      FROM PRODUCTO_NUEVO p
      JOIN UNIDAD_MEDIDA u      ON u.ID = p.UNIDAD_MEDIDA_ID
      JOIN CATEGORIAPRODUCTO c  ON c.ID = p.CATEGORIA_ID
      LEFT JOIN (
        SELECT PRODUCTO_ID,
               NVL(SUM(CANTIDAD_DISPONIBLE),0) AS STOCK_TOTAL,
               MIN(FECHA_VENCIMIENTO)          AS PROX_VENC
        FROM PRODUCTO_POR_LOTE
        GROUP BY PRODUCTO_ID
      ) agg ON agg.PRODUCTO_ID = p.ID
      WHERE p.ESTADO_ID = :estado_activo
      ORDER BY p.NOMBRE
    `;

    const result = await connection.execute(
      query,
      { estado_activo: 1 },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const productos = result.rows.map((row) => {
      let alerta = null;
      switch (row.ESTADO_DIN) {
        case "VENCIDO":     alerta = "Producto vencido - no disponible"; break;
        case "POR_VENCER":  alerta = "Producto por vencer - revisar";    break;
        case "BLOQUEADO":   alerta = "Producto no disponible";           break;
        case "STOCK_BAJO":  alerta = "Stock bajo - pronto se agotará";   break;
        default: break;
      }
      return {
        id: row.ID,
        nombre: row.NOMBRE,
        precio: Number(row.PRECIO_VENTA),
        cantidad: Number(row.STOCK_TOTAL || 0),
        fecha_vencimiento: row.PROX_VENC || "N/A",
        imagen: row.IMAGEN,
        unidad_medida: row.UNIDAD_MEDIDA,
        estado: row.ESTADO_DIN || "DISPONIBLE",
        categoriaNombre: row.CATEGORIA_NOMBRE,
        activo: row.ESTADO_ID === 1,
        alerta,
      };
    });

    res.json(productos);
  } catch (error) {
    console.error("Error consultando productos para ventas:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) try { await connection.close(); } catch {}
  }
};

/* =============================
 *  OBTENER PRODUCTO (detalle)
 * ============================= */
exports.obtenerProducto = async (req, res) => {
  let connection;
  const { id } = req.params;
  try {
    connection = await db.getConnection();

    const query = `
      SELECT 
        p.ID,
        p.NOMBRE,
        p.PRECIO_VENTA,
        p.IMAGEN,
        p.ESTADO_ID,
        u.NOMBRE AS UNIDAD_MEDIDA,
        c.NOMBRE AS CATEGORIA_NOMBRE,
        NVL(agg.STOCK_TOTAL, 0)              AS STOCK_TOTAL,
        TO_CHAR(agg.PROX_VENC,'DD/MM/YYYY')  AS PROX_VENC,
        (
          SELECT pe.ESTADO
          FROM PRODUCTO_ESTADO pe
          WHERE pe.PRODUCTO_ID = p.ID
          ORDER BY pe.FECHA_REGISTRO DESC
          FETCH FIRST 1 ROWS ONLY
        ) AS ESTADO_DIN
      FROM PRODUCTO_NUEVO p
      JOIN UNIDAD_MEDIDA u      ON u.ID = p.UNIDAD_MEDIDA_ID
      JOIN CATEGORIAPRODUCTO c  ON c.ID = p.CATEGORIA_ID
      LEFT JOIN (
        SELECT PRODUCTO_ID,
               NVL(SUM(CANTIDAD_DISPONIBLE),0) AS STOCK_TOTAL,
               MIN(FECHA_VENCIMIENTO)          AS PROX_VENC
        FROM PRODUCTO_POR_LOTE
        GROUP BY PRODUCTO_ID
      ) agg ON agg.PRODUCTO_ID = p.ID
      WHERE p.ID = :id
    `;

    const r = await connection.execute(
      query,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const row = r.rows[0];
    res.json({
      id: row.ID,
      nombre: row.NOMBRE,
      precio: Number(row.PRECIO_VENTA),
      cantidad: Number(row.STOCK_TOTAL || 0),
      fecha_vencimiento: row.PROX_VENC || "N/A",
      imagen: row.IMAGEN,
      unidad_medida: row.UNIDAD_MEDIDA,
      estado: row.ESTADO_DIN || "DISPONIBLE",
      categoriaNombre: row.CATEGORIA_NOMBRE,
      activo: row.ESTADO_ID === 1,
    });
  } catch (error) {
    console.error("❌ Error obteniendo producto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) try { await connection.close(); } catch {}
  }
};

/* ================
 *  PROCESAR VENTA
 * ================ */
exports.procesarVenta = async (req, res) => {
  let connection;
  try {
    const { usuario_id, caja_id, dinero_recibido, carrito } = req.body;

    if (!usuario_id || !caja_id || dinero_recibido == null || !carrito || carrito.length === 0) {
      return res.status(400).json({ message: "Datos de venta incompletos" });
    }

    // 🔎 Separar líneas de PRODUCTO y de COMBO (detección robusta)
    const productosItems = [];
    const combosItems    = [];
    for (const it of carrito) {
      const esCombo = (it.combo_id != null) || String(it?.tipo || "").toUpperCase() === "COMBO";
      if (esCombo) {
        combosItems.push({
          combo_id: Number(it.combo_id ?? it.id),
          cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario ?? it.precio),
        });
      } else {
        productosItems.push({
          producto_id: Number(it.producto_id ?? it.id),
          cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario ?? it.precio),
        });
      }
    }

    connection = await db.getConnection();

    // 0) Caja abierta (estado_id = 1)
    const cajaAbierta = await connection.execute(
      `SELECT COUNT(*) AS TOTAL
         FROM APERTURA_CAJA
        WHERE USUARIO_ID = :usuario_id
          AND CAJA_ID = :caja_id
          AND ESTADO_ID = 1`,
      { usuario_id, caja_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (Number(cajaAbierta.rows[0]?.TOTAL || 0) === 0) {
      return res.status(400).json({ message: "❌ No tienes ninguna caja abierta para procesar la venta" });
    }

    /* 1) Validaciones previas de stock (optimistas, sin bloquear) */

    // 1.1 Productos sueltos: stock agregado por lotes + regla sanitaria
    for (const item of productosItems) {
      // a) estado sanitario
      const est = await connection.execute(
        `SELECT ESTADO FROM (
           SELECT pe.ESTADO
             FROM PRODUCTO_ESTADO pe
            WHERE pe.PRODUCTO_ID = :pid
            ORDER BY pe.FECHA_REGISTRO DESC
         ) WHERE ROWNUM = 1`,
        { pid: item.producto_id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const estadoDin = String(est.rows[0]?.ESTADO || '').toUpperCase();
      if (estadoDin === 'VENCIDO' || estadoDin === 'BLOQUEADO') {
        return res.status(400).json({
          message: `❌ No se puede vender: el producto está ${estadoDin}.`
        });
      }

      // b) stock total por lotes
      const r = await connection.execute(
        `SELECT NVL(SUM(CANTIDAD_DISPONIBLE),0) AS STOCK
           FROM PRODUCTO_POR_LOTE
          WHERE PRODUCTO_ID = :id`,
        { id: item.producto_id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const stock = Number(r.rows[0].STOCK || 0);
      if (item.cantidad > stock) {
        const n = await connection.execute(
          `SELECT NOMBRE FROM PRODUCTO_NUEVO WHERE ID = :id`,
          { id: item.producto_id }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const nom = n.rows[0]?.NOMBRE || `ID ${item.producto_id}`;
        return res.status(409).json({
          message: `❌ Stock insuficiente para "${nom}". Disponible: ${stock}, solicitado: ${item.cantidad}`
        });
      }
    }

    // 1.2 Combos: validar cabecera y componentes (estado + stock)
    for (const c of combosItems) {
      const rCombo = await connection.execute(
        `SELECT CANTIDAD_DISPONIBLE, ESTADO_ID
           FROM COMBO WHERE ID = :id`,
        { id: c.combo_id }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (!rCombo.rows.length) {
        return res.status(400).json({ message: `❌ Combo ${c.combo_id} no existe.` });
      }
      const { CANTIDAD_DISPONIBLE, ESTADO_ID } = rCombo.rows[0];
      if (Number(ESTADO_ID) !== 1) {
        return res.status(400).json({ message: "❌ El combo no está activo." });
      }
      if (Number(CANTIDAD_DISPONIBLE) < Number(c.cantidad)) {
        return res.status(409).json({
          message: `❌ Stock insuficiente del combo. Disponible: ${CANTIDAD_DISPONIBLE}, solicitado: ${c.cantidad}`
        });
      }

      // Componentes
      const det = await connection.execute(
        `SELECT d.PRODUCTO_ID,
                d.CANTIDAD,
                p.NOMBRE AS PRODUCTO_NOMBRE,
                (SELECT pe.ESTADO
                   FROM PRODUCTO_ESTADO pe
                  WHERE pe.PRODUCTO_ID = p.ID
                  ORDER BY pe.FECHA_REGISTRO DESC
                  FETCH FIRST 1 ROWS ONLY) AS ESTADO_DIN
           FROM DETALLE_COMBO d
           JOIN PRODUCTO_NUEVO p ON p.ID = d.PRODUCTO_ID
          WHERE d.COMBO_ID = :id`,
        { id: c.combo_id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      for (const d of det.rows) {
        const prodId    = Number(d.PRODUCTO_ID);
        const prodName  = d.PRODUCTO_NOMBRE || `ID ${prodId}`;
        const estadoDin = String(d.ESTADO_DIN || '').toUpperCase();

        if (estadoDin === 'VENCIDO' || estadoDin === 'BLOQUEADO') {
          return res.status(400).json({
            message: `❌ No se puede vender: el producto "${prodName}" está ${estadoDin}.`
          });
        }

        const requerido = Number(d.CANTIDAD) * Number(c.cantidad);
        const rStock = await connection.execute(
          `SELECT NVL(SUM(CANTIDAD_DISPONIBLE),0) AS STOCK
             FROM PRODUCTO_POR_LOTE
            WHERE PRODUCTO_ID = :pid`,
          { pid: prodId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const disponible = Number(rStock.rows[0].STOCK || 0);

        if (requerido > disponible) {
          return res.status(409).json({
            message: `❌ Stock insuficiente para "${prodName}". Requerido: ${requerido}, disponible: ${disponible}`
          });
        }
      }
    }

    // 2) Total preliminar y cambio preliminar
    const totalPre = carrito.reduce(
      (acc, it) => acc + Number(it.cantidad) * Number(it.precio_unitario ?? it.precio),
      0
    );
    if (Number(dinero_recibido) < totalPre) {
      return res.status(400).json({ message: "Dinero recibido insuficiente." });
    }

    // 3) Ticket mediante SEQUENCE (evita MAX+1)
// 3) Ticket mediante SEQUENCE (evita MAX+1)
const ticketSeq = await connection.execute(
  `SELECT LPAD(TO_CHAR(SEQ_TICKET_VENTAS.NEXTVAL), 6, '0') AS NUEVO_TICKET FROM DUAL`,
  [],
  { outFormat: oracledb.OUT_FORMAT_OBJECT }
);
const codigo_ticket = ticketSeq.rows[0].NUEVO_TICKET;


    // 4) Insert venta (estado provisoriamente 2, ajustaremos total/cambio luego)
    const ventaResult = await connection.execute(
      `INSERT INTO VENTAS (USUARIO_ID, CAJA_ID, DINERO_RECIBIDO, CAMBIO, TOTAL, ESTADO_ID, CODIGO_TICKET, FECHA_CREACION)
       VALUES (:usuario_id, :caja_id, :dinero_recibido, 0, 0, 2, :codigo_ticket, SYSTIMESTAMP)
       RETURNING ID_VENTA INTO :id_venta`,
      {
        usuario_id,
        caja_id,
        dinero_recibido: Number(dinero_recibido),
        codigo_ticket,
        id_venta: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    const id_venta = ventaResult.outBinds.id_venta[0];

    // 🔧 Helper FEFO con update condicional y límite de reintentos
    const consumirPorFEFO = async (productoId, cantidadReq, origen) => {
      let restante = Number(cantidadReq);
      let intentos = 0;

      while (restante > 0) {
        if (++intentos > 50) {
          const err = new Error(`Stock agotado durante el cobro para producto ${productoId}`);
          err.code = "STOCK_CONFLICT";
          throw err;
        }

        // Lote FEFO
        const lotes = await connection.execute(
          `SELECT ID_POR_LOTE, CANTIDAD_DISPONIBLE
             FROM PRODUCTO_POR_LOTE
            WHERE PRODUCTO_ID = :pid
              AND CANTIDAD_DISPONIBLE > 0
            ORDER BY FECHA_VENCIMIENTO ASC NULLS LAST, FECHA_INGRESO ASC, ID_POR_LOTE ASC
            FETCH FIRST 1 ROWS ONLY`,
          { pid: productoId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (lotes.rows.length === 0) {
          const err = new Error(`Inconsistencia: sin lotes disponibles para producto ${productoId}`);
          err.code = "STOCK_CONFLICT";
          throw err;
        }

        const { ID_POR_LOTE, CANTIDAD_DISPONIBLE } = lotes.rows[0];
        const usar = Math.min(restante, Number(CANTIDAD_DISPONIBLE));

        // Update condicional (evita carrera)
        const upd = await connection.execute(
          `UPDATE PRODUCTO_POR_LOTE
              SET CANTIDAD_DISPONIBLE = CANTIDAD_DISPONIBLE - :usar
            WHERE ID_POR_LOTE = :id
              AND CANTIDAD_DISPONIBLE >= :usar`,
          { usar, id: ID_POR_LOTE }
        );

        if ((upd.rowsAffected || 0) === 0) {
          // otro proceso consumió ese lote -> reintentar
          continue;
        }

        // Traza por lote
        await connection.execute(
          `INSERT INTO DETALLE_VENTA_LOTE
             (ID_VENTA, PRODUCTO_ID, ID_POR_LOTE, CANTIDAD, ORIGEN)
           VALUES
             (:id_venta, :producto_id, :id_por_lote, :cantidad, :origen)`,
          {
            id_venta,
            producto_id: productoId,
            id_por_lote: ID_POR_LOTE,
            cantidad: usar,
            origen
          }
        );

        restante -= usar;
      }
    };

    // 5.1 Productos sueltos
    for (const item of productosItems) {
      const cantidadSolicitada = Number(item.cantidad);
      const precioUnitario     = Number(item.precio_unitario);
      const subtotal           = cantidadSolicitada * precioUnitario;

      await connection.execute(
        `INSERT INTO DETALLE_VENTA (ID_VENTA, PRODUCTO_ID, CANTIDAD, PRECIO_UNITARIO, SUBTOTAL_LINEA)
         VALUES (:id_venta, :producto_id, :cantidad, :precio_unitario, :subtotal)`,
        { id_venta, producto_id: item.producto_id, cantidad: cantidadSolicitada, precio_unitario: precioUnitario, subtotal }
      );

      await consumirPorFEFO(item.producto_id, cantidadSolicitada, 'PRODUCTO');
    }

    // 5.2 Combos (descuento de combo + componentes) con UPDATE condicional
    for (const c of combosItems) {
      const cantidadCombo = Number(c.cantidad);
      const precioUnit    = Number(c.precio_unitario);
      const subtotal      = cantidadCombo * precioUnit;

      await connection.execute(
        `INSERT INTO VENTA_COMBO (ID_VENTA, COMBO_ID, CANTIDAD, PRECIO_UNITARIO, SUBTOTAL_LINEA)
         VALUES (:id_venta, :combo_id, :cantidad, :precio_unitario, :subtotal)`,
        { id_venta, combo_id: c.combo_id, cantidad: cantidadCombo, precio_unitario: precioUnit, subtotal }
      );

      // Descuento atómico de la cabecera del combo
      const upd = await connection.execute(
        `UPDATE COMBO
            SET CANTIDAD_DISPONIBLE = CANTIDAD_DISPONIBLE - :cant
          WHERE ID = :id
            AND CANTIDAD_DISPONIBLE >= :cant`,
        { cant: cantidadCombo, id: c.combo_id }
      );
      if ((upd.rowsAffected || 0) === 0) {
        await connection.rollback();
        return res.status(409).json({
          message: `Stock insuficiente del combo durante el cobro.`
        });
      }

      // Descontar componentes por FEFO
      const det = await connection.execute(
        `SELECT PRODUCTO_ID, CANTIDAD
           FROM DETALLE_COMBO
          WHERE COMBO_ID = :id`,
        { id: c.combo_id }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      for (const d of det.rows) {
        const prodId = Number(d.PRODUCTO_ID);
        const req    = Number(d.CANTIDAD) * cantidadCombo;
        if (req > 0) {
          await consumirPorFEFO(prodId, req, 'COMBO');
        }
      }
    }

    // 5.3 Recalcular total exacto y validar dinero recibido
    const totRs = await connection.execute(
      `SELECT NVL((SELECT SUM(SUBTOTAL_LINEA) FROM DETALLE_VENTA WHERE ID_VENTA = :id),0)
            + NVL((SELECT SUM(SUBTOTAL_LINEA) FROM VENTA_COMBO   WHERE ID_VENTA = :id),0) AS TOTAL
         FROM DUAL`,
      { id: id_venta }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const totalBD  = Number(totRs.rows[0].TOTAL || 0);
    const cambioBD = Number(dinero_recibido) - totalBD;

    if (cambioBD < 0) {
      await connection.rollback();
      return res.status(400).json({
        message: `Dinero recibido insuficiente tras recalcular el total.`
      });
    }

    await connection.execute(
      `UPDATE VENTAS SET TOTAL = :total, CAMBIO = :cambio WHERE ID_VENTA = :id`,
      { total: totalBD, cambio: cambioBD, id: id_venta }
    );

    await connection.commit();

    // 6) Resumen (productos + combos)
    const resumenVenta = await connection.execute(
      `SELECT v.CODIGO_TICKET,
              TO_CHAR(v.FECHA, 'DD/MM/YYYY') AS FECHA,
              v.TOTAL,
              v.DINERO_RECIBIDO,
              v.CAMBIO,
              u.NOMBRE AS CAJERO,
              c.NOMBRE_CAJA AS CAJA
         FROM VENTAS v
         JOIN USUARIOS u ON v.USUARIO_ID = u.ID
         JOIN CAJAS c    ON v.CAJA_ID   = c.ID_CAJA
        WHERE v.ID_VENTA = :id`,
      { id: id_venta }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const detallesProd = await connection.execute(
      `SELECT p.NOMBRE AS DESCRIPCION,
              d.CANTIDAD,
              d.PRECIO_UNITARIO,
              d.SUBTOTAL_LINEA
         FROM DETALLE_VENTA d
         JOIN PRODUCTO_NUEVO p ON d.PRODUCTO_ID = p.ID
        WHERE d.ID_VENTA = :id`,
      { id: id_venta }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const detallesCombo = await connection.execute(
      `SELECT cb.NOMBRE AS DESCRIPCION,
              vc.CANTIDAD,
              vc.PRECIO_UNITARIO,
              vc.SUBTOTAL_LINEA
         FROM VENTA_COMBO vc
         JOIN COMBO cb ON vc.COMBO_ID = cb.ID
        WHERE vc.ID_VENTA = :id`,
      { id: id_venta }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      id_venta,
      venta: resumenVenta.rows[0],
      detalles: [...detallesProd.rows, ...detallesCombo.rows]
    });

  } catch (error) {
    console.error("❌ Error procesando venta:", error);
    if (connection) try { await connection.rollback(); } catch {}
    // Diferenciar conflicto de stock durante FEFO
    if (error && error.code === "STOCK_CONFLICT") {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: "Error procesando venta" });
  } finally {
    if (connection) try { await connection.close(); } catch {}
  }
};
