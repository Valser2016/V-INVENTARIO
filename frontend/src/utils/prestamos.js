export const fechaMinimaPrestamo = () => {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    return new Date(manana.getTime() - manana.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
};

export const alternarActivoSeleccionado = (activos, id) => {
    const activoId = Number(id);
    return activos.includes(activoId)
        ? activos.filter((actual) => actual !== activoId)
        : [...activos, activoId];
};
