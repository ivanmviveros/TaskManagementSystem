from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.users.views import MeView, UserViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    # Registered BEFORE the router so "me" is not captured as a user id. The
    # router's lookup_value_regex would reject it anyway; explicit order means
    # the guarantee does not depend on that.
    path("users/me/", MeView.as_view(), name="user-me"),
    path("", include(router.urls)),
]
