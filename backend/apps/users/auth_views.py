"""Auth endpoints. The refresh token moves from the response body to a cookie."""

import logging

from django.conf import settings
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.core.throttling import LoginRateThrottle
from apps.users.auth_serializers import LoginSerializer
from apps.users.cookies import set_refresh_cookie

logger = logging.getLogger(__name__)


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
