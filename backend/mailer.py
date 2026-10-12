# backend/mailer.py
import os
import smtplib
import logging
from email.message import EmailMessage

log = logging.getLogger(__name__)

class MailError(Exception):
    pass

def send_email(to: str, subject: str, text: str, html: str | None = None) -> None:
    msg = EmailMessage()
    msg["From"] = os.environ["MAIL_SENDER"]
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    if os.environ.get("MAIL_BACKEND", "console") == "console":
        print(msg)
        return

    try:
        with smtplib.SMTP(os.environ["MAIL_SERVER"], int(os.environ.get("MAIL_PORT", 587)), timeout=10) as smtp:
            smtp.starttls()
            smtp.login(os.environ["MAIL_USERNAME"], os.environ["MAIL_PASSWORD"])
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as e:
        log.error("Email send failed: %s", type(e).__name__)
        raise MailError from e

def send_verification_email(to: str, token: str) -> None:
    link = f"{os.environ['FRONTEND_URL']}/verify?token={token}"
    send_email(
        to,
        "Verify your PAO Surgery Simulator account",
        f"Confirm your email address:\n\n{link}\n\nThis link expires in 24 hours.",
    )