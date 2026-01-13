from django.urls import path
from .views import feed, login_view, signin_view, logout_view, add_comment, toggle_like

urlpatterns = [
    path("", feed, name="feed"),

    path("login", login_view, name="login"),
    path("signin", signin_view, name="signin"),
    path("logout", logout_view, name="logout"),

    path("comment/<int:video_id>/", add_comment, name="add_comment"),
    path("like/<int:video_id>/", toggle_like, name="toggle_like"),
]
