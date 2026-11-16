from allauth.account.adapter import get_adapter
from allauth.core.context import request_context
from django.contrib import messages
from django.contrib.messages.storage.fallback import FallbackStorage
from django.contrib.sessions.middleware import SessionMiddleware
from django.test import RequestFactory, TestCase
from django.urls import reverse

from .models import User


class SocialLoginApprovalMessageTests(TestCase):
    def post_login_messages(self, user, signup=False):
        request = RequestFactory().get('/oauth/google/login/callback/')
        SessionMiddleware(lambda request: None).process_request(request)
        request.user = user
        request._messages = FallbackStorage(request)
        with request_context(request):
            get_adapter().post_login(
                request, user, email_verification='none', signal_kwargs=None,
                email=user.email, signup=signup, redirect_url=None,
            )
        return list(messages.get_messages(request))

    def test_new_and_returning_pending_google_users_receive_approval_information(self):
        user = User.objects.create_user(username='pending-google', email='pending@example.com', role='pending')
        for signup in (True, False):
            with self.subTest(signup=signup):
                result = self.post_login_messages(user, signup=signup)
                self.assertEqual(len(result), 1)
                self.assertEqual(result[0].level, messages.INFO)
                self.assertIn('pending administrator approval', str(result[0]))
                self.assertNotIn('Successfully signed in', str(result[0]))
                user.refresh_from_db()
                self.assertEqual(user.role, 'pending')

    def test_approved_accounts_keep_the_standard_success_message(self):
        for role in ('researcher', 'admin', 'superadmin'):
            with self.subTest(role=role):
                user = User.objects.create_user(username=f'approved-{role}', role=role)
                result = self.post_login_messages(user)
                self.assertEqual(len(result), 1)
                self.assertEqual(result[0].level, messages.SUCCESS)
                self.assertIn('Successfully signed in', str(result[0]))

    def test_pending_page_sets_current_expectations_and_workspace_remains_guarded(self):
        user = User.objects.create_user(username='waiting-google', role='pending')
        self.client.force_login(user)
        response = self.client.get(reverse('pending_approval'))
        self.assertContains(response, 'Account Pending Approval')
        self.assertContains(response, 'check your approval status')
        self.assertNotContains(response, '24-48')
        self.assertNotContains(response, 'email notification')
        self.assertRedirects(self.client.get(reverse('researcher_dashboard')), reverse('pending_approval'))
