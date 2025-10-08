import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

/**
 * 📌 Confirmación genérica antes de enviar peticiones
 */
export const confirmarAccion = async ({
  title = "¿Estás seguro?",
  text = "No podrás revertir esta acción",
  confirmButtonText = "Sí, continuar",
  onConfirm,
}) => {
  const result = await MySwal.fire({
    title,
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText,
    cancelButtonText: "Cancelar",
  });

  if (result.isConfirmed && typeof onConfirm === "function") {
    try {
      await onConfirm(); // 🚀 petición al backend
    } catch (error) {
      console.error(" Error en la operación:", error);

      // 🔹 Mensaje claro desde el backend si existe
      const backendMsg =
        error.response?.data?.message || "Ocurrió un problema en la operación";

      await MySwal.fire({
        title: " Error",
        text: backendMsg,
        icon: "error",
        confirmButtonColor: "#3085d6",
        confirmButtonText: "Entendido",
      });
    }
  }
};
