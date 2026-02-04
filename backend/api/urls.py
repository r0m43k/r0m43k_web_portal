from django.urls import path

from .auth_views import (
    AdminBridgeView,
    CsrfView,
    LoginView,
    LogoutView,
    RefreshView,
    RegisterView,
    VerifyEmailView,
)
from .admin_views import (
    AdminHeroUploadView,
    AdminVideoApproveView,
    AdminVideoDeleteView,
    AdminVideoListView,
    AdminVideoRejectView,
)
from .video_views import (
    VideoCommentListCreateView,
    VideoLikeToggleView,
    VideoListView,
)
from .views import HeroVideoView, health, me

urlpatterns = [
    path("health/", health),
    path("auth/csrf/", CsrfView.as_view()),
    path("auth/register/", RegisterView.as_view()),
    path("auth/login/", LoginView.as_view()),
    path(
        "auth/verify/<str:uidb64>/<str:token>/",
        VerifyEmailView.as_view(),
        name="api-verify-email",
    ),
    path("auth/refresh/", RefreshView.as_view()),
    path("auth/logout/", LogoutView.as_view()),
    path("auth/admin-bridge/", AdminBridgeView.as_view()),
    path("auth/me/", me),
    path("videos/", VideoListView.as_view()),
    path(
        "videos/<int:video_id>/comments/",
        VideoCommentListCreateView.as_view(),
    ),
    path("videos/<int:video_id>/like/", VideoLikeToggleView.as_view()),
    path("hero/", HeroVideoView.as_view()),
    path("admin/videos/", AdminVideoListView.as_view()),
    path("admin/hero/", AdminHeroUploadView.as_view()),
    path(
        "admin/videos/<int:video_id>/publish/",
        AdminVideoApproveView.as_view(),
    ),
    path(
        "admin/videos/<int:video_id>/hide/",
        AdminVideoRejectView.as_view(),
    ),
    path(
        "admin/videos/<int:video_id>/delete/",
        AdminVideoDeleteView.as_view(),
    ),
]
