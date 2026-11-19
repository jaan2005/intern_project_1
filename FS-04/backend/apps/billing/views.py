import secrets

from django.conf import settings
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.workspaces.mixins import TenantMixin
from apps.workspaces.models import Membership, Workspace

from . import services
from .models import CheckoutSession, Subscription
from .plans import PLANS

OK_CARD, DECLINED_CARD = '4242424242424242', '4000000000000002'


def overview(workspace):
    sub = services.ensure_subscription(workspace)
    key = services.plan_key(workspace)
    return {
        'plan': key, 'plan_name': PLANS[key]['name'], 'status': sub.status, 'provider': sub.provider,
        'current_period_end': sub.current_period_end, 'usage': services.usage(workspace),
        'limits': {k: v for k, v in PLANS[key].items() if k.startswith('max_') or k == 'webhooks'},
        'plans': [{'key': k, **v} for k, v in PLANS.items()],
        'billing_mode': settings.BILLING_PROVIDER,
    }


class BillingViewSet(TenantMixin, viewsets.ViewSet):
    """/api/w/<slug>/billing/ : admins can see the plan, only the owner can change it."""
    read_role = 'admin'
    write_role = 'owner'

    def list(self, request, slug=None):
        return Response(overview(request.workspace))

    @action(detail=False, methods=['post'])
    def checkout(self, request, slug=None):
        plan = request.data.get('plan')
        if plan not in PLANS or plan == 'free':
            raise ValidationError({'plan': 'Choose pro or business.'})
        if plan == services.plan_key(request.workspace):
            raise ValidationError({'plan': 'You are already on this plan.'})
        services.check_fits(request.workspace, plan)   # also blocks a "downgrade" through checkout
        return Response({'url': services.create_checkout(request.workspace, plan, request.user), 'provider': settings.BILLING_PROVIDER})

    @action(detail=False, methods=['post'])
    def cancel(self, request, slug=None):
        ws = request.workspace
        if services.plan_key(ws) == 'free':
            raise ValidationError({'detail': 'You are already on the Free plan.'})
        services.check_fits(ws, 'free')
        sub = services.ensure_subscription(ws)
        if sub.provider == 'stripe' and sub.provider_subscription_id:
            import stripe
            stripe.api_key = settings.STRIPE_SECRET_KEY
            stripe.Subscription.cancel(sub.provider_subscription_id)
        old = sub.plan
        services.downgrade_to_free(ws)
        record(ws, request.user, 'billing.plan_changed', target_type='subscription', target_label='Free', changes={'plan': [old, 'free']})
        return Response(overview(ws))


# ---- simulated checkout (used when no Stripe key is configured) ----
def _owned_session(request, session_id):
    cs = CheckoutSession.objects.select_related('workspace').filter(session_id=session_id, provider='mock').first()
    is_owner = cs and Membership.objects.filter(workspace=cs.workspace, user=request.user, role='owner').exists()
    if not is_owner:
        raise NotFound('Checkout session not found.')
    return cs


class MockSessionView(APIView):
    def get(self, request, session_id):
        if settings.BILLING_PROVIDER != 'mock':
            raise NotFound()
        cs = _owned_session(request, session_id)
        plan = PLANS[cs.plan]
        return Response({'status': cs.status, 'plan': cs.plan, 'plan_name': plan['name'], 'price_cents': plan['price_cents'],
                         'workspace': cs.workspace.name, 'workspace_slug': cs.workspace.slug})


class MockPayView(APIView):
    def post(self, request):
        if settings.BILLING_PROVIDER != 'mock':
            raise NotFound()
        cs = _owned_session(request, request.data.get('session_id', ''))
        if cs.status == 'paid':
            return Response({'status': 'paid', 'workspace_slug': cs.workspace.slug})
        card = ''.join(ch for ch in str(request.data.get('card_number', '')) if ch.isdigit())
        if card == DECLINED_CARD:
            raise ValidationError({'detail': 'Your card was declined (test card 4000 0000 0000 0002).', 'code': 'card_declined'})
        if card != OK_CARD:
            raise ValidationError({'detail': 'This is a test checkout. Use the test card 4242 4242 4242 4242.', 'code': 'invalid_card'})
        old = services.plan_key(cs.workspace)
        services.activate(cs.workspace, cs.plan, 'mock', subscription_id=f'mock_sub_{secrets.token_hex(6)}')
        cs.status = 'paid'
        cs.save(update_fields=['status'])
        record(cs.workspace, request.user, 'billing.plan_changed', target_type='subscription', target_label=PLANS[cs.plan]['name'], changes={'plan': [old, cs.plan]})
        return Response({'status': 'paid', 'workspace_slug': cs.workspace.slug})


# ---- real Stripe webhook (only used when a Stripe key is configured; NOT exercised by the automated tests) ----
class StripeWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if settings.BILLING_PROVIDER != 'stripe' or not settings.STRIPE_WEBHOOK_SECRET:
            raise NotFound()
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            event = stripe.Webhook.construct_event(request.body, request.META.get('HTTP_STRIPE_SIGNATURE', ''), settings.STRIPE_WEBHOOK_SECRET)
        except Exception as exc:   # bad payload or bad signature
            raise ValidationError({'detail': f'Webhook verification failed: {exc}'})
        obj = event['data']['object']
        if event['type'] == 'checkout.session.completed':
            meta = obj.get('metadata') or {}
            ws = Workspace.objects.filter(pk=meta.get('workspace_id')).first()
            if ws and meta.get('plan') in PLANS:
                services.activate(ws, meta['plan'], 'stripe', obj.get('customer') or '', obj.get('subscription') or '')
                CheckoutSession.objects.filter(session_id=obj.get('id')).update(status='paid')
                record(ws, None, 'billing.plan_changed', target_type='subscription', target_label=PLANS[meta['plan']]['name'], changes={'plan': ['?', meta['plan']]})
        elif event['type'] == 'customer.subscription.deleted':
            sub = Subscription.objects.filter(provider_subscription_id=obj.get('id')).select_related('workspace').first()
            if sub:
                services.downgrade_to_free(sub.workspace)
        elif event['type'] == 'invoice.payment_failed':
            Subscription.objects.filter(provider_subscription_id=obj.get('subscription')).update(status='past_due')
        return Response({'received': True})
