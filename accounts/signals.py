"""Signal handlers that create in-app notifications for workflow events."""

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.urls import reverse

from .models import User, Notification


@receiver(post_save, sender=User)
def notify_admins_of_new_registration(sender, instance, created, **kwargs):
    """When a new pending user registers (form or Google OAuth), tell every admin.

    Runs on creation only, so approving/editing a user later never re-notifies.
    """
    if not created or instance.role != 'pending':
        return

    name = instance.get_full_name() or instance.username
    url = reverse('accept_researcher')
    admins = User.objects.filter(role='admin')
    Notification.objects.bulk_create([
        Notification(
            recipient=admin,
            verb='registration_pending',
            message=f'{name} registered and is awaiting approval.',
            url=url,
        )
        for admin in admins
    ])
