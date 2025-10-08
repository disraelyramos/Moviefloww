// src/controllers/combo/CrearcomboProducto.controller.js
const db = require('../../config/db');
const oracledb = require('oracledb');
const xss = require('xss');
const bucket = require('../../config/firebaseAdmin');

// 👉 categoría fija para combos
const COMBO_CAT_ID = 1;

/** Helper: subir imagen (obligatoria) */
async function subirImagenDeReq(req) {
  if (!req.file) {
    const err = new Error('La imagen es obligatoria.');
    err.status = 400;
    throw err;
  }
  const fileName = `combos/${Date.now()}-${req.file.originalname}`;
  const file = bucket.file(fileName);
  await file.save(req.file.buffer, {
    metadata: { contentType: req.file.mimetype },
    resumable: false,
  });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
}

/** 🧰 Helper (a nivel módulo): valida unicidad nombre+categoría (case/acentos-insensitive)
 *  Opcionalmente excluye un ID (para edición).
 */
async function assertNombreUnicoPorCategoria(cn, { nombre, categoriaId, excludeId = null }) {
  const binds = { nombre, categoriaId };
  let extra = "";
  if (excludeId) { extra = "AND c.ID <> :excludeId"; binds.excludeId = excludeId; }

  const sql = `
    SELECT 1
      FROM COMBO c
     WHERE c.CATEGORIA_ID = :categoriaId
       AND NLSSORT(c.NOMBRE,'NLS_SORT=BINARY_AI') = NLSSORT(:nombre,'NLS_SORT=BINARY_AI')
     ${extra}
     FETCH FIRST 1 ROWS ONLY
  `;
  const rs = await cn.execute(sql, binds);
  if (rs.rows?.length) {
    const err = new Error('Ya existe un combo con ese nombre en la categoría.');
    err.status = 409;
    throw err;
  }
}

// ⬆️ PÉGALO ARRIBA DEL ARCHIVO (junto a otros helpers)
async function getStockDisponibleMap(cn, productoIds = []) {
  if (!productoIds.length) return new Map();

  const binds = Object.fromEntries(
    productoIds.map((v, i) => [`p${i}`, Number(v)])
  );
  const marks = productoIds.map((_v, i) => `:p${i}`).join(',');

  const sql = `
    SELECT PRODUCTO_ID, SUM(CANTIDAD_DISPONIBLE) AS DISPONIBLE
      FROM PRODUCTO_POR_LOTE
     WHERE PRODUCTO_ID IN (${marks})
       AND CANTIDAD_DISPONIBLE > 0
     GROUP BY PRODUCTO_ID
  `;

  const rs = await cn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  return new Map(
    (rs.rows || []).map(r => [Number(r.PRODUCTO_ID), Number(r.DISPONIBLE || 0)])
  );
}


/* =========================
 *  GET /api/categoria-combo
 * ========================= */
exports.listarCategoriasCombo = async (_req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const rs = await connection.execute(
      `SELECT ID, CODIGO, NOMBRE, FECHA_CREACION
         FROM CATEGORIA_COMBO
        ORDER BY ID DESC`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const data = rs.rows.map(r => ({
      ID: r.ID,
      CODIGO: r.CODIGO,
      NOMBRE: r.NOMBRE,
      FECHA_CREACION: r.FECHA_CREACION
    }));
    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error listando CATEGORIA_COMBO:', error);
    res.status(500).json({ message: 'Error al obtener categorías de combo.' });
  } finally {
    if (connection) await connection.close();
  }
};

/* =========================
 *  POST /api/combos  (multipart)
 * ========================= */
