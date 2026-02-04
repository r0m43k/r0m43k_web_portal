from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView

from .models import HeroVideo, MediaJob, Video
from .serializers import AdminVideoSerializer


class AdminVideoListView(ListAPIView):
    permission_classes = [permissions.IsAdminUser]
    serializer_class = AdminVideoSerializer
    pagination_class = None

    def get_queryset(self):
        return Video.objects.all().annotate(
            likes_count=Count("likes", distinct=True),
            comments_count=Count("comments", distinct=True),
        )


class AdminVideoApproveView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, video_id):
        video = get_object_or_404(Video, pk=video_id)
        video.status = Video.Status.APPROVED
        video.reject_reason = ""
        video.save(update_fields=["status", "reject_reason", "published_at"])
        return Response({"ok": True}, status=status.HTTP_200_OK)


class AdminVideoRejectView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, video_id):
        video = get_object_or_404(Video, pk=video_id)
        video.status = Video.Status.PENDING
        video.reject_reason = ""
        video.save(update_fields=["status", "reject_reason", "published_at"])
        return Response({"ok": True}, status=status.HTTP_200_OK)


class AdminVideoDeleteView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def delete(self, request, video_id):
        video = get_object_or_404(Video, pk=video_id)
        video.delete()
        return Response({"ok": True}, status=status.HTTP_200_OK)


class AdminHeroUploadView(APIView):
    permission_classes = [permissions.IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"detail": "file required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        title = (request.data.get("title") or "").strip()
        HeroVideo.objects.filter(is_active=True).update(is_active=False)
        hero = HeroVideo.objects.create(
            title=title,
            file=file,
            is_active=True,
        )
        if hero.file:
            MediaJob.objects.create(
                kind=MediaJob.Kind.HERO,
                hero=hero,
            )
        return Response(
            {"ok": True, "id": hero.id},
            status=status.HTTP_201_CREATED,
        )
