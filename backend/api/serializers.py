from rest_framework import serializers
from .models import HeroVideo, Video, VideoComment


class VideoSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    likes_count = serializers.IntegerField(read_only=True)
    comments_count = serializers.IntegerField(read_only=True)
    liked_by_me = serializers.BooleanField(read_only=True)

    class Meta:
        model = Video
        fields = [
            "id",
            "title",
            "file_url",
            "status",
            "created_at",
            "published_at",
            "likes_count",
            "comments_count",
            "liked_by_me",
        ]

    def get_file_url(self, obj):
        request = self.context.get("request")
        if not obj.file:
            return None
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url


class VideoCreateSerializer(serializers.ModelSerializer):
    title = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Video
        fields = ["title", "file"]

    def validate(self, attrs):
        title = (attrs.get("title") or "").strip()
        if not title:
            attrs["title"] = "Без названия"
        return attrs


class HeroVideoSerializer(serializers.ModelSerializer):
    class Meta:
        model = HeroVideo
        fields = "__all__"


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
    likes_count = serializers.IntegerField(read_only=True)
    comments_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Video
        fields = [
            "id",
            "title",
            "file_url",
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
        request = self.context.get("request")
        if not obj.file:
            return None
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url
