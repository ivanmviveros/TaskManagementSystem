"""Local development. Debug on; email goes to the MailHog container (spec §5.4)."""

from config.settings.base import *
from config.settings.base import env, env_bool, env_list

DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,backend,0.0.0.0")

# SMTP into MailHog, which accepts anything and needs no auth or TLS. The defaults
# target the Compose service on their own, because nothing in settings reads .env:
# a developer whose .env predates this change must not have to edit it.
#
# Overridable for the non-Compose path D36 keeps supported: a natively-run worker
# sets EMAIL_HOST=localhost (Compose publishes 1025), and a machine with no Docker
# at all sets EMAIL_BACKEND to the console backend to print emails to the log.
EMAIL_BACKEND = env("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", "mailhog")
EMAIL_PORT = int(env("EMAIL_PORT", "1025"))
EMAIL_USE_TLS = False
