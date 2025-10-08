const express = require("express");
const router = express.Router();
const { actualizarProducto, eliminarProducto } = require("../controllers/actualizar-producto.controller");

// 📌 Actualizar producto (PUT)
router.put("/:id", actualizarProducto);

// 📌 Eliminar producto (DELETE)
router.delete("/:id", eliminarProducto);

module.exports = router;
