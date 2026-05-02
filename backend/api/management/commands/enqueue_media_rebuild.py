import os

from django.core.management.base import BaseCommand

from api.models import MediaJob, Video
from api.utils.media import hls_manifest_path


class Command(BaseCommand):
    help = "Queue missing or outdated HLS rebuilds without blocking deploy."

    def handle(self, *args, **options):
        queued = 0
        skipped = 0
        current_target_duration = int(os.getenv("HLS_SEGMENT_SECONDS") or "1")

        for video in Video.objects.exclude(file="").order_by("id"):
            did_queue = self._queue_if_needed(
                MediaJob.Kind.VIDEO,
                video.pk,
                current_target_duration,
                video=video,
            )
            queued += 1 if did_queue is True else 0
            skipped += 1 if did_queue is False else 0

        self.stdout.write(
            self.style.SUCCESS(
                "Queued HLS rebuilds: "
                f"{queued}, skipped current/active: {skipped}."
            )
        )

    def _queue_if_needed(self, kind, object_id, target_duration, **target):
        active_filters = {
            "kind": kind,
            "status__in": [
                MediaJob.Status.PENDING,
                MediaJob.Status.PROCESSING,
            ],
            **target,
        }
        if MediaJob.objects.filter(**active_filters).exists():
            return False

        manifest = hls_manifest_path(kind, object_id)
        if self._manifest_is_current(manifest, target_duration):
            return False

        MediaJob.objects.create(
            kind=kind,
            status=MediaJob.Status.PENDING,
            stage="queued:hls-rebuild",
            progress=0,
            **target,
        )
        return True

    def _manifest_is_current(self, manifest, target_duration):
        if not manifest.exists():
            return False
        try:
            text = manifest.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return False
        for line in text.splitlines():
            if line.startswith("#EXT-X-TARGETDURATION:"):
                try:
                    duration = int(line.split(":", 1)[1].strip())
                except ValueError:
                    return False
                return duration <= target_duration + 1
        child_playlists = [
            manifest.parent / line.strip()
            for line in text.splitlines()
            if line.strip()
            and not line.startswith("#")
            and line.strip().endswith(".m3u8")
        ]
        if child_playlists:
            return all(
                self._manifest_is_current(child, target_duration)
                for child in child_playlists
            )
        return False
