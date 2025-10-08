const db = require('../config/db');
const oracledb = require('oracledb');
const xss = require('xss');
const bucket = require('../config/firebaseAdmin');



/* =========================
 *  Crear producto (sin precio_costo)
 * ========================= */
exports.crearProducto = async (req, res) => {
  let {
    nombre,
    precioVenta,
    categoria,   // CATEGORIA_ID
    unidad,      // UNIDAD_MEDIDA_ID
    estado,      // ESTADO_ID
    usuarioId
  } = req.body;

  // Sanitizar / normalizar
  nombre      = xss((nombre || '').trim().replace(/\s+/g, ' '));
  precioVenta = Number(precioVenta) || 0;
  categoria   = Number(categoria) || null;
  unidad      = Number(unidad) || null;
  estado      = Number(estado) || null;
  usuarioId   = Number(usuarioId) || null;

  let connection;
  try {
    connection = await db.getConnection();

    // Validaciones mínimas
    if (!nombre)    return res.status(400).json({ message: "El nombre es requerido." });
    if (!categoria) return res.status(400).json({ message: "La categoría es requerida." });
    if (!unidad)    return res.status(400).json({ message: "La unidad de medida es requerida." });
    if (!estado)    return res.status(400).json({ message: "El estado es requerido." });
    if (!usuarioId) return res.status(400).json({ message: "El usuario es requerido." });
    if (precioVenta <= 0) return res.status(400).json({ message: "El precio de venta debe ser mayor a 0." });

    // Duplicado por (LOWER(NOMBRE), CATEGORIA_ID)
    const dupCheck = await connection.execute(
      `SELECT 1
         FROM PRODUCTO_NUEVO
        WHERE LOWER(NOMBRE) = LOWER(:nombre)
          AND CATEGORIA_ID  = :categoria`,
      { nombre, categoria },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({
        message: 'Ya existe un producto con ese nombre en esta categoría.'
      });
    }

    // Subir imagen (obligatoria)
    let imageUrl = null;
    if (req.file) {
      try {
        const fileName = `productos/${Date.now()}-${req.file.originalname}`;
        const file = bucket.file(fileName);
        await file.save(req.file.buffer, {
          metadata: { contentType: req.file.mimetype },
          resumable: false,
        });
        await file.makePublic();
        imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        console.log(" Imagen subida a Firebase:", imageUrl);
      } catch (uploadError) {
        console.error("Error al subir imagen a Firebase:", uploadError);
        return res.status(500).json({ message: 'Error al subir imagen a Firebase.' });
      }
    } else {
      return res.status(400).json({ message: 'La imagen es obligatoria.' });
    }

    // INSERT sin PRECIO_COSTO
    const result = await connection.execute(
      `INSERT INTO PRODUCTO_NUEVO
         (NOMBRE, CATEGORIA_ID, UNIDAD_MEDIDA_ID,
          PRECIO_VENTA, IMAGEN,
          USUARIO_ID, FECHA_REGISTRO, ESTADO_ID)
       VALUES
         (:nombre, :categoria, :unidad,
          :precioVenta, :imagen,
          :usuarioId, SYSDATE, :estado)
       RETURNING ID INTO :id`,
      {
        nombre,
        categoria,
        unidad,
        precioVenta,
        imagen: imageUrl,
        usuarioId,
        estado,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );

    const productoId = result.outBinds.id[0];

    return res.status(201).json({
      id: productoId,
      message: 'Producto creado correctamente.',
      imagen: imageUrl
    });

  } catch (error) {
    console.error('❌ Error al crear producto:', error);
    return res.status(500).json({
      message: 'Error al crear producto.',
      oracleCode: error?.code,
      oracleNum: error?.errorNum
    });
  } finally {
    if (connection) await connection.close();
  }
};

/* =========================
 *  Eliminar producto
 * ========================= */

exports.eliminarProducto = async (req, res) => {
  const { id } = req.params;
  let connection;

  try {
    connection = await db.getConnection();

    // 0) Existe el producto y obtener URL de imagen
    const prodRs = await connection.execute(
      `SELECT IMAGEN FROM PRODUCTO_NUEVO WHERE ID = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (prodRs.rows.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }
    const imageUrl = prodRs.rows[0].IMAGEN;

    // 1) ¿Asociado a ventas?
    const [ventaCabRs, ventaLoteRs] = await Promise.all([
      connection.execute(
        `SELECT COUNT(*) AS TOTAL FROM DETALLE_VENTA WHERE PRODUCTO_ID = :id`,
        { id }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
      connection.execute(
        `SELECT COUNT(*) AS TOTAL FROM DETALLE_VENTA_LOTE WHERE PRODUCTO_ID = :id`,
        { id }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
    ]);
    const enVentas = Number(ventaCabRs.rows[0].TOTAL || 0) + Number(ventaLoteRs.rows[0].TOTAL || 0);
    if (enVentas > 0) {
      return res.status(409).json({
        message: "No se puede eliminar: el producto está asociado a ventas. "
      });
    }

    // 2) ¿Forma parte de combos (recetas)?
    const comboRs = await connection.execute(
      `SELECT COUNT(*) AS TOTAL FROM DETALLE_COMBO WHERE PRODUCTO_ID = :id`,
      { id }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const enCombos = Number(comboRs.rows[0].TOTAL || 0);
    if (enCombos > 0) {
      return res.status(409).json({
        message: "No se puede eliminar: el producto forma parte de uno o más combos. " 
      });
    }

    // 3) Ya es eliminable: limpiar hijos mantenibles y luego el producto
    await connection.execute(
      `DELETE FROM PRODUCTO_POR_LOTE WHERE PRODUCTO_ID = :id`,
      { id }
    );
    // (Opcional solo si tu FK lo exige)
    // await connection.execute(
    //   `DELETE FROM PRODUCTO_ESTADO WHERE PRODUCTO_ID = :id`,
    //   { id }
    // );

    const del = await connection.execute(
      `DELETE FROM PRODUCTO_NUEVO WHERE ID = :id`,
      { id }
    );
    if ((del.rowsAffected || 0) === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Producto no encontrado." });
    }

    await connection.commit();

    // 4) Borrar imagen en Firebase (best effort, fuera de la transacción)
    if (imageUrl) {
      try {
        // misma estrategia que usas en actualizarProducto
        const filePath = imageUrl.split(`${bucket.name}/`)[1]; // "productos/xxx"
        if (filePath) {
          await bucket.file(filePath).delete();
        }
      } catch (err) {
        console.error("Error eliminando imagen en Firebase:", err.message);
      }
    }

    return res.status(200).json({ message: "Producto eliminado correctamente." });

  } catch (error) {
    if (connection) { try { await connection.rollback(); } catch {} }
    // Traducir FK violada a mensaje claro
    if (error && error.errorNum === 2292) {
      return res.status(409).json({
        message: "No se puede eliminar: el producto tiene registros dependientes (ventas, combos o lotes)."
      });
    }
    console.error("❌ Error al eliminar producto:", error);
    return res.status(500).json({ message: "Error al eliminar producto." });
  } finally {
    if (connection) { try { await connection.close(); } catch {} }
  }
};

/* =========================
 *  Listar productos (sin precio_costo)
 * ========================= */
exports.getProductos = async (_req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT 
          p.ID,
          p.NOMBRE,
          p.PRECIO_VENTA,
          p.IMAGEN,
          p.ESTADO_ID,
          p.CATEGORIA_ID,
          c.NOMBRE AS CATEGORIA_NOMBRE,
          p.UNIDAD_MEDIDA_ID,
          u.NOMBRE AS UNIDAD_NOMBRE,
          NVL(agg.STOCK_TOTAL, 0) AS STOCK_TOTAL,
          TO_CHAR(agg.PROX_VENC, 'DD/MM/YYYY') AS PROX_VENC
       FROM PRODUCTO_NUEVO p
       LEFT JOIN CATEGORIAPRODUCTO c ON p.CATEGORIA_ID = c.ID
       LEFT JOIN UNIDAD_MEDIDA u     ON p.UNIDAD_MEDIDA_ID = u.ID
       LEFT JOIN (
         SELECT PRODUCTO_ID,
                NVL(SUM(CANTIDAD_DISPONIBLE),0) AS STOCK_TOTAL,
                MIN(FECHA_VENCIMIENTO)         AS PROX_VENC
         FROM PRODUCTO_POR_LOTE
         GROUP BY PRODUCTO_ID
       ) agg ON agg.PRODUCTO_ID = p.ID
       ORDER BY p.ID DESC`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const productos = result.rows.map((row) => ({
      id: row.ID,
      nombre: row.NOMBRE,
      precioVenta: row.PRECIO_VENTA,
      imagen: row.IMAGEN || null,
      estado: row.ESTADO_ID,
      categoria: row.CATEGORIA_ID,
      categoriaNombre: row.CATEGORIA_NOMBRE || "Sin categoría",
      unidad: row.UNIDAD_MEDIDA_ID,
      unidadNombre: row.UNIDAD_NOMBRE || "Sin unidad",
      cantidad: row.STOCK_TOTAL,               // SUM(CANTIDAD_DISPONIBLE)
      fechaVencimiento: row.PROX_VENC || null, // MIN(FECHA_VENCIMIENTO) en 'DD/MM/YYYY'
    }));

    res.status(200).json(productos);
  } catch (error) {
    console.error("❌ Error al listar productos:", error);
    res.status(500).json({ message: "Error al obtener productos." });
  } finally {
    if (connection) await connection.close();
  }
};

/* =========================
 *  Actualizar producto (sin precio_costo)
 * ========================= */
exports.actualizarProducto = async (req, res) => {
  const { id } = req.params;
  let { nombre, precioVenta, categoria, unidad, estado } = req.body;

  let connection;
  try {
    connection = await db.getConnection();

    // 1) Producto actual
    const result = await connection.execute(
      `SELECT * FROM PRODUCTO_NUEVO WHERE ID = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }
    const productoActual = result.rows[0];

    // 2) Validar duplicado por nombre (si se envía)
    if (typeof nombre === "string" && nombre.trim() &&
        nombre.toLowerCase() !== (productoActual.NOMBRE || "").toLowerCase()) {
      const dupNombre = await connection.execute(
        `SELECT 1 FROM PRODUCTO_NUEVO WHERE LOWER(NOMBRE) = :nombre AND ID != :id`,
        { nombre: nombre.toLowerCase(), id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (dupNombre.rows.length > 0) {
        return res.status(400).json({ message: "⚠️ Nombre de producto ya existe." });
      }
    }

    // 3) Normalizar numéricos SOLO si vienen
    const ventaEnviada  = (precioVenta !== undefined && precioVenta !== "");
    const catEnviada    = (categoria   !== undefined && categoria   !== "");
    const umEnviada     = (unidad      !== undefined && unidad      !== "");
    const estadoEnviado = (estado      !== undefined && estado      !== "");

    let ventaNum = null;
    if (ventaEnviada) {
      ventaNum = Number(precioVenta);
      if (Number.isNaN(ventaNum) || ventaNum <= 0) {
        return res.status(400).json({ message: "El precio de venta debe ser mayor a 0." });
      }
    }

    // 4) Manejo de imagen (opcional)
    let nuevaImagenUrl = null;
    if (req.file) {
      if (productoActual.IMAGEN) {
        const oldFilePath = productoActual.IMAGEN.split(`${bucket.name}/`)[1];
        if (oldFilePath) {
          await bucket.file(oldFilePath).delete().catch(() => {});
        }
      }
      const fileName = `productos/${Date.now()}-${req.file.originalname}`;
      const file = bucket.file(fileName);
      await file.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype },
        resumable: false,
      });
      await file.makePublic();
      nuevaImagenUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    }

    // 5) Build dinámico (sin PRECIO_COSTO)
    const campos = [];
    const valores = { id };

    if (typeof nombre === "string" && nombre.trim()) {
      campos.push("NOMBRE = :nombre");
      valores.nombre = nombre.trim();
    }
    if (catEnviada) {
      campos.push("CATEGORIA_ID = :categoria");
      valores.categoria = Number(categoria);
    }
    if (umEnviada) {
      campos.push("UNIDAD_MEDIDA_ID = :unidad");
      valores.unidad = Number(unidad);
    }
    if (ventaEnviada) {
      campos.push("PRECIO_VENTA = :precioVenta");
      valores.precioVenta = ventaNum;
    }
    if (estadoEnviado) {
      campos.push("ESTADO_ID = :estado");
      valores.estado = Number(estado);
    }
    if (nuevaImagenUrl) {
      campos.push("IMAGEN = :imagen");
      valores.imagen = nuevaImagenUrl;
    }

    if (campos.length === 0) {
      return res.status(400).json({ message: "No se enviaron campos para actualizar." });
    }

    const query = `
      UPDATE PRODUCTO_NUEVO
         SET ${campos.join(", ")}
       WHERE ID = :id
    `;
    await connection.execute(query, valores, { autoCommit: true });

    // 6) Devolver actualizado (sin PRECIO_COSTO)
    const actualizado = await connection.execute(
      `SELECT 
         p.ID as id,
         p.NOMBRE as nombre,
         p.PRECIO_VENTA as precioVenta,
         p.CATEGORIA_ID as categoria,
         c.NOMBRE as categoriaNombre,
         p.UNIDAD_MEDIDA_ID as unidad,
         u.NOMBRE as unidadNombre,
         p.ESTADO_ID as estado,
         e.NOMBRE as estadoNombre,
         p.IMAGEN as imagen
       FROM PRODUCTO_NUEVO p
       LEFT JOIN CATEGORIAPRODUCTO c ON p.CATEGORIA_ID = c.ID
       LEFT JOIN UNIDAD_MEDIDA u ON p.UNIDAD_MEDIDA_ID = u.ID
       LEFT JOIN ESTADOS_USUARIOS e ON p.ESTADO_ID = e.ID
       WHERE p.ID = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return res.status(200).json(actualizado.rows[0]);

  } catch (error) {
    console.error("❌ Error al actualizar producto:", error);
    return res.status(500).json({ message: "Error al actualizar producto." });
  } finally {
    if (connection) await connection.close();
  }
};
