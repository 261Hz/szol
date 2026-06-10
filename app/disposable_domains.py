# Known disposable / throwaway email domains.
# MX checks (already done by email-validator) don't catch these because many
# have valid DNS records. Extend this list as new services appear.
DISPOSABLE_DOMAINS: frozenset[str] = frozenset({
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
    "courriel.fr.nf", "moncourrier.fr.nf", "monemail.fr.nf", "monmail.fr.nf",
    # 10 Minute Mail
    "10minutemail.com", "10minutemail.net", "10minutemail.org",
    "10minutemail.be", "10minutemail.cf", "10minutemail.de",
    "10minutemail.ga", "10minutemail.gq", "10minutemail.ml",
    # Temp-mail / Nada
    "tempmail.com", "temp-mail.org", "temp-mail.de", "tempinbox.com",
    "tempinbox.co.uk", "tempr.email", "temporaryemail.net",
    "temporaryemail.us", "temporaryinbox.com", "tempemail.net",
    "mytempemail.com", "nada.email", "throwaway.email", "throwam.com",
    # Discard / Drop
    "discard.email", "dispostable.com", "maildrop.cc", "mailnull.com",
    "mailscrap.com", "mailnesia.com", "mailexpire.com",
    "fakeinbox.com", "fakemail.net",
    # Spam services
    "spamspot.com", "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
    "spamfree24.org", "spamfree24.de", "spamfree24.eu",
    "spamfree24.info", "spamfree24.net",
    "spamfree.eu", "spamthisplease.com", "spamtrail.com",
    "spamherelots.com", "spamhereplease.com", "spamgoes.in",
    "spam.la", "spamoff.de",
    # Self-destructing / one-time
    "selfdestructingmail.com", "oneoffemail.com", "onewaymail.com",
    "rcpt.at", "objectmail.com", "pookmail.com",
    # Misc well-known disposables
    "filzmail.com", "mailzilla.com", "mailpick.biz", "mailrock.biz",
    "mailseal.de", "mailshell.com", "mailtemporal.com",
    "megaintl.com", "mt2009.com", "mt2014.com",
    "sneakemail.com", "snakemail.com", "shortmail.net",
    "sendspamhere.com", "saynotospams.com", "safetymail.info",
    "safe-mail.gq", "s0ny.net", "proxymail.eu.org",
    "thisisnotmyrealemail.com", "thanksnospam.info",
    "tilien.com", "tittbit.in", "tmi.me", "tmailinator.com",
    "toiea.com", "topranklist.de", "tradermail.info",
    "sibmail.com", "skeefmail.com",
    "obobbo.com", "nwldx.com", "online.ms",
    "objectmail.com",
})
