from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from .models import HeroVideo

@api_view(["GET"])
def health(request):
    return Response({"status": "ok"})

@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""

    if not username or not password:
        return Response({"detail": "username and password required"}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username=username).exists():
        return Response({"detail": "username already taken"}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=username, password=password)
    return Response({"id": user.id, "username": user.username}, status=status.HTTP_201_CREATED)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    u = request.user
    return Response({"id": u.id, "username": u.username})

class HeroVideoView(APIView):
    def get(self, request):
        hero = (
            HeroVideo.objects
            .filter(is_active=True)
            .order_by("-updated_at")
            .first()
        )

        if not hero:
            return Response({"file_url": None})

        return Response({
            "file_url": request.build_absolute_uri(hero.file.url),
            "title": hero.title,
        })