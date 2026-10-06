"""Values shared across apps that are not a model, a role, or a setting."""

# The canonical hyphenated 8-4-4-4-12 hex form. Deliberately NOT a UUID*v4*
# pattern: pinning the version nibble to 4 and the variant to [89ab] would reject
# every UUIDv7 id and 404 every detail route, while a malformed-id test would
# still pass — so nothing would catch it (spec §6.6).
UUID_LOOKUP_REGEX = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
