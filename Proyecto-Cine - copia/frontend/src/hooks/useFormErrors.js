import { useState, useCallback } from "react";

/**
 * Manejo de errores de formulario.
 * - setErrors(obj): reemplaza el estado con errores de validación.
 * - hasError(name): boolean si el campo tiene error.
 * - msg(name): mensaje del campo (string | undefined).
 * - clearField(name): limpia el error de un campo.
 * - clearAll(): limpia todos los errores.
 */
export default function useFormErrors(initial = {}) {
  const [errors, setErrors] = useState(initial);

  const hasError = useCallback((name) => Boolean(errors?.[name]), [errors]);
  const msg = useCallback((name) => errors?.[name], [errors]);

  const clearField = useCallback((name) => {
    setErrors((prev) => {
      if (!prev?.[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setErrors({}), []);

  const setFieldError = useCallback((name, message) => {
    setErrors((prev) => ({ ...prev, [name]: message }));
  }, []);

  return { errors, setErrors, hasError, msg, clearField, clearAll, setFieldError };
}
