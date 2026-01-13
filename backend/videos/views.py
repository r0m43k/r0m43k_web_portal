from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.db.models import Count
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from .forms import RegisterForm
from .models import Video, Comment, Like


def feed(request):
    videos = (
        Video.objects.filter(is_published=True)
        .annotate(likes_count=Count("likes"))
        .order_by("-created_at")
    )
    return render(request, "index.html", {"videos": videos})


def login_view(request):
    if request.method == "GET":
        return render(request, "login.html")

    username = (request.POST.get("username") or "").strip()
    password = request.POST.get("password") or ""

    user = authenticate(request, username=username, password=password)
    if not user:
        return render(request, "login.html", {"error": "Invalid credentials"})

    login(request, user)
    return redirect("/")


def signin_view(request):
    if request.method == "GET":
        form = RegisterForm()
        return render(request, "signin.html", {"form": form})

    form = RegisterForm(request.POST)
    if not form.is_valid():
        return render(request, "signin.html", {"form": form})

    username = form.cleaned_data["username"]
    password = form.cleaned_data["password"]

    user = form.save(commit=False)
    user.set_password(password)
    user.save()

    user = authenticate(request, username=username, password=password)
    login(request, user)
    return redirect("/")


def logout_view(request):
    logout(request)
    return redirect("/")


@require_POST
@login_required
def add_comment(request, video_id: int):
    video = get_object_or_404(Video, id=video_id, is_published=True)
    text = (request.POST.get("text") or "").strip()
    if text:
        Comment.objects.create(video=video, user=request.user, text=text, is_approved=True)
    return redirect("/")


@require_POST
@login_required
def toggle_like(request, video_id: int):
    video = get_object_or_404(Video, id=video_id, is_published=True)
    like = Like.objects.filter(video=video, user=request.user).first()
    if like:
        like.delete()
    else:
        Like.objects.create(video=video, user=request.user)
    return redirect("/")
