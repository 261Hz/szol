# Disposable / throwaway email domain blocklist.
#
# On startup we fetch the community-maintained list from GitHub (~3,000 domains).
# If that fetch fails we fall back to the hardcoded set below (~50 domains).
# The result is stored in DISPOSABLE_DOMAINS and used at registration time.

import logging

log = logging.getLogger(__name__)

_GITHUB_URL = (
    "https://raw.githubusercontent.com/"
    "disposable-email-domains/disposable-email-domains/master/"
    "disposable_email_blocklist.conf"
)

_FALLBACK: frozenset[str] = frozenset({
    # Guerrilla Mail family
    "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
    "guerrillamail.biz", "guerrillamail.de", "guerrillamail.info",
    "guerrillamailblock.com", "grr.la", "spam4.me", "sharklasers.com",
    # Mailinator family
    "mailinator.com", "mailinator2.com", "trashmail.at", "trashmail.com",
    "trashmail.io", "trashmail.me", "trashmail.net", "trashmail.org",
    "trashmail.xyz", "trashmail.de", "trashmail.eu", "trashemail.de",
    "trashdevil.com", "trashdevil.de", "trash-mail.at", "trash-mail.com",
    # Yopmail
    "yopmail.com", "yopmail.fr", "cool.fr.nf", "jetable.fr.nf",
    "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj", "speed.1s.fr",
    # 10 Minute Mail
    "10minutemail.com", "10minutemail.net", "10minutemail.org",
    "10minutemail.com", "10minutemail.de",
    # Temp-mail / Nada
    "tempmail.com", "temp-mail.org", "temp-mail.de", "tempinbox.com",
    "tempr.email", "temporaryemail.net", "nada.email",
    "throwaway.email", "throwam.com",
    # Discard / Drop
    "discard.email", "dispostable.com", "maildrop.cc", "mailnull.com",
    "fakeinbox.com", "fakemail.net",
    # Spam services
    "spamgourmet.com", "spamfree24.org", "spamfree.eu",
    "spam.la", "spamoff.de",
    # Self-destructing / one-time
    "selfdestructingmail.com", "oneoffemail.com", "rcpt.at",
    "mailzilla.com", "sneakemail.com",
})


def _load() -> frozenset[str]:
    try:
        import requests
        resp = requests.get(_GITHUB_URL, timeout=10)
        resp.raise_for_status()
        domains = frozenset(
            line.strip().lower()
            for line in resp.text.splitlines()
            if line.strip() and not line.startswith("#")
        )
        log.info("Loaded %d disposable domains from GitHub", len(domains))
        return domains
    except Exception as exc:
        log.warning("Could not fetch disposable domain list (%s) — using fallback (%d domains)", exc, len(_FALLBACK))
        return _FALLBACK


DISPOSABLE_DOMAINS: frozenset[str] = _load()
