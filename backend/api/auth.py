from django.conf import settings
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate


COOKIE_ACCESS = "access"
COOKIE_REFRESH = "refresh"

def _set_cookie(resp, key, value, max_age, httponly=True):
    resp.set_cookie(
        key=key,
        value=value,
        max_age=max_age,
        httponly=httponly,
        secure=getattr(settings, "CSRF_COOKIE_SECURE", False),
        samesite="Lax",
        path="/",
    )

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""

        user = authenticate(username=username, password=password)
        if not user:
            return Response({"detail": "invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)

        resp = Response({"ok": True})
        # max_age в секундах: access обычно 5-15 минут, refresh — дни
        _set_cookie(resp, COOKIE_ACCESS, access, max_age=10 * 60, httponly=True)
        _set_cookie(resp, COOKIE_REFRESH, str(refresh), max_age=7 * 24 * 60 * 60, httponly=True)
        return resp


class RefreshView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_str = request.COOKIES.get(COOKIE_REFRESH)
        if not refresh_str:
            return Response({"detail": "no refresh cookie"}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            refresh = RefreshToken(refresh_str)
            access = str(refresh.access_token)
        except Exception:
            return Response({"detail": "invalid refresh"}, status=status.HTTP_401_UNAUTHORIZED)

        resp = Response({"ok": True})
        _set_cookie(resp, COOKIE_ACCESS, access, max_age=10 * 60, httponly=True)
        return resp


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        resp = Response({"ok": True})
        resp.delete_cookie(COOKIE_ACCESS, path="/")
        resp.delete_cookie(COOKIE_REFRESH, path="/")
        return resp
