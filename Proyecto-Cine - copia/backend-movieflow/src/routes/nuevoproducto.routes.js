const express = require('express');
const multer = require('multer');
const nuevoProductoController = require('../controllers/nuevoproducto.controller');

const router = express.Router();

// Configuración de multer en memoria (no guarda en disco)
const upload = multer();

// 📌 Crear nuevo producto con imagen
router.post('/', upload.single('imagen'), nuevoProductoController.crearProducto);

// 📌 Listar todos los productos
router.get('/', nuevoProductoController.getProductos);

// 📌 Eliminar producto por ID
router.delete('/:id', nuevoProductoController.eliminarProducto);

router.put('/:id', upload.single('imagen'), nuevoProductoController.actualizarProducto);

module.exports = router;
