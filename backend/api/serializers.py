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
    class Meta:
        model = Video
        fields = ["title", "file"]


class HeroVideoSerializer(serializers.ModelSerializer):
    class Meta:
        model = HeroVideo
        fields = "__all__"


class VideoCommentSerializer(serializers.ModelSerializer):
    user = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = VideoComment
        fields = ["id", "user", "text", "created_at"]
