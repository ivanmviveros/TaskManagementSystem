"""Task query parameters. django-filter only — no manual parsing, and no model
field becomes filterable implicitly (backend §16)."""

from django.db.models import Q
from django.utils import timezone
from django_filters import rest_framework as filters

from apps.tasks.models import OPEN_STATUSES, TERMINAL_STATUSES, Task, TaskStatus


class TaskFilterSet(filters.FilterSet):
    status = filters.MultipleChoiceFilter(field_name="status", choices=TaskStatus.choices)
    due_date_after = filters.IsoDateTimeFilter(field_name="due_date", lookup_expr="gte")
    due_date_before = filters.IsoDateTimeFilter(field_name="due_date", lookup_expr="lte")
    overdue = filters.BooleanFilter(method="filter_overdue")
    # Useful to a Supervisor; harmless for an Operator, whose queryset is already
    # self-scoped by scoped_tasks().
    assignee = filters.UUIDFilter(field_name="assignee_id")

    class Meta:
        model = Task
        fields = ["status", "due_date_after", "due_date_before", "overdue", "assignee"]

    def filter_overdue(self, queryset, name, value):
        now = timezone.now()
        if value:
            return queryset.filter(Q(due_date__lt=now) & Q(status__in=OPEN_STATUSES))
        # The false branch is expressed positively, naming the three ways a task is
        # not overdue: no deadline, a future deadline, or already terminal.
        #
        # In raw SQL a bare negation would be a bug — `NOT (due_date < now AND ...)`
        # is NULL, not TRUE, for an undated row, so those rows would vanish. Django's
        # ORM does not have that bug: .exclude() adds `AND due_date IS NOT NULL`
        # inside the negated group, and verified here, it returns undated rows
        # correctly. The positive form is kept anyway because it states the intent
        # directly instead of depending on that ORM detail — but it is a readability
        # choice, not a correctness fix.
        return queryset.filter(
            Q(due_date__isnull=True) | Q(due_date__gte=now) | Q(status__in=TERMINAL_STATUSES)
        )
