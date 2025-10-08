const admin = require('firebase-admin');
const { getStorage } = require('firebase-admin/storage');
const serviceAccount = require('./firebaseServiceAccount.json');

// Inicializar Firebase solo una vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "movieflow-148af.firebasestorage.app", // ✅ bucket corregido
  });

  console.log("🔥 Firebase Admin inicializado con bucket:", "movieflow-148af.firebasestorage.app");
}

// Exportar el bucket para subir archivos
const bucket = getStorage().bucket();
module.exports = bucket;
