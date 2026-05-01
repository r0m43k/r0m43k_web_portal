from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from django.test import TestCase
from rest_framework.test import APIClient

from .models import HeroVideo, Video, VideoComment


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


class AuthBridgeTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            username="rootadmin",
            email="rootadmin@example.com",
            password="pass12345",
            is_staff=True,
            is_superuser=True,
        )
        self.client = Client()

    def test_api_login_creates_admin_session(self):
        res = self.client.post(
            "/api/auth/login/",
            data={"login": "rootadmin", "password": "pass12345"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)

        me_res = self.client.get("/api/auth/me/")
        self.assertEqual(me_res.status_code, 200)

        admin_res = self.client.get("/admin/")
        self.assertEqual(admin_res.status_code, 200)

    def test_api_logout_also_logs_out_admin_session(self):
        login_res = self.client.post(
            "/api/auth/login/",
            data={"login": "rootadmin", "password": "pass12345"},
            content_type="application/json",
        )
        self.assertEqual(login_res.status_code, 200)

        logout_res = self.client.post("/api/auth/logout/")
        self.assertEqual(logout_res.status_code, 200)

        admin_res = self.client.get("/admin/")
        self.assertEqual(admin_res.status_code, 302)


class CommentPermissionTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.author = user_model.objects.create_user(
            username="author1",
            email="author1@example.com",
            password="pass12345",
        )
        self.viewer = user_model.objects.create_user(
            username="viewer1",
            email="viewer1@example.com",
            password="pass12345",
        )
        self.video = Video.objects.create(
            owner=self.author,
            title="Commentable video",
            file=SimpleUploadedFile(
                "commentable.mp4",
                b"video-comment",
                content_type="video/mp4",
            ),
            status=Video.Status.APPROVED,
        )
        self.client = APIClient()

    def test_authenticated_user_can_create_comment(self):
        self.client.force_authenticate(user=self.viewer)
        res = self.client.post(
            f"/api/videos/{self.video.id}/comments/",
            {"text": "nice clip"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        payload = res.json()
        self.assertEqual(payload.get("text"), "nice clip")
        self.assertEqual(payload.get("user"), "viewer1")

    def test_guest_cannot_create_comment(self):
        res = self.client.post(
            f"/api/videos/{self.video.id}/comments/",
            {"text": "guest comment"},
            format="json",
        )
        self.assertIn(res.status_code, (401, 403))

    def test_author_can_delete_own_comment(self):
        comment = VideoComment.objects.create(
            video=self.video,
            user=self.viewer,
            text="remove me",
        )
        self.client.force_authenticate(user=self.viewer)
        res = self.client.delete(f"/api/comments/{comment.id}/")
        self.assertEqual(res.status_code, 204)
        self.assertFalse(VideoComment.objects.filter(pk=comment.id).exists())

    def test_other_user_cannot_delete_comment(self):
        comment = VideoComment.objects.create(
            video=self.video,
            user=self.author,
            text="keep me",
        )
        self.client.force_authenticate(user=self.viewer)
        res = self.client.delete(f"/api/comments/{comment.id}/")
        self.assertEqual(res.status_code, 403)
        self.assertTrue(VideoComment.objects.filter(pk=comment.id).exists())

    def test_admin_can_list_and_delete_any_comment(self):
        user_model = get_user_model()
        admin = user_model.objects.create_user(
            username="commentadmin",
            email="commentadmin@example.com",
            password="pass12345",
            is_staff=True,
        )
        comment = VideoComment.objects.create(
            video=self.video,
            user=self.viewer,
            text="moderate me",
        )
        self.client.force_authenticate(user=admin)

        list_res = self.client.get("/api/admin/comments/")
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(list_res.json()[0]["text"], "moderate me")

        delete_res = self.client.delete(f"/api/comments/{comment.id}/")
        self.assertEqual(delete_res.status_code, 204)
        self.assertFalse(VideoComment.objects.filter(pk=comment.id).exists())
