"""Local development. Console email, debug on, no real SMTP service in Compose."""

from config.settings.base import *
from config.settings.base import env_bool, env_list

DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,backend,0.0.0.0")
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
