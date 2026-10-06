from apps.core.pagination import DefaultPageNumberPagination


def test_pagination_defaults_match_the_spec():
    pagination = DefaultPageNumberPagination()
    assert pagination.page_size == 20
    assert pagination.page_size_query_param == "page_size"
    assert pagination.max_page_size == 100
