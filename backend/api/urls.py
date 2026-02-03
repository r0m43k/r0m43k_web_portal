from django.urls import path

from .auth_views import (
    CsrfView,
    LoginView,
    LogoutView,
    RefreshView,
    RegisterView,
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
]
