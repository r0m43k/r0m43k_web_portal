from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.middleware.csrf import get_token
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()

COOKIE_ACCESS = "access"
COOKIE_REFRESH = "refresh"

def _cookie_kwargs():
    env = getattr(settings, "ENV", "dev")
    secure = env == "prod"
    samesite = "Strict" if env == "prod" else "Lax"
    return {"secure": secure, "samesite": samesite}

def _set_cookie(resp, key, value, max_age, httponly=True, path="/"):
    kw = _cookie_kwargs()
    resp.set_cookie(
        key=key,
        value=value,
        max_age=max_age,
        httponly=httponly,
        secure=kw["secure"],
        samesite=kw["samesite"],
        path=path,
    )

class CsrfView(APIView):
    permission_classes = [AllowAny]
    def get(self, request):
        token = get_token(request)
        return Response({"csrfToken": token})

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""

        user = authenticate(username=username, password=password)
        if not user or not user.is_active:
            return Response({"detail": "invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        access = refresh.access_token

        access_ttl = int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())
        refresh_ttl = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())

        resp = Response({"ok": True})

        _set_cookie(resp, COOKIE_ACCESS, str(access), max_age=access_ttl, httponly=True, path="/")
        # refresh можно ограничить path="/api/auth/" (чуть безопаснее)
        _set_cookie(resp, COOKIE_REFRESH, str(refresh), max_age=refresh_ttl, httponly=True, path="/api/auth/")

        get_token(request)
        return resp

class RefreshView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_str = request.COOKIES.get(COOKIE_REFRESH)
        if not refresh_str:
            return Response({"detail": "no refresh"}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            old_refresh = RefreshToken(refresh_str)
            user_id = old_refresh.get("user_id")
            if not user_id:
                return Response({"detail": "invalid refresh"}, status=status.HTTP_401_UNAUTHORIZED)

            user = User.objects.get(id=user_id, is_active=True)

            try:
                old_refresh.blacklist()
            except Exception:
                pass

            new_refresh = RefreshToken.for_user(user)
            new_access = new_refresh.access_token

        except Exception:
            return Response({"detail": "invalid refresh"}, status=status.HTTP_401_UNAUTHORIZED)

        access_ttl = int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())
        refresh_ttl = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())

        resp = Response({"ok": True})
        _set_cookie(resp, COOKIE_ACCESS, str(new_access), max_age=access_ttl, httponly=True, path="/")
        _set_cookie(resp, COOKIE_REFRESH, str(new_refresh), max_age=refresh_ttl, httponly=True, path="/api/auth/")

        get_token(request)
        return resp

class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_str = request.COOKIES.get(COOKIE_REFRESH)
        if refresh_str:
            try:
                RefreshToken(refresh_str).blacklist()
            except Exception:
                pass

        resp = Response({"ok": True})
        resp.delete_cookie(COOKIE_ACCESS, path="/")
        resp.delete_cookie(COOKIE_REFRESH, path="/api/auth/")
        return resp
