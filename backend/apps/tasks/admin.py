from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from apps.tasks.models import Task


@admin.register(Task)
class TaskAdmin(SimpleHistoryAdmin):
    list_display = ("title", "status", "due_date", "assignee", "created_by", "deleted_at")
    list_filter = ("status",)
    search_fields = ("title", "description")
    readonly_fields = ("created_at", "updated_at", "completed_at", "deleted_at", "deleted_by")
    autocomplete_fields = ("assignee", "created_by")
