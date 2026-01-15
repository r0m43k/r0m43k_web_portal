from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import HeroVideo
from .serializers import HeroVideoSerializer


class HeroVideoView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        hero = (
            HeroVideo.objects.filter(is_active=True)
            .order_by("-updated_at", "-id")
            .first()
        )

        if not hero:
            return Response({"detail": "Hero video not found"}, status=404)

        serializer = HeroVideoSerializer(hero, context={"request": request})
        return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    u = request.user
    return Response({
        "id": u.id,
        "username": u.username,
        "email": u.email,
    })


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    username = request.data.get("username")
    password = request.data.get("password")

    if not username or not password:
        return Response({"detail": "username and password required"}, status=400)

    if User.objects.filter(username=username).exists():
        return Response({"detail": "username already exists"}, status=400)

    User.objects.create_user(username=username, password=password)
    return Response({"detail": "created"}, status=201)
