from django.conf import settings
from django.db import models
from django.utils import timezone


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
    file = models.FileField(upload_to="videos/%Y/%m/%d/")
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
    file = models.FileField(upload_to="hero/")
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Hero video"
        verbose_name_plural = "Hero video"

    def __str__(self):
        return self.title or f"Hero video #{self.pk}"
