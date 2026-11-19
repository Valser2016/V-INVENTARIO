export function crearFormDataActivo(datos, foto) {
    const formData = new FormData();
    const datosConEstado = { ...datos, activo: datos.activo ?? true };

    Object.entries(datosConEstado).forEach(([campo, valor]) => {
        formData.append(
            campo,
            valor === null || valor === undefined ? "" : String(valor),
        );
    });

    if (foto) {
        formData.append("foto", foto);
    }

    return formData;
}
