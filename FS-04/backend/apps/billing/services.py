import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from .models import CheckoutSession, Subscription
from .plans import PLANS


class PlanLimitExceeded(APIException):
    """HTTP 402: the workspace's plan does not allow this. The React app shows an upgrade prompt."""
    status_code = 402
    default_code = 'plan_limit'

    def __init__(self, message, plan, limit=None):
        super().__init__(message)
        # set the body directly so that `limit` stays a number (DRF would turn dict values into strings)
        self.detail = {'detail': message, 'code': 'plan_limit', 'plan': plan, 'limit': limit}


def ensure_subscription(workspace):
    return Subscription.objects.get_or_create(workspace=workspace)[0]


def plan_key(workspace):
    sub = ensure_subscription(workspace)
    return 'free' if sub.status == 'canceled' else sub.plan


def plan_of(workspace):
    return PLANS[plan_key(workspace)]


def usage(workspace):
    from apps.projects.models import Project
    from apps.workspaces.models import Membership
    return {'projects': Project.objects.filter(workspace=workspace).count(),
            'members': Membership.objects.filter(workspace=workspace).count()}


def enforce(workspace, resource):
    """Call BEFORE creating a project / adding a member."""
    plan = plan_of(workspace)
    limit = plan[f'max_{resource}']
    if limit is not None and usage(workspace)[resource] >= limit:
        raise PlanLimitExceeded(f'Your {plan["name"]} plan allows {limit} {resource}. Upgrade to add more.', plan_key(workspace), limit)


def require_feature(workspace, feature):
    plan = plan_of(workspace)
    if not plan[feature]:
        raise PlanLimitExceeded(f'{feature.capitalize()} are not included in the {plan["name"]} plan. Upgrade to use them.', plan_key(workspace))


def check_fits(workspace, new_plan_key):
    """Refuse a downgrade while the workspace uses more than the cheaper plan allows."""
    plan, used, problems = PLANS[new_plan_key], usage(workspace), []
    for resource in ('projects', 'members'):
        limit = plan[f'max_{resource}']
        if limit is not None and used[resource] > limit:
            problems.append(f'{used[resource]} {resource} (the {plan["name"]} plan allows {limit})')
    if problems:
        raise ValidationError({'detail': 'Reduce usage before switching plans: ' + '; '.join(problems) + '.'})


def activate(workspace, plan, provider, customer_id='', subscription_id='', days=30):
    sub = ensure_subscription(workspace)
    sub.plan, sub.status, sub.provider = plan, 'active', provider
    sub.provider_customer_id, sub.provider_subscription_id = customer_id or '', subscription_id or ''
    sub.current_period_end = timezone.now() + timedelta(days=days)
    sub.save()
    return sub


def downgrade_to_free(workspace):
    sub = ensure_subscription(workspace)
    sub.plan, sub.status, sub.current_period_end = 'free', 'active', None
    sub.provider_subscription_id = ''
    sub.save()
    return sub


def create_checkout(workspace, plan, user):
    """Returns the URL to send the owner to. Real Stripe if configured, otherwise the simulated checkout page."""
    definition = PLANS[plan]
    if settings.BILLING_PROVIDER == 'stripe':
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        base = f'{settings.FRONTEND_URL}/w/{workspace.slug}/billing'
        meta = {'workspace_id': str(workspace.id), 'plan': plan}
        session = stripe.checkout.Session.create(
            mode='subscription', customer_email=user.email, client_reference_id=str(workspace.id),
            line_items=[{'quantity': 1, 'price_data': {
                'currency': 'usd', 'unit_amount': definition['price_cents'], 'recurring': {'interval': 'month'},
                'product_data': {'name': f'{definition["name"]} plan ({workspace.name})'}}}],
            metadata=meta, subscription_data={'metadata': meta},
            success_url=f'{base}?checkout=success', cancel_url=f'{base}?checkout=cancelled')
        CheckoutSession.objects.create(workspace=workspace, plan=plan, provider='stripe', session_id=session.id, created_by=user)
        return session.url
    session_id = f'mock_{secrets.token_hex(12)}'
    CheckoutSession.objects.create(workspace=workspace, plan=plan, provider='mock', session_id=session_id, created_by=user)
    return f'{settings.FRONTEND_URL}/mock-billing?session_id={session_id}'
