from pathlib import Path

from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import HeroVideo, MediaJob, UploadSession, Video
from .serializers import (
    AdminHeroVideoSerializer,
    AdminMediaJobSerializer,
    AdminUploadSessionSerializer,
    AdminVideoSerializer,
)


class AdminVideoListCreateView(APIView):
    permission_classes = [permissions.IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit") or 30)
        except ValueError:
            limit = 30
        limit = max(1, min(limit, 200))
        qs = (
            Video.objects.select_related("owner")
            .annotate(
                likes_count=Count("likes", distinct=True),
                comments_count=Count("comments", distinct=True),
            )
            .order_by("display_order", "-created_at", "-id")[:limit]
        )
        data = AdminVideoSerializer(
            qs,
            many=True,
            context={"request": request},
        ).data
        return Response(data)

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"detail": "file required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        title = (request.data.get("title") or "").strip()
        if not title:
            title = Path(file.name).stem or "Untitled video"

        upload = UploadSession.objects.create(
            created_by=request.user,
            filename=file.name,
            total_bytes=getattr(file, "size", 0) or 0,
            received_bytes=0,
            status=UploadSession.Status.UPLOADING,
        )

        try:
            video = Video.objects.create(
                owner=request.user,
                title=title,
                file=file,
                status=Video.Status.APPROVED,
                reject_reason="",
            )
            upload.video = video
            upload.received_bytes = upload.total_bytes
            upload.status = UploadSession.Status.COMPLETED
            upload.finished_at = timezone.now()
            upload.save(
                update_fields=[
                    "video",
                    "received_bytes",
                    "status",
                    "finished_at",
                    "updated_at",
                ]
            )
            job = MediaJob.objects.create(
                kind=MediaJob.Kind.VIDEO,
                status=MediaJob.Status.PENDING,
                stage="queued",
                progress=0,
                video=video,
                upload=upload,
            )
        except Exception as exc:
            upload.status = UploadSession.Status.FAILED
            upload.error = str(exc)
            upload.finished_at = timezone.now()
            upload.save(
                update_fields=[
                    "status",
                    "error",
                    "finished_at",
                    "updated_at",
                ]
            )
            return Response(
                {"detail": "upload failed"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        video.likes_count = 0
        video.comments_count = 0
        return Response(
            {
                "video": AdminVideoSerializer(
                    video,
                    context={"request": request},
                ).data,
                "upload": AdminUploadSessionSerializer(upload).data,
                "job": AdminMediaJobSerializer(
                    job,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


class AdminVideoOrderView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        video_ids = request.data.get("video_ids")
        if not isinstance(video_ids, list) or not video_ids:
            return Response(
                {"detail": "video_ids list required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        normalized_ids = []
        seen = set()
        for raw_id in video_ids:
            try:
                video_id = int(raw_id)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "video_ids must contain integer IDs"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if video_id in seen:
                continue
            normalized_ids.append(video_id)
            seen.add(video_id)

        existing_ids = set(
            Video.objects.filter(pk__in=normalized_ids).values_list(
                "id", flat=True
            )
        )
        missing = [
            video_id
            for video_id in normalized_ids
            if video_id not in existing_ids
        ]
        if missing:
            return Response(
                {"detail": f"unknown video ids: {missing}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for order, video_id in enumerate(normalized_ids, start=1):
                Video.objects.filter(pk=video_id).update(display_order=order)

            tail_ids = list(
                Video.objects.exclude(pk__in=normalized_ids)
                .order_by("display_order", "-created_at", "-id")
                .values_list("id", flat=True)
            )
            next_order = len(normalized_ids) + 1
            for video_id in tail_ids:
                Video.objects.filter(pk=video_id).update(
                    display_order=next_order
                )
                next_order += 1

        ordered_ids = list(
            Video.objects.order_by(
                "display_order",
                "-created_at",
                "-id",
            ).values_list("id", flat=True)
        )
        return Response(
            {"ok": True, "video_ids": ordered_ids},
            status=status.HTTP_200_OK,
        )


class AdminUploadStatusView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request, upload_id):
        upload = get_object_or_404(UploadSession, pk=upload_id)
        data = AdminUploadSessionSerializer(upload).data
        return Response(data, status=status.HTTP_200_OK)


class AdminJobStatusView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request, job_id):
        job = get_object_or_404(MediaJob, pk=job_id)
        data = AdminMediaJobSerializer(
            job,
            context={"request": request},
        ).data
        return Response(data, status=status.HTTP_200_OK)


class AdminJobRetryView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, job_id):
        job = get_object_or_404(MediaJob, pk=job_id)
        if job.status not in (
            MediaJob.Status.FAILED,
            MediaJob.Status.CANCELED,
        ):
            return Response(
                {"detail": "job cannot be retried in current state"},
                status=status.HTTP_409_CONFLICT,
            )

        job.status = MediaJob.Status.PENDING
        job.stage = "queued"
        job.progress = 0
        job.error = ""
        job.cancel_requested = False
        job.started_at = None
        job.finished_at = None
        job.save(
            update_fields=[
                "status",
                "stage",
                "progress",
                "error",
                "cancel_requested",
                "started_at",
                "finished_at",
                "updated_at",
            ]
        )
        data = AdminMediaJobSerializer(
            job,
            context={"request": request},
        ).data
        return Response(data, status=status.HTTP_200_OK)


class AdminJobCancelView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, job_id):
        job = get_object_or_404(MediaJob, pk=job_id)
        if job.status == MediaJob.Status.PENDING:
            job.status = MediaJob.Status.CANCELED
            job.stage = "canceled"
            job.cancel_requested = False
            job.finished_at = timezone.now()
            job.save(
                update_fields=[
                    "status",
                    "stage",
                    "cancel_requested",
                    "finished_at",
                    "updated_at",
                ]
            )
        elif job.status == MediaJob.Status.PROCESSING:
            job.cancel_requested = True
            job.stage = "canceling"
            job.save(update_fields=["cancel_requested", "stage", "updated_at"])

        data = AdminMediaJobSerializer(
            job,
            context={"request": request},
        ).data
        return Response(data, status=status.HTTP_200_OK)


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
                video=None,
                hero=hero,
                status=MediaJob.Status.PENDING,
                stage="queued",
                progress=0,
            )
        return Response(
            {"ok": True, "id": hero.id},
            status=status.HTTP_201_CREATED,
        )


class AdminHeroCurrentView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        hero = (
            HeroVideo.objects.filter(is_active=True)
            .order_by("-updated_at", "-id")
            .first()
        )
        if not hero:
            hero = HeroVideo.objects.order_by("-updated_at", "-id").first()
        if not hero:
            return Response(
                {"detail": "hero not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        data = AdminHeroVideoSerializer(
            hero,
            context={"request": request},
        ).data
        return Response(data, status=status.HTTP_200_OK)
