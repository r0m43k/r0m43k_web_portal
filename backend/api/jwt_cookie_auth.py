from rest_framework_simplejwt.authentication import JWTAuthentication

class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        raw = request.COOKIES.get("access")
        if not raw:
            return None
        validated = self.get_validated_token(raw)
        return self.get_user(validated), validated
