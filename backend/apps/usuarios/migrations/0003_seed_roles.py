from django.db import migrations


def create_default_roles(apps, schema_editor):
    Rol = apps.get_model("usuarios", "Rol")
    for nombre in ("Administrador", "Inventario", "Consulta"):
        Rol.objects.get_or_create(nombre=nombre)


class Migration(migrations.Migration):

    dependencies = [
        ("usuarios", "0002_unify_user_active"),
    ]

    operations = [
        migrations.RunPython(
            create_default_roles,
            migrations.RunPython.noop,
        ),
    ]
