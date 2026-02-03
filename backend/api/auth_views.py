import re

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.middleware.csrf import get_token
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        nickname = (request.data.get("nickname") or "").strip()
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""

        if not password or not email or not nickname:
            return Response(
                {"detail": "nickname, email and password required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(password) < 8:
            return Response(
                {"detail": "password too short (min 8)"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if username and User.objects.filter(username=username).exists():
            return Response(
                {"detail": "username already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_email(email)
        except ValidationError:
            return Response(
                {"detail": "invalid email"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {"detail": "email already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not username:
            seed = (email.split("@")[0] or nickname).lower()
            base = re.sub(r"[^a-z0-9_]+", "", seed) or "user"
            username = base
            i = 1
            while User.objects.filter(username=username).exists():
                username = f"{base}{i}"
                i += 1

        verify_required = getattr(settings, "SEND_EMAILS", False)
        user = User.objects.create_user(
            username=username,
            password=password,
            email=email,
            first_name=nickname,
            is_active=not verify_required,
        )

        verify_url = None
        if verify_required or settings.DEBUG:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            verify_url = request.build_absolute_uri(
                reverse(
                    "api-verify-email",
                    kwargs={"uidb64": uid, "token": token},
                )
            )

        if verify_required:
            send_mail(
                subject="Подтвердите регистрацию",
                message=(
                    "Нажмите на ссылку, чтобы подтвердить email:\n"
                    f"{verify_url}\n\n"
                    "Если вы не регистрировались, просто "
                    "игнорируйте это письмо."
                ),
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
                recipient_list=[email],
                fail_silently=False,
            )
        payload = {"ok": True, "verify_required": verify_required}
        if settings.DEBUG and verify_url:
            payload["verify_url"] = verify_url
        return Response(payload, status=status.HTTP_201_CREATED)


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
        login = (request.data.get("login") or "").strip()
        username = (request.data.get("username") or "").strip()
        email = (request.data.get("email") or "").strip().lower()
        nickname = (request.data.get("nickname") or "").strip()
        password = request.data.get("password") or ""

        if login and not username and not email and not nickname:
            if "@" in login:
                email = login.lower()
            else:
                username = login
                nickname = login

        user = None

        if email:
            user_obj = User.objects.filter(email__iexact=email).first()
            if user_obj:
                user = authenticate(
                    username=user_obj.username,
                    password=password,
                )
        elif username:
            user = authenticate(username=username, password=password)

        if not user and nickname:
            qs = User.objects.filter(first_name__iexact=nickname)
            if qs.count() > 1:
                return Response(
                    {"detail": "nickname not unique; use email or username"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user_obj = qs.first()
            if user_obj:
                user = authenticate(
                    username=user_obj.username,
                    password=password,
                )

        if not user:
            return Response(
                {"detail": "invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.is_active:
            return Response(
                {"detail": "email not verified"},
                status=status.HTTP_403_FORBIDDEN,
            )

        refresh = RefreshToken.for_user(user)
        access = refresh.access_token

        access_ttl = int(
            settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()
        )
        refresh_ttl = int(
            settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()
        )

        resp = Response({"ok": True})

        _set_cookie(
            resp,
            COOKIE_ACCESS,
            str(access),
            max_age=access_ttl,
            httponly=True,
            path="/",
        )
        # refresh можно ограничить path="/api/auth/"
        # (чуть безопаснее)
        _set_cookie(
            resp,
            COOKIE_REFRESH,
            str(refresh),
            max_age=refresh_ttl,
            httponly=True,
            path="/api/auth/",
        )

        get_token(request)
        return resp


class RefreshView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_str = request.COOKIES.get(COOKIE_REFRESH)
        if not refresh_str:
            return Response(
                {"detail": "no refresh"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            old_refresh = RefreshToken(refresh_str)
            user_id = old_refresh.get("user_id")
            if not user_id:
                return Response(
                    {"detail": "invalid refresh"},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

            user = User.objects.get(id=user_id, is_active=True)

            try:
                old_refresh.blacklist()
            except Exception:
                pass

            new_refresh = RefreshToken.for_user(user)
            new_access = new_refresh.access_token

        except Exception:
            return Response(
                {"detail": "invalid refresh"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        access_ttl = int(
            settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()
        )
        refresh_ttl = int(
            settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()
        )

        resp = Response({"ok": True})
        _set_cookie(
            resp,
            COOKIE_ACCESS,
            str(new_access),
            max_age=access_ttl,
            httponly=True,
            path="/",
        )
        _set_cookie(
            resp,
            COOKIE_REFRESH,
            str(new_refresh),
            max_age=refresh_ttl,
            httponly=True,
            path="/api/auth/",
        )

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


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, uidb64, token):
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except Exception:
            return redirect("/login.html?verified=0")

        if default_token_generator.check_token(user, token):
            if not user.is_active:
                user.is_active = True
                user.save(update_fields=["is_active"])
            return redirect("/login.html?verified=1")

        return redirect("/login.html?verified=0")
