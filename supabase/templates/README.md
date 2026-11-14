# CutVid email templates

Paste each file into Supabase → **Authentication → Emails → Templates** (use the *Source* view).

| Supabase template | File | Subject |
| --- | --- | --- |
| Confirm signup | `confirmation.html` | Confirm your CutVid account |
| Magic Link | `magic_link.html` | {{ .Token }} is your CutVid code |
| Reset Password | `recovery.html` | Reset your CutVid password |
| Change Email Address | `email_change.html` | Confirm your new CutVid email |
| Invite user | `invite.html` | You're invited to CutVid |

`magic_link.html` shows the one-time **code** (`{{ .Token }}`) the app asks for at sign-in; the others use a link (`{{ .ConfirmationURL }}`).
