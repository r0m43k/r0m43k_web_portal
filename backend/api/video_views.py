from django.db.models import BooleanField, Count, Exists, OuterRef, Value
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MediaJob, Video, VideoComment, VideoLike
from .serializers import (
    VideoCommentSerializer,
    VideoCreateSerializer,
    VideoSerializer,
)


class VideoListView(generics.ListCreateAPIView):
    def get_queryset(self):
        qs = Video.objects.all()
        if self.request.method == "GET":
            qs = qs.filter(status=Video.Status.APPROVED)

        qs = qs.annotate(
            likes_count=Count("likes", distinct=True),
            comments_count=Count("comments", distinct=True),
        )

        if self.request.user.is_authenticated:
            qs = qs.annotate(
                liked_by_me=Exists(
                    VideoLike.objects.filter(
                        video=OuterRef("pk"),
                        user=self.request.user,
                    )
                )
            )
        else:
            qs = qs.annotate(
                liked_by_me=Value(False, output_field=BooleanField())
            )

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
        video = serializer.save(
            owner=self.request.user,
            status=Video.Status.PENDING,
        )
        if video.file:
            MediaJob.objects.create(
                kind=MediaJob.Kind.VIDEO,
                video=video,
            )


class VideoCommentListCreateView(generics.ListCreateAPIView):
    serializer_class = VideoCommentSerializer

    def get_queryset(self):
        return VideoComment.objects.filter(video_id=self.kwargs["video_id"])

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]

    def perform_create(self, serializer):
        video = get_object_or_404(Video, pk=self.kwargs["video_id"])
        serializer.save(user=self.request.user, video=video)


class VideoLikeToggleView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, video_id):
        video = get_object_or_404(Video, pk=video_id)
        like, created = VideoLike.objects.get_or_create(
            video=video,
            user=request.user,
        )

        if created:
            liked = True
        else:
            like.delete()
            liked = False

        likes_count = VideoLike.objects.filter(video=video).count()
        return Response(
            {"liked": liked, "likes_count": likes_count},
            status=status.HTTP_200_OK,
        )
