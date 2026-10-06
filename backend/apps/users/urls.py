from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.users.auth_views import LoginView
from apps.users.views import MeView, UserViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    # Registered BEFORE the router so "me" is not captured as a user id. The
    # router's lookup_value_regex would reject it anyway; explicit order means
    # the guarantee does not depend on that.
    path("users/me/", MeView.as_view(), name="user-me"),
    path("", include(router.urls)),
]
