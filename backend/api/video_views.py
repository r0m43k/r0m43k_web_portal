from rest_framework import generics, permissions
from rest_framework.parsers import MultiPartParser, FormParser
from .models import Video
from .serializers import VideoSerializer, VideoCreateSerializer

class VideoListView(generics.ListCreateAPIView):
    def get_queryset(self):
        qs = Video.objects.all()
        if self.request.method == "GET":
            return qs.filter(status=Video.Status.APPROVED)
        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return VideoCreateSerializer
        return VideoSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    parser_classes = [MultiPartParser, FormParser]

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, status=Video.Status.PENDING)
