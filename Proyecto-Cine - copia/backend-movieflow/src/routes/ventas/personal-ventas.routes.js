const express = require("express");
const router = express.Router();

const personalVentasController = require("../../controllers/ventas/personalventas.controller");

// ✅ Endpoint para listar productos visibles al personal de ventas
router.get("/productos", personalVentasController.listarProductos);
router.get("/producto/:id", personalVentasController.obtenerProducto);
router.post("/procesar", personalVentasController.procesarVenta);


module.exports = router;
