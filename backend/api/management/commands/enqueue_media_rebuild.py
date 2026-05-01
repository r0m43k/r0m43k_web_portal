from django.core.management.base import BaseCommand

from api.models import MediaJob, Video


class Command(BaseCommand):
    help = "Queue existing videos for HLS rebuild without blocking deploy."

    def handle(self, *args, **options):
        queued = 0
        skipped = 0

        videos = Video.objects.exclude(file="").order_by("id")
        for video in videos:
            has_active_job = MediaJob.objects.filter(
                kind=MediaJob.Kind.VIDEO,
                video=video,
                status__in=[
                    MediaJob.Status.PENDING,
                    MediaJob.Status.PROCESSING,
                ],
            ).exists()
            if has_active_job:
                skipped += 1
                continue

            MediaJob.objects.create(
                kind=MediaJob.Kind.VIDEO,
                video=video,
                status=MediaJob.Status.PENDING,
                stage="queued:hls-rebuild",
                progress=0,
            )
            queued += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Queued HLS rebuilds: {queued}, skipped active: {skipped}."
            )
        )
