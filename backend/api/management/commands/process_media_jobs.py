import time

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from api.models import MediaJob
from api.utils.media import prepare_video_for_streaming


class Command(BaseCommand):
    help = "Process video media jobs (faststart + HLS) in background."

    def add_arguments(self, parser):
        parser.add_argument(
            "--once",
            action="store_true",
            help="Run a single job and exit.",
        )
        parser.add_argument(
            "--sleep",
            type=int,
            default=5,
            help="Sleep seconds when no jobs are available.",
        )

    def handle(self, *args, **options):
        run_once = options["once"]
        sleep_time = options["sleep"]

        while True:
            job = self._acquire_job()
            if not job:
                if run_once:
                    return
                time.sleep(sleep_time)
                continue

            ok, err = self._process_job(job)
            self._finish_job(job, ok, err)

            if run_once:
                return

    def _acquire_job(self):
        with transaction.atomic():
            job = (
                MediaJob.objects.select_for_update(skip_locked=True)
                .filter(status=MediaJob.Status.PENDING)
                .order_by("created_at")
                .first()
            )
            if not job:
                return None
            job.status = MediaJob.Status.PROCESSING
            job.started_at = timezone.now()
            job.save(update_fields=["status", "started_at", "updated_at"])
            return job

    def _process_job(self, job: MediaJob):
        try:
            if job.kind == MediaJob.Kind.HERO and job.hero_id:
                ok = prepare_video_for_streaming(
                    job.hero.file,
                    model=job.hero,
                    kind="hero",
                )
            elif job.kind == MediaJob.Kind.VIDEO and job.video_id:
                ok = prepare_video_for_streaming(
                    job.video.file,
                    model=job.video,
                    kind="video",
                )
            else:
                return False, "Job target missing"
            return ok, ""
        except Exception as exc:
            return False, str(exc)

    def _finish_job(self, job: MediaJob, ok: bool, err: str):
        job.status = MediaJob.Status.DONE if ok else MediaJob.Status.FAILED
        job.finished_at = timezone.now()
        job.error = "" if ok else (err or "processing failed")
        job.save(update_fields=["status", "finished_at", "error", "updated_at"])
