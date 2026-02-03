from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView

from .models import Video
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
        reason = (request.data.get("reason") or "").strip()
        video.status = Video.Status.REJECTED
        video.reject_reason = reason
        video.save(update_fields=["status", "reject_reason", "published_at"])
        return Response({"ok": True}, status=status.HTTP_200_OK)