exports.crearComboProducto = async (req, res) => {
  let { nombre, descripcion, precioVenta, estado, usuarioId, items, cantidadDisponible } = req.body;

  // Normalizar / sanitizar
  nombre              = xss(String(nombre || "").trim().replace(/\s+/g, " "));
  descripcion         = xss(String(descripcion || "").trim());
  precioVenta         = Number(String(precioVenta ?? 0).replace(",", "."));
  estado              = Number(estado) || null;
  usuarioId           = Number(usuarioId) || null;
  cantidadDisponible  = Number.isFinite(Number(cantidadDisponible)) ? Math.max(0, Number(cantidadDisponible)) : 0;

  if (typeof items === "string") {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  items = Array.isArray(items) ? items : [];

  // ✅ Validaciones base
  if (!nombre)            return res.status(400).json({ message: "El nombre es requerido." });
  if (!(precioVenta > 0)) return res.status(400).json({ message: "El precio de venta debe ser mayor a 0." });
  if (!estado)            return res.status(400).json({ message: "El estado es requerido." });
  if (!usuarioId)         return res.status(400).json({ message: "El usuario es requerido." });

  // Rango de ítems (2 a 5)
  if (items.length < 2) return res.status(400).json({ message: "El combo debe incluir al menos 2 productos." });
  if (items.length > 5) return res.status(400).json({ message: "El combo no puede tener más de 5 productos." });

  // Estructura de cada item (SOLO productoId; cantidad fija = 1)
  for (const it of items) {
    if (!it || !Number(it.productoId)) {
      return res.status(400).json({ message: "Items inválidos. Verifica productoId." });
    }
  }

  // Reglas de precio (márgenes)
  const MIN_PCT = 0.50;  // combo ≥ 50% de la suma de componentes
  const EPS     = 0.005; // tolerancia flotante

  let connection;
  let imageUrl = null;

  try {
    connection = await db.getConnection();

    // 1) Verificar categoría fija de combos
    const cat = await connection.execute(
      `SELECT 1 FROM CATEGORIA_COMBO WHERE ID = :id`,
      { id: COMBO_CAT_ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((cat.rows || []).length === 0) {
      return res.status(400).json({ message: `La categoría de combo (ID=${COMBO_CAT_ID}) no existe.` });
    }

    // 2) Unicidad de nombre dentro de la categoría
    await assertNombreUnicoPorCategoria(connection, { nombre, categoriaId: COMBO_CAT_ID });

    // 3) Traer precios y nombres de los productos componentes
    const ids   = items.map(i => Number(i.productoId));
    const binds = Object.fromEntries(ids.map((v, i) => [`p${i}`, v]));
    const marks = ids.map((_v, i) => `:p${i}`).join(",");

    const rsProd = await connection.execute(
      `SELECT ID, NOMBRE, PRECIO_VENTA
         FROM PRODUCTO_NUEVO
        WHERE ID IN (${marks})`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const priceById = new Map((rsProd.rows || []).map(r => [Number(r.ID), Number(r.PRECIO_VENTA || 0)]));
    const nameById  = new Map((rsProd.rows || []).map(r => [Number(r.ID), String(r.NOMBRE || '')]));

    // 4) Calcular suma de componentes (cantidad fija = 1)
    let suma = 0;
    for (const it of items) {
      const pid        = Number(it.productoId);
      const precioUnit = priceById.get(pid);
      if (precioUnit == null) {
        const nombreFallback = nameById.get(pid) || `ID ${pid}`;
        return res.status(400).json({ message: `El producto componente "${nombreFallback}" no existe.` });
      }
      suma += precioUnit * 1; // cantidad fija
    }

    if (suma > 0) {
      if (precioVenta - suma > EPS) {
        return res.status(400).json({
          message: `El precio del combo (Q${precioVenta.toFixed(2)}) no puede exceder la suma de componentes (Q${suma.toFixed(2)}).`
        });
      }
      const minPermitido = suma * MIN_PCT;
      if (minPermitido - precioVenta > EPS) {
        return res.status(400).json({
          message: `El precio del combo (Q${precioVenta.toFixed(2)}) es menor al mínimo permitido (Q${minPermitido.toFixed(2)}).`
        });
      }
    }

    // ⛔️ 5) SIN validación de stock. La disponibilidad la define el admin (cantidadDisponible).

    // 6) Subir imagen (obligatoria en crear)
    try {
      imageUrl = await subirImagenDeReq(req);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message || "Error al subir imagen." });
    }

    // 7) Transacción: COMBO + DETALLE_COMBO
    await connection.execute("SAVEPOINT sp_combo");

    // 7.1) Insert COMBO (cabecera) con CANTIDAD_DISPONIBLE definida por admin
    const insHead = await connection.execute(
      `INSERT INTO COMBO
         (CATEGORIA_ID, NOMBRE, DESCRIPCION, PRECIO_VENTA,
          ESTADO_ID, IMAGEN, USUARIO_ID, FECHA_CREACION, CANTIDAD_DISPONIBLE)
       VALUES
         (:categoria, :nombre, :descripcion, :precio,
          :estado, :imagen, :usuario, SYSDATE, :cantDisp)
       RETURNING ID INTO :id`,
      {
        categoria: COMBO_CAT_ID,
        nombre,
        descripcion: descripcion || null,
        precio: precioVenta,
        estado,
        imagen: imageUrl,
        usuario: usuarioId,
        cantDisp: cantidadDisponible,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: false }
    );

    const comboId = insHead.outBinds.id[0];

    // 7.2) Insert DETALLE_COMBO (snapshot de precio actual) con cantidad fija = 1
    const rows = items.map(it => ({
      combo: comboId,
      prod:  Number(it.productoId),
      cant:  1, // fijo
      snap:  Number(priceById.get(Number(it.productoId)) || 0)
    }));

    await connection.executeMany(
      `INSERT INTO DETALLE_COMBO
         (COMBO_ID, PRODUCTO_ID, CANTIDAD, PRECIO_UNIT_SNAP)
       VALUES (:combo, :prod, :cant, :snap)`,
      rows,
      {
        autoCommit: false,
        bindDefs: {
          combo: { type: oracledb.NUMBER },
          prod:  { type: oracledb.NUMBER },
          cant:  { type: oracledb.NUMBER },
          snap:  { type: oracledb.NUMBER }
        }
      }
    );

    // 8) Commit
    await connection.commit();

    return res.status(201).json({
      id: comboId,
      message: "Combo creado correctamente.",
      imagen: imageUrl,
      cantidadDisponible
    });

  } catch (error) {
    try { if (connection) await connection.rollback(); } catch {}
    if (error?.status) {
      return res.status(error.status).json({ message: error.message });
    }
    const ora = Number(error?.errorNum || 0);
    if ([20011, 20012, 20013, 20021, 20022, 20023].includes(ora)) {
      return res.status(400).json({
        message: (error?.message || "").replace(/^ORA-\d+:\s*/,'').trim()
      });
    }
    console.error("❌ Error al crear combo:", error);
    return res.status(500).json({ message: "Error al crear combo." });
  } finally {
    try { if (connection) await connection.close(); } catch {}
  }
};

/* =========================
 *  GET /api/combos
 * ========================= */
exports.listarCombos = async (req, res) => {
  const categoriaId = Number(req.query.categoriaId) || null;
  const q = (req.query.q || "").trim().toLowerCase();

  let connection;
  try {
    connection = await db.getConnection();

    const where = [];
    const binds = {};
    if (categoriaId) { where.push("c.CATEGORIA_ID = :cat"); binds.cat = categoriaId; }
    if (q) { where.push("(LOWER(c.NOMBRE) LIKE :q OR LOWER(c.DESCRIPCION) LIKE :q)"); binds.q = `%${q}%`; }

    const sql = `
      SELECT
        c.ID,
        c.NOMBRE,
        c.DESCRIPCION,
        c.PRECIO_VENTA,
        c.IMAGEN,
        c.ESTADO_ID,
        c.CATEGORIA_ID,
        c.CANTIDAD_DISPONIBLE,
        cc.NOMBRE AS CATEGORIA_NOMBRE,
        TO_CHAR(c.FECHA_CREACION, 'YYYY-MM-DD HH24:MI:SS') AS FECHA_CREACION
      FROM COMBO c
      LEFT JOIN CATEGORIA_COMBO cc ON cc.ID = c.CATEGORIA_ID
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY c.ID DESC
    `;

    const rs = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    const data = (rs.rows || []).map(r => {
      const precioNum =
        typeof r.PRECIO_VENTA === 'number'
          ? r.PRECIO_VENTA
          : Number(String(r.PRECIO_VENTA ?? '0').replace(',', '.'));

      const cant = Number(r.CANTIDAD_DISPONIBLE ?? 0);

      return {
        id: Number(r.ID),
        nombre: r.NOMBRE,
        descripcion: r.DESCRIPCION || "",
        precio: Number.isFinite(precioNum) ? precioNum : 0,
        precioVenta: Number.isFinite(precioNum) ? precioNum : 0,
        imagen: r.IMAGEN || null,
        estado: Number(r.ESTADO_ID || 0),
        categoriaId: Number(r.CATEGORIA_ID || 0),
        categoriaNombre: r.CATEGORIA_NOMBRE || "",
        fechaCreacion: r.FECHA_CREACION,
        cantidadDisponible: cant,
        cantidadDisponibleTexto: `cantidad disponible : ${cant}`
      };
    });

    res.status(200).json(data);
  } catch (error) {
    console.error("❌ Error listando combos:", error);
    res.status(500).json({ message: "Error al obtener combos." });
  } finally {
    if (connection) await connection.close();
  }
};


/* =========================
 *  GET /api/combos/buscar
 * ========================= */
exports.buscarCombos = async (req, res) => {
  const qRaw   = (req.query.q || '').trim();
  const catId  = Number(req.query.categoriaId) || null;
  const limit  = Math.max(0, Number(req.query.limit)  || 100);
  const offset = Math.max(0, Number(req.query.offset) || 0);

  let connection;
  try {
    connection = await db.getConnection();

    if (qRaw) {
      await connection.execute(`ALTER SESSION SET NLS_COMP = LINGUISTIC`);
      await connection.execute(`ALTER SESSION SET NLS_SORT = BINARY_AI`);
    }

    const where = [];
    const binds = { off: offset, lim: limit };

    if (catId) { where.push(`c.CATEGORIA_ID = :catId`); binds.catId = catId; }
    if (qRaw)  { where.push(`( c.NOMBRE LIKE :q OR c.DESCRIPCION LIKE :q )`); binds.q = `%${qRaw}%`; }
    /* 🔴 CLAVE: solo combos ACTIVOS para ventas */
    where.push(`c.ESTADO_ID = 1`);

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT *
      FROM (
        SELECT
          c.ID, c.NOMBRE, c.DESCRIPCION, c.PRECIO_VENTA, c.IMAGEN,
          c.ESTADO_ID, c.CATEGORIA_ID, c.CANTIDAD_DISPONIBLE,
          cc.NOMBRE AS CATEGORIA_NOMBRE,
          TO_CHAR(c.FECHA_CREACION, 'YYYY-MM-DD HH24:MI:SS') AS FECHA_CREACION,
          ROW_NUMBER() OVER (ORDER BY c.ID DESC) AS RN
        FROM COMBO c
        LEFT JOIN CATEGORIA_COMBO cc ON cc.ID = c.CATEGORIA_ID
        ${whereClause}
      )
      WHERE RN > :off AND RN <= :off + :lim
    `;

    const rs = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    const data = (rs.rows || []).map(r => {
      const precioNum =
        typeof r.PRECIO_VENTA === 'number'
          ? r.PRECIO_VENTA
          : Number(String(r.PRECIO_VENTA ?? '0').replace(',', '.'));

      const cant = Number(r.CANTIDAD_DISPONIBLE ?? 0);

      return {
        id: Number(r.ID),
        nombre: r.NOMBRE,
        descripcion: r.DESCRIPCION || '',
        precio: precioNum,
        precioVenta: precioNum,
        imagen: r.IMAGEN || null,
        estado: Number(r.ESTADO_ID || 0),
        categoriaId: Number(r.CATEGORIA_ID || 0),
        categoriaNombre: r.CATEGORIA_NOMBRE || '',
        fechaCreacion: r.FECHA_CREACION,
        cantidadDisponible: cant,
        cantidadDisponibleTexto: `cantidad disponible : ${cant}`
      };
    });

    res.status(200).json(data);
  } catch (err) {
    console.error('❌ Error buscando combos:', err);
    res.status(500).json({ message: 'Error al buscar combos.' });
  } finally {
    if (connection) { try { await connection.close(); } catch {} }
  }
};


/* =========================
 *  GET /api/combos/:id
 * ========================= */
exports.obtenerComboCompleto = async (req, res) => {
  const comboId = Number(req.params.id) || 0;
  if (!comboId) return res.status(400).json({ message: 'ID de combo inválido' });

  let cn;
  try {
    cn = await db.getConnection();

    // --- CABECERA ---
    const headSQL = `
      SELECT
        c.ID,
        c.NOMBRE,
        c.DESCRIPCION,
        c.PRECIO_VENTA,
        c.ESTADO_ID,
        c.IMAGEN,
        c.CATEGORIA_ID,
        c.CANTIDAD_DISPONIBLE,
        cc.NOMBRE AS CATEGORIA_NOMBRE,
        c.USUARIO_ID,
        TO_CHAR(c.FECHA_CREACION,'YYYY-MM-DD HH24:MI:SS') AS FECHA_CREACION
      FROM COMBO c
      LEFT JOIN CATEGORIA_COMBO cc ON cc.ID = c.CATEGORIA_ID
      WHERE c.ID = :id
    `;
    const headRs = await cn.execute(headSQL, { id: comboId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    if (headRs.rows.length === 0) {
      return res.status(404).json({ message: 'Combo no encontrado' });
    }

    const h = headRs.rows[0];
    const cant = Number(h.CANTIDAD_DISPONIBLE || 0);

    const head = {
      id: Number(h.ID),
      nombre: h.NOMBRE,
      descripcion: h.DESCRIPCION || '',
      precio: Number(h.PRECIO_VENTA),
      precioVenta: Number(h.PRECIO_VENTA),
      estadoId: Number(h.ESTADO_ID),
      imagen: h.IMAGEN || null,
      categoriaId: Number(h.CATEGORIA_ID || 0),
      categoriaNombre: h.CATEGORIA_NOMBRE || '',
      usuarioId: Number(h.USUARIO_ID || 0),
      fechaCreacion: h.FECHA_CREACION,
   
      cantidadDisponibleTexto: `cantidad disponible : ${cant}`
    };

    // --- DETALLE / ITEMS ---
    const detSQL = `
      SELECT
        d.ID               AS DETALLE_ID,
        d.PRODUCTO_ID      AS PRODUCTO_ID,
        p.NOMBRE           AS PRODUCTO_NOMBRE,
        p.IMAGEN           AS PRODUCTO_IMAGEN,
        d.CANTIDAD         AS CANTIDAD,
        d.PRECIO_UNIT_SNAP AS PRECIO_UNIT_SNAP
      FROM DETALLE_COMBO d
      JOIN PRODUCTO_NUEVO p ON p.ID = d.PRODUCTO_ID
      WHERE d.COMBO_ID = :id
      ORDER BY d.ID
    `;
    const detRs = await cn.execute(detSQL, { id: comboId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    const items = (detRs.rows || []).map(r => {
      const cantidad = Number(r.CANTIDAD);
      const pu = Number(r.PRECIO_UNIT_SNAP);
      return {
        detalleId: Number(r.DETALLE_ID),
        productoId: Number(r.PRODUCTO_ID),
        nombre: r.PRODUCTO_NOMBRE,
        imagen: r.PRODUCTO_IMAGEN || null,
        cantidad,
        precioUnitSnap: pu,
        subtotalSnap: +(cantidad * pu).toFixed(2),
      };
    });

    const sumaComponentes = +items.reduce((acc, it) => acc + it.subtotalSnap, 0).toFixed(2);
    const ahorroEstimado  = +(sumaComponentes - head.precioVenta).toFixed(2);

    return res.status(200).json({
      ...head,
      items,
      totales: {
        sumaComponentes,
        precioCombo: head.precioVenta,
        ahorroEstimado,
      },
    });
  } catch (err) {
    console.error('❌ Error obteniendo combo completo:', err);
    res.status(500).json({ message: 'Error al obtener combo.' });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};

// Alias opcional si tu ruta usa /obtenerComboPorId
exports.obtenerComboPorId = exports.obtenerComboCompleto;


// ✅ Actualiza cabecera de combo y su detalle (upsert) manteniendo cantidad fija = 1
exports.actualizarComboCabecera = async (req, res) => {
  const comboId = Number(req.params.id) || 0;
  if (!comboId) return res.status(400).json({ message: "ID de combo inválido" });

  const autoAjustarPrecio =
    String(req.query?.autoAjustarPrecio ?? req.body?.autoAjustarPrecio ?? "0") === "1";

  let activarDiferido = false;

  let {
    nombre,
    descripcion,
    precioVenta,
    estadoId,
    categoriaId,
    usuarioId,
    itemsUpsert,
    cantidadDisponibleDelta,
    cantidadDisponible
  } = req.body || {};

  // Parseo / saneo básico
  if (typeof itemsUpsert === "string") {
    try { itemsUpsert = JSON.parse(itemsUpsert); }
    catch { return res.status(400).json({ message: "itemsUpsert debe ser JSON válido." }); }
  }
  if (itemsUpsert != null && !Array.isArray(itemsUpsert)) {
    return res.status(400).json({ message: "itemsUpsert debe ser un arreglo." });
  }

  if (typeof nombre === "string")      nombre      = xss(nombre.trim());
  if (typeof descripcion === "string") descripcion = xss(descripcion.trim());

  if (precioVenta != null) precioVenta = Number(String(precioVenta).replace(",", "."));
  if (estadoId    != null) estadoId    = Number(estadoId);
  if (categoriaId != null) categoriaId = Number(categoriaId);
  if (usuarioId   != null) usuarioId   = Number(usuarioId);
  if (precioVenta != null && !(precioVenta > 0)) {
    return res.status(400).json({ message: "precioVenta debe ser > 0" });
  }

  // Compactación/validación itemsUpsert (cantidad fija = 1)
  if (Array.isArray(itemsUpsert)) {
    for (const it of itemsUpsert) {
      const pid = Number(it?.productoId);
      if (!pid) {
        return res.status(400).json({
          message: "itemsUpsert contiene elementos inválidos (productoId es requerido)."
        });
      }
      // ignorar cantidad entrante; fijar en 1
      it.cantidad = 1;
      if (it?.precioUnitSnap != null) {
        it.precioUnitSnap = Number(String(it.precioUnitSnap).replace(",", "."));
        if (!(it.precioUnitSnap >= 0)) {
          return res.status(400).json({ message: "precioUnitSnap debe ser ≥ 0 cuando se envía." });
        }
      }
    }
    // Deduplicar por productoId; cantidad siempre 1
    const comp = new Map();
    for (const it of itemsUpsert) {
      const pid  = Number(it.productoId);
      const snap = it?.precioUnitSnap;
      if (!comp.has(pid)) comp.set(pid, { precioUnitSnap: snap ?? null });
      else if (snap != null) comp.get(pid).precioUnitSnap = snap;
    }
    itemsUpsert = Array.from(comp.entries()).map(([productoId, v]) => ({
      productoId,
      cantidad: 1,
      ...(v.precioUnitSnap != null ? { precioUnitSnap: v.precioUnitSnap } : {})
    }));
  }

  const MIN_PCT = 0.50;
  const EPS     = 0.005;

  let cn;
  let newImageUrl = null;

  try {
    cn = await db.getConnection();

    // 1) Cabecera y detalle actual
    const rsCombo = await cn.execute(
      `SELECT NOMBRE, DESCRIPCION, PRECIO_VENTA, ESTADO_ID, IMAGEN, CATEGORIA_ID, USUARIO_ID, CANTIDAD_DISPONIBLE
         FROM COMBO WHERE ID = :id`,
      { id: comboId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (rsCombo.rows.length === 0) return res.status(404).json({ message: "Combo no encontrado" });
    const current = rsCombo.rows[0];
    const precioActual = Number(current.PRECIO_VENTA);
    const cantDispActual = Number(current.CANTIDAD_DISPONIBLE || 0);

    const rsDet = await cn.execute(
      `SELECT PRODUCTO_ID, CANTIDAD, PRECIO_UNIT_SNAP
         FROM DETALLE_COMBO WHERE COMBO_ID = :id`,
      { id: comboId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const detActual = new Map(
      (rsDet.rows || []).map(r => [ Number(r.PRODUCTO_ID), {
        cantidad: Number(r.CANTIDAD),
        precioUnitSnap: Number(r.PRECIO_UNIT_SNAP)
      }])
    );

    if (nombre != null || categoriaId != null) {
      await assertNombreUnicoPorCategoria(cn, {
        nombre:      nombre      != null ? nombre      : current.NOMBRE,
        categoriaId: categoriaId != null ? categoriaId : current.CATEGORIA_ID,
        excludeId: comboId
      });
    }

    // 3) Armar detResult / toInsert / toUpdate (cantidad fija = 1)
    const detResult = new Map(detActual);
    const toInsert = [], toUpdate = [];
    if (Array.isArray(itemsUpsert) && itemsUpsert.length) {
      for (const it of itemsUpsert) {
        const pid  = Number(it.productoId);
        const cant = 1; // fijo
        const snap = it?.precioUnitSnap ?? null;

        const cur = detResult.get(pid);
        if (!cur) {
          detResult.set(pid, { cantidad: cant, precioUnitSnap: snap });
          toInsert.push({ combo: comboId, prod: pid, cant, snap });
        } else {
          detResult.set(pid, {
            cantidad: cant,
            precioUnitSnap: (snap != null ? snap : cur.precioUnitSnap)
          });
          const needQty   = Number(cur.cantidad) !== cant;
          const needPrice = it?.precioUnitSnap != null && Number(cur.precioUnitSnap) !== Number(snap);
          if (needQty || needPrice) {
            toUpdate.push({
              combo: comboId, prod: pid, cant,
              snap: needPrice ? Number(snap) : Number(cur.precioUnitSnap)
            });
          }
        }
      }
    }

    // 4) Reglas 2..5
    const finalCount = detResult.size;
    if (finalCount > 5) return res.status(400).json({ message: "El combo no puede tener más de 5 productos." });
    if (finalCount < 2) return res.status(400).json({ message: "El combo debe incluir al menos 2 productos." });

    // 5) Validación de stock (cantidad fija = 1 por producto)
    if (detResult.size) {
      const requiredByPid = new Map();
      for (const [pid] of detResult.entries()) {
        requiredByPid.set(Number(pid), 1);
      }
      const stockMap = await getStockDisponibleMap(cn, [...requiredByPid.keys()]);

      const pids = [...requiredByPid.keys()];
      const nb = Object.fromEntries(pids.map((v, i) => [`p${i}`, Number(v)]));
      const nm = pids.map((_v, i) => `:p${i}`).join(",");
      const rsNames = await cn.execute(
        `SELECT ID, NOMBRE FROM PRODUCTO_NUEVO WHERE ID IN (${nm})`,
        nb, { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const nameById = new Map((rsNames.rows || []).map(r => [Number(r.ID), String(r.NOMBRE || "")]));

      const faltantes = [];
      for (const [pid, reqQty] of requiredByPid.entries()) {
        const disp = Number(stockMap.get(pid) || 0);
        if (reqQty > disp) {
          faltantes.push({
            productoId: pid,
            producto: nameById.get(pid) || `ID ${pid}`,
            requerido: reqQty,
            disponible: disp
          });
        }
      }
      if (faltantes.length) {
        if (faltantes.length === 1) {
          const f = faltantes[0];
          return res.status(400).json({
            message: `Stock insuficiente para "${f.producto}". Requerido: ${f.requerido}, disponible: ${f.disponible}.`
          });
        } else {
          const human = faltantes
            .map(f => `"${f.producto}" (req ${f.requerido}, disp ${f.disponible})`)
            .join("; ");
          return res.status(400).json({
            code: "STOCK_INSUFICIENTE",
            message: "Hay varios productos con stock insuficiente.",
            humanMessage: `Stock insuficiente: ${human}.`,
            detalle: faltantes
          });
        }
      }
    }

    // 6) Subir imagen si viene
    const hasFile = !!req.file;
    if (hasFile) {
      try { newImageUrl = await subirImagenDeReq(req); }
      catch (e) { return res.status(e.status || 500).json({ message: e.message || "Error al subir imagen." }); }
    }

    // 7) Diferir trigger si toca precio y detalle
    activarDiferido = (toInsert.length || toUpdate.length) && (precioVenta != null);
    if (activarDiferido) {
      await cn.execute(`BEGIN combo_policy_ctx.defer_on; END;`);
    }

    await cn.execute("SAVEPOINT sp_upd_combo");

    let upserts = 0, qtyUpdates = 0, headerUpdates = 0;

    if (toInsert.length) {
      await cn.executeMany(
        `INSERT INTO DETALLE_COMBO (COMBO_ID, PRODUCTO_ID, CANTIDAD, PRECIO_UNIT_SNAP)
         SELECT :combo, :prod, :cant,
                NVL(:snap, (SELECT PRECIO_VENTA FROM PRODUCTO_NUEVO WHERE ID = :prod))
         FROM DUAL`,
        toInsert,
        { autoCommit: false,
          bindDefs: {
            combo: { type: oracledb.NUMBER },
            prod:  { type: oracledb.NUMBER },
            cant:  { type: oracledb.NUMBER },
            snap:  { type: oracledb.NUMBER }
          }
        }
      );
      upserts = toInsert.length;
    }

    if (toUpdate.length) {
      await cn.executeMany(
        `UPDATE DETALLE_COMBO
            SET CANTIDAD = :cant,
                PRECIO_UNIT_SNAP = :snap
          WHERE COMBO_ID = :combo AND PRODUCTO_ID = :prod`,
        toUpdate,
        { autoCommit: false,
          bindDefs: {
            combo: { type: oracledb.NUMBER },
            prod:  { type: oracledb.NUMBER },
            cant:  { type: oracledb.NUMBER },
            snap:  { type: oracledb.NUMBER }
          }
        }
      );
      qtyUpdates = toUpdate.length;
    }

    // 9) Suma para política precio (toma lo que quedó en BD)
    const sumQ = await cn.execute(
      `SELECT NVL(SUM(d.CANTIDAD * p.PRECIO_VENTA), 0) AS SUMA
         FROM DETALLE_COMBO d
         JOIN PRODUCTO_NUEVO p ON p.ID = d.PRODUCTO_ID
        WHERE d.COMBO_ID = :id`,
      { id: comboId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const sumaBD = Number(sumQ?.rows?.[0]?.SUMA || 0);
    const minPermitido = +(sumaBD * MIN_PCT).toFixed(2);
    const maxPermitido = +sumaBD.toFixed(2);

    // 10) Armado UPDATE cabecera
    const sets = [];
    const binds = { id: comboId };
    const changed = (oldV, newV) => {
      if (newV == null) return false;
      if (typeof oldV === "number" || typeof newV === "number") {
        const a = Number(oldV), b = Number(newV);
        return !(Number.isFinite(a) && Number.isFinite(b) && a === b);
      }
      return String(oldV ?? "") !== String(newV ?? "");
    };

    if (changed(current.NOMBRE,        nombre))      { sets.push("NOMBRE = :nombre");             binds.nombre = nombre; }
    if (changed(current.DESCRIPCION,   descripcion)) { sets.push("DESCRIPCION = :descripcion");   binds.descripcion = descripcion; }
    if (changed(current.ESTADO_ID,     estadoId))    { sets.push("ESTADO_ID = :estadoId");        binds.estadoId = estadoId; }
    if (changed(current.CATEGORIA_ID,  categoriaId)) { sets.push("CATEGORIA_ID = :categoriaId");  binds.categoriaId = categoriaId; }
    if (changed(current.USUARIO_ID,    usuarioId))   { sets.push("USUARIO_ID = :usuarioId");      binds.usuarioId = usuarioId; }
    let imageChanged = false;
    if (hasFile && newImageUrl) { sets.push("IMAGEN = :imagen"); binds.imagen = newImageUrl; imageChanged = true; }

    // Delta de cantidad disponible (sumar/restar a la actual)
   const deltaRaw = (cantidadDisponibleDelta ?? cantidadDisponible);
const delta = (deltaRaw != null) ? Number(String(deltaRaw).replace(",", ".")) : null;

let nuevaCantidadDisponible = cantDispActual;
if (Number.isFinite(delta)) {
  // sumar al valor actual de BD; permitir negativos; nunca bajar de 0
  nuevaCantidadDisponible = Math.max(0, Math.trunc(cantDispActual + delta));
  if (nuevaCantidadDisponible !== cantDispActual) {
    sets.push("CANTIDAD_DISPONIBLE = :cantDisp");
    binds.cantDisp = nuevaCantidadDisponible;
  }
}

    // Política de precio
    let precioFinal = precioVenta != null ? Number(precioVenta) : null;
    if (precioFinal != null) {
      if (autoAjustarPrecio) {
        const clamped = Math.min(Math.max(precioFinal, minPermitido), maxPermitido);
        if (Math.abs(clamped - precioFinal) > EPS) {
          sets.push("PRECIO_VENTA = :precioVenta");
          binds.precioVenta = clamped;
          sets.push("DESCRIPCION = :descripcion");
          const nota = `⚠ Precio ajustado automáticamente a Q${clamped.toFixed(2)} (mín. Q${minPermitido.toFixed(2)}, máx. Q${maxPermitido.toFixed(2)}).`;
          const baseDesc = (descripcion != null ? String(descripcion || "") : String(current.DESCRIPCION || ""));
          binds.descripcion = baseDesc ? `${baseDesc}\n${nota}` : nota;
        } else {
          sets.push("PRECIO_VENTA = :precioVenta"); binds.precioVenta = precioFinal;
        }
      } else {
        if (precioFinal - maxPermitido > EPS) {
          await cn.rollback();
          if (activarDiferido) await cn.execute(`BEGIN combo_policy_ctx.defer_off; END;`);
          if (newImageUrl) {
            try {
              const prefix = `https://storage.googleapis.com/${bucket.name}/`;
              if (newImageUrl.startsWith(prefix)) {
                const newPath = newImageUrl.substring(prefix.length);
                await bucket.file(newPath).delete({ ignoreNotFound: true });
              }
            } catch {}
          }
          return res.status(400).json({
            code: "PRECIO_SUPERA_SUMA",
            message: "El precio del combo no puede exceder la suma de componentes.",
            rangoPermitido: { minimo: minPermitido, maximo: maxPermitido },
            sugerencia: "Activa 'autoAjustarPrecio' o reduce el precio."
          });
        }
        if (minPermitido - precioFinal > EPS) {
          await cn.rollback();
          if (activarDiferido) await cn.execute(`BEGIN combo_policy_ctx.defer_off; END;`);
          if (newImageUrl) {
            try {
              const prefix = `https://storage.googleapis.com/${bucket.name}/`;
              if (newImageUrl.startsWith(prefix)) {
                const newPath = newImageUrl.substring(prefix.length);
                await bucket.file(newPath).delete({ ignoreNotFound: true });
              }
            } catch {}
          }
          return res.status(400).json({
            code: "PRECIO_POR_DEBAJO_MINIMO",
            message: "El precio del combo es menor al mínimo permitido según política.",
            rangoPermitido: { minimo: minPermitido, maximo: maxPermitido },
            sugerencia: "Activa 'autoAjustarPrecio' o incrementa el precio / reduce cantidades."
          });
        }
        sets.push("PRECIO_VENTA = :precioVenta"); binds.precioVenta = precioFinal;
      }
    } else {
      if (minPermitido - precioActual > EPS) {
        return res.status(400).json({
          code: "PRECIO_ACTUAL_INSUFICIENTE",
          message: `El precio actual del combo (Q${precioActual.toFixed(2)}) queda por debajo del mínimo (Q${minPermitido.toFixed(2)}) con el nuevo detalle.`,
          accionRequerida: "Envía 'precioVenta' dentro del rango o activa 'autoAjustarPrecio=1'.",
          rangoPermitido: { minimo: minPermitido, maximo: maxPermitido }
        });
      }
    }

    // 12) UPDATE COMBO
    if (sets.length) {
      const upd = await cn.execute(
        `UPDATE COMBO SET ${sets.join(", ")} WHERE ID = :id`,
        binds,
        { autoCommit: false }
      );
      headerUpdates = upd.rowsAffected || 0;
    }

    const totalChanges = headerUpdates + upserts + qtyUpdates;
    if (totalChanges === 0) {
      await cn.rollback();
      if (activarDiferido) await cn.execute(`BEGIN combo_policy_ctx.defer_off; END;`);
      return res.status(200).json({ message: "Sin cambios", changes: { headerUpdates, upserts, qtyUpdates } });
    }

    if (activarDiferido) await cn.execute(`BEGIN combo_policy_ctx.defer_off; END;`);
    await cn.commit();

    // Imagen anterior best-effort
    if (hasFile && newImageUrl) {
      const oldUrl = current.IMAGEN || null;
      if (oldUrl && typeof oldUrl === "string") {
        try {
          const prefix = `https://storage.googleapis.com/${bucket.name}/`;
          if (oldUrl.startsWith(prefix)) {
            const oldPath = oldUrl.substring(prefix.length);
            await bucket.file(oldPath).delete({ ignoreNotFound: true });
          }
        } catch (e) {
          console.warn("⚠️ No se pudo borrar la imagen anterior:", e.message || e);
        }
      }
    }

    const updatedFields = sets.map(s => s.split("=")[0].trim());
    const alerta =
      autoAjustarPrecio && precioFinal != null &&
      (precioFinal < minPermitido - EPS || precioFinal > maxPermitido + EPS)
        ? `⚠ Ajustamos el precio al rango permitido [Q${minPermitido.toFixed(2)} .. Q${maxPermitido.toFixed(2)}].`
        : undefined;

    return res.status(200).json({
      message: "Combo actualizado correctamente.",
      ...(alerta ? { alerta } : {}),
      cambios: { updatedFields, upserts, qtyUpdates },
      imagenUrl: newImageUrl || undefined,
      cantidadDisponible: nuevaCantidadDisponible,
      cantidadDisponibleAnterior: cantDispActual,
    });

  } catch (err) {
    if (newImageUrl) {
      try {
        const prefix = `https://storage.googleapis.com/${bucket.name}/`;
        if (newImageUrl.startsWith(prefix)) {
          const newPath = newImageUrl.substring(prefix.length);
          await bucket.file(newPath).delete({ ignoreNotFound: true });
        }
      } catch {}
    }
    try { if (cn) await cn.rollback(); } catch {}
    try { if (cn && activarDiferido) await cn.execute(`BEGIN combo_policy_ctx.defer_off; END;`); } catch {}
    console.error("❌ Error actualizando cabecera de combo:", err);
    return res.status(500).json({
      message: "Error al actualizar combo.",
      detalle: (err && err.message) || String(err)
    });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};
