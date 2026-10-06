"""Ordering filter that guarantees pagination determinism (spec §8.3)."""

from rest_framework.filters import OrderingFilter


class TiebrokenOrderingFilter(OrderingFilter):
    """Always appends `-id` so ordering by a non-unique field stays stable.

    Ordering by `due_date`, `status` or `role` alone is not a total order, so
    rows can reshuffle between page requests and a client can see a row twice or
    never. `-id` is unique, and with UUIDv7 it is also time-correlated.
    """

    def get_ordering(self, request, queryset, view):
        ordering = list(super().get_ordering(request, queryset, view) or [])
        if not any(field.lstrip("-") == "id" for field in ordering):
            ordering.append("-id")
        return ordering
