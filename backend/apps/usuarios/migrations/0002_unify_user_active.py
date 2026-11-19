from django.db import migrations


def preserve_inactive_accounts(apps, schema_editor):
    Usuario = apps.get_model("usuarios", "Usuario")
    Usuario.objects.filter(activo=False).update(is_active=False)


def restore_active_flag(apps, schema_editor):
    Usuario = apps.get_model("usuarios", "Usuario")
    Usuario.objects.filter(is_active=False).update(activo=False)


class Migration(migrations.Migration):

    dependencies = [
        ("usuarios", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            preserve_inactive_accounts,
            restore_active_flag,
        ),
        migrations.RemoveField(
            model_name="usuario",
            name="activo",
        ),
    ]
