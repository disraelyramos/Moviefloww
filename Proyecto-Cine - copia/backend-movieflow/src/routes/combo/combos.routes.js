// routes/combo/combos.routes.js
const express = require('express');
const multer = require('multer');

// usar memoria para subir a Firebase (req.file.buffer)
const upload = multer({ storage: multer.memoryStorage() });

const ctrl = require('../../controllers/combo/CrearcomboProducto.controller');

const r = express.Router();

r.get('/api/categoria-combo', ctrl.listarCategoriasCombo);
r.get('/api/combos', ctrl.listarCombos);
r.post('/api/combos', upload.single('imagen'), ctrl.crearComboProducto);
r.get('/api/combos/buscar', ctrl.buscarCombos);
r.get('/api/combos/:id', ctrl.obtenerComboCompleto); // o ctrl.obtenerComboPorId
r.put('/api/combos/:id/cabecera', upload.single('imagen'), ctrl.actualizarComboCabecera);

module.exports = r;
