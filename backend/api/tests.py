from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from .models import HeroVideo, Video


class AdminVideoOrderTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="pass12345",
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(user=self.admin)

        self.v1 = Video.objects.create(
            owner=self.admin,
            title="Video 1",
            file=SimpleUploadedFile(
                "v1.mp4",
                b"video-1",
                content_type="video/mp4",
            ),
            status=Video.Status.APPROVED,
        )
        self.v2 = Video.objects.create(
            owner=self.admin,
            title="Video 2",
            file=SimpleUploadedFile(
                "v2.mp4",
                b"video-2",
                content_type="video/mp4",
            ),
            status=Video.Status.APPROVED,
        )
        self.v3 = Video.objects.create(
            owner=self.admin,
            title="Video 3",
            file=SimpleUploadedFile(
                "v3.mp4",
                b"video-3",
                content_type="video/mp4",
            ),
            status=Video.Status.APPROVED,
        )

    def test_reorder_updates_display_order(self):
        res = self.client.post(
            "/api/admin/videos/order/",
            {"video_ids": [self.v3.id, self.v1.id, self.v2.id]},
            format="json",
        )
        self.assertEqual(res.status_code, 200)

        ordered_ids = list(
            Video.objects.order_by("display_order").values_list(
                "id",
                flat=True,
            )
        )
        self.assertEqual(
            ordered_ids,
            [self.v3.id, self.v1.id, self.v2.id],
        )

    def test_public_feed_respects_display_order(self):
        self.v3.display_order = 1
        self.v3.save(update_fields=["display_order"])
        self.v1.display_order = 2
        self.v1.save(update_fields=["display_order"])
        self.v2.display_order = 3
        self.v2.save(update_fields=["display_order"])

        self.client.force_authenticate(user=None)
        res = self.client.get("/api/videos/?limit=10")
        self.assertEqual(res.status_code, 200)
        ids = [item["id"] for item in res.json().get("results", [])]
        self.assertEqual(ids[:3], [self.v3.id, self.v1.id, self.v2.id])


class HeroFallbackTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.owner = user_model.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="pass12345",
        )
        HeroVideo.objects.create(
            title="Archived hero",
            file=SimpleUploadedFile(
                "hero.mp4",
                b"hero-file",
                content_type="video/mp4",
            ),
            is_active=False,
        )
        self.client = APIClient()

    def test_hero_endpoint_falls_back_to_latest(self):
        res = self.client.get("/api/hero/")
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        self.assertEqual(payload.get("title"), "Archived hero")
