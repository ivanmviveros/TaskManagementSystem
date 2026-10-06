"""Auth endpoints. The refresh token moves from the response body to a cookie."""

import logging

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.core.exceptions import ApplicationError
from apps.core.throttling import LoginRateThrottle, RefreshRateThrottle
from apps.users.auth_serializers import LoginSerializer
from apps.users.cookies import clear_refresh_cookie, set_refresh_cookie

logger = logging.getLogger(__name__)


class RefreshCookieMissing(ApplicationError):
    default_detail = "No refresh token cookie was presented."
    default_code = "refresh_cookie_missing"
    status_code = status.HTTP_401_UNAUTHORIZED


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    throttle_classes = [LoginRateThrottle]
    # A tuple, not a list: simplejwt's TokenViewBase types this as tuple[()], and
    # DRF only iterates it. Login must stay reachable without authentication.
    permission_classes = ()

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        refresh = response.data.pop("refresh", None)
        if refresh is not None:
            set_refresh_cookie(
                response,
                refresh,
                max_age_seconds=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
            )
        return response

    def handle_exception(self, exc):
        # backend §20: log the attempt with IP and email. NEVER the password.
        if getattr(exc, "status_code", None) in (401, 400):
            logger.warning(
                "auth.login_failed ip=%s email=%s",
                self.request.META.get("REMOTE_ADDR"),
                self.request.data.get("email"),
            )
        return super().handle_exception(exc)


class RefreshView(TokenRefreshView):
    """Reads the refresh token from the cookie, never the request body."""

    throttle_classes = [RefreshRateThrottle]
    permission_classes = ()

    def post(self, request, *args, **kwargs):
        token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not token:
            raise RefreshCookieMissing
        # Inject the cookie value where simplejwt expects the body field. Reading
        # request.data in the same expression guarantees the parse happened first.
        request._full_data = {**request.data, "refresh": token}
        response = super().post(request, *args, **kwargs)
        rotated = response.data.pop("refresh", None)
        if rotated is not None:
            set_refresh_cookie(
                response,
                rotated,
                max_age_seconds=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
            )
        return response


class LogoutView(APIView):
    """Blacklists the presented refresh token so logout genuinely revokes."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        response = Response(status=status.HTTP_204_NO_CONTENT)
        token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                # Already expired or blacklisted: logout is idempotent.
                logger.info("auth.logout_with_unusable_token user=%s", request.user.pk)
        clear_refresh_cookie(response)
        logger.info("auth.logout user=%s", request.user.pk)
        return response
