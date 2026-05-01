from django.contrib import admin

from .models import HeroVideo, Video, VideoComment


@admin.action(description="Show in profile")
def publish_videos(modeladmin, request, queryset):
    queryset.update(status=Video.Status.APPROVED, reject_reason="")


@admin.action(description="Hide from feed")
def hide_videos(modeladmin, request, queryset):
    queryset.update(status=Video.Status.PENDING, reject_reason="")


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "owner",
        "status",
        "created_at",
        "published_at",
    )
    list_filter = ("status", "created_at", "published_at")
    search_fields = ("title", "owner__username")
    readonly_fields = ("created_at", "published_at")
    actions = [publish_videos, hide_videos]


@admin.register(HeroVideo)
class HeroVideoAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "is_active", "updated_at")
    list_filter = ("is_active",)


@admin.register(VideoComment)
class VideoCommentAdmin(admin.ModelAdmin):
    list_display = ("id", "video", "user", "created_at")
    list_filter = ("created_at",)
    search_fields = ("text", "user__username", "video__title")
    readonly_fields = ("created_at",)
