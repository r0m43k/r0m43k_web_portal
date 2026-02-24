from rest_framework import serializers

from .models import HeroVideo, MediaJob, UploadSession, Video, VideoComment
from .utils.media import hls_manifest_path, hls_manifest_url


def _abs_url(request, value):
    if not value:
        return None
    return request.build_absolute_uri(value) if request else value


class VideoSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    hls_url = serializers.SerializerMethodField()
    likes_count = serializers.IntegerField(read_only=True)
    comments_count = serializers.IntegerField(read_only=True)
    liked_by_me = serializers.BooleanField(read_only=True)

    class Meta:
        model = Video
        fields = [
            "id",
            "title",
            "file_url",
            "hls_url",
            "status",
            "created_at",
            "published_at",
            "likes_count",
            "comments_count",
            "liked_by_me",
        ]

    def get_file_url(self, obj):
        if not obj.file:
            return None
        return _abs_url(self.context.get("request"), obj.file.url)

    def get_hls_url(self, obj):
        if not obj.pk:
            return None
        manifest = hls_manifest_path("video", obj.pk)
        if not manifest.exists():
            return None
        request = self.context.get("request")
        return hls_manifest_url(request, "video", obj.pk)


class VideoCreateSerializer(serializers.ModelSerializer):
    title = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Video
        fields = ["title", "file"]

    def validate(self, attrs):
        title = (attrs.get("title") or "").strip()
        if not title:
            attrs["title"] = "Untitled video"
        return attrs


class HeroVideoSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    hls_url = serializers.SerializerMethodField()

    class Meta:
        model = HeroVideo
        fields = [
            "id",
            "title",
            "file",
            "file_url",
            "hls_url",
            "is_active",
            "updated_at",
        ]

    def get_file_url(self, obj):
        if not obj.file:
            return None
        return _abs_url(self.context.get("request"), obj.file.url)

    def get_hls_url(self, obj):
        if not obj.pk:
            return None
        manifest = hls_manifest_path("hero", obj.pk)
        if not manifest.exists():
            return None
        request = self.context.get("request")
        return hls_manifest_url(request, "hero", obj.pk)


class VideoCommentSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()

    class Meta:
        model = VideoComment
        fields = ["id", "user", "text", "created_at"]

    def get_user(self, obj):
        return obj.user.first_name or obj.user.username


class AdminVideoSerializer(serializers.ModelSerializer):
    owner_username = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    hls_url = serializers.SerializerMethodField()
    likes_count = serializers.IntegerField(read_only=True)
    comments_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Video
        fields = [
            "id",
            "title",
            "file_url",
            "hls_url",
            "status",
            "reject_reason",
            "created_at",
            "published_at",
            "owner_username",
            "likes_count",
            "comments_count",
        ]

    def get_owner_username(self, obj):
        return obj.owner.first_name or obj.owner.username

    def get_file_url(self, obj):
        if not obj.file:
            return None
        return _abs_url(self.context.get("request"), obj.file.url)

    def get_hls_url(self, obj):
        if not obj.pk:
            return None
        manifest = hls_manifest_path("video", obj.pk)
        if not manifest.exists():
            return None
        request = self.context.get("request")
        return hls_manifest_url(request, "video", obj.pk)


class AdminUploadSessionSerializer(serializers.ModelSerializer):
    progress = serializers.SerializerMethodField()

    class Meta:
        model = UploadSession
        fields = [
            "id",
            "status",
            "filename",
            "total_bytes",
            "received_bytes",
            "progress",
            "error",
            "video_id",
            "created_at",
            "updated_at",
            "finished_at",
        ]

    def get_progress(self, obj):
        return obj.progress_percent


class AdminMediaJobSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    hls_url = serializers.SerializerMethodField()

    class Meta:
        model = MediaJob
        fields = [
            "id",
            "kind",
            "status",
            "stage",
            "progress",
            "cancel_requested",
            "attempt_count",
            "error",
            "video_id",
            "hero_id",
            "upload_id",
            "created_at",
            "updated_at",
            "started_at",
            "finished_at",
            "file_url",
            "hls_url",
        ]

    def get_file_url(self, obj):
        request = self.context.get("request")
        if obj.video and obj.video.file:
            return _abs_url(request, obj.video.file.url)
        if obj.hero and obj.hero.file:
            return _abs_url(request, obj.hero.file.url)
        return None

    def get_hls_url(self, obj):
        request = self.context.get("request")
        if obj.video_id:
            manifest = hls_manifest_path("video", obj.video_id)
            if manifest.exists():
                return hls_manifest_url(request, "video", obj.video_id)
        if obj.hero_id:
            manifest = hls_manifest_path("hero", obj.hero_id)
            if manifest.exists():
                return hls_manifest_url(request, "hero", obj.hero_id)
        return None
