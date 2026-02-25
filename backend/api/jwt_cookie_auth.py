from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        raw = request.COOKIES.get("access")
        if not raw:
            return None
        try:
            validated = self.get_validated_token(raw)
            return self.get_user(validated), validated
        except (InvalidToken, TokenError, AuthenticationFailed):
            # Treat broken/expired cookie as anonymous request instead of 401.
            return None
