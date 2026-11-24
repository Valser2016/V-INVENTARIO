import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("movimientos", "0006_prestamo_cliente_prestamo_consecutivo_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="ConsumiblePrestamo",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("nombre", models.CharField(max_length=200)),
                ("cantidad", models.PositiveIntegerField()),
                (
                    "cantidad_recibida",
                    models.PositiveIntegerField(blank=True, null=True),
                ),
                (
                    "prestamo",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="consumibles",
                        to="movimientos.prestamo",
                    ),
                ),
            ],
            options={
                "db_table": "consumibles_prestamo",
                "ordering": ["pk"],
            },
        ),
    ]
