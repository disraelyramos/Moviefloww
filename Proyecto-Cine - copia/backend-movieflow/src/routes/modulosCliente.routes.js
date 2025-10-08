const express = require("express");
const router = express.Router();
const modulosClienteController = require("../controllers/modulosCliente.controller");

// 📌 Admin → obtener TODOS los módulos cliente (con submódulos y estados)
router.get("/", modulosClienteController.getModulosCliente);

// 📌 Cliente → obtener SOLO los módulos y submódulos activos
router.get("/activos", modulosClienteController.getMenuCliente);

router.post("/guardar", modulosClienteController.guardarEstados);

module.exports = router;
