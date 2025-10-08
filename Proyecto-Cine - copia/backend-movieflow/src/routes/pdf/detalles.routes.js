const express = require("express");
const router = express.Router();

// 👇 Estás dentro de routes/pdf, así que sube dos niveles
const ctrl = require("../../controllers/pdf/detallesVenta.controller");

// POST porque enviamos el snapshot (filtros + rows) en el body
router.post("/pdf/detalles-venta", ctrl.generarDetallesVentaPDF);

module.exports = router;
