from django import forms
from django.contrib.auth.forms import UserCreationForm, UserChangeForm, PasswordResetForm, SetPasswordForm
from .models import User


class SurveyorSelectMultiple(forms.SelectMultiple):
    def create_option(self, name, value, label, selected, index, subindex=None, attrs=None):
        option = super().create_option(name, value, label, selected, index, subindex, attrs)
        if hasattr(value, 'instance'):
            user = value.instance
            option['attrs']['data-name'] = user.get_full_name() or user.username
            option['attrs']['data-email'] = user.email
        return option


class SurveyorTagsForm(forms.Form):
    surveyor_ids = forms.ModelMultipleChoiceField(
        queryset=User.objects.none(), required=False, label='Tag account users',
        widget=SurveyorSelectMultiple(attrs={'id': 'surveyor-account-select'}),
        error_messages={'invalid_choice': 'Choose approved, active surveyor accounts.'},
    )
    surveyor_tags_present = forms.BooleanField(required=False, initial=True, widget=forms.HiddenInput)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['surveyor_ids'].queryset = User.objects.filter(
            is_active=True, role__in=('researcher', 'admin'),
        ).order_by('first_name', 'last_name', 'username')
        self.fields['surveyor_ids'].label_from_instance = lambda user: user.get_full_name() or user.username


def surveyor_names_with_tags(names, surveyors):
    recorded = [part.strip() for part in names.replace('\n', ',').split(',') if part.strip()]
    for user in surveyors:
        name = user.get_full_name() or user.username
        if name not in recorded:
            recorded.append(name)
    return ', '.join(recorded)


class CustomUserCreationForm(UserCreationForm):
    """Form for user registration"""
    email = forms.EmailField(
        required=True,
        widget=forms.EmailInput(attrs={
            'class': 'form-control',
            'placeholder': 'Email Address'
        })
    )
    first_name = forms.CharField(
        max_length=150,
        required=True,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'First Name'
        })
    )
    last_name = forms.CharField(
        max_length=150,
        required=True,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Last Name'
        })
    )
    password1 = forms.CharField(
        label='Password',
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'placeholder': 'Password'
        })
    )
    password2 = forms.CharField(
        label='Confirm Password',
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'placeholder': 'Confirm Password'
        })
    )

    class Meta:
        model = User
        fields = ('first_name', 'last_name', 'email', 'password1', 'password2')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['first_name'].widget.attrs.update({'autofocus': True})

    def clean_email(self):
        email = self.cleaned_data.get('email')
        if User.objects.filter(email=email).exists():
            raise forms.ValidationError('This email is already registered.')
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.username = self.cleaned_data['email']
        user.role = 'pending'  # New users are pending approval
        if commit:
            user.save()
        return user


class CustomUserChangeForm(UserChangeForm):
    """Form for user profile changes"""
    class Meta:
        model = User
        fields = ('first_name', 'last_name', 'email')


class LoginForm(forms.Form):
    """Form for user login"""
    email = forms.EmailField(
        widget=forms.EmailInput(attrs={
            'class': 'form-control',
            'placeholder': 'Email Address',
            'autofocus': True
        })
    )
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'placeholder': 'Password'
        })
    )


class CustomPasswordResetForm(PasswordResetForm):
    """Form for password reset"""
    email = forms.EmailField(
        widget=forms.EmailInput(attrs={
            'class': 'form-control',
            'placeholder': 'Email Address'
        })
    )


class CustomSetPasswordForm(SetPasswordForm):
    """Form for setting new password after reset"""
    new_password1 = forms.CharField(
        label='New Password',
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'placeholder': 'New Password'
        })
    )
    new_password2 = forms.CharField(
        label='Confirm New Password',
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'placeholder': 'Confirm New Password'
        })
    )
