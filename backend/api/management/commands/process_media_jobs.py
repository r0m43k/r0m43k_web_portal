import time

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from api.models import MediaJob
from api.utils.media import (
    MediaProcessingCancelled,
    prepare_video_for_streaming,
)


class Command(BaseCommand):
    help = "Process media jobs (faststart + HLS) in background."

    def add_arguments(self, parser):
        parser.add_argument(
            "--once",
            action="store_true",
            help="Run a single job and exit.",
        )
        parser.add_argument(
            "--sleep",
            type=int,
            default=2,
            help="Sleep seconds when no jobs are available.",
        )

    def handle(self, *args, **options):
        run_once = options["once"]
        sleep_time = options["sleep"]
        self._reset_interrupted_jobs()

        while True:
            job = self._acquire_job()
            if not job:
                if run_once:
                    return
                time.sleep(sleep_time)
                continue

            ok, err, canceled = self._process_job(job)
            self._finish_job(job, ok, err, canceled=canceled)

            if run_once:
                return

    def _reset_interrupted_jobs(self):
        MediaJob.objects.filter(status=MediaJob.Status.PROCESSING).update(
            status=MediaJob.Status.PENDING,
            stage="queued:resume",
            progress=0,
            started_at=None,
            error="",
            cancel_requested=False,
            updated_at=timezone.now(),
        )

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
            now = timezone.now()
            job.status = MediaJob.Status.PROCESSING
            job.stage = "starting"
            job.progress = max(1, int(job.progress or 0))
            job.started_at = now
            job.error = ""
            job.cancel_requested = False
            job.attempt_count = int(job.attempt_count or 0) + 1
            job.save(
                update_fields=[
                    "status",
                    "stage",
                    "progress",
                    "started_at",
                    "error",
                    "cancel_requested",
                    "attempt_count",
                    "updated_at",
                ]
            )
            return job

    def _is_cancel_requested(self, job_id: int) -> bool:
        return MediaJob.objects.filter(
            pk=job_id,
            cancel_requested=True,
            status=MediaJob.Status.PROCESSING,
        ).exists()

    def _set_progress(self, job_id: int, percent: int, stage: str):
        bounded = max(0, min(99, int(percent)))
        MediaJob.objects.filter(pk=job_id).update(
            progress=bounded,
            stage=stage,
            updated_at=timezone.now(),
        )

    def _process_job(self, job: MediaJob):
        try:
            if self._is_cancel_requested(job.pk):
                raise MediaProcessingCancelled("cancel requested")

            def progress_cb(percent, stage):
                self._set_progress(job.pk, percent, stage)

            def should_abort():
                return self._is_cancel_requested(job.pk)

            if job.kind == MediaJob.Kind.HERO and job.hero_id:
                ok = prepare_video_for_streaming(
                    job.hero.file,
                    model=job.hero,
                    kind="hero",
                    progress_callback=progress_cb,
                    should_abort=should_abort,
                )
            elif job.kind == MediaJob.Kind.VIDEO and job.video_id:
                ok = prepare_video_for_streaming(
                    job.video.file,
                    model=job.video,
                    kind="video",
                    progress_callback=progress_cb,
                    should_abort=should_abort,
                )
            else:
                return False, "job target missing", False

            if self._is_cancel_requested(job.pk):
                raise MediaProcessingCancelled("cancel requested")

            return ok, "" if ok else "processing failed", False
        except MediaProcessingCancelled as exc:
            return False, str(exc), True
        except Exception as exc:
            return False, str(exc), False

    def _finish_job(
        self,
        job: MediaJob,
        ok: bool,
        err: str,
        canceled: bool = False,
    ):
        now = timezone.now()
        current_progress = (
            MediaJob.objects.filter(pk=job.pk)
            .values_list("progress", flat=True)
            .first()
            or 0
        )
        if canceled:
            status_value = MediaJob.Status.CANCELED
            stage_value = "canceled"
            progress_value = min(99, int(current_progress))
        elif ok:
            status_value = MediaJob.Status.DONE
            stage_value = "done"
            progress_value = 100
        else:
            status_value = MediaJob.Status.FAILED
            stage_value = "failed"
            progress_value = min(99, int(current_progress))

        MediaJob.objects.filter(pk=job.pk).update(
            status=status_value,
            stage=stage_value,
            progress=progress_value,
            finished_at=now,
            error="" if ok else (err or "processing failed"),
            cancel_requested=False,
            updated_at=now,
        )
