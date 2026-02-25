from django.urls import path

from .auth_views import (
    CsrfView,
    LoginView,
    LogoutView,
    RefreshView,
    RegisterView,
    VerifyEmailView,
)
from .admin_views import (
    AdminHeroCurrentView,
    AdminHeroUploadView,
    AdminJobCancelView,
    AdminJobRetryView,
    AdminJobStatusView,
    AdminUploadStatusView,
    AdminVideoOrderView,
    AdminVideoListCreateView,
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
    path("auth/me/", me),
    path("videos/", VideoListView.as_view()),
    path(
        "videos/<int:video_id>/comments/",
        VideoCommentListCreateView.as_view(),
    ),
    path("videos/<int:video_id>/like/", VideoLikeToggleView.as_view()),
    path("hero/", HeroVideoView.as_view()),
    path("hero", HeroVideoView.as_view()),
    path("admin/videos", AdminVideoListCreateView.as_view()),
    path("admin/videos/", AdminVideoListCreateView.as_view()),
    path("admin/videos/order", AdminVideoOrderView.as_view()),
    path("admin/videos/order/", AdminVideoOrderView.as_view()),
    path("admin/uploads/<int:upload_id>", AdminUploadStatusView.as_view()),
    path("admin/uploads/<int:upload_id>/", AdminUploadStatusView.as_view()),
    path("admin/jobs/<int:job_id>", AdminJobStatusView.as_view()),
    path("admin/jobs/<int:job_id>/", AdminJobStatusView.as_view()),
    path("admin/jobs/<int:job_id>/retry", AdminJobRetryView.as_view()),
    path("admin/jobs/<int:job_id>/retry/", AdminJobRetryView.as_view()),
    path("admin/jobs/<int:job_id>/cancel", AdminJobCancelView.as_view()),
    path("admin/jobs/<int:job_id>/cancel/", AdminJobCancelView.as_view()),
    path("admin/hero", AdminHeroUploadView.as_view()),
    path("admin/hero/", AdminHeroUploadView.as_view()),
    path("admin/hero/current", AdminHeroCurrentView.as_view()),
    path("admin/hero/current/", AdminHeroCurrentView.as_view()),
]
