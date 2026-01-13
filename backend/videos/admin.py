from django.contrib import admin
from .models import Video, Comment, Like

@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ("title", "created_at", "is_published")
    list_filter = ("is_published",)
    search_fields = ("title",)

@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("video", "user", "created_at", "is_approved")
    list_filter = ("is_approved",)

@admin.register(Like)
class LikeAdmin(admin.ModelAdmin):
    list_display = ("video", "user")
