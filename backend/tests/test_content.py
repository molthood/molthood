"""Shared content transforms.

These run on text from *any* reader, which is the whole reason they are not
methods on a provider. Every test here is offline: a transform that needed the
network to be tested would be doing more than transforming.
"""

from __future__ import annotations

from app.providers.content import (
    chunk,
    classify_urls,
    estimate_tokens,
    link_graph,
    normalise,
    outline,
    site_shape,
)


def test_normalise_collapses_what_renderers_leave_behind() -> None:
    messy = "Title  \r\n\r\n\r\n\r\nBody text \u00a0 here \t\n"

    assert normalise(messy) == "Title\n\nBody text here"


def test_normalise_is_idempotent() -> None:
    """It runs on the way in, so running it twice must change nothing."""
    once = normalise("a  b\r\n\r\n\r\nc")

    assert normalise(once) == once


# --- Chunking ---------------------------------------------------------------


def test_a_short_document_is_one_chunk() -> None:
    chunks = chunk("# Title\n\nA short body.")

    assert len(chunks) == 1
    assert chunks[0].heading == "Title"


def test_chunks_split_on_headings_rather_than_character_count() -> None:
    """Cutting at a fixed offset produces chunks that begin mid-sentence.

    Splitting on structure is what lets a chunk say where it came from.
    """
    document = "# One\n\nfirst body\n\n# Two\n\nsecond body\n\n# Three\n\nthird body"

    chunks = chunk(document, max_tokens=8)

    assert [item.heading for item in chunks] == ["One", "Two", "Three"]
    assert "first body" in chunks[0].text
    assert "second body" in chunks[1].text


def test_an_oversized_section_falls_back_to_paragraphs() -> None:
    body = "\n\n".join(f"paragraph number {index} with some words" for index in range(12))

    chunks = chunk(f"# Big\n\n{body}", max_tokens=20)

    assert len(chunks) > 1
    # Every chunk still knows which section it belongs to.
    assert all(item.heading == "Big" for item in chunks)
    # And none of them is empty, which greedy packing gets wrong at the seams.
    assert all(item.text.strip() for item in chunks)


def test_chunk_indexes_are_contiguous() -> None:
    chunks = chunk("# A\n\nx\n\n# B\n\ny\n\n# C\n\nz", max_tokens=5)

    assert [item.index for item in chunks] == list(range(len(chunks)))


def test_empty_input_produces_no_chunks() -> None:
    assert chunk("   \n\n  ") == []


def test_token_estimate_is_proportional() -> None:
    assert estimate_tokens("a" * 400) == 100
    # Never zero: a caller budgeting against this would divide by it.
    assert estimate_tokens("") == 1


def test_outline_reports_depth() -> None:
    result = outline("# Top\n\ntext\n\n### Deep\n\nmore")

    assert result == [
        {"depth": 1, "title": "Top"},
        {"depth": 3, "title": "Deep"},
    ]


# --- Link graph -------------------------------------------------------------


def test_relative_links_are_resolved_not_discarded() -> None:
    """A documentation site's whole navigation is relative.

    Dropping relative links would report a thoroughly interlinked site as
    having no internal links at all.
    """
    markdown = "[docs](/docs) [api](/docs/api) [other](https://elsewhere.test/x)"

    graph = link_graph(markdown, base_url="https://example.test/home")

    assert graph.internal == (
        "https://example.test/docs",
        "https://example.test/docs/api",
    )
    assert graph.external == ("https://elsewhere.test/x",)


def test_www_is_not_a_different_site() -> None:
    """Otherwise a site linking to its own www host reports itself as external."""
    graph = link_graph(
        "[a](https://www.example.test/a)", base_url="https://example.test/"
    )

    assert graph.internal == ("https://www.example.test/a",)
    assert not graph.external


def test_anchors_and_non_http_schemes_are_ignored() -> None:
    markdown = "[a](#section) [b](mailto:x@y.test) [c](javascript:void) [d](/real)"

    graph = link_graph(markdown, base_url="https://example.test/")

    assert len(graph.internal) == 1
    assert not graph.external


def test_external_hosts_are_ranked_by_how_often_they_are_linked() -> None:
    markdown = (
        "[1](https://a.test/x) [2](https://a.test/y) "
        "[3](https://b.test/z) [4](https://a.test/w)"
    )

    graph = link_graph(markdown, base_url="https://example.test/")

    assert graph.external_hosts[0] == ("a.test", 3)
    assert graph.external_hosts[1] == ("b.test", 1)


def test_duplicate_links_are_counted_once() -> None:
    graph = link_graph("[a](/x) [again](/x) [b](/y)", base_url="https://example.test/")

    assert len(graph.internal) == 2


# --- Site shape -------------------------------------------------------------


def test_urls_are_grouped_by_what_the_section_is_for() -> None:
    grouped = classify_urls(
        [
            "https://x.test/docs/start",
            "https://x.test/pricing",
            "https://x.test/blog/hello",
            "https://x.test/random",
        ]
    )

    assert grouped["documentation"] == ["https://x.test/docs/start"]
    assert grouped["pricing"] == ["https://x.test/pricing"]
    assert grouped["blog"] == ["https://x.test/blog/hello"]
    assert grouped["other"] == ["https://x.test/random"]


def test_empty_groups_are_omitted_rather_than_reported_as_zero() -> None:
    """A section that does not exist is absent, not an empty list.

    "has no pricing page" and "we did not look" must not render the same.
    """
    grouped = classify_urls(["https://x.test/docs/a"])

    assert "pricing" not in grouped


def test_site_shape_answers_questions_a_reader_actually_has() -> None:
    shape = site_shape(
        [
            "https://x.test/",
            "https://x.test/docs/start",
            "https://x.test/docs/api/reference",
            "https://x.test/blog/one",
        ]
    )

    assert shape["pages"] == 4
    assert shape["has_documentation"] is True
    assert shape["has_blog"] is True
    assert shape["has_pricing"] is False
    assert shape["max_depth"] == 3
