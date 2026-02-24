import uuid
from pathlib import Path

from django.conf import settings
from django.db import models
from django.utils import timezone


def _build_raw_upload_path(prefix: str, filename: str) -> str:
    ext = Path(filename).suffix.lower() or ".mp4"
    day = timezone.now().strftime("%Y/%m/%d")
    return f"raw/{prefix}/{day}/{uuid.uuid4().hex}{ext}"


def raw_video_upload_to(_instance, filename: str) -> str:
    return _build_raw_upload_path("videos", filename)


def raw_hero_upload_to(_instance, filename: str) -> str:
    return _build_raw_upload_path("hero", filename)


class Video(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="videos",
    )
    title = models.CharField(max_length=200)
    file = models.FileField(upload_to=raw_video_upload_to)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    reject_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-published_at", "-created_at"]

    def save(self, *args, **kwargs):
        if self.status == self.Status.APPROVED and self.published_at is None:
            self.published_at = timezone.now()
        if self.status != self.Status.APPROVED:
            self.published_at = None
        super().save(*args, **kwargs)


class HeroVideo(models.Model):
    title = models.CharField(max_length=200, blank=True)
    file = models.FileField(upload_to=raw_hero_upload_to)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Hero video"
        verbose_name_plural = "Hero video"

    def __str__(self):
        return self.title or f"Hero video #{self.pk}"


class UploadSession(models.Model):
    class Status(models.TextChoices):
        CREATED = "created", "Created"
        UPLOADING = "uploading", "Uploading"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        CANCELED = "canceled", "Canceled"

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="upload_sessions",
    )
    video = models.ForeignKey(
        "Video",
        on_delete=models.SET_NULL,
        related_name="upload_sessions",
        null=True,
        blank=True,
    )
    filename = models.CharField(max_length=255, blank=True, default="")
    total_bytes = models.PositiveBigIntegerField(default=0)
    received_bytes = models.PositiveBigIntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.CREATED,
    )
    error = models.TextField(blank=True, default="")
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def progress_percent(self) -> int:
        if self.total_bytes <= 0:
            return 0
        ratio = (self.received_bytes / self.total_bytes) * 100
        return max(0, min(100, int(ratio)))


class MediaJob(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        DONE = "done", "Done"
        FAILED = "failed", "Failed"
        CANCELED = "canceled", "Canceled"

    class Kind(models.TextChoices):
        VIDEO = "video", "Video"
        HERO = "hero", "Hero"

    kind = models.CharField(max_length=20, choices=Kind.choices)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    stage = models.CharField(max_length=64, default="queued")
    progress = models.PositiveSmallIntegerField(default=0)
    cancel_requested = models.BooleanField(default=False)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    upload = models.ForeignKey(
        "UploadSession",
        on_delete=models.SET_NULL,
        related_name="jobs",
        null=True,
        blank=True,
    )
    video = models.ForeignKey(
        "Video",
        on_delete=models.CASCADE,
        related_name="media_jobs",
        null=True,
        blank=True,
    )
    hero = models.ForeignKey(
        "HeroVideo",
        on_delete=models.CASCADE,
        related_name="media_jobs",
        null=True,
        blank=True,
    )
    error = models.TextField(blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        target = self.video_id or self.hero_id
        return (
            f"{self.kind}:{target} {self.status}"
            f" ({self.progress}% {self.stage})"
        )


class VideoLike(models.Model):
    video = models.ForeignKey(
        Video,
        on_delete=models.CASCADE,
        related_name="likes",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="video_likes",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("video", "user")


class VideoComment(models.Model):
    video = models.ForeignKey(
        Video,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="video_comments",
    )
    text = models.TextField(max_length=1000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
