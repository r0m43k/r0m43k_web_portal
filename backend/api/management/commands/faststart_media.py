from django.core.management.base import BaseCommand

from api.models import HeroVideo, Video
from api.utils.media import prepare_video_for_streaming


class Command(BaseCommand):
    help = "Move MP4 moov atom to the beginning for faster streaming playback."

    def handle(self, *args, **options):
        total = 0
        success = 0

        for video in Video.objects.exclude(file=""):
            total += 1
            if prepare_video_for_streaming(video.file, model=video):
                success += 1

        for hero in HeroVideo.objects.exclude(file=""):
            total += 1
            if prepare_video_for_streaming(hero.file, model=hero):
                success += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Faststart processed: {success}/{total} files."
            )
        )
