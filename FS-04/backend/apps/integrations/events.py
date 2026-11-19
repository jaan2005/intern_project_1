# Every audit action can be sent to a webhook. This is the list a webhook may subscribe to.
EVENTS = [
    'issue.created', 'issue.updated', 'issue.status_changed', 'issue.deleted',
    'comment.created', 'comment.updated', 'comment.deleted',
    'attachment.created', 'attachment.deleted',
    'project.created', 'project.updated', 'project.deleted',
    'status.created', 'status.updated', 'status.deleted',
    'sprint.created', 'sprint.updated', 'sprint.deleted', 'sprint.started', 'sprint.completed',
    'member.added', 'member.role_changed', 'member.removed',
    'billing.plan_changed', 'report.ready',
]
