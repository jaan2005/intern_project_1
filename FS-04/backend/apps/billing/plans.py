"""Plan definitions. None means unlimited."""
PLANS = {
    'free': {'name': 'Free', 'price_cents': 0, 'max_projects': 2, 'max_members': 3, 'webhooks': False},
    'pro': {'name': 'Pro', 'price_cents': 1500, 'max_projects': 10, 'max_members': 15, 'webhooks': True},
    'business': {'name': 'Business', 'price_cents': 4900, 'max_projects': None, 'max_members': None, 'webhooks': True},
}
