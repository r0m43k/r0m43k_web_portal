from django.conf import settings
from django.db import models

class Video(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="videos")
    title = models.CharField(max_length=200)
    file = models.FileField(upload_to="videos/%Y/%m/%d/")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reject_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-published_at", "-created_at"]
