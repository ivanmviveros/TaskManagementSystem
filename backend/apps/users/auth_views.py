"""Auth endpoints. The refresh token moves from the response body to a cookie."""

import logging

from django.conf import settings
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
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
from apps.users.serializers import UserMinimalSerializer

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

    @extend_schema(
        request=inline_serializer(
            name="LoginRequest",
            fields={
                "email": serializers.EmailField(),
                "password": serializers.CharField(write_only=True),
            },
        ),
        responses={
            200: inline_serializer(
                name="LoginResponse",
                fields={
                    "access": serializers.CharField(),
                    "user": UserMinimalSerializer(),
                },
            ),
            401: OpenApiResponse(
                description="Invalid credentials, or the account is inactive or deleted."
            ),
            429: OpenApiResponse(description="Throttled: 5 attempts per minute per IP."),
        },
        description="Returns an access token and the current user. The refresh token is "
        "set as an HttpOnly cookie scoped to /api/v1/auth/ and never appears "
        "in the response body.",
    )
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
                "auth.login_failed",
                extra={
                    "ip": self.request.META.get("REMOTE_ADDR"),
                    "email": self.request.data.get("email"),
                },
            )
        return super().handle_exception(exc)


class RefreshView(TokenRefreshView):
    """Reads the refresh token from the cookie, never the request body."""

    throttle_classes = [RefreshRateThrottle]
    permission_classes = ()

    @extend_schema(
        request=None,
        responses={
            200: inline_serializer(
                name="RefreshResponse",
                fields={"access": serializers.CharField()},
            ),
            401: OpenApiResponse(
                description="No refresh cookie was presented "
                "(refresh_cookie_missing), or it is expired or blacklisted."
            ),
        },
        description="Reads the refresh token from the HttpOnly cookie, never from the "
        "request body, and rotates it.",
    )
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

    @extend_schema(
        request=None,
        responses={204: OpenApiResponse(description="Logged out; the cookie is cleared.")},
        description="Blacklists the presented refresh token, so logout genuinely revokes.",
    )
    def post(self, request):
        response = Response(status=status.HTTP_204_NO_CONTENT)
        token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                # Already expired or blacklisted: logout is idempotent.
                logger.info("auth.logout_with_unusable_token", extra={"actor_id": request.user.pk})
        clear_refresh_cookie(response)
        logger.info("auth.logout", extra={"actor_id": request.user.pk})
        return response
