"""Token serializers that add the current user to the login payload."""

from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.users.serializers import UserMinimalSerializer


class LoginSerializer(TokenObtainPairSerializer):
    username_field = "email"

    def validate(self, attrs):
        data = super().validate(attrs)
        # The SPA needs its role to pick a landing page; one round trip instead of two.
        data["user"] = UserMinimalSerializer(self.user).data
        return data
