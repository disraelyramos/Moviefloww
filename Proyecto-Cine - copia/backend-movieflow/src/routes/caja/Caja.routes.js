const express = require("express");
const router = express.Router();
const cajasController = require("../../controllers/caja/Cajas.controller");

// 🔹 Endpoint: consultar estado de la caja por usuario
// Ejemplo: GET /api/cajas/estado?usuario_id=86
router.get("/estado", cajasController.getEstadoCajaPorUsuario);

module.exports = router;
