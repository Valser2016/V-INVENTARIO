from django.db import migrations, models


def asignar_permisos_operativos(apps, schema_editor):
    Rol = apps.get_model("usuarios", "Rol")
    database = schema_editor.connection.alias
    Rol.objects.using(database).filter(
        nombre__iexact="Administrador"
    ).update(
        puede_modificar_inventario=True,
        puede_administrar_catalogos=True,
        puede_aprobar_solicitudes_prestamo=True,
    )
    Rol.objects.using(database).filter(
        nombre__iexact="Inventario"
    ).update(
        puede_modificar_inventario=True,
        puede_administrar_catalogos=True,
        puede_registrar_devoluciones=True,
        puede_revisar_solicitudes_prestamo=True,
        puede_aprobar_solicitudes_prestamo=True,
    )


def revertir_permisos_operativos(apps, schema_editor):
    Rol = apps.get_model("usuarios", "Rol")
    database = schema_editor.connection.alias
    Rol.objects.using(database).filter(
        nombre__iexact="Administrador"
    ).update(
        puede_modificar_inventario=False,
        puede_administrar_catalogos=False,
        puede_aprobar_solicitudes_prestamo=False,
    )
    Rol.objects.using(database).filter(
        nombre__iexact="Inventario"
    ).update(
        puede_modificar_inventario=False,
        puede_administrar_catalogos=False,
        puede_registrar_devoluciones=False,
        puede_revisar_solicitudes_prestamo=False,
        puede_aprobar_solicitudes_prestamo=False,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("usuarios", "0006_rol_puede_revisar_solicitudes_prestamo"),
    ]

    operations = [
        migrations.AddField(
            model_name="rol",
            name="puede_modificar_inventario",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="rol",
            name="puede_administrar_catalogos",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="rol",
            name="puede_aprobar_solicitudes_prestamo",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(
            asignar_permisos_operativos,
            revertir_permisos_operativos,
        ),
    ]
