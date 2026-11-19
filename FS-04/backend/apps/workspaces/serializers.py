from rest_framework import serializers

from .models import Membership


class MembershipSerializer(serializers.ModelSerializer):
    email = serializers.CharField(source='user.email', read_only=True)
    name = serializers.CharField(source='user.name', read_only=True)

    class Meta:
        model = Membership
        fields = ['id', 'user', 'email', 'name', 'role', 'joined_at']
