from django.contrib import admin

from .models import Video

from .models import HeroVideo


@admin.action(description="Approve selected videos")
def approve_videos(modeladmin, request, queryset):
    queryset.update(status=Video.Status.APPROVED, reject_reason="")


@admin.action(description="Reject selected videos")
def reject_videos(modeladmin, request, queryset):
    queryset.update(status=Video.Status.REJECTED)


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = (
        "id", 
        "title", 
        "owner", 
        "status", 
        "created_at", 
        "published_at"
    )
    list_filter = ("status", "created_at", "published_at")
    search_fields = ("title", "owner__username")
    readonly_fields = ("created_at", "published_at")
    actions = [approve_videos, reject_videos]


@admin.register(HeroVideo)
class HeroVideoAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "is_active", "updated_at")
    list_filter = ("is_active",)
    