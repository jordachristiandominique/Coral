from allauth.account.adapter import DefaultAccountAdapter
from django.contrib import messages


class CoralSenseAccountAdapter(DefaultAccountAdapter):
    """Describe account access when allauth completes a sign-in."""

    def add_message(
        self, request, level, message_template=None, message_context=None,
        extra_tags='', message=None,
    ):
        user = (message_context or {}).get('user')
        if message_template == 'account/messages/logged_in.txt' and user and user.is_pending():
            level = messages.INFO
            message_template = None
            message = 'Your account is pending administrator approval. You can access the research workspace after approval.'

        return super().add_message(
            request, level, message_template=message_template,
            message_context=message_context, extra_tags=extra_tags, message=message,
        )
