// routes/inventario/productoPorLote.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/inventario/productoPorLote.controller');
const sanitize = require('../../middlewares/sanitize.middleware');

// Crear / incrementar producto por lote
router.post('/', sanitize, ctrl.crearProductoPorLote);

// Actualizar (cantidad y/o fechaVencimiento) por ID_POR_LOTE
router.put('/:id', sanitize, ctrl.actualizarProductoPorLote);
router.get('/', sanitize, ctrl.listarPorProducto);


module.exports = router;
