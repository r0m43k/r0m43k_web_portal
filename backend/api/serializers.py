from rest_framework import serializers
from .models import Video

class VideoSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Video
        fields = ["id", "title", "file_url", "status", "created_at", "published_at"]

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
