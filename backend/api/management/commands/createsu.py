import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

class Command(BaseCommand):
    help = "Create superuser from env vars"

    def handle(self, *args, **options):
        username = os.getenv("SUPERUSER_USERNAME")
        password = os.getenv("SUPERUSER_PASSWORD")
        email = os.getenv("SUPERUSER_EMAIL", "")

        if not username or not password:
            self.stdout.write("Superuser env vars not set, skipping")
            return

        if User.objects.filter(username=username).exists():
            self.stdout.write("Superuser already exists")
            return

        User.objects.create_superuser(
            username=username,
            password=password,
            email=email,
        )
        self.stdout.write("Superuser created")
