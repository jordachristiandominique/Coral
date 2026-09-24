"""Template context processors shared across the app."""


def notifications(request):
    """Expose the current user's recent notifications + unread count to the navbar.

    The bell dropdown lives in the shared profile-menu partial rendered on every
    authenticated page, so this runs for all of them.
    """
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return {}

    qs = user.notifications.all()
    return {
        'nav_notifications': qs[:10],
        'nav_unread_count': qs.filter(is_read=False).count(),
    }
