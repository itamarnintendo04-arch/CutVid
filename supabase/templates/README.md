# CutVid email templates

Paste each file into Supabase → **Authentication → Emails → Templates** (use the *Source* view).

| Supabase template | File | Subject |
| --- | --- | --- |
| Confirm signup | `confirmation.html` | Confirm your CutVid account |
| Magic Link | `magic_link.html` | Sign in to CutVid |
| Reset Password | `recovery.html` | Reset your CutVid password |
| Change Email Address | `email_change.html` | Confirm your new CutVid email |
| Invite user | `invite.html` | You're invited to CutVid |

All templates use a link (`{{ .ConfirmationURL }}`). The Magic Link email is the second step of email sign-in, after the password.
