from django.db import models


class Subscription(models.Model):
    """One per workspace: which plan it is on."""
    workspace = models.OneToOneField('workspaces.Workspace', on_delete=models.CASCADE, related_name='subscription')
    plan = models.CharField(max_length=20, default='free')
    status = models.CharField(max_length=12, default='active')          # active | past_due | canceled
    provider = models.CharField(max_length=10, default='none')          # none | mock | stripe
    provider_customer_id = models.CharField(max_length=100, blank=True)
    provider_subscription_id = models.CharField(max_length=100, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class CheckoutSession(models.Model):
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='checkout_sessions')
    plan = models.CharField(max_length=20)
    provider = models.CharField(max_length=10)
    session_id = models.CharField(max_length=120, unique=True)
    status = models.CharField(max_length=10, default='pending')         # pending | paid
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
