from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from apps.users.models import User


@admin.register(User)
class UserAdmin(SimpleHistoryAdmin):
    list_display = ("email", "first_name", "last_name", "role", "is_active", "deleted_at")
    list_filter = ("role", "is_active")
    search_fields = ("email", "first_name", "last_name")
    readonly_fields = ("date_joined", "last_login", "deleted_at", "deleted_by")
    exclude = ("password",)
