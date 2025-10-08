// ───────────────────────────────────────────────────────────────
// Validaciones de campos de texto específicos (tus originales)
// ───────────────────────────────────────────────────────────────
export function validarNombre(nombre) {
  if (!nombre) return "El nombre es obligatorio";
  if (/^\d+$/.test(nombre)) return "El nombre no puede ser solo números";
  if (/\s{2,}/.test(nombre)) return "El nombre no puede contener múltiples espacios seguidos";
  if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/.test(nombre)) {
    return "El nombre solo puede contener letras y espacios";
  }
  return null; // null = sin error
}

export function validarUsuario(usuario) {
  if (!usuario) return "El usuario es obligatorio";
  if (!/^[A-Za-z0-9]{1,9}$/.test(usuario)) {
    return "El usuario debe tener máximo 9 caracteres alfanuméricos, sin espacios ni caracteres especiales";
  }
  return null;
}

export function validarContrasena(contrasena) {
  if (!contrasena) return "La contraseña es obligatoria";
  if (contrasena.length > 20) return "La contraseña no puede exceder 20 caracteres";
  return null;
}

// ───────────────────────────────────────────────────────────────
// Utilidades genéricas para formularios
// ───────────────────────────────────────────────────────────────

// Valida que los campos requeridos no estén vacíos.
// Devuelve un objeto { campo: "mensaje" } con solo los campos con error.
export function validarCamposObligatorios(formData, camposObligatorios = []) {
  const errores = {};
  for (const campo of camposObligatorios) {
    const v = formData?.[campo];
    if (v == null || String(v).trim() === "") {
      errores[campo] = "Este campo es obligatorio";
    }
  }
  return errores;
}

// Verifica que un valor sea un número > 0. Permite coma decimal.
export function validarNumeroPositivo(valor, campo = "valor") {
  const n = Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    return { [campo]: "Debe ser un número mayor a 0" };
  }
  return {};
}

// Une múltiples objetos de errores en uno solo.
// Ej: mergeErrores(errsA, errsB, errsC)
export function mergeErrores(...arr) {
  return arr.reduce((acc, cur) => Object.assign(acc, cur || {}), {});
}
