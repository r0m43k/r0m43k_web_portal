from django.urls import path

from .auth_views import CsrfView, LoginView, LogoutView, RefreshView
from .video_views import VideoListView
from .views import HeroVideoView, health, me, register

urlpatterns = [
    path("health/", health),
    path("auth/csrf/", CsrfView.as_view()),
    path("auth/register/", register),
    path("auth/login/", LoginView.as_view()),
    path("auth/refresh/", RefreshView.as_view()),
    path("auth/logout/", LogoutView.as_view()),
    path("auth/me/", me),
    path("health/", health),
    path("videos/", VideoListView.as_view()),
    path("hero/", HeroVideoView.as_view()),
    
]
