class AdminLogoutCookieMiddleware:
    """
    When Django admin logs out, also clear JWT cookies used by /admin.html.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        path = (request.path or "").rstrip("/")
        if path == "/admin/logout":
            response.delete_cookie("access", path="/")
            response.delete_cookie("refresh", path="/api/auth/")
        return response
