// src/routes/peliculas.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

 const {
   getSelectData,
   createPelicula,
   listPeliculas,
   getPeliculaById,
   updatePelicula,
   deletePelicula,     // ⬅️ NUEVO
 } = require('../controllers/nuevapelicula.controller');

// -----------------------------
// Configuración de Multer
// -----------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads')); // carpeta donde guardar imágenes
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const nombreArchivo = `pelicula_${Date.now()}${ext}`;
    cb(null, nombreArchivo);
  }
});

// Filtrar solo imágenes
const fileFilter = (req, file, cb) => {
  const tiposPermitidos = /jpeg|jpg|png|webp/;
  const mimetype = tiposPermitidos.test(file.mimetype);
  const extname = tiposPermitidos.test(path.extname(file.originalname).toLowerCase());
  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP'));
};

const upload = multer({ storage, fileFilter });

// -----------------------------
// Rutas
// -----------------------------

// Ruta para traer datos de referencia (idiomas, clasificaciones, etc.)
router.get('/peliculas/select-data', getSelectData);

// Listar todas las películas

router.get('/peliculas', listPeliculas);

// Ruta para crear una nueva película (con o sin imagen)
router.post('/peliculas', upload.single('imagen'), createPelicula);

// Obtener una película por ID (incluye IDs de FKs y nombres)
router.get('/peliculas/:id', getPeliculaById);

// Actualizar película (con imagen opcional)
router.put('/peliculas/:id', upload.single('imagen'), updatePelicula);

// Eliminar película
router.delete('/peliculas/:id', deletePelicula);

module.exports = router;
