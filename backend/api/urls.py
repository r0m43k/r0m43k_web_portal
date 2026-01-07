from django.urls import path
from .views import health, register, me
from .auth_views import CsrfView, LoginView, RefreshView, LogoutView, RegisterView
from .video_views import VideoListView

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
]

