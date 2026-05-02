from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0006_photo_carousel_item"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="video",
            options={
                "ordering": [
                    "display_order",
                    "-published_at",
                    "-created_at",
                    "-id",
                ],
            },
        ),
    ]
