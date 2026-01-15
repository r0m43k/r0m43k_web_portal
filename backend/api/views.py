from rest_framework.response import Response
from rest_framework.views import APIView

from .models import HeroVideo, Video
from .serializers import HeroVideoSerializer, VideoSerializer


class VideoListView(APIView):
    def get(self, request):
        limit = int(request.GET.get("limit", 6))
        offset = int(request.GET.get("offset", 0))

        qs = (
            Video.objects.filter(status=Video.Status.APPROVED)
            .order_by("-published_at", "-created_at")[offset : offset + limit]
        )

        serializer = VideoSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)


class HeroVideoView(APIView):
    def get(self, request):
        hero = (
            HeroVideo.objects.filter(is_active=True)
            .order_by("-updated_at")
            .first()
        )

        if not hero:
            return Response({"detail": "Hero video not found"}, status=404)

        serializer = HeroVideoSerializer(hero, context={"request": request})
        return Response(serializer.data)
