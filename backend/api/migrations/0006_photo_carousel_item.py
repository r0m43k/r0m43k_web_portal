from pathlib import Path

import api.models
from django.db import migrations, models


def seed_from_active_hero(apps, schema_editor):
    HeroVideo = apps.get_model("api", "HeroVideo")
    PhotoCarouselItem = apps.get_model("api", "PhotoCarouselItem")

    if PhotoCarouselItem.objects.exists():
        return

    hero = (
        HeroVideo.objects.filter(is_active=True)
        .order_by("-updated_at", "-id")
        .first()
    )
    if not hero:
        hero = HeroVideo.objects.order_by("-updated_at", "-id").first()
    if not hero or not hero.file:
        return

    ext = Path(hero.file.name).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"}:
        return

    PhotoCarouselItem.objects.create(
        title=hero.title or "",
        image=hero.file.name,
        display_order=1,
        is_active=True,
    )


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0005_video_display_order"),
    ]

    operations = [
        migrations.CreateModel(
            name="PhotoCarouselItem",
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
                ("title", models.CharField(blank=True, max_length=200)),
                (
                    "image",
                    models.FileField(
                        upload_to=api.models.raw_carousel_upload_to
                    ),
                ),
                (
                    "display_order",
                    models.PositiveIntegerField(db_index=True, default=0),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["display_order", "-created_at", "-id"],
            },
        ),
        migrations.RunPython(seed_from_active_hero, reverse_code=noop_reverse),
    ]
